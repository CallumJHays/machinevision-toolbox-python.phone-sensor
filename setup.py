from setuptools import setup, find_packages
from os import path

here = path.abspath(path.dirname(__file__))

# Get the long description from the README file
with open(path.join(here, 'README.md'), encoding='utf-8') as f:
    long_description = f.read()


setup(
    name='bdsim', 

    version="0.1.0",

    description='PhoneSensor for machinevisiontoolbox. Get camera and IMU data from a camera remotely with Python', #TODO
    
    long_description=long_description,
    long_description_content_type='text/markdown',

    classifiers=[
    #   3 - Alpha
    #   4 - Beta
    #   5 - Production/Stable
    'Development Status :: 4 - Beta',

    # Indicate who your project is intended for
    'Intended Audience :: Developers',
    # Pick your license as you wish (should match "license" above)
     'License :: OSI Approved :: MIT License',

    # Specify the Python versions you support here. In particular, ensure
    # that you indicate whether you support Python 2, Python 3 or both.
    'Programming Language :: Python :: 3 :: Only'],

    project_urls={
        #'Documentation': 'https://petercorke.github.io/bdsim',
        'Source': 'https://github.com/callumjhays/mvt-phonesensor-app',
        'Tracker': 'https://github.com/callumjhays/mvt-phonesensor-app/issues',
        #'Coverage': 'https://codecov.io/gh/petercorke/spatialmath-python',
    },

    url='https://github.com/callumjhays/mvt-phonesensor-app',

    author='Callum Hays',

    author_email='callumjhays@gmail.com', #TODO

    keywords='python webapp imu motion camera machinevision computervision opencv',

    license='MIT',

    python_requires='>=3.6',

    packages=find_packages(exclude=["test_*", "TODO*"]),

    install_requires=['pyqrcode', 'websockets', 'numpy', 'typing_extensions']
    
)
