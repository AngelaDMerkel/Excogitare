import type { Civ5Map } from "../civ5-map.ts";
import { adjacentCoordinates, isWaterTerrain } from "../civ5-rules.ts";

export function adjacency(map: Pick<Civ5Map, "width" | "height" | "wraps">): number[][] {
  return Array.from({ length: map.width * map.height }, (_, i) => adjacentCoordinates(i % map.width, Math.floor(i / map.width), map.width, map.height, map.wraps).map(([x, y]) => y * map.width + x));
}
export function region(graph: number[][], seeds: Iterable<number>, radius: number): number[] {
  const seen = new Set([...seeds].filter(i => i >= 0 && i < graph.length)); let frontier = [...seen];
  for (let depth = 0; depth < radius; depth++) {
    const next: number[] = [];
    for (const i of frontier) for (const j of graph[i]) if (!seen.has(j)) { seen.add(j); next.push(j); }
    frontier = next;
  }
  return [...seen];
}
export function components(map: Pick<Civ5Map, "width" | "height" | "wraps">, predicate: (i: number) => boolean, graph = adjacency(map)): number[][] {
  const seen = new Uint8Array(graph.length), groups: number[][] = [];
  for (let i = 0; i < graph.length; i++) {
    if (seen[i] || !predicate(i)) continue;
    const group = [i]; seen[i] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) for (const j of graph[group[cursor]]) if (!seen[j] && predicate(j)) { seen[j] = 1; group.push(j); }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
export class MinHeap {
  private values: Array<[number, number]> = [];
  get length() { return this.values.length; }
  push(index: number, cost: number) {
    const item: [number, number] = [index, cost]; let i = this.values.length; this.values.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (this.values[p][1] <= cost) break; this.values[i] = this.values[p]; i = p; }
    this.values[i] = item;
  }
  pop(): [number, number] {
    const first = this.values[0], last = this.values.pop()!;
    if (!this.values.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.values.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.values.length && this.values[child + 1][1] < this.values[child][1]) child++;
      if (this.values[child][1] >= last[1]) break;
      this.values[i] = this.values[child]; i = child;
    }
    this.values[i] = last; return first;
  }
}
export function paths(graph: number[][], sources: number[], cost: (from: number, to: number) => number, limit = Infinity) {
  const distance = new Float64Array(graph.length).fill(Infinity), previous = new Int32Array(graph.length).fill(-1), heap = new MinHeap();
  for (const source of sources) { distance[source] = 0; heap.push(source, 0); }
  while (heap.length) {
    const [i, d] = heap.pop(); if (d !== distance[i] || d > limit) continue;
    for (const j of graph[i]) { const next = d + cost(i, j); if (next < distance[j] && next <= limit) { distance[j] = next; previous[j] = i; heap.push(j, next); } }
  }
  return { distance, previous };
}
export function trace(previous: Int32Array, target: number): number[] {
  const path: number[] = [], seen = new Set<number>();
  for (let i = target; i >= 0 && !seen.has(i); i = previous[i]) { path.push(i); seen.add(i); }
  return path.reverse();
}
export function tileDistance(map: Pick<Civ5Map, "width" | "wraps">, a: number, b: number) {
  const ay = Math.floor(a / map.width), by = Math.floor(b / map.width);
  const aq = a % map.width - (ay - (ay & 1)) / 2;
  const bq = b % map.width - (by - (by & 1)) / 2;
  return Math.min(...(map.wraps ? [-map.width, 0, map.width] : [0]).map(shift => (Math.abs(aq - bq + shift) + Math.abs(ay - by) + Math.abs(aq - bq + shift + ay - by)) / 2));
}
/** A stable priority flood supplies an acyclic catchment tree, including flats.
 * Inland water is an outlet. Waterless worlds drain to the map boundary only;
 * that tree can guide terrain processes without inventing an exported river. */
export function drainageTree(map: Civ5Map, elevation: number[], graph = adjacency(map)) {
  const height = [...elevation], downstream = new Array<number>(graph.length).fill(-1), order: number[] = [];
  const visited = new Uint8Array(graph.length), heap = new MinHeap();
  let outlets = map.tiles.flatMap((tile, i) => isWaterTerrain(map, tile) ? [i] : []);
  if (!outlets.length) outlets = map.tiles.flatMap((_, i) => Math.floor(i / map.width) === 0 || Math.floor(i / map.width) === map.height - 1 || (!map.wraps && (i % map.width === 0 || i % map.width === map.width - 1)) ? [i] : []);
  for (const i of outlets) { visited[i] = 1; heap.push(i, height[i]); }
  while (heap.length) {
    const [i] = heap.pop(); order.push(i);
    for (const j of graph[i]) if (!visited[j]) { visited[j] = 1; height[j] = Math.max(elevation[j], height[i] + 1e-7); downstream[j] = i; heap.push(j, height[j]); }
  }
  const basin = new Int32Array(graph.length).fill(-1);
  for (const i of order) basin[i] = downstream[i] < 0 ? i : basin[downstream[i]];
  return { downstream, height, basin, order };
}
