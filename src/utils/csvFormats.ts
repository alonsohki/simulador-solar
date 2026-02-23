/**
 * CSV format definitions for consumption data import.
 *
 * To add a new format, add an entry to CSV_FORMATS with:
 *   - id/name: identifiers for display and error messages
 *   - delimiter: column separator character
 *   - requiredColumns: column names that must appear in the header (used for auto-detection)
 *   - getDate(cols): returns 'YYYY-MM-DD' from the row's column values, or undefined to skip
 *   - getHour(cols): returns hour in 1-24 convention, or undefined to skip
 *   - getKwh(cols):  returns consumption in kWh, or undefined to skip
 *
 * `cols` is a Record<string, string> mapping each header name to the raw cell value for that row.
 * All parsing logic (date formats, decimal separators, splitting combined columns, etc.)
 * lives inside the callbacks — the parser itself is format-agnostic.
 */

export interface CSVFormat {
  id: string;
  name: string;
  delimiter: string;
  requiredColumns: string[];
  getDate: (cols: Record<string, string>) => string | undefined;
  getHour: (cols: Record<string, string>) => number | undefined;
  getKwh:  (cols: Record<string, string>) => number | undefined;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDMY(dateStr: string): string | undefined {
  const [day, month, year] = dateStr.split('/');
  if (!day || !month || !year) return undefined;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseEsFloat(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

// ── Format definitions ─────────────────────────────────────────────────────

export const CSV_FORMATS: CSVFormat[] = [
  {
    id: 'ide',
    name: 'I-DE (Iberdrola Distribución)',
    delimiter: ';',
    requiredColumns: ['Fecha', 'Hora', 'Consumo_kWh'],
    getDate: (cols) => parseDMY(cols['Fecha']),
    getHour: (cols) => {
      const h = parseInt(cols['Hora'], 10);
      return isNaN(h) ? undefined : h; // already 1-24
    },
    getKwh: (cols) => {
      const v = parseEsFloat(cols['Consumo_kWh']);
      return isNaN(v) ? undefined : v;
    },
  },
];

// ── Detection ──────────────────────────────────────────────────────────────

/** Returns the first format whose requiredColumns are all present in the header line. */
export function detectFormat(headerLine: string): CSVFormat | null {
  for (const format of CSV_FORMATS) {
    const cols = headerLine.split(format.delimiter).map((c) => c.trim());
    if (format.requiredColumns.every((r) => cols.includes(r))) return format;
  }
  return null;
}
