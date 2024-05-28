const fs = require('fs');
const { parse } = require('flatted');

// Reading and parsing the file
fs.readFile('black-supportedPidsResponses.json', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
  } else {
    const parsedObject = parse(data);
    console.log('Parsed Object:', parsedObject);
  }
});