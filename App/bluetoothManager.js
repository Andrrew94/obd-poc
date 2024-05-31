// bluetoothManager.js
// const bluetooth = require('bluetooth-serial-port');
// const SerialPort = bluetooth.BluetoothSerialPort;

// const serial = new SerialPort();
// let isConnected = false;
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

const requestSupportedPIDs = (serialConnection) => {
  return new Promise((resolve, reject) => {
    if (!serialConnection) {
      return reject('Not connected to any OBD-II adapter');
    }

    // Clear any previous listeners
    serialConnection.removeAllListeners('data');

    // Send an OBD-II command to request supported PIDs (PID 0100)
    const command = Buffer.from('0100\r', 'utf8');
    serialConnection.write(command, (err, bytesWritten) => {
      if (err) {
        return reject(err);
      }
      console.log(`Sent ${bytesWritten} bytes to request supported PIDs`);

      buffer = '';
      currentDataHandler = (data) => {
        buffer += data.toString('utf8');
        const responses = buffer.split('\r');
        buffer = responses.pop(); // Keep incomplete response in buffer

        for (let response of responses) {
          response = response.trim();
          console.log('Received data:', response);

          // Check if the response contains the supported PIDs
          if (response.startsWith('41 00')) {
            resolve(response);
            return;  // Exit after processing valid response
          }
        }
        // If no valid response was found in the loop, reject
        reject('Invalid response for supported PIDs');
      };

      serialConnection.on('data', currentDataHandler);
    });
  });
};

const requestData = (pid, serialConnection) => {
  if (serialConnection) {
    const command = Buffer.from(`01${pid}\r`, 'utf8');
    serialConnection.write(command, (err, bytesWritten) => {
      if (err) {
        console.log('Error sending command:', err);
      } else {
        console.log(`Sent ${bytesWritten} bytes to request data for PID ${pid}`);
      }
    });

    buffer = '';
    currentDataHandler = (data) => {
      buffer += data.toString('utf8');
      const responses = buffer.split('\r');
      buffer = responses.pop(); // Keep incomplete response in buffer

      for (let response of responses) {
        response = response.trim();
        console.log('Received data:', response);

        // Here you can add more sophisticated parsing and handling of the response
        // Example: parsing the vehicle speed from the response
        if (response.startsWith('41 0D')) {
          const speedHex = response.split(' ')[2];
          const speed = parseInt(speedHex, 16);
          console.log(`Vehicle Speed: ${speed} km/h`);
        }
      }
    };

    serialConnection.on('data', currentDataHandler);
  } else {
    console.log('Not connected to OBD-II adapter');
  }
};

module.exports = {
  // connectToOBD,
  disconnectOBD,
  // verifyOBDConnection,
  requestSupportedPIDs,
  requestData,
};
