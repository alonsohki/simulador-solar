import type { CompanyOffer, TariffSchedule } from '../db.ts';
import { resolveTariffPeriod } from './tariffSchedule.ts';
import { ensurePvpcCached, loadPvpcPrices } from './pvpc.ts';

export interface EnergyPriceQuery {
  date: string;
  hour: number;
}

export type EnergyPriceResolver = (queries: EnergyPriceQuery[]) => Promise<number[]>;

export function createEnergyPriceResolver(
  offer: CompanyOffer,
  schedule: TariffSchedule | null,
): EnergyPriceResolver {
  if (offer.usePvpcPrices) {
    return async (queries) => {
      const dates = [...new Set(queries.map((q) => q.date))];
      await ensurePvpcCached(dates);
      const priceMap = await loadPvpcPrices(dates);
      return queries.map(({ date, hour }) => {
        // hour is 1-24 (Spanish CSV convention), convert to 0-23 for the price map
        const h = hour - 1;
        const key = `${date}-${String(h).padStart(2, '0')}`;
        const price = priceMap.get(key);
        if (price === undefined) {
          console.warn(`[PVPC] Precio ausente para ${date} hora ${h} — usando 0. Comprueba que los datos estén cacheados.`);
          return 0;
        }
        return price;
      });
    };
  }

  return async (queries) =>
    queries.map(({ date, hour }) => {
      const period = resolveTariffPeriod(schedule, date, hour);
      return offer.prices[period] ?? 0;
    });
}
