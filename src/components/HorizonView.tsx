import type { Obstacle, ObstacleDirection } from '../db.ts';
import { getSunPosition } from '../utils/shadows.ts';

// SVG layout constants
const W = 1000;
const H = 260;
const ML = 32; // left margin for elevation labels
const MR = 8;
const MT = 12;
const MB = 30; // bottom margin for azimuth labels
const CW = W - ML - MR;
const CH = H - MT - MB;
const MAX_ELEV = 80;

const azToX = (az: number): number => ML + (az / 360) * CW;
const elevToY = (el: number): number => MT + CH - (el / MAX_ELEV) * CH;

const MONTHS = [
  { month: 12, label: 'Dic', color: '#60a5fa' },
  { month: 3, label: 'Mar/Sep', color: '#4ade80' },
  { month: 6, label: 'Jun', color: '#fb923c' },
];

const CARDINALS = [
  { az: 0, label: 'N' },
  { az: 45, label: 'NE' },
  { az: 90, label: 'E' },
  { az: 135, label: 'SE' },
  { az: 180, label: 'S' },
  { az: 225, label: 'SO' },
  { az: 270, label: 'O' },
  { az: 315, label: 'NO' },
  { az: 360, label: 'N' },
];

const DIRECTION_AZIMUTH_FALLBACK: Record<ObstacleDirection, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

function getObstacleCenter(obs: Obstacle): number {
  if (obs.azimuthDeg !== undefined) return obs.azimuthDeg;
  const legacy = obs as Obstacle & { direction?: ObstacleDirection };
  return DIRECTION_AZIMUTH_FALLBACK[legacy.direction ?? 'south'] ?? 180;
}

function getObstacleHalfWidth(obs: Obstacle): number {
  const widthM = (obs.widthM ?? 0);
  if (widthM > 0 && obs.distance > 0)
    return Math.atan(widthM / 2 / obs.distance) * (180 / Math.PI);
  if (obs.angularWidthDeg !== undefined) return obs.angularWidthDeg / 2;
  return 45;
}

interface Props {
  obstacles: Obstacle[];
  latitude: number;
  panelHeight: number;
  svgHeight?: number;
}

export default function HorizonView({ obstacles, latitude, panelHeight, svgHeight = 220 }: Props) {
  // Compute sun paths for key months
  const sunPaths = MONTHS.map(({ month, color, label }) => {
    const pts: string[] = [];
    for (let h = 1; h <= 24; h++) {
      const pos = getSunPosition(h, month, latitude);
      if (pos) {
        pts.push(`${azToX(pos.azimuth).toFixed(1)},${elevToY(pos.elevation).toFixed(1)}`);
      }
    }
    return { month, color, label, pts };
  });

  // Build obstacle rectangles (with wrap-around support)
  const obstacleElements: React.ReactNode[] = [];
  obstacles.forEach((obs, i) => {
    if (obs.distance <= 0) return;
    const center = getObstacleCenter(obs);
    const half = getObstacleHalfWidth(obs);
    const effH = Math.max(0, obs.height - panelHeight);
    if (effH <= 0) return;

    const elevDeg = Math.min(MAX_ELEV, (Math.atan(effH / obs.distance) * 180) / Math.PI);
    const y1 = elevToY(elevDeg);
    const y2 = elevToY(0);
    const rectH = y2 - y1;

    const fill = obs.type === 'solid' ? 'rgba(239,68,68,0.28)' : 'rgba(245,158,11,0.25)';
    const stroke = obs.type === 'solid' ? '#ef4444' : '#f59e0b';

    const left = center - half;
    const right = center + half;

    const makeRect = (l: number, r: number, suffix: string) => {
      const x1 = azToX(Math.max(0, l));
      const x2 = azToX(Math.min(360, r));
      if (x2 <= x1) return null;
      return (
        <rect
          key={`obs-${i}-${suffix}`}
          x={x1}
          y={y1}
          width={x2 - x1}
          height={rectH}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      );
    };

    if (left < 0) {
      obstacleElements.push(makeRect(0, right, 'a'));
      obstacleElements.push(makeRect(left + 360, 360, 'b'));
    } else if (right > 360) {
      obstacleElements.push(makeRect(left, 360, 'a'));
      obstacleElements.push(makeRect(0, right - 360, 'b'));
    } else {
      obstacleElements.push(makeRect(left, right, 'a'));
    }

    // Name label above the obstacle bar
    const labelX = azToX(((center % 360) + 360) % 360);
    if (labelX >= ML && labelX <= W - MR) {
      obstacleElements.push(
        <text
          key={`obs-${i}-label`}
          x={labelX}
          y={Math.max(MT + 1, y1 - 3)}
          textAnchor="middle"
          fontSize={10}
          fill={stroke}
          fontWeight="600"
        >
          {obs.name || `Obs ${i + 1}`}
        </text>,
      );
    }
  });

  return (
    <svg
      width="100%"
      height={svgHeight}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block' }}
      aria-label="Perfil de horizonte con trayectorias solares"
    >
      {/* Chart background */}
      <rect x={ML} y={MT} width={CW} height={CH} fill="currentColor" fillOpacity={0.03} />

      {/* Elevation grid lines */}
      {[20, 40, 60, 80].map((el) => (
        <g key={`el-${el}`}>
          <line
            x1={ML}
            y1={elevToY(el)}
            x2={W - MR}
            y2={elevToY(el)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text x={ML - 4} y={elevToY(el) + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>
            {el}°
          </text>
        </g>
      ))}

      {/* Ground line (0° elevation) */}
      <line
        x1={ML}
        y1={elevToY(0)}
        x2={W - MR}
        y2={elevToY(0)}
        stroke="currentColor"
        strokeOpacity={0.45}
        strokeWidth={1.5}
      />

      {/* Cardinal direction grid lines and labels */}
      {CARDINALS.map(({ az, label }) => (
        <g key={`card-${az}-${label}`}>
          <line
            x1={azToX(az)}
            y1={MT}
            x2={azToX(az)}
            y2={elevToY(0)}
            stroke="currentColor"
            strokeOpacity={az % 90 === 0 ? 0.3 : 0.1}
            strokeWidth={az % 90 === 0 ? 1.5 : 1}
          />
          <text
            x={azToX(az)}
            y={H - 4}
            textAnchor="middle"
            fontSize={az % 90 === 0 ? 12 : 10}
            fontWeight={az % 90 === 0 ? 'bold' : 'normal'}
            fill="currentColor"
            fillOpacity={az % 90 === 0 ? 0.8 : 0.5}
          >
            {label}
          </text>
        </g>
      ))}

      {/* Obstacles */}
      {obstacleElements}

      {/* Sun paths */}
      {sunPaths.map(({ month, color, pts }) =>
        pts.length > 1 ? (
          <polyline
            key={`sun-${month}`}
            points={pts.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        ) : null,
      )}

      {/* Legend */}
      <g transform={`translate(${ML + 8}, ${MT + 8})`}>
        {MONTHS.map(({ color, label }, i) => (
          <g key={label} transform={`translate(${i * 95}, 0)`}>
            <line x1={0} y1={6} x2={20} y2={6} stroke={color} strokeWidth={2.5} />
            <text x={24} y={10} fontSize={11} fill="currentColor" fillOpacity={0.75}>
              {label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
