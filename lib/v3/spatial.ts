import type { Civ5Map } from '../civ5-map.ts';
import { adjacentCoordinates, isPassableLand } from '../civ5-rules.ts';
export function adjacency(map: Pick<Civ5Map, 'width' | 'height' | 'wraps'>): number[][] {
  return Array.from({ length: map.width * map.height }, (_, i) => adjacentCoordinates(i % map.width, Math.floor(i / map.width), map.width, map.height, map.wraps).map(([x, y]) => y * map.width + x));
}
export function distance(map: Pick<Civ5Map, 'width' | 'wraps'>, a: number, b: number) {
  const ay = Math.floor(a / map.width), by = Math.floor(b / map.width), aq = a % map.width - (ay - (ay & 1)) / 2, bq = b % map.width - (by - (by & 1)) / 2;
  return Math.min(...(map.wraps ? [-map.width, 0, map.width] : [0]).map(shift => (Math.abs(aq - bq + shift) + Math.abs(ay - by) + Math.abs(aq - bq + shift + ay - by)) / 2));
}
export function reachable(map: Civ5Map, graph: number[][], origin: number, radius: number) {
  const seen = new Set<number>([origin]); let frontier = [origin];
  for (let step = 0; step < radius; step++) { const next: number[] = []; for (const i of frontier) for (const j of graph[i]) if (!seen.has(j) && isPassableLand(map, map.tiles[j])) { seen.add(j); next.push(j); } frontier = next; }
  return [...seen];
}
export function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }
export function noise(x: number, y: number, seed: number) {
  const at = (a: number, b: number) => { let h = Math.imul(a + 913, 1597334677) ^ Math.imul(b + seed, 3812015801); h = Math.imul(h ^ h >>> 16, 2246822519); return ((h ^ h >>> 13) >>> 0) / 4294967296; };
  const ix = Math.floor(x), iy = Math.floor(y), sx = x - ix, sy = y - iy, tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
}
