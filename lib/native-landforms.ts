import type { NarrativeFieldSource } from './narrative-engine-adapters.ts';
import { adjacentCoordinates } from './civ5-rules.ts';
import { deterministicPassSeed } from './generation-pass-graph.ts';
import { generationSpace, spaceOffset, tilePoint } from './generation-space.ts';

export const NATIVE_LANDFORM_VERSION = 2;
type Point = { x: number; y: number; width: number };
type Segment = { from: Point; to: Point };
export type NativeFieldLandform = {
  tiles: number[];
  /** Strength along the construction backbone, before relief/climate are resolved. */
  backbone: Array<{ index: number; strength: number }>;
  branchCount: number;
};

function randomSource(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** The graph is the large-scale anatomy: bends, unequal lobes, peninsulas and
 * the open bays between them. It is not a noisy radial outline. */
function constructionGraph(source: NarrativeFieldSource, seed: number) {
  // Keep the branch graph stable while changing how it occupies the canvas.
  const random = randomSource(deterministicPassSeed(String(seed), source.id, 1));
  const water = source.effect === 'WATER';
  const bend = (random() - .5) * 1.3;
  const reverse = random() < .5 ? -1 : 1;
  const trunk: Point[] = [];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * .43;
    const y = i === 3 ? 0 : bend * Math.sin(x * (1.1 + random() * .35)) + (random() - .5) * .22;
    const taper = i === 0 || i === 6 ? .5 : 1;
    trunk.push({ x, y, width: (.5 + random() * .22) * taper * (water ? 1.08 : 1) });
  }
  const paths: Point[][] = [trunk];
  const branches = water ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 2);
  for (let i = 0; i < branches; i++) {
    const root = trunk[1 + Math.floor(i * 4 / Math.max(1, branches - 1))];
    const side = (i % 2 ? -1 : 1) * reverse;
    const length = .8 + random() * .62;
    const lean = (random() - .5) * .75;
    paths.push([
      { ...root, width: root.width * .85 },
      { x: root.x + lean * .45, y: root.y + side * length * .52, width: .27 + random() * .16 },
      { x: root.x + lean, y: root.y + side * length, width: .10 + random() * .12 },
    ]);
  }
  // Cubic interpolation keeps the skeleton from becoming ruler-straight arms.
  const segments: Segment[] = [];
  for (const path of paths) {
    let previous = path[0];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[Math.max(0, i - 1)], b = path[i], c = path[i + 1], d = path[Math.min(path.length - 1, i + 2)];
      const cubic = (key: 'x' | 'y', t: number) => .5 * (2 * b[key] + (-a[key] + c[key]) * t + (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t + (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t);
      for (let step = 1; step <= 5; step++) {
        const t = step / 5;
        const next = { x: cubic('x', t), y: cubic('y', t), width: b.width * (1 - t) + c.width * t };
        segments.push({ from: previous, to: next });
        previous = next;
      }
    }
  }
  return { segments, branches };
}

function backboneField(x: number, y: number, segments: Segment[]) {
  let strongest = -Infinity;
  for (const { from, to } of segments) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const amount = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
    const width = from.width * (1 - amount) + to.width * amount;
    const distance = Math.hypot(x - from.x - dx * amount, y - from.y - dy * amount);
    strongest = Math.max(strongest, 1 - distance / width);
  }
  return strongest;
}

class Frontier {
  private items: Array<{ index: number; value: number }> = [];
  get size() { return this.items.length; }
  private before(a: { index: number; value: number }, b: { index: number; value: number }) {
    return a.value > b.value || a.value === b.value && a.index < b.index;
  }
  push(index: number, value: number) {
    const item = { index, value };
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.before(this.items[parent], item)) break;
      this.items[i] = this.items[parent]; i = parent;
    }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop()!;
    if (!this.items.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.items.length && this.before(this.items[child + 1], this.items[child])) child++;
      if (this.before(last, this.items[child])) break;
      this.items[i] = this.items[child]; i = child;
    }
    this.items[i] = last;
    return first;
  }
}

/** Grow the requested area from the source anchor over the hex graph. The
 * existing extent supplies an area budget and orientation, never a coastline.
 * Selection remains connected even at low resolution or across a wrap seam. */
export function buildNativeFieldLandform(
  source: NarrativeFieldSource,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  requestedArea: number,
): NativeFieldLandform {
  const target = Math.max(0, Math.min(width * height, Math.round(requestedArea)));
  if (!target) return { tiles: [], backbone: [], branchCount: 0 };
  const { segments, branches } = constructionGraph(source, seed);
  const space = generationSpace(width, height);
  const cosine = Math.cos(source.rotation), sine = Math.sin(source.rotation);
  const score = (index: number) => {
    const { x: dx, y: dy } = spaceOffset(tilePoint(index, width, height), source, space, wraps);
    const x = (dx * cosine - dy * sine) / Math.max(.0001, source.radiusX);
    const y = (dx * sine + dy * cosine) / Math.max(.0001, source.radiusY);
    return backboneField(x, y, segments);
  };
  let x = Math.round(source.x * width - .5);
  x = wraps ? (x % width + width) % width : Math.max(0, Math.min(width - 1, x));
  const y = Math.max(0, Math.min(height - 1, Math.round(source.y * height - .5)));
  const frontier = new Frontier(), queued = new Uint8Array(width * height);
  const add = (index: number) => { if (!queued[index]) { queued[index] = 1; frontier.push(index, score(index)); } };
  add(y * width + x);
  const tiles: number[] = [], backbone: NativeFieldLandform['backbone'] = [];
  while (tiles.length < target && frontier.size) {
    const item = frontier.pop();
    tiles.push(item.index);
    backbone.push({ index: item.index, strength: Math.max(0, Math.min(1, item.value)) });
    for (const [nx, ny] of adjacentCoordinates(item.index % width, Math.floor(item.index / width), width, height, wraps)) add(ny * width + nx);
  }
  return { tiles, backbone, branchCount: branches };
}
