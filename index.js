const noble = require('@abandonware/noble');
const readline = require('readline');
const fs = require('fs');
const { MODE_1_PIDS } = require('./Pids/mode-1-pids');

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

          // Prompt for mode selection and proceed accordingly
          promptForModeSelection(writeCharacteristic);
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

function promptSaveJson(data, mode) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(`Do you want to save the ${mode} values to a JSON file? (yes/no) `, (answer) => {
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

function promptForModeSelection(writeCharacteristic) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enter the mode you want to query (1, 3, or 9): ', async (mode) => {
    rl.close();
    if (mode === '1') {
      console.log('Mode 1 selected. Scanning for supported PIDs...');
      const { supportedPids, allPidResponses } = await scanForSupportedPids(writeCharacteristic);
      console.log('Supported Mode 1 PIDs:', supportedPids);
      console.log('All Mode 1 PID responses:', allPidResponses);

      const filteredSupportedPids = supportedPids.filter(pid => !['0100', '0120', '0140', '0160'].includes(pid));
      const pidValues = await querySupportedPids(writeCharacteristic, filteredSupportedPids);
      console.log('Mode 1 PID Values:', pidValues);

      const interpretedValues = interpretPidValues(pidValues);
      console.log('Interpreted Mode 1 PID Values:', interpretedValues);

      promptSaveJson(interpretedValues, 'mode 1');
    } else if (mode === '3') {
      console.log('Mode 3 selected. Querying Mode 3...');
      const mode3Data = await queryMode3(writeCharacteristic);
      console.log('Mode 3 Data:', mode3Data);

      const interpretedResults = interpretMode3Results(mode3Data);
      console.log('Interpreted Mode 3 Results:', interpretedResults);

      promptSaveJson(interpretedResults, 'mode 3');
    } else if (mode === '9') {
      console.log('Mode 9 selected. Querying Mode 9 Supported PIDs...');
      const supportedMode9Pids = await queryMode9SupportedPids(writeCharacteristic);
      console.log('Supported Mode 9 PIDs:', supportedMode9Pids);
  
      const interpretedResults = await queryAndInterpretMode9Pids(writeCharacteristic, supportedMode9Pids);
      console.log('Interpreted Mode 9 Results:', interpretedResults);
  
      promptSaveJson(interpretedResults, 'mode 9');
    } else {
      console.log('Invalid mode. Please enter 1, 3, or 9.');
    }
  });
}

// Mode 1 Handler Functions
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
    if (response && !response.includes('NODATA')) {
      pidValues[pid] = response;
    }
  }
  return pidValues;
}

function interpretPidValues(pidValues) {
  const interpretedValues = [];

  for (const [pid, rawValue] of Object.entries(pidValues)) {
    if (rawValue.includes('NODATA')) {
      console.log(`PID: ${pid}, Raw Value: ${rawValue} (No Data)`);
      interpretedValues.push({
        pid: pid,
        description: MODE_1_PIDS[pid.slice(2).toUpperCase()].Description,
        unit: MODE_1_PIDS[pid.slice(2).toUpperCase()].Unit,
        value: null
      });
      continue;
    }

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

// Mode 3 Handler Functions
async function queryMode3(writeCharacteristic) {
  const response = await sendObdCommand(writeCharacteristic, '03');
  console.log('raw response mode 3 req', response);
  return response.split('\r').filter(line => line.startsWith('43'));
}

function interpretMode3Results(mode3Data) {
  const interpretedResults = [];

  for (const rawCode of mode3Data) {
    // Example rawCode format: "43 01 02 03 04"
    const code = rawCode.replace(/\s/g, '').slice(2); // Remove the '43' prefix and spaces
    const dtcCodes = [];

    for (let i = 0; i < code.length; i += 4) {
      const dtc = code.slice(i, i + 4);

      let dtcString = '';
      switch (dtc[0]) {
        case '0': case '1': case '2': case '3':
          dtcString = 'P' + dtc;
          break;
        case '4': case '5': case '6': case '7':
          dtcString = 'C' + dtc;
          break;
        case '8': case '9': case 'A': case 'B':
          dtcString = 'B' + dtc;
          break;
        case 'C': case 'D': case 'E': case 'F':
          dtcString = 'U' + dtc;
          break;
      }

      dtcCodes.push(dtcString);
    }

    interpretedResults.push(...dtcCodes);
  }

  return interpretedResults;
}

// Mode 9 Handler Functions
async function queryMode9SupportedPids(writeCharacteristic) {
  const response = await sendObdCommand(writeCharacteristic, '0900');
  const supportedPids = [];

  if (response) {
    const match = response.match(/49[0-9A-F]{2}([0-9A-F]{8})/);
    if (match) {
      const bytes = Buffer.from(match[1], 'hex');
      for (let j = 0; j < 4; j++) {
        const byte = bytes.readUInt8(j);
        for (let k = 0; k < 8; k++) {
          if (byte & (1 << (7 - k))) {
            supportedPids.push(`09${(j * 8 + k).toString(16).padStart(2, '0')}`);
          }
        }
      }
    }
  }

  return supportedPids;
}

async function queryAndInterpretMode9Pids(writeCharacteristic, supportedPids) {
  const mode9Data = {};

  for (const pid of supportedPids) {
    const response = await sendObdCommand(writeCharacteristic, pid);
    console.log(`raw response mode 9 for pid: ${pid}`, response);
    if (response && !response.includes('NODATA')) {
      mode9Data[pid] = response;
    }
  }

  return interpretMode9Results(mode9Data);
}

function interpretMode9Results(mode9Data) {
  const interpretedResults = [];

  for (const [pid, rawValue] of Object.entries(mode9Data)) {
    let description = '';
    let value = '';

    switch (pid) {
      case '0902':  // VIN Message Count in PID 01
        description = 'Vehicle Identification Number (VIN)';
        value = rawValue.slice(6).replace(/\s+/g, '');  // Extract VIN from the response
        break;
      case '0904':  // Calibration ID
        description = 'Calibration ID';
        value = rawValue.slice(6).trim();  // Extract Calibration ID from the response
        break;
      // Add other Mode 9 PIDs as needed
      default:
        description = `Unknown PID ${pid}`;
        value = rawValue.slice(6).trim();
    }

    interpretedResults.push({
      pid,
      description,
      value,
    });
  }

  return interpretedResults;
}

// Start the process
connectToObd();
