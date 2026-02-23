import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Button,
  List,
  ListItem,

  IconButton,
  Alert,
  Chip,
  Stack,
  Popover,
  Box,
  Divider,
} from '@mui/material';
import { ExpandMore, UploadFile, Delete, InfoOutlined } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db.ts';
import { parseConsumptionCSV, getConsumptionStats } from '../../utils/csvParser.ts';
import { CSV_FORMATS, type CSVFormat } from '../../utils/csvFormats.tsx';

function FormatInfo({ format }: { format: CSVFormat }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  if (!format.instructions) return null;

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ p: 0.25 }}
        aria-label={`Instrucciones para ${format.name}`}
      >
        <InfoOutlined sx={{ fontSize: 15 }} />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 340 }}>
          <Typography variant="subtitle2" gutterBottom>
            Cómo obtener el CSV — {format.name}
          </Typography>
          <Typography variant="caption" component="div">
            {format.instructions}
          </Typography>
        </Box>
      </Popover>
    </>
  );
}

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
        const { records, formatId } = parseConsumptionCSV(text);
        await db.consumptionData.add({
          fileName: file.name,
          importedAt: new Date().toISOString(),
          formatId,
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

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Formatos soportados:
          </Typography>
          {CSV_FORMATS.map((fmt) => (
            <Stack key={fmt.id} direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="caption">· {fmt.name}</Typography>
              <FormatInfo format={fmt} />
            </Stack>
          ))}
        </Box>

        <Divider sx={{ my: 1 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <List dense disablePadding>
          {datasets?.map((ds, i) => {
            const stats = getConsumptionStats(ds.records);
            return (
              <React.Fragment key={ds.id}>
                {i > 0 && <Divider sx={{ my: 0.4 }} />}
                <ListItem
                secondaryAction={
                  <IconButton size="small" onClick={() => handleDelete(ds.id!)}>
                    <Delete fontSize="small" />
                  </IconButton>
                }
                sx={{ pl: 0 }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0, flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {ds.formatId && (
                      <Chip
                        label={CSV_FORMATS.find((f) => f.id === ds.formatId)?.name ?? ds.formatId}
                        size="small"
                        color="secondary"
                        variant="filled"
                        sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                      />
                    )}
                    <Typography variant="body2">{ds.fileName}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    <Chip label={`${stats.totalKwh.toFixed(0)} kWh`} size="small" />
                    <Chip label={`${stats.days} días`} size="small" />
                    <Chip label={`${stats.avgDailyKwh.toFixed(1)} kWh/día`} size="small" />
                  </Stack>
                </Box>
              </ListItem>
              </React.Fragment>
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
