from matplotlib import pyplot as plt
from PhoneSensor import PhoneSensor

phone = PhoneSensor()

img = phone.grab(button=True)
plt.imshow(img) # type: ignore
plt.show()