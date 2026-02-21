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
} from '@mui/material';
import { ExpandMore, Add, Delete, Edit, Close } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Battery } from '../../db.ts';

const emptyBattery: Omit<Battery, 'id'> = {
  name: '',
  capacityKwh: 10,
  maxPowerW: 5000,
  roundTripEfficiency: 90,
};

export default function BatteriesPanel() {
  const batteries = useLiveQuery(() => db.batteries.toArray());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyBattery);

  const handleOpen = (bat?: Battery) => {
    if (bat) {
      setEditId(bat.id!);
      setForm({ ...bat });
    } else {
      setEditId(null);
      setForm({ ...emptyBattery });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    if (editId) {
      await db.batteries.update(editId, form);
    } else {
      await db.batteries.add(form as Battery);
    }
    setOpen(false);
  };

  const handleDelete = async (id: number) => {
    await db.batteries.delete(id);
  };

  return (
    <>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" fontWeight={600}>
            Baterías
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
            Nueva Batería
          </Button>
          <List dense disablePadding>
            {batteries?.map((bat) => (
              <ListItem
                key={bat.id}
                secondaryAction={
                  <Stack direction="row" spacing={0}>
                    <IconButton size="small" onClick={() => handleOpen(bat)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(bat.id!)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                }
                sx={{ pl: 0 }}
              >
                <ListItemText
                  primary={bat.name}
                  secondary={
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`${bat.capacityKwh} kWh`} size="small" />
                      <Chip label={`${bat.maxPowerW} W`} size="small" />
                      <Chip label={`${bat.roundTripEfficiency}% eff.`} size="small" />
                      {bat.priceEur != null && (
                        <Chip label={`${bat.priceEur.toLocaleString('es-ES')} €`} size="small" />
                      )}
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editId ? 'Editar' : 'Nueva'} Batería
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
              sx={{ gridColumn: '1 / -1' }}
            />
            <TextField
              label="Capacidad (kWh)"
              type="number"
              value={form.capacityKwh}
              onChange={(e) => setForm((prev) => ({ ...prev, capacityKwh: +e.target.value }))}
              size="small"
              inputProps={{ step: 0.5 }}
            />
            <TextField
              label="Potencia máx (W)"
              type="number"
              value={form.maxPowerW}
              onChange={(e) => setForm((prev) => ({ ...prev, maxPowerW: +e.target.value }))}
              size="small"
            />
            <TextField
              label="Eficiencia ida y vuelta (%)"
              type="number"
              value={form.roundTripEfficiency}
              onChange={(e) => setForm((prev) => ({ ...prev, roundTripEfficiency: +e.target.value }))}
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              label="Precio (€, opcional)"
              type="number"
              value={form.priceEur ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  priceEur: e.target.value === '' ? undefined : +e.target.value,
                }))
              }
              size="small"
              inputProps={{ min: 0, step: 100 }}
            />
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
