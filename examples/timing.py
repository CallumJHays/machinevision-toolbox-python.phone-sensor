from phone_sensor import PhoneSensor
from ansitable import ANSITable  # type: ignore
import numpy as np  # type: ignore
from typing import cast

phone = PhoneSensor(qrcode=True)

print("Timing Performance Validation\n")

print("PhoneSensor.grab(wait=?)")
grab_table = ANSITable("Expected (s)", "Mean", "Median",
                       "Min", "Max", "Std. Dev")
for wait_s in [0.1, 0.3, 0.5, 1, 2, 3]:

    raw = [phone.grab(wait=wait_s)[1] for _ in range(11)]

    # ask for 11 images and get the 'supposed' (according to client) difference in secs
    times = cast(np.ndarray, np.diff(raw))  # type: ignore

    grab_table.row(wait_s, times.mean(), np.median(times), times.min(), times.max(), times.std())  # type: ignore # nopep8

grab_table.print()  # type: ignore

print("PhoneSensor.imu(wait=?)")
imu_table = ANSITable("Expected (s)", "Mean", "Median",
                      "Min", "Max", "Std. Dev")
for wait_s in [0.01, 0.1, 0.3, 0.5, 1]:

    times = cast(np.ndarray, np.diff(  # type: ignore
        [phone.imu(wait=wait_s).unix_timestamp for _ in range(11)]))

    imu_table.row(wait_s, times.mean(), np.median(times), times.min(), times.max(), times.std())  # type: ignore # nopep8

imu_table.print()  # type: ignore
