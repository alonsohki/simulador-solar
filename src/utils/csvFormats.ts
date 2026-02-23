/**
 * CSV format definitions for consumption data import.
 *
 * To add a new format, add an entry to CSV_FORMATS with:
 *   - id/name: identifiers for display and error messages
 *   - delimiter: column separator character
 *   - decimalSeparator: ',' (Spanish) or '.' (international)
 *   - dateFormat: how dates are written in the CSV
 *   - hourConvention: '1-24' (Spanish: hora 1 = 00:00-01:00) or '0-23'
 *   - columnMap: mapping from CSV column header -> canonical system column
 *
 * Canonical columns: 'date' | 'hour' | 'kwh'
 * Any CSV columns not listed in columnMap are silently ignored.
 */

export type CanonicalColumn = 'date' | 'hour' | 'kwh';

export interface CSVFormat {
  id: string;
  name: string;
  delimiter: string;
  decimalSeparator: ',' | '.';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  hourConvention: '1-24' | '0-23';
  columnMap: Record<string, CanonicalColumn>;
}

export const CSV_FORMATS: CSVFormat[] = [
  {
    id: 'ide',
    name: 'I-DE (Iberdrola Distribución)',
    delimiter: ';',
    decimalSeparator: ',',
    dateFormat: 'DD/MM/YYYY',
    hourConvention: '1-24',
    columnMap: {
      'Fecha': 'date',
      'Hora': 'hour',
      'Consumo_kWh': 'kwh',
    },
  },
];

/** Detect which format matches the CSV header line. Returns null if none match. */
export function detectFormat(headerLine: string): CSVFormat | null {
  for (const format of CSV_FORMATS) {
    const cols = headerLine.split(format.delimiter).map((c) => c.trim());
    const required = Object.keys(format.columnMap);
    if (required.every((r) => cols.includes(r))) return format;
  }
  return null;
}
