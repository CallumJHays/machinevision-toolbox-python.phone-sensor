import { useState, useEffect } from "react";
import { Observable } from "./observable";

type CameraGrabApiMsg = {
  cmd: "grab";
  cam: string;
  button: boolean;
  wait_ms: number | null;
};

type ImuApiMsg = {
  cmd: "imu";
  wait_ms: number | null;
};

type ServerDisconnectMsg = {
  cmd: "disconnect"; // occurs when a second client attempts to connect - switches to newest
};

type ApiMsg = CameraGrabApiMsg | ImuApiMsg | ServerDisconnectMsg;

type ImuDataFrame = {
  posixTimestamp: number;
  error?: string;
  quaternion?: [x: number, y: number, z: number, w: number];
  accelerometer?: [x: number, y: number, z: number];
  gyroscope?: [x: number, y: number, z: number];
  magnetometer?: [x: number, y: number, z: number];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Api {
  waitingOnButton: Observable<boolean>;
  sendPhotoFunc: Observable<(() => void) | null>;
  imuQuaternionData: Observable<number[][]>;
  imuDataFrame: Observable<ImuDataFrame>;
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
    this.imuQuaternionData = new Observable([
      [Math.floor(Date.now() / 1000)],
      [0],
      [0],
      [0],
    ]);
    this.imuDataFrame = new Observable(
      {
        posixTimestamp: NaN,
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
    // handle "wait_ms"
    let nowMs = 0;
    if ("wait_ms" in msg && msg["wait_ms"] !== null) {
      nowMs = Date.now();
      const msToWait =
        this.latestCmdTimestamps[msg.cmd] + msg["wait_ms"] - nowMs;
      console.log({
        msg,
        nowMs,
        msToWait,
      });

      if (msToWait > 0) {
        await sleep(msToWait);
        console.log({
          passed: Date.now() - nowMs,
        });
      }
    }

    // different functionality based on api cmd
    switch (msg.cmd) {
      case "grab":
        if (msg.button) {
          this.waitingOnButton.set(true);
        } else if (this.sendPhotoFunc.state !== null) {
          const sendPhoto = this.sendPhotoFunc.state;
          sendPhoto();
          this.latestCmdTimestamps["grab"] = Date.now();
          console.log(this.latestCmdTimestamps["grab"] - nowMs);
        } else {
          // queue a send once sendPhoto function has been set
          const cb = (sendPhoto: (() => void) | null) => {
            sendPhoto!();
            this.latestCmdTimestamps["grab"] = Date.now();
            this.sendPhotoFunc.deRegister(cb);
          };
          this.sendPhotoFunc.onChange(cb);
        }
        break;

      case "imu":
        this.send(this.imuDataFrame.state);
        this.latestCmdTimestamps["imu"] = Date.now();
        console.log(this.latestCmdTimestamps["imu"] - nowMs);
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
