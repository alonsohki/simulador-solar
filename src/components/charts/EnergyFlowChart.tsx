import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip as MuiTooltip,
  useTheme,
  type Theme,
} from '@mui/material';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/es';
import type { HourlySimResult } from '../../utils/billCalculator.ts';

interface Props {
  hourlyResults: HourlySimResult[];
  title: string;
}

function formatDDMM(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}

function formatDDMMYYYY(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

interface ChartRow {
  label: string;
  tooltipTitle: string;
  _date: string; // YYYY-MM-DD — used to map selection back to dates
  Consumo: number;
  Solar: number;
  Red: number;
  Excedente: number;
  Batería: number;
}

interface SelPoint {
  label: string; // x-axis label, for ReferenceArea positioning
  date: string;  // YYYY-MM-DD, for computing the new startDate/endDate
}

function CustomTooltip({
  active,
  payload,
  theme,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; payload: ChartRow }[];
  theme: Theme;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        boxShadow: theme.shadows[2],
      }}
    >
      <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
        {row.tooltipTitle}
      </Typography>
      {sorted.map((entry) => (
        <Typography key={entry.name} variant="caption" sx={{ color: entry.color, display: 'block' }}>
          {entry.name}: {entry.value} kWh
        </Typography>
      ))}
    </Box>
  );
}

export default function EnergyFlowChart({ hourlyResults, title }: Props) {
  const theme = useTheme();
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(
    () => [...new Set(hourlyResults.map((h) => h.date))].sort(),
    [hourlyResults],
  );

  const [startDate, setStartDate] = useState(dates[0] ?? '');
  const [endDate, setEndDate] = useState(dates[dates.length - 1] ?? '');

  // Drag-to-zoom selection — refs avoid stale closures in event handlers
  const isSelectingRef = useRef(false);
  const selStartRef = useRef<SelPoint | null>(null);
  const selEndRef = useRef<SelPoint | null>(null);
  // Stable ref to latest data — populated after useMemo below
  const dataRef = useRef<ChartRow[]>([]);
  // State only for rendering the ReferenceArea while dragging
  const [selArea, setSelArea] = useState<{ start: SelPoint | null; end: SelPoint | null }>({
    start: null,
    end: null,
  });

  const { data, isDaily } = useMemo(() => {
    const filtered = hourlyResults
      .filter((h) => h.date >= startDate && h.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

    const uniqueDays = new Set(filtered.map((h) => h.date));
    const dayCount = uniqueDays.size;
    const daily = dayCount > 7;

    let rows: ChartRow[];

    if (daily) {
      const byDay = new Map<string, ChartRow>();
      for (const h of filtered) {
        let row = byDay.get(h.date);
        if (!row) {
          row = {
            label: formatDDMM(h.date),
            tooltipTitle: formatDDMMYYYY(h.date),
            _date: h.date,
            Consumo: 0,
            Solar: 0,
            Red: 0,
            Excedente: 0,
            Batería: 0,
          };
          byDay.set(h.date, row);
        }
        row.Consumo += h.consumption;
        row.Solar += h.solarProduction;
        row.Red += h.gridPurchase;
        row.Excedente += h.gridSurplus;
        row.Batería += h.batteryCharge;
      }
      rows = [...byDay.values()].map((r) => ({
        ...r,
        Consumo: Math.round(r.Consumo * 1000) / 1000,
        Solar: Math.round(r.Solar * 1000) / 1000,
        Red: Math.round(r.Red * 1000) / 1000,
        Excedente: Math.round(r.Excedente * 1000) / 1000,
        Batería: Math.round(r.Batería * 1000) / 1000,
      }));
    } else {
      rows = filtered.map((h) => ({
        label: dayCount > 1 ? `${formatDDMM(h.date)} ${h.hour}h` : `${h.hour}h`,
        tooltipTitle: `${formatDDMMYYYY(h.date)} - ${h.hour}h`,
        _date: h.date,
        Consumo: Math.round(h.consumption * 1000) / 1000,
        Solar: Math.round(h.solarProduction * 1000) / 1000,
        Red: Math.round(h.gridPurchase * 1000) / 1000,
        Excedente: Math.round(h.gridSurplus * 1000) / 1000,
        Batería: Math.round(h.batteryCharge * 1000) / 1000,
      }));
    }

    return { data: rows, isDaily: daily };
  }, [hourlyResults, startDate, endDate]);

  // Keep dataRef current so handlers can do label→date lookups without depending on data
  dataRef.current = data;

  // Keep a stable ref so the wheel handler always reads fresh dates without re-attaching
  const zoomRef = useRef({ startDate, endDate, dates });
  zoomRef.current = { startDate, endDate, dates };

  // Non-passive wheel listener (React's onWheel is passive and can't preventDefault)
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { startDate: sd, endDate: ed, dates: ds } = zoomRef.current;
      if (ds.length < 2) return;

      // deltaY > 0 → scroll down → zoom out; < 0 → zoom in
      const factor = e.deltaY > 0 ? 1.5 : 1 / 1.5;
      const startDj = dayjs(sd);
      const endDj = dayjs(ed);
      const rangeDays = Math.max(1, endDj.diff(startDj, 'day'));
      const centerDj = startDj.add(Math.floor(rangeDays / 2), 'day');
      const newHalf = Math.ceil((rangeDays * factor) / 2);

      let ns = centerDj.subtract(newHalf, 'day').format('YYYY-MM-DD');
      let ne = centerDj.add(newHalf, 'day').format('YYYY-MM-DD');

      if (ns < ds[0]) ns = ds[0];
      if (ne > ds[ds.length - 1]) ne = ds[ds.length - 1];
      // Prevent collapsing below 1 day
      if (ns >= ne) return;

      setStartDate(ns);
      setEndDate(ne);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // stable: only attaches/detaches on mount/unmount

  // --- Drag-to-zoom handlers ---

  // Resolve a SelPoint from a Recharts chart event.
  // activePayload can be empty when clicking the chart background, so we fall
  // back to looking up _date in the data array by label.
  const resolvePoint = useCallback((e: any): SelPoint | null => {
    const label: string | undefined = e?.activeLabel;
    if (!label) return null;
    const date: string | undefined =
      e?.activePayload?.[0]?.payload?._date ??
      dataRef.current.find((d) => d.label === label)?._date;
    if (!date) return null;
    return { label, date };
  }, []);

  const handleChartMouseDown = useCallback((e: any) => {
    const pt = resolvePoint(e);
    if (!pt) return;
    isSelectingRef.current = true;
    selStartRef.current = pt;
    selEndRef.current = pt;
    setSelArea({ start: pt, end: pt });
  }, [resolvePoint]);

  const handleChartMouseMove = useCallback((e: any) => {
    if (!isSelectingRef.current) return;
    const pt = resolvePoint(e);
    if (!pt) return;
    selEndRef.current = pt;
    setSelArea((prev) => ({ ...prev, end: pt }));
  }, [resolvePoint]);

  // Global mouseup: commits the zoom even if the mouse is released outside the chart
  useEffect(() => {
    const commitZoom = () => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;

      const start = selStartRef.current;
      const end = selEndRef.current;
      selStartRef.current = null;
      selEndRef.current = null;
      setSelArea({ start: null, end: null });

      if (!start || !end) return;

      const ns = start.date <= end.date ? start.date : end.date;
      const ne = start.date <= end.date ? end.date : start.date;
      // Ignore single-point clicks (no meaningful range selected)
      if (ns === ne) return;
      setStartDate(ns);
      setEndDate(ne);
    };

    window.addEventListener('mouseup', commitZoom);
    return () => window.removeEventListener('mouseup', commitZoom);
  }, []); // stable: setStartDate/setEndDate are stable, refs are always fresh

  const handleChartMouseLeave = useCallback(() => {
    // Cancel visual selection when mouse leaves; global mouseup handles commit
    if (!isSelectingRef.current) return;
    isSelectingRef.current = false;
    selStartRef.current = null;
    selEndRef.current = null;
    setSelArea({ start: null, end: null });
  }, []);

  // --- Reset zoom ---
  const resetZoom = useCallback(() => {
    setStartDate(dates[0]);
    setEndDate(dates[dates.length - 1]);
  }, [dates]);

  const isZoomed = startDate !== dates[0] || endDate !== dates[dates.length - 1];

  // Normalise ReferenceArea endpoints so x1 comes before x2 in data order
  const refLeft =
    selArea.start && selArea.end
      ? selArea.start.date <= selArea.end.date
        ? selArea.start.label
        : selArea.end.label
      : undefined;
  const refRight =
    selArea.start && selArea.end
      ? selArea.start.date <= selArea.end.date
        ? selArea.end.label
        : selArea.start.label
      : undefined;
  const isSelecting = selArea.start !== null;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="subtitle2">{title}</Typography>
        <Chip
          label={isDaily ? 'Diario' : 'Horario'}
          size="small"
          variant="outlined"
        />
        {isZoomed && (
          <MuiTooltip title="Ver periodo completo">
            <IconButton size="small" onClick={resetZoom} color="primary">
              <ZoomOutMapIcon fontSize="small" />
            </IconButton>
          </MuiTooltip>
        )}
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
          <DatePicker
            label="Desde"
            views={['year', 'month', 'day']}
            value={dayjs(startDate)}
            onChange={(v: Dayjs | null) => v && setStartDate(v.format('YYYY-MM-DD'))}
            minDate={dayjs(dates[0])}
            maxDate={dayjs(endDate)}
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
          <DatePicker
            label="Hasta"
            views={['year', 'month', 'day']}
            value={dayjs(endDate)}
            onChange={(v: Dayjs | null) => v && setEndDate(v.format('YYYY-MM-DD'))}
            minDate={dayjs(startDate)}
            maxDate={dayjs(dates[dates.length - 1])}
            slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
          />
        </LocalizationProvider>
      </Box>
      <Box
        ref={chartWrapRef}
        sx={{ userSelect: 'none', cursor: isSelecting ? 'crosshair' : 'default' }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis unit={isDaily ? ' kWh/día' : ' kWh'} />
            <Tooltip
              content={({ active, payload }) =>
                isSelecting ? null : (
                  <CustomTooltip active={active} payload={payload as never} theme={theme} />
                )
              }
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="Consumo"
              stroke="#d32f2f"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Red"
              stroke="#1565c0"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Solar"
              stroke="#f57c00"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Batería"
              stroke="#7b1fa2"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Excedente"
              stroke="#388e3c"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {refLeft && refRight && (
              <ReferenceArea
                x1={refLeft}
                x2={refRight}
                fill={theme.palette.primary.main}
                fillOpacity={0.15}
                stroke={theme.palette.primary.main}
                strokeOpacity={0.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
