import xlsx from 'xlsx';

const workbook = xlsx.readFile('../Rice Varities.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log(JSON.stringify(data, null, 2));
