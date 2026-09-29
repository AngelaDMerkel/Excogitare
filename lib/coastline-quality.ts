import type { Civ5Map } from './civ5-map.ts';
import { adjacentCoordinates, isWaterTerrain } from './civ5-rules.ts';

export type CoastlineComponent = {
  tiles: number;
  anchorIndex: number;
  axisRatio: number;
  filledEllipseRatio: number;
  broadRadiusSpread: number;
  angularCoverage: number;
  regular: boolean;
  volcanic: boolean;
};
export type CoastlineAssessment = {
  version: 1;
  accepted: boolean;
  inspected: number;
  regularComponents: number;
  components: CoastlineComponent[];
  errors: string[];
};
const HEX_AREA = Math.sqrt(3) / 2;

function quantile(values: number[], fraction: number) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(fraction * ordered.length))] ?? 0;
}

/** Independent observation of finished land geometry. Covariance removes size,
 * rotation and stretching. Broad angular measurements suppress one-hex edge
 * noise and isolated spikes; hollow atolls have low filled-ellipse occupancy. */
export function assessCoastlines(map: Civ5Map): CoastlineAssessment {
  const n = map.tiles.length, visited = new Uint8Array(n);
  const land = map.tiles.map(tile => !isWaterTerrain(map, tile));
  const graph = Array.from({ length: n }, (_, i) => adjacentCoordinates(i % map.width, Math.floor(i / map.width), map.width, map.height, map.wraps).map(([x, y]) => y * map.width + x));
  const components: CoastlineComponent[] = [];
  for (let origin = 0; origin < n; origin++) {
    if (visited[origin] || !land[origin]) continue;
    const cells = [origin];
    const unwrapped = new Map<number, number>([[origin, origin % map.width]]);
    visited[origin] = 1;
    let clipped = false, winding = false;
    for (let cursor = 0; cursor < cells.length; cursor++) {
      const i = cells[cursor], x = i % map.width, y = Math.floor(i / map.width);
      if (y === 0 || y === map.height - 1 || !map.wraps && (x === 0 || x === map.width - 1)) clipped = true;
      for (const j of graph[i]) {
        if (!land[j]) continue;
        let dx = j % map.width - x;
        if (map.wraps && Math.abs(dx) > map.width / 2) dx += dx > 0 ? -map.width : map.width;
        const ux = unwrapped.get(i)! + dx;
        if (unwrapped.has(j) && unwrapped.get(j) !== ux) winding = true;
        if (!visited[j]) { visited[j] = 1; unwrapped.set(j, ux); cells.push(j); }
      }
    }
    // A clipped or world-circling continent has no complete island silhouette.
    if (cells.length < 48 || clipped || winding) continue;
    const point = (i: number) => ({ x: unwrapped.get(i)! + (Math.floor(i / map.width) % 2) * .5, y: Math.floor(i / map.width) * HEX_AREA });
    const points = cells.map(point);
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    let xx = 0, xy = 0, yy = 0;
    for (const p of points) { const x = p.x - cx, y = p.y - cy; xx += x * x; xy += x * y; yy += y * y; }
    xx /= points.length; xy /= points.length; yy /= points.length;
    const delta = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
    const major = (xx + yy + delta) / 2, minor = (xx + yy - delta) / 2;
    if (minor <= 0) continue;
    const angle = Math.atan2(2 * xy, xx - yy) / 2, cosine = Math.cos(angle), sine = Math.sin(angle);
    const normalized = (i: number) => {
      const p = point(i), x = p.x - cx, y = p.y - cy;
      return { x: (x * cosine + y * sine) / Math.sqrt(major), y: (-x * sine + y * cosine) / Math.sqrt(minor) };
    };
    const bins = Array.from({ length: 24 }, () => [] as number[]);
    for (const i of cells) {
      if (!graph[i].some(j => !land[j])) continue;
      const p = normalized(i), angle = (Math.atan2(p.y, p.x) + Math.PI * 2) % (Math.PI * 2);
      bins[Math.min(23, Math.floor(angle / (Math.PI * 2) * 24))].push(Math.hypot(p.x, p.y));
    }
    const radii = bins.filter(bin => bin.length).map(bin => quantile(bin, .8));
    const angularCoverage = radii.length / bins.length;
    const broadRadiusSpread = (quantile(radii, .85) - quantile(radii, .15)) / Math.max(.001, quantile(radii, .5));
    const filledEllipseRatio = cells.length * HEX_AREA / (4 * Math.PI * Math.sqrt(major * minor));
    const cellSet = new Set(cells);
    const hasNativeVolcanism = map.structure?.objects.some(object => object.attributes?.role === 'VOLCANIC_ARC_ANCHOR'
      && object.tileIndices.filter(i => cellSet.has(i)).length >= Math.max(1, object.tileIndices.length * .6));
    const centralPeak = cells.some(i => { const p = normalized(i); return map.tiles[i].elevation === 2 && Math.hypot(p.x, p.y) < .85; });
    const volcanic = Boolean(hasNativeVolcanism && centralPeak && cells.length <= n * .04);
    const regular = angularCoverage >= .8 && filledEllipseRatio > .9 && broadRadiusSpread < .14;
    components.push({ tiles: cells.length, anchorIndex: origin, axisRatio: Math.sqrt(major / minor), filledEllipseRatio, broadRadiusSpread, angularCoverage, regular, volcanic });
  }
  const unexplained = components.filter(component => component.regular && !component.volcanic);
  const large = unexplained.filter(component => component.tiles >= 96);
  const errors: string[] = [];
  if (large.length) errors.push(`${large.length} large landform${large.length === 1 ? '' : 's'} retain${large.length === 1 ? 's' : ''} a geometric oval coastline.`);
  else if (unexplained.length >= 2) errors.push('The map repeats smooth geometric island shapes.');
  return { version: 1, accepted: !errors.length, inspected: components.length, regularComponents: unexplained.length, components, errors };
}
