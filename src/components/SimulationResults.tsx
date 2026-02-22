import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Collapse,
  IconButton,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import type { SimulationResult } from '../utils/simulation.ts';
import type { Battery } from '../db.ts';
import CostComparisonChart from './charts/CostComparisonChart.tsx';
import EnergyFlowChart from './charts/EnergyFlowChart.tsx';

interface Props {
  results: SimulationResult[];
  batteries: Battery[];
}

function ResultRow({
  result,
  rank,
  showVirtualBattery,
  paybackYears,
}: {
  result: SimulationResult;
  rank: number;
  showVirtualBattery: boolean;
  paybackYears: number | null;
}) {
  const [open, setOpen] = useState(false);
  const hasVirtualBattery = result.monthlyBreakdown.some((mb) => mb.virtualBatteryBalance > 0 || mb.virtualBatteryDepositedEuros > 0);

  return (
    <>
      <TableRow hover>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </TableCell>
        <TableCell>#{rank}</TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>
            {result.offerName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {result.companyName}
          </Typography>
        </TableCell>
        <TableCell>
          {result.batteryName}
          {paybackYears !== null && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({paybackYears.toFixed(1)} años)
            </Typography>
          )}
        </TableCell>
        <TableCell align="right">
          <Typography fontWeight={600}>{result.totalAnnualCost.toFixed(2)} €</Typography>
        </TableCell>
        <TableCell align="right">{result.totalConsumption.toFixed(0)} kWh</TableCell>
        <TableCell align="right">{result.totalSolarProduction.toFixed(0)} kWh</TableCell>
        <TableCell align="right">{result.totalGridPurchase.toFixed(0)} kWh</TableCell>
        <TableCell align="right">{result.totalGridSurplus.toFixed(0)} kWh</TableCell>
        <TableCell align="right">
          <Chip
            label={`${(result.selfConsumptionRatio * 100).toFixed(1)}%`}
            size="small"
            color={
              result.selfConsumptionRatio > 0.7 ? 'success' : result.selfConsumptionRatio > 0.4 ? 'warning' : 'default'
            }
          />
        </TableCell>
        {showVirtualBattery && (
          <TableCell align="right">{result.virtualBatteryBalance.toFixed(2)} €</TableCell>
        )}
      </TableRow>
      <TableRow>
        <TableCell colSpan={showVirtualBattery ? 11 : 10} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Desglose Mensual
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mes</TableCell>
                      <TableCell align="right">Energía</TableCell>
                      <TableCell align="right">Compensación</TableCell>
                      <TableCell align="right">Potencia</TableCell>
                      <TableCell align="right">Contador</TableCell>
                      <TableCell align="right">Imp. eléctrico</TableCell>
                      <TableCell align="right">IVA</TableCell>
                      <TableCell align="right">Total</TableCell>
                      {hasVirtualBattery && <TableCell align="right">Saldo bat. virtual</TableCell>}
                      <TableCell align="right">Autoconsumo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.monthlyBreakdown.map((mb) => (
                      <TableRow key={mb.month}>
                        <TableCell>{mb.month}</TableCell>
                        <TableCell align="right">{mb.energyCost.toFixed(2)} €</TableCell>
                        <TableCell align="right">
                          {mb.surplusCompensation >= 0.005 ? `-${mb.surplusCompensation.toFixed(2)} €` : '—'}
                        </TableCell>
                        <TableCell align="right">{mb.powerTerm.toFixed(2)} €</TableCell>
                        <TableCell align="right">{mb.meterRental.toFixed(2)} €</TableCell>
                        <TableCell align="right">{mb.electricityTax.toFixed(2)} €</TableCell>
                        <TableCell align="right">{mb.iva.toFixed(2)} €</TableCell>
                        <TableCell align="right">
                          <strong>{mb.total.toFixed(2)} €</strong>
                        </TableCell>
                        {hasVirtualBattery && (
                          <TableCell align="right">{mb.virtualBatteryBalance.toFixed(2)} €</TableCell>
                        )}
                        <TableCell align="right">{(mb.selfConsumptionRatio * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ mt: 2 }}>
                <EnergyFlowChart
                  hourlyResults={result.hourlyResults}
                  title={`${result.offerName} - ${result.batteryName}`}
                />
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function computePayback(
  result: SimulationResult,
  allResults: SimulationResult[],
  batteries: Battery[],
): number | null {
  if (result.batteryId === null) return null;

  const battery = batteries.find((b) => b.id === result.batteryId);
  if (!battery?.priceEur) return null;

  // Baseline: same offer, same installation, no battery
  const baseline = allResults.find(
    (r) => r.offerId === result.offerId &&
      r.installationId === result.installationId &&
      r.batteryId === null,
  );
  if (!baseline) return null;

  const annualSavings = baseline.totalAnnualCost - result.totalAnnualCost;
  if (annualSavings <= 0) return null;

  return battery.priceEur / annualSavings;
}

export default function SimulationResults({ results, batteries }: Props) {
  const sorted = [...results].sort((a, b) => a.totalAnnualCost - b.totalAnnualCost);
  const anyHasVirtualBattery = sorted.some((r) => r.virtualBatteryBalance > 0 ||
    r.monthlyBreakdown.some((mb) => mb.virtualBatteryDepositedEuros > 0));

  const paybackMap = new Map(
    sorted.map((r) => [`${r.offerId}-${r.batteryId}`, computePayback(r, sorted, batteries)]),
  );
  const anyHasPayback = [...paybackMap.values()].some((v) => v !== null);

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Resultados de la Simulación</Typography>

      <CostComparisonChart results={sorted} />

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={50} />
              <TableCell width={50}>#</TableCell>
              <TableCell>Oferta</TableCell>
              <TableCell>
                Batería
                {anyHasPayback && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    (años amort.)
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">Coste Total</TableCell>
              <TableCell align="right">Consumo</TableCell>
              <TableCell align="right">Solar</TableCell>
              <TableCell align="right">Red</TableCell>
              <TableCell align="right">Excedente</TableCell>
              <TableCell align="right">Autoconsumo</TableCell>
              {anyHasVirtualBattery && <TableCell align="right">Saldo bat. virtual</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((result, i) => (
              <ResultRow
                key={`${result.offerId}-${result.batteryId}`}
                result={result}
                rank={i + 1}
                showVirtualBattery={anyHasVirtualBattery}
                paybackYears={paybackMap.get(`${result.offerId}-${result.batteryId}`) ?? null}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
