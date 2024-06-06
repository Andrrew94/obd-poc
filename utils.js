let responseBuffer = '';
let waitingForResponse = false;

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

module.exports = {
  sendObdCommand,
};
