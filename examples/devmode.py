import logging
from phone_sensor import PhoneSensor
from matplotlib import pyplot as plt

# proxy from the dev server
phone = PhoneSensor(
    port=8000,
    proxy_client_from='localhost:3000',
    qrcode=True)

logger = logging.getLogger('websockets')
logger.setLevel(logging.DEBUG)
logger.addHandler(logging.StreamHandler())

while True:
    try:
        img, timestamp = phone.grab(button=True)

        try:
            imudata = phone.imu()
            plt.figure()
            plt.title("imu.quaternion: " +  # type: ignore
                      str(imudata.unix_timestamp))
            plt.bar(['x', 'y', 'z', 'w'], imudata.quaternion)  # type: ignore
            plt.show(block=False)

            if imudata.accelerometer:
                plt.figure()
                plt.title("imu.accelerometer" +  # type: ignore
                          str(imudata.unix_timestamp))
                plt.bar(['x', 'y', 'z'], imudata.accelerometer)  # type: ignore
                plt.show(block=False)
            else:
                print('No accelerometer data found')

        except PhoneSensor.DataUnavailable:
            print('No IMU data found')

        plt.figure()
        plt.title("phone.grab: " + str(timestamp))  # type: ignore
        plt.imshow(np.flip(img, axis=2))  # type: ignore
        plt.show()

    except PhoneSensor.ClientDisconnect:
        pass

    except Exception as e:
        phone.close()
        raise e
