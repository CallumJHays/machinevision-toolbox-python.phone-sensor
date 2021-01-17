from PhoneSensor.phone_sensor import ClientDisconnectException
from PhoneSensor import PhoneSensor
from matplotlib import pyplot as plt
from PhoneSensor import PhoneSensor

phone = PhoneSensor()

while True:
    try:
        img = phone.grab(button=True)
        plt.imshow(img) # type: ignore
        plt.show()
    except ClientDisconnectException:
        pass
