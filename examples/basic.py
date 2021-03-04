from phone_sensor import PhoneSensor
from matplotlib import pyplot as plt

phone = PhoneSensor()

img = phone.grab(button=True)
quaternion = phone.imu().quaternion

plt.subplot(1, 2, 1)
plt.imshow(img)  # type: ignore

plt.subplot(1, 2, 2)
plt.bar(['x', 'y', 'z', 'w'], quaternion)  # type: ignore

plt.show()
