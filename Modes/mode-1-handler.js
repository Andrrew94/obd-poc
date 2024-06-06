const { MODE_1_PIDS } = require('../Pids/mode-1-pids');
const { sendObdCommand } = require('../server');

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
                    for (let k = 0; k < 8; k++) {
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
        if (response && !response.includes('NO DATA')) {
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

module.exports = {
    interpretPidValues,
    querySupportedPids,
    scanForSupportedPids,
};