import type { ConsumptionRecord, SolarInstallation, CompanyOffer, Battery, TariffSchedule } from '../db.ts';
import { resolveTariffPeriod, resolvePowerTariffPeriod } from './tariffSchedule.ts';
import { parsePVGISTime } from './pvgis.ts';
import { calculateShadowFactor } from './shadows.ts';
import { calculateBill, type HourlySimResult } from './billCalculator.ts';
import type { EnergyPriceResolver } from './energyPriceResolver.ts';
import { getPvpcPowerPrices } from './pvpc.ts';

export interface MonthlyBreakdown {
  month: string;
  energyCost: number;
  surplusCompensation: number;
  virtualBatteryDepositedEuros: number;
  virtualBatteryUsedEuros: number;
  virtualBatteryBalance: number;
  virtualBatteryFee: number;
  powerTerm: number;
  meterRental: number;
  electricityTax: number;
  iva: number;
  total: number;
  selfConsumptionRatio: number;
  gridPurchaseKwh: number;
  gridSurplusKwh: number;
  consumptionKwh: number;
  solarProductionKwh: number;
}

export interface SimulationResult {
  offerId: number;
  offerName: string;
  companyName: string;
  batteryId: number | null;
  batteryName: string;
  installationId: number;
  totalAnnualCost: number;
  totalConsumption: number;
  totalSolarProduction: number;
  totalGridPurchase: number;
  totalGridSurplus: number;
  totalSurplusCompensation: number;
  selfConsumptionRatio: number;
  virtualBatteryBalance: number;
  monthlyBreakdown: MonthlyBreakdown[];
  hourlyResults: HourlySimResult[];
}

function buildSolarIndex(installation: SolarInstallation): Record<string, number> {
  if (!installation.pvgisData) return {};

  // Accumulate per group, averaging across years within each group
  const groupTotals: Record<string, number> = {};

  for (const groupData of installation.pvgisData) {
    const group = installation.panelGroups.find((g) => g.name === groupData.groupName);
    const obstacles = group?.obstacles ?? [];
    const panelHeight = group?.heightFromGround ?? 0;

    // Scale P if peakPower has changed since fetch (avoids re-fetch for power changes)
    const currentPeakKw = (group?.peakPowerWp ?? 0) / 1000;
    const storedPeakKw = groupData.fetchParams?.peakPowerKw ?? currentPeakKw;
    const peakPowerScale = storedPeakKw > 0 ? currentPeakKw / storedPeakKw : 1;

    // Warn if tilt/azimuth/loss changed (these require re-fetch, can't scale)
    if (group && groupData.fetchParams) {
      const fp = groupData.fetchParams;
      const stale: string[] = [];
      if (fp.tilt !== group.tilt) stale.push(`tilt: ${fp.tilt}→${group.tilt}`);
      if (fp.azimuth !== group.azimuth) stale.push(`azimuth: ${fp.azimuth}→${group.azimuth}`);
      if (fp.systemLoss !== installation.systemLoss) stale.push(`loss: ${fp.systemLoss}→${installation.systemLoss}`);
      if (stale.length > 0) {
        console.warn(`[SolarIndex] ⚠️ Datos PVGIS de "${groupData.groupName}" desactualizados: ${stale.join(', ')}. Re-fetch recomendado.`);
      }
    }

    if (peakPowerScale !== 1) {
      console.log(`[SolarIndex] Escalando P de "${groupData.groupName}": ${storedPeakKw} kWp → ${currentPeakKw} kWp (×${peakPowerScale.toFixed(3)})`);
    }

    // Sum values per key and count occurrences to average across years
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    for (const record of groupData.hourlyData) {
      const { month, day, hour, utcHour } = parsePVGISTime(record.time);
      const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${String(hour).padStart(2, '0')}`;
      // Shadow calculation uses UTC hour — getSunPosition assumes solar time ≈ UTC for Spain
      // Physical height along the tilt axis depends on orientation
      const isLandscape = group?.panelOrientation === 'landscape';
      const panelTiltHeightCm = isLandscape ? (group?.panelWidthCm ?? 0) : (group?.panelHeightCm ?? 0);
      const shadowFactor = calculateShadowFactor(
        obstacles, utcHour, month, installation.latitude,
        panelHeight, panelTiltHeightCm / 100, group?.tilt ?? 30,
      );
      const kwhThisHour = Math.max(0, (record.P / 1000) * peakPowerScale * shadowFactor);
      sums[key] = (sums[key] ?? 0) + kwhThisHour;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    // Add averaged values for this group to the total
    for (const key of Object.keys(sums)) {
      groupTotals[key] = (groupTotals[key] ?? 0) + sums[key] / counts[key];
    }
  }

  return groupTotals;
}

function getPowerTermPrice(offer: CompanyOffer, period: string): number {
  return offer.powerPrices[period] ?? 0;
}

function getContractedPower(offer: CompanyOffer, period: string): number {
  if (typeof offer.contractedPowerKw === 'number') return offer.contractedPowerKw;
  return offer.contractedPowerKw[period] ?? 0;
}

export async function runSimulation(
  consumption: ConsumptionRecord[],
  installation: SolarInstallation,
  offer: CompanyOffer,
  battery: Battery | null,
  schedule: TariffSchedule | null,
  powerSchedule: TariffSchedule | null,
  energyPriceResolver: EnergyPriceResolver,
): Promise<SimulationResult> {
  const solarIndex = buildSolarIndex(installation);
  console.log(solarIndex);
  const hourlyResults: HourlySimResult[] = [];

  let batteryLevel = 0;
  const batteryCapacity = battery?.capacityKwh ?? 0;
  const batteryMaxPowerKw = battery ? battery.maxPowerW / 1000 : 0;
  const batteryEfficiency = battery ? battery.roundTripEfficiency / 100 : 0.9;

  const sorted = [...consumption].sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.hour - b.hour));

  // Batch-resolve all energy prices upfront
  const queries = sorted.map((r) => ({ date: r.date, hour: r.hour }));
  const energyPrices = await energyPriceResolver(queries);

  for (let i = 0; i < sorted.length; i++) {
    const record = sorted[i];
    const { date, hour, kwh: consumptionKwh } = record;
    const [, mm, dd] = date.split('-');
    const solarKey = `${mm}-${dd}-${String(hour).padStart(2, '0')}`;
    const solarProduction = solarIndex[solarKey] ?? 0;

    let net = consumptionKwh - solarProduction;
    let batteryCharge = 0;
    let batteryLoss = 0;

    if (battery) {
      if (net > 0) {
        const canDischarge = Math.min(batteryLevel, batteryMaxPowerKw, net);
        batteryCharge = -canDischarge;
        batteryLevel -= canDischarge;
        net -= canDischarge;
        // discharge losses were already accounted for at charge time (all losses lumped at charging)
      } else if (net < 0) {
        const surplus = -net;
        const canCharge = Math.min((batteryCapacity - batteryLevel) / batteryEfficiency, batteryMaxPowerKw, surplus);
        batteryCharge = canCharge;
        batteryLoss = canCharge * (1 - batteryEfficiency);
        batteryLevel += canCharge * batteryEfficiency;
        net += canCharge;
      }
    }

    const gridPurchase = net > 0 ? net : 0;
    const gridSurplus = net < 0 ? -net : 0;
    const tariffPeriod = resolveTariffPeriod(schedule, date, hour);
    const powerPeriod = resolvePowerTariffPeriod(powerSchedule, date, hour);
    const energyPrice = energyPrices[i];

    let powerTermPrice: number;
    let contractedPower: number;
    if (offer.usePvpcPrices) {
      const year = parseInt(date.substring(0, 4), 10);
      const pvpcPower = getPvpcPowerPrices(year);
      powerTermPrice = pvpcPower[powerPeriod as 'punta' | 'valle'] ?? pvpcPower.punta;
      contractedPower = getContractedPower(offer, powerPeriod);
    } else {
      powerTermPrice = getPowerTermPrice(offer, powerPeriod);
      contractedPower = getContractedPower(offer, powerPeriod);
    }
    const powerTermCost = powerTermPrice * contractedPower / 24;

    hourlyResults.push({
      date,
      hour,
      consumption: consumptionKwh,
      solarProduction,
      batteryCharge,
      batteryLoss,
      batteryLevel,
      gridPurchase,
      gridSurplus,
      tariffPeriod,
      energyPrice,
      powerTermCost,
      powerTermPrice,
      energyCost: gridPurchase * energyPrice,
      surplusValue: gridSurplus * offer.surplusCompensationPerKwh,
    });
  }

  const monthlyMap = new Map<string, HourlySimResult[]>();
  for (const hr of hourlyResults) {
    const month = hr.date.substring(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, []);
    monthlyMap.get(month)!.push(hr);
  }

  const sortedMonths = [...monthlyMap.keys()].sort();

  // Run a full billing pass starting from a given VB balance, return breakdown + year-end balance.
  const runBillingPass = (startBalance: number) => {
    let balance = startBalance;
    const breakdown: MonthlyBreakdown[] = [];
    for (const month of sortedMonths) {
      const hours = monthlyMap.get(month)!;
      const monthBill = calculateBill(hours, offer, balance);
      balance = monthBill.newVirtualBatteryBalance;

      const consumptionKwh = hours.reduce((s, h) => s + h.consumption, 0);
      const solarKwh = hours.reduce((s, h) => s + h.solarProduction, 0);
      const gridPurchaseKwh = hours.reduce((s, h) => s + h.gridPurchase, 0);
      const gridSurplusKwh = hours.reduce((s, h) => s + h.gridSurplus, 0);
      const selfConsumed = solarKwh - gridSurplusKwh;

      breakdown.push({
        month,
        energyCost: monthBill.energyCost,
        surplusCompensation: monthBill.surplusCompensation,
        virtualBatteryDepositedEuros: monthBill.virtualBatteryDepositedEuros,
        virtualBatteryUsedEuros: monthBill.virtualBatteryUsedEuros,
        virtualBatteryBalance: balance,
        virtualBatteryFee: monthBill.virtualBatteryFee,
        powerTerm: monthBill.powerTerm,
        meterRental: monthBill.meterRental,
        electricityTax: monthBill.electricityTax,
        iva: monthBill.iva,
        total: monthBill.total,
        selfConsumptionRatio: consumptionKwh > 0 ? selfConsumed / consumptionKwh : 0,
        gridPurchaseKwh,
        gridSurplusKwh,
        consumptionKwh,
        solarProductionKwh: solarKwh,
      });
    }
    return { breakdown, endBalance: balance };
  };

  // For VB offers, the year is a cycle: the Dec year-end balance carries into the following Jan.
  // Iterate the billing pass until the starting balance converges (steady state).
  let { breakdown: monthlyBreakdown, endBalance: virtualBatteryBalance } = runBillingPass(0);
  if (offer.hasVirtualBattery) {
    for (let i = 0; i < 10; i++) {
      const prev = virtualBatteryBalance;
      ({ breakdown: monthlyBreakdown, endBalance: virtualBatteryBalance } = runBillingPass(virtualBatteryBalance));
      if (Math.abs(virtualBatteryBalance - prev) < 0.01) break;
    }
  }

  // Calculate annual bill as sum of monthly bills
  const bill = {
    total: monthlyBreakdown.reduce((s, m) => s + m.total, 0),
    surplusCompensation: monthlyBreakdown.reduce((s, m) => s + m.surplusCompensation, 0),
  };

  const totalConsumption = hourlyResults.reduce((s, h) => s + h.consumption, 0);
  const totalSolarProduction = hourlyResults.reduce((s, h) => s + h.solarProduction, 0);
  const totalGridPurchase = hourlyResults.reduce((s, h) => s + h.gridPurchase, 0);
  const totalGridSurplus = hourlyResults.reduce((s, h) => s + h.gridSurplus, 0);
  const selfConsumed = totalSolarProduction - totalGridSurplus;

  return {
    offerId: offer.id!,
    offerName: offer.name,
    companyName: offer.companyName,
    batteryId: battery?.id ?? null,
    batteryName: battery?.name ?? 'Sin batería',
    installationId: installation.id!,
    totalAnnualCost: bill.total,
    totalConsumption,
    totalSolarProduction,
    totalGridPurchase,
    totalGridSurplus,
    totalSurplusCompensation: bill.surplusCompensation,
    selfConsumptionRatio: totalConsumption > 0 ? selfConsumed / totalConsumption : 0,
    virtualBatteryBalance,
    monthlyBreakdown,
    hourlyResults,
  };
}
