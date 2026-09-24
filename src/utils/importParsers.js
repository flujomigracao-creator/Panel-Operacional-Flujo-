import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const toHeadersAndRows = (rows2d) => {
  const [headerRow, ...dataRows] = rows2d;
  const headers = (headerRow || []).map((h) => String(h ?? '').trim());
  const rows = dataRows
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => headers.reduce((acc, header, i) => {
      acc[header] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
      return acc;
    }, {}));
  return { headers, rows };
};

export const parseCsvText = (text) => {
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: true });
  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type !== 'FieldMismatch');
    if (fatal) throw new Error(`Error al leer el CSV: ${fatal.message}`);
  }
  return toHeadersAndRows(parsed.data);
};

export const parseCsvFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      resolve(parseCsvText(e.target.result));
    } catch (err) {
      reject(err);
    }
  };
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsText(file);
});

export const parseExcelFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      resolve(toHeadersAndRows(rows2d));
    } catch (_err) {
      reject(new Error('No se pudo leer el archivo de Excel. Verificá que sea un .xlsx/.xls válido.'));
    }
  };
  reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  reader.readAsArrayBuffer(file);
});

export const parseSpreadsheetFile = (file) => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsvFile(file);
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseExcelFile(file);
  return Promise.reject(new Error('Formato no soportado. Subí un archivo .csv, .xlsx o .xls.'));
};
