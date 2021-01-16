import { useState, useEffect } from "react";
import { Observable } from "./observable";

type CameraGrabApiMsg = {
  cmd: "grab";
  cam: string;
  button: boolean;
  wait: number | null;
};

type ImuApiMsg = {
  cmd: "imu";
  wait: number | null;
};

type ServerDisconnectMsg = {
  cmd: "disconnect"; // occurs when a second client attempts to connect - switches to newest
};

type ApiMsg = CameraGrabApiMsg | ImuApiMsg | ServerDisconnectMsg;

export class Api {
  waitingOnButton: Observable<boolean>;

  private ws: WebSocket;
  private sendPhoto: (() => void) | null;
  private sendPhotoScheduled: boolean;

  // can't just use "/ws". WebSocket constructor won't accept it.
  // static WS_URL =
  //   "ws://" + document.domain + ":" + window.location.port + "/ws";
  static WS_URL = "ws://" + document.domain + ":8765/ws";

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.waitingOnButton = new Observable(false as boolean);
    this.sendPhoto = null;
    this.sendPhotoScheduled = false;

    ws.onmessage = async ({ data }: { data: string }) =>
      this.onMsg(JSON.parse(data) as ApiMsg);
  }

  private onMsg(msg: ApiMsg) {
    console.log("got api msg", msg);

    switch (msg.cmd) {
      case "grab":
        if (msg.button) {
          this.waitingOnButton.set(true);
        } else {
          this.scheduleSendPhoto();
        }
        break;

      case "imu":
        this.send(null);
        break;

      case "disconnect":
        this.ws.close();
        throw new Error("Another client device has taken control of websocket");

      default:
        throw new Error(`Unhandled Api message ${msg}`);
    }
  }

  send(msg: any) {
    console.log("sending", { msg, readyState: this.ws.readyState });
    this.ws.send(msg instanceof Blob ? msg : JSON.stringify(msg));
  }

  scheduleSendPhoto() {
    if (this.sendPhoto === null) {
      this.sendPhotoScheduled = true;
    } else {
      this.sendPhoto();
    }
  }

  registerSendPhoto(sendPhoto: () => void) {
    this.sendPhoto = sendPhoto;
    if (this.sendPhotoScheduled) {
      sendPhoto();
    }
  }
}

export function useApi() {
  const [api, setApi] = useState<Api | Error | null>(null);

  useEffect(() => {
    try {
      const ws = new WebSocket(Api.WS_URL);
      ws.onopen = () => setApi(new Api(ws));
      ws.onclose = () => setApi(null);
      return ws.close; // effect cleanup handler
    } catch (e) {
      setApi(e); // set the connection error to show users
    }
  }, []);

  return api;
}
