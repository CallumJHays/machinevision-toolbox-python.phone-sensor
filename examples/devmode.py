from phone_sensor import PhoneSensor
from matplotlib import pyplot as plt

# proxy from the dev server
phone = PhoneSensor(
    proxy_client_from='localhost:3000',
    qrcode=True)

while True:
    try:
        img = phone.grab(button=True)

        imudata = phone.imu()
        if imudata.accelerometer:
            plt.bar(['x', 'y', 'z'], imu.accelerometer) # type: ignore
            plt.show(block=False)
        else:
            print('No accelerometer data found')

        plt.imshow(img) # type: ignore
        plt.show()

    except PhoneSensor.ClientDisconnect:
        pass
