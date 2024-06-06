const { sendObdCommand } = require('../server');

async function queryMode3(writeCharacteristic) {
    const response = await sendObdCommand(writeCharacteristic, '03');
    return response.split('\r').filter(line => line.startsWith('43'));
}

function interpretMode3Results(mode3Data) {
    const interpretedResults = [];
  
    for (const rawCode of mode3Data) {
        // Example rawCode format: "43 01 02 03 04"
        const code = rawCode.replace(/\s/g, '').slice(2); // Remove the '43' prefix and spaces
        const dtcCodes = [];
  
        for (let i = 0; i < code.length; i += 4) {
            const dtc = code.slice(i, i + 4);
  
            let dtcString = '';
            switch (dtc[0]) {
                case '0': case '1': case '2': case '3':
                    dtcString = 'P' + dtc;
                    break;
                case '4': case '5': case '6': case '7':
                    dtcString = 'C' + dtc;
                    break;
                case '8': case '9': case 'A': case 'B':
                    dtcString = 'B' + dtc;
                    break;
                case 'C': case 'D': case 'E': case 'F':
                    dtcString = 'U' + dtc;
                    break;
            }
  
            dtcCodes.push(dtcString);
        }
  
        interpretedResults.push(...dtcCodes);
    }
  
    return interpretedResults;
}

module.exports = {
    queryMode3,
    interpretMode3Results,
};