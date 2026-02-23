import type { ConsumptionRecord } from '../db.ts';
import { detectFormat, CSV_FORMATS, type CanonicalColumn, type CSVFormat } from './csvFormats.ts';

function parseDate(raw: string, format: CSVFormat['dateFormat']): string {
  switch (format) {
    case 'DD/MM/YYYY': {
      const [day, month, year] = raw.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    case 'MM/DD/YYYY': {
      const [month, day, year] = raw.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    case 'YYYY-MM-DD':
      return raw;
  }
}

export function parseConsumptionCSV(text: string): ConsumptionRecord[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const headerLine = lines[0].trim();
  const format = detectFormat(headerLine);

  if (!format) {
    const supported = CSV_FORMATS.map((f) => f.name).join(', ');
    throw new Error(`Formato de CSV no reconocido. Formatos soportados: ${supported}`);
  }

  const headers = headerLine.split(format.delimiter).map((h) => h.trim());
  const colIndex: Partial<Record<CanonicalColumn, number>> = {};
  for (const [csvName, canonical] of Object.entries(format.columnMap)) {
    colIndex[canonical] = headers.indexOf(csvName);
  }

  const records: ConsumptionRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(format.delimiter);

    const dateRaw = colIndex.date !== undefined ? parts[colIndex.date]?.trim() : undefined;
    const hourRaw = colIndex.hour !== undefined ? parts[colIndex.hour]?.trim() : undefined;
    const kwhRaw = colIndex.kwh !== undefined ? parts[colIndex.kwh]?.trim() : undefined;

    if (!dateRaw || !hourRaw || !kwhRaw) continue;

    const date = parseDate(dateRaw, format.dateFormat);
    let hour = parseInt(hourRaw, 10);
    if (isNaN(hour)) continue;
    if (format.hourConvention === '0-23') hour += 1; // normalise to 1-24

    const kwh = parseFloat(kwhRaw.replace(',', '.'));
    if (isNaN(kwh)) continue;

    records.push({ date, hour, kwh });
  }

  if (records.length === 0) throw new Error('No se encontraron registros válidos en el CSV');
  return records;
}

export function getConsumptionStats(records: ConsumptionRecord[]) {
  const totalKwh = records.reduce((sum, r) => sum + r.kwh, 0);
  const dates = [...new Set(records.map((r) => r.date))].sort();
  const days = dates.length;
  const avgDailyKwh = days > 0 ? totalKwh / days : 0;
  const maxHourKwh = Math.max(...records.map((r) => r.kwh));

  return {
    totalKwh,
    days,
    avgDailyKwh,
    maxHourKwh,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    recordCount: records.length,
  };
}
