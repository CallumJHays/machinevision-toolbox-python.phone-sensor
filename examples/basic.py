from phone_sensor import PhoneSensor
from matplotlib import pyplot as plt
import numpy as np # type: ignore

# Hosts a webserver in a background thread.
# And display a QR code link to the app
with PhoneSensor(qrcode=True) as phone:
    # wait for button press to snap a photo
    bgr, time = phone.grab(button=True)
    # get device orientation as a Quaternion
    imu_data = phone.imu()

    plt.subplot(1, 2, 1)
    # img is bgr (opencv style), matplotlib uses RGB - so flip
    rgb = np.flip(bgr, axis=2) # type: ignore
    plt.imshow(rgb)  # type: ignore
    plt.title(f"t = {time}") # type: ignore
    
    plt.subplot(1, 2, 2)
    plt.bar(['x', 'y', 'z', 'w'], imu_data.quaternion)  # type: ignore
    plt.title(f"t = {imu_data.unix_timestamp}") # type: ignore
    plt.show()