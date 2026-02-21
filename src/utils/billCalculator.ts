import type { CompanyOffer } from '../db.ts';

export interface HourlySimResult {
  date: string;
  hour: number;
  consumption: number;
  solarProduction: number;
  batteryCharge: number;
  batteryLoss: number;
  batteryLevel: number;
  gridPurchase: number;
  gridSurplus: number;
  tariffPeriod: string;
  energyCost: number;
  energyPrice: number;
  powerTermCost: number;
  powerTermPrice: number;
  surplusValue: number;
}

export interface BillResult {
  energyCost: number;
  surplusGenerated: number;
  surplusCompensation: number;
  virtualBatteryDepositedEuros: number;
  virtualBatteryUsedEuros: number;
  virtualBatteryFee: number;
  powerTerm: number;
  meterRental: number;
  electricityTax: number;
  iva: number;
  total: number;
}

const EMPTY_BILL: BillResult = {
  energyCost: 0,
  surplusGenerated: 0,
  surplusCompensation: 0,
  virtualBatteryDepositedEuros: 0,
  virtualBatteryUsedEuros: 0,
  virtualBatteryFee: 0,
  powerTerm: 0,
  meterRental: 0,
  electricityTax: 0,
  iva: 0,
  total: 0,
};

export function calculateBill(
  hourlyResults: HourlySimResult[],
  offer: CompanyOffer,
  virtualBatteryBalance: number = 0,
): BillResult & { newVirtualBatteryBalance: number } {
  if (hourlyResults.length === 0) {
    return { ...EMPTY_BILL, newVirtualBatteryBalance: virtualBatteryBalance };
  }

  const energyCost = hourlyResults.reduce((sum, h) => sum + h.energyCost, 0);
  const powerTerm = hourlyResults.reduce((sum, h) => sum + h.powerTermCost, 0);
  const surplusGenerated = hourlyResults.reduce((sum, h) => sum + h.surplusValue, 0);

  const dates = new Set(hourlyResults.map((h) => h.date));
  const days = dates.size;

  let virtualBatteryDepositedEuros = 0;
  let virtualBatteryUsedEuros = 0;
  let virtualBatteryFee = 0;
  let currentBalance = virtualBatteryBalance;

  // Surplus compensates current month's energy cost.
  // offer.surplusCompensationCapped (default true) caps compensation at energyCost
  // (compensación simplificada RD 244/2019). Set to false for contracts that pay
  // surplus unconditionally (e.g. venta a red).
  const capped = offer.surplusCompensationCapped !== false;
  const surplusCompensation = capped ? Math.min(surplusGenerated, energyCost) : surplusGenerated;

  if (offer.hasVirtualBattery) {
    virtualBatteryFee = offer.virtualBatteryMonthlyFee ?? 0;
  }

  const netEnergyCost = energyCost - surplusCompensation;
  const surplusLeftover = surplusGenerated - surplusCompensation;

  const meterRental = offer.meterRentalPerDay * days;
  const electricityTax = (powerTerm + netEnergyCost) * (offer.electricityTaxPercent / 100);

  // IVA and IE are both calculated on the pre-VB subtotal.
  // The VB credit is applied post-tax, as it works in real Spanish electricity bills.
  const subtotal = netEnergyCost + powerTerm + meterRental + electricityTax + virtualBatteryFee;
  const iva = subtotal * (offer.ivaPercent / 100);
  const totalBeforeVB = subtotal + iva;

  if (offer.hasVirtualBattery) {
    // 1. Use balance from previous months to offset this month's total bill (post-IVA)
    virtualBatteryUsedEuros = Math.min(currentBalance, totalBeforeVB);
    currentBalance -= virtualBatteryUsedEuros;

    // 2. Deposit leftover surplus (what didn't compensate this month) for future months
    virtualBatteryDepositedEuros = surplusLeftover;
    currentBalance += surplusLeftover;
  }

  const total = totalBeforeVB - virtualBatteryUsedEuros;

  return {
    energyCost,
    surplusGenerated,
    surplusCompensation,
    virtualBatteryDepositedEuros,
    virtualBatteryUsedEuros,
    virtualBatteryFee,
    powerTerm,
    meterRental,
    electricityTax,
    iva,
    total,
    newVirtualBatteryBalance: currentBalance,
  };
}
