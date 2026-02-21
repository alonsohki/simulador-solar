import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Button,
  Box,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Chip,
  Stack,
  FormControl,
  FormControlLabel,
  Switch,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { ExpandMore, Add, Delete, Edit, Close } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getScheduleSlotNames, getPowerScheduleSlotNames, type CompanyOffer, type TariffSchedule } from '../../db.ts';

const emptyOffer: Omit<CompanyOffer, 'id'> = {
  name: '',
  companyName: '',
  tariffScheduleId: 0,
  prices: { flat: 0.15 },
  surplusCompensationPerKwh: 0.05,
  surplusCompensationCapped: true,
  hasVirtualBattery: false,
  virtualBatteryMonthlyFee: 0,
  contractedPowerKw: { flat: 4.6 },
  powerPrices: { flat: 0.1 },
  meterRentalPerDay: 0.03,
  electricityTaxPercent: 3.8,
  ivaPercent: 21,
};

function priceFieldsForSchedule(
  schedule: TariffSchedule | undefined,
  form: Omit<CompanyOffer, 'id'>,
  setForm: React.Dispatch<React.SetStateAction<Omit<CompanyOffer, 'id'>>>,
) {
  if (!schedule) return null;
  const slotNames = getScheduleSlotNames(schedule);

  return slotNames.map((name) => (
    <TextField
      key={`price-${name}`}
      label={slotNames.length === 1 ? 'Precio (€/kWh)' : `${name.charAt(0).toUpperCase() + name.slice(1)} (€/kWh)`}
      type="number"
      value={form.prices[name] ?? ''}
      onChange={(e) =>
        setForm((prev) => ({ ...prev, prices: { ...prev.prices, [name]: +e.target.value } }))
      }
      size="small"
      slotProps={{ htmlInput: { step: 0.001 } }}
    />
  ));
}

function powerFieldsForSchedule(
  schedule: TariffSchedule | undefined,
  form: Omit<CompanyOffer, 'id'>,
  setForm: React.Dispatch<React.SetStateAction<Omit<CompanyOffer, 'id'>>>,
) {
  if (!schedule) return null;
  const slotNames = getPowerScheduleSlotNames(schedule);

  return slotNames.map((name) => (
    <TextField
      key={`power-${name}`}
      label={
        slotNames.length === 1
          ? 'Potencia (€/kW/día)'
          : `Potencia ${name.charAt(0).toUpperCase() + name.slice(1)} (€/kW/día)`
      }
      type="number"
      value={form.powerPrices[name] ?? ''}
      onChange={(e) =>
        setForm((prev) => ({ ...prev, powerPrices: { ...prev.powerPrices, [name]: +e.target.value } }))
      }
      size="small"
      slotProps={{ htmlInput: { step: 0.0001 } }}
    />
  ));
}

function contractedPowerFields(
  schedule: TariffSchedule | undefined,
  form: Omit<CompanyOffer, 'id'>,
  setForm: React.Dispatch<React.SetStateAction<Omit<CompanyOffer, 'id'>>>,
) {
  if (!schedule) return null;
  const slotNames = getPowerScheduleSlotNames(schedule);
  const currentRecord = typeof form.contractedPowerKw === 'number'
    ? Object.fromEntries(slotNames.map((n) => [n, form.contractedPowerKw as number]))
    : form.contractedPowerKw;

  return slotNames.map((name) => (
    <TextField
      key={`cpower-${name}`}
      label={
        slotNames.length === 1
          ? 'Potencia contratada (kW)'
          : `Pot. contratada ${name.charAt(0).toUpperCase() + name.slice(1)} (kW)`
      }
      type="number"
      value={currentRecord[name] ?? ''}
      onChange={(e) =>
        setForm((prev) => {
          const prevRecord = typeof prev.contractedPowerKw === 'number'
            ? Object.fromEntries(slotNames.map((n) => [n, prev.contractedPowerKw as number]))
            : prev.contractedPowerKw;
          return { ...prev, contractedPowerKw: { ...prevRecord, [name]: +e.target.value } };
        })
      }
      size="small"
      slotProps={{ htmlInput: { step: 0.1 } }}
    />
  ));
}

/** Initialize price records with slot names from the schedule */
function initPricesForSchedule(schedule: TariffSchedule, currentPrices: Record<string, number>): Record<string, number> {
  const slotNames = getScheduleSlotNames(schedule);
  const result: Record<string, number> = {};
  for (const name of slotNames) {
    result[name] = currentPrices[name] ?? 0;
  }
  return result;
}

function initContractedPowerForSchedule(
  schedule: TariffSchedule,
  current: number | Record<string, number>,
): Record<string, number> {
  const slotNames = getPowerScheduleSlotNames(schedule);
  const result: Record<string, number> = {};
  const currentRecord = typeof current === 'number' ? {} : current;
  const fallback = typeof current === 'number' ? current : 0;
  for (const name of slotNames) {
    result[name] = currentRecord[name] ?? fallback;
  }
  return result;
}

function initPowerPricesForSchedule(schedule: TariffSchedule, currentPrices: Record<string, number>): Record<string, number> {
  const slotNames = getPowerScheduleSlotNames(schedule);
  const result: Record<string, number> = {};
  for (const name of slotNames) {
    result[name] = currentPrices[name] ?? 0;
  }
  return result;
}

export default function OffersPanel() {
  const offers = useLiveQuery(() => db.companyOffers.toArray());
  const schedules = useLiveQuery(() => db.tariffSchedules.toArray());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyOffer);

  const handleOpen = (offer?: CompanyOffer) => {
    if (offer) {
      setEditId(offer.id!);
      setForm({
        ...offer,
        tariffScheduleId: offer.tariffScheduleId ?? 0,
        powerPrices: offer.powerPrices ?? { flat: 0.1 },
        hasVirtualBattery: offer.hasVirtualBattery ?? false,
        virtualBatteryMonthlyFee: offer.virtualBatteryMonthlyFee ?? 0,
      });
    } else {
      setEditId(null);
      setForm({ ...emptyOffer, prices: { ...emptyOffer.prices }, powerPrices: { ...emptyOffer.powerPrices } });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    if (editId) {
      await db.companyOffers.update(editId, form);
    } else {
      await db.companyOffers.add(form as CompanyOffer);
    }
    setOpen(false);
  };

  const handleDelete = async (id: number) => {
    await db.companyOffers.delete(id);
  };

  const handleScheduleChange = (scheduleId: number) => {
    const schedule = schedules?.find((s) => s.id === scheduleId);
    if (schedule) {
      const updates: Partial<Omit<CompanyOffer, 'id'>> = {
        tariffScheduleId: scheduleId,
        prices: initPricesForSchedule(schedule, form.prices),
      };
      // If power uses the energy schedule (no independent selection), sync power prices too
      if (!form.powerTariffScheduleId) {
        updates.powerPrices = initPowerPricesForSchedule(schedule, form.powerPrices);
        updates.contractedPowerKw = initContractedPowerForSchedule(schedule, form.contractedPowerKw);
      }
      setForm((prev) => ({ ...prev, ...updates }));
    } else {
      setForm((prev) => ({ ...prev, tariffScheduleId: scheduleId }));
    }
  };

  const handlePowerScheduleChange = (scheduleId: number) => {
    const schedule = scheduleId ? schedules?.find((s) => s.id === scheduleId) : undefined;
    if (schedule) {
      setForm((prev) => ({
        ...prev,
        powerTariffScheduleId: scheduleId,
        powerPrices: initPowerPricesForSchedule(schedule, prev.powerPrices),
        contractedPowerKw: initContractedPowerForSchedule(schedule, prev.contractedPowerKw),
      }));
    } else {
      // Reset to follow energy schedule
      const energySchedule = schedules?.find((s) => s.id === form.tariffScheduleId);
      setForm((prev) => ({
        ...prev,
        powerTariffScheduleId: 0,
        powerPrices: energySchedule ? initPowerPricesForSchedule(energySchedule, prev.powerPrices) : prev.powerPrices,
        contractedPowerKw: energySchedule ? initContractedPowerForSchedule(energySchedule, prev.contractedPowerKw) : prev.contractedPowerKw,
      }));
    }
  };

  const selectedSchedule = schedules?.find((s) => s.id === form.tariffScheduleId);
  const selectedPowerSchedule = form.powerTariffScheduleId
    ? schedules?.find((s) => s.id === form.powerTariffScheduleId)
    : selectedSchedule;

  const scheduleName = (id: number) => schedules?.find((s) => s.id === id)?.name ?? '—';

  return (
    <>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" fontWeight={600}>
            Ofertas de Compañías
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={() => handleOpen()}
            fullWidth
            size="small"
            sx={{ mb: 1 }}
          >
            Nueva Oferta
          </Button>
          <List dense disablePadding>
            {offers?.map((offer) => (
              <ListItem
                key={offer.id}
                secondaryAction={
                  <Stack direction="row" spacing={0}>
                    <IconButton size="small" onClick={() => handleOpen(offer)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(offer.id!)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                }
                sx={{ pl: 0 }}
              >
                <ListItemText
                  primary={offer.name}
                  secondary={
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={offer.companyName} size="small" />
                      <Chip label={scheduleName(offer.tariffScheduleId)} size="small" />
                      {offer.usePvpcPrices && <Chip label="PVPC" size="small" color="info" />}
                    </Stack>
                  }
                  slotProps={{ secondary: { component: 'div' } }}
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editId ? 'Editar' : 'Nueva'} Oferta
          <IconButton onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre de la oferta"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              size="small"
            />
            <TextField
              label="Compañía"
              value={form.companyName}
              onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
              size="small"
            />
          </Box>

          <Box
            component="fieldset"
            sx={{ mt: 2.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, ml: 1.5, mr: 0, mb: 0 }}
          >
            <Typography component="legend" variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 0.5 }}>
              Precio de energía
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl size="small" sx={{ gridColumn: '1 / -1' }}>
                <InputLabel>Horario tarifario</InputLabel>
                <Select
                  value={form.tariffScheduleId}
                  label="Horario tarifario"
                  onChange={(e) => handleScheduleChange(e.target.value as number)}
                >
                  <MenuItem value={0} disabled>
                    Seleccionar...
                  </MenuItem>
                  {schedules?.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.usePvpcPrices ?? false}
                    onChange={(e) => setForm((prev) => ({ ...prev, usePvpcPrices: e.target.checked }))}
                    size="small"
                  />
                }
                label="Usar precios PVPC (mercado regulado)"
                sx={{ gridColumn: '1 / -1' }}
              />
              {form.usePvpcPrices ? (
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
                  Los precios de energía se obtienen automáticamente de REE (apidatos.ree.es)
                </Typography>
              ) : (
                priceFieldsForSchedule(selectedSchedule, form, setForm)
              )}
            </Box>
          </Box>

          <Box
            component="fieldset"
            sx={{ mt: 2.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, ml: 1.5, mr: 0, mb: 0 }}
          >
            <Typography component="legend" variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 0.5 }}>
              Excedentes
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Compensación excedentes (€/kWh)"
                type="number"
                value={form.surplusCompensationPerKwh}
                onChange={(e) => setForm((prev) => ({ ...prev, surplusCompensationPerKwh: +e.target.value }))}
                size="small"
                slotProps={{ htmlInput: { step: 0.001 } }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.surplusCompensationCapped !== false}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, surplusCompensationCapped: e.target.checked }))
                    }
                    size="small"
                  />
                }
                label="Limitar al coste energético"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.hasVirtualBattery ?? false}
                    onChange={(e) => setForm((prev) => ({ ...prev, hasVirtualBattery: e.target.checked }))}
                    size="small"
                  />
                }
                label="Batería virtual"
              />
              {form.hasVirtualBattery && (
                <TextField
                  label="Cuota mensual bat. virtual (€)"
                  type="number"
                  value={form.virtualBatteryMonthlyFee ?? 0}
                  onChange={(e) => setForm((prev) => ({ ...prev, virtualBatteryMonthlyFee: +e.target.value }))}
                  size="small"
                  slotProps={{ htmlInput: { step: 0.01 } }}
                />
              )}
            </Box>
          </Box>

          <Box
            component="fieldset"
            sx={{ mt: 2.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, ml: 1.5, mr: 0, mb: 0 }}
          >
            <Typography component="legend" variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 0.5 }}>
              Potencia
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl size="small" sx={{ gridColumn: '1 / -1' }}>
                <InputLabel>Horario tarifario</InputLabel>
                <Select
                  value={form.powerTariffScheduleId ?? 0}
                  label="Horario tarifario"
                  onChange={(e) => handlePowerScheduleChange(e.target.value as number)}
                >
                  <MenuItem value={0}>Igual que energía</MenuItem>
                  {schedules?.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {contractedPowerFields(selectedPowerSchedule, form, setForm)}
              {form.usePvpcPrices ? (
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
                  Los precios de potencia se obtienen del BOE (peajes + cargos + margen de comercialización) según el año de los datos
                </Typography>
              ) : (
                powerFieldsForSchedule(selectedPowerSchedule, form, setForm)
              )}
            </Box>
          </Box>

          <Box
            component="fieldset"
            sx={{ mt: 2.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, ml: 1.5, mr: 0, mb: 0 }}
          >
            <Typography component="legend" variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 0.5 }}>
              Impuestos y otros
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Alquiler contador (€/día)"
                type="number"
                value={form.meterRentalPerDay}
                onChange={(e) => setForm((prev) => ({ ...prev, meterRentalPerDay: +e.target.value }))}
                size="small"
                slotProps={{ htmlInput: { step: 0.0001 } }}
              />
              <TextField
                label="Impuesto eléctrico (%)"
                type="number"
                value={form.electricityTaxPercent}
                onChange={(e) => setForm((prev) => ({ ...prev, electricityTaxPercent: +e.target.value }))}
                size="small"
                slotProps={{ htmlInput: { step: 0.1 } }}
              />
              <TextField
                label="IVA (%)"
                type="number"
                value={form.ivaPercent}
                onChange={(e) => setForm((prev) => ({ ...prev, ivaPercent: +e.target.value }))}
                size="small"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
