from PhoneSensor.phone_sensor import ClientDisconnectException
from PhoneSensor import PhoneSensor
from matplotlib import pyplot as plt
from PhoneSensor import PhoneSensor

# proxy from the dev server
phone = PhoneSensor(proxy_client_from='http://localhost:3000')

while True:
    try:
        img = phone.grab(button=True)
        plt.imshow(img) # type: ignore
        plt.show()
    except ClientDisconnectException:
        pass
