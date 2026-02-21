import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { SimulationResult } from '../../utils/simulation.ts';

interface Props {
  results: SimulationResult[];
}

export default function CostComparisonChart({ results }: Props) {
  const months = results[0]?.monthlyBreakdown.map((m) => m.month) ?? [];

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month };
    for (const result of results) {
      const mb = result.monthlyBreakdown.find((m) => m.month === month);
      const label = `${result.offerName} (${result.batteryName})`;
      entry[label] = mb ? Math.round(mb.total * 100) / 100 : 0;
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
