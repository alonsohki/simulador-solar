import type { Obstacle } from '../db.ts';

const CX = 150;
const CY = 150;
const R_MAX = 118; // max ring radius (leaves margin for labels)
const DEG = Math.PI / 180;

const CARDINALS = [
  { az: 0, label: 'N', bold: true },
  { az: 45, label: 'NE', bold: false },
  { az: 90, label: 'E', bold: true },
  { az: 135, label: 'SE', bold: false },
  { az: 180, label: 'S', bold: true },
  { az: 225, label: 'SO', bold: false },
  { az: 270, label: 'O', bold: true },
  { az: 315, label: 'NO', bold: false },
];

function azToXY(az: number, r: number): { x: number; y: number } {
  const rad = az * DEG;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function sectorPath(az1: number, az2: number, rIn: number, rOut: number): string {
  const span = az2 - az1;
  const largeArc = span > 180 ? 1 : 0;
  const p1 = azToXY(az1, rIn);
  const p2 = azToXY(az1, rOut);
  const p3 = azToXY(az2, rOut);
  const p4 = azToXY(az2, rIn);
  const f = (n: number) => n.toFixed(2);

  const outerArc = `A ${rOut} ${rOut} 0 ${largeArc} 1 ${f(p3.x)} ${f(p3.y)}`;
  const innerReturn = rIn > 0
    ? `A ${rIn} ${rIn} 0 ${largeArc} 0 ${f(p1.x)} ${f(p1.y)}`
    : `L ${f(CX)} ${f(CY)}`;

  return [
    `M ${f(p1.x)} ${f(p1.y)}`,
    `L ${f(p2.x)} ${f(p2.y)}`,
    outerArc,
    `L ${f(p4.x)} ${f(p4.y)}`,
    innerReturn,
    'Z',
  ].join(' ');
}

function getObstacleHalfAngle(obs: Obstacle): number {
  const widthM = obs.widthM ?? 0;
  if (widthM > 0 && obs.distance > 0)
    return Math.atan(widthM / 2 / obs.distance) * (180 / Math.PI);
  if (obs.angularWidthDeg !== undefined) return obs.angularWidthDeg / 2;
  return 45;
}

interface Props {
  obstacles: Obstacle[];
  panelAzimuth?: number;
  /** Total horizontal width of the panel group in meters. */
  groupWidthM?: number;
  /** Panel depth (along tilt direction, before projection) in meters. */
  groupDepthM?: number;
}

export default function ObstacleMapView({ obstacles, panelAzimuth = 180, groupWidthM, groupDepthM }: Props) {
  const validObstacles = obstacles.filter((o) => o.distance > 0);
  const maxDist = validObstacles.length > 0 ? Math.max(...validObstacles.map((o) => o.distance)) : 10;

  const scaleR = (d: number) => (d / maxDist) * R_MAX;
  const THICKNESS = Math.max(8, R_MAX * 0.12);

  // Panel rectangle dimensions scaled to fit ~32px max
  const gw = groupWidthM ?? 0;
  const gd = groupDepthM ?? 0;
  const maxDim = Math.max(gw, gd, 0.001);
  const rectW = gw > 0 ? Math.min(48, (gw / maxDim) * 32) : 20;
  const rectH = gd > 0 ? Math.min(48, (gd / maxDim) * 32) : 28;

  const obstacleElements: React.ReactNode[] = [];

  validObstacles.forEach((obs, i) => {
    const halfAngle = getObstacleHalfAngle(obs);
    const az = obs.azimuthDeg ?? 180;
    const rIn = scaleR(obs.distance);
    const rOut = rIn + THICKNESS;
    const fill = obs.type === 'solid' ? 'rgba(239,68,68,0.45)' : 'rgba(245,158,11,0.4)';
    const stroke = obs.type === 'solid' ? '#ef4444' : '#f59e0b';

    const drawSector = (az1: number, az2: number, key: string) => {
      if (az2 - az1 < 0.1) return null;
      const midAz = (az1 + az2) / 2;
      const labelPt = azToXY(midAz, rOut + 10);
      const labelName = obs.name || `Obs ${i + 1}`;
      return (
        <g key={key}>
          <path d={sectorPath(az1, az2, rIn, rOut)} fill={fill} stroke={stroke} strokeWidth={1.2} />
          <text
            x={labelPt.x}
            y={labelPt.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill={stroke}
            fontWeight="600"
          >
            {labelName}
          </text>
        </g>
      );
    };

    const az1 = az - halfAngle;
    const az2 = az + halfAngle;

    if (az1 < 0) {
      obstacleElements.push(drawSector(az1 + 360, 360, `obs-${i}-a`));
      obstacleElements.push(drawSector(0, az2, `obs-${i}-b`));
    } else if (az2 > 360) {
      obstacleElements.push(drawSector(az1, 360, `obs-${i}-a`));
      obstacleElements.push(drawSector(0, az2 - 360, `obs-${i}-b`));
    } else {
      obstacleElements.push(drawSector(az1, az2, `obs-${i}`));
    }
  });

  const ringDistances = [maxDist / 3, (2 * maxDist) / 3, maxDist];

  return (
    <svg
      width="100%"
      viewBox="0 0 300 300"
      style={{ display: 'block' }}
      aria-label="Mapa de planta con obstáculos"
    >
      {/* Distance rings */}
      {ringDistances.map((d, i) => {
        const r = scaleR(d);
        const label = d < 1 ? `${(d * 100).toFixed(0)}cm` : `${d % 1 === 0 ? d.toFixed(0) : d.toFixed(1)}m`;
        const labelPt = azToXY(0, r);
        return (
          <g key={`ring-${i}`}>
            <circle cx={CX} cy={CY} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
            <text
              x={labelPt.x}
              y={labelPt.y - 3}
              textAnchor="middle"
              fontSize={8}
              fill="currentColor"
              fillOpacity={0.45}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Cardinal spokes */}
      {CARDINALS.map(({ az, label, bold }) => {
        const inner = azToXY(az, 4);
        const outer = azToXY(az, R_MAX + 2);
        const labelPt = azToXY(az, R_MAX + 14);
        return (
          <g key={`card-${az}`}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="currentColor"
              strokeOpacity={bold ? 0.25 : 0.1}
              strokeWidth={bold ? 1.2 : 0.8}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={bold ? 11 : 9}
              fontWeight={bold ? 'bold' : 'normal'}
              fill="currentColor"
              fillOpacity={bold ? 0.75 : 0.5}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Obstacles */}
      {obstacleElements}

      {/* Panel group indicator: rectangle oriented to panelAzimuth */}
      <rect
        x={CX - rectW / 2}
        y={CY - rectH / 2}
        width={rectW}
        height={rectH}
        fill="rgba(250,204,21,0.55)"
        stroke="#f59e0b"
        strokeWidth={1.5}
        transform={`rotate(${panelAzimuth}, ${CX}, ${CY})`}
      />
      <circle cx={CX} cy={CY} r={3} fill="#f59e0b" />

      {/* Dimension label */}
      {gw > 0 && gd > 0 && (
        <text x={CX} y={CY + rectH / 2 + 14} textAnchor="middle" fontSize={8} fill="#f59e0b" fillOpacity={0.9}>
          {(gw * 100).toFixed(0)}×{(gd * 100).toFixed(0)} cm
        </text>
      )}
    </svg>
  );
}
