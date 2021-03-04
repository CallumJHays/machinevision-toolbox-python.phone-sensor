from http import HTTPStatus
from http.client import HTTPResponse
from phone_sensor import PhoneSensor
import unittest
from urllib.request import urlopen


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
        port = 8000
        with PhoneSensor(port=port):
            client_html: HTTPResponse = urlopen(f'https://localhost:{port}')
            assert client_html.status == HTTPStatus.OK

# testing client-functionality will require https://github.com/pyppeteer/pyppeteer


if __name__ == '__main__':
    unittest.main()
