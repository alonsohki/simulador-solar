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

function getSunPosition(
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
): number {
  if (obstacles.length === 0) return 1;

  const sun = getSunPosition(hour, month, latitude);
  if (!sun) return 1; // sun below horizon, no production anyway

  let factor = 1;

  for (const obstacle of obstacles) {
    if (obstacle.distance <= 0) continue;

    const obstacleAzimuth = DIRECTION_AZIMUTH[obstacle.direction];

    // Check if sun is in the direction of the obstacle.
    // Use a 90° window centered on the obstacle azimuth.
    // Within the window, apply a gradual falloff — obstacles block most
    // when the sun is directly behind them, less at the edges.
    const azDiff = angleDifference(sun.azimuth, obstacleAzimuth);
    if (azDiff > 45) continue;

    // Effective height accounts for panel elevation
    const effectiveHeight = obstacle.height - panelHeight;
    if (effectiveHeight <= 0) continue;

    const obstacleAngle = Math.atan(effectiveHeight / obstacle.distance) / DEG;
    if (obstacleAngle > sun.elevation) {
      // Gradual falloff: full effect when sun is directly behind the obstacle (azDiff=0),
      // tapering to zero at the edge of the window (azDiff=45).
      const angularFactor = Math.cos((azDiff / 45) * (Math.PI / 2));
      if (obstacle.type === 'solid') {
        factor *= 1 - angularFactor;
      } else {
        const transparency = (obstacle.transparencyPercent ?? 50) / 100;
        factor *= 1 - angularFactor * (1 - transparency);
      }
    }
  }

  return factor;
}
