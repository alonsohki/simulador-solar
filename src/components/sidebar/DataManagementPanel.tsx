import { useState } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Typography, Button, Stack, Alert } from '@mui/material';
import { ExpandMore, Download, Upload } from '@mui/icons-material';
import { db } from '../../db.ts';

export default function DataManagementPanel() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    try {
      const data = {
        solarInstallations: await db.solarInstallations.toArray(),
        tariffSchedules: await db.tariffSchedules.toArray(),
        companyOffers: await db.companyOffers.toArray(),
        batteries: await db.batteries.toArray(),
        consumptionData: await db.consumptionData.toArray(),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `solar-comparator-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Datos exportados correctamente' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Error al exportar datos' });
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.solarInstallations) {
          await db.solarInstallations.clear();
          await db.solarInstallations.bulkAdd(data.solarInstallations);
        }
        if (data.tariffSchedules) {
          await db.tariffSchedules.clear();
          await db.tariffSchedules.bulkAdd(data.tariffSchedules);
        }
        if (data.companyOffers) {
          await db.companyOffers.clear();
          await db.companyOffers.bulkAdd(data.companyOffers);
        }
        if (data.batteries) {
          await db.batteries.clear();
          await db.batteries.bulkAdd(data.batteries);
        }
        if (data.consumptionData) {
          await db.consumptionData.clear();
          await db.consumptionData.bulkAdd(data.consumptionData);
        }

        setMessage({ type: 'success', text: 'Datos importados correctamente' });
      } catch (e) {
        setMessage({ type: 'error', text: 'Error al importar: formato JSON inválido' });
      }
    };
    input.click();
  };

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle1" fontWeight={600}>
          Gestión de Datos
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          <Button variant="outlined" startIcon={<Download />} onClick={handleExport} fullWidth size="small">
            Exportar JSON
          </Button>
          <Button variant="outlined" startIcon={<Upload />} onClick={handleImport} fullWidth size="small">
            Importar JSON
          </Button>
          {message && (
            <Alert severity={message.type} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
