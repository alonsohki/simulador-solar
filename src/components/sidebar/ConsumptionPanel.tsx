import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import { ExpandMore, UploadFile, Delete } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db.ts';
import { parseConsumptionCSV, getConsumptionStats } from '../../utils/csvParser.ts';

export default function ConsumptionPanel() {
  const datasets = useLiveQuery(() => db.consumptionData.toArray());
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const records = parseConsumptionCSV(text);
        await db.consumptionData.add({
          fileName: file.name,
          importedAt: new Date().toISOString(),
          records,
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al importar CSV');
      }
    };
    input.click();
  };

  const handleDelete = async (id: number) => {
    await db.consumptionData.delete(id);
  };

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle1" fontWeight={600}>
          Datos de Consumo
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Button
          variant="contained"
          startIcon={<UploadFile />}
          onClick={handleUpload}
          fullWidth
          size="small"
          sx={{ mb: 1 }}
        >
          Importar CSV
        </Button>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <List dense disablePadding>
          {datasets?.map((ds) => {
            const stats = getConsumptionStats(ds.records);
            return (
              <ListItem
                key={ds.id}
                secondaryAction={
                  <IconButton size="small" onClick={() => handleDelete(ds.id!)}>
                    <Delete fontSize="small" />
                  </IconButton>
                }
                sx={{ pl: 0 }}
              >
                <ListItemText
                  primary={ds.fileName}
                  secondary={
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`${stats.totalKwh.toFixed(0)} kWh`} size="small" />
                      <Chip label={`${stats.days} días`} size="small" />
                      <Chip label={`${stats.avgDailyKwh.toFixed(1)} kWh/día`} size="small" />
                    </Stack>
                  }
                />
              </ListItem>
            );
          })}
        </List>

        {(!datasets || datasets.length === 0) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No hay datos importados
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
