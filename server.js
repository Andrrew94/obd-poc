const noble = require('@abandonware/noble');
const readline = require('readline');
const fs = require('fs');

// Commands
const initCommands = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', 'ATAT2', 'ATST0A'];
const supportedPidCommands = ['0100', '0120', '0140', '0160'];

let obdPeripheral;
let writeCharacteristic;
let readCharacteristic;

async function sendCommand(command) {
  return new Promise((resolve, reject) => {
    if (!writeCharacteristic || !readCharacteristic) return reject('Characteristics not found');
    const cmd = Buffer.from(`${command}\r`, 'utf8');
    console.log(`Sending command: ${command}`);
    writeCharacteristic.write(cmd, false, (error) => {
      if (error) return reject(error);
      setTimeout(() => {
        readCharacteristic.read((error, data) => {
          if (error) return reject(error);
          const response = data.toString('utf8').trim();
          console.log(`Raw response: ${response}`);
          resolve(response);
        });
      }, 500); // Adjust the delay if needed
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
        console.log('Available characteristics:', characteristics);

        writeCharacteristic = characteristics.find((c) => c.properties.includes('write'));
        readCharacteristic = characteristics.find((c) => c.properties.includes('read'));

        if (!writeCharacteristic || !readCharacteristic) {
          return reject('No suitable characteristics found');
        }

        console.log('Selected write characteristic:', writeCharacteristic);
        console.log('Selected read characteristic:', readCharacteristic);

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
