import { useState, useEffect } from "react";
import { Observable } from "./observable";

type CameraGrabApiMsg = {
  cmd: "grab";
  frontFacing: boolean;
  button: boolean;
  wait: number | null;
  encoding: string;
  quality: number;
  resolution: [w: number, h: number];
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
  unixTimestamp: number;
  error?: string;
  quaternion?: [x: number, y: number, z: number, w: number];
  accelerometer?: [x: number, y: number, z: number];
  gyroscope?: [x: number, y: number, z: number];
  magnetometer?: [x: number, y: number, z: number];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SendPhotoFunc = () => void;

export class Api {
  waitingOnButton: Observable<boolean>;
  sendPhotoFunc: Observable<SendPhotoFunc | null>;
  imuRawData: Observable<number[][]>;
  imuDataFrame: Observable<ImuDataFrame>;
  lastGrabCmd: Observable<CameraGrabApiMsg>;
  latestCmdTimestamps: {
    grab: number;
    imu: number;
  };

  private ws: WebSocket;

  // can't just use "/ws". WebSocket constructor won't accept it.
  static WS_URL =
    "wss://" + document.domain + ":" + window.location.port + "/ws";

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.waitingOnButton = new Observable(false as boolean);
    this.sendPhotoFunc = new Observable(null as any);
    this.imuRawData = new Observable([
      [Math.floor(Date.now() / 1000)],
      [0],
      [0],
      [0],
    ]);
    this.lastGrabCmd = new Observable({
      frontFacing: false,
      button: false,
      wait: null,
      encoding: "webp",
      quality: 90,
      resolution: [640, 480],
    } as CameraGrabApiMsg);
    this.imuDataFrame = new Observable(
      {
        unixTimestamp: NaN,
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
    this.latestCmdTimestamps = {
      grab: 0,
      imu: 0,
    };

    ws.onmessage = async ({ data }: { data: string }) =>
      this.onMsg(JSON.parse(data) as ApiMsg);
  }

  private async onMsg(msg: ApiMsg) {
    // handle "wait"
    if ("wait" in msg && msg["wait"] !== null) {
      const nowMs = Date.now();
      const msToWait =
        this.latestCmdTimestamps[msg.cmd] + msg["wait"] * 1000 - nowMs;

      if (msToWait > 0) {
        await sleep(msToWait);
      }
    }

    // different functionality based on api cmd
    switch (msg.cmd) {
      case "grab":
        this.lastGrabCmd.set(msg);

        if (msg.button) {
          this.waitingOnButton.set(true);
        } else if (this.sendPhotoFunc.state !== null) {
          const sendPhoto = this.sendPhotoFunc.state;
          this.latestCmdTimestamps.grab = Date.now();
          sendPhoto();
        } else {
          // queue a send once sendPhoto function has been set
          const cb = (sendPhoto: SendPhotoFunc | null) => {
            this.latestCmdTimestamps.grab = Date.now();
            sendPhoto!();
            this.sendPhotoFunc.deRegister(cb);
          };
          this.sendPhotoFunc.onChange(cb);
        }
        break;

      case "imu":
        this.send(this.imuDataFrame.state);
        this.latestCmdTimestamps["imu"] = Date.now();
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
