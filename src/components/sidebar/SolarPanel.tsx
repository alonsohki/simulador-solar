import { useState, useRef, useEffect, useCallback } from 'react';
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
  Divider,
  Alert,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { ExpandMore, Add, Delete, Edit, WbSunny, MyLocation, Close } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SolarInstallation, type PanelGroup, type Obstacle, type PVGISGroupData } from '../../db.ts';
import { fetchPVGISData } from '../../utils/pvgis.ts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const emptyInstallation: Omit<SolarInstallation, 'id'> = {
  name: '',
  latitude: 37.39,
  longitude: -5.99,
  systemLoss: 14,
  panelGroups: [{ name: 'Grupo 1', peakPowerWp: 9600, tilt: 30, azimuth: 0, heightFromGround: 0, obstacles: [] }],
};

const emptyGroup: PanelGroup = {
  name: '',
  peakPowerWp: 3000,
  tilt: 30,
  azimuth: 0,
  heightFromGround: 0,
  obstacles: [],
};

const emptyObstacle: Obstacle = {
  name: '',
  type: 'solid',
  height: 1,
  direction: 'south',
  distance: 5,
};

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function LocationSearch({ onSelect }: { onSelect: (lat: number, lon: number) => void }) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (query.length < 3) {
      setOptions([]);
      return;
    }
    setLoading(true);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=0`)
      .then((res) => res.json())
      .then((data: NominatimResult[]) => setOptions(data))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleInputChange = (_: unknown, value: string) => {
    setInputValue(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 400);
  };

  return (
    <Autocomplete
      freeSolo
      options={options}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.display_name)}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={(_, value) => {
        if (value && typeof value !== 'string') {
          onSelect(parseFloat(value.lat), parseFloat(value.lon));
        }
      }}
      loading={loading}
      filterOptions={(x) => x}
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Buscar ubicación..."
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: <Search fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />,
            },
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.place_id}>
          <Typography variant="body2" noWrap>
            {option.display_name}
          </Typography>
        </li>
      )}
    />
  );
}

function MapPicker({
  lat,
  lon,
  onLocationSelect,
}: {
  lat: number;
  lon: number;
  onLocationSelect: (lat: number, lon: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([lat, lon], 15);

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri' },
    );
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri' },
    );
    const hybrid = L.layerGroup([satellite, labels]);

    hybrid.addTo(map);
    L.control.layers({ Mapa: streets, Satélite: satellite, Híbrido: hybrid }).addTo(map);

    const marker = L.marker([lat, lon]).addTo(map);
    markerRef.current = marker;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: newLat, lng: newLon } = e.latlng;
      const roundedLat = Math.round(newLat * 10000) / 10000;
      const roundedLon = Math.round(newLon * 10000) / 10000;
      marker.setLatLng([roundedLat, roundedLon]);
      onLocationSelect(roundedLat, roundedLon);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lon]);
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
  }, [lat, lon]);

  return (
    <Box>
      <LocationSearch
        onSelect={(newLat, newLon) => {
          const roundedLat = Math.round(newLat * 10000) / 10000;
          const roundedLon = Math.round(newLon * 10000) / 10000;
          onLocationSelect(roundedLat, roundedLon);
          if (mapRef.current) mapRef.current.setView([roundedLat, roundedLon], 15);
        }}
      />
      <Box ref={containerRef} sx={{ width: '100%', height: 260, borderRadius: 1, mt: 1 }} />
      <Typography variant="caption" color="text.secondary">
        Busca una dirección o haz clic en el mapa
      </Typography>
    </Box>
  );
}

export default function SolarPanel() {
  const installations = useLiveQuery(() => db.solarInstallations.toArray());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyInstallation);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleOpen = (inst?: SolarInstallation) => {
    if (inst) {
      setEditId(inst.id!);
      setForm({
        ...inst,
        panelGroups: inst.panelGroups.map((g) => ({ ...g, obstacles: g.obstacles ?? [] })),
      });
    } else {
      setEditId(null);
      setForm({ ...emptyInstallation, panelGroups: [{ ...emptyGroup, name: 'Grupo 1' }] });
    }
    setOpen(true);
    setFetchError(null);
  };

  const handleSave = async () => {
    if (editId) {
      await db.solarInstallations.update(editId, form);
    } else {
      await db.solarInstallations.add(form as SolarInstallation);
    }
    setOpen(false);
  };

  const handleDelete = async (id: number) => {
    await db.solarInstallations.delete(id);
  };

  const handleFetchPVGIS = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const pvgisData: PVGISGroupData[] = [];
      for (const group of form.panelGroups) {
        const hourlyData = await fetchPVGISData(form.latitude, form.longitude, group, form.systemLoss);
        pvgisData.push({
          groupName: group.name,
          hourlyData,
          fetchParams: {
            peakPowerKw: group.peakPowerWp / 1000,
            tilt: group.tilt,
            azimuth: group.azimuth,
            systemLoss: form.systemLoss,
            lat: form.latitude,
            lon: form.longitude,
          },
        });
      }
      setForm((prev) => ({ ...prev, pvgisData }));
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Error al obtener datos PVGIS');
    } finally {
      setFetching(false);
    }
  };

  const handleGeolocate = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: Math.round(pos.coords.latitude * 10000) / 10000,
          longitude: Math.round(pos.coords.longitude * 10000) / 10000,
        }));
      },
      () => setFetchError('No se pudo obtener la ubicación'),
    );
  };

  const updateGroup = (index: number, updates: Partial<PanelGroup>) => {
    setForm((prev) => ({
      ...prev,
      panelGroups: prev.panelGroups.map((g, i) => (i === index ? { ...g, ...updates } : g)),
    }));
  };

  const addGroup = () => {
    setForm((prev) => ({
      ...prev,
      panelGroups: [...prev.panelGroups, { ...emptyGroup, name: `Grupo ${prev.panelGroups.length + 1}` }],
    }));
  };

  const removeGroup = (index: number) => {
    setForm((prev) => ({
      ...prev,
      panelGroups: prev.panelGroups.filter((_, i) => i !== index),
    }));
  };

  const updateGroupObstacle = (groupIndex: number, obsIndex: number, updates: Partial<Obstacle>) => {
    setForm((prev) => ({
      ...prev,
      panelGroups: prev.panelGroups.map((g, gi) =>
        gi === groupIndex ? { ...g, obstacles: (g.obstacles ?? []).map((o, oi) => (oi === obsIndex ? { ...o, ...updates } : o)) } : g,
      ),
    }));
  };

  const addGroupObstacle = (groupIndex: number) => {
    setForm((prev) => ({
      ...prev,
      panelGroups: prev.panelGroups.map((g, gi) =>
        gi === groupIndex
          ? { ...g, obstacles: [...(g.obstacles ?? []), { ...emptyObstacle, name: `Obstáculo ${(g.obstacles ?? []).length + 1}` }] }
          : g,
      ),
    }));
  };

  const removeGroupObstacle = (groupIndex: number, obsIndex: number) => {
    setForm((prev) => ({
      ...prev,
      panelGroups: prev.panelGroups.map((g, gi) =>
        gi === groupIndex ? { ...g, obstacles: (g.obstacles ?? []).filter((_, oi) => oi !== obsIndex) } : g,
      ),
    }));
  };

  return (
    <>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="subtitle1" fontWeight={600}>
            Instalación Solar
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
            Nueva Instalación
          </Button>
          <List dense disablePadding>
            {installations?.map((inst) => (
              <ListItem
                key={inst.id}
                secondaryAction={
                  <Stack direction="row" spacing={0}>
                    <IconButton size="small" onClick={() => handleOpen(inst)}>
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(inst.id!)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                }
                sx={{ pl: 0 }}
              >
                <ListItemText
                  primary={inst.name}
                  secondary={
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`${inst.panelGroups.reduce((s, g) => s + g.peakPowerWp, 0)} Wp`} size="small" />
                      <Chip label={`${inst.panelGroups.length} grupos`} size="small" />
                      {inst.pvgisData && <Chip label="PVGIS OK" size="small" color="success" />}
                    </Stack>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editId ? 'Editar' : 'Nueva'} Instalación Solar
          <IconButton onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            size="small"
            sx={{ mt: 1, mb: 2 }}
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 2 }}>
            <MapPicker
              lat={form.latitude}
              lon={form.longitude}
              onLocationSelect={(lat, lon) => setForm((prev) => ({ ...prev, latitude: lat, longitude: lon }))}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
              <TextField
                label="Latitud"
                type="number"
                value={form.latitude}
                onChange={(e) => setForm((prev) => ({ ...prev, latitude: +e.target.value }))}
                size="small"
                inputProps={{ step: 0.0001 }}
              />
              <TextField
                label="Longitud"
                type="number"
                value={form.longitude}
                onChange={(e) => setForm((prev) => ({ ...prev, longitude: +e.target.value }))}
                size="small"
                inputProps={{ step: 0.0001 }}
              />
              <Button size="small" startIcon={<MyLocation />} onClick={handleGeolocate}>
                Mi ubicación
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Grupos de Paneles
          </Typography>
          {form.panelGroups.map((group, gi) => (
            <Box key={gi} sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {group.name || `Grupo ${gi + 1}`}
                </Typography>
                <IconButton size="small" onClick={() => removeGroup(gi)} disabled={form.panelGroups.length === 1}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 1, mb: 1 }}>
                <TextField
                  label="Nombre"
                  value={group.name}
                  onChange={(e) => updateGroup(gi, { name: e.target.value })}
                  size="small"
                />
                <TextField
                  label="Wp"
                  type="number"
                  value={group.peakPowerWp}
                  onChange={(e) => updateGroup(gi, { peakPowerWp: +e.target.value })}
                  size="small"
                />
                <TextField
                  label="Inclinación°"
                  type="number"
                  value={group.tilt}
                  onChange={(e) => updateGroup(gi, { tilt: +e.target.value })}
                  size="small"
                />
                <TextField
                  label="Azimut°"
                  type="number"
                  value={group.azimuth}
                  onChange={(e) => updateGroup(gi, { azimuth: +e.target.value })}
                  size="small"
                />
                <TextField
                  label="Elevación (m)"
                  type="number"
                  value={group.heightFromGround}
                  onChange={(e) => updateGroup(gi, { heightFromGround: +e.target.value })}
                  size="small"
                />
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 0.5, display: 'block' }}>
                Obstáculos de este grupo
              </Typography>
              {(group.obstacles ?? []).map((obs, oi) => (
                <Box
                  key={oi}
                  sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 1, mb: 1, alignItems: 'center' }}
                >
                  <TextField
                    label="Nombre"
                    value={obs.name}
                    onChange={(e) => updateGroupObstacle(gi, oi, { name: e.target.value })}
                    size="small"
                  />
                  <TextField
                    label="Dirección"
                    select
                    value={obs.direction}
                    onChange={(e) => updateGroupObstacle(gi, oi, { direction: e.target.value as Obstacle['direction'] })}
                    size="small"
                    slotProps={{ select: { native: true } }}
                  >
                    <option value="north">Norte</option>
                    <option value="south">Sur</option>
                    <option value="east">Este</option>
                    <option value="west">Oeste</option>
                  </TextField>
                  <TextField
                    label="Distancia (m)"
                    type="number"
                    value={obs.distance}
                    onChange={(e) => updateGroupObstacle(gi, oi, { distance: +e.target.value })}
                    size="small"
                    inputProps={{ step: 0.5 }}
                  />
                  <TextField
                    label="Altura (m)"
                    type="number"
                    value={obs.height}
                    onChange={(e) => updateGroupObstacle(gi, oi, { height: +e.target.value })}
                    size="small"
                    inputProps={{ step: 0.5 }}
                  />
                  <TextField
                    label="Tipo"
                    select
                    value={obs.type}
                    onChange={(e) => updateGroupObstacle(gi, oi, { type: e.target.value as 'solid' | 'transparent' })}
                    size="small"
                    slotProps={{ select: { native: true } }}
                  >
                    <option value="solid">Sólido</option>
                    <option value="transparent">Transparente</option>
                  </TextField>
                  <IconButton size="small" onClick={() => removeGroupObstacle(gi, oi)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button size="small" onClick={() => addGroupObstacle(gi)}>
                + Añadir obstáculo
              </Button>
            </Box>
          ))}
          <Button size="small" onClick={addGroup}>
            + Añadir grupo
          </Button>

          <Divider sx={{ my: 2 }} />
          <TextField
            label="Pérdidas del sistema (%)"
            type="number"
            value={form.systemLoss}
            onChange={(e) => setForm((prev) => ({ ...prev, systemLoss: +e.target.value }))}
            size="small"
          />

          <Divider sx={{ my: 2 }} />
          <Button
            variant="contained"
            startIcon={fetching ? <CircularProgress size={16} /> : <WbSunny />}
            onClick={handleFetchPVGIS}
            disabled={fetching}
          >
            {fetching ? 'Obteniendo datos...' : 'Obtener datos PVGIS'}
          </Button>
          {form.pvgisData && (
            <Alert severity="success" sx={{ mt: 1 }}>
              Datos PVGIS obtenidos: {form.pvgisData.reduce((s, g) => s + g.hourlyData.length, 0)} registros horarios
            </Alert>
          )}
          {fetchError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {fetchError}
            </Alert>
          )}
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
