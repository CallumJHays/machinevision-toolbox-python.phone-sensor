import { useEffect, useRef, useCallback, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Switch from "react-switch";
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
  const [showImuData, setShowImuData] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  const sendPhoto = useCallback(
    function sendPhoto() {
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
      api.send(new Blob([new Uint16Array([w, h]), img]));
    },
    [api, setWaitingForButton]
  );

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
    const imuCallback = ({ alpha, beta, gamma }: DeviceOrientationEvent) => {
      // append the data
      const now = Date.now() / 1000;
      const data = api.imuData.state;
      data[0].push(now);
      data[1].push(alpha!);
      data[2].push(beta!);
      data[3].push(gamma!);

      // only keep scope.keepLastSecs worth of data
      const [time] = data;
      const cutoffTime = now - KEEP_LAST_SECS_IMU_DATA;
      const cutoffIdx = time.findIndex((t) => t >= cutoffTime);
      if (cutoffIdx > 0) {
        for (const series of data) {
          series.splice(0, cutoffIdx);
        }
      }

      // update the observable
      api.imuData.set(data.slice());
    };

    // window.addEventListener("deviceorientation", imuCallback);
    // return () => window.removeEventListener("deviceorientation", imuCallback);

    // random data for testing on dev laptop
    const intervalID = setInterval(() => {
      const [alphas, betas, gammas] = api.imuData.state.slice(1, 4);

      const newAlpha =
        (alphas[alphas.length - 1] + (Math.random() - 0.5) * 10) % 360;
      imuCallback({
        alpha: newAlpha < 0 ? 360 - newAlpha : newAlpha,
        beta: (betas[betas.length - 1] + (Math.random() - 0.5) * 10) % 180,
        gamma: (gammas[gammas.length - 1] + (Math.random() - 0.5) * 10) % 90,
      } as DeviceOrientationEvent);
    }, 100);

    return () => clearInterval(intervalID);
  }, [api.imuData]);

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
                  data: api.imuData,
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
