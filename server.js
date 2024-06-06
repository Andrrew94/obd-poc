const noble = require('@abandonware/noble');
const readline = require('readline');
const fs = require('fs');
const { interpretPidValues, querySupportedPids, scanForSupportedPids } = require('./Modes/mode-1-handler');
const { queryMode3, interpretMode3Results } = require('./Modes/mode-3-handler');
const { queryMode9SupportedPids, queryAndInterpretMode9Pids } = require('./Modes/mode-9-handler');
const { sendObdCommand } = require('./utils');

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

// Start the process
connectToObd();
