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

type ImuDataFrame = {
  error?: string;
  accelerometer?: [x: number, y: number, z: number];
  gyroscope?: [x: number, y: number, z: number];
  magnetometer?: [x: number, y: number, z: number];
  quaternion?: [x: number, y: number, z: number, w: number];
};

export class Api {
  waitingOnButton: Observable<boolean>;
  sendPhotoFunc: Observable<(() => void) | null>;
  imuQuaternionData: Observable<number[][]>;
  imuDataFrame: Observable<ImuDataFrame>;

  private ws: WebSocket;

  // can't just use "/ws". WebSocket constructor won't accept it.
  static WS_URL =
    "wss://" + document.domain + ":" + window.location.port + "/ws";

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.waitingOnButton = new Observable(false as boolean);
    this.sendPhotoFunc = new Observable(null as any);
    this.imuQuaternionData = new Observable([
      [Math.floor(Date.now() / 1000)],
      [0],
      [0],
      [0],
    ]);
    this.imuDataFrame = new Observable(
      {
        error:
          "No IMU data is available. The device either does not support IMU data or has not been given permission.",
      } as ImuDataFrame,
      (frame) => {
        // If we received any new data, the error above is invalid. clear it.
        if ("error" in frame) {
          delete frame["error"];
        }
      }
    );

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
        this.send(this.imuDataFrame.state);
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
