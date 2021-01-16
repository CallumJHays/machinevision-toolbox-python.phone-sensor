import { useState, useEffect } from "react";

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

type ApiMsg = CameraGrabApiMsg | ImuApiMsg;

export class Api {
  ws: WebSocket;

  // can't just use "/ws". WebSocket constructor won't accept it.
  // static WS_URL =
  //   "ws://" + document.domain + ":" + window.location.port + "/ws";
  static WS_URL = "ws://" + document.domain + ":8765/ws";

  constructor(ws: WebSocket) {
    this.ws = ws;

    ws.onmessage = async ({ data }: { data: string }) =>
      this.onMsg(JSON.parse(data) as ApiMsg);
  }

  private onMsg(msg: ApiMsg) {
    const raiseUnhandled = () => {
      console.error(`Unhandled Api message`, msg);
      throw new Error(`Unhandled Api message ${msg}`);
    };
  }

  private send(msg: any) {
    console.log("sending", { msg, readyState: this.ws.readyState });
    this.ws.send(JSON.stringify(msg));
  }

  setCurrentNode(nodeUrl: string) {
    this.send({ chosenNode: nodeUrl });
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
