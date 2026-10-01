import type { Civ5Map } from '../civ5-map.ts';
import { isWaterTerrain } from '../civ5-rules.ts';

type Geometry = Pick<Civ5Map, 'width' | 'height' | 'wraps'>;
export type RegionKind = 'terrain' | 'landmass' | 'woodland' | 'highlands' | 'water';
export type MapPoint = { x: number; y: number };

export function neighbor(map: Geometry, index: number, edge: number): number | null {
  const x = index % map.width, y = Math.floor(index / map.width), odd = y % 2;
  const offsets = [[odd ? 1 : 0, 1], [1, 0], [odd ? 1 : 0, -1], [odd ? 0 : -1, -1], [-1, 0], [odd ? 0 : -1, 1]];
  const [dx, dy] = offsets[edge], ny = y + dy; let nx = x + dx;
  if (map.wraps) nx = (nx + map.width) % map.width;
  return nx < 0 || nx >= map.width || ny < 0 || ny >= map.height ? null : ny * map.width + nx;
}

export function connected(map: Civ5Map, origin: number, kind: RegionKind): number[] {
  if (!Number.isInteger(origin) || !map.tiles[origin]) return [];
  const terrain = map.tiles[origin].terrain;
  const matches = (index: number) => {
    const tile = map.tiles[index];
    if (kind === 'landmass') return !isWaterTerrain(map, tile);
    if (kind === 'water') return isWaterTerrain(map, tile);
    if (kind === 'terrain') return tile.terrain === terrain;
    if (kind === 'woodland') return /FOREST|JUNGLE/.test(map.features[tile.feature] ?? '');
    return kind === 'highlands' && !isWaterTerrain(map, tile) && tile.elevation > 0;
  };
  if (!matches(origin)) return [];
  const result = [origin], seen = new Set(result);
  for (let cursor = 0; cursor < result.length; cursor++) for (let edge = 0; edge < 6; edge++) {
    const next = neighbor(map, result[cursor], edge);
    if (next !== null && !seen.has(next) && matches(next)) { seen.add(next); result.push(next); }
  }
  return result;
}

export function point(map: Pick<Geometry, 'width' | 'height'>, index: number): MapPoint {
  return { x: (index % map.width + (Math.floor(index / map.width) % 2) * .5) * Math.sqrt(3) * 10 + 10, y: (map.height - 1 - Math.floor(index / map.width)) * 15 + 10 };
}

export function tileAtPoint(map: Geometry, p: MapPoint): number | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const row = map.height - 1 - Math.round((p.y - 10) / 15), halfWidth = Math.sqrt(3) * 5;
  let closest: number | null = null, distance = Infinity;
  for (let y = row - 1; y <= row + 1; y++) {
    if (y < 0 || y >= map.height) continue;
    const col = Math.round((p.x - 10) / (Math.sqrt(3) * 10) - (y % 2) * .5);
    for (let x = col - 1; x <= col + 1; x++) {
      if (x < 0 || x >= map.width) continue;
      const index = y * map.width + x, c = point(map, index), dx = Math.abs(p.x - c.x), dy = Math.abs(p.y - c.y), d = dx * dx + dy * dy;
      if (dx <= halfWidth + 1e-8 && dy + dx / Math.sqrt(3) <= 10 + 1e-8 && d < distance) { closest = index; distance = d; }
    }
  }
  return closest;
}

/** Polygon selection uses tile centres in the displayed, unwrapped canvas. */
export function polygon(map: Geometry, vertices: MapPoint[]): number[] {
  if (vertices.length < 3 || vertices.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  const result: number[] = [];
  for (let index = 0; index < map.width * map.height; index++) {
    const p = point(map, index); let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vertices[i], b = vertices[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) result.push(index);
  }
  return result;
}

export const refineGeometry = { neighbor, connected, point, tileAtPoint, polygon };
