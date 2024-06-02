const { disconnectOBD, getSupportedPIDs, getSupportedPidValues } = require('./bluetoothManager');
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


    serial.on('open', async () => {
      try {
        const supportedPIDs = await getSupportedPIDs(serial);
        console.log('Supported PIDs:', supportedPIDs);

        const allPIDValues = await getSupportedPidValues(serial);
        console.log(JSON.stringify(allPIDValues, null, 2));
        promptSaveToFile(allPIDValues);
      } catch (error) {
        console.error(error.message);
      } finally {
        serial.close();
      }
    })

  //   try {
  //     // Request supported PIDs
  //     const supportedPIDs = await getSupportedPIDs(serial);
  //     console.log('Supported PIDs:', supportedPIDs);

  //     const allPIDValues = await getSupportedPidValues(serial);
  //     console.log(JSON.stringify(allPIDValues, null, 2));

  //     promptSaveToFile(allPIDValues);

  //     // Check if PID 0D is supported
  //     // if (supportedPIDs.includes('0D')) {
  //     //   console.log('PID 0D is supported, requesting vehicle speed...');
  //     //   requestData('0D', serial); // PID for vehicle speed
  //     // } else {
  //     //   console.log('PID 0D is not supported.');
  //     // }
  //   } catch (verificationError) {
  //     console.log('Verification failed:', verificationError);
  //     disconnectOBD(serial);
  //     return;
  //   }

  //   // Wait for some time to ensure data is received before disconnecting
  //   setTimeout(() => {
  //     disconnectOBD(serial);
  //     console.log('Disconnected.');
  //   }, 15000); // Adjust the timeout as needed to ensure data reception

  } catch (error) {
    console.error('Error:', error);
  }
};


// TODO: identify how to dynamically set BAUD RATE for faster connection
// TODO: do we run the OBD2 INITIALIZATION COMMANDS? 
// (After establishing the connection, you may need to send initialization commands. Common initialization commands for OBD-II adapters include setting the protocol and ensuring the adapter is in a proper state to communicate.)
// const commands = [
//   { command: 'ATZ', response: 'OK' }, // Reset
//   { command: 'ATE0', response: 'OK' }, // Echo off
//   { command: 'ATSP0', response: 'OK' }, // Set protocol to automatic
//   { command: '0100', response: '41 00' } // Check device status
// ];


main();
