// index.js
const { disconnectOBD, requestSupportedPIDs, requestData } = require('./bluetoothManager');
const { discoverDevices, identifyOBDDevice } = require('./discoverDevices');

const main = async () => {
  try {
    console.log('Discovering Bluetooth devices...');
    const devices = await discoverDevices();
    console.log('Devices found:', devices);

    const obdDevice = await identifyOBDDevice(devices);
    if (!obdDevice) {
      console.log('No OBD-II adapter found.');
      return;
    }
    console.log('OBD-II device found:', obdDevice);

    const { serial } = obdDevice;

    try {
      // Request supported PIDs
      const supportedPIDs = await requestSupportedPIDs(serial);
      console.log('Supported PIDs:', supportedPIDs);

      // Check if PID 0D is supported
      if (supportedPIDs.includes('0D')) {
        console.log('PID 0D is supported, requesting vehicle speed...');
        requestData('0D', serial); // PID for vehicle speed
      } else {
        console.log('PID 0D is not supported.');
      }
    } catch (verificationError) {
      console.log('Verification failed:', verificationError);
      disconnectOBD(serial);
      return;
    }

    // Wait for some time to ensure data is received before disconnecting
    setTimeout(() => {
      disconnectOBD(serial);
      console.log('Disconnected.');
    }, 15000); // Adjust the timeout as needed to ensure data reception

  } catch (error) {
    console.error('Error:', error);
  }
};

main();
