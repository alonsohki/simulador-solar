import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { SimulationResult } from '../../utils/simulation.ts';

interface Props {
  results: SimulationResult[];
  viewYear?: 1 | 2;
}

export default function CostComparisonChart({ results, viewYear = 1 }: Props) {
  const months = results[0]?.monthlyBreakdown.map((m) => m.month) ?? [];

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month };
    for (const result of results) {
      const mb = result.monthlyBreakdown.find((m) => m.month === month);
      const label = `${result.offerName} (${result.batteryName})`;
      const value = mb
        ? (viewYear === 2 && mb.totalSteadyState !== undefined ? mb.totalSteadyState : mb.total)
        : 0;
      entry[label] = Math.round(value * 100) / 100;
    }
    return entry;
  });

  const colors = ['#f57c00', '#1565c0', '#388e3c', '#d32f2f', '#7b1fa2', '#00838f'];

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis unit=" €" />
        <Tooltip formatter={(value) => `${Number(value).toFixed(2)} €`} />
        <Legend />
        {results.map((result, i) => (
          <Bar
            key={`${result.offerId}-${result.batteryId}`}
            dataKey={`${result.offerName} (${result.batteryName})`}
            fill={colors[i % colors.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
