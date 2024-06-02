const { MODE_1_PIDS } = require('./Modes/mode-1-pids');

const disconnectOBD = (serialConnection) => {
  if (serialConnection.isOpen()) {
    serialConnection.close(() => {
      console.log('Disconnected from OBD-II adapter');
    });
  }
};

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
                Description: MODE_1_PIDS[pid].Description,
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

module.exports = {
  disconnectOBD,
  getSupportedPidValues,
  getSupportedPIDs,
};
