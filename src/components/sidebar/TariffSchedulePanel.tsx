import { useMemo, useState } from 'react';
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
  InputLabel,
  Select,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  Divider,
  Alert,
} from '@mui/material';
import { ExpandMore, Add, Delete, Edit, Close } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TariffSchedule, type TariffType, type DateRange, type TimeSlot } from '../../db.ts';
import { validateSchedule } from '../../utils/tariffSchedule.ts';

const emptyTimeSlot: TimeSlot = { name: '', startHour: 0, endHour: 24 };

const emptyDateRange: DateRange = {
  name: '',
  startMonth: 1,
  startDay: 1,
  endMonth: 12,
  endDay: 31,
  weekendBehavior: 'same',
  timeSlots: [{ ...emptyTimeSlot }],
};

const emptySchedule: Omit<TariffSchedule, 'id'> = {
  name: '',
  type: '2.0TD',
};

export default function TariffSchedulePanel() {
  const schedules = useLiveQuery(() => db.tariffSchedules.toArray());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySchedule);

  const handleOpen = (schedule?: TariffSchedule) => {
    if (schedule) {
      setEditId(schedule.id!);
      setForm({ ...schedule });
    } else {
      setEditId(null);
      setForm({ ...emptySchedule });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    const data = { ...form };
    if (data.type !== 'custom') {
      data.dateRanges = undefined;
    }
    if (editId) {
      await db.tariffSchedules.update(editId, data);
    } else {
      await db.tariffSchedules.add(data as TariffSchedule);
    }
    setOpen(false);
  };

  const handleDelete = async (id: number) => {
    await db.tariffSchedules.delete(id);
  };

  const setType = (type: TariffType) => {
    const updates: Partial<TariffSchedule> = { type };
    if (type === 'custom' && (!form.dateRanges || form.dateRanges.length === 0)) {
      updates.dateRanges = [{ ...emptyDateRange, timeSlots: [{ ...emptyTimeSlot }] }];
    }
    if (type !== 'custom') {
      updates.dateRanges = undefined;
    }
    setForm((prev) => ({ ...prev, ...updates }));
  };

  // --- DateRange helpers ---
  const updateDateRange = (idx: number, patch: Partial<DateRange>) => {
    setForm((prev) => {
      const ranges = [...(prev.dateRanges ?? [])];
      ranges[idx] = { ...ranges[idx], ...patch };
      return { ...prev, dateRanges: ranges };
    });
  };

  const addDateRange = () => {
    setForm((prev) => ({
      ...prev,
      dateRanges: [...(prev.dateRanges ?? []), { ...emptyDateRange, timeSlots: [{ ...emptyTimeSlot }] }],
    }));
  };

  const removeDateRange = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      dateRanges: (prev.dateRanges ?? []).filter((_, i) => i !== idx),
    }));
  };

  // --- TimeSlot helpers ---
  const updateTimeSlot = (drIdx: number, tsIdx: number, patch: Partial<TimeSlot>) => {
    setForm((prev) => {
      const ranges = [...(prev.dateRanges ?? [])];
      const slots = [...ranges[drIdx].timeSlots];
      slots[tsIdx] = { ...slots[tsIdx], ...patch };
      ranges[drIdx] = { ...ranges[drIdx], timeSlots: slots };
      return { ...prev, dateRanges: ranges };
    });
  };

  const addTimeSlot = (drIdx: number) => {
    setForm((prev) => {
      const ranges = [...(prev.dateRanges ?? [])];
      ranges[drIdx] = {
        ...ranges[drIdx],
        timeSlots: [...ranges[drIdx].timeSlots, { ...emptyTimeSlot }],
      };
      return { ...prev, dateRanges: ranges };
    });
  };

  const removeTimeSlot = (drIdx: number, tsIdx: number) => {
    setForm((prev) => {
      const ranges = [...(prev.dateRanges ?? [])];
      ranges[drIdx] = {
        ...ranges[drIdx],
        timeSlots: ranges[drIdx].timeSlots.filter((_, i) => i !== tsIdx),
      };
      return { ...prev, dateRanges: ranges };
    });
  };

  const typeLabel = (type: TariffType) => {
    if (type === 'flat') return 'Plana';
    if (type === '2.0TD') return '2.0TD';
    return 'Custom';
  };

  const validationErrors = useMemo(() => validateSchedule(form), [form]);

  return (
    <>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" fontWeight={600}>
            Horarios Tarifarios
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
            Nuevo Horario
          </Button>
          <List dense disablePadding>
            {schedules?.map((s) => (
              <ListItem
                key={s.id}
                secondaryAction={
                  <Stack direction="row" spacing={0}>
                    <IconButton size="small" onClick={() => handleOpen(s)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(s.id!)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                }
                sx={{ pl: 0 }}
              >
                <ListItemText
                  primary={s.name}
                  secondary={<Chip label={typeLabel(s.type)} size="small" />}
                  slotProps={{ secondary: { component: 'div' } }}
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editId ? 'Editar' : 'Nuevo'} Horario Tarifario
          <IconButton onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              size="small"
            />
            <FormControl size="small">
              <InputLabel>Tipo</InputLabel>
              <Select value={form.type} label="Tipo" onChange={(e) => setType(e.target.value as TariffType)}>
                <MenuItem value="flat">Tarifa plana</MenuItem>
                <MenuItem value="2.0TD">2.0TD (regulado)</MenuItem>
                <MenuItem value="custom">Personalizado</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {form.type === 'flat' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Precio único para todas las horas del día.
            </Typography>
          )}

          {form.type === '2.0TD' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Horario regulado 2.0TD: Punta 10-14h y 18-22h, Llano 8-10h, 14-18h y 22-24h, Valle 0-8h y fines de
              semana/festivos.
            </Typography>
          )}

          {form.type === 'custom' && (
            <Box sx={{ mt: 2 }}>
              {(form.dateRanges ?? []).map((dr, drIdx) => (
                <Box
                  key={drIdx}
                  component="fieldset"
                  sx={{
                    p: 1.5,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <TextField
                      label="Nombre del periodo"
                      value={dr.name}
                      onChange={(e) => updateDateRange(drIdx, { name: e.target.value })}
                      size="small"
                      sx={{ flex: 1, mr: 1 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removeDateRange(drIdx)}
                      disabled={(form.dateRanges ?? []).length <= 1}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, mb: 1.5 }}>
                    <TextField
                      label="Desde día"
                      type="number"
                      value={dr.startDay}
                      onChange={(e) => updateDateRange(drIdx, { startDay: +e.target.value })}
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 31 } }}
                    />
                    <TextField
                      label="Desde mes"
                      type="number"
                      value={dr.startMonth}
                      onChange={(e) => updateDateRange(drIdx, { startMonth: +e.target.value })}
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 12 } }}
                    />
                    <TextField
                      label="Hasta día"
                      type="number"
                      value={dr.endDay}
                      onChange={(e) => updateDateRange(drIdx, { endDay: +e.target.value })}
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 31 } }}
                    />
                    <TextField
                      label="Hasta mes"
                      type="number"
                      value={dr.endMonth}
                      onChange={(e) => updateDateRange(drIdx, { endMonth: +e.target.value })}
                      size="small"
                      slotProps={{ htmlInput: { min: 1, max: 12 } }}
                    />
                  </Box>

                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Fines de semana y festivos
                    </Typography>
                    <RadioGroup
                      row
                      value={dr.weekendBehavior}
                      onChange={(e) =>
                        updateDateRange(drIdx, {
                          weekendBehavior: e.target.value as 'same' | 'specific',
                        })
                      }
                    >
                      <FormControlLabel value="same" control={<Radio size="small" />} label="Mismo horario" />
                      <FormControlLabel value="specific" control={<Radio size="small" />} label="Tramo específico" />
                    </RadioGroup>
                    {dr.weekendBehavior === 'specific' && (
                      <TextField
                        label="Nombre del tramo"
                        value={dr.weekendSlotName ?? ''}
                        onChange={(e) => updateDateRange(drIdx, { weekendSlotName: e.target.value })}
                        size="small"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </Box>

                  <Divider sx={{ mb: 1 }} />
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Franjas horarias
                  </Typography>

                  {dr.timeSlots.map((ts, tsIdx) => (
                    <Box
                      key={tsIdx}
                      sx={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px auto', gap: 1, mb: 1, alignItems: 'center' }}
                    >
                      <TextField
                        label="Nombre"
                        value={ts.name}
                        onChange={(e) => updateTimeSlot(drIdx, tsIdx, { name: e.target.value })}
                        size="small"
                      />
                      <TextField
                        label="Desde"
                        type="number"
                        value={ts.startHour}
                        onChange={(e) => updateTimeSlot(drIdx, tsIdx, { startHour: +e.target.value })}
                        size="small"
                        slotProps={{ htmlInput: { min: 0, max: 23 } }}
                      />
                      <TextField
                        label="Hasta"
                        type="number"
                        value={ts.endHour}
                        onChange={(e) => updateTimeSlot(drIdx, tsIdx, { endHour: +e.target.value })}
                        size="small"
                        slotProps={{ htmlInput: { min: 1, max: 24 } }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeTimeSlot(drIdx, tsIdx)}
                        disabled={dr.timeSlots.length <= 1}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}

                  <Button size="small" startIcon={<Add />} onClick={() => addTimeSlot(drIdx)}>
                    Añadir franja horaria
                  </Button>
                </Box>
              ))}

              <Button variant="outlined" size="small" startIcon={<Add />} onClick={addDateRange} fullWidth>
                Añadir periodo de fechas
              </Button>
            </Box>
          )}
        </DialogContent>
        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mx: 3, mb: 1 }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || validationErrors.length > 0}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
