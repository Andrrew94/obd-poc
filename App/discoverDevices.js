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
    }, 15000); // Adjust timeout as needed
  });
};

const connectToDevice = (address) => {
  return new Promise((resolve, reject) => {
    const serial = new SerialPort();

    serial.findSerialPortChannel(address, (channel) => {
      serial.connect(address, channel, () => {
        console.log('Connected to device:', address);
        resolve({ channel, serial });
      }, (err) => {
        console.log('Cannot connect to device:', address);
        reject(err);
      });
    }, () => {
      console.log('No serial port channel found for device:', address);
      reject(new Error('No serial port channel found'));
    });
  });
};

const identifyOBDDevice = async (devices) => {
  for (let device of devices) {
    if (/OBD|OBDII|OBD2/i.test(device.name)) {
      try {
        const { channel, serial } = await connectToDevice(device.address);
        return { ...device, channel, serial };
      } catch (error) {
        console.error('Failed to connect to named OBD-II device:', error);
      }
    }
    if (device.name === '(Unnamed Device)') {
      try {
        const { channel, serial } = await connectToDevice(device.address);
        serial.write(Buffer.from('0100\r'), (err) => { // Standard OBD-II command
          if (err) {
            throw err;
          }
          serial.on('data', (buffer) => {
            const data = buffer.toString('utf8');
            console.log('Received data:', data);
            if (data.includes('41 00')) { // OBD-II response check
              resolve({ ...device, channel, serial });
            } else {
              serial.close();
            }
          });
        });
      } catch (error) {
        console.error('Failed to connect to unnamed device:', error);
      }
    }
  }
  throw new Error('No OBD-II device found');
};

module.exports = {
  discoverDevices,
  identifyOBDDevice,
};
