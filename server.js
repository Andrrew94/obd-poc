const noble = require('@abandonware/noble');

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
          const supportedPids = await scanForSupportedPids(writeCharacteristic, adaptorName);

          // Query each supported PID
          // const data = await querySupportedPids(writeCharacteristic, supportedPids);

          console.log('supportedPids', supportedPids);

          process.exit(0);
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
  const responsesToLog = [];
  for (let i = 0; i <= 0x60; i += 0x20) {
    const pid = `01${i.toString(16).padStart(2, '0')}`;
    const response = await sendObdCommand(writeCharacteristic, pid);
    if (response) {
      // todo: remove this after debug
      responsesToLog.push(response);

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

  return supportedPids;
}


// async function querySupportedPids(writeCharacteristic, pids) {
//   const data = {};
//   for (const pid of pids) {
//     const response = await sendObdCommand(writeCharacteristic, pid);
//     if (response && !response.includes('NO DATA')) {
//       data[pid] = response;
//     }
//   }
//   return data;
// }

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