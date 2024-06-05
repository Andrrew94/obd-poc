const noble = require('@abandonware/noble');
const readline = require('readline');
const fs = require('fs');
const { MODE_1_PIDS } = require('./Modes/mode-1-pids')

let responseBuffer = '';
let waitingForResponse = false;

async function connectToObd() {
  noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
      console.log('Bluetooth is powered on. Starting scan...');
      noble.startScanning();
    } else {
      console.log('Bluetooth is powered off. Stopping scan...');
      noble.stopScanning();
    }
  });

  noble.on('discover', (device) => {
    console.log(`Discovered device: ${device.advertisement.localName} (${device.id})`);
    if (device.advertisement.localName && device.advertisement.localName.includes('OBD')) {
      noble.stopScanning();

      device.connect(async (error) => {
        if (error) {
          console.error('Error connecting to device:', error);
          return;
        }
        console.log('Connected to', device.advertisement.localName);

        device.discoverAllServicesAndCharacteristics(async (error, services, characteristics) => {
          if (error) {
            console.error('Error discovering services and characteristics:', error);
            return;
          }

          let writeCharacteristic = null;
          let notifyCharacteristic = null;

          characteristics.forEach((characteristic) => {
            if (characteristic.properties.includes('writeWithoutResponse') || characteristic.properties.includes('write')) {
              writeCharacteristic = characteristic;
            }
            if (characteristic.properties.includes('notify')) {
              notifyCharacteristic = characteristic;
            }
          });

          if (!writeCharacteristic || !notifyCharacteristic) {
            console.error('OBD characteristics not found');
            return;
          }

          await subscribeToNotifications(notifyCharacteristic);

          // Initialize OBD-II Adapter
          await initializeObdAdapter(writeCharacteristic);

          // Scan for supported PIDs
          const { supportedPids, allPidResponses } = await scanForSupportedPids(writeCharacteristic);

          // Print the supported PIDs and the full list of PID responses
          console.log('Supported PIDs:', supportedPids);
          console.log('All PID responses:', allPidResponses);

          // Filter out the mode 01 PID identifiers
          const filteredSupportedPids = supportedPids.filter(pid => !['0100', '0120', '0140', '0160'].includes(pid));

          // Query each supported PID
          const pidValues = await querySupportedPids(writeCharacteristic, filteredSupportedPids);
          console.log('PID Values:', pidValues);

          // Interpret PID values
          const interpretedValues = interpretPidValues(pidValues);
          console.log('Interpreted PID Values:', interpretedValues);

          // Prompt to save the interpreted PID values to a JSON file
          promptSaveJson(interpretedValues);
        });
      });

      device.on('disconnect', () => {
        console.log('Device disconnected.');
        process.exit(0);
      });
    }
  });
}

async function subscribeToNotifications(notifyCharacteristic) {
  return new Promise((resolve, reject) => {
    notifyCharacteristic.subscribe((error) => {
      if (error) {
        reject('Error subscribing to notifications:', error);
      } else {
        console.log('Subscribed to notifications.');
        notifyCharacteristic.on('data', (data) => {
          const response = data.toString('utf-8').trim();
          console.log(`Received notification: ${response}`);
          responseBuffer += response;
          if (response.endsWith('>')) {
            waitingForResponse = false;
          }
        });
        resolve();
      }
    });
  });
}

async function initializeObdAdapter(writeCharacteristic) {
  const initCommands = [
    'ATZ',    // Reset the OBD-II adapter
    'ATE0',   // Turn off echo
    'ATL0',   // Turn off line feed
    'ATS0',   // Turn off spaces
    'ATH0',   // Turn off headers
    'ATSP0',  // Set protocol to auto
  ];

  for (const command of initCommands) {
    await sendObdCommand(writeCharacteristic, command);
  }
}

async function scanForSupportedPids(writeCharacteristic) {
  const supportedPids = [];
  const allPidResponses = [];
  for (let i = 0; i <= 0x60; i += 0x20) {
    const pid = `01${i.toString(16).padStart(2, '0')}`;
    const response = await sendObdCommand(writeCharacteristic, pid);
    if (response) {
      allPidResponses.push({ pid, response });

      const match = response.match(/41[0-9A-F]{2}([0-9A-F]{8})/);
      if (match) {
        const bytes = Buffer.from(match[1], 'hex');
        for (let j = 0; j < 4; j++) {
          const byte = bytes.readUInt8(j);
          for (let k = 0;  k < 8; k++) {
            if (byte & (1 << (7 - k))) {
              supportedPids.push(`01${(i + j * 8 + k).toString(16).padStart(2, '0')}`);
            }
          }
        }
      } else {
        console.error(`Unexpected response for PID ${pid}: ${response}`);
      }
    }
  }

  return { supportedPids, allPidResponses };
}

async function querySupportedPids(writeCharacteristic, pids) {
  const pidValues = {};
  for (const pid of pids) {
    const response = await sendObdCommand(writeCharacteristic, pid);
    if (response && !response.includes('NO DATA')) {
      pidValues[pid] = response;
    }
  }
  return pidValues;
}

async function sendObdCommand(writeCharacteristic, command) {
  return new Promise((resolve, reject) => {
    const cmd = Buffer.from(`${command}\r`, 'utf-8');
    console.log(`Sending command: ${command}`);
    responseBuffer = '';  // Clear the buffer before sending the command
    waitingForResponse = true;

    writeCharacteristic.write(cmd, true, (error) => {
      if (error) {
        reject(error);
      } else {
        const timeout = setTimeout(() => {
          if (waitingForResponse) {
            waitingForResponse = false;
            console.error('Response timeout');
            resolve(responseBuffer);  // Resolve with whatever data was collected
          }
        }, 3000); // 3 seconds timeout for response

        const checkResponse = () => {
          if (!waitingForResponse) {
            clearTimeout(timeout);
            resolve(responseBuffer);
          } else {
            setTimeout(checkResponse, 100);  // Check again after 100ms
          }
        };
        checkResponse();
      }
    });
  });
}

function interpretPidValues(pidValues) {
  const interpretedValues = [];

  for (const [pid, rawValue] of Object.entries(pidValues)) {
    // Correctly clean the value by removing the '41' and PID part from the response
    const cleanedValue = rawValue.slice(4, rawValue.length - 1).trim(); // Removes the first 4 characters and the trailing '>'

    // Convert the cleaned value to a list of byte values
    const byteValues = [];
    for (let i = 0; i < cleanedValue.length; i += 2) {
      byteValues.push(parseInt(cleanedValue.slice(i, i + 2), 16));
    }

    // Debug: Log cleaned value and byte values
    console.log(`PID: ${pid}, Raw Value: ${rawValue}, Cleaned Value: ${cleanedValue}, Byte Values: ${byteValues.join(',')}`);

    // Find the PID info from MODE_1_PIDS
    const pidInfo = MODE_1_PIDS[pid.slice(2).toUpperCase()];
    if (pidInfo) {
      // Determine the number of arguments the formula requires
      const formula = pidInfo.Formula;
      const formulaArgs = formula.length;

      // Debug: Log formula arguments count and byte values used
      console.log(`PID: ${pid}, Formula Args: ${formulaArgs}, Bytes Used: ${byteValues.slice(0, formulaArgs).join(',')}`);

      // Call the formula with the appropriate number of arguments
      const value = formula.apply(null, byteValues.slice(0, formulaArgs));

      interpretedValues.push({
        pid: pid,
        description: pidInfo.Description,
        unit: pidInfo.Unit,
        value: value
      });
    } else {
      // Handle case where PID info is not found
      console.warn(`PID info not found for ${pid}`);
    }
  }

  return interpretedValues;
}

function promptSaveJson(data) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Do you want to save the PID values to a JSON file? (yes/no) ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
      rl.question('Enter the JSON file name: ', (filename) => {
        fs.writeFileSync(`${filename}.json`, JSON.stringify(data, null, 2));
        console.log(`PID values saved to ${filename}.json`);
        rl.close();
      });
    } else {
      rl.close();
    }
  });
}

// Start the process
connectToObd();
