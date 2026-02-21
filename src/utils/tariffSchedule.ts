import type { DateRange, TimeSlot, TariffSchedule } from '../db.ts';

// Spanish national holidays (fixed dates)
const NATIONAL_HOLIDAYS = [
  '01-01', // Año Nuevo
  '01-06', // Epifanía
  '05-01', // Día del Trabajador
  '08-15', // Asunción
  '10-12', // Fiesta Nacional
  '11-01', // Todos los Santos
  '12-06', // Constitución
  '12-08', // Inmaculada
  '12-25', // Navidad
];

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isNationalHoliday(date: Date): boolean {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return NATIONAL_HOLIDAYS.includes(`${mm}-${dd}`);
}

export function isHolidayOrWeekend(date: Date): boolean {
  return isWeekend(date) || isNationalHoliday(date);
}

/**
 * Get tariff period for Spanish 2.0TD tariff
 * @param dateStr YYYY-MM-DD
 * @param hour 1-24 (Spanish CSV convention)
 */
export function getTariffPeriod(dateStr: string, hour: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');

  // Weekends and national holidays → all Valle
  if (isWeekend(date) || isNationalHoliday(date)) {
    return 'valle';
  }

  // Hour 1-24 maps to interval (hour-1):00 to hour:00
  const h = hour;

  // Valle: 0-8h (hours 1-8)
  if (h >= 1 && h <= 8) return 'valle';

  // Punta: 10-14h (hours 11-14), 18-22h (hours 19-22)
  if ((h >= 11 && h <= 14) || (h >= 19 && h <= 22)) return 'punta';

  // Llano: 8-10h (hours 9-10), 14-18h (hours 15-18), 22-24h (hours 23-24)
  return 'llano';
}

/**
 * Check if a date (month/day) falls within a DateRange.
 * Handles wrap-around (e.g. Nov 1 → Feb 28).
 */
function dateInRange(month: number, day: number, range: DateRange): boolean {
  const d = month * 100 + day;
  const start = range.startMonth * 100 + range.startDay;
  const end = range.endMonth * 100 + range.endDay;

  if (start <= end) {
    return d >= start && d <= end;
  }
  // Wraps around year boundary (e.g. Nov → Feb)
  return d >= start || d <= end;
}

/**
 * Resolve the tariff slot name for a custom schedule.
 * @param dateStr YYYY-MM-DD
 * @param hour 1-24 (Spanish CSV convention)
 * @param dateRanges the custom schedule's date ranges
 */
export function resolveCustomPeriod(
  dateStr: string,
  hour: number,
  dateRanges: DateRange[],
): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const holiday = isHolidayOrWeekend(date);

  // Find the matching date range
  const range = dateRanges.find((r) => dateInRange(month, day, r));
  if (!range) return 'unknown';

  // Weekend/holiday with specific slot
  if (holiday && range.weekendBehavior === 'specific' && range.weekendSlotName) {
    return range.weekendSlotName;
  }

  // Find matching time slot. Hour is 1-24 (Spanish convention):
  // hour=1 → 0:00-1:00, so the clock hour at start of interval is hour-1
  const clockHour = hour - 1; // 0-23
  const slot = range.timeSlots.find((ts) => {
    if (ts.startHour < ts.endHour) {
      return clockHour >= ts.startHour && clockHour < ts.endHour;
    }
    // Wrap-around midnight (e.g., 17:00 → 9:00)
    return clockHour >= ts.startHour || clockHour < ts.endHour;
  });
  return slot?.name ?? 'unknown';
}

/**
 * Get power tariff period for Spanish 2.0TD tariff.
 * Power only has 2 periods: punta (8:00-0:00 workdays) and valle (rest).
 * @param dateStr YYYY-MM-DD
 * @param hour 1-24 (Spanish CSV convention)
 */
export function getPowerTariffPeriod(dateStr: string, hour: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');

  if (isWeekend(date) || isNationalHoliday(date)) {
    return 'valle';
  }

  // Punta: 8-24h (hours 9-24), Valle: 0-8h (hours 1-8)
  if (hour >= 1 && hour <= 8) return 'valle';
  return 'punta';
}

/**
 * Resolve the tariff period name for any schedule type.
 * @param schedule The tariff schedule (or null for flat)
 * @param date YYYY-MM-DD
 * @param hour 1-24 (Spanish CSV convention)
 */
export function resolveTariffPeriod(
  schedule: TariffSchedule | null,
  date: string,
  hour: number,
): string {
  if (!schedule || schedule.type === 'flat') return 'flat';
  if (schedule.type === '2.0TD') return getTariffPeriod(date, hour);
  return resolveCustomPeriod(date, hour, schedule.dateRanges ?? []);
}

/**
 * Resolve the power tariff period for any schedule type.
 * For 2.0TD, power has only 2 periods (punta/valle) instead of 3.
 */
export function resolvePowerTariffPeriod(
  schedule: TariffSchedule | null,
  date: string,
  hour: number,
): string {
  if (!schedule || schedule.type === 'flat') return 'flat';
  if (schedule.type === '2.0TD') return getPowerTariffPeriod(date, hour);
  return resolveCustomPeriod(date, hour, schedule.dateRanges ?? []);
}

const PERIOD_COLORS = [
  '#d32f2f', // red
  '#f57c00', // orange
  '#388e3c', // green
  '#1976d2', // blue
  '#7b1fa2', // purple
  '#00796b', // teal
  '#c2185b', // pink
  '#fbc02d', // yellow
];

export function getTariffPeriodLabel(period: string): string {
  // Capitalize first letter
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function getTariffPeriodColor(period: string, allPeriods?: string[]): string {
  // Known periods get fixed colors
  const known: Record<string, string> = {
    punta: '#d32f2f',
    llano: '#f57c00',
    valle: '#388e3c',
    flat: '#1976d2',
  };
  if (known[period.toLowerCase()]) return known[period.toLowerCase()];

  // For custom periods, assign by index in the list
  if (allPeriods) {
    const idx = allPeriods.indexOf(period);
    if (idx >= 0) return PERIOD_COLORS[idx % PERIOD_COLORS.length];
  }

  // Fallback: hash-based color
  let hash = 0;
  for (let i = 0; i < period.length; i++) {
    hash = (hash * 31 + period.charCodeAt(i)) | 0;
  }
  return PERIOD_COLORS[Math.abs(hash) % PERIOD_COLORS.length];
}

// --- Validation for custom schedules ---

// Cumulative days per month (non-leap, but we use 366 slots to cover leap years)
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_START: number[] = [];
{
  let acc = 0;
  for (let m = 0; m < 12; m++) {
    MONTH_START.push(acc);
    acc += DAYS_IN_MONTH[m];
  }
}

function dayOfYear(month: number, day: number): number {
  return MONTH_START[month - 1] + (day - 1);
}

function formatDate(dayIndex: number): string {
  const MONTH_NAMES = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];
  let remaining = dayIndex;
  for (let m = 0; m < 12; m++) {
    if (remaining < DAYS_IN_MONTH[m]) {
      return `${remaining + 1} ${MONTH_NAMES[m]}`;
    }
    remaining -= DAYS_IN_MONTH[m];
  }
  return `${dayIndex}`;
}

export function validateDateRanges(dateRanges: DateRange[]): string[] {
  const TOTAL_DAYS = 366;
  // Track which ranges cover each day: array of range indices per day
  const coverage: number[][] = Array.from({ length: TOTAL_DAYS }, () => []);

  for (let rIdx = 0; rIdx < dateRanges.length; rIdx++) {
    const r = dateRanges[rIdx];
    const start = dayOfYear(r.startMonth, r.startDay);
    const end = dayOfYear(r.endMonth, r.endDay);

    if (start <= end) {
      for (let d = start; d <= end; d++) coverage[d].push(rIdx);
    } else {
      // Wrap-around (e.g. Nov → Feb)
      for (let d = start; d < TOTAL_DAYS; d++) coverage[d].push(rIdx);
      for (let d = 0; d <= end; d++) coverage[d].push(rIdx);
    }
  }

  const errors: string[] = [];

  // Find gaps (consecutive uncovered days)
  let gapStart: number | null = null;
  for (let d = 0; d < TOTAL_DAYS; d++) {
    if (coverage[d].length === 0) {
      if (gapStart === null) gapStart = d;
    } else if (gapStart !== null) {
      errors.push(
        `Hay días del año sin cubrir (${formatDate(gapStart)} – ${formatDate(d - 1)})`,
      );
      gapStart = null;
    }
  }
  if (gapStart !== null) {
    errors.push(
      `Hay días del año sin cubrir (${formatDate(gapStart)} – ${formatDate(TOTAL_DAYS - 1)})`,
    );
  }

  // Find overlaps
  const reportedPairs = new Set<string>();
  for (let d = 0; d < TOTAL_DAYS; d++) {
    if (coverage[d].length > 1) {
      for (let i = 0; i < coverage[d].length; i++) {
        for (let j = i + 1; j < coverage[d].length; j++) {
          const a = coverage[d][i];
          const b = coverage[d][j];
          const key = `${a}-${b}`;
          if (!reportedPairs.has(key)) {
            reportedPairs.add(key);
            const nameA = dateRanges[a].name || `Periodo ${a + 1}`;
            const nameB = dateRanges[b].name || `Periodo ${b + 1}`;
            errors.push(
              `Los periodos "${nameA}" y "${nameB}" se solapan (ej: ${formatDate(d)})`,
            );
          }
        }
      }
    }
  }

  return errors;
}

export function validateTimeSlots(timeSlots: TimeSlot[]): string[] {
  const coverage: number[][] = Array.from({ length: 24 }, () => []);

  for (let sIdx = 0; sIdx < timeSlots.length; sIdx++) {
    const ts = timeSlots[sIdx];
    if (ts.startHour < ts.endHour) {
      for (let h = ts.startHour; h < ts.endHour; h++) coverage[h].push(sIdx);
    } else {
      // Wrap-around midnight (e.g. 17→9)
      for (let h = ts.startHour; h < 24; h++) coverage[h].push(sIdx);
      for (let h = 0; h < ts.endHour; h++) coverage[h].push(sIdx);
    }
  }

  const errors: string[] = [];

  // Gaps
  for (let h = 0; h < 24; h++) {
    if (coverage[h].length === 0) {
      errors.push(`horas sin cubrir (ej: ${h}:00–${h + 1}:00)`);
      break; // One example is enough
    }
  }

  // Overlaps
  for (let h = 0; h < 24; h++) {
    if (coverage[h].length > 1) {
      errors.push(`franjas horarias solapadas (ej: hora ${h})`);
      break;
    }
  }

  return errors;
}

export function validateSchedule(schedule: Omit<TariffSchedule, 'id'>): string[] {
  if (schedule.type !== 'custom') return [];

  const dateRanges = schedule.dateRanges ?? [];
  if (dateRanges.length === 0) return [];

  const errors: string[] = [];

  // Validate date ranges coverage
  errors.push(...validateDateRanges(dateRanges));

  // Validate time slots for each date range
  for (const dr of dateRanges) {
    const name = dr.name || 'Sin nombre';
    const tsErrors = validateTimeSlots(dr.timeSlots);
    for (const e of tsErrors) {
      errors.push(`El periodo "${name}" tiene ${e}`);
    }
  }

  return errors;
}
