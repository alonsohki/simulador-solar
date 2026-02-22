import type { Obstacle, ObstacleDirection } from '../db.ts';

const DEG = Math.PI / 180;

// Map cardinal direction to azimuth angle (from north, clockwise)
const DIRECTION_AZIMUTH: Record<ObstacleDirection, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

function angleDifference(a: number, b: number): number {
  const diff = ((a - b + 540) % 360) - 180;
  return Math.abs(diff);
}

export function getSunPosition(
  hour: number,
  month: number,
  latitude: number,
): { elevation: number; azimuth: number } | null {
  const solarHour = hour - 0.5;
  const hourAngle = (solarHour - 12) * 15;
  const dayOfYear = (month - 1) * 30.44 + 15;
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * DEG);

  const latRad = latitude * DEG;
  const decRad = declination * DEG;
  const haRad = hourAngle * DEG;

  const sinElev = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElev))) / DEG;

  if (elevation <= 0) return null;

  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinElev) / (Math.cos(latRad) * Math.cos(elevation * DEG));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / DEG;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  return { elevation, azimuth };
}

export function calculateShadowFactor(
  obstacles: Obstacle[],
  hour: number,
  month: number,
  latitude: number,
  panelHeight: number = 0,
  panelPhysicalHeightM: number = 0,
  panelTiltDeg: number = 30,
): number {
  if (obstacles.length === 0) return 1;

  const sun = getSunPosition(hour, month, latitude);
  if (!sun) return 1; // sun below horizon, no production anyway

  // Vertical extent of the panel (projection onto vertical plane)
  const panelHeightVertical = panelPhysicalHeightM * Math.cos(panelTiltDeg * DEG);

  let factor = 1;

  for (const obstacle of obstacles) {
    if (obstacle.distance <= 0) continue;

    // Support both new (azimuthDeg) and legacy (direction) fields
    const obstacleAzimuth =
      obstacle.azimuthDeg !== undefined
        ? obstacle.azimuthDeg
        : DIRECTION_AZIMUTH[obstacle.direction ?? 'south'];

    // Half-width of the obstacle's angular window
    // Prefer physical widthM, fallback to legacy angularWidthDeg, then default 45°
    const widthM = (obstacle.widthM ?? 0);
    let halfWidth: number;
    if (widthM > 0 && obstacle.distance > 0) {
      halfWidth = Math.atan(widthM / 2 / obstacle.distance) * (180 / Math.PI);
    } else if (obstacle.angularWidthDeg !== undefined) {
      halfWidth = obstacle.angularWidthDeg / 2;
    } else {
      halfWidth = 45;
    }

    const azDiff = angleDifference(sun.azimuth, obstacleAzimuth);
    if (azDiff > halfWidth) continue;

    // Height where the obstacle's shadow falls at the panel location
    const H_shadow = obstacle.height - obstacle.distance * Math.tan(sun.elevation * DEG);
    if (H_shadow <= panelHeight) continue; // shadow misses panel entirely

    // Fraction of panel height that is shaded (0 = no shade, 1 = full shade)
    const shadeFraction =
      panelHeightVertical === 0
        ? 1 // no panel dimensions → binary shading (legacy behavior)
        : Math.min(1, Math.max(0, (H_shadow - panelHeight) / panelHeightVertical));

    // Angular falloff: full effect when sun is directly behind obstacle, tapering to zero at edge
    const angularFactor = Math.cos((azDiff / halfWidth) * (Math.PI / 2));

    if (obstacle.type === 'solid') {
      factor *= 1 - shadeFraction * angularFactor;
    } else {
      const transparency = (obstacle.transparencyPercent ?? 50) / 100;
      factor *= 1 - shadeFraction * angularFactor * (1 - transparency);
    }
  }

  return factor;
}
