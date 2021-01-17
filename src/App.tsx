import { useEffect, useRef, useCallback } from "react";
import Button from "react-bootstrap/Button";
import { useApi, Api } from "./api";
import unwrap from "ts-unwrap";
import "md-gum-polyfill"; // work on more browsers

function MainUI({ api }: { api: Api }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [
    waitingForButton,
    setWaitingForButton,
  ] = api.waitingOnButton.useState();

  console.log("render", { waitingForButton });

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
    video.onloadeddata = () => api.registerSendPhoto(sendPhoto);

    // don't bother with cleanup for now
  }, [api, sendPhoto]);

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

        {waitingForButton ?? (
          <Button
            variant="outline-primary"
            style={{
              borderRadius: 99,
              height: 90,
              width: 90,
              fontSize: 32,
              margin: 10,
              pointerEvents: "none", // see https://react-bootstrap.netlify.app/components/overlays/#overlays-disabled
            }}
            disabled={!waitingForButton}
            onClick={sendPhoto}
          >
            📷
          </Button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const api = useApi();

  return api ? (
    api instanceof Api ? (
      <MainUI api={api} />
    ) : (
      <>Error: {api}</>
    )
  ) : null;
}
