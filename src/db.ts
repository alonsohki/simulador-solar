import Dexie, { type Table } from 'dexie';

export type ObstacleDirection = 'north' | 'south' | 'east' | 'west';

export interface Obstacle {
  name: string;
  type: 'solid' | 'transparent';
  transparencyPercent?: number;
  height: number;
  /** Center azimuth in degrees, 0-359°, measured clockwise from North. */
  azimuthDeg: number;
  /** Physical width of the obstacle in meters. */
  widthM: number;
  /** @deprecated Use widthM instead. Kept for backward compatibility with existing records. */
  angularWidthDeg?: number;
  distance: number;
  /** @deprecated Use azimuthDeg instead. Kept for backward compatibility with existing records. */
  direction?: ObstacleDirection;
}

export interface PanelGroup {
  name: string;
  /** Total group Wp = panelWp × numPanels. Kept for PVGIS compat. */
  peakPowerWp: number;
  /** Wp per individual panel. */
  panelWp?: number;
  /** Number of panels in this group. */
  numPanels?: number;
  /** How panels are physically mounted on the racking. */
  panelOrientation?: 'portrait' | 'landscape';
  tilt: number;
  azimuth: number;
  heightFromGround: number;
  obstacles: Obstacle[];
  /** Physical panel width in cm (short side when portrait). */
  panelWidthCm?: number;
  /** Physical panel height in cm (long side when portrait, along the panel surface). */
  panelHeightCm?: number;
}

export interface PVGISHourlyRecord {
  time: string;
  P: number;
  Gb: number;
  Gd: number;
  Gr: number;
  H_sun: number;
  T2m: number;
  WS10m: number;
  Int: number;
}

export interface PVGISFetchParams {
  peakPowerKw: number;
  tilt: number;
  azimuth: number;
  systemLoss: number;
  lat: number;
  lon: number;
}

export interface PVGISGroupData {
  groupName: string;
  hourlyData: PVGISHourlyRecord[];
  fetchParams?: PVGISFetchParams;
}

export interface SolarInstallation {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  systemLoss: number;
  panelGroups: PanelGroup[];
  pvgisData?: PVGISGroupData[];
}

export type TariffType = 'flat' | '2.0TD' | 'custom';

export interface TimeSlot {
  name: string;
  startHour: number; // 0-23
  endHour: number; // 1-24
}

export interface DateRange {
  name: string;
  startMonth: number; // 1-12
  startDay: number; // 1-31
  endMonth: number; // 1-12
  endDay: number; // 1-31
  weekendBehavior: 'same' | 'specific';
  weekendSlotName?: string; // only when weekendBehavior === 'specific'
  timeSlots: TimeSlot[];
}

export interface TariffSchedule {
  id?: number;
  name: string;
  type: TariffType;
  dateRanges?: DateRange[]; // only for 'custom'
}

export interface CompanyOffer {
  id?: number;
  name: string;
  companyName: string;
  tariffScheduleId: number;
  prices: Record<string, number>;
  usePvpcPrices?: boolean;
  surplusCompensationPerKwh: number;
  surplusCompensationCapped?: boolean;
  hasVirtualBattery: boolean;
  virtualBatteryMonthlyFee: number;
  contractedPowerKw: number | Record<string, number>;
  powerTariffScheduleId?: number;
  powerPrices: Record<string, number>;
  meterRentalPerDay: number;
  electricityTaxPercent: number;
  ivaPercent: number;
}

export interface PvpcDailyPrices {
  date: string;      // YYYY-MM-DD (PK)
  prices: number[];  // 24 values, index 0-23, in €/kWh
}

export interface Battery {
  id?: number;
  name: string;
  capacityKwh: number;
  maxPowerW: number;
  roundTripEfficiency: number;
  priceEur?: number;
}

export interface ConsumptionRecord {
  date: string;
  hour: number;
  kwh: number;
}

export interface ConsumptionData {
  id?: number;
  fileName: string;
  importedAt: string;
  formatId?: string;
  records: ConsumptionRecord[];
}

export function getScheduleSlotNames(schedule: TariffSchedule): string[] {
  if (schedule.type === 'flat') return ['flat'];
  if (schedule.type === '2.0TD') return ['punta', 'llano', 'valle'];
  // custom
  const names = new Set<string>();
  for (const dr of schedule.dateRanges ?? []) {
    for (const ts of dr.timeSlots) {
      names.add(ts.name);
    }
    if (dr.weekendBehavior === 'specific' && dr.weekendSlotName) {
      names.add(dr.weekendSlotName);
    }
  }
  return [...names];
}

/** Power slot names — for 2.0TD only punta/valle (no llano). */
export function getPowerScheduleSlotNames(schedule: TariffSchedule): string[] {
  if (schedule.type === 'flat') return ['flat'];
  if (schedule.type === '2.0TD') return ['punta', 'valle'];
  return getScheduleSlotNames(schedule);
}

export class AppDatabase extends Dexie {
  solarInstallations!: Table<SolarInstallation, number>;
  tariffSchedules!: Table<TariffSchedule, number>;
  companyOffers!: Table<CompanyOffer, number>;
  batteries!: Table<Battery, number>;
  consumptionData!: Table<ConsumptionData, number>;
  pvpcPrices!: Table<PvpcDailyPrices, string>;

  constructor() {
    super('SolarComparatorDB');
    this.version(1).stores({
      solarInstallations: '++id, name',
      companyOffers: '++id, name',
      batteries: '++id, name',
      consumptionData: '++id, fileName',
    });
    this.version(2).stores({
      solarInstallations: '++id, name',
      tariffSchedules: '++id, name',
      companyOffers: '++id, name',
      batteries: '++id, name',
      consumptionData: '++id, fileName',
    });
    this.version(3).stores({
      solarInstallations: '++id, name',
      tariffSchedules: '++id, name',
      companyOffers: '++id, name',
      batteries: '++id, name',
      consumptionData: '++id, fileName',
    });
    this.version(4).stores({
      solarInstallations: '++id, name',
      tariffSchedules: '++id, name',
      companyOffers: '++id, name',
      batteries: '++id, name',
      consumptionData: '++id, fileName',
      pvpcPrices: 'date',
    });
    this.version(5).stores({
      solarInstallations: '++id, name',
      tariffSchedules: '++id, name',
      companyOffers: '++id, name',
      batteries: '++id, name',
      consumptionData: '++id, fileName',
      pvpcPrices: 'date',
    }).upgrade((tx) =>
      tx.table('consumptionData').toCollection().modify((ds) => {
        if (!ds.formatId) ds.formatId = 'ide';
      }),
    );
  }
}

export const db = new AppDatabase();
