const { sendObdCommand } = require('../utils');

async function queryMode9SupportedPids(writeCharacteristic) {
    const response = await sendObdCommand(writeCharacteristic, '0900');
    const supportedPids = [];

    if (response) {
        const match = response.match(/49[0-9A-F]{2}([0-9A-F]{8})/);
        if (match) {
            const bytes = Buffer.from(match[1], 'hex');
            for (let j = 0; j < 4; j++) {
                const byte = bytes.readUInt8(j);
                for (let k = 0; k < 8; k++) {
                    if (byte & (1 << (7 - k))) {
                        supportedPids.push(`09${(j * 8 + k).toString(16).padStart(2, '0')}`);
                    }
                }
            }
        }
    }

    return supportedPids;
}

async function queryAndInterpretMode9Pids(writeCharacteristic, supportedPids) {
    const mode9Data = {};

    for (const pid of supportedPids) {
        const response = await sendObdCommand(writeCharacteristic, pid);
        if (response && !response.includes('NO DATA')) {
            mode9Data[pid] = response;
        }
    }

    return interpretMode9Results(mode9Data);
}

function interpretMode9Results(mode9Data) {
    const interpretedResults = [];

    for (const [pid, rawValue] of Object.entries(mode9Data)) {
        let description = '';
        let value = '';

        switch (pid) {
            case '0902':  // VIN Message Count in PID 01
                description = 'Vehicle Identification Number (VIN)';
                value = rawValue.slice(6).replace(/\s+/g, '');  // Extract VIN from the response
                break;
            case '0904':  // Calibration ID
                description = 'Calibration ID';
                value = rawValue.slice(6).trim();  // Extract Calibration ID from the response
                break;
            // Add other Mode 9 PIDs as needed
            default:
                description = `Unknown PID ${pid}`;
                value = rawValue.slice(6).trim();
        }

        interpretedResults.push({
            pid,
            description,
            value,
        });
    }

    return interpretedResults;
}

module.exports = {
    queryMode9SupportedPids,
    queryAndInterpretMode9Pids,
};
  