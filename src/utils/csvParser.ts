import type { ConsumptionRecord } from '../db.ts';

export function parseConsumptionCSV(text: string): ConsumptionRecord[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  const header = lines[0];
  if (!header.includes('CUPS') || !header.includes('Consumo_kWh')) {
    throw new Error('Formato de CSV no reconocido. Se espera: CUPS;Fecha;Hora;Consumo_kWh;Metodo_obtencion');
  }

  const records: ConsumptionRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(';');
    if (parts.length < 4) continue;

    const [, fechaStr, horaStr, consumoStr] = parts;

    const [day, month, year] = fechaStr.split('/');
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const hour = parseInt(horaStr, 10);
    const kwh = parseFloat(consumoStr.replace(',', '.'));

    if (isNaN(hour) || isNaN(kwh)) continue;

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
