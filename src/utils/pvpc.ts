import { db, type PvpcDailyPrices } from '../db.ts';

const PVPC_BASE = import.meta.env.DEV
  ? '/api/ree/es/datos/mercados/precios-mercados-tiempo-real'
  : 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';

interface PvpcApiValue {
  value: number;
  datetime: string;
}

interface PvpcApiResponse {
  included: Array<{
    type: string;
    id: string;
    attributes: {
      values: PvpcApiValue[];
    };
  }>;
}

export async function fetchPvpcRange(
  startDate: string,
  endDate: string,
): Promise<PvpcDailyPrices[]> {
  const params = new URLSearchParams({
    start_date: `${startDate}T00:00`,
    end_date: `${endDate}T23:59`,
    time_trunc: 'hour',
  });

  const response = await fetch(`${PVPC_BASE}?${params}`);
  if (!response.ok) {
    throw new Error(`PVPC API error: ${response.status} ${response.statusText}`);
  }

  const data: PvpcApiResponse = await response.json();

  // Find PVPC series (id "1001")
  const pvpcSeries = data.included.find((s) => s.id === '1001');
  if (!pvpcSeries) {
    throw new Error('PVPC series (id 1001) not found in API response');
  }

  // Group values by date (local Spanish time from the ISO datetime)
  const byDate = new Map<string, number[]>();
  for (const v of pvpcSeries.attributes.values) {
    // datetime is ISO with timezone offset (e.g. "2024-01-15T10:00:00.000+01:00")
    // Parse to get local Spanish date and hour
    const dt = new Date(v.datetime);
    // Format in Europe/Madrid timezone
    const parts = dt.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ');
    const date = parts[0]; // YYYY-MM-DD
    const hour = parseInt(parts[1].split(':')[0], 10); // 0-23

    if (!byDate.has(date)) {
      byDate.set(date, new Array(24).fill(0));
    }
    // Convert €/MWh → €/kWh
    byDate.get(date)![hour] = v.value / 1000;
  }

  const result: PvpcDailyPrices[] = [];
  for (const [date, prices] of byDate) {
    result.push({ date, prices });
  }
  return result;
}

export async function ensurePvpcCached(dates: string[]): Promise<void> {
  // Check which dates are already cached
  const existing = await db.pvpcPrices.where('date').anyOf(dates).primaryKeys();
  const existingSet = new Set(existing);
  const missing = dates.filter((d) => !existingSet.has(d)).sort();

  if (missing.length === 0) return;

  // Group missing dates into contiguous ranges to minimize API calls
  const ranges: Array<{ start: string; end: string }> = [];
  let rangeStart = missing[0];
  let prev = missing[0];

  for (let i = 1; i < missing.length; i++) {
    const curr = missing[i];
    // Check if curr is the day after prev
    const prevDate = new Date(prev + 'T12:00:00');
    const currDate = new Date(curr + 'T12:00:00');
    const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 1) {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = curr;
    }
    prev = curr;
  }
  ranges.push({ start: rangeStart, end: prev });

  // Fetch each range and cache results
  for (const range of ranges) {
    const dailyPrices = await fetchPvpcRange(range.start, range.end);
    if (dailyPrices.length > 0) {
      await db.pvpcPrices.bulkPut(dailyPrices);
    }
  }
}

// PVPC regulated power term prices (peajes + cargos + margen comercialización)
// Source: BOE — CNMC peajes resolutions + Orden TED cargos + margen fijo 3.113 €/kW/año (solo P1)
// Values in €/kW/año. 2021 starts June 1 (tarifa 2.0TD inception).
const PVPC_POWER_PRICES: Record<number, { punta: number; valle: number }> = {
  2021: { punta: 35.532942, valle: 5.440093 },
  2022: { punta: 32.277555, valle: 4.029736 },
  2023: { punta: 29.221357, valle: 3.009656 },
  2024: { punta: 29.229963, valle: 2.635795 },
  2025: { punta: 31.006996, valle: 2.911852 },
  2026: { punta: 31.879795, valle: 3.167068 },
};

/**
 * Get PVPC regulated power prices for a given year.
 * Returns €/kW/día for punta and valle.
 * Falls back to nearest known year if requested year is outside range.
 */
export function getPvpcPowerPrices(year: number): { punta: number; valle: number } {
  const known = Object.keys(PVPC_POWER_PRICES).map(Number).sort();
  let y = year;
  if (y < known[0]) y = known[0];
  if (y > known[known.length - 1]) y = known[known.length - 1];
  const annual = PVPC_POWER_PRICES[y];
  const daysInYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
  return {
    punta: annual.punta / daysInYear,
    valle: annual.valle / daysInYear,
  };
}

export async function loadPvpcPrices(
  dates: string[],
): Promise<Map<string, number>> {
  const records = await db.pvpcPrices.where('date').anyOf(dates).toArray();
  const priceMap = new Map<string, number>();

  for (const record of records) {
    for (let h = 0; h < record.prices.length; h++) {
      const key = `${record.date}-${String(h).padStart(2, '0')}`;
      priceMap.set(key, record.prices[h]);
    }
  }

  return priceMap;
}
