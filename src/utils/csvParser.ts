import type { ConsumptionRecord } from '../db.ts';
import { detectFormat, CSV_FORMATS } from './csvFormats.tsx';

export function parseConsumptionCSV(text: string): { records: ConsumptionRecord[]; formatId: string } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const headerLine = lines[0].trim();
  const format = detectFormat(headerLine);

  if (!format) {
    const supported = CSV_FORMATS.map((f) => f.name).join(', ');
    throw new Error(`Formato de CSV no reconocido. Formatos soportados: ${supported}`);
  }

  const headers = headerLine.split(format.delimiter).map((h) => h.trim());
  const records: ConsumptionRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(format.delimiter);
    const cols: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      cols[headers[j]] = parts[j]?.trim() ?? '';
    }

    const date = format.getDate(cols);
    const hour = format.getHour(cols);
    const kwh  = format.getKwh(cols);

    if (!date || hour === undefined || kwh === undefined) continue;

    records.push({ date, hour, kwh });
  }

  if (records.length === 0) throw new Error('No se encontraron registros válidos en el CSV');
  return { records, formatId: format.id };
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
