from http import HTTPStatus
from phone_sensor import PhoneSensor
import unittest
from urllib.request import urlopen
import ssl


class TestPhoneSensor(unittest.TestCase):

    def test_constructor(self):
        PhoneSensor().close()

    def test_server_shutsdown(self):
        with PhoneSensor():
            pass

        # this would throw an error if the server wasn't shutdown
        phone = PhoneSensor()
        phone.close()

    def test_hosts_client(self):
        host, port = 'localhost', 8000

        # need to tell urlopen to trust the ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with PhoneSensor(host=host, port=port):
            with urlopen(f'https://{host}:{port}', context=ctx) \
                    as client_html:
                assert client_html.status == HTTPStatus.OK

# testing client-functionality will require https://github.com/pyppeteer/pyppeteer


if __name__ == '__main__':
    unittest.main()
