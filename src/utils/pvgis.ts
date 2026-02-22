import type { PVGISHourlyRecord, PanelGroup } from '../db.ts';

const PVGIS_BASE = import.meta.env.DEV
  ? '/api/pvgis/seriescalc'
  : 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';

export interface PVGISResponse {
  outputs: {
    hourly: Array<{
      time: string;
      P: number;
      'G(b)': number;
      'G(d)': number;
      'G(r)': number;
      H_sun: number;
      T2m: number;
      WS10m: number;
      Int: number;
    }>;
  };
}

export function buildPVGISUrl(lat: number, lon: number, group: PanelGroup, systemLoss: number): string {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    peakpower: (group.peakPowerWp / 1000).toString(),
    loss: systemLoss.toString(),
    angle: group.tilt.toString(),
    aspect: (group.azimuth - 180).toString(), // PVGIS: 0=S, 90=W, -90=E, 180=N; app: 0=N, 180=S
    outputformat: 'json',
    pvcalculation: '1',
  });
  return `${PVGIS_BASE}?${params.toString()}`;
}

export async function fetchPVGISData(
  lat: number,
  lon: number,
  group: PanelGroup,
  systemLoss: number,
): Promise<PVGISHourlyRecord[]> {
  const url = buildPVGISUrl(lat, lon, group, systemLoss);
  console.log(`[PVGIS] Fetching: ${url}`);
  console.log(`[PVGIS] Params: peakpower=${(group.peakPowerWp / 1000).toFixed(2)} kWp, tilt=${group.tilt}°, azimuth=${group.azimuth}°, loss=${systemLoss}%`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PVGIS error: ${response.status} ${response.statusText}`);
  }

  const data: PVGISResponse = await response.json();
  return parsePVGISJson(data);
}

export function parsePVGISJson(json: PVGISResponse): PVGISHourlyRecord[] {
  return json.outputs.hourly.map((h) => ({
    time: h.time,
    P: h.P,
    Gb: h['G(b)'],
    Gd: h['G(d)'],
    Gr: h['G(r)'],
    H_sun: h.H_sun,
    T2m: h.T2m,
    WS10m: h.WS10m,
    Int: h.Int,
  }));
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/** Last Sunday of a given month (1-based). EU DST rule. */
function lastSunday(year: number, month: number): number {
  const last = daysInMonth(year, month);
  const dow = new Date(year, month - 1, last).getDay(); // 0=Sunday
  return last - dow;
}

/** UTC offset for Europe/Madrid: +1 (CET) or +2 (CEST). */
function spainOffset(year: number, month: number, day: number, utcHour: number): number {
  if (month >= 4 && month <= 9) return 2;
  if (month <= 2 || month >= 11) return 1;
  if (month === 3) {
    const ls = lastSunday(year, 3);
    if (day < ls) return 1;
    if (day > ls) return 2;
    return utcHour < 1 ? 1 : 2; // transition at 01:00 UTC
  }
  // October
  const ls = lastSunday(year, 10);
  if (day < ls) return 2;
  if (day > ls) return 1;
  return utcHour < 1 ? 2 : 1;
}

/**
 * Parse a PVGIS timestamp (UTC) and convert to Europe/Madrid local time.
 * PVGIS format: "YYYYMMDD:HHMM" where HHMM is UTC.
 * Returns month, day, and hour in Spanish 1-24 convention
 * (hora 1 = 00:00-01:00 local, hora 24 = 23:00-00:00 local).
 */
export function parsePVGISTime(time: string): { month: number; day: number; hour: number; utcHour: number } {
  const year = parseInt(time.substring(0, 4), 10);
  const month = parseInt(time.substring(4, 6), 10);
  const day = parseInt(time.substring(6, 8), 10);
  const hourMin = time.substring(9);
  let utcHour = parseInt(hourMin.substring(0, 2), 10);
  const min = parseInt(hourMin.substring(2, 4), 10);
  if (min >= 30) utcHour += 1;

  // Convert UTC to Europe/Madrid local time (CET=UTC+1, CEST=UTC+2)
  const offset = spainOffset(year, month, day, utcHour);
  let localHour = utcHour + offset;
  let localDay = day;
  let localMonth = month;

  if (localHour >= 24) {
    localHour -= 24;
    const dim = daysInMonth(year, month);
    localDay += 1;
    if (localDay > dim) {
      localDay = 1;
      localMonth = month === 12 ? 1 : month + 1;
    }
  }

  // Spanish consumption convention: hora 1 = 00:00-01:00, hora 24 = 23:00-00:00
  // utcHour preserved for shadow calculations (sun position ≈ UTC for Spain)
  return { month: localMonth, day: localDay, hour: localHour + 1, utcHour };
}
