// const bluetooth = require('bluetooth-serial-port');
// const SerialPort = bluetooth.BluetoothSerialPort;

// const serial = new SerialPort();
// let isConnected = false;
const log = require('node-gyp/lib/log');
const { MODE_1_PIDS } = require('./Modes/mode-1-pids');
let currentDataHandler = null;
let buffer = '';

const disconnectOBD = (serialConnection) => {
  if (serialConnection.isOpen()) {
    serialConnection.close(() => {
      console.log('Disconnected from OBD-II adapter');
      // isConnected = false;
    });
  }
};

// const verifyOBDConnection = () => {
//   return new Promise((resolve, reject) => {
//     if (!isConnected) {
//       return reject('Not connected to any OBD-II adapter');
//     }

//     // Clear any previous listeners
//     serial.removeAllListeners('data');

//     // Send an OBD-II command to request RPM (PID 010C)
//     const command = Buffer.from('010C\r', 'utf8');
//     serial.write(command, (err, bytesWritten) => {
//       if (err) {
//         return reject(err);
//       }
//       console.log(`Sent ${bytesWritten} bytes to request RPM`);

//       buffer = '';
//       currentDataHandler = (data) => {
//         buffer += data.toString('utf8');
//         const responses = buffer.split('\r');
//         buffer = responses.pop(); // Keep incomplete response in buffer

//         for (let response of responses) {
//           response = response.trim();
//           console.log('Received data:', response);

//           // Basic verification of OBD-II response
//           if (response.startsWith('41 0C')) {
//             const rpmHex = response.split(' ').slice(2).join('');
//             const rpm = parseInt(rpmHex, 16) / 4;
//             console.log(`RPM: ${rpm}`);
//             resolve(true);
//             return;  // Exit after processing valid response
//           } else if (response.startsWith('NO DATA')) {
//             reject('No data received');
//             return;
//           }
//         }
//         // If no valid response was found in the loop, reject
//         reject('Invalid OBD-II response');
//       };

//       serial.on('data', currentDataHandler);
//     });
//   });
// };

const getSupportedPIDs = (serial) => {
  return new Promise((resolve, reject) => {
    const supportedPIDs = [];

    const requestPIDs = (pid, callback) => {
      console.log('Requesting PID:', pid);
      serial.write(Buffer.from(`${pid}\r`), (err) => {
        if (err) {
          reject(err);
          return;
        }

        const onData = (buffer) => {
          const data = buffer.toString('utf8').trim();
          console.log('Data received:', data);
          if (data.startsWith('41')) {
            serial.off('data', onData);
            callback(data);
          } else {
            serial.off('data', onData);
            reject(new Error(`Unexpected response: ${data}`));
          }
        };

        serial.on('data', onData);
      });
    };

    const processPIDResponse = (response) => {
      const hexString = response.slice(6); // Remove '41 00 ' or similar prefix
      for (let i = 0; i < hexString.length; i += 2) {
        const byte = parseInt(hexString.substr(i, 2), 16);
        for (let j = 0; j < 8; j++) {
          if (byte & (1 << (7 - j))) {
            const pid = ((i / 2) * 8) + j + 1;
            supportedPIDs.push(pid.toString(16).padStart(2, '0'));
          }
        }
      }
    };

    const pidsToRequest = ['0100', '0120', '0140', '0160'];
    let currentRequestIndex = 0;

    const nextRequest = () => {
      if (currentRequestIndex >= pidsToRequest.length) {
        resolve(supportedPIDs);
        return;
      }

      const currentPID = pidsToRequest[currentRequestIndex];
      requestPIDs(currentPID, (response) => {
        processPIDResponse(response);
        currentRequestIndex++;
        nextRequest();
      });
    };

    nextRequest();
  });
};
// Utility function to interpret PID values
const interpretPID = (pid, response) => {
  const pidInfo = MODE_1_PIDS[pid];

  if (!pidInfo || typeof pidInfo.Formula !== 'function') {
    throw new Error(`No formula defined for PID ${pid}`);
  }

  // determining the number of parameters the PID formula needs, formula defined in the MODE_1_PIDS
  const formulaFunction = pidInfo.Formula;
  const numArgs = formulaFunction.length;
  const args = [];

  for (let i = 0; i < numArgs; i++) {
    args.push(response[i]);
  }

  return formulaFunction(...args);
};

// array of promises to request all supported pids values
const getSupportedPidValues = async (serial, supportedPIDs) => {
  const pidValues = [];

  for (const pid of supportedPIDs) {
    await new Promise((resolve, reject) => {
      serial.write(Buffer.from(`${pid}\r`), (err) => {
        if (err) {
          reject(err);
          return;
        }

        const onData = (buffer) => {
          const data = buffer.toString('utf8').trim();
          if (data.startsWith('41')) {
            serial.off('data', onData);
            const responseBytes = data.slice(3).match(/.{1,2}/g).map(byte => parseInt(byte, 16));
            try {
              const interpretedValue = interpretPID(pid, responseBytes);
              pidValues.push({
                PID: pid,
                Description: pids[pid].Description,
                Value: interpretedValue
              });
              resolve();
            } catch (error) {
              reject(error);
            }
          } else {
            serial.off('data', onData);
            reject(new Error(`Unexpected response: ${data}`));
          }
        };

        serial.on('data', onData);
      });
    });
  }

  return pidValues;
};

// const requestData = (pid, serialConnection) => {
//   if (serialConnection) {
//     const command = Buffer.from(`01${pid}\r`, 'utf8');
//     serialConnection.write(command, (err, bytesWritten) => {
//       if (err) {
//         console.log('Error sending command:', err);
//       } else {
//         console.log(`Sent ${bytesWritten} bytes to request data for PID ${pid}`);
//       }
//     });

//     buffer = '';
//     currentDataHandler = (data) => {
//       buffer += data.toString('utf8');
//       const responses = buffer.split('\r');
//       buffer = responses.pop(); // Keep incomplete response in buffer

//       for (let response of responses) {
//         response = response.trim();
//         console.log('Received data:', response);

//         // Here you can add more sophisticated parsing and handling of the response
//         // Example: parsing the vehicle speed from the response
//         if (response.startsWith('41 0D')) {
//           const speedHex = response.split(' ')[2];
//           const speed = parseInt(speedHex, 16);
//           console.log(`Vehicle Speed: ${speed} km/h`);
//         }
//       }
//     };

//     serialConnection.on('data', currentDataHandler);
//   } else {
//     console.log('Not connected to OBD-II adapter');
//   }
// };

module.exports = {
  // connectToOBD,
  disconnectOBD,
  getSupportedPidValues,
  // verifyOBDConnection,
  getSupportedPIDs,
  // requestData,
};
