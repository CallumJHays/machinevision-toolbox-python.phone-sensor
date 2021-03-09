from phone_sensor import PhoneSensor
from ansitable import ANSITable  # type: ignore
import numpy as np  # type: ignore
from typing import cast, Any

phone = PhoneSensor(qrcode=True, proxy_client_from="localhost:3000")

print("Timing Performance Validation\n")

n = 5
print("PhoneSensor.grab(wait=?) n=" + str(n))
grab_table = ANSITable("Expected (s)", "Resolution", "Encoding", "Quality", "Mean", "Median",
                       "Min", "Max", "Std. Dev")
for wait_s in [0.1, 0.5, 1]:
    for resolution in [(320, 240), (640, 480), (1280, 960)]:
        for encoding in ["webp", "jpeg", "bmp"]:
            for quality in [1, 90]:
                raw = [
                    phone.grab(
                        resolution=resolution,
                        encoding=cast(Any, encoding),
                        quality=quality,
                        wait=wait_s)[1]
                    for _ in range(n + 1)
                ]

                # ask for 11 images and get the 'supposed' (according to client) difference in secs
                times = cast(np.ndarray, np.diff(raw))  # type: ignore

                grab_table.row(wait_s, resolution, encoding, quality, times.mean(),  # type: ignore
                               np.median(times), times.min(), times.max(), times.std())  # type: ignore

grab_table.print()  # type: ignore

n = 10
print("PhoneSensor.imu(wait=?) n=" + str(n))
imu_table = ANSITable("Expected (s)", "Mean", "Median",
                      "Min", "Max", "Std. Dev")
for wait_s in [0.01, 0.1, 0.3, 0.5, 1]:

    times = cast(np.ndarray, np.diff(  # type: ignore
        [phone.imu(wait=wait_s).unix_timestamp for _ in range(n + 1)]))

    imu_table.row(wait_s, times.mean(), np.median(times), times.min(), times.max(), times.std())  # type: ignore # nopep8

imu_table.print()  # type: ignore
