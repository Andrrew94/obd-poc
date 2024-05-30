// index.js
const { connectToOBD, disconnectOBD, verifyOBDConnection, requestData } = require('./bluetoothManager');
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

      // Request specific data (e.g., vehicle speed)
      requestData('vss');
    } catch (verificationError) {
      console.log('Verification failed:', verificationError);
      disconnectOBD();
    }

    // Disconnect after some time or based on some condition
    setTimeout(() => {
      disconnectOBD();
      console.log('Disconnected.');
    }, 10000); // Adjust the timeout as needed

  } catch (error) {
    console.error('Error:', error);
  }
};

main();
