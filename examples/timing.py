from phone_sensor import PhoneSensor
from ansitable import ANSITable  # type: ignore
import numpy as np  # type: ignore
from typing import cast

phone = PhoneSensor(proxy_client_from='localhost:3000', qrcode=True)

print("Timing Performance Validation\n")

print("PhoneSensor.grab(wait=?)")
grab_table = ANSITable("Expected", "Mean", "Median", "Std. Dev")
for wait_s in [0.05, 0.1, 0.3, 0.5, 1]:

    # ask for 11 images and get the 'supposed' (according to client) difference in ms
    times = cast(np.ndarray, np.diff(  # type: ignore
        [phone.grab(wait=wait_s)[1] for _ in range(11)]))

    grab_table.row(wait_s, times.mean(), np.median(times), np.std(times))  # type: ignore # nopep8

grab_table.print()  # type: ignore

print("PhoneSensor.imu(wait=?)")
imu_table = ANSITable("Expected", "Mean", "Median", "Std. Dev")
for wait_s in [0.01, 0.1, 0.3, 0.5, 1]:

    times = cast(np.ndarray, np.diff(  # type: ignore
        [phone.imu(wait=wait_s).posix_timestamp for _ in range(11)]))

    imu_table.row(wait_s, times.mean(), np.median(times), np.std(times))  # type: ignore # nopep8

imu_table.print()  # type: ignore
