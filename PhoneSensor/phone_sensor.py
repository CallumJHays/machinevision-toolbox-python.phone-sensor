import asyncio
from http import HTTPStatus
from pathlib import Path
from typing import Optional as Opt
from typing_extensions import Literal
import websockets
import json
from threading import Thread
from queue import Queue
from websockets.exceptions import WebSocketException
import socket


class PhoneSensor:

    def __init__(self, popup_qrcode=False, host: str="0.0.0.0", port: int=8765):
        self.ws: Opt[websockets.WebSocketServerProtocol] = None
        self.loop: Opt[asyncio.AbstractEventLoop] = None
        self.queue = Queue()
        Thread(target=self._start_server, kwargs={'host': host, 'port': port}).start()


    def grab(self, cam: Literal['front', 'back']=None,
             button: bool=False, wait: float=None):
        return self._rpc(json.dumps({
            'cmd': 'grab',
            'cam': cam,
            'button': button,
            'wait': wait
        }))


    def imu(self, wait: float=None):
        return self._rpc(json.dumps({
            'cmd': 'imu',
            'wait': wait
        }))

    
    def _rpc(self, cmd: str):
        if self.ws is None:
            self.ws = self.queue.get()
        asyncio.ensure_future(self.ws.send(cmd), loop=self.loop)
        return self.queue.get()


    def _start_server(self, host, port):
        self.loop = asyncio.new_event_loop()
        server = websockets.serve(self._api, host, port, process_request=self._maybe_serve_static, loop=self.loop)
        print(f"started app at http://{_get_local_ip()}:{port}")
        asyncio.ensure_future(server, loop=self.loop)
        self.loop.run_forever()


    async def _api(self, ws, _path):
        self.queue.put(ws)
        try:
            async for ret in ws:
                self.queue.put(ret)
        except WebSocketException:
            self.ws = None


    async def _maybe_serve_static(self, path: str, _headers):
        _extensions_map = {
            '.manifest': 'text/cache-manifest',
            '.html': 'text/html',
                '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.svg':	'image/svg+xml',
            '.css':	'text/css',
            '.js':	'application/x-javascript',
            '': 'application/octet-stream', # Default
        }

        if path != '/ws':
            if path == '/':
                path = '/index.html'
            file = Path(__file__).parent / '..' / ('build' + path)
            return (HTTPStatus.OK, {
                'Content-Type': _extensions_map[file.suffix]
            }, file.read_bytes())
        # if None is returned, will default to ws handler


def _get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ret = s.getsockname()[0]
    s.close()
    return ret