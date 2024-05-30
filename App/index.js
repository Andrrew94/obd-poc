// index.js
const { connectToOBD, disconnectOBD, verifyOBDConnection, requestSupportedPIDs, requestData } = require('./bluetoothManager');
const { discoverDevices } = require('./discoverDevices');

const main = async () => {
  try {
    console.log('Discovering Bluetooth devices...');
    const devices = await discoverDevices();
    console.log('Devices found:', devices);

    // Filter devices for known OBD-II adapter name patterns or unnamed devices
    const obdDevice = devices.find(device => /OBD|OBDII|OBD2/i.test(device.name) || device.name === '(Unnamed Device)');

    if (!obdDevice) {
      console.log('No OBD-II adapter found.');
      return;
    }

    const { address } = obdDevice;
    const channel = 1; // Usually 1, but may need adjustment

    console.log(`Connecting to Bluetooth device at address ${address}, channel ${channel}...`);
    await connectToOBD(address, channel);
    console.log('Connected to Bluetooth device.');

    console.log('Verifying OBD-II connection...');
    try {
      await verifyOBDConnection();
      console.log('Verified OBD-II adapter.');

      // Request supported PIDs
      const supportedPIDs = await requestSupportedPIDs();
      console.log('Supported PIDs:', supportedPIDs);

      // Check if PID 0D is supported
      if (supportedPIDs.includes('0D')) {
        console.log('PID 0D is supported, requesting vehicle speed...');
        requestData('0D'); // PID for vehicle speed
      } else {
        console.log('PID 0D is not supported.');
      }
    } catch (verificationError) {
      console.log('Verification failed:', verificationError);
      disconnectOBD();
      return;
    }

    // Wait for some time to ensure data is received before disconnecting
    setTimeout(() => {
      disconnectOBD();
      console.log('Disconnected.');
    }, 15000); // Adjust the timeout as needed to ensure data reception

  } catch (error) {
    console.error('Error:', error);
  }
};

main();
