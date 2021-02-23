import asyncio
from http import HTTPStatus
from http.client import HTTPResponse
from pathlib import Path
from urllib.request import urlopen
from typing import Any, Optional as Opt, Tuple, Union
from typing_extensions import Literal
import json
import socket
import struct
from threading import Thread
from queue import Queue
import ssl
import subprocess
import pyqrcode # type: ignore

import websockets
from websockets.exceptions import WebSocketException
from websockets.http import Headers
from websockets.server import WebSocketServerProtocol
import numpy as np # type: ignore

class ClientDisconnectException(Exception): ...

class PhoneSensor:

    def __init__(self,
                 qrcode: bool = False,
                 proxy_client_from: Opt[str] = None,
                 host: str = "0.0.0.0",
                 port: int = 8765):

        self._ws: Opt[websockets.WebSocketServerProtocol] = None
        self._in: Queue[str] = Queue()
        self._out: Queue[Union[websockets.Data, ClientDisconnectException]] = Queue()
        self._waiting = False
        self._qrcode = qrcode
        self._proxy_client_from = proxy_client_from

        Thread(target=self._start_server,
               kwargs={'host': host, 'port': port},
               daemon=True).start()


    def grab(self,
             cam: Opt[Literal['front', 'back']] = None,
             button: bool = False,
             wait: Opt[float] = None
        ) -> np.ndarray:
        
        res = self._rpc(json.dumps({
            'cmd': 'grab',
            'cam': cam,
            'button': button,
            'wait': wait
        }))

        assert isinstance(res, bytes)
        width, height = struct.unpack('<HH', res[:4])
        
        
        return np.frombuffer(res[4:], dtype=np.uint8).reshape((height, width, 3)) # type: ignore
                


    def imu(self, wait: Opt[float] = None) -> Tuple[float, float, float]:

        return tuple(json.loads(self._rpc(json.dumps({
            'cmd': 'imu',
            'wait': wait
        }))))

    
    def _rpc(self, cmd: str):
        self._waiting = True
        self._in.put(cmd)
        res = self._out.get()
        self._waiting = False
        if isinstance(res, ClientDisconnectException):
            raise res
        return res


    def _start_server(self, host: str, port: int):
        loop = asyncio.new_event_loop()
        server = websockets.serve(self._api, host, port,
            # just generate a new certificate every time.
            # Hopefully this doesnt drain too much entropy
            ssl=use_selfsigned_ssl_cert(), 
            max_size=100_000_000, # allow for big images to be sent (<100MB)
            process_request=self._maybe_serve_static, loop=loop)
        
        url = f"https://{_get_local_ip()}:{port}"

        # display cmdline connect msg
        BLUE = '\033[94m'
        YELLOW = '\033[93m'
        UNDERLINE = '\033[4m'
        END = '\033[0m'
        print(f"{YELLOW}Hosting 📷 app at 🌐 {END}{BLUE}{UNDERLINE}{url}{END}{END}")

        # cmdline qr code if specified
        if self._qrcode:
            # use url.upper() as it's needed for alphanumeric encoding:
            # https://pythonhosted.org/PyQRCode/encoding.html#alphanumeric
            qrcode = pyqrcode.create(url.upper()).terminal() # type: ignore
            print(f'Or scan the following QR Code: {qrcode}')

        loop.run_until_complete(server)
        loop.run_forever()


    async def _api(self, ws: WebSocketServerProtocol, _path: str):
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

        self._ws = ws

        try:
            while True: 
                cmd = self._in.get()
                await ws.send(cmd)
                res = await ws.recv()
                self._out.put(res)
            
        except WebSocketException:
            self._out.put(ClientDisconnectException(f"Client from {ip} disconnected"))


    async def _maybe_serve_static(self, path: str, _headers: Headers):

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
            
            if self._proxy_client_from:
                res: HTTPResponse = urlopen(self._proxy_client_from + path)
                return (HTTPStatus.OK, {
                    'Content-Type': res.headers.get('Content-Type')
                }, res.read())
            

            else:
                file = Path(__file__).parent / '..' / ('build' + path)
                return (HTTPStatus.OK, {
                    'Content-Type': _extensions_map[file.suffix]
                }, file.read_bytes())
            

        # if None is returned, will default to ws handler
        return None


# Ripped from https://docs.python.org/3/library/ssl.html#self-signed-certificates
def use_selfsigned_ssl_cert():
    certfile = Path(__file__).parent / '.self-signed-cert.pem'

    if not certfile.exists():
        subprocess.check_call(
            'openssl req -new -x509 -days 365 -nodes \
                -out {0} \
                -keyout {0} \
                -subj "/C=RO/ST=Bucharest/L=Bucharest/O=IT/CN=www.example.ro"'\
                    .format(certfile), shell=True, stderr=subprocess.DEVNULL)

    # keyfile not needed
    # with NamedTemporaryFile('r') as key_file:
    #     key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k).decode("utf-8"))

    ssl_context: Any = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER) # type: ignore
    ssl_context.load_cert_chain(certfile) # type: ignore

    return ssl_context

def _get_local_ip():
    try:
        # unreadable garbage but it works - https://stackoverflow.com/a/1267524/1266662
        return (([
            ip for ip in socket.gethostbyname_ex(socket.gethostname())[2]
            if not ip.startswith("127.")
        ] or [[
            (s.connect(("8.8.8.8", 53)), s.getsockname()[0], s.close())
            for s in [socket.socket(socket.AF_INET, socket.SOCK_DGRAM)]
        ][0][1]]) + ["no IP found"])[0]
    except OSError:
        return 'localhost' # probably not connected to a LAN
