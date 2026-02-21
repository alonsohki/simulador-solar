import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ConsumptionRecord } from '../../db.ts';

interface Props {
  records: ConsumptionRecord[];
}

export default function ConsumptionChart({ records }: Props) {
  const dailyMap = new Map<string, number>();
  for (const r of records) {
    dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.kwh);
  }

  const data = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kwh]) => ({
      date: date.substring(5),
      kWh: Math.round(kwh * 100) / 100,
    }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis unit=" kWh" />
        <Tooltip formatter={(value) => `${Number(value).toFixed(2)} kWh`} />
        <Bar dataKey="kWh" fill="#f57c00" />
      </BarChart>
    </ResponsiveContainer>
  );
}
