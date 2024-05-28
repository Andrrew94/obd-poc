const noble = require('@abandonware/noble');
const readline = require('readline');
const fs = require('fs');
const { stringify } = require('flatted');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let responseBuffer = '';
let waitingForResponse = false;

function promptUser(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

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

        const adaptorName = await promptUser('Insert adaptor name so I can group the logs separately: ');

        const adaptorDataPrompt = await promptUser('Do you want to save ADAPTOR DATA json? (yes/no): ');
          if (adaptorDataPrompt.toLowerCase() === 'yes') {
            fs.writeFile(`${adaptorName}-adaptor-data.json`, stringify(device, null, 2), (err) => {
              if (err) {
                console.error('Error saving file:', err);
              } else {
                console.log('Data saved successfully.');
              }
            });
          } else {
            console.log('Data not saved.');
          }

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

          const adaptorServicesPrompt = await promptUser('Do you want to save ADAPTOR SERVICES json data? (yes/no): ');
          if (adaptorServicesPrompt.toLowerCase() === 'yes') {
            fs.writeFile(`${adaptorName}-adaptor-services.json`, stringify(services, null, 2), (err) => {
              if (err) {
                console.error('Error saving file:', err);
              } else {
                console.log('Data saved successfully.');
              }
            });
          } else {
            console.log('Data not saved.');
          }

          const adaptorCharacteristicsPrompt = await promptUser('Do you want to save ADAPTOR CHARACTERISTICS json data? (yes/no): ');
          if (adaptorCharacteristicsPrompt.toLowerCase() === 'yes') {
            fs.writeFile(`${adaptorName}-adaptor-characteristics.json`, stringify(characteristics, null, 2), (err) => {
              if (err) {
                console.error('Error saving file:', err);
              } else {
                console.log('Data saved successfully.');
              }
            });
          } else {
            console.log('Data not saved.');
          }

          await subscribeToNotifications(notifyCharacteristic);

          // Initialize OBD-II Adapter
          await initializeObdAdapter(writeCharacteristic);

          // Scan for supported PIDs
          const supportedPids = await scanForSupportedPids(writeCharacteristic, adaptorName);

          const supportedPidsPrompt = await promptUser('Do you want to save SUPPORTED PIDS json data? (yes/no): ');
          if (supportedPidsPrompt.toLowerCase() === 'yes') {
            fs.writeFile(`${adaptorName}-supportedPids.json`, stringify(supportedPids, null, 2), (err) => {
              if (err) {
                console.error('Error saving file:', err);
              } else {
                console.log('Data saved successfully.');
              }
            });
          } else {
            console.log('Data not saved.');
          }

          // Query each supported PID
          const data = await querySupportedPids(writeCharacteristic, supportedPids);

          const supportedPIDsResponsesPrompt = await promptUser('Do you want to save QUERIED SUPPORTED PIDS RESPONSES json data? (yes/no): ');
          if (supportedPIDsResponsesPrompt.toLowerCase() === 'yes') {
            fs.writeFile(`${adaptorName}-supportedPidsResponses.json`, stringify(data, null, 2), (err) => {
              if (err) {
                console.error('Error saving file:', err);
              } else {
                console.log('Data saved successfully.');
              }
            });
          } else {
            console.log('Data not saved.');
          }

          rl.close();
          process.exit(0);

          // console.log('OBD Data:', JSON.stringify(data, null, 2));

          // const save = await promptUser('Do you want to save this data? (yes/no): ');
          // if (save.toLowerCase() === 'yes') {
          //   const filename = await promptUser('Enter a name for the file (without extension): ');
          //   fs.writeFile(`${filename}.json`, JSON.stringify(data, null, 2), (err) => {
          //     if (err) {
          //       console.error('Error saving file:', err);
          //     } else {
          //       console.log('Data saved successfully.');
          //     }
          //     rl.close();
          //     process.exit(0);
          //   });
          // } else {
          //   console.log('Data not saved.');
          //   rl.close();
          //   process.exit(0);
          // }
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

async function scanForSupportedPids(writeCharacteristic, adaptorName) {
  const supportedPids = [];
  const responsesToLog = [];
  for (let i = 0; i <= 0x60; i += 0x20) {
    const pid = `0100`;
    const response = await sendObdCommand(writeCharacteristic, pid);
    if (response) {
      // todo: remove this after debug
      responsesToLog.push(response);

      const match = response.match(/4100([0-9A-F]{8})/);
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

  // todo: remove this after debug
  const responsesToLogPrompt = await promptUser('Do you want to save scanForSupportedPids-sendObdCommand-function-result json data? (yes/no): ');
  if (responsesToLogPrompt.toLowerCase() === 'yes') {
    fs.writeFile(`${adaptorName}-scanForSupportedPids-sendObdCommand-function-result.json`, stringify(data, null, 2), (err) => {
      if (err) {
        console.error('Error saving file:', err);
      } else {
        console.log('Data saved successfully.');
      }
    });
  } else {
    console.log('Data not saved.');
  }


  return supportedPids;
}

async function querySupportedPids(writeCharacteristic, pids) {
  const data = {};
  for (const pid of pids) {
    const response = await sendObdCommand(writeCharacteristic, pid);
    if (response && !response.includes('NO DATA')) {
      data[pid] = response;
    }
  }
  return data;
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

// Start the process
connectToObd();
