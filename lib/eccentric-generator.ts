import type { Civ5Tile } from "./civ5-map.ts";
import { poleProximity } from "./climate-projection.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { WorldScale } from "./generation-recipe.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";

type Point = { x: number; y: number };
type PolygonEdge = { one: number; two: number; coastal: boolean; contrast: number };
type ClimateAnchor = { temperature: number; moisture: number; forest: boolean; jungle: boolean; marsh: boolean };
type ClimatePalette = { temperature: number; moisture: number; anchors: ClimateAnchor[]; climateCell: number };
type LandmassGrammar = "CONTINENTS" | "ENCIRCLING" | "PANGAEA" | "RIFTED" | "ARCHIPELAGO" | "LONELY_OCEANS" | "PENINSULA";

type TopologyProfile = {
  grammar: LandmassGrammar;
  majorContinents: number;
  islands: number;
  tinyIslands: number;
  astronomyBlobs: number;
  inlandSeas: number;
  lakes: number;
  openWaterRatio: number;
};

export type EccentricDiagnostics = {
  passes: number;
  subregions: number;
  polygons: number;
  climateRegions: number;
  climatePalettes: number;
  biomeTransitions: number;
  continents: number;
  oceanBasins: number;
  astronomyBasins: number;
  deepWaterBarriers: number;
  tinyIslands: number;
  mountainRanges: number;
  requestedAstronomyBasins: number;
  majorLandmasses: number;
  islands: number;
  climateCollections: number;
  boundaryRangeEdges: number;
  majorRiverCorridorTiles: number;
  minorRiverCorridorTiles: number;
  geographicIdentities: number;
};

export type EccentricGeography = {
  landMask: boolean[];
  reliefValues: number[];
  temperatures: number[];
  moistures: number[];
  elevations: number[];
  riverGuidance: number[];
  tiles: Civ5Tile[];
  structure: GenerationStructure;
  diagnostics: EccentricDiagnostics;
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, scale: number, seed: number) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const top = hashNoise(x0, y0, seed) * (1 - tx) + hashNoise(x0 + 1, y0, seed) * tx;
  const bottom = hashNoise(x0, y0 + 1, seed) * (1 - tx) + hashNoise(x0 + 1, y0 + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((one, two) => one - two);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(percentile * (sorted.length - 1))))];
}

function hexNeighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width;
  const y = Math.floor(index / width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const result: number[] = [];
  for (const [dx, dy] of offsets) {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) result.push(nextY * width + nextX);
  }
  return result;
}

function pointDistanceSquared(one: Point, two: Point, width: number, wraps: boolean) {
  let dx = Math.abs(one.x - two.x);
  if (wraps) dx = Math.min(dx, width - dx);
  const dy = Math.abs(one.y - two.y) * 0.866;
  return dx * dx + dy * dy;
}

function scatteredPoints(count: number, width: number, height: number, random: () => number, fantasticality: MapGenerationOptions["fantasticality"], characterJitter: number) {
  const columns = Math.max(1, Math.round(Math.sqrt(count * width / Math.max(1, height))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const jitter = (fantasticality === "UNBOUND" ? 1.35 : fantasticality === "MYTHIC" ? 1.05 : 0.72) * characterJitter;
  const points: Point[] = [];
  for (let row = 0; row < rows && points.length < count; row += 1) {
    for (let column = 0; column < columns && points.length < count; column += 1) {
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      const centerX = (column + 0.5) * cellWidth;
      const centerY = (row + 0.5) * cellHeight;
      const x = clamp(centerX + (random() - 0.5) * cellWidth * jitter, 0, width - 0.001);
      const y = clamp(centerY + (random() - 0.5) * cellHeight * jitter, 0, height - 0.001);
      points.push({ x, y });
    }
  }
  return points;
}

function assignHexes(points: Point[], width: number, height: number, wraps: boolean) {
  const assignments = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let owner = 0;
      let best = Number.POSITIVE_INFINITY;
      const location = { x: x + (y & 1) * 0.5, y };
      for (let point = 0; point < points.length; point += 1) {
        const distance = pointDistanceSquared(location, points[point], width, wraps);
        if (distance < best) {
          best = distance;
          owner = point;
        }
      }
      assignments[y * width + x] = owner;
    }
  }
  return assignments;
}

function relaxPoints(points: Point[], assignments: Int32Array, width: number, wraps: boolean) {
  const sums = points.map(() => ({ x: 0, y: 0, count: 0, sin: 0, cos: 0 }));
  for (let index = 0; index < assignments.length; index += 1) {
    const owner = assignments[index];
    const x = index % width;
    const y = Math.floor(index / width);
    sums[owner].x += x;
    sums[owner].y += y;
    sums[owner].count += 1;
    sums[owner].sin += Math.sin(x / width * Math.PI * 2);
    sums[owner].cos += Math.cos(x / width * Math.PI * 2);
  }
  return points.map((point, index) => {
    const sum = sums[index];
    if (!sum.count) return point;
    return {
      x: wraps ? (Math.atan2(sum.sin, sum.cos) / (Math.PI * 2) * width + width) % width : sum.x / sum.count,
      y: sum.y / sum.count,
    };
  });
}

function buildAdjacency(assignments: Int32Array, count: number, width: number, height: number, wraps: boolean) {
  const adjacency = Array.from({ length: count }, () => new Set<number>());
  for (let index = 0; index < assignments.length; index += 1) {
    const owner = assignments[index];
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      const other = assignments[neighbor];
      if (other === owner) continue;
      adjacency[owner].add(other);
      adjacency[other].add(owner);
    }
  }
  return adjacency;
}

function selectGraphSeeds(available: number[], centers: Point[], count: number, width: number, wraps: boolean, random: () => number, organicity: number) {
  const seeds = [available[Math.floor(random() * available.length)]];
  while (seeds.length < Math.min(count, available.length)) {
    if (random() < organicity * 0.22) {
      const unclaimed = available.filter((candidate) => !seeds.includes(candidate));
      seeds.push(unclaimed[Math.floor(random() * unclaimed.length)]);
      continue;
    }
    let best = available[0];
    let bestScore = -1;
    for (const candidate of available) {
      if (seeds.includes(candidate)) continue;
      const distance = Math.min(...seeds.map((seed) => pointDistanceSquared(centers[candidate], centers[seed], width, wraps)));
      const score = distance * (0.76 + hashNoise(candidate, seeds.length, 711) * organicity * 0.48);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    seeds.push(best);
  }
  return seeds;
}

function graphPartition(adjacency: Array<Set<number>>, centers: Point[], count: number, width: number, wraps: boolean, random: () => number, organicity: number, allowed?: ReadonlySet<number>) {
  const available = centers.flatMap((_center, index) => !allowed || allowed.has(index) ? [index] : []);
  if (!available.length) return new Int32Array(centers.length).fill(-1);
  const seeds = selectGraphSeeds(available, centers, count, width, wraps, random, organicity);
  const owners = new Int32Array(centers.length);
  owners.fill(-1);
  const queue = [...seeds];
  seeds.forEach((seed, owner) => { owners[seed] = owner; });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const neighbors = [...adjacency[current]].sort((one, two) => hashNoise(one, current, seeds.length + 193) - hashNoise(two, current, seeds.length + 193));
    for (const neighbor of neighbors) {
      if (owners[neighbor] !== -1 || allowed && !allowed.has(neighbor)) continue;
      owners[neighbor] = owners[current];
      queue.push(neighbor);
    }
  }
  return owners;
}

function aggregateCenters(assignments: Int32Array, sourceCenters: Point[], count: number, width: number, wraps: boolean) {
  const sums = Array.from({ length: count }, () => ({ x: 0, y: 0, count: 0, sin: 0, cos: 0 }));
  for (let source = 0; source < assignments.length; source += 1) {
    const owner = assignments[source];
    if (owner < 0) continue;
    const point = sourceCenters[source];
    sums[owner].x += point.x;
    sums[owner].y += point.y;
    sums[owner].count += 1;
    sums[owner].sin += Math.sin(point.x / width * Math.PI * 2);
    sums[owner].cos += Math.cos(point.x / width * Math.PI * 2);
  }
  return sums.map((sum) => ({
    x: wraps ? (Math.atan2(sum.sin, sum.cos) / (Math.PI * 2) * width + width) % width : sum.x / Math.max(1, sum.count),
    y: sum.y / Math.max(1, sum.count),
  }));
}

function aggregateAdjacency(sourceAdjacency: Array<Set<number>>, owners: Int32Array, count: number) {
  const adjacency = Array.from({ length: count }, () => new Set<number>());
  for (let source = 0; source < owners.length; source += 1) {
    const owner = owners[source];
    if (owner < 0) continue;
    for (const neighbor of sourceAdjacency[source]) {
      const other = owners[neighbor];
      if (other >= 0 && other !== owner) {
        adjacency[owner].add(other);
        adjacency[other].add(owner);
      }
    }
  }
  return adjacency;
}

function connectedComponents(mask: boolean[], width: number, height: number, wraps: boolean) {
  const ids = new Int32Array(mask.length);
  ids.fill(-1);
  let count = 0;
  const sizes: number[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || ids[origin] >= 0) continue;
    const queue = [origin];
    ids[origin] = count;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of hexNeighbors(queue[cursor], width, height, wraps)) {
        if (!mask[neighbor] || ids[neighbor] >= 0) continue;
        ids[neighbor] = count;
        queue.push(neighbor);
      }
    }
    sizes.push(queue.length);
    count += 1;
  }
  return { ids, count, sizes };
}

function edgePolygons(centers: Point[], width: number, height: number, side?: "TOP" | "BOTTOM" | "LEFT" | "RIGHT") {
  return centers.flatMap((center, index) => {
    const edge = side === "TOP" ? center.y < height * 0.14
      : side === "BOTTOM" ? center.y > height * 0.86
        : side === "LEFT" ? center.x < width * 0.12
          : side === "RIGHT" ? center.x > width * 0.88
            : center.x < width * 0.1 || center.x > width * 0.9 || center.y < height * 0.1 || center.y > height * 0.9;
    return edge ? [index] : [];
  });
}

function topologyForPreset(options: MapGenerationOptions): TopologyProfile {
  if (options.preset === "GREAT_WATERSHEDS") return { grammar: "ENCIRCLING", majorContinents: 1, islands: 1, tinyIslands: 2, astronomyBlobs: 0, inlandSeas: 2, lakes: 4, openWaterRatio: 0.08 };
  if (options.preset === "ENCIRCLING_LANDS" || options.preset === "INLAND_SEAS") return { grammar: "ENCIRCLING", majorContinents: 1, islands: 1, tinyIslands: 3, astronomyBlobs: 0, inlandSeas: 3, lakes: 3, openWaterRatio: 0.06 };
  if (options.preset === "ASTRAL_PANGAEA" || options.preset === "PANGAEA") return { grammar: "PANGAEA", majorContinents: 1, islands: 2, tinyIslands: 4, astronomyBlobs: 1, inlandSeas: 1, lakes: 2, openWaterRatio: 0.16 };
  if (options.preset === "RIFTWORLD" || options.preset === "RIFT_REALMS") return { grammar: "RIFTED", majorContinents: 5, islands: 7, tinyIslands: 10, astronomyBlobs: 2, inlandSeas: 1, lakes: 2, openWaterRatio: 0.25 };
  if (options.preset === "SHATTERED_BASINS") return { grammar: "RIFTED", majorContinents: 6, islands: 9, tinyIslands: 12, astronomyBlobs: 2, inlandSeas: 2, lakes: 2, openWaterRatio: 0.27 };
  if (options.preset === "LONELY_OCEANS") return { grammar: "LONELY_OCEANS", majorContinents: 0, islands: 20, tinyIslands: 18, astronomyBlobs: 3, inlandSeas: 0, lakes: 0, openWaterRatio: 0.52 };
  if (options.preset === "PENINSULA_REALM" || options.preset === "LABYRINTH") return { grammar: "PENINSULA", majorContinents: 1, islands: 3, tinyIslands: 5, astronomyBlobs: 1, inlandSeas: 1, lakes: 1, openWaterRatio: 0.18 };
  if (options.preset === "SHATTERED_ARCHIPELAGO" || options.preset === "ARCHIPELAGO") return { grammar: "ARCHIPELAGO", majorContinents: 3, islands: 18, tinyIslands: 20, astronomyBlobs: 2, inlandSeas: 0, lakes: 1, openWaterRatio: 0.42 };
  if (options.preset === "EARTHSEA") return { grammar: "ARCHIPELAGO", majorContinents: 5, islands: 11, tinyIslands: 12, astronomyBlobs: 1, inlandSeas: 1, lakes: 1, openWaterRatio: 0.32 };
  if (options.preset === "MYTHIC_REGIONS" || options.preset === "WILD_REGIONS") return { grammar: "CONTINENTS", majorContinents: 5, islands: 7, tinyIslands: 9, astronomyBlobs: 1, inlandSeas: 1, lakes: 2, openWaterRatio: 0.22 };
  return { grammar: "CONTINENTS", majorContinents: options.preset === "TECTONIC_CONTINENTS" ? 4 : 3, islands: 4, tinyIslands: 6, astronomyBlobs: 0, inlandSeas: 1, lakes: 2, openWaterRatio: 0.18 };
}

function graphComponents(adjacency: Array<Set<number>>, blocked: ReadonlySet<number>) {
  const ids = new Int32Array(adjacency.length);
  ids.fill(-1);
  const members: number[][] = [];
  for (let origin = 0; origin < adjacency.length; origin += 1) {
    if (blocked.has(origin) || ids[origin] >= 0) continue;
    const component = members.length;
    const queue = [origin];
    ids[origin] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of adjacency[queue[cursor]]) {
        if (blocked.has(neighbor) || ids[neighbor] >= 0) continue;
        ids[neighbor] = component;
        queue.push(neighbor);
      }
    }
    members.push(queue);
  }
  return { ids, members, count: members.length };
}

function graphPathBetween(adjacency: Array<Set<number>>, centers: Point[], start: number, end: number, width: number, wraps: boolean, seed: number) {
  const costs = new Float64Array(centers.length);
  costs.fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(centers.length);
  parents.fill(-1);
  costs[start] = 0;
  const open = [start];
  while (open.length) {
    open.sort((one, two) => costs[one] + pointDistanceSquared(centers[one], centers[end], width, wraps) * 0.012 - costs[two] - pointDistanceSquared(centers[two], centers[end], width, wraps) * 0.012);
    const current = open.shift()!;
    if (current === end) break;
    for (const neighbor of adjacency[current]) {
      const candidate = costs[current] + 1 + hashNoise(neighbor, current, seed) * 0.42;
      if (candidate >= costs[neighbor]) continue;
      costs[neighbor] = candidate;
      parents[neighbor] = current;
      if (!open.includes(neighbor)) open.push(neighbor);
    }
  }
  const path: number[] = [];
  let current = end;
  while (current >= 0) {
    path.push(current);
    if (current === start) break;
    current = parents[current];
  }
  return path[path.length - 1] === start ? path.reverse() : [];
}

function buildAstronomyBarriers(profile: TopologyProfile, adjacency: Array<Set<number>>, centers: Point[], areas: number[], width: number, height: number, wraps: boolean, requestedBasins: number, targetWater: number, seed: number) {
  const barriers = new Set<number>();
  const empty = new Set(areas.flatMap((area, index) => area > 0 ? [] : [index]));
  const components = (blocked: ReadonlySet<number>) => graphComponents(adjacency, new Set([...blocked, ...empty]));
  if (targetWater <= 0 || requestedBasins <= 1) return { barriers, ...components(barriers) };
  const top = edgePolygons(centers, width, height, "TOP").filter((polygon) => areas[polygon] > 0);
  const bottom = edgePolygons(centers, width, height, "BOTTOM").filter((polygon) => areas[polygon] > 0);
  const left = edgePolygons(centers, width, height, "LEFT").filter((polygon) => areas[polygon] > 0);
  const right = edgePolygons(centers, width, height, "RIGHT").filter((polygon) => areas[polygon] > 0);
  const waterAllowance = Math.max(1, Math.floor(targetWater * 0.72));
  let stagnantPaths = 0;
  const maximumAttempts = Math.max(8, requestedBasins * 8);
  for (let pathNumber = 0; pathNumber < maximumAttempts && components(barriers).count < requestedBasins; pathNumber += 1) {
    const vertical = wraps || pathNumber % 2 === 0;
    const fraction = 0.12 + ((pathNumber * 0.38196601125 + 0.19) % 0.76);
    const targetX = width * fraction + (hashNoise(pathNumber, 17, seed) - 0.5) * width * 0.06;
    const targetY = height * fraction + (hashNoise(pathNumber, 31, seed) - 0.5) * height * 0.06;
    const startPool = vertical ? top : left;
    const endPool = vertical ? bottom : right;
    if (!startPool.length || !endPool.length) continue;
    const coordinate = (index: number) => vertical ? centers[index].x : centers[index].y;
    const target = vertical ? targetX : targetY;
    const start = startPool.reduce((best, candidate) => Math.abs(coordinate(candidate) - target) < Math.abs(coordinate(best) - target) ? candidate : best, startPool[0]);
    const end = endPool.reduce((best, candidate) => Math.abs(coordinate(candidate) - target) < Math.abs(coordinate(best) - target) ? candidate : best, endPool[0]);
    const path = graphPathBetween(adjacency, centers, start, end, width, wraps, seed + pathNumber * 101);
    const newArea = path.filter((polygon) => !barriers.has(polygon)).reduce((sum, polygon) => sum + areas[polygon], 0);
    const currentArea = [...barriers].reduce((sum, polygon) => sum + areas[polygon], 0);
    if (!path.length || currentArea + newArea > waterAllowance) continue;
    const tentative = new Set([...barriers, ...path]);
    const currentCount = components(barriers).count;
    const nextCount = components(tentative).count;
    if (nextCount > requestedBasins || nextCount < currentCount) continue;
    if (nextCount === currentCount && stagnantPaths >= (wraps ? requestedBasins * 2 : 0)) continue;
    for (const polygon of path) barriers.add(polygon);
    stagnantPaths = nextCount === currentCount ? stagnantPaths + 1 : 0;
  }
  // Astronomy blobs thicken selected sections of an existing barrier without
  // creating unrequested extra navigation basins.
  for (let blob = 0; blob < profile.astronomyBlobs && barriers.size; blob += 1) {
    const edgeCandidates = [...barriers].flatMap((polygon) => [...adjacency[polygon]].filter((neighbor) => !barriers.has(neighbor)));
    edgeCandidates.sort((one, two) => hashNoise(one, blob, seed + 701) - hashNoise(two, blob, seed + 701));
    for (const candidate of edgeCandidates) {
      const tentative = new Set(barriers).add(candidate);
      if (components(tentative).count === components(barriers).count) {
        barriers.add(candidate);
        break;
      }
    }
  }
  return { barriers, ...components(barriers) };
}

function allocateLandPolygons(profile: TopologyProfile, adjacency: Array<Set<number>>, centers: Point[], areas: number[], basins: number[][], barriers: ReadonlySet<number>, targetLand: number, width: number, wraps: boolean, random: () => number, seed: number) {
  const polygonLand = new Array<boolean>(centers.length).fill(false);
  if (targetLand >= areas.reduce((sum, area) => sum + area, 0)) return polygonLand.map((_value, index) => !barriers.has(index));
  const basinAreas = basins.map((members) => members.reduce((sum, polygon) => sum + areas[polygon], 0));
  const totalAvailable = basinAreas.reduce((sum, area) => sum + area, 0);
  const majorCounts = new Array(basins.length).fill(0);
  const islandCounts = new Array(basins.length).fill(0);
  const basinOrder = basinAreas.map((_area, index) => index).sort((one, two) => basinAreas[two] - basinAreas[one]);
  for (let index = 0; index < profile.majorContinents; index += 1) majorCounts[basinOrder[index % Math.max(1, basinOrder.length)]] += 1;
  for (let index = 0; index < profile.islands; index += 1) islandCounts[basinOrder[(index + profile.majorContinents) % Math.max(1, basinOrder.length)]] += 1;
  let assignedTarget = 0;
  for (let basin = 0; basin < basins.length; basin += 1) {
    const available = basins[basin];
    if (!available.length) continue;
    const basinTarget = basin === basins.length - 1 ? targetLand - assignedTarget : Math.round(targetLand * basinAreas[basin] / Math.max(1, totalAvailable));
    assignedTarget += basinTarget;
    const massCount = Math.max(1, majorCounts[basin] + islandCounts[basin]);
    let seedPool = available;
    if (profile.grammar === "PANGAEA") seedPool = available.filter((polygon) => centers[polygon].x > width * 0.18 && centers[polygon].x < width * 0.82);
    else if (profile.grammar === "PENINSULA") seedPool = available.filter((polygon) => centers[polygon].x < width * 0.3);
    else if (profile.grammar === "ENCIRCLING") seedPool = available.filter((polygon) => centers[polygon].x < width * 0.13 || centers[polygon].x > width * 0.87);
    if (!seedPool.length) seedPool = available;
    const seeds = selectGraphSeeds(seedPool, centers, massCount, width, wraps, random, profile.grammar === "ARCHIPELAGO" || profile.grammar === "LONELY_OCEANS" ? 1 : 0.72);
    const owners = new Int32Array(centers.length);
    owners.fill(-1);
    const islandWeight = (profile.grammar === "ARCHIPELAGO" || profile.grammar === "LONELY_OCEANS" ? 2.4 : 1.25) * (0.8 + profile.openWaterRatio * 1.5);
    const weights = seeds.map((_value, owner) => owner < majorCounts[basin] ? 8 : islandWeight);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const targets = weights.map((weight) => Math.max(areas[seeds[0]] ?? 1, basinTarget * weight / Math.max(1, weightTotal)));
    const ownerAreas = new Array(seeds.length).fill(0);
    const frontiers = seeds.map((origin, owner) => { owners[origin] = owner; ownerAreas[owner] = areas[origin]; return new Set(adjacency[origin]); });
    const allowed = new Set(available);
    let progress = true;
    while (progress && ownerAreas.reduce((sum, area) => sum + area, 0) < basinTarget) {
      progress = false;
      for (let owner = 0; owner < seeds.length; owner += 1) {
        if (ownerAreas[owner] >= targets[owner]) continue;
        let candidates = [...frontiers[owner]].filter((polygon) => allowed.has(polygon) && owners[polygon] < 0);
        const separated = candidates.filter((polygon) => [...adjacency[polygon]].every((neighbor) => owners[neighbor] < 0 || owners[neighbor] === owner));
        if (separated.length) candidates = separated;
        if (!candidates.length) continue;
        candidates.sort((one, two) => hashNoise(one, owner, seed + ownerAreas[owner]) - hashNoise(two, owner, seed + ownerAreas[owner]));
        const chosen = candidates[0];
        owners[chosen] = owner;
        ownerAreas[owner] += areas[chosen];
        frontiers[owner].delete(chosen);
        for (const neighbor of adjacency[chosen]) frontiers[owner].add(neighbor);
        progress = true;
      }
    }
    for (const polygon of available) if (owners[polygon] >= 0) polygonLand[polygon] = true;
  }
  return polygonLand;
}

function tilesByAssignment(assignments: ArrayLike<number>, count: number) {
  const result = Array.from({ length: count }, () => [] as number[]);
  for (let index = 0; index < assignments.length; index += 1) if (assignments[index] >= 0 && assignments[index] < count) result[assignments[index]].push(index);
  return result;
}

function decorateSmallWatersAndIslands(mask: boolean[], subregions: Int32Array, subregionAdjacency: Array<Set<number>>, hexPolygons: Int32Array, barrierPolygons: ReadonlySet<number>, profile: TopologyProfile, targetWater: number, width: number, height: number, wraps: boolean, seed: number) {
  if (targetWater <= 0) return { tinyIslands: 0, inlandWaters: 0, protectedWater: new Set<number>(), waterBodies: [] as number[][] };
  const groups = tilesByAssignment(subregions, subregionAdjacency.length);
  const protectedWater = new Set<number>();
  let tinyIslands = 0;
  const islandCandidates = groups.map((_tiles, region) => region).filter((region) => {
    const tiles = groups[region];
    return tiles.length && tiles.length <= 7 && tiles.every((index) => !mask[index] && !barrierPolygons.has(hexPolygons[index])) && [...subregionAdjacency[region]].every((other) => groups[other].every((index) => !mask[index]));
  }).sort((one, two) => hashNoise(one, 11, seed) - hashNoise(two, 11, seed));
  for (const region of islandCandidates.slice(0, profile.tinyIslands)) {
    for (const index of groups[region]) mask[index] = true;
    tinyIslands += 1;
  }
  const inlandTarget = profile.inlandSeas + profile.lakes;
  let inlandWaters = 0;
  const waterBodies: number[][] = [];
  const inlandCandidates = groups.map((_tiles, region) => region).filter((region) => {
    const tiles = groups[region];
    return tiles.length && tiles.every((index) => mask[index]) && tiles.every((index) => hexNeighbors(index, width, height, wraps).every((neighbor) => mask[neighbor]));
  }).sort((one, two) => hashNoise(one, 23, seed) - hashNoise(two, 23, seed));
  for (const region of inlandCandidates) {
    if (inlandWaters >= inlandTarget) break;
    const projectedWater = mask.reduce((count, land) => count + (land ? 0 : 1), 0) + groups[region].length;
    if (projectedWater > targetWater) continue;
    for (const index of groups[region]) { mask[index] = false; protectedWater.add(index); }
    waterBodies.push([...groups[region]]);
    inlandWaters += 1;
  }
  return { tinyIslands, inlandWaters, protectedWater, waterBodies };
}

function reconcileWaterMask(mask: boolean[], targetWater: number, subregions: Int32Array, subregionCount: number, width: number, height: number, wraps: boolean, seed: number, protectedWater: ReadonlySet<number>) {
  const groups = tilesByAssignment(subregions, subregionCount);
  let water = mask.reduce((count, land) => count + (land ? 0 : 1), 0);
  let pass = 0;
  while (water !== targetWater && pass < groups.length) {
    const addWater = water < targetWater;
    const remaining = Math.abs(targetWater - water);
    const candidates = groups.map((_tiles, region) => region).filter((region) => {
      const tiles = groups[region];
      if (!tiles.length || tiles.length > remaining || !tiles.every((index) => mask[index] === addWater)) return false;
      if (!addWater && tiles.some((index) => protectedWater.has(index))) return false;
      return tiles.some((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => mask[neighbor] !== mask[index]));
    }).sort((one, two) => groups[two].length - groups[one].length || hashNoise(one, pass, seed) - hashNoise(two, pass, seed));
    if (!candidates.length) break;
    for (const index of groups[candidates[0]]) mask[index] = !addWater;
    water += addWater ? groups[candidates[0]].length : -groups[candidates[0]].length;
    pass += 1;
  }
  // Resolve the unavoidable remainder as one or more connected shoreline runs,
  // never as scattered single-pixel noise.
  while (water !== targetWater) {
    const addWater = water < targetWater;
    const remaining = Math.abs(targetWater - water);
    const eligible = new Set(mask.flatMap((land, index) => land === addWater && (addWater || !protectedWater.has(index)) ? [index] : []));
    let seeds = [...eligible].filter((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => mask[neighbor] !== mask[index]));
    if (!seeds.length) seeds = [...eligible];
    if (!seeds.length) break;
    seeds.sort((one, two) => hashNoise(one % width, Math.floor(one / width), seed + water) - hashNoise(two % width, Math.floor(two / width), seed + water));
    const run: number[] = [seeds[0]];
    const queued = new Set(run);
    for (let cursor = 0; cursor < run.length && run.length < remaining; cursor += 1) {
      const neighbors = hexNeighbors(run[cursor], width, height, wraps).filter((neighbor) => eligible.has(neighbor) && !queued.has(neighbor));
      neighbors.sort((one, two) => hashNoise(one, cursor, seed) - hashNoise(two, cursor, seed));
      for (const neighbor of neighbors) { queued.add(neighbor); run.push(neighbor); if (run.length >= remaining) break; }
    }
    const change = Math.min(remaining, run.length);
    for (let index = 0; index < change; index += 1) mask[run[index]] = !addWater;
    water += addWater ? change : -change;
  }
  return mask;
}

type ClimateCell = { temperature: number; moisture: number; samples: Array<{ temperature: number; moisture: number }> };

function createClimateCells(count: number, random: () => number) {
  const samples = Array.from({ length: 17 * 17 }, (_value, index) => ({ temperature: (index % 17) / 16, moisture: Math.floor(index / 17) / 16 }));
  const points: Array<{ temperature: number; moisture: number }> = [{ temperature: random(), moisture: random() }];
  while (points.length < count) {
    const candidate = samples.reduce((best, sample) => {
      const distance = Math.min(...points.map((point) => (sample.temperature - point.temperature) ** 2 + (sample.moisture - point.moisture) ** 2));
      return distance > best.distance ? { sample, distance } : best;
    }, { sample: samples[0], distance: -1 });
    points.push({ ...candidate.sample });
  }
  for (let relaxation = 0; relaxation < 2; relaxation += 1) {
    const groups = points.map(() => [] as typeof samples);
    for (const sample of samples) {
      const owner = points.reduce((best, point, index) => {
        const distance = (sample.temperature - point.temperature) ** 2 + (sample.moisture - point.moisture) ** 2;
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
      groups[owner].push(sample);
    }
    for (let index = 0; index < points.length; index += 1) {
      if (!groups[index].length) continue;
      points[index] = {
        temperature: groups[index].reduce((sum, sample) => sum + sample.temperature, 0) / groups[index].length,
        moisture: groups[index].reduce((sum, sample) => sum + sample.moisture, 0) / groups[index].length,
      };
    }
  }
  const cells: ClimateCell[] = points.map((point) => ({ ...point, samples: [] }));
  for (const sample of samples) {
    const owner = points.reduce((best, point, index) => {
      const distance = (sample.temperature - point.temperature) ** 2 + (sample.moisture - point.moisture) ** 2;
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    cells[owner].samples.push(sample);
  }
  return cells;
}

function applyEccentricExtreme(temperature: number, moisture: number, extreme: MapGenerationOptions["eccentricExtreme"]) {
  if (extreme === "SNOWBALL") return { temperature: clamp(temperature * 0.28), moisture: clamp(0.28 + moisture * 0.46) };
  if (extreme === "JURASSIC") return { temperature: clamp(0.68 + temperature * 0.3), moisture: clamp(0.48 + moisture * 0.5) };
  if (extreme === "ARRAKIS") return { temperature: clamp(0.54 + temperature * 0.44), moisture: clamp(moisture * 0.16) };
  if (extreme === "ARBOREA") return { temperature: clamp(0.36 + temperature * 0.42), moisture: clamp(0.72 + moisture * 0.27) };
  return { temperature, moisture };
}

function createClimatePalette(region: number, center: Point, options: MapGenerationOptions, width: number, height: number, random: () => number, climateCells: ClimateCell[], scale: WorldScale, seed: number) {
  const character = worldCharacterProfile(options.style).eccentric;
  const latitude = scaledPoleProximity(center.x, center.y, width, height, options.projectionType, scale, seed + 37);
  const orderedTemperature = 0.12 + Math.cos(latitude * Math.PI / 2) * 0.78;
  const orderedMoisture = 0.48 + Math.sin((latitude + 0.08) * Math.PI * 2) * 0.16;
  const logic = options.regionClimateLogic;
  const influence = clamp((logic === "ORDERED" ? 0.88 : logic === "INFLUENCED" ? 0.52 : 0.08) + character.climateInfluenceDelta);
  const climateShift = options.climate === "HOT" ? 0.14 : options.climate === "COOL" ? -0.14 : 0;
  const rainShift = options.rainfall === "WET" ? 0.17 : options.rainfall === "ARID" ? -0.17 : 0;
  const desiredTemperature = clamp(orderedTemperature + climateShift);
  const desiredMoisture = clamp(orderedMoisture + rainShift);
  const climateCell = climateCells.reduce((best, cell, index) => {
    const orderedDistance = (cell.temperature - desiredTemperature) ** 2 + (cell.moisture - desiredMoisture) ** 2;
    const freeDistance = hashNoise(region, index, 1709) * 1.4;
    const score = orderedDistance * influence + freeDistance * (1 - influence);
    return score < best.score ? { index, score } : best;
  }, { index: 0, score: Number.POSITIVE_INFINITY }).index;
  const cell = climateCells[climateCell];
  const base = applyEccentricExtreme(clamp(cell.temperature + climateShift), clamp(cell.moisture + rainShift + character.moistureBias), options.eccentricExtreme);
  const temperature = base.temperature;
  const moisture = base.moisture;
  const anchorCount = Math.max(2, Math.min(4, (options.fantasticality === "UNBOUND" ? 4 : options.fantasticality === "MYTHIC" ? 3 : 2) + character.paletteDelta));
  const selectedSamples = [cell.samples.reduce((best, sample) => {
    const distance = (sample.temperature - cell.temperature) ** 2 + (sample.moisture - cell.moisture) ** 2;
    return distance < best.distance ? { sample, distance } : best;
  }, { sample: cell.samples[0] ?? { temperature, moisture }, distance: Number.POSITIVE_INFINITY }).sample];
  while (selectedSamples.length < anchorCount && cell.samples.length) {
    const candidate = cell.samples.reduce((best, sample) => {
      const distance = Math.min(...selectedSamples.map((selected) => (sample.temperature - selected.temperature) ** 2 + (sample.moisture - selected.moisture) ** 2));
      return distance > best.distance ? { sample, distance } : best;
    }, { sample: cell.samples[0], distance: -1 });
    selectedSamples.push(candidate.sample);
  }
  const anchors: ClimateAnchor[] = selectedSamples.map((sample, index) => {
    const shifted = applyEccentricExtreme(clamp(sample.temperature + climateShift), clamp(sample.moisture + rainShift + character.moistureBias), options.eccentricExtreme);
    return {
      ...shifted,
      forest: options.eccentricExtreme === "ARBOREA" || shifted.moisture > 0.48 && hashNoise(region, index, 1811) > 0.18,
      jungle: shifted.temperature > 0.66 && shifted.moisture > 0.62 && hashNoise(region, index, 1813) > 0.12,
      marsh: shifted.moisture > 0.76 && hashNoise(region, index, 1817) > 0.45,
    };
  });
  // Unbound realms deliberately include one climate contradiction, but it is
  // still assigned as a contiguous collection rather than tile confetti.
  if (character.allowContradiction && options.fantasticality === "UNBOUND" && anchors.length > 1 && options.regionClimateLogic !== "ORDERED") {
    const last = anchors.length - 1;
    const inverted = applyEccentricExtreme(clamp(1 - anchors[0].temperature), clamp(1 - anchors[0].moisture), options.eccentricExtreme);
    anchors[last] = { ...anchors[last], ...inverted, forest: inverted.moisture > 0.48, jungle: inverted.temperature > 0.66 && inverted.moisture > 0.62, marsh: inverted.moisture > 0.76 };
  }
  return { temperature, moisture, anchors, region, climateCell };
}

function chooseTerrain(temperature: number, moisture: number, contrast: MapGenerationOptions["regionContrast"], dominantTerrains: MapGenerationOptions["dominantTerrains"]) {
  const dominant = new Set(dominantTerrains);
  const strength = contrast === "EXTREME" ? 1.22 : contrast === "BLENDED" ? 0.78 : 1;
  const scores: Array<[number, number]> = [
    [2, 1.05 - Math.abs(moisture - 0.7) * 1.3 * strength - Math.abs(temperature - 0.62) * 0.72 + (dominant.has("GRASSLAND") ? 0.58 : 0)],
    [3, 0.94 - Math.abs(moisture - 0.47) * 1.05 * strength - Math.abs(temperature - 0.56) * 0.42 + (dominant.has("PLAINS") ? 0.58 : 0)],
    [4, 0.58 + (temperature - 0.56) * 0.8 + (0.36 - moisture) * 1.72 * strength + (dominant.has("DESERT") ? 0.58 : 0)],
    [5, 0.7 + (0.4 - temperature) * 1.65 - Math.abs(moisture - 0.48) * 0.28 + (dominant.has("TUNDRA") ? 0.58 : 0)],
    [6, 0.72 + (0.22 - temperature) * 3.5],
  ];
  return scores.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function edgeKey(one: number, two: number) {
  return one < two ? `${one}:${two}` : `${two}:${one}`;
}

function selectMountainEdges(edges: PolygonEdge[], desired: number, coastalPercent: number, fantasticality: MapGenerationOptions["fantasticality"], rangeLength: number, random: () => number, seed: number) {
  const selected = new Set<string>();
  const selectedSide = new Map<string, number>();
  const unused = [...edges];
  let ranges = 0;
  let boundaryRangeEdges = 0;
  const vertexRange = new Map<number, number>();
  const maxLength = Math.max(2, Math.round((fantasticality === "UNBOUND" ? 7 : fantasticality === "MYTHIC" ? 6 : 4) * rangeLength));
  while (selected.size < desired && unused.length) {
    unused.sort((one, two) => {
      const preference = (edge: PolygonEdge) => (edge.coastal ? coastalPercent / 100 : 1 - coastalPercent / 100) + edge.contrast * (fantasticality === "UNBOUND" ? 1.8 : 1.25) + hashNoise(edge.one, edge.two, seed) * 0.55;
      return preference(two) - preference(one);
    });
    let current = unused.shift()!;
    if (selected.has(edgeKey(current.one, current.two))) continue;
    ranges += 1;
    for (let step = 0; step < maxLength && current && selected.size < desired; step += 1) {
      const key = edgeKey(current.one, current.two);
      if (selected.has(key)) break;
      selected.add(key);
      selectedSide.set(key, hashNoise(current.one, current.two, seed + ranges) > 0.5 ? current.one : current.two);
      vertexRange.set(current.one, ranges);
      vertexRange.set(current.two, ranges);
      if (!current.coastal && current.contrast > 0.24) boundaryRangeEdges += 1;
      const currentCoastal = current.coastal;
      const connected = unused.filter((edge) => {
        if (edge.coastal !== currentCoastal || selected.has(edgeKey(edge.one, edge.two))) return false;
        const joinsCurrent = edge.one === current.one || edge.one === current.two || edge.two === current.one || edge.two === current.two;
        if (!joinsCurrent) return false;
        const oneRange = vertexRange.get(edge.one);
        const twoRange = vertexRange.get(edge.two);
        return (oneRange === undefined || oneRange === ranges) && (twoRange === undefined || twoRange === ranges);
      });
      if (!connected.length) break;
      connected.sort((one, two) => two.contrast + random() * 0.2 - one.contrast - random() * 0.2);
      current = connected[0];
      const index = unused.indexOf(current);
      if (index >= 0) unused.splice(index, 1);
    }
  }
  return { selected, selectedSide, ranges, boundaryRangeEdges };
}

export function generateEccentricGeography(
  options: MapGenerationOptions,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  random: () => number,
  scale: WorldScale = "GLOBAL",
  constraints?: GenerationConstraintPayload,
): EccentricGeography {
  const area = width * height;
  const character = worldCharacterProfile(options.style);
  const scaleProfile = worldScaleProfile(scale);
  const baseTopology = topologyForPreset(options);
  const profile: TopologyProfile = {
    ...baseTopology,
    majorContinents: Math.max(1, Math.round(baseTopology.majorContinents * scaleProfile.eccentric.majorSystemFrequency)),
    islands: Math.max(0, Math.round(baseTopology.islands * character.eccentric.fragmentation * scaleProfile.eccentric.majorSystemFrequency)),
    tinyIslands: Math.max(0, Math.round(baseTopology.tinyIslands * character.eccentric.fragmentation * scaleProfile.eccentric.majorSystemFrequency)),
    astronomyBlobs: Math.max(1, Math.round(baseTopology.astronomyBlobs * scaleProfile.eccentric.majorSystemFrequency)),
    inlandSeas: Math.max(0, Math.round(baseTopology.inlandSeas * scaleProfile.eccentric.majorSystemFrequency)),
    lakes: Math.max(0, Math.round(baseTopology.lakes * (0.8 + character.eccentric.fragmentation * 0.2) * scaleProfile.eccentric.majorSystemFrequency)),
  };
  const organicity = clamp((options.fantasticality === "UNBOUND" ? 1 : options.fantasticality === "MYTHIC" ? 0.72 : 0.38) * character.eccentric.organicity, 0.18, 1.35);
  const polygonTargets = { LOW: 100, FAIR: 200, HIGH: 250, VERY_HIGH: 300 } as const;
  const polygonCount = Math.max(18, Math.min(Math.floor(area / 3), Math.round(polygonTargets[options.granularity] * scaleProfile.eccentric.polygonDetail)));
  const hexesPerSubregion = Math.max(1, 1.05292 * Math.log(area) - 5.74245);
  const subregionCount = Math.max(polygonCount * 2, Math.min(area, Math.ceil(area / hexesPerSubregion * scaleProfile.eccentric.subregionDetail)));

  // Pass 1: render a dense, deliberately uneven subpolygon world.
  let subregionCenters = scatteredPoints(subregionCount, width, height, random, options.fantasticality, character.eccentric.pointJitter);
  let subregions = assignHexes(subregionCenters, width, height, wraps);
  const relaxationPasses = options.fantasticality === "RESTRAINED" || character.eccentric.pointJitter < 0.95 ? 1 : 0;
  for (let pass = 0; pass < relaxationPasses; pass += 1) {
    subregionCenters = relaxPoints(subregionCenters, subregions, width, wraps);
    subregions = assignHexes(subregionCenters, width, height, wraps);
  }
  const subregionAdjacency = buildAdjacency(subregions, subregionCount, width, height, wraps);

  // Pass 2: aggregate those cells into connected polygons without discarding their boundaries.
  const subregionToPolygon = graphPartition(subregionAdjacency, subregionCenters, polygonCount, width, wraps, random, organicity);
  const polygonCenters = aggregateCenters(subregionToPolygon, subregionCenters, polygonCount, width, wraps);
  const polygonAdjacency = aggregateAdjacency(subregionAdjacency, subregionToPolygon, polygonCount);
  const hexPolygons = new Int32Array(area);
  const polygonAreas = new Array<number>(polygonCount).fill(0);
  for (let index = 0; index < area; index += 1) {
    const polygon = subregionToPolygon[subregions[index]];
    hexPolygons[index] = polygon;
    polygonAreas[polygon] += 1;
  }

  // Pass 3: compile deep-water barriers first. Their graph components are the
  // authoritative Astronomy basins used by the landmass pass below.
  const targetWater = Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const targetLand = area - targetWater;
  const requestedAstronomyBasins = targetWater === 0 ? 1 : Math.max(1, Math.min(5, Math.round(options.oceanBasins)));
  const basinPlan = buildAstronomyBarriers(profile, polygonAdjacency, polygonCenters, polygonAreas, width, height, wraps, requestedAstronomyBasins, targetWater, seed + 307);
  const riftPolygons = basinPlan.barriers;

  // Pass 4: allocate major continents and islands inside those basins, then
  // add tiny subregion islands and inland waters before coherent reconciliation.
  const polygonLand = allocateLandPolygons(profile, polygonAdjacency, polygonCenters, polygonAreas, basinPlan.members, riftPolygons, targetLand, width, wraps, random, seed + 401);
  const polarWaterPolygons = new Set<number>();
  if (!options.landAtPoles && targetWater > 0) {
    for (let polygon = 0; polygon < polygonCount; polygon += 1) {
      const center = polygonCenters[polygon];
      if (poleProximity(center.x, center.y, width, height, options.projectionType) > 0.91) {
        polygonLand[polygon] = false;
        polarWaterPolygons.add(polygon);
      }
    }
  }
  let nativeRelationshipPaths = 0;
  if (constraints?.topology.length === area) {
    const forcedLand = new Array<number>(polygonCount).fill(0);
    const forcedWater = new Array<number>(polygonCount).fill(0);
    for (let index = 0; index < area; index += 1) {
      if (constraints.topology[index] === 1) forcedLand[hexPolygons[index]] += 1;
      else if (constraints.topology[index] === 0) forcedWater[hexPolygons[index]] += 1;
    }
    for (let polygon = 0; polygon < polygonCount; polygon += 1) {
      if (forcedLand[polygon] > forcedWater[polygon]) polygonLand[polygon] = true;
      else if (forcedWater[polygon] > forcedLand[polygon]) polygonLand[polygon] = false;
    }
    for (const semantic of constraints.semantics) for (const related of semantic.relatedAnchors) {
      const start = hexPolygons[semantic.anchorIndex];
      const end = hexPolygons[related.index];
      const sourceLand = constraints.topology[semantic.anchorIndex];
      const relatedLand = constraints.topology[related.index];
      if (start === end || sourceLand < 0 || sourceLand !== relatedLand) continue;
      const path = graphPathBetween(polygonAdjacency, polygonCenters, start, end, width, wraps, seed + 433 + nativeRelationshipPaths * 37);
      if (!path.length) continue;
      for (const polygon of path) polygonLand[polygon] = sourceLand === 1;
      nativeRelationshipPaths += 1;
    }
  }
  const landMask = Array.from(hexPolygons, (polygon) => polygonLand[polygon]);
  const protectedWater = new Set<number>();
  for (let index = 0; index < area; index += 1) if (riftPolygons.has(hexPolygons[index]) || polarWaterPolygons.has(hexPolygons[index])) protectedWater.add(index);
  const decorations = decorateSmallWatersAndIslands(landMask, subregions, subregionAdjacency, hexPolygons, riftPolygons, profile, targetWater, width, height, wraps, seed + 457);
  for (const index of decorations.protectedWater) protectedWater.add(index);
  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 503, protectedWater);
  const topologyScores = landMask.map((land, index) => Number(land) + hashNoise(index % width, Math.floor(index / width), seed + 509) * 0.001);
  applyConstrainedLandBudget(landMask, targetLand, topologyScores, constraints);
  const { ids: continentIds, count: continentCount, sizes: continentSizes } = connectedComponents(landMask, width, height, wraps);
  const waterComponents = connectedComponents(landMask.map((land) => !land), width, height, wraps);

  const landPolygons = new Set<number>();
  const polygonLandTiles = new Array<number>(polygonCount).fill(0);
  for (let index = 0; index < area; index += 1) if (landMask[index]) polygonLandTiles[hexPolygons[index]] += 1;
  for (let polygon = 0; polygon < polygonCount; polygon += 1) if (polygonLandTiles[polygon] >= polygonAreas[polygon] * 0.5) landPolygons.add(polygon);

  // Pass 5: regions receive nested, graph-contiguous biome collections drawn
  // from a relaxed Voronoi field in abstract temperature/rainfall space.
  const regionDivisor = options.fantasticality === "UNBOUND" ? 2.6 : options.fantasticality === "MYTHIC" ? 4 : 6;
  const contrastFactor = options.regionContrast === "EXTREME" ? 0.74 : options.regionContrast === "BLENDED" ? 1.3 : 1;
  const desiredRegions = Math.max(1, Math.min(landPolygons.size, Math.ceil(landPolygons.size / regionDivisor / contrastFactor)));
  const polygonRegions = graphPartition(polygonAdjacency, polygonCenters, desiredRegions, width, wraps, random, organicity, landPolygons);
  const regionCenters = aggregateCenters(polygonRegions, polygonCenters, desiredRegions, width, wraps);
  const climateCells = createClimateCells(Math.max(4, Math.min(18, Math.ceil(Math.sqrt(desiredRegions) * 2.2))), random);
  const climatePalettes: ClimatePalette[] = regionCenters.map((center, region) => createClimatePalette(region, center, options, width, height, random, climateCells, scale, seed));
  const collectionAssignments = new Int32Array(subregionCount);
  collectionAssignments.fill(-1);
  for (let region = 0; region < desiredRegions; region += 1) {
    const allowed = new Set<number>();
    for (let subregion = 0; subregion < subregionCount; subregion += 1) {
      const polygon = subregionToPolygon[subregion];
      if (polygon >= 0 && polygonRegions[polygon] === region) allowed.add(subregion);
    }
    if (!allowed.size) continue;
    const assignments = graphPartition(subregionAdjacency, subregionCenters, climatePalettes[region].anchors.length, width, wraps, random, organicity, allowed);
    for (const subregion of allowed) collectionAssignments[subregion] = assignments[subregion];
  }
  const temperatures = new Array<number>(area);
  const moistures = new Array<number>(area);
  const tileClimateAnchors = new Array<ClimateAnchor | undefined>(area);
  for (let index = 0; index < area; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const polygon = hexPolygons[index];
    const region = polygonRegions[polygon];
    if (region < 0 || !climatePalettes[region]) {
      temperatures[index] = 0.5;
      moistures[index] = 0.5;
      continue;
    }
    const palette = climatePalettes[region];
    const subregion = subregions[index];
    const collection = Math.max(0, collectionAssignments[subregion]);
    const anchor = palette.anchors[Math.min(palette.anchors.length - 1, collection)];
    tileClimateAnchors[index] = anchor;
    const detailScale = (options.fantasticality === "UNBOUND" ? 3.2 : 5.4) / Math.max(0.65, character.eccentric.reliefNoise);
    temperatures[index] = clamp(anchor.temperature + (valueNoise(x + 101, y + 211, detailScale, seed + 601) - 0.5) * 0.16 * character.eccentric.reliefNoise);
    moistures[index] = clamp(anchor.moisture + (valueNoise(x + 419, y + 73, detailScale + 1.3, seed + 701) - 0.5) * 0.2 * character.eccentric.reliefNoise + character.eccentric.moistureBias * 0.35);
  }

  const paletteDistance = (one: number, two: number) => {
    if (one < 0 || two < 0 || !climatePalettes[one] || !climatePalettes[two]) return 0;
    const a = climatePalettes[one];
    const b = climatePalettes[two];
    return Math.hypot(a.temperature - b.temperature, a.moisture - b.moisture);
  };
  let biomeTransitions = 0;
  const edges: PolygonEdge[] = [];
  for (let polygon = 0; polygon < polygonCount; polygon += 1) {
    for (const other of polygonAdjacency[polygon]) {
      if (other <= polygon || !landPolygons.has(polygon) && !landPolygons.has(other)) continue;
      const coastal = landPolygons.has(polygon) !== landPolygons.has(other);
      const contrast = coastal ? 0.38 : paletteDistance(polygonRegions[polygon], polygonRegions[other]);
      if (!coastal && polygonRegions[polygon] !== polygonRegions[other] && contrast > 0.24) biomeTransitions += 1;
      edges.push({ one: polygon, two: other, coastal, contrast });
    }
  }

  // Pass 6: non-self-intersecting ranges follow one side of coastal arcs and
  // the borders between dissonant regional palettes.
  const desiredRangeEdges = Math.max(1, Math.round(edges.length * clamp(options.mountainPercent / 100, 0, 0.38) * (options.fantasticality === "UNBOUND" ? 2.15 : 1.72) * character.eccentric.rangeLength));
  const mountainSelection = selectMountainEdges(edges, desiredRangeEdges, options.coastalRangePercent, options.fantasticality, character.eccentric.rangeLength, random, seed + 809);
  const mountainCore = new Uint8Array(area);
  const boundaryDistance = new Uint8Array(area);
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const polygon = hexPolygons[index];
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      const other = hexPolygons[neighbor];
      const key = edgeKey(polygon, other);
      if (other !== polygon && mountainSelection.selected.has(key) && mountainSelection.selectedSide.get(key) === polygon) {
        mountainCore[index] = 1;
        break;
      }
    }
  }
  for (let index = 0; index < area; index += 1) {
    if (mountainCore[index]) continue;
    if (hexNeighbors(index, width, height, wraps).some((neighbor) => mountainCore[neighbor])) boundaryDistance[index] = 1;
  }

  const reliefValues = new Array<number>(area);
  for (let index = 0; index < area; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const regionalUpliftThreshold = clamp((options.fantasticality === "UNBOUND" ? 0.79 : 0.9) + character.eccentric.regionalUpliftDelta, 0.55, 0.98);
    const regionalUplift = hashNoise(polygonRegions[hexPolygons[index]], hexPolygons[index], seed + 907) > regionalUpliftThreshold ? 0.24 * character.eccentric.reliefNoise : 0;
    reliefValues[index] = valueNoise(x + 811, y + 307, (options.fantasticality === "UNBOUND" ? 5.2 : 8.2) / Math.max(0.7, character.eccentric.reliefNoise), seed + 1009) * 0.42 * character.eccentric.reliefNoise + mountainCore[index] * 0.9 + boundaryDistance[index] * 0.3 * character.eccentric.rangeLength + regionalUplift;
  }
  const landRelief = reliefValues.filter((_value, index) => landMask[index]);
  const effectiveMountainPercent = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" ? Math.max(18, options.mountainPercent) : Math.max(character.mountainFloor, options.mountainPercent);
  const hillPercent = options.worldAge === "YOUNG" ? 29 : options.worldAge === "OLD" ? 12 : 20;
  const mountainThreshold = effectiveMountainPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - clamp(effectiveMountainPercent / 100, 0, 0.42));
  const hillThreshold = quantile(landRelief, 1 - clamp((effectiveMountainPercent + hillPercent) / 100, 0, 0.74));
  const elevations = landMask.map((land, index) => land ? reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0 : 0);
  applyConstrainedRelief(reliefValues, elevations, landMask, constraints);

  // Pass 7: optional realism adds west-to-east rain shadows without erasing the regional palette.
  if (options.regionClimateLogic === "ORDERED" || options.climateRealism) {
    for (let y = 0; y < height; y += 1) {
      let airborneMoisture = clamp(0.55 + (valueNoise(0, y + 43, 8, seed + 1103) - 0.5) * 0.16);
      let upwindRelief = reliefValues[y * width];
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const regionalMoisture = moistures[index];
        if (!landMask[index]) {
          airborneMoisture += (0.88 - airborneMoisture) * 0.34;
          upwindRelief = reliefValues[index];
          continue;
        }
        airborneMoisture += (regionalMoisture - airborneMoisture) * 0.08;
        const rise = Math.max(0, reliefValues[index] - upwindRelief);
        const mountainLift = elevations[index] === 2 ? 0.08 : elevations[index] === 1 ? 0.022 : 0;
        const precipitation = rise * 0.72 + mountainLift;
        moistures[index] = clamp(regionalMoisture * 0.58 + airborneMoisture * 0.42 + precipitation * 0.68);
        airborneMoisture = clamp(airborneMoisture - precipitation * 0.86);
        upwindRelief = reliefValues[index];
      }
    }
  }
  if (options.modifier === "DOOMSDAY") for (let index = 0; index < moistures.length; index += 1) moistures[index] = clamp(moistures[index] - 0.14);

  // Pass 8: render every retained small-region decision into Civ V tile content
  // and emit hierarchy guidance for the legal downstream river encoder.
  const tiles = landMask.map<Civ5Tile>((land, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const adjacentLand = hexNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    let terrain = land ? chooseTerrain(temperatures[index], moistures[index], options.regionContrast, options.dominantTerrains) : adjacentLand ? 1 : 0;
    let feature = 255;
    const featureNoise = hashNoise(subregions[index], index, seed + 1201);
    const climateAnchor = tileClimateAnchors[index];
    if (!land && scaledPoleProximity(x, y, width, height, options.projectionType, scale, seed + 37) > 0.86 && featureNoise > 0.34) feature = 3;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && climateAnchor?.jungle && temperatures[index] > 0.66 && moistures[index] > 0.62 && featureNoise > 0.19) feature = 1;
    else if (land && elevations[index] === 0 && terrain === 2 && climateAnchor?.marsh && moistures[index] > 0.74 && featureNoise > 0.34) feature = 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && climateAnchor?.forest && moistures[index] > 0.48 && featureNoise > (options.eccentricExtreme === "ARBOREA" ? 0.06 : 0.3)) feature = 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.24 && featureNoise > 0.955) feature = 4;
    if (!land) terrain = adjacentLand ? 1 : 0;
    return { terrain, resource: 255, feature, river: 0, elevation: elevations[index], continent: land ? continentIds[index] + 1 : 0, wonder: 255, resourceAmount: 0 };
  });
  applyConstrainedSurface(tiles, landMask, elevations, constraints);

  const riverGuidance = new Array<number>(area).fill(0);
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const polygon = hexPolygons[index];
    const subregion = subregions[index];
    let guidance = 0.12;
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      if (!landMask[neighbor]) continue;
      if (hexPolygons[neighbor] !== polygon) guidance = Math.max(guidance, 1);
      else if (subregions[neighbor] !== subregion) guidance = Math.max(guidance, 0.58);
    }
    riverGuidance[index] = guidance;
    if (constraints?.hydrologyMask[index]) riverGuidance[index] = Math.max(riverGuidance[index], constraints.rivers[index] ? 1 : 0.58);
  }

  const climateAssignments = new Int32Array(area).fill(-1);
  for (let index = 0; index < area; index += 1) if (landMask[index]) climateAssignments[index] = polygonRegions[hexPolygons[index]];
  const subregionObjects = objectsFromAssignments("SUBREGION", subregions, subregionCount, "Subregion");
  const polygonObjects = objectsFromAssignments("POLYGON", hexPolygons, polygonCount, "Polygon").map((object, index) => ({
    ...object,
    neighbors: [...polygonAdjacency[index]].map((neighbor) => `polygon-${neighbor + 1}`),
    attributes: { landRatio: polygonLandTiles[index] / Math.max(1, polygonAreas[index]), region: polygonRegions[index] + 1 },
  }));
  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent").map((object) => ({ ...object, attributes: { island: object.tileIndices.length < area * 0.018 } }));
  const rawWaterBodies = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Water Body");
  const largestWater = Math.max(0, ...rawWaterBodies.map((object) => object.tileIndices.length));
  const basins: GeographicObject[] = rawWaterBodies.map((object, index) => {
    const touchesEdge = object.tileIndices.some((tile) => { const x = tile % width; const y = Math.floor(tile / width); return x === 0 || x === width - 1 || y === 0 || y === height - 1; });
    const kind = object.tileIndices.length < area * 0.012 ? "LAKE" : !wraps && !touchesEdge || wraps && object.tileIndices.length < largestWater * 0.5 ? "INLAND_SEA" : "OCEAN_BASIN";
    const label = kind === "LAKE" ? "Lake" : kind === "INLAND_SEA" ? "Inland Sea" : "Ocean Basin";
    return { ...object, id: `${kind.toLowerCase()}-${index + 1}`, name: `${label} ${index + 1}`, kind, attributes: { touchesMapEdge: touchesEdge } };
  });
  const designedInlandWaters: GeographicObject[] = decorations.waterBodies.map((tileIndices, index) => {
    const kind = index < profile.inlandSeas ? "INLAND_SEA" as const : "LAKE" as const;
    return { id: `designed-${kind.toLowerCase()}-${index + 1}`, name: `${kind === "INLAND_SEA" ? "Inland Sea" : "Lake"} ${index + 1}`, kind, tileIndices, attributes: { designed: true } };
  });
  basins.push(...designedInlandWaters);
  const deepWaterMask = landMask.map((land, index) => !land && riftPolygons.has(hexPolygons[index]));
  const astronomyAssignments = new Int32Array(area).fill(-1);
  for (let index = 0; index < area; index += 1) {
    const polygon = hexPolygons[index];
    if (!riftPolygons.has(polygon)) astronomyAssignments[index] = basinPlan.ids[polygon];
  }
  const astronomyObjects = objectsFromAssignments("SUPERPOLYGON", astronomyAssignments, basinPlan.count, "Astronomy Basin").map((object) => ({ ...object, attributes: { geography: "ASTRONOMY_BASIN", authoritative: true } }));
  const superpolygons: GeographicObject[] = [...continents, ...basins].map((object, index) => ({ id: `superpolygon-${index + 1}`, name: `Superpolygon ${index + 1}`, kind: "SUPERPOLYGON", tileIndices: [...object.tileIndices], attributes: { geography: object.kind, member: object.id } }));
  const rifts = connectedTileObjects("RIFT", deepWaterMask, width, height, wraps, "Astronomy Rift");
  const climateObjects = objectsFromAssignments("CLIMATE_REGION", climateAssignments, desiredRegions, "Climate Realm").map((object, index) => ({
    ...object,
    attributes: { paletteSize: climatePalettes[index]?.anchors.length ?? 0, climateCell: climatePalettes[index]?.climateCell ?? -1, temperature: Math.round((climatePalettes[index]?.temperature ?? 0.5) * 100), rainfall: Math.round((climatePalettes[index]?.moisture ?? 0.5) * 100) },
  }));
  const collectionObjects: GeographicObject[] = [];
  for (let region = 0; region < climatePalettes.length; region += 1) {
    for (let collection = 0; collection < climatePalettes[region].anchors.length; collection += 1) {
      const mask = landMask.map((land, index) => land && polygonRegions[hexPolygons[index]] === region && collectionAssignments[subregions[index]] === collection);
      const components = connectedTileObjects("BIOME_COLLECTION", mask, width, height, wraps, "Biome Collection");
      const anchor = climatePalettes[region].anchors[collection];
      collectionObjects.push(...components.map((component, part) => ({ ...component, id: `biome-collection-${region + 1}-${collection + 1}-${part + 1}`, name: `Biome Collection ${region + 1}.${collection + 1}${components.length > 1 ? ` · Part ${part + 1}` : ""}`, attributes: { region: region + 1, collection: collection + 1, temperature: Math.round(anchor.temperature * 100), rainfall: Math.round(anchor.moisture * 100), forest: anchor.forest, jungle: anchor.jungle, marsh: anchor.marsh } })));
    }
  }
  const ranges = connectedLinearFeatures(Array.from(mountainCore, (value, index) => Boolean(value) && landMask[index]), width, height, wraps, "Mountain Range");
  const archipelagos = continents.filter((object) => object.tileIndices.length < area * 0.035).map((object, index) => ({ ...object, id: `archipelago-${index + 1}`, name: `Archipelago ${index + 1}`, kind: "ARCHIPELAGO" as const, attributes: { sourceContinent: object.id } }));
  const straits = connectedTileObjects("STRAIT", landMask.map((land, index) => !land && hexNeighbors(index, width, height, wraps).filter((neighbor) => landMask[neighbor]).length >= 4), width, height, wraps, "Strait");
  const bays = connectedTileObjects("BAY", landMask.map((land, index) => !land && hexNeighbors(index, width, height, wraps).filter((neighbor) => landMask[neighbor]).length === 3), width, height, wraps, "Bay");
  const capes = connectedTileObjects("CAPE", landMask.map((land, index) => land && hexNeighbors(index, width, height, wraps).filter((neighbor) => !landMask[neighbor]).length >= 3), width, height, wraps, "Cape");
  const forestRealms = connectedTileObjects("FOREST_REALM", tiles.map((tile, index) => landMask[index] && (tile.feature === 0 || tile.feature === 1)), width, height, wraps, "Forest Realm").filter((object) => object.tileIndices.length >= 3);
  const wastes = connectedTileObjects("WASTE", tiles.map((tile, index) => landMask[index] && tile.feature === 255 && (tile.terrain === 4 || tile.terrain === 5 || tile.terrain === 6)), width, height, wraps, "Waste").filter((object) => object.tileIndices.length >= 3);
  const identities: GeographicObject[] = [...archipelagos, ...straits, ...bays, ...capes, ...forestRealms, ...wastes];
  const majorLandmasses = continentSizes.filter((size) => size >= area * 0.035).length;
  const islands = continentSizes.filter((size) => size < area * 0.035 && size >= 3).length;
  const tinyIslands = Math.max(decorations.tinyIslands, continentSizes.filter((size) => size < 3).length);
  const diagnostics: EccentricDiagnostics = {
    passes: 8,
    subregions: subregionObjects.length,
    polygons: polygonObjects.length,
    climateRegions: climateObjects.length,
    climatePalettes: climatePalettes.reduce((sum, palette) => sum + palette.anchors.length, 0),
    biomeTransitions,
    continents: continentCount,
    oceanBasins: waterComponents.count,
    astronomyBasins: basinPlan.count,
    deepWaterBarriers: rifts.length,
    tinyIslands,
    mountainRanges: ranges.length,
    requestedAstronomyBasins,
    majorLandmasses,
    islands,
    climateCollections: climatePalettes.reduce((sum, palette) => sum + palette.anchors.length, 0),
    boundaryRangeEdges: mountainSelection.boundaryRangeEdges,
    majorRiverCorridorTiles: riverGuidance.filter((value) => value >= 0.85).length,
    minorRiverCorridorTiles: riverGuidance.filter((value) => value >= 0.45 && value < 0.85).length,
    geographicIdentities: identities.length,
    ...(constraints ? { nativeGraphRelationshipPaths: nativeRelationshipPaths } : {}),
    ...nativeConstraintDiagnostics(constraints),
  };
  const structure: GenerationStructure = {
    engine: "ECCENTRIC",
    objects: [...subregionObjects, ...polygonObjects, ...superpolygons, ...astronomyObjects, ...continents, ...basins, ...rifts, ...climateObjects, ...collectionObjects, ...identities],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: { ...diagnostics, scaleEccentricPolygonTarget: polygonCount, scaleEccentricSubregionTarget: subregionCount, superpolygons: superpolygons.length + astronomyObjects.length, inlandSeas: basins.filter((object) => object.kind === "INLAND_SEA").length, lakes: basins.filter((object) => object.kind === "LAKE").length, rifts: rifts.length },
  };

  return { landMask, reliefValues, temperatures, moistures, elevations, riverGuidance, tiles, structure, diagnostics };
}
