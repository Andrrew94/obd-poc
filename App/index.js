const { disconnectOBD, getSupportedPIDs, getSupportedPidValues, sendInitializationCommands } = require('./bluetoothManager');
const { discoverDevices, identifyOBDDevice } = require('./discoverDevices');
const fs = require('fs');
const readline = require('readline');

// Function to prompt user and save JSON
const promptSaveToFile = (data) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Do you want to save the data to a JSON file? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
      rl.question('Enter the file name (no extension): ', (fileName) => {
        fs.writeFile(`${fileName}.json`, JSON.stringify(data, null, 2), (err) => {
          if (err) {
            console.error('Error saving file:', err);
          } else {
            console.log('File saved successfully!');
          }
          rl.close();
        });
      });
    } else {
      console.log('Data not saved.');
      rl.close();
    }
  });
};

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
      await sendInitializationCommands(serial);
      console.log('Initialization commands sent.');

      const supportedPIDs = await getSupportedPIDs(serial);
      console.log('Supported PIDs:', supportedPIDs);

      const allPIDValues = await getSupportedPidValues(serial, supportedPIDs);
      console.log(JSON.stringify(allPIDValues, null, 2));
      promptSaveToFile(allPIDValues);
    } catch (error) {
      console.error('Error while getting PID values:', error.message);
    } finally {
      disconnectOBD(serial);
      console.log('Serial connection closed.');
    }

    serial.on('error', (err) => {
      console.error('Serial connection error:', err);
    });

    serial.on('close', () => {
      console.log('Serial connection closed.');
    });

  } catch (error) {
    console.error('Error:', error);
  }
};

main();
