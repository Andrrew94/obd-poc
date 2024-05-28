// function decodePid(pid, response) {
//     switch (pid) {
//       case '0100':
//       case '0120':
//         return decodeSupportedPids(response);
//       case '0101':
//         return decodeMonitorStatus(response);
//       case '010c':
//         return decodeEngineRpm(response);
//       case '010d':
//         return decodeVehicleSpeed(response);
//       case '0105':
//         return decodeEngineCoolantTemp(response);
//       // Add more PID decoding cases as needed
//       default:
//         return `Unknown or unsupported PID: ${pid}`;
//     }
//   }
  
//   function decodeSupportedPids(response) {
//     const hex = response.slice(4, 12); // Example: 'FE3FA813'
//     return `Supported PIDs: ${hex}`;
//   }
  
//   function decodeMonitorStatus(response) {
//     const hex = response.slice(4, 12);
//     return `Monitor Status: ${hex}`;
//   }
  
//   function decodeEngineRpm(response) {
//     const A = parseInt(response.slice(4, 6), 16);
//     const B = parseInt(response.slice(6, 8), 16);
//     const rpm = ((A * 256) + B) / 4;
//     return `Engine RPM: ${rpm}`;
//   }
  
//   function decodeVehicleSpeed(response) {
//     const speed = parseInt(response.slice(4, 6), 16);
//     return `Vehicle Speed: ${speed} km/h`;
//   }
  
//   function decodeEngineCoolantTemp(response) {
//     const temp = parseInt(response.slice(4, 6), 16) - 40;
//     return `Engine Coolant Temperature: ${temp}°C`;
//   }
  
  // function decodeAllPids(data) {
  //   const decodedData = {};
  //   for (const [pid, response] of Object.entries(data)) {
  //     if (!response.includes('NO DATA')) {
  //       decodedData[pid] = decodePid(pid, response);
  //     }
  //   }
  //   return decodedData;
  // }

  // Function to parse the OBD-II scanner response
function parseOBDResponse(responseData) {
  const parsedData = {};

  for (let pid in responseData) {
      // Remove trailing characters such as '>' or '\r'
      const response = responseData[pid].replace(/[>\r]/g, '');
      
      // Convert hexadecimal data to decimal
      const decimalData = parseInt(response, 16);

      // Parse the response according to the OBD-II standard
      let parsedValue;
      switch (pid) {
          case '0100':
              parsedValue = parseSupportedPIDs(decimalData);
              break;
          case '0101':
              parsedValue = parseMonitorStatus(decimalData);
              break;
          case '0102':
              parsedValue = parseFreezeDTC(decimalData);
              break;
          case '0103':
              parsedValue = parseFuelSystemStatus(decimalData);
              break;
          case '0104':
              parsedValue = parseCalculatedEngineLoad(decimalData);
              break;
          case '0105':
              parsedValue = parseEngineCoolantTemp(decimalData);
              break;
          case '0106':
              parsedValue = parseShortTermFuelTrimBank1(decimalData);
              break;
          case '010a':
              parsedValue = parseFuelPressure(decimalData);
              break;
          case '010b':
              parsedValue = parseIntakeManifoldPressure(decimalData);
              break;
          case '010c':
              parsedValue = parseEngineRPM(decimalData);
              break;
          case '010d':
              parsedValue = parseVehicleSpeed(decimalData);
              break;
          case '010e':
              parsedValue = parseTimingAdvance(decimalData);
              break;
          case '010f':
              parsedValue = parseIntakeAirTemp(decimalData);
              break;
          case '0110':
              parsedValue = parseMAFAirFlowRate(decimalData);
              break;
          case '0112':
              parsedValue = parseThrottlePosition(decimalData);
              break;
          case '0114':
              parsedValue = parseOxygenSensor1Voltage(decimalData);
              break;
          case '011b':
              parsedValue = parseFuelRailPressure(decimalData);
              break;
          case '011e':
              parsedValue = parseCommandedEGR(decimalData);
              break;
          case '011f':
              parsedValue = parseEGRError(decimalData);
              break;
          case '0120':
              parsedValue = parseFuelLevel(decimalData);
              break;
          case '012e':
              parsedValue = parseFuelType(decimalData);
              break;
          case '012f':
              parsedValue = parseFuelRailPressureManifoldVacuum(decimalData);
              break;
          case '0130':
              parsedValue = parseFuelRailGaugePressure(decimalData);
              break;
          case '0134':
              parsedValue = parseOxygenSensor1FuelAirEquivalenceRatioVoltage(decimalData);
              break;
          case '0140':
              parsedValue = parsePIDSupported(decimalData);
              break;
          case '0141':
              parsedValue = parseDistanceTraveledMIL(decimalData);
              break;
          // Add cases for other PIDs as needed
          default:
              parsedValue = 'Not parsed';
              break;
      }

      // Store parsed value in the result object
      parsedData[pid] = parsedValue;
  }

  return parsedData;
}
  
  // Example JSON data
  const data = {
    "0100": "4100FE3FA813",
    "0101": "41010007E100",
    "0102": "41020000",
    "0103": "41030200",
    // "0104": "41043F>",
    "0105": "410580",
    "0106": "410681",
    "010b": "410B20",
    "010c": "410C089B",
    "010d": "410D00",
    "010e": "410E90",
    "010f": "410F51",
    "0110": "41100097",
    "011f": "411F05C3",
    "0120": "41208007B011",
    "0121": "41210000",
    "012e": "412E3C",
    "012f": "412F63",
    "0130": "4130FF",
    "0134": "4134819A800C",
    "0140": "4140FAD08C81",
    "0141": "41410007E1A1",
    "0142": "4142378E",
    "0143": "41430024",
    "0144": "4144820F",
    "0145": "41450E",
    "014a": "414A14",
    "014c": "414C11",
    "0160": "416001000000",
  };

  const response = parseOBDResponse(data);
  
  // const decodedData = decodeAllPids(data);
  // const x = decodedData.forEach(item => decodePid(item));
  console.log(response);
  