from setuptools import setup, find_packages
import os
from os import path


here = path.abspath(path.dirname(__file__))

# Get the long description from the README file
with open(path.join(here, 'README.md'), encoding='utf-8') as f:
    long_description = f.read()

def recursively_list_all_files(directory: str):
    paths = []
    for (path, _, filenames) in os.walk(directory):
        for filename in filenames:
            paths.append(os.path.join('..', path, filename))
    return paths

setup(
    
    name='machinevision-toolbox-python.phone-sensor', 

    version="0.2.7",

    description='PhoneSensor for machinevisiontoolbox. Get camera and IMU data from a camera remotely with Python',
    
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
        'Documentation': 'https://github.com/CallumJHays/machinevision-toolbox-python.phone-sensor',
        'Source': 'https://github.com/CallumJHays/machinevision-toolbox-python.phone-sensor',
        'Tracker': 'https://github.com/CallumJHays/machinevision-toolbox-python.phone-sensor/issues',
    },

    url='https://github.com/CallumJHays/machinevision-toolbox-python.phone-sensor',

    author='Callum Hays',

    author_email='callumjhays@gmail.com',

    keywords='python webapp imu motion camera machinevision computervision opencv',

    license='MIT',

    python_requires='>=3.6',

    packages=find_packages(exclude=["test_*", "TODO*"]),

    include_package_data=True,
    package_data={
        '': recursively_list_all_files('phone_sensor/build')
    },

    install_requires=['pyqrcode', 'websockets', 'numpy', 'typing_extensions']
    
)
