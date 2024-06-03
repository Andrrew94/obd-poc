const noble = require('noble');
const readline = require('readline');
const fs = require('fs');

  // // No echo
  // conn.write('ATE0');
  // // Remove linefeeds
  // conn.write('ATL0');
  // // This disables spaces in in output, which is faster!
  // conn.write('ATS0');
  // // Turns off headers and checksum to be sent.
  // conn.write('ATH0');
  // // Turn adaptive timing to 2. This is an aggressive learn curve for adjusting
  // // the timeout. Will make huge difference on slow systems.
  // conn.write('ATAT2');
  // // Set timeout to 10 * 4 = 40msec, allows +20 queries per second. This is
  // // the maximum wait-time. ATAT will decide if it should wait shorter or not.
  // conn.write('ATST0A');
  // // Use this to set protocol automatically, python-OBD uses "ATSPA8", but
  // // seems to have issues. Maybe this should be an option we can pass?
  // conn.write('ATSP0');

// Commands
const initCommands = [
  'ATZ',    // Reset the OBD-II adapter
  'ATE0',   // Turn off echo
  'ATL0',   // Turn off line feed
  'ATS0',   // Turn off spaces
  'ATH0',   // Turn off headers
  'ATSP0',  // Set protocol to auto
  'ATAT2',
  'ATST0A',
];
const supportedPidCommands = ['0100', '0120', '0140', '0160'];

let obdPeripheral;
let characteristic;

async function sendCommand(command) {
  return new Promise((resolve, reject) => {
    if (!characteristic) return reject('Characteristic not found');
    const cmd = Buffer.from(`${command}\r`, 'utf8');
    characteristic.write(cmd, false, (error) => {
      if (error) return reject(error);
      characteristic.once('data', (data) => resolve(data.toString('utf8')));
    });
  });
}

async function initializeObd() {
  for (const command of initCommands) {
    const response = await sendCommand(command);
    console.log(`Response to ${command}: ${response}`);
  }
}

async function getSupportedPids() {
  const supportedPids = [];
  for (const command of supportedPidCommands) {
    const response = await sendCommand(command);
    console.log(`Response to ${command}: ${response}`);
    supportedPids.push(response.trim());
  }
  return supportedPids;
}

async function getPidValues(supportedPids) {
  const pidValues = {};
  for (const pid of supportedPids) {
    const response = await sendCommand(pid);
    console.log(`Response to ${pid}: ${response}`);
    pidValues[pid] = response.trim();
  }
  return pidValues;
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

noble.on('stateChange', async (state) => {
  if (state === 'poweredOn') {
    console.log('Scanning for Bluetooth devices...');
    noble.startScanning();
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', async (peripheral) => {
  if (peripheral.advertisement.localName && /OBD/i.test(peripheral.advertisement.localName)) {
    console.log(`Found OBD device: ${peripheral.advertisement.localName}`);
    obdPeripheral = peripheral;
    noble.stopScanning();
    await connectToObd();
  }
});

async function connectToObd() {
  return new Promise((resolve, reject) => {
    obdPeripheral.connect(async (error) => {
      if (error) return reject(error);
      console.log('Connected to OBD device');
      obdPeripheral.discoverAllServicesAndCharacteristics(async (error, services, characteristics) => {
        if (error) return reject(error);
        characteristic = characteristics.find((c) => c.properties.includes('write') && c.properties.includes('notify'));
        characteristic.subscribe((error) => {
          if (error) return reject(error);
        });
        await initializeObd();
        const supportedPids = await getSupportedPids();
        const pidValues = await getPidValues(supportedPids);
        promptSaveJson(pidValues);
        resolve();
      });
    });
  });
}

process.on('uncaughtException', (error) => {
  console.error(`Error: ${error.message}`);
  if (obdPeripheral) obdPeripheral.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(`Unhandled Rejection: ${error.message}`);
  if (obdPeripheral) obdPeripheral.disconnect();
  process.exit(1);
});
