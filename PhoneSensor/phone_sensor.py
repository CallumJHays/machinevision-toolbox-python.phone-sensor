import asyncio
from http import HTTPStatus
from pathlib import Path
from typing import Optional as Opt, Tuple
from typing_extensions import Literal
import json
import socket
import struct
from threading import Thread
from queue import Queue

import websockets
from websockets.exceptions import WebSocketException
from websockets.server import WebSocketServerProtocol
import numpy as np


class ClientDisconnectException(Exception): ...

class PhoneSensor:

    def __init__(self, qrcode=False, host: str="0.0.0.0", port: int=8765):
        self._ws: Opt[websockets.WebSocketServerProtocol] = None
        self._in = Queue()
        self._out = Queue()
        self._waiting = False

        Thread(target=self._start_server,
               kwargs={'host': host, 'port': port},
               daemon=True).start()


    def grab(self, cam: Literal['front', 'back']=None,
             button: bool=False, wait: float=None) -> np.ndarray:
        
        res = self._rpc(json.dumps({
            'cmd': 'grab',
            'cam': cam,
            'button': button,
            'wait': wait
        }))

        width, height = struct.unpack('<HH', res[:4])
        
        return np.frombuffer(res[4:], dtype=np.uint8) \
                .reshape((height, width, 3))


    def imu(self, wait: float=None) -> Tuple[float, float, float]:
        return tuple(json.loads(self._rpc(json.dumps({
            'cmd': 'imu',
            'wait': wait
        }))))

    
    def _rpc(self, cmd: str) -> bytes:
        self._waiting = True
        self._in.put(cmd)
        res = self._out.get()
        self._waiting = False
        if isinstance(res, ClientDisconnectException):
            raise res
        return res


    def _start_server(self, host, port):
        loop = asyncio.new_event_loop()
        server = websockets.serve(self._api, host, port,
            max_size=100_000_000, # allow for big images to be sent (<100MB)
            process_request=self._maybe_serve_static, loop=loop)

        BLUE = '\033[94m'
        YELLOW = '\033[93m'
        UNDERLINE = '\033[4m'
        END = '\033[0m'
        print(f"{YELLOW}Hosting 📷 app at 🌐 {END}{BLUE}{UNDERLINE}http://{_get_local_ip()}:{port}{END}{END}")
        
        loop.run_until_complete(server)
        loop.run_forever()


    async def _api(self, ws: WebSocketServerProtocol, _path):
        ip = ws.local_address[0]
        print(f"New client connected from {ip}")
        # new connection
        if self._ws: # if we already have one, 
            try:
                await self._ws.send(json.dumps({
                    'cmd': 'disconnect'
                }))
            except WebSocketException:
                pass

            if self._waiting:
                self._out.put(ClientDisconnectException(
                    "Switched to new client before retrieving result from previous one."))

        firstMsg = json.loads(await ws.recv());
        assert firstMsg['ready'], f"got unexpected first message from client: {firstMsg}"


        try:
            while True: 
                cmd = self._in.get()
                await ws.send(cmd)
                res = await ws.recv()
                self._out.put(res)
            
        except WebSocketException:
            self._out.put(ClientDisconnectException("Client from {ip} disconnected"))


    async def _maybe_serve_static(self, path: str, _headers):

        # stolen from stackoverflow - lost link
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
        return None


def _get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ret = s.getsockname()[0]
    s.close()
    return ret