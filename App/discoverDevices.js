// discoverDevices.js
const bluetooth = require('bluetooth-serial-port');
const SerialPort = bluetooth.BluetoothSerialPort;
const serial = new SerialPort();

const discoverDevices = () => {
  return new Promise((resolve, reject) => {
    let devices = [];

    serial.on('found', (address, name) => {
      devices.push({ address, name: name || '(Unnamed Device)' });
    });

    serial.inquire();

    setTimeout(() => {
      if (devices.length > 0) {
        resolve(devices);
      } else {
        reject('No devices found');
      }
    }, 10000); // Adjust timeout as needed
  });
};

module.exports = {
  discoverDevices,
};
