import { useEffect, useRef, useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Switch from "react-switch";
import Quaternion from "quaternion";
import unwrap from "ts-unwrap";
import "md-gum-polyfill"; // get videostream working on more browsers

import { useApi, Api } from "./api";
import { SignalScopeChart } from "./SignalScopeChart";

const KEEP_LAST_SECS_IMU_DATA = 5;

function MainUI({ api }: { api: Api }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [
    waitingForButton,
    setWaitingForButton,
  ] = api.waitingOnButton.useState();
  const [showImuData, setShowImuData] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const sendPhoto = useCallback(() => {
    const canvas = unwrap(canvasRef.current);
    const video = unwrap(videoRef.current);
    setWaitingForButton(false);

    const w = (canvas.width = video.videoWidth);
    const h = (canvas.height = video.videoHeight);
    const ctx = unwrap(canvas.getContext("2d"));
    ctx.drawImage(video, 0, 0);
    const img = ctx
      .getImageData(0, 0, w, h)
      // discard the alpha channel by skipping every 4th byte
      .data.filter((_, idx) => idx % 4 !== 3);

    // always 24 chars wide - convert to POSIX on backend
    const timestamp = new Date().toISOString();
    api.send(new Blob([timestamp, new Uint16Array([w, h]), img]));
  }, [api, setWaitingForButton]);

  useEffect(() => {
    const video = unwrap(videoRef.current);

    (async function startLiveStream() {
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            min: 1280,
            ideal: 1920,
            max: 2560,
          },

          height: {
            min: 720,
            ideal: 1080,
            max: 1440,
          },
        },
      });
    })();

    // wait for the first frame to load before letting api know we're good to send photos
    video.onloadeddata = () => api.sendPhotoFunc.set(sendPhoto);

    // don't bother with cleanup for now
  }, [api, sendPhoto]);

  useEffect(() => {
    (async function setupSensors() {
      try {
        const sensors = {
          accelerometer: Accelerometer,
          gyroscope: Gyroscope,
          magnetometer: Magnetometer,
        };

        for (const [name, SensorClass] of Object.entries(sensors)) {
          // if the device supports this sensor type
          if (typeof SensorClass == "function") {
            await navigator.permissions.query({ name: name as PermissionName });

            const sensor = new SensorClass({ frequency: 30 });

            sensor.addEventListener("error", (event) => {
              // Handle runtime errors.
              if (event.error.name === "NotAllowedError") {
                // Branch to code for requesting permission.
              } else if (event.error.name === "NotReadableError") {
                console.error("Cannot connect to the sensor.");
              } else {
                api.imuDataFrame.set({
                  ...api.imuDataFrame.state,
                  [name]: [sensor.x, sensor.y, sensor.z],
                });
              }
            });
            sensor.addEventListener("reading", () => {});
            sensor.start();
          }
        }
      } catch (error) {
        if (error.name === "SecurityError") {
          // See the note above about feature policy.
          console.error("Sensor construction was blocked by a feature policy.");
        } else if (error.name === "ReferenceError") {
          console.error("Sensor is not supported by the User Agent.");
        } else {
          throw error;
        }
      }
    })();

    const onDeviceOrientation = ({
      alpha,
      beta,
      gamma,
    }: DeviceOrientationEvent) => {
      // append the data
      const nowMs = Date.now();
      const data = api.imuQuaternionData.state;
      data[0].push(nowMs / 1000);
      data[1].push(alpha!);
      data[2].push(beta!);
      data[3].push(gamma!);

      // only keep scope.keepLastSecs worth of data
      const [time] = data;
      const cutoffTime = nowMs - KEEP_LAST_SECS_IMU_DATA;
      const cutoffIdx = time.findIndex((t) => t >= cutoffTime);
      if (cutoffIdx > 0) {
        for (const series of data) {
          series.splice(0, cutoffIdx);
        }
      }

      // Update the rotation object
      const RAD = Math.PI / 180;
      const q = Quaternion.fromEuler(
        unwrap(alpha) * RAD,
        unwrap(beta) * RAD,
        unwrap(gamma) * RAD
      );

      // [OPTIONAL IMPROVEMENT]: Display orientation via a rotating mobile phone image
      // Set the CSS style to the element you want to rotate
      // elm.style.transform = "matrix3d(" + q.conjugate().toMatrix4() + ")";

      // update the observable
      api.imuQuaternionData.set(data.slice());
      api.imuDataFrame.set({
        ...api.imuDataFrame.state,
        posixTimestamp: nowMs,
        quaternion: [q.x, q.y, q.z, q.w],
      });
    };

    window.addEventListener("deviceorientation", onDeviceOrientation);
    return () =>
      window.removeEventListener("deviceorientation", onDeviceOrientation);
  }, [api.imuQuaternionData, api.imuDataFrame]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        display: "flex",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        style={{ maxWidth: "100%", maxHeight: "100%", margin: "0 auto" }}
      />
      {/* canvas required for screenshot (MediaStreamCapture API not available in most mobile browsers) */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div
        style={{
          position: "absolute",
          top: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "start",
            margin: 20,
          }}
        >
          {showImuData ? (
            <div
              style={{
                height: 100,
                width: "100%",
                color: "white",
                background: "#282c34",
                borderRadius: 5,
              }}
            >
              <SignalScopeChart
                scope={{
                  name: "Orientation",
                  styles: null,
                  labels: ["alpha", "beta", "gamma"],
                  data: api.imuQuaternionData,
                  keepLastSecs: 5,
                }}
              />
            </div>
          ) : null}

          <Button
            variant="outline-light"
            style={{
              borderRadius: 99,
              height: 60,
              width: 60,
              fontSize: 32,
              margin: 10,
            }}
            onClick={() => setShowMenu(true)}
          >
            ⋯
          </Button>

          <Modal show={showMenu} onHide={() => setShowMenu(false)} size="lg">
            <Modal.Header closeButton>
              <Modal.Title>Menu</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <label
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "1rem",
                }}
              >
                Show IMU Data?
                <Switch
                  onChange={setShowImuData}
                  checked={showImuData}
                  height={30}
                  width={60}
                />
              </label>
            </Modal.Body>
          </Modal>
        </div>

        {waitingForButton ? (
          <Button
            variant="outline-light"
            style={{
              borderRadius: 99,
              height: 90,
              width: 90,
              fontSize: 32,
              margin: 10,
              alignSelf: "center",
            }}
            disabled={!waitingForButton}
            onClick={sendPhoto}
          >
            📷
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const api = useApi();

  if (api instanceof Error) {
    throw api; // get handle'd by error boundary in index.tsx
  }

  return api ? <MainUI api={api} /> : null;
}
