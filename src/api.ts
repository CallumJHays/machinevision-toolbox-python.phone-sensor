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
  sendPhotoFunc: Observable<(() => void) | null>;
  imuData: Observable<number[][]>;

  private ws: WebSocket;

  // can't just use "/ws". WebSocket constructor won't accept it.
  static WS_URL =
    "wss://" + document.domain + ":" + window.location.port + "/ws";

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.waitingOnButton = new Observable(false as boolean);
    this.sendPhotoFunc = new Observable(null as any);
    this.imuData = new Observable([
      [Math.floor(Date.now() / 1000)],
      [0],
      [0],
      [0],
    ]);

    ws.onmessage = async ({ data }: { data: string }) =>
      this.onMsg(JSON.parse(data) as ApiMsg);
  }

  private onMsg(msg: ApiMsg) {
    switch (msg.cmd) {
      case "grab":
        if (msg.button) {
          this.waitingOnButton.set(true);
        } else if (this.sendPhotoFunc.state !== null) {
          this.sendPhotoFunc.state();
        } else {
          const cb = (sendPhoto: (() => void) | null) => {
            sendPhoto!();
            this.sendPhotoFunc.deRegister(cb);
          };
          this.sendPhotoFunc.onChange(cb);
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
    this.ws.send(msg instanceof Blob ? msg : JSON.stringify(msg));
  }
}

export function useApi() {
  // params: ConstructorParameters<typeof Api> ) {
  const [api, setApi] = useState<Api | null | Error>(null);

  useEffect(() => {
    const ws = new WebSocket(Api.WS_URL);
    ws.onopen = () => setApi(new Api(ws)); //, params));
    ws.onclose = () => setApi(null);
    ws.onerror = (e) =>
      setApi(new Error(`couldn't connect to ws api @ ${Api.WS_URL}`));
    return ws.close; // effect cleanup handler
  }, []); //[params]);

  return api;
}
