import { useEffect, useRef, useCallback } from "react";
import Button from "react-bootstrap/Button";
import unwrap from "ts-unwrap";
import "md-gum-polyfill"; // work on more browsers

import { useApi, Api } from "./api";
import { as } from "./utils";

function CameraButton({ api }: { api: Api }) {
  const [
    waitingForButton,
    setWaitingForButton,
  ] = api.waitingOnButton.useState();

  return waitingForButton ? (
    <Button
      variant="outline-primary"
      style={{
        borderRadius: 99,
        height: 90,
        width: 90,
        fontSize: 32,
        margin: 10,
        alignSelf: "center",
      }}
      disabled={!waitingForButton}
      onClick={() => {
        api.sendPhoto();
        setWaitingForButton(false);
      }}
    >
      📷
    </Button>
  ) : null;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getPhoto = useCallback(function getPhoto() {
    const canvas = unwrap(canvasRef.current);
    const video = unwrap(videoRef.current);

    const w = (canvas.width = video.videoWidth);
    const h = (canvas.height = video.videoHeight);
    const ctx = unwrap(canvas.getContext("2d"));
    ctx.drawImage(video, 0, 0);
    const img = ctx
      .getImageData(0, 0, w, h)
      // discard the alpha channel by skipping every 4th byte
      .data.filter((_, idx) => idx % 4 !== 3);
    return new Blob([new Uint16Array([w, h]), img]);
  }, []);

  const api = useApi(getPhoto);

  useEffect(
    function setupVideoFeed() {
      if (api instanceof Api) {
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

        video.onloadeddata = () => api.ready();
        // don't bother with cleanup for now
      }
    },
    [api]
  );

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
        style={{ maxWidth: "100%", maxHeight: "100%" }}
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
        <Button
          variant="outline-primary"
          style={{
            borderRadius: 99,
            height: 60,
            width: 60,
            fontSize: 32,
            alignSelf: "flex-end",
            margin: 10,
          }}
        >
          ⋯
        </Button>

        {api ? (
          <CameraButton api={as(Api, api)} />
        ) : (
          <h1 style={{ justifySelf: "center", color: "black", padding: 20 }}>
            Connecting to server...
          </h1>
        )}
      </div>
    </div>
  );
}
