from PhoneSensor import PhoneSensor
from matplotlib import pyplot as plt

phone = PhoneSensor()

img = phone.grab()
plt.imshow(img) # type: ignore
plt.show()