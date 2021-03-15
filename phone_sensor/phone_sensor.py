import asyncio
from http import HTTPStatus
from http.client import HTTPResponse
from pathlib import Path
from urllib.request import urlopen
from typing import Any, ContextManager, Optional, Union, Tuple, cast
from typing_extensions import Literal
import json
import socket
from threading import Thread
from queue import Queue
import ssl
import subprocess
import pyqrcode  # type: ignore
import struct
import logging
import websockets
try:  # WebSocketException is not defined for ver<8 of websockets lib
    from websockets.exceptions import WebSocketException
except ImportError:
    WebSocketException = Exception

from websockets.http import Headers
from websockets.server import WebSocketServerProtocol
import numpy as np  # type: ignore
from urllib.error import URLError

def drop_alpha_channel(img: np.ndarray):
    return img if img.shape[2] == 3 else img[:, :, :3]
    
# try cv2 -> matplotlib -> Pillow
try:
    import cv2  # type: ignore

    def imdecode(buf: bytes) -> np.ndarray:  # type: ignore
        img: np.ndarray = cv2.imdecode(np.frombuffer(buf, dtype=np.uint8), cv2.IMREAD_COLOR) # type: ignore # nopep8
        img = drop_alpha_channel(img)
        return img 

except ImportError:
    try:
        from matplotlib.pyplot import imread
        from io import BytesIO

        # pretty sure matplotlib just uses PIL under the hood, oh well:
        def imdecode(buf: bytes) -> np.ndarray:  # type: ignore
            img = drop_alpha_channel(imread(BytesIO(buf)))
            # RGB2BGR
            return np.flip(img, axis=2) # type: ignore

    except ImportError:
        from PIL import Image
        from io import BytesIO

        def imdecode(buf: bytes) -> np.ndarray:
            img = np.array(Image.open(BytesIO(buf))) # type: ignore
            img = drop_alpha_channel(img)
            # RGB2BGR
            return np.flip(img, axis=2)  # type: ignore


class ImuDataFrame:
    unix_timestamp: float
    quaternion: Tuple[float, float, float, float]
    accelerometer: Optional[Tuple[float, float, float]]
    gyroscope: Optional[Tuple[float, float, float]]
    magnetometer: Optional[Tuple[float, float, float]]


class ClientDisconnect(Exception):
    pass


class DataUnavailable(Exception):
    pass


class PhoneSensor(ContextManager['PhoneSensor']):

    def __init__(self,
                 *,
                 qrcode: bool = False,
                 host: str = "0.0.0.0",
                 port: int = 8000,
                 logger: logging.Logger = logging.getLogger(
                     'mvt.phone_sensor'),
                 log_level: int = logging.WARN,
                 proxy_client_from: Optional[str] = None):
        """Initialize a `PhoneSensor` object

        :param qrcode: True to output a QRCode in the terminal window that points to the server accessible via LAN, defaults to False
        :param host: Which hostname/ip to host the server on, defaults to "0.0.0.0"
        :param port: Which port to host the server on, defaults to 8000
        :param logger: A standard `logging.Logger` for debugging and general log information, defaults to logging.getLogger('mvt.phone_sensor')
        :param log_level: Log level for the aforementioned logger, defaults to logging.WARN
        :param proxy_client_from: A separate host from which to proxy the web client, defaults to None.
            Mainly for development purposes, using a hot-reloaded webpack server for the client
            rather than the one shipped with your `pip install`
        """

        self._ws: Optional[websockets.WebSocketServerProtocol] = None
        self._out: Queue[Union[websockets.Data, ClientDisconnect]] = Queue()
        self._waiting = False
        self._qrcode = qrcode
        self._proxy_client_from = proxy_client_from
        self.logger = logger
        self.logger.setLevel(log_level)
        self.client_connected = False
        self.loop = asyncio.new_event_loop()
        self._in: asyncio.Queue[str] = asyncio.Queue(loop=self.loop)
        self.stop_flag = self.loop.create_future()

        self.server_thread = Thread(target=self._start_server,
                                    kwargs={'host': host, 'port': port},
                                    daemon=True)
        self.server_thread.start()
        assert self._out.get() == 'ready', "server failed to start"

    def __exit__(self, _1, _2, _3):
        self.close()

    def grab(self,
             cam: Literal['front', 'back'] = 'back',
             *,
             resolution: Tuple[int, int] = (640, 480),
             button: bool = False,
             wait: Optional[float] = None,
             encoding: Literal['jpeg', 'png', 'webp', 'bmp'] = 'webp',
             quality: int = 90,
             ) -> Tuple[np.ndarray, float]:
        """Grab an image from the first/currently connected webapp client

        :param cam: Default camera to use, defaults to 'back'.
            Most smartphones have a 'front' (the side with the touchscreen) and a 'back' camera.
            This may be temporarily overridden through the menu on the client.
        :param resolution: The desired resolution (width, height) of the photo, defaults to (640, 480).
            Choosing lower values will increase performance, allowing you to take more photos in quicker succession.
            Note this is not necessarily respected - It's up to the browser's implementation which resolution
            it chooses, with this value being the 'ideal'. For example, if you ask for (999999, 480)
            the browser might choose (640, 480) instead.
        :param button: True to wait for button press, defaults to False.
        :param wait: Minimum amount of time to wait since previous photo before taking a new one, defaults to None.
            Incompatible with the `button` arg.
        :param encoding: The encoding mimetype for the image, defaults to 'webp'.
            In order of most to least performance, the recommended options are: ['webp', 'jpeg', 'png', 'bmp'].
            'webp' and 'jpeg' are lossy compressions, so they will have differing compression artifacts.
            'png' and 'bmp' are lossless. 'bmp' is essentially "no encoding" so you may use this if
            network is not a bottleneck (which it typically is). Otherwise 'png' is also lossless.
        :param quality: The quality (within (0, 100]) at which to encode the image, defaults to 90.
            Lower may slightly increase performance at the cost of image quality, however,
            the effect is typically insignificant. Does nothing for lossless encodings such as 'png'.
        :raises PhoneSensor.ClientDisconnect: If the device disconnects from the app after receiving the command.
        :return: An `(img, timestamp)` tuple,
            where `img` is a `numpy.ndarray` in the format you would expect from OpenCV (h x w x rgb)
            and `timestamp` is a unix timestamp from the client device (seconds since epoch)
        """

        assert not (wait is not None and button), \
            "`wait` argument cannot be used with `button=True`"
        assert 0 <= quality <= 90

        data = self._rpc(json.dumps({
            'cmd': 'grab',
            'frontFacing': cam == 'front',
            'button': button,
            'wait': wait,
            'resolution': resolution,
            'encoding': encoding,
            'quality': quality
        }))

        assert isinstance(data, bytes)

        # first 4 bytes is the timestamp, followed by the encoded image data
        timestamp: float = struct.unpack('Q', data[:8])[0] / 1000.0
        img = imdecode(data[8:])

        # old format without encoding; TODO: make this an option to this function
        # width, height = struct.unpack('<HH', data[24:28])

        # datahape the data and omit the unfortunate alpha channel

        # img = np.frombuffer(  # type: ignore
        #     data[28:],
        #     dtype=np.uint8
        # ).reshape((height, width, 4))[:, :, :3]  # unsure whether this is faster/slower than delete. think so

        return img, timestamp

    def imu(self, wait: Optional[float] = None) -> ImuDataFrame:  # type: ignore
        """Retrieve orientation and motion data from a capable device.

        :param wait: Minimum amount of time to wait since previous reading before taking a new one, defaults to None.
        :raises PhoneSensor.ClientDisconnect: If the device disconnects from the app after receiving the command.
        :raises PhoneSensor.DataUnavailable: if the device is incapable of providing the data (eg. desktop pc),
            or if the browser disallows it, either due to app permissions or if it does not support the features.
        :return: An ImuDataFrame, with the orientation as a quaternion tuply and raw accelerometer, magnetometer and
            gyroscope tuples if supported by the browser (generally only new versions of Android Chrome).
            Also includes the timestamp (seconds since epoch) at which the last quaternion reading was made.
        """
        resp = json.loads(self._rpc(json.dumps({
            'cmd': 'imu',
            'wait': wait
        })))

        if 'error' in resp:
            raise DataUnavailable(resp['error'])

        frame = ImuDataFrame()
        frame.unix_timestamp = resp['unixTimestamp']
        frame.quaternion = tuple(resp['quaternion'])
        for reading in ['accelerometer', 'gyroscope', 'magnetometer']:
            setattr(frame, reading, tuple(
                resp[reading]) if reading in resp else None)

        return frame

    def close(self):
        """Close the server and relinquish control of the port.
        Use of `PhoneSensor` as a context manager is preferred to this, where suitable.
        May be called automatically by the garbage collector.
        """
        self.loop.call_soon_threadsafe(self.stop_flag.set_result, True)
        self.server_thread.join()

    def _rpc(self, cmd: str):
        self._waiting = True
        asyncio.run_coroutine_threadsafe(self._in.put(cmd), self.loop)
        res = self._out.get()
        self._waiting = False
        if isinstance(res, ClientDisconnect):
            raise res
        return res

    def _start_server(self, host: str, port: int):
        async def _websocket_server():
            # TODO: graceful shutdown https://stackoverflow.com/a/48825733/1266662
            async with websockets.serve(self._api, host=host, port=port,
                                        # just generate a new certificate every time.
                                        # Hopefully this doesnt drain too much entropy
                                        ssl=_use_selfsigned_ssl_cert(),
                                        # allow for big images to be sent (<100MB)
                                        max_size=100_000_000,
                                        process_request=self._maybe_serve_static):
                self._out.put("ready")
                await self.stop_flag

        url = f"https://{self._get_local_ip()}:{port}"

        # display cmdline connect msg
        BLUE = '\033[94m'
        UNDERLINE = '\033[4m'
        END = '\033[0m'
        print(f"Hosting 📷 app at 🌐 {BLUE}{UNDERLINE}{url}{END}{END}")

        # cmdline qr code if specified
        if self._qrcode:
            # use url.upper() as it's needed for alphanumeric encoding:
            # https://pythonhosted.org/PyQRCode/encoding.html#alphanumeric
            qrcode = pyqrcode.create(url.upper()).terminal()  # type: ignore
            print(f'Or scan the following QR Code: {qrcode}')

        self.loop.run_until_complete(_websocket_server())

    async def _api(self, ws: WebSocketServerProtocol, path: str):
        ip = ws.local_address[0]
        self.logger.info(f"New client connected from {ip}")
        self.client_connected = True

        # # handle webpack reload ws proxy
        # if path == '/sockjs-node' and self._proxy_client_from:
        #     # import pdb; pdb.set_trace()
        #     await self._ws_proxy(
        #         await websockets.connect('ws://' + self._proxy_client_from + path, loop=self.loop),
        #         ws)
        #     return

        # new connection
        if self._ws:  # if we already have one,

            try:
                await self._ws.send(json.dumps({
                    'cmd': 'disconnect'
                }))
            except WebSocketException:
                pass

            if self._waiting:
                self._out.put(ClientDisconnect(
                    "Switched to new client before retrieving result from previous one."))

        self._ws = ws

        async def request_response():
            cmd = await self._in.get()
            await ws.send(cmd)
            res = await ws.recv()
            self._out.put(res)

        try:
            while True:
                req_res = self.loop.create_task(request_response())
                _, pending = await asyncio.wait({req_res, self.stop_flag},
                                                return_when=asyncio.FIRST_COMPLETED)

                if req_res in pending:
                    # stop_flag mustve been set
                    req_res.cancel()
                    break

        except WebSocketException as e:
            self.client_connected = False
            self._out.put(ClientDisconnect(f"Client from {ip} disconnected:"))
            raise e

    # for proxying the webpack websocket to the webpack dev server
    #  Doesn't seem to work :(
    # async def _ws_proxy(self, from_: WebSocketClientProtocol, to: WebSocketServerProtocol):
    #     while True:
    #         upstream, downstream = asyncio.ensure_future(from_.recv()), asyncio.ensure_future(to.recv())

    #         # AssertionError: yield from wasn't used with future
    #         # Task exception was never retrieved
    #         done, _ = asyncio.wait(
    #             { upstream, downstream },
    #             return_when=asyncio.FIRST_COMPLETED)

    #         if upstream in done:
    #             await to.send(await upstream)

    #         if downstream in done:
    #             await from_.send(await downstream)

    async def _maybe_serve_static(self, path: str, _: Headers):

        # stolen from stackoverflow - lost link
        _extensions_map = {
            '.manifest': 'text/cache-manifest',
            '.html': 'text/html',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.svg':	'image/svg+xml',
            '.css':	'text/css',
            '.js':	'application/x-javascript',
            '': 'application/octet-stream',  # Default
        }

        if path == '/sockjs-node':
            return HTTPStatus.NOT_FOUND, cast(Any, {}), b''

        if path != '/ws':  # and path != '/sockjs-node':
            if path == '/':
                path = '/index.html'

            if self._proxy_client_from:
                url = 'http://' + self._proxy_client_from + path
                self.logger.info('proxying client from ' + url)

                try:
                    res: HTTPResponse = urlopen(url)
                    return (HTTPStatus.OK, {
                        'Content-Type': res.headers.get('Content-Type')
                    }, res.read())

                except URLError:
                    self._out.put(ClientDisconnect(
                        "Could not proxy to %s. Is the server specified by `proxy_client_from` running?" % url))
                    return HTTPStatus.NOT_FOUND, cast(Any, {}), b''

            else:
                file = Path(__file__).parent / ('js_client' + path)
                return (HTTPStatus.OK, {
                    'Content-Type': _extensions_map[file.suffix]
                }, file.read_bytes())

        # if None is returned, will default to ws handler
        return None

    def _get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # doesn't even have to be reachable
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:

            YELLOW = '\033[93m'
            END = '\033[0m'
            self.logger.warn(
                f"{YELLOW}[WARN]: Couldn't find a local IP. Are you connected to a LAN? Falling back to loopback address{END}")
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    ClientDisconnect = ClientDisconnect
    DataUnavailable = DataUnavailable
    ImuDataFrame = ImuDataFrame


# Adapted from https://docs.python.org/3/library/ssl.html#self-signed-certificates
def _use_selfsigned_ssl_cert():

    # Generation probably isn't required.
    # Reusing the same one is fine as they only need be unique for each domain name
    # which is n/a for us as we use IP addresses
    certfile = Path(__file__).parent / 'ssl-cert.pem'
    # if not certfile.exists():
    #     subprocess.check_call(
    #         'openssl req -new -x509 -days 365 -nodes \
    #             -out {0} \
    #             -keyout {0} \
    #             -subj "/C=RO/ST=Bucharest/L=Bucharest/O=IT/CN=*"'
    #         .format(certfile), shell=True, stderr=subprocess.DEVNULL)

    # keyfile not needed
    # with NamedTemporaryFile('r') as key_file:
    #     key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k).decode("utf-8"))

    ssl_context: Any = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)  # type: ignore
    ssl_context.load_cert_chain(certfile)  # type: ignore

    return ssl_context
