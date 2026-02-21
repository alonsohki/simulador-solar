import { useState, useCallback } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Checkbox,
  ListItemText,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db.ts';
import { runSimulation, type SimulationResult } from '../utils/simulation.ts';
import { createEnergyPriceResolver } from '../utils/energyPriceResolver.ts';
import SimulationResults from '../components/SimulationResults.tsx';
import ConsumptionChart from '../components/charts/ConsumptionChart.tsx';

export default function AnalysisPage() {
  const installations = useLiveQuery(() => db.solarInstallations.toArray());
  const offers = useLiveQuery(() => db.companyOffers.toArray());
  const batteries = useLiveQuery(() => db.batteries.toArray());
  const consumptionSets = useLiveQuery(() => db.consumptionData.toArray());
  const tariffSchedules = useLiveQuery(() => db.tariffSchedules.toArray());

  const [selectedInstallation, setSelectedInstallation] = useState<number | ''>('');
  const [selectedOfferIds, setSelectedOfferIds] = useState<number[]>([]);
  const [selectedBatteryIds, setSelectedBatteryIds] = useState<number[]>([]);
  const [selectedConsumptionIds, setSelectedConsumptionIds] = useState<number[]>([]);
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConsumptionChange = (e: SelectChangeEvent<number[]>) => {
    const value = e.target.value;
    if (Array.isArray(value) && value.includes(-1)) {
      if (selectedConsumptionIds.length === (consumptionSets?.length ?? 0)) {
        setSelectedConsumptionIds([]);
      } else {
        setSelectedConsumptionIds(consumptionSets?.map((c) => c.id!) ?? []);
      }
    } else {
      setSelectedConsumptionIds(value as number[]);
    }
  };

  const handleOffersChange = (e: SelectChangeEvent<number[]>) => {
    const value = e.target.value;
    if (Array.isArray(value) && value.includes(-1)) {
      // "Select All" toggle
      if (selectedOfferIds.length === (offers?.length ?? 0)) {
        setSelectedOfferIds([]);
      } else {
        setSelectedOfferIds(offers?.map((o) => o.id!) ?? []);
      }
    } else {
      setSelectedOfferIds(value as number[]);
    }
  };

  const handleBatteriesChange = (e: SelectChangeEvent<number[]>) => {
    const value = e.target.value;
    if (Array.isArray(value) && value.includes(-1)) {
      // "Select All" toggles all real batteries + sin batería
      const allIds = [0, ...(batteries?.map((b) => b.id!) ?? [])];
      if (selectedBatteryIds.length === allIds.length) {
        setSelectedBatteryIds([]);
      } else {
        setSelectedBatteryIds(allIds);
      }
    } else {
      setSelectedBatteryIds(value as number[]);
    }
  };

  const handleRun = useCallback(() => {
    if (!installations || !offers || !consumptionSets) return;

    const installation = installations.find((i) => i.id === selectedInstallation);
    if (!installation) {
      setError('Selecciona una instalación solar');
      return;
    }

    const selectedSets = consumptionSets.filter((c) => selectedConsumptionIds.includes(c.id!));
    if (selectedSets.length === 0) {
      setError('Selecciona datos de consumo');
      return;
    }

    const selectedOffers = offers.filter((o) => selectedOfferIds.includes(o.id!));
    if (selectedOffers.length === 0) {
      setError('Selecciona al menos una oferta');
      return;
    }

    // Merge records from all selected consumption sets, deduplicating by date+hour
    const recordMap = new Map<string, { date: string; hour: number; kwh: number }>();
    for (const cs of selectedSets) {
      for (const r of cs.records) {
        const key = `${r.date}-${r.hour}`;
        recordMap.set(key, r);
      }
    }
    const mergedRecords = [...recordMap.values()];

    const includeNoBattery = selectedBatteryIds.includes(0);
    const selectedBats = batteries?.filter((b) => selectedBatteryIds.includes(b.id!)) ?? [];

    if (!includeNoBattery && selectedBats.length === 0) {
      setError('Selecciona al menos una opción de batería');
      return;
    }

    setError(null);
    setRunning(true);

    // Run simulations asynchronously
    (async () => {
      try {
        const allResults: SimulationResult[] = [];

        for (const offer of selectedOffers) {
          const schedule = tariffSchedules?.find((s) => s.id === offer.tariffScheduleId) ?? null;
          const powerSchedule = offer.powerTariffScheduleId
            ? tariffSchedules?.find((s) => s.id === offer.powerTariffScheduleId) ?? schedule
            : schedule;
          const resolver = createEnergyPriceResolver(offer, schedule);

          if (includeNoBattery) {
            allResults.push(await runSimulation(mergedRecords, installation, offer, null, schedule, powerSchedule, resolver));
          }

          for (const bat of selectedBats) {
            allResults.push(await runSimulation(mergedRecords, installation, offer, bat, schedule, powerSchedule, resolver));
          }
        }

        setResults(allResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error durante la simulación');
      } finally {
        setRunning(false);
      }
    })();
  }, [
    installations,
    offers,
    batteries,
    consumptionSets,
    tariffSchedules,
    selectedInstallation,
    selectedOfferIds,
    selectedBatteryIds,
    selectedConsumptionIds,
  ]);

  const selectedConsumptionRecords = (() => {
    if (!consumptionSets || selectedConsumptionIds.length === 0) return null;
    const sets = consumptionSets.filter((c) => selectedConsumptionIds.includes(c.id!));
    const recordMap = new Map<string, { date: string; hour: number; kwh: number }>();
    for (const cs of sets) {
      for (const r of cs.records) {
        recordMap.set(`${r.date}-${r.hour}`, r);
      }
    }
    return [...recordMap.values()];
  })();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Análisis y Simulación
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Datos de consumo</InputLabel>
            <Select
              multiple
              value={selectedConsumptionIds}
              label="Datos de consumo"
              onChange={handleConsumptionChange}
              renderValue={(selected) => `${selected.length} seleccionados`}
            >
              <MenuItem value={-1}>
                <Checkbox checked={selectedConsumptionIds.length === (consumptionSets?.length ?? 0)} />
                <ListItemText primary="Seleccionar todos" />
              </MenuItem>
              {consumptionSets?.map((cs) => (
                <MenuItem key={cs.id} value={cs.id}>
                  <Checkbox checked={selectedConsumptionIds.includes(cs.id!)} />
                  <ListItemText primary={cs.fileName} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Instalación solar</InputLabel>
            <Select
              value={selectedInstallation}
              label="Instalación solar"
              onChange={(e) => setSelectedInstallation(e.target.value as number)}
            >
              {installations?.map((inst) => (
                <MenuItem key={inst.id} value={inst.id}>
                  {inst.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Ofertas</InputLabel>
            <Select
              multiple
              value={selectedOfferIds}
              label="Ofertas"
              onChange={handleOffersChange}
              renderValue={(selected) => `${selected.length} seleccionadas`}
            >
              <MenuItem value={-1}>
                <Checkbox checked={selectedOfferIds.length === (offers?.length ?? 0)} />
                <ListItemText primary="Seleccionar todas" />
              </MenuItem>
              {offers?.map((offer) => (
                <MenuItem key={offer.id} value={offer.id}>
                  <Checkbox checked={selectedOfferIds.includes(offer.id!)} />
                  <ListItemText primary={offer.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Baterías</InputLabel>
            <Select
              multiple
              value={selectedBatteryIds}
              label="Baterías"
              onChange={handleBatteriesChange}
              renderValue={(selected) => {
                const parts: string[] = [];
                if (selected.includes(0)) parts.push('Sin batería');
                const batCount = selected.filter((id) => id !== 0).length;
                if (batCount > 0) parts.push(`${batCount} batería${batCount > 1 ? 's' : ''}`);
                return parts.join(', ') || 'Ninguna';
              }}
            >
              <MenuItem value={-1}>
                <Checkbox checked={selectedBatteryIds.length === (batteries?.length ?? 0) + 1} />
                <ListItemText primary="Seleccionar todas" />
              </MenuItem>
              <MenuItem value={0}>
                <Checkbox checked={selectedBatteryIds.includes(0)} />
                <ListItemText primary="Sin batería" />
              </MenuItem>
              {batteries?.map((bat) => (
                <MenuItem key={bat.id} value={bat.id}>
                  <Checkbox checked={selectedBatteryIds.includes(bat.id!)} />
                  <ListItemText primary={bat.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Button
          variant="contained"
          startIcon={running ? <CircularProgress size={16} /> : <PlayArrow />}
          onClick={handleRun}
          disabled={running}
          size="large"
        >
          {running ? 'Simulando...' : 'Ejecutar Simulación'}
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {selectedConsumptionRecords && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Consumo diario
          </Typography>
          <ConsumptionChart records={selectedConsumptionRecords} />
        </Paper>
      )}

      {results && <SimulationResults results={results} batteries={batteries ?? []} />}
    </Box>
  );
}
