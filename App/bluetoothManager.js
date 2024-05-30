// bluetoothManager.js
const bluetooth = require('bluetooth-serial-port');
const OBDReader = require('obd-parser');
const SerialPort = bluetooth.BluetoothSerialPort;

const serial = new SerialPort();
let obdReader = null;

const connectToOBD = (address, channel) => {
  return new Promise((resolve, reject) => {
    serial.connect(address, channel, () => {
      console.log('Connected to Bluetooth device');
      obdReader = new OBDReader(serial);
      resolve();
    }, (err) => {
      reject(err);
    });
  });
};

const disconnectOBD = () => {
  if (serial.isOpen()) {
    serial.close(() => {
      console.log('Disconnected from OBD-II adapter');
    });
  }
};

const verifyOBDConnection = () => {
  return new Promise((resolve, reject) => {
    if (!obdReader) {
      return reject('OBD Reader not initialized');
    }

    obdReader.on('dataReceived', (data) => {
      if (data.name === 'rpm') {
        resolve(true); // Successfully received an OBD-II response
      } else {
        reject('Not an OBD-II adapter');
      }
    });

    obdReader.requestValueByName('rpm'); // Request engine RPM as a verification
  });
};

const requestData = (pid) => {
  if (obdReader) {
    obdReader.requestValueByName(pid);
  } else {
    console.log('Not connected to OBD-II adapter');
  }
};

module.exports = {
  connectToOBD,
  disconnectOBD,
  verifyOBDConnection,
  requestData,
};
