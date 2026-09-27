import type { Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { poleProximity } from "./climate-projection.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { WorldScale } from "./generation-recipe.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";
import { narrativeInfluenceStrength, type EccentricGraphPlan, type NarrativeAdapterPlan } from "./narrative-engine-adapters.ts";

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
  startLocations?: Civ5StartLocation[];
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
  if (options.preset === "SHATTERED_BASINS") return { grammar: "ENCIRCLING", majorContinents: 1, islands: 0, tinyIslands: 0, astronomyBlobs: 0, inlandSeas: 3, lakes: 0, openWaterRatio: 0.08 };
  if (options.preset === "LONELY_OCEANS") return { grammar: "LONELY_OCEANS", majorContinents: 0, islands: Math.max(2, Math.min(22, options.players)), tinyIslands: 0, astronomyBlobs: 3, inlandSeas: 0, lakes: 0, openWaterRatio: 0.72 };
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

function graphPathBetween(adjacency: Array<Set<number>>, centers: Point[], start: number, end: number, width: number, wraps: boolean, seed: number, blocked: ReadonlySet<number> = new Set()) {
  if (blocked.has(start) || blocked.has(end)) return [];
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
      if (blocked.has(neighbor)) continue;
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

type EccentricNarrativeReservations = {
  forcedLand: Set<number>;
  forcedWater: Set<number>;
  ridgePolygons: Set<number>;
  riverPolygons: Set<number>;
  regionPolygons: Map<string, number[]>;
  pathPolygons: Map<string, number[]>;
  realizedRegionTiles: Map<string, number[]>;
  realizedPathTiles: Map<string, number[]>;
  realizedPathSupportTiles: Map<string, number[]>;
  edgeLandPolygons: Set<number>;
  landPriority: number[];
  waterPriority: number[];
  landOrder: number[];
  waterOrder: number[];
  semanticReservations: number;
};

function compileGraphReservations(
  plan: EccentricGraphPlan | undefined,
  adjacency: Array<Set<number>>,
  centers: Point[],
  areas: number[],
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  constraints?: GenerationConstraintPayload,
  hexPolygons?: Int32Array,
): EccentricNarrativeReservations {
  const result: EccentricNarrativeReservations = {
    forcedLand: new Set(),
    forcedWater: new Set(),
    ridgePolygons: new Set(),
    riverPolygons: new Set(),
    regionPolygons: new Map(),
    pathPolygons: new Map(),
    realizedRegionTiles: new Map(),
    realizedPathTiles: new Map(),
    realizedPathSupportTiles: new Map(),
    edgeLandPolygons: new Set(),
    landPriority: new Array(centers.length).fill(0),
    waterPriority: new Array(centers.length).fill(0),
    landOrder: new Array(centers.length).fill(Number.POSITIVE_INFINITY),
    waterOrder: new Array(centers.length).fill(Number.POSITIVE_INFINITY),
    semanticReservations: 0,
  };
  if (!plan) return result;
  const principalBrokenChains = new Set(plan.grammarFamily === "GRAPH_BROKEN_ISLAND_CHAINS"
    ? plan.regions.filter((region) => region.role === "CHAIN").slice(0, 3).map((region) => region.id)
    : []);
  const regionParent = new Map(plan.regions.map((region) => [region.id, region.parentId]));
  const belongsToPrincipalBrokenChain = (regionId: string) => principalBrokenChains.has(regionId)
    || principalBrokenChains.has(regionParent.get(regionId) ?? "");
  const nearest = (point: { x: number; y: number }) => centers.reduce((best, center, polygon) => {
    if (areas[polygon] <= 0) return best;
    const distance = pointDistanceSquared(center, { x: point.x * width, y: point.y * height }, width, wraps);
    return distance < best.distance ? { polygon, distance } : best;
  }, { polygon: 0, distance: Number.POSITIVE_INFINITY }).polygon;
  let reservationOrder = 0;
  const reserve = (polygon: number, water: boolean, strength: number) => {
    const priorities = water ? result.waterPriority : result.landPriority;
    const orders = water ? result.waterOrder : result.landOrder;
    priorities[polygon] += strength;
    if (!Number.isFinite(orders[polygon])) orders[polygon] = reservationOrder;
    reservationOrder += 1;
  };
  const semanticMembers = (id: string) => {
    if (!constraints || !hexPolygons) return [];
    const semantic = constraints.semantics.find((candidate) => candidate.sourceSemanticId === `narrative:${id}`);
    if (!semantic) return [];
    const members = [...new Set(semantic.tileIndices.flatMap((index) => index >= 0 && index < hexPolygons.length ? [hexPolygons[index]] : []))]
      .filter((polygon) => polygon >= 0 && polygon < centers.length && areas[polygon] > 0);
    if (members.length) result.semanticReservations += 1;
    return members;
  };
  for (const region of plan.regions) {
    const start = nearest(region.anchor);
    const desired = Math.max(1, Math.min(Math.ceil(centers.length * 0.22), Math.round(Math.PI * region.radius ** 2 * width * height / Math.max(1, width * height / centers.length))));
    const protectedMembers = semanticMembers(region.id);
    const members = protectedMembers.length ? protectedMembers : [start];
    if (!protectedMembers.length) {
      const seen = new Set(members);
      for (let cursor = 0; cursor < members.length && members.length < desired; cursor += 1) {
        const candidates = [...adjacency[members[cursor]]].filter((polygon) => !seen.has(polygon) && areas[polygon] > 0);
        candidates.sort((one, two) => pointDistanceSquared(centers[one], { x: region.anchor.x * width, y: region.anchor.y * height }, width, wraps) - pointDistanceSquared(centers[two], { x: region.anchor.x * width, y: region.anchor.y * height }, width, wraps) || hashNoise(one, cursor, seed) - hashNoise(two, cursor, seed));
        for (const polygon of candidates) { seen.add(polygon); members.push(polygon); if (members.length >= desired) break; }
      }
    }
    result.regionPolygons.set(region.id, members);
    for (const polygon of members) {
      // Every non-water regional role is geography that must exist on land.
      // Climate and lowland roles previously decorated whichever polygons the
      // generic land allocator happened to leave behind, so their graph cause
      // could disappear before climate was even compiled.
      reserve(polygon, region.effect === "WATER", region.priority + (protectedMembers.length ? 4 : 0)
        + (belongsToPrincipalBrokenChain(region.id) ? 24 : 0));
      if (region.effect === "RIDGE" || region.effect === "VOLCANIC") result.ridgePolygons.add(polygon);
    }
  }
  for (const path of plan.paths) {
    const protectedMembers = semanticMembers(path.id);
    const polygons: number[] = [...protectedMembers];
    if (!protectedMembers.length) {
      const samples = path.points.length ? path.points : [];
      for (let sample = 0; sample < samples.length; sample += 1) {
        const target = nearest(samples[sample]);
        if (!polygons.length) polygons.push(target);
        else if (polygons.at(-1) !== target) {
          const segment = graphPathBetween(adjacency, centers, polygons.at(-1)!, target, width, wraps, seed + sample * 97 + polygons.length * 17);
          polygons.push(...segment.slice(1));
        }
      }
      if (!polygons.length) {
        const from = result.regionPolygons.get(path.from)?.[0];
        const to = result.regionPolygons.get(path.to)?.[0];
        if (from !== undefined && to !== undefined) polygons.push(...graphPathBetween(adjacency, centers, from, to, width, wraps, seed + reservationOrder * 101));
      }
    }
    const unique = [...new Set(polygons)];
    result.pathPolygons.set(path.id, unique);
    for (const polygon of unique) {
      // An explicit graph edge must win a local conflict with the broader
      // regions it connects. This is what makes a one-polygon strait or canal
      // reservation survive rather than being averaged out by both shores.
      const strength = Math.max(2.5, path.strength * 3) + (protectedMembers.length ? 4 : 0)
        + (belongsToPrincipalBrokenChain(path.from) || belongsToPrincipalBrokenChain(path.to) ? 24 : 0);
      // Most TRANSITION edges describe a relationship without claiming
      // surface topology. The Ecological Transect is deliberately different:
      // its ordered climate sequence must cross one connected landscape, so
      // those authored graph edges reserve a modest land corridor before sea
      // level is reconciled. ISOLATED_FROM and other abstract transitions stay
      // topologically neutral.
      if (path.effect === "TRANSITION") {
        if (plan.grammarFamily === "GRAPH_ECOLOGICAL_TRANSECT") reserve(polygon, false, strength * 0.58);
      } else reserve(polygon, path.effect === "WATER_PATH", strength);
      if (path.effect === "RIDGE_PATH") result.ridgePolygons.add(polygon);
      if (path.effect === "RIVER_PATH") result.riverPolygons.add(polygon);
    }
  }
  if (plan.contract.topology.edgePolicy === "LAND" && hexPolygons) {
    const edgeTiles = new Set<number>();
    for (let x = 0; x < width; x += 1) { edgeTiles.add(x); edgeTiles.add((height - 1) * width + x); }
    for (let y = 0; y < height; y += 1) { edgeTiles.add(y * width); edgeTiles.add(y * width + width - 1); }
    for (const index of edgeTiles) {
      const polygon = hexPolygons[index];
      result.edgeLandPolygons.add(polygon);
      reserve(polygon, false, 12);
    }
  }
  for (let polygon = 0; polygon < centers.length; polygon += 1) {
    if (result.waterPriority[polygon] > result.landPriority[polygon] && result.waterPriority[polygon] > 0) result.forcedWater.add(polygon);
    else if (result.landPriority[polygon] > 0) result.forcedLand.add(polygon);
  }
  return result;
}

function fitGraphReservationsToBudget(reservations: EccentricNarrativeReservations, areas: number[], targetLand: number, targetWater: number, plan?: EccentricGraphPlan) {
  const plannedLand = reservations.forcedLand.size;
  const plannedWater = reservations.forcedWater.size;
  const fit = (members: Set<number>, budget: number, priorities: number[], order: number[]) => {
    const selected = [...members].sort((one, two) => priorities[two] - priorities[one] || order[one] - order[two] || one - two);
    members.clear();
    let area = 0;
    for (const polygon of selected) {
      if (areas[polygon] <= 0 || area + areas[polygon] > budget) continue;
      members.add(polygon);
      area += areas[polygon];
    }
    return area;
  };
  // Explicit sea level remains authoritative. Native reservations are relaxed
  // here, before topology allocation, rather than protected and then silently
  // left to make the requested tile budget impossible.
  const waterTiles = fit(reservations.forcedWater, Math.max(0, targetWater), reservations.waterPriority, reservations.waterOrder);
  let landTiles: number;
  if (plan?.reservationPolicy.connectivity === "PLAYER_REALMS") {
    const original = new Set(reservations.forcedLand);
    const realmRegions = plan.regions.filter((region) => region.effect !== "WATER" && region.role === "REALM");
    const selected = new Set<number>();
    let selectedArea = 0;
    const perRealmBudget = Math.floor(Math.max(0, targetLand) / Math.max(1, realmRegions.length));
    for (const realm of realmRegions) {
      let realmArea = 0;
      const candidates = (reservations.regionPolygons.get(realm.id) ?? [])
        .filter((polygon) => original.has(polygon))
        .sort((one, two) => reservations.landOrder[one] - reservations.landOrder[two] || one - two);
      for (const polygon of candidates) {
        if (selected.has(polygon) || selectedArea + areas[polygon] > targetLand || realmArea + areas[polygon] > perRealmBudget) continue;
        selected.add(polygon);
        selectedArea += areas[polygon];
        realmArea += areas[polygon];
      }
    }
    const remainder = [...original].filter((polygon) => !selected.has(polygon)).sort((one, two) => reservations.landPriority[two] - reservations.landPriority[one] || reservations.landOrder[one] - reservations.landOrder[two] || one - two);
    for (const polygon of remainder) {
      if (selectedArea + areas[polygon] > targetLand) continue;
      selected.add(polygon);
      selectedArea += areas[polygon];
    }
    reservations.forcedLand.clear();
    for (const polygon of selected) reservations.forcedLand.add(polygon);
    landTiles = selectedArea;
  } else {
    landTiles = fit(reservations.forcedLand, Math.max(0, targetLand), reservations.landPriority, reservations.landOrder);
  }
  return {
    plannedLand,
    plannedWater,
    landTiles,
    waterTiles,
    relaxedLand: plannedLand - reservations.forcedLand.size,
    relaxedWater: plannedWater - reservations.forcedWater.size,
  };
}

function buildAstronomyBarriers(profile: TopologyProfile, adjacency: Array<Set<number>>, centers: Point[], areas: number[], width: number, height: number, wraps: boolean, requestedBasins: number, targetWater: number, seed: number, excluded = new Set<number>()) {
  const barriers = new Set<number>();
  const empty = new Set(areas.flatMap((area, index) => area > 0 ? [] : [index]));
  const components = (blocked: ReadonlySet<number>) => graphComponents(adjacency, new Set([...blocked, ...empty]));
  if (targetWater <= 0 || requestedBasins <= 1) return { barriers, ...components(barriers) };
  const top = edgePolygons(centers, width, height, "TOP").filter((polygon) => areas[polygon] > 0 && !excluded.has(polygon));
  const bottom = edgePolygons(centers, width, height, "BOTTOM").filter((polygon) => areas[polygon] > 0 && !excluded.has(polygon));
  const left = edgePolygons(centers, width, height, "LEFT").filter((polygon) => areas[polygon] > 0 && !excluded.has(polygon));
  const right = edgePolygons(centers, width, height, "RIGHT").filter((polygon) => areas[polygon] > 0 && !excluded.has(polygon));
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
    const path = graphPathBetween(adjacency, centers, start, end, width, wraps, seed + pathNumber * 101, excluded);
    if (path.some((polygon) => excluded.has(polygon))) continue;
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
  // Randomized target lines occasionally keep finding a prior cut on small
  // polygon graphs, even though another basin is geometrically feasible. Fall
  // back to an exhaustive deterministic search for a disjoint edge-to-edge
  // separator. On the east-west cylinder each additional top-to-bottom cut
  // raises the actual open-water component count by one; on a non-wrapping
  // world either axis may provide the next lawful separator.
  for (let guard = 0; guard < requestedBasins * 2 && components(barriers).count < requestedBasins; guard += 1) {
    const currentCount = components(barriers).count;
    const blocked = new Set([...excluded, ...barriers, ...empty]);
    const orientations = wraps ? [[top, bottom] as const] : [[top, bottom] as const, [left, right] as const];
    const candidates = orientations.flatMap(([starts, ends]) => starts.filter((start) => !blocked.has(start)).flatMap((start) => ends
      .filter((end) => !blocked.has(end))
      .flatMap((end) => {
        const path = graphPathBetween(adjacency, centers, start, end, width, wraps, seed + 1301 + guard * 101 + start * 7 + end, blocked);
        if (!path.length || path.some((polygon) => blocked.has(polygon))) return [];
        const newArea = path.reduce((sum, polygon) => sum + areas[polygon], 0);
        const currentArea = [...barriers].reduce((sum, polygon) => sum + areas[polygon], 0);
        if (currentArea + newArea > waterAllowance) return [];
        const nextCount = components(new Set([...barriers, ...path])).count;
        return nextCount > currentCount && nextCount <= requestedBasins ? [{ path, newArea }] : [];
      })));
    candidates.sort((one, two) => one.newArea - two.newArea || one.path.length - two.path.length || one.path[0] - two.path[0]);
    const selected = candidates[0];
    if (!selected) break;
    for (const polygon of selected.path) barriers.add(polygon);
  }
  // Astronomy blobs thicken selected sections of an existing barrier without
  // creating unrequested extra navigation basins.
  for (let blob = 0; blob < profile.astronomyBlobs && barriers.size; blob += 1) {
    const edgeCandidates = [...barriers].flatMap((polygon) => [...adjacency[polygon]].filter((neighbor) => !barriers.has(neighbor) && !excluded.has(neighbor)));
    edgeCandidates.sort((one, two) => hashNoise(one, blob, seed + 701) - hashNoise(two, blob, seed + 701));
    for (const candidate of edgeCandidates) {
      const currentArea = [...barriers].reduce((sum, polygon) => sum + areas[polygon], 0);
      if (currentArea + areas[candidate] > waterAllowance) continue;
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
    return tiles.length
      && tiles.every((index) => mask[index])
      && tiles.every((index) => {
        const x = index % width; const y = Math.floor(index / width);
        return y > 0 && y < height - 1 && (wraps || x > 0 && x < width - 1);
      })
      && tiles.every((index) => hexNeighbors(index, width, height, wraps).every((neighbor) => mask[neighbor]));
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

function reconcileWaterMask(mask: boolean[], targetWater: number, subregions: Int32Array, subregionCount: number, width: number, height: number, wraps: boolean, seed: number, protectedWater: ReadonlySet<number>, protectedLand: ReadonlySet<number> = new Set()) {
  const groups = tilesByAssignment(subregions, subregionCount);
  let water = mask.reduce((count, land) => count + (land ? 0 : 1), 0);
  let pass = 0;
  while (water !== targetWater && pass < groups.length) {
    const addWater = water < targetWater;
    const remaining = Math.abs(targetWater - water);
    const candidates = groups.map((_tiles, region) => region).filter((region) => {
      const tiles = groups[region];
      if (!tiles.length || tiles.length > remaining || !tiles.every((index) => mask[index] === addWater)) return false;
      if (addWater && tiles.some((index) => protectedLand.has(index))) return false;
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
    const eligible = new Set(mask.flatMap((land, index) => land === addWater && (addWater ? !protectedLand.has(index) : !protectedWater.has(index)) ? [index] : []));
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

type NativeNarrowCrossings = {
  straitTiles: number[];
  canalTiles: number[];
  canalSupportTiles: number[];
  topologyAdjusted: boolean;
};

function tileComponentsExcluding(mask: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean, removed: ReadonlySet<number>) {
  const visited = new Uint8Array(mask.length);
  const members: number[][] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || removed.has(origin) || visited[origin]) continue;
    const component = [origin];
    visited[origin] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      for (const neighbor of hexNeighbors(component[cursor], width, height, wraps)) {
        if (!mask[neighbor] || removed.has(neighbor) || visited[neighbor]) continue;
        visited[neighbor] = 1;
        component.push(neighbor);
      }
    }
    members.push(component);
  }
  return members;
}

/**
 * Mirror Review's one- and two-tile narrow-cut detector. Native graph paths
 * are only marked as realized when the same deterministic audit can recognize
 * their final tile throat; a broad polygon corridor is not sufficient proof.
 */
function detectorNarrowAuditTiles(mask: ReadonlyArray<boolean>, opposite: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean) {
  const allNarrow = mask.flatMap((included, index) => {
    if (!included) return [];
    const adjacent = hexNeighbors(index, width, height, wraps);
    return adjacent.filter((next) => opposite[next]).length >= 2 && adjacent.filter((next) => mask[next]).length >= 2 ? [index] : [];
  });
  const inspectionBudget = mask.length <= 4_500 ? allNarrow.length : 144;
  return allNarrow.length <= inspectionBudget
    ? allNarrow
    : Array.from({ length: inspectionBudget }, (_value, sample) => allNarrow[Math.floor(sample * allNarrow.length / inspectionBudget)]);
}

function detectorNarrowCuts(mask: ReadonlyArray<boolean>, opposite: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean) {
  const minimumSide = Math.max(3, Math.floor(mask.length * 0.002));
  const narrow = detectorNarrowAuditTiles(mask, opposite, width, height, wraps);
  const narrowSet = new Set(narrow);
  const cuts: number[][] = [];
  const signatures = new Set<string>();
  const inspect = (throat: number[]) => {
    const removed = new Set(throat);
    const split = tileComponentsExcluding(mask, width, height, wraps, removed).filter((component) => component.length >= minimumSide);
    if (split.length < 2) return;
    const adjacentSides = split.filter((component) => component.some((index) => hexNeighbors(index, width, height, wraps).some((next) => removed.has(next))));
    if (adjacentSides.length < 2) return;
    const ordered = [...throat].sort((one, two) => one - two);
    const signature = ordered.join(",");
    if (signatures.has(signature)) return;
    signatures.add(signature);
    cuts.push(ordered);
  };
  for (const index of narrow) inspect([index]);
  for (const one of narrow) for (const two of hexNeighbors(one, width, height, wraps)) {
    if (two <= one || !narrowSet.has(two)) continue;
    inspect([one, two]);
  }
  return cuts.sort((one, two) => one[0] - two[0] || one.length - two.length);
}

function narrowCutAdjacentSides(mask: ReadonlyArray<boolean>, throat: ReadonlyArray<number>, width: number, height: number, wraps: boolean) {
  const removed = new Set(throat);
  const minimumSide = Math.max(3, Math.floor(mask.length * 0.002));
  return tileComponentsExcluding(mask, width, height, wraps, removed)
    .filter((component) => component.length >= minimumSide && component.some((index) => hexNeighbors(index, width, height, wraps).some((next) => removed.has(next))))
    .slice(0, 2);
}

function canalSupportForCut(mask: ReadonlyArray<boolean>, throat: ReadonlyArray<number>, width: number, height: number, wraps: boolean) {
  const support = new Set(throat);
  const minimumSupport = Math.max(8, Math.floor(mask.length * 0.004));
  for (const side of narrowCutAdjacentSides(mask, throat, width, height, wraps)) {
    const allowed = new Set(side);
    const queue = side.filter((index) => hexNeighbors(index, width, height, wraps).some((next) => throat.includes(next)));
    const visited = new Set(queue);
    for (let cursor = 0; cursor < queue.length && cursor < minimumSupport; cursor += 1) {
      support.add(queue[cursor]);
      for (const neighbor of hexNeighbors(queue[cursor], width, height, wraps)) {
        if (!allowed.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return [...support];
}

function detectorInspectsNarrowTile(mask: ReadonlyArray<boolean>, opposite: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean, tile: number) {
  if (!mask[tile]) return false;
  const neighbors = hexNeighbors(tile, width, height, wraps);
  if (neighbors.filter((next) => opposite[next]).length < 2 || neighbors.filter((next) => mask[next]).length < 2) return false;
  return detectorNarrowAuditTiles(mask, opposite, width, height, wraps).includes(tile);
}

function nearestCutToPath(cuts: ReadonlyArray<ReadonlyArray<number>>, points: ReadonlyArray<{ x: number; y: number }>, width: number, height: number, wraps: boolean) {
  if (!cuts.length) return undefined;
  const targets = points.length
    ? points.map((point) => ({ x: point.x * width, y: point.y * height }))
    : [{ x: width * 0.5, y: height * 0.5 }];
  return [...cuts].sort((one, two) => {
    const score = (cut: ReadonlyArray<number>) => Math.min(...cut.flatMap((index) => {
      const tile = { x: index % width + 0.5, y: Math.floor(index / width) + 0.5 };
      return targets.map((target) => pointDistanceSquared(tile, target, width, wraps));
    }));
    return score(one) - score(two) || one[0] - two[0] || one.length - two.length;
  })[0];
}

function replaceSetContents(target: Set<number>, source: ReadonlySet<number>) {
  target.clear();
  for (const value of source) target.add(value);
}

/**
 * Inland Sea Crossroads needs actual Bosporus-like navigation cuts, not merely
 * path metadata painted across a broad water polygon. When no retained water
 * articulation exists, compile a coast-to-coast marginal-land barrier through
 * the authored strait path and leave one navigable gap. The exact sea-level
 * reconciliation then grows or erodes only unlocked shore, preserving the
 * exterior land circuit and the graph throat.
 */
function realizeShatteredBasinCrossings(
  landMask: boolean[],
  targetWater: number,
  subregions: Int32Array,
  subregionCount: number,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  graphPlan: EccentricGraphPlan,
  reservations: EccentricNarrativeReservations,
  protectedWater: Set<number>,
  protectedLand: Set<number>,
  nativeEdgeLand: ReadonlySet<number>,
  constraints?: GenerationConstraintPayload,
): NativeNarrowCrossings {
  const straitPath = graphPlan.paths.find((path) => path.kind === "NARROW_STRAIT" && path.effect === "WATER_PATH");
  const canalPath = graphPlan.paths.find((path) => path.kind === "CANAL_ISTHMUS" && path.effect === "LAND_PATH");
  if (!straitPath || !canalPath || targetWater < 7 || wraps) return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };

  // Crossroads is authored as longitudinal enclosed seas separated by
  // transverse Bosporus cuts. Compile that topology directly at every viable
  // aspect ratio rather than hoping a generic polygon threshold happens to
  // leave the same strategic graph. This is essential on five-row String/Pin
  // worlds, and it also keeps ordinary maps from degenerating into unrelated
  // island fragments around a single accidental choke.
  if (Math.min(width, height) >= 5 && Math.max(width, height) >= 16) {
    const longitudinal = width >= height;
    const longSize = longitudinal ? width : height;
    const shortSize = longitudinal ? height : width;
    if (shortSize < 5 || longSize < 16) return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
    const at = (along: number, across: number) => longitudinal ? across * width + along : along * width + across;
    const longCoordinate = (path: EccentricGraphPlan["paths"][number]) => {
      const samples = path.points.length ? path.points : [{ x: 0.5, y: 0.5 }];
      return Math.round(samples.reduce((sum, point) => sum + (longitudinal ? point.x : point.y), 0) / samples.length * (longSize - 1));
    };
    const hardLand = new Set<number>();
    const hardWater = new Set<number>();
    if (constraints?.topology.length === landMask.length) for (let index = 0; index < landMask.length; index += 1) {
      if (constraints.topology[index] === 1) hardLand.add(index);
      else if (constraints.topology[index] === 0) hardWater.add(index);
    }
    const stripStraits = graphPlan.paths.filter((path) => path.kind === "NARROW_STRAIT" && path.effect === "WATER_PATH")
      .sort((one, two) => longCoordinate(one) - longCoordinate(two) || one.id.localeCompare(two.id));
    const gapAcross = Math.floor(shortSize / 2);
    const minimumSeparation = Math.max(4, Math.floor(longSize * 0.18));
    const usedLong: number[] = [];
    const straitGaps = new Map<string, number>();
    const essentialLand = new Set<number>([...nativeEdgeLand, ...hardLand]);
    const essentialWater = new Set<number>(hardWater);
    const coordinate = (index: number) => longitudinal
      ? { along: index % width, across: Math.floor(index / width) }
      : { along: Math.floor(index / width), across: index % width };
    const normalized = (along: number, across: number) => longitudinal
      ? { x: (along + 0.5) / width, y: (across + 0.5) / height }
      : { x: (across + 0.5) / width, y: (along + 0.5) / height };
    for (const [order, path] of stripStraits.entries()) {
      const preferred = Math.max(3, Math.min(longSize - 4, longCoordinate(path)));
      const candidates = Array.from({ length: longSize - 6 }, (_value, index) => index + 3)
        .filter((along) => usedLong.every((used) => Math.abs(along - used) >= minimumSeparation))
        .sort((one, two) => Math.abs(one - preferred) - Math.abs(two - preferred) || one - two);
      const along = candidates[0] ?? Math.round((order + 1) * (longSize - 1) / (stripStraits.length + 1));
      const lowerRim = [...nativeEdgeLand].filter((index) => coordinate(index).across < gapAcross)
        .sort((one, two) => Math.abs(coordinate(one).along - along) - Math.abs(coordinate(two).along - along) || coordinate(two).across - coordinate(one).across || one - two)[0];
      const upperRim = [...nativeEdgeLand].filter((index) => coordinate(index).across > gapAcross)
        .sort((one, two) => Math.abs(coordinate(one).along - along) - Math.abs(coordinate(two).along - along) || coordinate(one).across - coordinate(two).across || one - two)[0];
      if (lowerRim === undefined || upperRim === undefined) continue;
      const lower = coordinate(lowerRim);
      const upper = coordinate(upperRim);
      const bend = (hashNoise(along, order, seed + 1591) > 0.5 ? 1 : -1) * Math.max(1, Math.round(longSize * 0.025));
      const wall = tilePathThroughPoints([
        normalized(lower.along, lower.across),
        normalized(Math.max(1, Math.min(longSize - 2, along + bend)), Math.round(shortSize * 0.36)),
        normalized(Math.max(1, Math.min(longSize - 2, along - bend)), Math.round(shortSize * 0.64)),
        normalized(upper.along, upper.across),
      ], width, height, wraps, hardWater);
      if (wall.length < 3) continue;
      const gap = wall[Math.floor(wall.length / 2)];
      usedLong.push(coordinate(gap).along);
      straitGaps.set(path.id, gap);
      for (const index of wall) if (index === gap) essentialWater.add(index); else essentialLand.add(index);
      for (const neighbor of hexNeighbors(gap, width, height, wraps)) if (!essentialLand.has(neighbor)) essentialWater.add(neighbor);
    }
    let canalAlong = Math.max(4, Math.min(longSize - 5, longCoordinate(canalPath)));
    for (let offset = 0; usedLong.some((used) => Math.abs(canalAlong - used) < 4) && offset < longSize; offset += 1) {
      const candidate = canalAlong + (offset % 2 ? -Math.ceil(offset / 2) : Math.ceil(offset / 2));
      if (candidate >= 4 && candidate <= longSize - 5 && usedLong.every((used) => Math.abs(candidate - used) >= 4)) canalAlong = candidate;
    }
    const canalRim = [...nativeEdgeLand].filter((index) => coordinate(index).across < gapAcross)
      .sort((one, two) => Math.abs(coordinate(one).along - canalAlong) - Math.abs(coordinate(two).along - canalAlong)
        || coordinate(two).across - coordinate(one).across || one - two)[0];
    if (canalRim === undefined) return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
    canalAlong = coordinate(canalRim).along;
    const canalAcross = coordinate(canalRim).across;
    const canalTipAcross = Math.min(shortSize - 2, canalAcross + 1);
    const canalStem = new Set<number>();
    for (let across = canalAcross; across <= canalTipAcross; across += 1) { const index = at(canalAlong, across); essentialLand.add(index); canalStem.add(index); }
    // Review's cut detector scales its viable-side floor with map area. A
    // fixed three-hex peninsula head works on String, but is deliberately
    // rejected on Standard and larger maps. Grow one compact, scale-aware
    // interior head behind the single neck so the authored Panama crossing is
    // a real strategic articulation at every supported resolution.
    const minimumCanalHead = Math.max(3, Math.floor(landMask.length * 0.002));
    const canalHead = [at(canalAlong, canalTipAcross)];
    const queuedCanalHead = new Set(canalHead);
    for (let cursor = 0; cursor < canalHead.length && canalHead.length < minimumCanalHead; cursor += 1) {
      const candidates = hexNeighbors(canalHead[cursor], width, height, wraps).filter((index) => {
        if (queuedCanalHead.has(index) || hardWater.has(index)) return false;
        const point = coordinate(index);
        return point.across >= canalTipAcross && point.across < shortSize - 1
          && Math.abs(point.along - canalAlong) <= Math.max(3, Math.ceil(Math.sqrt(minimumCanalHead)));
      }).sort((one, two) => {
        const onePoint = coordinate(one);
        const twoPoint = coordinate(two);
        return Math.abs(onePoint.across - canalTipAcross) - Math.abs(twoPoint.across - canalTipAcross)
          || Math.abs(onePoint.along - canalAlong) - Math.abs(twoPoint.along - canalAlong)
          || one - two;
      });
      for (const index of candidates) {
        queuedCanalHead.add(index);
        canalHead.push(index);
        if (canalHead.length >= minimumCanalHead) break;
      }
    }
    if (canalHead.length < minimumCanalHead) return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
    for (const index of canalHead) { essentialLand.add(index); canalStem.add(index); }
    const canalAnchor = at(canalAlong, canalAcross);
    for (const index of canalStem) for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      if (!canalStem.has(neighbor) && !essentialLand.has(neighbor)) essentialWater.add(neighbor);
    }
    for (const gap of straitGaps.values()) for (const neighbor of hexNeighbors(gap, width, height, wraps)) {
      if (!essentialLand.has(neighbor)) essentialWater.add(neighbor);
    }
    // The principal seas are longitudinal, not noise-selected puddles. Two
    // continuous interior lanes guarantee that each transverse throat has a
    // substantial navigable basin on both shores even on a five-row String.
    // Exact-budget reconciliation remains free to add the remaining water in
    // the third interior lane.
    for (const across of [1, gapAcross]) for (let along = 1; along < longSize - 1; along += 1) {
      const index = at(along, across);
      if (!essentialLand.has(index)) essentialWater.add(index);
    }
    // Exact-budget growth otherwise fills arbitrary tiles between the two
    // longitudinal lanes, and an authored sea can retain one shore seed on
    // each lane without any water route between them. Give every interval in
    // the crossing chain one protected transverse basin spine. Removing a
    // strait still separates its neighboring countries, while each country
    // remains internally connected from its Bosporus shore to its canal shore.
    const separators = [...new Set([...usedLong, canalAlong])].sort((one, two) => one - two);
    const sectorBounds = [1, ...separators, longSize - 2];
    for (let sector = 0; sector < sectorBounds.length - 1; sector += 1) {
      const low = sectorBounds[sector] + 1;
      const high = sectorBounds[sector + 1] - 1;
      if (low > high) continue;
      const centre = Math.round((low + high) / 2);
      const columns = Array.from({ length: high - low + 1 }, (_value, offset) => centre + (offset === 0 ? 0 : Math.ceil(offset / 2) * (offset % 2 ? -1 : 1)))
        .filter((along) => along >= low && along <= high);
      const column = columns.find((along) => Array.from({ length: gapAcross }, (_value, across) => at(along, across + 1))
        .every((index) => !essentialLand.has(index) && !hardLand.has(index)));
      if (column === undefined) continue;
      for (let across = 1; across <= gapAcross; across += 1) essentialWater.add(at(column, across));
    }
    if ([...essentialLand].some((index) => essentialWater.has(index))
      || essentialLand.size > landMask.length - targetWater || essentialWater.size > targetWater) {
      return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
    }
    // Begin from the authored enclosed-water substrate. Reconciliation grows
    // the remaining land outward from the connected rim/walls, so all
    // marginal land stays accessible and no detached threshold-noise islands
    // survive into the native output.
    const candidate = new Array<boolean>(landMask.length).fill(false);
    const candidateLand = new Set(essentialLand);
    const candidateWater = new Set(essentialWater);
    for (const index of candidateWater) candidate[index] = false;
    for (const index of candidateLand) candidate[index] = true;
    reconcileWaterMask(candidate, targetWater, subregions, subregionCount, width, height, wraps, seed + 1601, candidateWater, candidateLand);
    const waterCuts = detectorNarrowCuts(candidate.map((land) => !land), candidate, width, height, wraps).filter((cut) => cut.length <= 2);
    const realizedStraits = new Map<string, number[]>();
    for (const path of stripStraits) {
      const gap = straitGaps.get(path.id);
      const cut = gap === undefined ? undefined : waterCuts.find((candidateCut) => candidateCut.includes(gap));
      if (cut) realizedStraits.set(path.id, [...cut]);
    }
    const canalCuts = detectorNarrowCuts(candidate, candidate.map((land) => !land), width, height, wraps).filter((cut) => cut.length <= 2);
    const realizedCanal = canalCuts.find((cut) => cut.includes(canalAnchor));
    const exact = candidate.filter((land) => !land).length === targetWater;
    const rim = [...nativeEdgeLand].every((index) => candidate[index]);
    const singleCrossingForm = graphPlan.appliedRelaxations.some((step) => step.id === "relax-strait-isthmus");
    const completeCrossings = singleCrossingForm
      ? realizedStraits.size + Number(Boolean(realizedCanal)) >= 1
      : realizedStraits.size === stripStraits.length && Boolean(realizedCanal);
    if (!exact || !rim || !completeCrossings) {
      return { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
    }
    for (let index = 0; index < candidate.length; index += 1) landMask[index] = candidate[index];
    replaceSetContents(protectedLand, candidateLand);
    replaceSetContents(protectedWater, candidateWater);
    for (const [id, cut] of realizedStraits) reservations.realizedPathTiles.set(id, cut);
    if (realizedCanal) reservations.realizedPathTiles.set(canalPath.id, [...realizedCanal]);
    const firstStrait = realizedStraits.get(straitPath.id) ?? [...realizedStraits.values()][0] ?? [];
    return {
      straitTiles: [...firstStrait],
      canalTiles: realizedCanal ? [...realizedCanal] : [],
      canalSupportTiles: realizedCanal ? canalSupportForCut(landMask, realizedCanal, width, height, wraps) : [],
      topologyAdjusted: true,
    };
  }

  const waterMask = () => landMask.map((land) => !land);
  const eligibleCanalCuts = (candidateLand: ReadonlyArray<boolean>) => detectorNarrowCuts(candidateLand, candidateLand.map((land) => !land), width, height, wraps)
    .filter((cut) => cut.every((index) => constraints?.elevation[index] !== 2));
  let straitTiles = nearestCutToPath(detectorNarrowCuts(waterMask(), landMask, width, height, wraps), straitPath.points, width, height, wraps);
  let canalTiles = nearestCutToPath(eligibleCanalCuts(landMask), canalPath.points, width, height, wraps);
  let topologyAdjusted = false;

  if (!straitTiles) {
    const target = straitPath.points[0] ?? { x: 0.34, y: 0.5 };
    const targetPoint = { x: target.x * width, y: target.y * height };
    const auditedAnchor = detectorNarrowAuditTiles(waterMask(), landMask, width, height, wraps)
      .filter((index) => index % width >= 3 && index % width <= width - 4 && Math.floor(index / width) >= 3 && Math.floor(index / width) <= height - 4)
      .sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, targetPoint, width, wraps) - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, targetPoint, width, wraps) || one - two)[0];
    const targetX = auditedAnchor === undefined ? Math.max(3, Math.min(width - 4, Math.round(target.x * (width - 1)))) : auditedAnchor % width;
    const targetY = auditedAnchor === undefined ? Math.max(3, Math.min(height - 4, Math.round(target.y * (height - 1)))) : Math.floor(auditedAnchor / width);
    const xOffsets = Array.from({ length: width - 6 }, (_value, index) => index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1));
    const provisional = [...landMask];
    const provisionalGap = targetY * width + targetX;
    for (let y = 0; y < height; y += 1) provisional[y * width + targetX] = y === targetY ? false : true;
    for (const index of [provisionalGap - 3, provisionalGap - 2, provisionalGap - 1, provisionalGap + 1, provisionalGap + 2, provisionalGap + 3]) provisional[index] = false;
    const sampledColumnOffsets = detectorNarrowAuditTiles(provisional.map((land) => !land), provisional, width, height, wraps)
      .filter((index) => index % width === targetX && Math.floor(index / width) >= 3 && Math.floor(index / width) <= height - 4)
      .map((index) => Math.floor(index / width) - targetY)
      .sort((one, two) => Math.abs(one) - Math.abs(two) || one - two);
    const exhaustiveYOffsets = Array.from({ length: height - 6 }, (_value, index) => index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1));
    const yOffsets = [...new Set([...sampledColumnOffsets, ...exhaustiveYOffsets])];
    const directLand = new Set<number>();
    const directWater = new Set<number>();
    if (constraints?.topology.length === landMask.length) for (let index = 0; index < landMask.length; index += 1) {
      if (constraints.topology[index] === 1) directLand.add(index);
      else if (constraints.topology[index] === 0) directWater.add(index);
    }
    const originalLand = [...landMask];
    const originalProtectedWater = new Set(protectedWater);
    const originalProtectedLand = new Set(protectedLand);
    const priorCanal = canalTiles;

    candidateLoop: for (const xOffset of xOffsets) {
      const column = targetX + xOffset;
      if (column < 3 || column > width - 4) continue;
      for (const yOffset of yOffsets) {
        const gapY = targetY + yOffset;
        if (gapY < 3 || gapY > height - 4) continue;
        const gap = gapY * width + column;
        const wall = Array.from({ length: height }, (_value, y) => y * width + column).filter((index) => index !== gap);
        const waterSeeds = [gap, gap - 1, gap - 2, gap - 3, gap + 1, gap + 2, gap + 3];
        if (wall.some((index) => directWater.has(index)) || waterSeeds.some((index) => directLand.has(index))) continue;

        const candidate = [...originalLand];
        const candidateProtectedWater = new Set(originalProtectedWater);
        const candidateProtectedLand = new Set(originalProtectedLand);
        const essentialLand = new Set<number>([...nativeEdgeLand, ...directLand, ...wall]);
        const essentialWater = new Set<number>([...directWater, ...waterSeeds]);
        if (priorCanal) {
          for (const index of priorCanal) essentialLand.add(index);
          for (const index of priorCanal) for (const neighbor of hexNeighbors(index, width, height, wraps)) if (!originalLand[neighbor]) essentialWater.add(neighbor);
        }
        for (const index of wall) {
          candidate[index] = true;
          candidateProtectedWater.delete(index);
          candidateProtectedLand.add(index);
        }
        for (const index of waterSeeds) {
          candidate[index] = false;
          candidateProtectedLand.delete(index);
          candidateProtectedWater.add(index);
        }
        const provisionalWater = candidate.map((land) => !land);
        if (!detectorInspectsNarrowTile(provisionalWater, candidate, width, height, wraps, gap)) continue;
        for (const index of essentialLand) { candidate[index] = true; candidateProtectedWater.delete(index); candidateProtectedLand.add(index); }
        for (const index of essentialWater) { candidate[index] = false; candidateProtectedLand.delete(index); candidateProtectedWater.add(index); }

        if (candidateProtectedLand.size > landMask.length - targetWater) {
          const removable = [...candidateProtectedLand].filter((index) => !essentialLand.has(index))
            .sort((one, two) => hashNoise(one, 31, seed + column * 17 + gapY) - hashNoise(two, 31, seed + column * 17 + gapY) || one - two);
          for (const index of removable) {
            if (candidateProtectedLand.size <= landMask.length - targetWater) break;
            candidateProtectedLand.delete(index);
          }
        }
        if (candidateProtectedWater.size > targetWater) {
          const removable = [...candidateProtectedWater].filter((index) => !essentialWater.has(index))
            .sort((one, two) => hashNoise(one, 47, seed + column * 19 + gapY) - hashNoise(two, 47, seed + column * 19 + gapY) || one - two);
          for (const index of removable) {
            if (candidateProtectedWater.size <= targetWater) break;
            candidateProtectedWater.delete(index);
          }
        }
        if (candidateProtectedLand.size > landMask.length - targetWater || candidateProtectedWater.size > targetWater) continue;
        for (const index of candidateProtectedWater) candidate[index] = false;
        for (const index of candidateProtectedLand) if (!candidateProtectedWater.has(index)) candidate[index] = true;
        reconcileWaterMask(candidate, targetWater, subregions, subregionCount, width, height, wraps, seed + 1709 + column * 37 + gapY, candidateProtectedWater, candidateProtectedLand);
        if (candidate.filter((land) => !land).length !== targetWater) continue;
        if ([...nativeEdgeLand].some((index) => !candidate[index])) continue;
        if (connectedComponents(candidate, width, height, wraps).count !== 1) continue;
        const candidateWater = candidate.map((land) => !land);
        if (!detectorInspectsNarrowTile(candidateWater, candidate, width, height, wraps, gap)) continue;
        const candidateStrait = detectorNarrowCuts(candidateWater, candidate, width, height, wraps).find((cut) => cut.includes(gap));
        if (!candidateStrait) continue;
        const candidateCanal = nearestCutToPath(eligibleCanalCuts(candidate), canalPath.points, width, height, wraps);
        if (!candidateCanal) continue;

        for (let index = 0; index < candidate.length; index += 1) landMask[index] = candidate[index];
        replaceSetContents(protectedWater, candidateProtectedWater);
        replaceSetContents(protectedLand, candidateProtectedLand);
        straitTiles = candidateStrait;
        canalTiles = candidateCanal;
        topologyAdjusted = true;
        break candidateLoop;
      }
    }
  }

  if (straitTiles) {
    reservations.realizedPathTiles.set(straitPath.id, [...straitTiles]);
    for (const index of straitTiles) { protectedLand.delete(index); protectedWater.add(index); }
    // Bind the crossing's declared great seas to the actual water countries on
    // either side of its throat. Leaving the original polygon samples in place
    // made a detector-recognized strait spatially unrelated to the two native
    // sea causes it claimed to join.
    const throat = new Set(straitTiles);
    const splitWater = landMask.flatMap((land, index) => !land && !throat.has(index) ? [index] : []);
    const sides = connectedTileSubsets(splitWater, width, height, wraps)
      .filter((component) => component.some((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => throat.has(neighbor))))
      .sort((one, two) => two.length - one.length || one[0] - two[0]);
    if (sides.length >= 2) {
      reservations.realizedRegionTiles.set(straitPath.from, sides[0]);
      reservations.realizedRegionTiles.set(straitPath.to, sides[1]);
    }
  }
  const authoredStraits = graphPlan.paths.filter((path) => path.kind === "NARROW_STRAIT" && path.effect === "WATER_PATH");
  const minimumStraitSide = Math.max(3, Math.floor(targetWater * 0.04));
  const majorStrait = (cut: readonly number[], mask = landMask) => narrowCutAdjacentSides(mask.map((land) => !land), cut, width, height, wraps)
    .filter((side) => side.length >= minimumStraitSide).length >= 2;
  const claimedStraits: number[][] = straitTiles && majorStrait(straitTiles) ? [[...straitTiles]] : [];
  const claimedStraitIds = new Set<string>(claimedStraits.length ? [straitPath.id] : []);
  const separatedFromClaimed = (cut: readonly number[]) => claimedStraits.every((claimed) => {
    const cutAxis = cut.reduce((sum, index) => sum + (width >= height ? index % width : Math.floor(index / width)), 0) / Math.max(1, cut.length);
    const claimedAxis = claimed.reduce((sum, index) => sum + (width >= height ? index % width : Math.floor(index / width)), 0) / Math.max(1, claimed.length);
    // Several detector samples along one Bosporus wall are one physical
    // crossing, not several authored straits. A second crossing must occupy a
    // distinct transverse cut of the world so that it creates another actual
    // pair of principal shores.
    return Math.abs(cutAxis - claimedAxis) >= Math.max(3, Math.floor((width >= height ? width : height) * 0.12));
  });
  for (const authored of authoredStraits.filter((path) => !claimedStraitIds.has(path.id))) {
    const existing = nearestCutToPath(
      detectorNarrowCuts(landMask.map((land) => !land), landMask, width, height, wraps)
        .filter((cut) => separatedFromClaimed(cut) && majorStrait(cut)),
      authored.points,
      width,
      height,
      wraps,
    );
    if (existing) {
      claimedStraits.push([...existing]);
      claimedStraitIds.add(authored.id);
      reservations.realizedPathTiles.set(authored.id, [...existing]);
      for (const index of existing) { protectedLand.delete(index); protectedWater.add(index); }
      continue;
    }
    const target = authored.points[0] ?? { x: 0.66, y: 0.5 };
    const targetX = Math.max(3, Math.min(width - 4, Math.round(target.x * (width - 1))));
    const targetY = Math.max(3, Math.min(height - 4, Math.round(target.y * (height - 1))));
    const xOffsets = Array.from({ length: width - 6 }, (_value, index) => index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1));
    const yOffsets = Array.from({ length: height - 6 }, (_value, index) => index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1));
    let realized: number[] | undefined;
    candidateLoop: for (const dx of xOffsets) for (const dy of yOffsets) {
      const column = targetX + dx;
      const gapY = targetY + dy;
      if (column < 3 || column > width - 4 || gapY < 3 || gapY > height - 4) continue;
      const gap = gapY * width + column;
      const wall = Array.from({ length: height }, (_value, y) => y * width + column).filter((index) => index !== gap);
      const waterSeeds = [gap, gap - 1, gap + 1];
      // The later strait is part of the same native sea grammar, so it may
      // lawfully cut through a broad plan-time sea reservation and rebind that
      // sea to its resulting shore. Only explicit user topology is immutable.
      if (wall.some((index) => constraints?.topology[index] === 0)
        || waterSeeds.some((index) => constraints?.topology[index] === 1)) continue;
      const candidate = [...landMask];
      const candidateLand = new Set(protectedLand);
      const candidateWater = new Set(protectedWater);
      for (const index of wall) { candidate[index] = true; candidateWater.delete(index); candidateLand.add(index); }
      for (const index of waterSeeds) { candidate[index] = false; candidateLand.delete(index); candidateWater.add(index); }
      const essentialLand = new Set<number>([...nativeEdgeLand, ...wall, ...(canalTiles ?? [])]);
      const essentialWater = new Set<number>([...claimedStraits.flat(), ...waterSeeds]);
      // Preserve the two actual water shores that make the already-selected
      // Panama-like land cut canal-capable. Protecting only the canal land
      // tile allowed exact-budget reconciliation to fill one shore while a
      // later Bosporus wall was installed, silently destroying the canal and
      // causing the second strait candidate to roll back.
      for (const canal of canalTiles ?? []) for (const neighbor of hexNeighbors(canal, width, height, wraps)) {
        if (!landMask[neighbor]) essentialWater.add(neighbor);
      }
      if (constraints?.topology.length === candidate.length) for (let index = 0; index < candidate.length; index += 1) {
        if (constraints.topology[index] === 1) essentialLand.add(index);
        else if (constraints.topology[index] === 0) essentialWater.add(index);
      }
      if (candidateLand.size > candidate.length - targetWater) {
        const removable = [...candidateLand].filter((index) => !essentialLand.has(index))
          .sort((one, two) => hashNoise(one, column, seed + gapY) - hashNoise(two, column, seed + gapY) || one - two);
        for (const index of removable) {
          if (candidateLand.size <= candidate.length - targetWater) break;
          candidateLand.delete(index);
        }
      }
      if (candidateWater.size > targetWater) {
        const removable = [...candidateWater].filter((index) => !essentialWater.has(index))
          .sort((one, two) => hashNoise(one, gapY, seed + column) - hashNoise(two, gapY, seed + column) || one - two);
        for (const index of removable) {
          if (candidateWater.size <= targetWater) break;
          candidateWater.delete(index);
        }
      }
      if (candidateLand.size > candidate.length - targetWater || candidateWater.size > targetWater) continue;
      for (const index of candidateWater) candidate[index] = false;
      for (const index of candidateLand) if (!candidateWater.has(index)) candidate[index] = true;
      reconcileWaterMask(candidate, targetWater, subregions, subregionCount, width, height, wraps, seed + 2039 + column * 31 + gapY, candidateWater, candidateLand);
      if (candidate.filter((land) => !land).length !== targetWater) continue;
      const candidateLandComponents = connectedComponents(candidate, width, height, wraps);
      const circuitAnchor = [...nativeEdgeLand][0] ?? wall[0];
      const circuitComponent = candidateLandComponents.ids[circuitAnchor];
      if (circuitComponent < 0 || [...wall, ...(canalTiles ?? [])].some((index) => candidateLandComponents.ids[index] !== circuitComponent)) continue;
      if ([...nativeEdgeLand].some((index) => !candidate[index])) continue;
      const cuts = detectorNarrowCuts(candidate.map((land) => !land), candidate, width, height, wraps);
      const nextCut = cuts.find((cut) => cut.includes(gap));
      if (!nextCut || !separatedFromClaimed(nextCut) || !majorStrait(nextCut, candidate)) continue;
      const independentCuts = cuts.filter((cut) => cut !== nextCut && cut.every((one) => nextCut.every((two) => {
        const cutDx = Math.abs(one % width - two % width);
        const cutDy = Math.abs(Math.floor(one / width) - Math.floor(two / width));
        return Math.max(cutDx, cutDy) >= 3;
      })));
      if (claimedStraits.length && !independentCuts.length) continue;
      const candidateCanal = canalTiles && nearestCutToPath(eligibleCanalCuts(candidate), canalPath.points, width, height, wraps);
      if (canalTiles && !candidateCanal) continue;
      for (let index = 0; index < candidate.length; index += 1) landMask[index] = candidate[index];
      replaceSetContents(protectedLand, candidateLand);
      replaceSetContents(protectedWater, candidateWater);
      if (candidateCanal) canalTiles = candidateCanal;
      realized = [...nextCut];
      break candidateLoop;
    }
    if (!realized) continue;
    claimedStraits.push(realized);
    claimedStraitIds.add(authored.id);
    reservations.realizedPathTiles.set(authored.id, realized);
    for (const index of realized) { protectedLand.delete(index); protectedWater.add(index); }
    topologyAdjusted = true;
  }
  if (canalTiles) {
    reservations.realizedPathTiles.set(canalPath.id, [...canalTiles]);
    for (const index of canalTiles) { protectedWater.delete(index); protectedLand.add(index); }
  }
  return {
    straitTiles: straitTiles ? [...straitTiles] : [],
    canalTiles: canalTiles ? [...canalTiles] : [],
    canalSupportTiles: canalTiles ? canalSupportForCut(landMask, canalTiles, width, height, wraps) : [],
    topologyAdjusted,
  };
}

type NativePeninsulaAttachments = {
  headTiles: number[];
  neckTiles: number[];
  supportTiles: number[];
  realizedHeads: number;
  realizedNecks: number;
  topologyAdjusted: boolean;
};

function nearestAvailableTile(
  point: { x: number; y: number },
  width: number,
  height: number,
  wraps: boolean,
  blocked: ReadonlySet<number>,
) {
  const target = { x: point.x * width, y: point.y * height };
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < width * height; index += 1) {
    if (blocked.has(index)) continue;
    const distance = pointDistanceSquared({ x: index % width + 0.5, y: Math.floor(index / width) + 0.5 }, target, width, wraps);
    if (distance < bestDistance || distance === bestDistance && index < best) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function shortestTilePath(
  start: number,
  end: number,
  width: number,
  height: number,
  wraps: boolean,
  blocked: ReadonlySet<number>,
) {
  if (start < 0 || end < 0 || blocked.has(start) || blocked.has(end)) return [];
  const previous = new Int32Array(width * height);
  previous.fill(-2);
  previous[start] = -1;
  const queue = [start];
  const target = { x: end % width + 0.5, y: Math.floor(end / width) + 0.5 };
  for (let cursor = 0; cursor < queue.length && previous[end] === -2; cursor += 1) {
    const next = hexNeighbors(queue[cursor], width, height, wraps)
      .filter((index) => previous[index] === -2 && !blocked.has(index))
      .sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, target, width, wraps)
        - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, target, width, wraps) || one - two);
    for (const index of next) {
      previous[index] = queue[cursor];
      queue.push(index);
    }
  }
  if (previous[end] === -2) return [];
  const path: number[] = [];
  for (let index = end; index >= 0; index = previous[index]) path.push(index);
  return path.reverse();
}

/**
 * Resolve an authored isolation relationship onto the final ocean itself.
 * The two-state search cannot claim a coastal shortcut: the returned simple
 * route must touch both real shores and must actually traverse deep water.
 */
function shortestDeepWaterRoute(
  fromTiles: ReadonlyArray<number>,
  toTiles: ReadonlyArray<number>,
  landMask: ReadonlyArray<boolean>,
  deepWaterMask: ReadonlyArray<boolean>,
  width: number,
  height: number,
  wraps: boolean,
  blocked: ReadonlySet<number> = new Set<number>(),
) {
  const waterNeighbors = (members: ReadonlyArray<number>) => [...new Set(members.flatMap((index) => hexNeighbors(index, width, height, wraps)))]
    .filter((index) => !landMask[index] && !blocked.has(index))
    .sort((one, two) => one - two);
  const starts = waterNeighbors(fromTiles);
  const targets = new Set(waterNeighbors(toTiles));
  if (!starts.length || !targets.size) return [];
  const encode = (index: number, crossedDeep: boolean) => index * 2 + Number(crossedDeep);
  const previous = new Int32Array(width * height * 2);
  previous.fill(-2);
  const queue: number[] = [];
  for (const index of starts) {
    const state = encode(index, Boolean(deepWaterMask[index]));
    if (previous[state] !== -2) continue;
    previous[state] = -1;
    queue.push(state);
  }
  let terminal = queue.find((state) => state % 2 === 1 && targets.has(Math.floor(state / 2)));
  for (let cursor = 0; cursor < queue.length && terminal === undefined; cursor += 1) {
    const state = queue[cursor];
    const index = Math.floor(state / 2);
    const crossedDeep = state % 2 === 1;
    const adjacent = hexNeighbors(index, width, height, wraps).filter((neighbor) => !landMask[neighbor] && !blocked.has(neighbor)).sort((one, two) => one - two);
    for (const neighbor of adjacent) {
      const next = encode(neighbor, crossedDeep || Boolean(deepWaterMask[neighbor]));
      if (previous[next] !== -2) continue;
      previous[next] = state;
      queue.push(next);
      if (next % 2 === 1 && targets.has(neighbor)) { terminal = next; break; }
    }
  }
  if (terminal === undefined) return [];
  const route: number[] = [];
  for (let state = terminal; state >= 0; state = previous[state]) route.push(Math.floor(state / 2));
  route.reverse();
  // A repeated tile would mean the only deep-water visit was a detour from a
  // coastal route, not a truthful separating ocean transect.
  return new Set(route).size === route.length ? route : [];
}

function tilePathThroughPoints(
  points: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number,
  wraps: boolean,
  blocked: ReadonlySet<number>,
) {
  const waypoints = points.map((point) => nearestAvailableTile(point, width, height, wraps, blocked)).filter((index) => index >= 0);
  if (!waypoints.length) return [];
  const path = [waypoints[0]];
  for (let index = 1; index < waypoints.length; index += 1) {
    if (waypoints[index] === path.at(-1)) continue;
    const segment = shortestTilePath(path.at(-1)!, waypoints[index], width, height, wraps, blocked);
    if (!segment.length) return [];
    path.push(...segment.slice(1));
  }
  return path;
}

function eraseTilePathLoops(route: readonly number[]) {
  const path: number[] = [];
  const position = new Map<number, number>();
  for (const tile of route) {
    const prior = position.get(tile);
    if (prior !== undefined) {
      for (const removed of path.splice(prior + 1)) position.delete(removed);
      continue;
    }
    position.set(tile, path.length);
    path.push(tile);
  }
  return path;
}

type NativeEcologicalTransect = {
  ribbonTiles: number[];
  realizedStages: number;
  realizedTransitions: number;
  topologyAdjusted: boolean;
};

/**
 * Compile Living World's ordered ecology into a real, river-capable landform.
 *
 * Polygon reservations are deliberately coarse. At very high sea levels they
 * can consume the complete land budget while leaving consecutive ecological
 * regions joined by a one-plot thread. That is tile-connected, but it cannot
 * carry a Civ V edge river because the river has no second bank. Replace only
 * that superseded coarse protection with compact stage nuclei and a continuous
 * multi-hex ribbon following the authored transition points. Reconciliation
 * exchanges unprotected coarse land for the ribbon, so explicit sea level
 * remains exact rather than being silently raised for the narrative.
 */
function realizeEcologicalTransect(
  landMask: boolean[],
  targetWater: number,
  subregions: Int32Array,
  subregionCount: number,
  hexPolygons: Int32Array,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  graphPlan: EccentricGraphPlan,
  reservations: EccentricNarrativeReservations,
  protectedWater: Set<number>,
  protectedLand: Set<number>,
  nativeEdgeLand: ReadonlySet<number>,
  constraints?: GenerationConstraintPayload,
): NativeEcologicalTransect {
  const empty = (): NativeEcologicalTransect => ({ ribbonTiles: [], realizedStages: 0, realizedTransitions: 0, topologyAdjusted: false });
  if (graphPlan.grammarFamily !== "GRAPH_ECOLOGICAL_TRANSECT") return empty();
  const roleOrder = ["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW"] as const;
  const stages = roleOrder.map((role) => graphPlan.regions.find((region) => region.role === role));
  if (stages.some((region) => !region)) return empty();

  const targetLand = landMask.length - targetWater;
  const hardWater = new Set<number>();
  const hardLand = new Set<number>();
  if (constraints?.topology.length === landMask.length) for (let index = 0; index < landMask.length; index += 1) {
    if (constraints.topology[index] === 0) hardWater.add(index);
    else if (constraints.topology[index] === 1) hardLand.add(index);
  }
  const semanticLand = new Set<number>();
  for (const semantic of constraints?.semantics ?? []) for (const index of semantic.tileIndices) {
    if (index >= 0 && index < landMask.length && !hardWater.has(index) && landMask[index]) semanticLand.add(index);
  }
  const blocked = hardWater;
  const claimedStage = new Set<number>();
  const stageTiles = new Map<string, number[]>();
  const stageNuclei: number[] = [];
  const desiredStageSize = Math.max(3, Math.min(7, Math.floor(targetLand / (roleOrder.length * 3))));
  const tilePoint = (index: number) => ({ x: index % width + 0.5, y: Math.floor(index / width) + 0.5 });
  const normalizedTilePoint = (index: number) => ({ x: (index % width + 0.5) / width, y: (Math.floor(index / width) + 0.5) / height });

  for (const region of stages as Array<NonNullable<(typeof stages)[number]>>) {
    const polygons = new Set(reservations.regionPolygons.get(region.id) ?? []);
    const candidates = landMask.flatMap((_land, index) => !blocked.has(index) && !claimedStage.has(index) && polygons.has(hexPolygons[index]) ? [index] : []);
    const anchor = { x: region.anchor.x * width, y: region.anchor.y * height };
    candidates.sort((one, two) => {
      const coastalPenalty = region.role === "COAST"
        ? Number(!hexNeighbors(one, width, height, wraps).some((neighbor) => !landMask[neighbor]))
          - Number(!hexNeighbors(two, width, height, wraps).some((neighbor) => !landMask[neighbor]))
        : 0;
      return coastalPenalty
        || pointDistanceSquared(tilePoint(one), anchor, width, wraps) - pointDistanceSquared(tilePoint(two), anchor, width, wraps)
        || one - two;
    });
    const nucleus = candidates[0];
    if (nucleus === undefined) return empty();
    const allowed = new Set(candidates);
    const patch = [nucleus];
    const queued = new Set(patch);
    for (let cursor = 0; cursor < patch.length && patch.length < desiredStageSize; cursor += 1) {
      const adjacent = hexNeighbors(patch[cursor], width, height, wraps)
        .filter((index) => allowed.has(index) && !queued.has(index))
        .sort((one, two) => pointDistanceSquared(tilePoint(one), anchor, width, wraps)
          - pointDistanceSquared(tilePoint(two), anchor, width, wraps) || one - two);
      for (const index of adjacent) {
        queued.add(index);
        patch.push(index);
        if (patch.length >= desiredStageSize) break;
      }
    }
    for (const index of patch) claimedStage.add(index);
    stageTiles.set(region.id, patch);
    stageNuclei.push(nucleus);
  }

  const transitionPaths = new Map<string, number[]>();
  const centerline: number[] = [];
  for (let order = 0; order < stageNuclei.length - 1; order += 1) {
    const from = stages[order]!;
    const to = stages[order + 1]!;
    const authored = graphPlan.paths.find((path) => path.kind === "CAUSAL_TRANSITION" && path.from === from.id && path.to === to.id);
    if (!authored) return empty();
    const route = tilePathThroughPoints(
      [normalizedTilePoint(stageNuclei[order]), ...authored.points, normalizedTilePoint(stageNuclei[order + 1])],
      width,
      height,
      wraps,
      blocked,
    );
    if (!route.length) return empty();
    transitionPaths.set(authored.id, route);
    centerline.push(...(centerline.length && centerline.at(-1) === route[0] ? route.slice(1) : route));
  }

  const riverCenterline = centerline.slice(0, Math.max(0, centerline.lastIndexOf(stageNuclei[3]) + 1));
  if (riverCenterline.length < 4) return empty();
  const ribbon = new Set(riverCenterline);
  for (const index of riverCenterline) for (const neighbor of hexNeighbors(index, width, height, wraps)) {
    if (!blocked.has(neighbor)) ribbon.add(neighbor);
  }
  const essential = new Set<number>([...centerline, ...ribbon, ...stageTiles.values()].flat());
  const retainedProtection = new Set<number>([...essential, ...hardLand, ...semanticLand, ...nativeEdgeLand]);
  if (retainedProtection.size > targetLand) return empty();

  const priorMask = [...landMask];
  const priorProtectedWater = new Set(protectedWater);
  const priorProtectedLand = new Set(protectedLand);
  for (const index of [...protectedLand]) if (!retainedProtection.has(index)) protectedLand.delete(index);
  for (const index of retainedProtection) {
    protectedWater.delete(index);
    protectedLand.add(index);
    landMask[index] = true;
  }
  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 1, protectedWater, protectedLand);
  if (landMask.filter(Boolean).length !== targetLand || [...retainedProtection].some((index) => !landMask[index])) {
    for (let index = 0; index < landMask.length; index += 1) landMask[index] = priorMask[index];
    replaceSetContents(protectedWater, priorProtectedWater);
    replaceSetContents(protectedLand, priorProtectedLand);
    return empty();
  }

  for (const region of stages as Array<NonNullable<(typeof stages)[number]>>) reservations.realizedRegionTiles.set(region.id, stageTiles.get(region.id) ?? []);
  for (const [id, route] of transitionPaths) reservations.realizedPathTiles.set(id, route);
  const river = graphPlan.paths.find((path) => path.kind === "LIVING_RIVER" && path.from === stages[3]!.id && path.to === stages[0]!.id);
  if (river) reservations.realizedPathTiles.set(river.id, [...riverCenterline].reverse());
  return {
    ribbonTiles: [...ribbon],
    realizedStages: stageTiles.size,
    realizedTransitions: transitionPaths.size,
    topologyAdjusted: priorMask.some((land, index) => land !== landMask[index]),
  };
}

function growPeninsulaHead(
  origin: number,
  target: number,
  width: number,
  height: number,
  wraps: boolean,
  blocked: ReadonlySet<number>,
  seed: number,
) {
  if (origin < 0 || blocked.has(origin)) return [];
  const center = { x: origin % width + 0.5, y: Math.floor(origin / width) + 0.5 };
  const queue = [origin];
  const visited = new Set(queue);
  const members: number[] = [];
  for (let cursor = 0; cursor < queue.length && members.length < target; cursor += 1) {
    const index = queue[cursor];
    if (blocked.has(index)) continue;
    members.push(index);
    const next = hexNeighbors(index, width, height, wraps).filter((neighbor) => !visited.has(neighbor) && !blocked.has(neighbor));
    next.sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, center, width, wraps)
      - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, center, width, wraps)
      || hashNoise(one, origin, seed) - hashNoise(two, origin, seed) || one - two);
    for (const neighbor of next) { visited.add(neighbor); queue.push(neighbor); }
  }
  return members;
}

function tileSetIsConnected(members: ReadonlyArray<number>, width: number, height: number, wraps: boolean) {
  if (!members.length) return false;
  const allowed = new Set(members);
  const reached = new Set([members[0]]);
  const queue = [members[0]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const neighbor of hexNeighbors(queue[cursor], width, height, wraps)) {
    if (!allowed.has(neighbor) || reached.has(neighbor)) continue;
    reached.add(neighbor);
    queue.push(neighbor);
  }
  return reached.size === allowed.size;
}

function connectedTileSubsets(members: ReadonlyArray<number>, width: number, height: number, wraps: boolean) {
  const allowed = new Set(members);
  const components: number[][] = [];
  while (allowed.size) {
    const origin = allowed.values().next().value as number;
    const component = [origin];
    allowed.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) for (const neighbor of hexNeighbors(component[cursor], width, height, wraps)) {
      if (!allowed.delete(neighbor)) continue;
      component.push(neighbor);
    }
    components.push(component.sort((one, two) => one - two));
  }
  return components;
}

function largestConnectedTileSubset(members: ReadonlyArray<number>, width: number, height: number, wraps: boolean) {
  return connectedTileSubsets(members, width, height, wraps)
    .sort((one, two) => two.length - one.length || one[0] - two[0])[0] ?? [];
}

function peninsulaCoastalShare(members: ReadonlyArray<number>, landMask: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean) {
  return members.filter((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => !landMask[neighbor])).length / Math.max(1, members.length);
}

function peninsulaWaterFlankedShare(members: ReadonlyArray<number>, landMask: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean) {
  return members.filter((index) => hexNeighbors(index, width, height, wraps).filter((neighbor) => !landMask[neighbor]).length >= 2).length / Math.max(1, members.length);
}

/**
 * Great Peninsulas is compiled as actual country-scale coastal heads joined to
 * the shared parent continent through authored narrow necks. A retained graph
 * edge therefore denotes a real land articulation, rather than a broad sample
 * of whichever continent happened to cover its polygon path.
 */
function realizePeninsulaAttachments(
  landMask: boolean[],
  targetWater: number,
  subregions: Int32Array,
  subregionCount: number,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  graphPlan: EccentricGraphPlan,
  reservations: EccentricNarrativeReservations,
  protectedWater: Set<number>,
  protectedLand: Set<number>,
  constraints?: GenerationConstraintPayload,
): NativePeninsulaAttachments {
  const empty = (): NativePeninsulaAttachments => ({ headTiles: [], neckTiles: [], supportTiles: [], realizedHeads: 0, realizedNecks: 0, topologyAdjusted: false });
  const paths = graphPlan.paths.filter((path) => path.kind === "PENINSULA_NECK" && path.effect === "LAND_PATH");
  if (paths.length < 3 || targetWater < 24 || width < 14 || height < 10) return empty();

  const originalMask = [...landMask];
  const originalProtectedWater = new Set(protectedWater);
  const originalProtectedLand = new Set(protectedLand);
  const originalRegionTiles = new Map(reservations.realizedRegionTiles);
  const originalPathTiles = new Map(reservations.realizedPathTiles);
  const originalSupportTiles = new Map(reservations.realizedPathSupportTiles);
  const hardLand = new Set<number>();
  const hardWater = new Set<number>();
  if (constraints?.topology.length === landMask.length) for (let index = 0; index < landMask.length; index += 1) {
    if (constraints.topology[index] === 1) hardLand.add(index);
    else if (constraints.topology[index] === 0) hardWater.add(index);
  }
  const regions = new Map(graphPlan.regions.map((region) => [region.id, region]));
  const protectedSemanticIds = new Set(constraints?.semantics.map((semantic) => semantic.sourceSemanticId.replace(/^narrative:/, "")) ?? []);
  const claimedHeads = new Set<number>();
  const claimedCollars = new Set<number>();
  const allHeads = new Set<number>();
  const allNecks = new Set<number>();
  const allSupport = new Set<number>();
  // Scale the retained province with map diameter. The former eight-tile
  // minimum was enough to prove an articulation but still rendered as a cape,
  // not a Florida- or Italy-scale settlement country.
  const headTarget = Math.max(8, Math.min(72, Math.round(Math.sqrt(landMask.length) / 3)));
  const neckLength = Math.max(2, Math.min(4, 2 + Math.round(Math.sqrt(landMask.length) / 90)));
  let realized = 0;

  for (const [pathIndex, path] of paths.entries()) {
    const source = regions.get(path.from);
    const terminal = regions.get(path.to);
    if (!source || !terminal || terminal.role !== "PENINSULA_PROVINCE") continue;
    // A downloaded project may protect the precise shape of either cause.
    // Leave that binding to compileGraphReservations instead of replacing its
    // preserved extent with a newly authored peninsula head or neck.
    if (protectedSemanticIds.has(path.id) || protectedSemanticIds.has(terminal.id)) continue;
    const blockedPath = new Set<number>([...hardWater, ...claimedHeads, ...claimedCollars]);
    const authoredPoints = path.points.length ? path.points : [source.anchor, terminal.anchor];
    const route = tilePathThroughPoints(authoredPoints, width, height, wraps, blockedPath);
    if (route.length < neckLength + 3) continue;
    const terminalTile = route.at(-1)!;
    const blockedHead = new Set<number>([...hardWater, ...claimedHeads, ...claimedCollars]);
    const head = growPeninsulaHead(terminalTile, headTarget, width, height, wraps, blockedHead, seed + pathIndex * 131);
    if (head.length < Math.max(8, Math.floor(headTarget * 0.8))) continue;
    const headSet = new Set(head);
    const entry = route.findIndex((index) => headSet.has(index));
    if (entry < neckLength) continue;
    let neckStart = Math.max(0, entry - neckLength);
    // If the approach grazes another side of the compact head, include that
    // contact in the named throat so the head cannot have an unreported bridge.
    while (neckStart > 0 && hexNeighbors(route[neckStart - 1], width, height, wraps).some((neighbor) => headSet.has(neighbor))) neckStart -= 1;
    const neck = route.slice(neckStart, entry);
    const support = route.slice(0, neckStart);
    if (!neck.length || !support.length || !tileSetIsConnected(neck, width, height, wraps)) continue;
    const neckSet = new Set(neck);
    const supportSet = new Set(support);
    const collar = new Set<number>();
    for (const index of [...head, ...neck]) for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      if (headSet.has(neighbor) || neckSet.has(neighbor) || supportSet.has(neighbor) || hardLand.has(neighbor)) continue;
      collar.add(neighbor);
    }
    if (!collar.size) continue;

    const candidate = [...landMask];
    for (const index of [...support, ...neck, ...head]) candidate[index] = true;
    for (const index of collar) candidate[index] = false;
    if (peninsulaCoastalShare(head, candidate, width, height, wraps) < 0.3 || peninsulaWaterFlankedShare(neck, candidate, width, height, wraps) < 0.5) continue;
    const essentialLand = new Set<number>([...protectedLand, ...hardLand, ...support, ...neck, ...head]);
    const essentialWater = new Set<number>([...protectedWater, ...hardWater, ...collar]);
    for (const index of [...support, ...neck, ...head]) essentialWater.delete(index);
    for (const index of collar) essentialLand.delete(index);
    if (essentialLand.size > landMask.length - targetWater || essentialWater.size > targetWater) continue;

    for (let index = 0; index < landMask.length; index += 1) landMask[index] = candidate[index];
    replaceSetContents(protectedLand, essentialLand);
    replaceSetContents(protectedWater, essentialWater);
    reservations.realizedRegionTiles.set(terminal.id, [...head]);
    reservations.realizedPathTiles.set(path.id, [...neck]);
    reservations.realizedPathSupportTiles.set(path.id, [...support]);
    for (const index of head) { claimedHeads.add(index); allHeads.add(index); }
    for (const index of collar) claimedCollars.add(index);
    for (const index of neck) allNecks.add(index);
    for (const index of support) allSupport.add(index);
    realized += 1;
  }

  if (realized < paths.length) {
    for (let index = 0; index < landMask.length; index += 1) landMask[index] = originalMask[index];
    replaceSetContents(protectedWater, originalProtectedWater);
    replaceSetContents(protectedLand, originalProtectedLand);
    reservations.realizedRegionTiles = originalRegionTiles;
    reservations.realizedPathTiles = originalPathTiles;
    reservations.realizedPathSupportTiles = originalSupportTiles;
    return empty();
  }

  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 1879, protectedWater, protectedLand);
  const retainedHeads = [...reservations.realizedRegionTiles.entries()].filter(([id, members]) => regions.get(id)?.role === "PENINSULA_PROVINCE"
    && members.every((index) => landMask[index]) && tileSetIsConnected(members, width, height, wraps)
    && peninsulaCoastalShare(members, landMask, width, height, wraps) >= 0.3);
  const retainedNecks = [...reservations.realizedPathTiles.entries()].filter(([id, members]) => graphPlan.paths.find((path) => path.id === id)?.kind === "PENINSULA_NECK"
    && members.every((index) => landMask[index]) && tileSetIsConnected(members, width, height, wraps)
    && peninsulaWaterFlankedShare(members, landMask, width, height, wraps) >= 0.5);
  if (landMask.filter((land) => !land).length !== targetWater || retainedHeads.length < paths.length || retainedNecks.length < paths.length) {
    for (let index = 0; index < landMask.length; index += 1) landMask[index] = originalMask[index];
    replaceSetContents(protectedWater, originalProtectedWater);
    replaceSetContents(protectedLand, originalProtectedLand);
    reservations.realizedRegionTiles = originalRegionTiles;
    reservations.realizedPathTiles = originalPathTiles;
    reservations.realizedPathSupportTiles = originalSupportTiles;
    return empty();
  }
  return {
    headTiles: [...allHeads],
    neckTiles: [...allNecks],
    supportTiles: [...allSupport],
    realizedHeads: retainedHeads.length,
    realizedNecks: retainedNecks.length,
    topologyAdjusted: landMask.some((land, index) => land !== originalMask[index]),
  };
}

function consolidateIslandSystems(
  mask: boolean[],
  maximumComponents: number,
  targetLand: number,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  protectedWater: ReadonlySet<number>,
  narrativeTopology?: ReadonlyArray<number>,
) {
  const components = connectedComponents(mask, width, height, wraps);
  if (components.count <= maximumComponents) return;
  const retained = new Set(components.sizes.map((_size, id) => id).sort((one, two) => components.sizes[two] - components.sizes[one]).slice(0, maximumComponents));
  for (let index = 0; index < mask.length; index += 1) if (mask[index] && !retained.has(components.ids[index])) mask[index] = false;
  let land = mask.filter(Boolean).length;
  while (land < targetLand) {
    const candidates = mask.flatMap((isLand, index) => {
      if (isLand || protectedWater.has(index) || !hexNeighbors(index, width, height, wraps).some((neighbor) => mask[neighbor])) return [];
      const adjacent = hexNeighbors(index, width, height, wraps).filter((neighbor) => mask[neighbor]).length;
      const influence = narrativeTopology?.[index] ?? 0;
      return [{ index, score: adjacent * 2 + influence + hashNoise(index % width, Math.floor(index / width), seed + land) * 0.01 }];
    }).sort((one, two) => two.score - one.score || one.index - two.index);
    if (!candidates.length) break;
    mask[candidates[0].index] = true;
    land += 1;
  }
}

function connectDominantLandShare(
  mask: boolean[],
  targetLand: number,
  minimumShare: number,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  subregions: Int32Array,
  subregionCount: number,
  protectedWater: Set<number>,
  protectedLand: Set<number>,
  constraints?: GenerationConstraintPayload,
) {
  let changed = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const components = connectedComponents(mask, width, height, wraps);
    const largest = components.sizes.reduce((best, size, id) => size > best.size ? { id, size } : best, { id: 0, size: 0 });
    if (largest.size / Math.max(1, mask.filter(Boolean).length) >= minimumShare) return changed;
    const previous = new Int32Array(mask.length).fill(-2);
    const queue = mask.flatMap((land, index) => land && components.ids[index] === largest.id && hexNeighbors(index, width, height, wraps).some((next) => !mask[next]) ? [index] : []);
    for (const index of queue) previous[index] = -1;
    let target = -1;
    for (let cursor = 0; cursor < queue.length && target < 0; cursor += 1) {
      const index = queue[cursor];
      for (const next of hexNeighbors(index, width, height, wraps)) {
        if (previous[next] !== -2 || constraints?.topology[next] === 0) continue;
        previous[next] = index;
        if (mask[next] && components.ids[next] !== largest.id) { target = next; break; }
        queue.push(next);
      }
    }
    if (target < 0) return changed;
    for (let index = target; index >= 0; index = previous[index]) {
      if (!mask[index]) { mask[index] = true; protectedWater.delete(index); protectedLand.add(index); changed = true; }
    }
    reconcileWaterMask(mask, mask.length - targetLand, subregions, subregionCount, width, height, wraps, seed + attempt * 31, protectedWater, protectedLand);
  }
  return changed;
}

function separateParentIslandSystems(
  mask: boolean[],
  targetLand: number,
  anchors: readonly Point[],
  minimumSystems: number,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  subregions: Int32Array,
  subregionCount: number,
  protectedWater: Set<number>,
  protectedLand: Set<number>,
  constraints?: GenerationConstraintPayload,
  seamDepth = 0,
  nucleusSize = 5,
  primaryNucleusSize = nucleusSize,
) {
  if (anchors.length < minimumSystems) return false;
  const owner = new Int16Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    const point = { x: index % width + 0.5, y: Math.floor(index / width) + 0.5 };
    owner[index] = anchors.reduce((best, anchor, candidate) => {
      const distance = pointDistanceSquared(point, { x: anchor.x * width, y: anchor.y * height }, width, wraps);
      return distance < best.distance || distance === best.distance && candidate < best.candidate ? { candidate, distance } : best;
    }, { candidate: 0, distance: Number.POSITIVE_INFINITY }).candidate;
  }
  const seams = new Set<number>();
  for (let index = 0; index < mask.length; index += 1) {
    if (!hexNeighbors(index, width, height, wraps).some((next) => owner[next] !== owner[index])) continue;
    if (constraints?.topology[index] === 1) continue;
    seams.add(index);
  }
  let frontier = [...seams];
  for (let depth = 0; depth < seamDepth; depth += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      if (seams.has(neighbor) || constraints?.topology[neighbor] === 1) continue;
      seams.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  for (const index of seams) {
    mask[index] = false;
    protectedLand.delete(index);
    protectedWater.add(index);
  }
  // Every authored parent system retains a small land nucleus on its own side
  // of the native water seam. The later exact-budget reconciliation grows from
  // these nuclei but cannot join them back across the protected gap.
  for (let system = 0; system < anchors.length; system += 1) {
    const candidates = mask.map((_land, index) => index)
      .filter((index) => owner[index] === system && !seams.has(index) && constraints?.topology[index] !== 0)
      .sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, { x: anchors[system].x * width, y: anchors[system].y * height }, width, wraps)
        - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, { x: anchors[system].x * width, y: anchors[system].y * height }, width, wraps) || one - two);
    const requiredNucleusSize = system === 0 ? primaryNucleusSize : nucleusSize;
    const existingComponents = connectedTileSubsets(candidates.filter((index) => mask[index]), width, height, wraps)
      .sort((one, two) => {
        const nearest = (members: readonly number[]) => Math.min(...members.map((index) => pointDistanceSquared(
          { x: index % width + 0.5, y: Math.floor(index / width) + 0.5 },
          { x: anchors[system].x * width, y: anchors[system].y * height },
          width,
          wraps,
        )));
        return Number(two.length >= requiredNucleusSize) - Number(one.length >= requiredNucleusSize)
          || nearest(one) - nearest(two)
          || two.length - one.length
          || one[0] - two[0];
      });
    const existingComponent = existingComponents.find((members) => members.length >= requiredNucleusSize);
    const existingMembers = new Set(existingComponent ?? []);
    // Reuse a sufficiently large real island whenever one already exists.
    // Starting from the abstract anchor can otherwise repaint one or two sea
    // tiles as protected land, making an exact very-high sea budget
    // mathematically impossible even though the authored realm was viable.
    const nucleus = candidates.find((index) => existingMembers.has(index)
      && hexNeighbors(index, width, height, wraps).filter((next) => existingMembers.has(next)).length >= 2)
      ?? existingComponent?.[0]
      ?? candidates.find((index) => hexNeighbors(index, width, height, wraps).filter((next) => owner[next] === system && !seams.has(next)).length >= 3)
      ?? candidates[0];
    if (nucleus === undefined) continue;
    const members: number[] = [];
    const queue = [nucleus];
    const reached = new Set(queue);
    for (let cursor = 0; cursor < queue.length && members.length < requiredNucleusSize; cursor += 1) {
      const index = queue[cursor];
      if (owner[index] !== system || seams.has(index) || constraints?.topology[index] === 0
        || existingComponent && !existingMembers.has(index)) continue;
      members.push(index);
      const nextMembers = hexNeighbors(index, width, height, wraps)
        .filter((next) => !reached.has(next) && owner[next] === system && !seams.has(next) && constraints?.topology[next] !== 0
          && (!existingComponent || existingMembers.has(next)))
        .sort((one, two) => Number(mask[two]) - Number(mask[one]) || one - two);
      for (const next of nextMembers) {
        reached.add(next);
        queue.push(next);
      }
    }
    for (const index of members) { mask[index] = true; protectedWater.delete(index); protectedLand.add(index); }
  }
  reconcileWaterMask(mask, mask.length - targetLand, subregions, subregionCount, width, height, wraps, seed, protectedWater, protectedLand);
  return connectedComponents(mask, width, height, wraps).count >= minimumSystems;
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
  narrative?: NarrativeAdapterPlan,
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
  const graphPlan = narrative?.native.kind === "GRAPH_PLAN" ? narrative.native : undefined;
  const targetWater = Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const targetLand = area - targetWater;
  const narrativeReservations = compileGraphReservations(graphPlan, polygonAdjacency, polygonCenters, polygonAreas, width, height, wraps, seed + 281, constraints, hexPolygons);
  const narrativeReservationBudget = fitGraphReservationsToBudget(narrativeReservations, polygonAreas, targetLand, targetWater, graphPlan);

  // Pass 3: compile deep-water barriers first. Their graph components are the
  // authoritative Astronomy basins used by the landmass pass below.
  const requestedAstronomyBasins = targetWater === 0 ? 1 : Math.max(1, Math.min(5, Math.round(options.oceanBasins)));
  let basinPlan = buildAstronomyBarriers(profile, polygonAdjacency, polygonCenters, polygonAreas, width, height, wraps, requestedAstronomyBasins, targetWater, seed + 307, narrativeReservations.forcedLand);
  // Native land objects outrank the engine's generic astronomy cuts. Removing
  // those crossings here retains the cause before basin components are derived.
  for (const polygon of narrativeReservations.forcedLand) basinPlan.barriers.delete(polygon);
  // Native water paths remain authoritative water in the land-allocation pass,
  // but they do not each become a new top-level Astronomy basin. Otherwise a
  // user's explicit basin count is multiplied by every secondary narrative
  // rift rather than governing the high-level navigation partition.
  if (narrativeReservations.forcedWater.size || narrativeReservations.forcedLand.size) {
    const empty = new Set(polygonAreas.flatMap((polygonArea, polygon) => polygonArea > 0 ? [] : [polygon]));
    const components = graphComponents(polygonAdjacency, new Set([...basinPlan.barriers, ...empty]));
    basinPlan = { barriers: basinPlan.barriers, ...components };
  }
  const riftPolygons = basinPlan.barriers;

  // Pass 4: allocate major continents and islands inside those basins, then
  // add tiny subregion islands and inland waters before coherent reconciliation.
  const polygonLand = allocateLandPolygons(profile, polygonAdjacency, polygonCenters, polygonAreas, basinPlan.members, riftPolygons, targetLand, width, wraps, random, seed + 401);
  if (narrative) {
    const votes = new Array<number>(polygonCount).fill(0);
    const weights = new Array<number>(polygonCount).fill(0);
    for (let index = 0; index < area; index += 1) {
      const polygon = hexPolygons[index];
      votes[polygon] += narrative.topology[index];
      weights[polygon] += Math.abs(narrative.topology[index]);
    }
    for (let polygon = 0; polygon < polygonCount; polygon += 1) {
      if (weights[polygon] < Math.max(1, polygonAreas[polygon] * 0.08)) continue;
      const vote = votes[polygon] / Math.max(1, polygonAreas[polygon]);
      const threshold = options.preset === "LONELY_OCEANS" ? 0.34 : 0.2;
      if (vote > threshold) polygonLand[polygon] = true;
      else if (vote < -threshold) polygonLand[polygon] = false;
    }
  }
  // Native graph reservations are applied after the coarse land grammar and
  // before tile reconciliation. They are graph objects, not post-render masks.
  for (const polygon of narrativeReservations.forcedWater) polygonLand[polygon] = false;
  for (const polygon of narrativeReservations.forcedLand) if (!narrativeReservations.forcedWater.has(polygon)) polygonLand[polygon] = true;
  const polarWaterPolygons = new Set<number>();
  if (!options.landAtPoles && targetWater > 0) {
    let protectedWaterArea = [...riftPolygons].reduce((sum, polygon) => sum + polygonAreas[polygon], 0);
    const polarCandidates = polygonCenters.flatMap((center, polygon) => {
      const proximity = poleProximity(center.x, center.y, width, height, options.projectionType);
      return proximity > 0.91 && !riftPolygons.has(polygon) && !narrativeReservations.forcedLand.has(polygon) ? [{ polygon, proximity }] : [];
    }).sort((one, two) => two.proximity - one.proximity || one.polygon - two.polygon);
    for (const { polygon } of polarCandidates) {
      if (protectedWaterArea + polygonAreas[polygon] > targetWater) continue;
      polygonLand[polygon] = false;
      polarWaterPolygons.add(polygon);
      protectedWaterArea += polygonAreas[polygon];
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
  const protectedLand = new Set<number>();
  for (let index = 0; index < area; index += 1) {
    if (riftPolygons.has(hexPolygons[index]) || polarWaterPolygons.has(hexPolygons[index]) || narrativeReservations.forcedWater.has(hexPolygons[index])) protectedWater.add(index);
    if (narrativeReservations.forcedLand.has(hexPolygons[index]) && !narrativeReservations.forcedWater.has(hexPolygons[index])) protectedLand.add(index);
  }
  const nativeEdgeLand = new Set<number>();
  if (graphPlan?.contract.topology.edgePolicy === "LAND") {
    const edgeTiles = new Set<number>();
    if (options.preset === "SHATTERED_BASINS" && Math.min(width, height) >= 8) {
      // The exterior framework is a closed geographic rim, not the rectangular
      // boundary of the array. Trace an irregular inset loop whose low-frequency
      // radial variation remains connected but cannot become a ruler-straight
      // full row or column. Edge water may exist outside the loop; the authored
      // principal seas remain topologically enclosed inside it.
      const points = Array.from({ length: 28 }, (_value, point) => {
        const angle = point / 28 * Math.PI * 2;
        const radial = 0.9 + (valueNoise(Math.cos(angle) * 19 + 31, Math.sin(angle) * 19 + 37, 5.5, seed + 499) - 0.5) * 0.15;
        return {
          x: clamp(0.5 + Math.cos(angle) * 0.49 * radial, 0.015, 0.985),
          y: clamp(0.5 + Math.sin(angle) * 0.47 * radial, 0.02, 0.98),
        };
      });
      const hardWater = new Set<number>(constraints?.topology
        ? Array.from(constraints.topology, (value, index) => value === 0 ? index : -1).filter((index) => index >= 0)
        : []);
      const loop = tilePathThroughPoints([...points, points[0]], width, height, wraps, hardWater);
      for (const index of loop) edgeTiles.add(index);
    } else {
      for (let x = 0; x < width; x += 1) { edgeTiles.add(x); edgeTiles.add((height - 1) * width + x); }
      for (let y = 0; y < height; y += 1) { edgeTiles.add(y * width); edgeTiles.add(y * width + width - 1); }
    }
    const candidates = [...edgeTiles].filter((index) => constraints?.topology[index] !== 0);
    // A contradictory extreme sea-level request may not have enough land for
    // the complete rim. In that case the explicit tile budget wins and the
    // narrative relaxation remains visible in the retained-object evidence.
    for (const index of candidates.slice(0, Math.min(candidates.length, targetLand))) {
      protectedWater.delete(index);
      protectedLand.add(index);
      nativeEdgeLand.add(index);
      landMask[index] = true;
    }
  }
  const nativeProtectedLandBeforeBudget = protectedLand.size;
  if (protectedLand.size > targetLand) {
    const removable = [...protectedLand].filter((index) => !nativeEdgeLand.has(index)).sort((one, two) => {
      const onePolygon = hexPolygons[one]; const twoPolygon = hexPolygons[two];
      return narrativeReservations.landPriority[onePolygon] - narrativeReservations.landPriority[twoPolygon]
        || narrativeReservations.landOrder[onePolygon] - narrativeReservations.landOrder[twoPolygon]
        || one - two;
    });
    for (const index of removable) {
      if (protectedLand.size <= targetLand) break;
      protectedLand.delete(index);
    }
  }
  const decorations = decorateSmallWatersAndIslands(landMask, subregions, subregionAdjacency, hexPolygons, riftPolygons, profile, targetWater, width, height, wraps, seed + 457);
  for (const index of decorations.protectedWater) protectedWater.add(index);
  for (const index of protectedWater) landMask[index] = false;
  for (const index of protectedLand) if (!protectedWater.has(index)) landMask[index] = true;
  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 503, protectedWater, protectedLand);
  if (options.preset === "SHATTERED_BASINS") {
    consolidateIslandSystems(landMask, 1, targetLand, width, height, wraps, seed + 519, protectedWater, narrative?.topology);
  }
  if (options.preset === "LONELY_OCEANS") consolidateIslandSystems(landMask, Math.max(2, options.players), targetLand, width, height, wraps, seed + 521, protectedWater, narrative?.topology);
  if (options.preset === "SHATTERED_ARCHIPELAGO") {
    const parentSystems = Math.max(3, Math.round(narrative?.evidence.causalObjects.filter((object) => object.role === "FOLLOWS_ARC").length || 5));
    consolidateIslandSystems(landMask, parentSystems * 2, targetLand, width, height, wraps, seed + 523, protectedWater, narrative?.topology);
  }
  // Consolidation can consume whole minor components faster than its growth
  // frontier can replace them. Reconcile once more so the explicit sea-level
  // control is exact without sacrificing the protected native reservations.
  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 527, protectedWater, protectedLand);
  const nativeDominantContinentConnected = options.preset === "ASTRAL_PANGAEA"
    ? connectDominantLandShare(landMask, targetLand, 0.74, width, height, wraps, seed + 533, subregions, subregionCount, protectedWater, protectedLand, constraints)
    : false;
  const nativeParentSystemSeparation = options.preset === "SHATTERED_ARCHIPELAGO" && graphPlan
    ? separateParentIslandSystems(
        landMask,
        targetLand,
        graphPlan.regions.filter((region) => region.role === "CHAIN").map((region) => region.anchor),
        graphPlan.regions.filter((region) => region.role === "CHAIN").length,
        width,
        height,
        wraps,
        seed + 541,
        subregions,
        subregionCount,
        protectedWater,
        protectedLand,
        constraints,
        0,
        Math.max(8, ...graphPlan.regions.filter((region) => region.role === "CHAIN")
          .map((chain) => graphPlan.regions.filter((region) => region.parentId === chain.id).length + 2)),
      )
    : false;
  const nativeRiftCellSeparation = options.preset === "RIFTWORLD" && graphPlan
    ? separateParentIslandSystems(
        landMask,
        targetLand,
        graphPlan.regions.filter((region) => region.role === "VIABLE_RIFT_CELL").map((region) => region.anchor),
        graphPlan.regions.filter((region) => region.role === "VIABLE_RIFT_CELL").length,
        width,
        height,
        wraps,
        seed + 545,
        subregions,
        subregionCount,
        protectedWater,
        protectedLand,
        constraints,
        0,
        6,
      )
    : false;
  const nativeHistorySeparation = options.preset === "TECTONIC_CONTINENTS" && graphPlan
    ? separateParentIslandSystems(
        landMask,
        targetLand,
        graphPlan.regions.filter((region) => region.role === "GEOLOGIC_HISTORY").map((region) => region.anchor),
        graphPlan.regions.filter((region) => region.role === "GEOLOGIC_HISTORY").length,
        width,
        height,
        wraps,
        seed + 547,
        subregions,
        subregionCount,
        protectedWater,
        protectedLand,
        constraints,
        0,
        10,
      )
    : false;
  let nativeActiveMarginsRealized = 0;
  if (options.preset === "TECTONIC_CONTINENTS" && graphPlan) {
    const regionsById = new Map(graphPlan.regions.map((region) => [region.id, region]));
    const claimedWater = new Set<number>();
    for (const margin of graphPlan.paths.filter((path) => path.kind === "ACTIVE_MARGIN" && path.effect === "RIDGE_PATH")) {
      const from = regionsById.get(margin.from);
      const to = regionsById.get(margin.to);
      if (!from || !to) continue;
      const field = connectedComponents(landMask, width, height, wraps);
      const componentAt = (point: Point) => landMask.map((_land, index) => index).filter((index) => field.ids[index] >= 0)
        .sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, { x: point.x * width, y: point.y * height }, width, wraps)
          - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, { x: point.x * width, y: point.y * height }, width, wraps) || one - two)
        .map((index) => field.ids[index])[0] ?? -1;
      const fromComponent = componentAt(from.anchor);
      const toComponent = componentAt(to.anchor);
      if (fromComponent < 0 || toComponent < 0 || fromComponent === toComponent) continue;
      const fromLand = landMask.flatMap((land, index) => land && field.ids[index] === fromComponent ? [index] : []);
      const toLand = landMask.flatMap((land, index) => land && field.ids[index] === toComponent ? [index] : []);
      const starts = [...new Set(fromLand.flatMap((index) => hexNeighbors(index, width, height, wraps)).filter((index) => !landMask[index] && !claimedWater.has(index)))].sort((one, two) => one - two);
      const targets = new Set(toLand.flatMap((index) => hexNeighbors(index, width, height, wraps)).filter((index) => !landMask[index] && !claimedWater.has(index)));
      const previous = new Int32Array(landMask.length).fill(-2);
      const distance = new Int32Array(landMask.length).fill(-1);
      const queue = [...starts];
      for (const index of starts) { previous[index] = -1; distance[index] = 0; }
      for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of hexNeighbors(queue[cursor], width, height, wraps).sort((one, two) => one - two)) {
        if (previous[next] !== -2 || landMask[next] || claimedWater.has(next)) continue;
        previous[next] = queue[cursor];
        distance[next] = distance[queue[cursor]] + 1;
        queue.push(next);
      }
      const terminal = [...targets].filter((index) => distance[index] >= 3).sort((one, two) => distance[one] - distance[two] || one - two)[0];
      if (terminal === undefined) continue;
      const waterRoute: number[] = [];
      for (let index = terminal; index >= 0; index = previous[index]) waterRoute.push(index);
      waterRoute.reverse();
      const ridgeIsland = waterRoute.slice(1, -1);
      if (ridgeIsland.length < 2) continue;
      const fromShore = fromLand.find((index) => hexNeighbors(index, width, height, wraps).includes(waterRoute[0]));
      const toShore = toLand.find((index) => hexNeighbors(index, width, height, wraps).includes(waterRoute.at(-1)!));
      if (fromShore === undefined || toShore === undefined) continue;
      const connectWithin = (origins: readonly number[], target: number, component: number) => {
        const parent = new Int32Array(landMask.length).fill(-2);
        const search = [...new Set(origins.filter((index) => field.ids[index] === component))];
        for (const index of search) parent[index] = -1;
        for (let cursor = 0; cursor < search.length && parent[target] === -2; cursor += 1) for (const next of hexNeighbors(search[cursor], width, height, wraps)) {
          if (parent[next] !== -2 || field.ids[next] !== component) continue;
          parent[next] = search[cursor];
          search.push(next);
        }
        if (parent[target] === -2) return [];
        const route: number[] = [];
        for (let index = target; index >= 0; index = parent[index]) route.push(index);
        return route.reverse();
      };
      const regionMembers = (region: EccentricGraphPlan["regions"][number], component: number) => {
        const retained = narrativeReservations.realizedRegionTiles.get(region.id);
        if (retained?.length) return retained.filter((index) => field.ids[index] === component);
        const polygons = new Set(narrativeReservations.regionPolygons.get(region.id) ?? []);
        return landMask.flatMap((land, index) => land && field.ids[index] === component && polygons.has(hexPolygons[index]) ? [index] : []);
      };
      const fromMembers = regionMembers(from, fromComponent);
      const toMembers = regionMembers(to, toComponent);
      const fromConnector = connectWithin(fromMembers, fromShore, fromComponent);
      const toConnector = connectWithin(toMembers, toShore, toComponent);
      if (!fromConnector.length || !toConnector.length) continue;
      for (const index of ridgeIsland) { landMask[index] = true; protectedWater.delete(index); protectedLand.add(index); }
      for (const index of [waterRoute[0], waterRoute.at(-1)!]) { protectedLand.delete(index); protectedWater.add(index); claimedWater.add(index); }
      for (const index of [...fromConnector, ...toConnector]) protectedLand.add(index);
      narrativeReservations.realizedPathTiles.set(margin.id, ridgeIsland);
      narrativeReservations.realizedRegionTiles.set(from.id, [...new Set([...fromMembers, ...fromConnector])]);
      narrativeReservations.realizedRegionTiles.set(to.id, [...new Set([...toMembers, ...toConnector])]);
      for (const index of waterRoute) claimedWater.add(index);
      nativeActiveMarginsRealized += 1;
    }
    reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 548, protectedWater, protectedLand);
  }
  let nativeParentArcsRealized = 0;
  if (options.preset === "SHATTERED_ARCHIPELAGO" && graphPlan) {
    const regionsById = new Map(graphPlan.regions.map((region) => [region.id, region]));
    const hardWater = new Set<number>();
    const hardLand = new Set<number>();
    if (constraints) for (let index = 0; index < constraints.topology.length; index += 1) if (constraints.topology[index] === 0) hardWater.add(index);
    if (constraints) for (let index = 0; index < constraints.topology.length; index += 1) if (constraints.topology[index] === 1) hardLand.add(index);
    const realizedArcLand = new Set<number>();
    const realizedArcTrace = new Set<number>();
    const realizedParentIds = new Set<string>();
    for (const arc of graphPlan.paths.filter((path) => path.kind === "FOLLOWS_ARC" && (path.effect === "LAND_PATH" || path.effect === "TRANSITION"))) {
      const from = regionsById.get(arc.from);
      const to = regionsById.get(arc.to);
      if (!from?.parentId || from.parentId !== to?.parentId) continue;
      // A latent ancestry trace may already be ocean. Treat existing protected
      // water as usable evidence rather than an obstacle; only previously
      // realized island land must remain exclusive to another parent system.
      const blocked = new Set([...realizedArcLand, ...realizedArcTrace]);
      const route = eraseTilePathLoops(tilePathThroughPoints(arc.points.length ? arc.points : [from.anchor, to.anchor], width, height, wraps, blocked));
      const childCount = graphPlan.regions.filter((region) => region.parentId === from.parentId).length;
      if (route.length < childCount + 1) continue;
      // The parent arc is latent shelf/plate ancestry. Preserve its ordered
      // trace as existing water between separated island kernels rather than
      // turning the construction spline into a continuous one-tile land wire.
      const children = graphPlan.regions.filter((region) => region.parentId === from.parentId).sort((one, two) => {
        const nearest = (region: EccentricGraphPlan["regions"][number]) => route.reduce((best, index, position) => {
          const distance = pointDistanceSquared(
            { x: index % width + 0.5, y: Math.floor(index / width) + 0.5 },
            { x: region.anchor.x * width, y: region.anchor.y * height },
            width,
            wraps,
          );
          return distance < best.distance ? { position, distance } : best;
        }, { position: 0, distance: Number.POSITIVE_INFINITY }).position;
        return nearest(one) - nearest(two) || one.id.localeCompare(two.id);
      });
      const parentLand = new Set<number>();
      const claimedChildLand = new Set<number>();
      let realizedChildren = 0;
      for (const [order, child] of children.entries()) {
        const position = children.length <= 1 ? Math.floor(route.length / 2) : Math.round(order * (route.length - 1) / (children.length - 1));
        const target = child.role === "ANCHOR"
          ? Math.max(5, Math.round(Math.sqrt(landMask.length) / 12))
          : Math.max(2, Math.round(Math.sqrt(landMask.length) / 28));
        const reservedShelfTrace = [...route];
        const claimedChildBuffer = new Set([...claimedChildLand, ...[...claimedChildLand].flatMap((index) => hexNeighbors(index, width, height, wraps))]);
        const parentSystemBuffer = new Set([...realizedArcLand, ...[...realizedArcLand].flatMap((index) => hexNeighbors(index, width, height, wraps))]);
        const nucleus = route.map((index, routePosition) => ({ index, routePosition }))
          .sort((one, two) => Math.abs(one.routePosition - position) - Math.abs(two.routePosition - position) || one.routePosition - two.routePosition)
          .flatMap(({ index }) => hexNeighbors(index, width, height, wraps))
          .filter((index) => !hardWater.has(index) && !claimedChildBuffer.has(index) && !parentSystemBuffer.has(index) && !reservedShelfTrace.includes(index))
          .filter((index, candidate, candidates) => candidates.indexOf(index) === candidate)[0];
        if (nucleus === undefined) continue;
        const shelfBuffer = new Set([...reservedShelfTrace, ...reservedShelfTrace.flatMap((index) => hexNeighbors(index, width, height, wraps))]);
        shelfBuffer.delete(nucleus);
        const island = growPeninsulaHead(
          nucleus,
          target,
          width,
          height,
          wraps,
          new Set([...hardWater, ...claimedChildBuffer, ...parentSystemBuffer, ...shelfBuffer]),
          seed + order * 127 + nativeParentArcsRealized * 811,
        );
        if (!island.length) continue;
        for (const index of island) {
          landMask[index] = true;
          protectedWater.delete(index);
          protectedLand.add(index);
          realizedArcLand.add(index);
          parentLand.add(index);
          claimedChildLand.add(index);
        }
        narrativeReservations.realizedRegionTiles.set(child.id, [...island]);
        realizedChildren += 1;
        const membership = graphPlan.paths.find((path) => path.kind === "BELONGS_TO" && path.from === child.id && path.to === from.parentId);
        if (membership) narrativeReservations.realizedPathTiles.set(membership.id, [island[0]]);
      }
      if (realizedChildren !== children.length || parentLand.size < children.length) continue;
      const islandCollar = new Set<number>();
      for (const index of parentLand) for (const neighbor of hexNeighbors(index, width, height, wraps)) {
        if (parentLand.has(neighbor) || realizedArcLand.has(neighbor) || hardLand.has(neighbor)) continue;
        islandCollar.add(neighbor);
      }
      for (const index of islandCollar) {
        landMask[index] = false;
        protectedLand.delete(index);
        protectedWater.add(index);
      }
      for (const index of route) if (!parentLand.has(index) && !hardLand.has(index)) {
        landMask[index] = false;
        protectedLand.delete(index);
        protectedWater.add(index);
      }
      narrativeReservations.realizedPathTiles.set(arc.id, [...route]);
      narrativeReservations.realizedRegionTiles.set(from.parentId, [...parentLand]);
      realizedParentIds.add(from.parentId);
      for (const index of route) realizedArcTrace.add(index);
      nativeParentArcsRealized += 1;
    }
    // The polygon reservation layer can already occupy the entire explicit
    // land budget before these finer tile arcs are compiled. Keeping both the
    // coarse polygon fields and the replacement arc spines protected would
    // silently raise sea level (the old fields could no longer be exchanged).
    // Once every parent has a real arc, the arc is the authoritative retained
    // cause: release only its superseded coarse reservation while preserving
    // exact user-protected land and every native edge requirement.
    const requiredParentSystems = Math.max(3, graphPlan.contract.topology.primarySystems[0] ?? 3);
    if (nativeParentArcsRealized >= requiredParentSystems && realizedParentIds.size === nativeParentArcsRealized) {
      for (const index of [...protectedLand]) if (!realizedArcLand.has(index) && !hardLand.has(index) && !nativeEdgeLand.has(index)) protectedLand.delete(index);
      for (const index of realizedArcLand) protectedLand.add(index);
    }
    reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 549, protectedWater, protectedLand);
  }
  if (options.preset === "LONELY_OCEANS" && graphPlan) {
    const realmAnchors = graphPlan.regions.filter((region) => region.role === "REALM").map((region) => region.anchor);
    const riverRealmNucleus = Math.max(5, Math.min(19, targetLand - Math.max(0, realmAnchors.length - 1) * 5));
    separateParentIslandSystems(
      landMask,
      targetLand,
      realmAnchors,
      Math.max(2, Math.min(realmAnchors.length, options.players)),
      width,
      height,
      wraps,
      seed + 547,
      subregions,
      subregionCount,
      protectedWater,
      protectedLand,
      constraints,
      1,
      5,
      riverRealmNucleus,
    );
  }
  const topologyScores = landMask.map((land, index) => Number(land) + hashNoise(index % width, Math.floor(index / width), seed + 509) * 0.001);
  applyConstrainedLandBudget(landMask, targetLand, topologyScores, constraints);
  const nativeEcologicalTransect = graphPlan
    ? realizeEcologicalTransect(
        landMask,
        targetWater,
        subregions,
        subregionCount,
        hexPolygons,
        width,
        height,
        wraps,
        seed + 551,
        graphPlan,
        narrativeReservations,
        protectedWater,
        protectedLand,
        nativeEdgeLand,
        constraints,
      )
    : { ribbonTiles: [], realizedStages: 0, realizedTransitions: 0, topologyAdjusted: false };
  const nativePeninsulaAttachments = graphPlan && options.preset === "PENINSULA_REALM"
    ? realizePeninsulaAttachments(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed, graphPlan, narrativeReservations, protectedWater, protectedLand, constraints)
    : { headTiles: [], neckTiles: [], supportTiles: [], realizedHeads: 0, realizedNecks: 0, topologyAdjusted: false };
  const nativeNarrowCrossings = graphPlan && options.preset === "SHATTERED_BASINS"
    ? realizeShatteredBasinCrossings(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed, graphPlan, narrativeReservations, protectedWater, protectedLand, nativeEdgeLand, constraints)
    : { straitTiles: [], canalTiles: [], canalSupportTiles: [], topologyAdjusted: false };
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
  const landSubregionsByRegion = Array.from({ length: desiredRegions }, () => new Set<number>());
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const region = polygonRegions[hexPolygons[index]];
    if (region >= 0) landSubregionsByRegion[region].add(subregions[index]);
  }
  for (let region = 0; region < desiredRegions; region += 1) {
    if (landSubregionsByRegion[region].size >= 2) continue;
    const memberPolygons = Array.from({ length: polygonCount }, (_value, polygon) => polygon).filter((polygon) => polygonRegions[polygon] === region);
    const neighboringRegions = memberPolygons.flatMap((polygon) => [...polygonAdjacency[polygon]])
      .map((polygon) => polygonRegions[polygon])
      .filter((candidate) => candidate >= 0 && candidate !== region && landSubregionsByRegion[candidate].size >= 2)
      .sort((one, two) => landSubregionsByRegion[two].size - landSubregionsByRegion[one].size || one - two);
    // A one-subregion island may have no land-region neighbor at all. It
    // still cannot truthfully host a two-part climate collection, so fold it
    // into the nearest viable realm across the intervening water rather than
    // emitting a nominal one-collection climate region.
    const target = neighboringRegions[0] ?? Array.from({ length: desiredRegions }, (_value, candidate) => candidate)
      .filter((candidate) => candidate !== region && landSubregionsByRegion[candidate].size >= 2)
      .sort((one, two) => {
        const nearest = (candidate: number) => {
          const candidatePolygons = Array.from({ length: polygonCount }, (_value, polygon) => polygon)
            .filter((polygon) => polygonRegions[polygon] === candidate);
          return memberPolygons.length && candidatePolygons.length
            ? Math.min(...memberPolygons.flatMap((polygon) => candidatePolygons.map((other) => pointDistanceSquared(
                polygonCenters[polygon],
                polygonCenters[other],
                width,
                wraps,
              ))))
            : Number.POSITIVE_INFINITY;
        };
        return nearest(one) - nearest(two) || one - two;
      })[0];
    if (target === undefined) continue;
    for (const polygon of memberPolygons) polygonRegions[polygon] = target;
    for (const subregion of landSubregionsByRegion[region]) landSubregionsByRegion[target].add(subregion);
    landSubregionsByRegion[region].clear();
  }
  const regionCenters = aggregateCenters(polygonRegions, polygonCenters, desiredRegions, width, wraps);
  const climateCells = createClimateCells(Math.max(4, Math.min(18, Math.ceil(Math.sqrt(desiredRegions) * 2.2))), random);
  const climatePalettes: ClimatePalette[] = regionCenters.map((center, region) => createClimatePalette(region, center, options, width, height, random, climateCells, scale, seed));
  // A dense subregion can straddle two coarser climate regions. Collection
  // ownership therefore belongs to the (region, subregion) pair, not to the
  // subregion globally; otherwise the later region silently overwrites the
  // earlier palette and may collapse it to a single surviving collection.
  const collectionAssignments = new Int32Array(desiredRegions * subregionCount);
  collectionAssignments.fill(-1);
  for (let region = 0; region < desiredRegions; region += 1) {
    const allowed = new Set(landSubregionsByRegion[region]);
    if (!allowed.size) continue;
    const collectionCount = Math.min(climatePalettes[region].anchors.length, allowed.size);
    const assignments = graphPartition(subregionAdjacency, subregionCenters, collectionCount, width, wraps, random, organicity, allowed);
    for (const subregion of allowed) collectionAssignments[region * subregionCount + subregion] = assignments[subregion];
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
    const collection = Math.max(0, collectionAssignments[region * subregionCount + subregion]);
    const anchor = palette.anchors[Math.min(palette.anchors.length - 1, collection)];
    tileClimateAnchors[index] = anchor;
    const detailScale = (options.fantasticality === "UNBOUND" ? 3.2 : 5.4) / Math.max(0.65, character.eccentric.reliefNoise);
    temperatures[index] = clamp(anchor.temperature + (valueNoise(x + 101, y + 211, detailScale, seed + 601) - 0.5) * 0.16 * character.eccentric.reliefNoise + (narrative?.temperature[index] ?? 0) * narrativeInfluenceStrength("ECCENTRIC").climate);
    moistures[index] = clamp(anchor.moisture + (valueNoise(x + 419, y + 73, detailScale + 1.3, seed + 701) - 0.5) * 0.2 * character.eccentric.reliefNoise + character.eccentric.moistureBias * 0.35 + (narrative?.moisture[index] ?? 0) * narrativeInfluenceStrength("ECCENTRIC").climate);
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
    const polygon = hexPolygons[index];
    if (!landMask[index] || !narrativeReservations.ridgePolygons.has(polygon)) continue;
    const boundary = hexNeighbors(index, width, height, wraps).some((neighbor) => hexPolygons[neighbor] !== polygon);
    if (boundary || hashNoise(index, polygon, seed + 887) > 0.72) mountainCore[index] = 1;
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
    reliefValues[index] = valueNoise(x + 811, y + 307, (options.fantasticality === "UNBOUND" ? 5.2 : 8.2) / Math.max(0.7, character.eccentric.reliefNoise), seed + 1009) * 0.42 * character.eccentric.reliefNoise + mountainCore[index] * 0.9 + boundaryDistance[index] * 0.3 * character.eccentric.rangeLength + regionalUplift + (narrative?.relief[index] ?? 0) * narrativeInfluenceStrength("ECCENTRIC").relief;
  }
  const landRelief = reliefValues.filter((_value, index) => landMask[index]);
  const effectiveMountainPercent = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" ? Math.max(18, options.mountainPercent) : Math.max(character.mountainFloor, options.mountainPercent);
  const hillPercent = options.worldAge === "YOUNG" ? 29 : options.worldAge === "OLD" ? 12 : 20;
  const mountainThreshold = effectiveMountainPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - clamp(effectiveMountainPercent / 100, 0, 0.42));
  const hillThreshold = quantile(landRelief, 1 - clamp((effectiveMountainPercent + hillPercent) / 100, 0, 0.74));
  const elevations = landMask.map((land, index) => land ? reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0 : 0);
  applyConstrainedRelief(reliefValues, elevations, landMask, constraints);
  // Peninsula heads, their narrow necks, and the authored route back to the
  // shared backbone must remain traversable. A low relief value also prevents
  // the downstream exact mountain-budget pass from re-closing the attachment.
  for (const index of [...nativePeninsulaAttachments.headTiles, ...nativePeninsulaAttachments.neckTiles, ...nativePeninsulaAttachments.supportTiles]) {
    if (constraints?.elevation[index] === 2) continue;
    if (elevations[index] === 2) elevations[index] = 1;
    reliefValues[index] = Math.min(reliefValues[index], -1);
  }
  // Preserve enough passable land on both sides of the all-land articulation
  // for Review to keep recognizing it after accessibility restores mountains.
  // The support is not part of the one- or two-tile canal object itself.
  for (const index of nativeNarrowCrossings.canalSupportTiles) {
    if (constraints?.elevation[index] === 2) continue;
    if (elevations[index] === 2) elevations[index] = 1;
    reliefValues[index] = Math.min(reliefValues[index], -1);
  }
  if (graphPlan && options.preset === "SHATTERED_BASINS") {
    const canalPath = graphPlan.paths.find((path) => path.kind === "CANAL_ISTHMUS" && path.effect === "LAND_PATH");
    if (canalPath) {
      const settleable = landMask.map((land, index) => land && elevations[index] < 2);
      const detectedCanals = detectorNarrowCuts(settleable, landMask.map((land) => !land), width, height, wraps);
      const retainedCanal = detectedCanals.find((cut) => cut.some((index) => nativeNarrowCrossings.canalTiles.includes(index)));
      const finalCanal = retainedCanal ?? nearestCutToPath(detectedCanals, canalPath.points, width, height, wraps);
      if (finalCanal) {
        nativeNarrowCrossings.canalTiles = [...finalCanal];
        narrativeReservations.realizedPathTiles.set(canalPath.id, [...finalCanal]);
      }
    }
  }
  // A canal isthmus is only a Civ V canal site while its throat remains
  // settleable. Keep its native graph articulation below mountain relief;
  // explicit protected elevation still takes precedence when present.
  for (const index of nativeNarrowCrossings.canalTiles) {
    if (constraints?.elevation[index] === 2) continue;
    if (elevations[index] === 2) elevations[index] = 1;
    reliefValues[index] = Math.min(reliefValues[index], -1);
  }

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
    if (options.regionClimateLogic === "ORDERED") {
      // Ordered climates promise an intelligible prevailing westerly, so the
      // immediate shoulders of a real mountain wall must not be overwritten
      // by an unrelated regional palette. Apply a graded orographic signal
      // across three tiles: a moist windward approach and a dry lee that
      // gradually recovers eastward. This remains local to actual final
      // mountain runs and leaves the wider climate-realm composition intact.
      for (let y = 0; y < height; y += 1) {
        let x = 0;
        while (x < width) {
          const index = y * width + x;
          if (!landMask[index] || elevations[index] !== 2) { x += 1; continue; }
          const westEdge = x;
          while (x < width && landMask[y * width + x] && elevations[y * width + x] === 2) x += 1;
          const eastEdge = x - 1;
          const windward = [1, 2, 3].flatMap((distance) => {
            const column = westEdge - distance;
            const candidate = y * width + column;
            return column >= 0 && landMask[candidate] && elevations[candidate] < 2 ? [{ candidate, distance }] : [];
          });
          const leeward = [1, 2, 3].flatMap((distance) => {
            const column = eastEdge + distance;
            const candidate = y * width + column;
            return column < width && landMask[candidate] && elevations[candidate] < 2 ? [{ candidate, distance }] : [];
          });
          if (windward.length < 2 || leeward.length < 2) continue;
          for (const { candidate, distance } of windward) moistures[candidate] = Math.max(moistures[candidate], 0.68 - (distance - 1) * 0.04);
          for (const { candidate, distance } of leeward) moistures[candidate] = Math.min(moistures[candidate], 0.18 + (distance - 1) * 0.05);
        }
      }
    }
  }
  if (options.style === "BRUTAL") for (let index = 0; index < moistures.length; index += 1) moistures[index] = clamp(moistures[index] - 0.04);
  if (options.modifier === "DOOMSDAY") for (let index = 0; index < moistures.length; index += 1) moistures[index] = clamp(moistures[index] - 0.14);

  const livingWorldSurfaceRoles = new Array<string | undefined>(area);
  if (graphPlan?.grammarFamily === "GRAPH_ECOLOGICAL_TRANSECT") {
    const transectRegions = graphPlan.regions.filter((region) => ["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW"].includes(region.role));
    const memberPolygons = new Map(transectRegions.map((region) => [region.id, new Set(narrativeReservations.regionPolygons.get(region.id) ?? [])]));
    for (let index = 0; index < area; index += 1) {
      if (!landMask[index]) continue;
      const x = (index % width + 0.5) / width;
      const y = (Math.floor(index / width) + 0.5) / height;
      const candidates = transectRegions.filter((region) => memberPolygons.get(region.id)?.has(hexPolygons[index]));
      const owner = candidates.reduce<(typeof transectRegions)[number] | undefined>((best, region) => {
        if (!best) return region;
        const score = (x - region.anchor.x) ** 2 + (y - region.anchor.y) ** 2;
        const bestScore = (x - best.anchor.x) ** 2 + (y - best.anchor.y) ** 2;
        return score < bestScore || score === bestScore && region.id < best.id ? region : best;
      }, undefined);
      if (owner) livingWorldSurfaceRoles[index] = owner.role;
    }
    // The scale-aware topology compiler may replace broad polygon protection
    // with compact nuclei and a river-capable causal ribbon. Those exact
    // nuclei remain the authoritative stage footprints even when the ribbon
    // crosses a neighboring or otherwise unowned coarse polygon.
    for (const region of transectRegions) for (const index of narrativeReservations.realizedRegionTiles.get(region.id) ?? []) {
      if (index >= 0 && index < area && landMask[index]) livingWorldSurfaceRoles[index] = region.role;
    }
    // Semantic shape protection reserves the original native extent before
    // polygon allocation. Reapply that region's physical effect to every
    // protected tile as well, so rebinding can remain both extent-complete and
    // truthful instead of choosing between protection and causal output.
    for (const region of transectRegions) {
      const semantic = constraints?.semantics.find((candidate) => candidate.sourceSemanticId === `narrative:${region.id}`);
      if (!semantic) continue;
      for (const index of semantic.tileIndices) if (index >= 0 && index < area && landMask[index]) livingWorldSurfaceRoles[index] = region.role;
    }

    const minimumRelief = Math.min(...reliefValues);
    const maximumRelief = Math.max(...reliefValues);
    for (let index = 0; index < area; index += 1) {
      if (!landMask[index]) continue;
      const role = livingWorldSurfaceRoles[index];
      if (role === "COAST") {
        moistures[index] = Math.max(moistures[index], 0.7);
        temperatures[index] = clamp(temperatures[index], 0.5, 0.72);
      } else if (role === "RIVER_MARSH") {
        moistures[index] = Math.max(moistures[index], 0.9);
        temperatures[index] = clamp(temperatures[index], 0.66, 0.8);
      } else if (role === "LIVING_PLAIN") {
        moistures[index] = clamp(moistures[index], 0.44, 0.56);
        if (constraints?.elevation[index] !== 2 && elevations[index] === 2) elevations[index] = 1;
        reliefValues[index] = Math.min(reliefValues[index], minimumRelief - 0.18);
      } else if (role === "RAIN_SHADOW") {
        moistures[index] = Math.min(moistures[index], 0.16);
        temperatures[index] = Math.max(temperatures[index], 0.72);
      }
    }

    const wall = transectRegions.find((region) => region.role === "MOUNTAIN_WALL");
    if (wall) {
      const wallColumn = Math.max(2, Math.min(width - 4, Math.round(wall.anchor.x * (width - 1))));
      const wallPolygons = memberPolygons.get(wall.id) ?? new Set<number>();
      const wallCandidates = landMask.flatMap((land, index) => {
        if (!land || !wallPolygons.has(hexPolygons[index])) return [];
        const x = index % width;
        if (Math.abs(x - wallColumn) > Math.max(2, Math.floor(width * 0.04))) return [];
        const y = Math.floor(index / width);
        const west = [x - 2, x - 1].map((sampleX) => y * width + sampleX);
        const east = [x + 1, x + 2, x + 3].map((sampleX) => y * width + sampleX);
        return west.every((sample) => landMask[sample]) && east.filter((sample) => landMask[sample]).length >= 2 ? [index] : [];
      }).sort((one, two) => Math.floor(one / width) - Math.floor(two / width) || one - two);
      for (const [position, index] of wallCandidates.entries()) {
        const x = index % width;
        const y = Math.floor(index / width);
        const deliberatePass = position % 6 === 3;
        livingWorldSurfaceRoles[index] = "MOUNTAIN_WALL";
        if ((constraints?.elevation[index] ?? -1) < 0) elevations[index] = deliberatePass ? 1 : 2;
        reliefValues[index] = deliberatePass ? minimumRelief - 0.32 : maximumRelief + 1.4;
        temperatures[index] = deliberatePass ? 0.58 : 0.34;
        moistures[index] = 0.38;
        for (const sampleX of [x - 2, x - 1]) {
          const sample = y * width + sampleX;
          if (!landMask[sample]) continue;
          livingWorldSurfaceRoles[sample] = "RIVER_MARSH";
          moistures[sample] = 0.95;
          temperatures[sample] = 0.72;
          if (constraints?.elevation[sample] !== 2 && elevations[sample] === 2) elevations[sample] = 1;
          reliefValues[sample] = Math.min(reliefValues[sample], minimumRelief - 0.25);
        }
        for (const sampleX of [x + 1, x + 2, x + 3]) {
          const sample = y * width + sampleX;
          if (!landMask[sample]) continue;
          livingWorldSurfaceRoles[sample] = "RAIN_SHADOW";
          moistures[sample] = 0.08;
          temperatures[sample] = 0.82;
        }
      }

      // The ecological transect's range is a causal wall, not a collection of
      // unrelated mountain flecks. Join the two authored transition contacts
      // with a passable hill spine through the wall anchor. Existing mountain
      // teeth remain in place; the spine supplies the continuous geographic
      // relationship without sealing either side of the continent.
      const inbound = graphPlan.paths.find((path) => path.kind === "CAUSAL_TRANSITION" && path.to === wall.id);
      const outbound = graphPlan.paths.find((path) => path.kind === "CAUSAL_TRANSITION" && path.from === wall.id);
      const blockedWater = new Set(landMask.flatMap((land, index) => land ? [] : [index]));
      const wallTarget = { x: wall.anchor.x * width, y: wall.anchor.y * height };
      const pathLandMembers = (path: EccentricGraphPlan["paths"][number] | undefined) => {
        const polygons = new Set(path ? narrativeReservations.pathPolygons.get(path.id) ?? [] : []);
        return landMask.flatMap((land, index) => land && polygons.has(hexPolygons[index]) ? [index] : []);
      };
      const closestToWall = (members: number[]) => members.sort((one, two) => pointDistanceSquared({ x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, wallTarget, width, wraps)
        - pointDistanceSquared({ x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, wallTarget, width, wraps) || one - two)[0] ?? -1;
      const start = closestToWall(pathLandMembers(inbound));
      const end = closestToWall(pathLandMembers(outbound));
      const via = nearestAvailableTile(wall.anchor, width, height, wraps, blockedWater);
      const firstHalf = shortestTilePath(start, via, width, height, wraps, blockedWater);
      const secondHalf = shortestTilePath(via, end, width, height, wraps, blockedWater);
      const connector = firstHalf.length && secondHalf.length ? [...firstHalf, ...secondHalf.slice(1)] : shortestTilePath(start, end, width, height, wraps, blockedWater);
      for (const index of connector) {
        if (!landMask[index]) continue;
        livingWorldSurfaceRoles[index] = "MOUNTAIN_WALL";
        if ((constraints?.elevation[index] ?? -1) < 0) elevations[index] = elevations[index] === 2 ? 2 : 1;
        if (elevations[index] > 0) reliefValues[index] = Math.max(reliefValues[index], maximumRelief + 0.35);
        temperatures[index] = Math.min(temperatures[index], 0.48);
        moistures[index] = Math.min(moistures[index], 0.38);
      }
    }
  }

  // Pass 8: render every retained small-region decision into Civ V tile content
  // and emit hierarchy guidance for the legal downstream river encoder.
  const mythicHeartRegions = graphPlan?.regions.filter((region) => region.role === "MYTHIC_HEART") ?? [];
  const mythicMarchRegions = graphPlan?.regions.filter((region) => region.role === "BARREN_MARCH") ?? [];
  const mythicHeartPolygons = new Set(mythicHeartRegions.flatMap((region) => narrativeReservations.regionPolygons.get(region.id) ?? []));
  const mythicMarchPolygons = new Set(mythicMarchRegions.flatMap((region) => narrativeReservations.regionPolygons.get(region.id) ?? []));
  const mythicHeartTiles = new Set(landMask.flatMap((land, index) => land && mythicHeartPolygons.has(hexPolygons[index]) ? [index] : []));
  const mythicMarchCandidates = new Set(landMask.flatMap((land, index) => land && mythicMarchPolygons.has(hexPolygons[index]) && !mythicHeartTiles.has(index) ? [index] : []));
  const mythicMarchTiles = new Set<number>();
  const desiredMarchTiles = Math.min(mythicMarchCandidates.size, Math.ceil(landMask.filter(Boolean).length * 0.16));
  const marchQueue = mythicMarchRegions.flatMap((region) => {
    const members = new Set(narrativeReservations.regionPolygons.get(region.id) ?? []);
    const candidates = [...mythicMarchCandidates].filter((index) => members.has(hexPolygons[index]));
    candidates.sort((one, two) => {
      const distance = (index: number) => pointDistanceSquared({ x: index % width + 0.5, y: Math.floor(index / width) + 0.5 }, { x: region.anchor.x * width, y: region.anchor.y * height }, width, wraps);
      return distance(one) - distance(two) || one - two;
    });
    return candidates.length ? [candidates[0]] : [];
  });
  const queuedMarchTiles = new Set(marchQueue);
  for (let cursor = 0; cursor < marchQueue.length && mythicMarchTiles.size < desiredMarchTiles; cursor += 1) {
    const index = marchQueue[cursor];
    mythicMarchTiles.add(index);
    const neighbors = hexNeighbors(index, width, height, wraps).filter((neighbor) => mythicMarchCandidates.has(neighbor) && !queuedMarchTiles.has(neighbor));
    neighbors.sort((one, two) => hashNoise(one, cursor, seed + 1223) - hashNoise(two, cursor, seed + 1223) || one - two);
    for (const neighbor of neighbors) { queuedMarchTiles.add(neighbor); marchQueue.push(neighbor); }
  }
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
    if (land && options.preset === "GREAT_WATERSHEDS" && elevations[index] === 0 && (narrative?.rivers[index] ?? 0) > 0.14) {
      terrain = featureNoise > 0.45 ? 2 : 3;
      if (featureNoise > 0.72) feature = 2;
    }
    // Mythic hearts and their enclosing marches must remain materially
    // different even under a whole-world palette such as Arborea. The extreme
    // still governs ordinary land; native graph roles reserve a small fertile
    // core and a resource-poor hostile buffer before content is allocated.
    if (land && mythicMarchTiles.has(index)) {
      terrain = options.eccentricExtreme === "SNOWBALL" ? 6 : temperatures[index] < 0.32 ? 5 : temperatures[index] < 0.42 ? 3 : 4;
      feature = 255;
    } else if (land && mythicHeartPolygons.has(hexPolygons[index]) && elevations[index] < 2) {
      terrain = 2;
      if (options.eccentricExtreme === "ARBOREA" && feature === 255) feature = 0;
    } else if (land && options.eccentricExtreme === "JURASSIC") {
      terrain = 2;
      if (elevations[index] < 2 && feature === 255 && featureNoise > 0.22) feature = 1;
    }
    const transectRole = livingWorldSurfaceRoles[index];
    if (land && transectRole === "COAST") {
      terrain = 2;
      feature = elevations[index] < 2 && featureNoise > 0.54 ? 0 : 255;
    } else if (land && transectRole === "RIVER_MARSH") {
      terrain = 2;
      feature = elevations[index] === 0 ? 2 : elevations[index] === 1 ? 1 : 255;
    } else if (land && transectRole === "LIVING_PLAIN") {
      terrain = 3;
      feature = 255;
    } else if (land && transectRole === "MOUNTAIN_WALL") {
      terrain = elevations[index] === 2 ? 5 : 3;
      feature = 255;
    } else if (land && transectRole === "RAIN_SHADOW") {
      terrain = 4;
      feature = 255;
    }
    if (!land) terrain = adjacentLand ? 1 : 0;
    return { terrain, resource: 255, feature, river: 0, elevation: elevations[index], continent: land ? continentIds[index] + 1 : 0, wonder: 255, resourceAmount: 0 };
  });
  applyConstrainedSurface(tiles, landMask, elevations, constraints);
  if (options.preset === "MYTHIC_REGIONS") {
    // A heart may be fantastical; its boundary still needs a geographic
    // transition. Reconcile only direct hot/cold contradictions touching a
    // retained heart or march, leaving the valuable core and resource-barren
    // march intact while inserting tundra or plains as the causal buffer.
    const mythic = new Set([...mythicHeartTiles, ...mythicMarchTiles]);
    for (let pass = 0; pass < 2; pass += 1) for (const index of mythic) {
      for (const neighbor of hexNeighbors(index, width, height, wraps)) {
        if (!landMask[neighbor]) continue;
        const pair = new Set([tiles[index].terrain, tiles[neighbor].terrain]);
        const harsh = pair.has(6) && (pair.has(2) || pair.has(4)) || pair.has(5) && pair.has(4);
        if (!harsh) continue;
        const protectedIndex = (constraints?.terrain[index] ?? -1) >= 0;
        const protectedNeighbor = (constraints?.terrain[neighbor] ?? -1) >= 0;
        if ((tiles[index].terrain === 4 || tiles[index].terrain === 2) && !protectedIndex) {
          tiles[index] = { ...tiles[index], terrain: tiles[index].terrain === 4 ? 3 : 5, feature: 255 };
        } else if ((tiles[neighbor].terrain === 6 || tiles[neighbor].terrain === 5) && !protectedNeighbor) {
          tiles[neighbor] = { ...tiles[neighbor], terrain: 5, feature: tiles[neighbor].feature === 3 ? 3 : 255 };
        }
      }
    }
  }
  const explicitClimateTiles = new Set(graphPlan?.regions
    .filter((region) => ["HOT", "COLD", "DRY", "WET"].includes(region.effect))
    .flatMap((region) => narrativeReservations.realizedRegionTiles.get(region.id)
      ?? landMask.flatMap((land, index) => land && (narrativeReservations.regionPolygons.get(region.id) ?? []).includes(hexPolygons[index]) ? [index] : [])) ?? []);
  // Regional palettes are intentionally varied, but a palette boundary is not
  // permission for grass or desert to touch snow directly. Insert the minimum
  // plains/tundra ecotone while retaining explicitly caused climate regions and
  // exact protected surface channels.
  for (let pass = 0; pass < 3; pass += 1) for (let index = 0; index < tiles.length; index += 1) {
    if (!landMask[index]) continue;
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      if (neighbor <= index || !landMask[neighbor]) continue;
      const pair = new Set([tiles[index].terrain, tiles[neighbor].terrain]);
      const harsh = pair.has(6) && (pair.has(2) || pair.has(4)) || pair.has(5) && pair.has(4);
      if (!harsh) continue;
      const candidates = [index, neighbor].filter((candidate) => (constraints?.terrain[candidate] ?? -1) < 0 && !explicitClimateTiles.has(candidate));
      const target = candidates.find((candidate) => tiles[candidate].terrain === 4)
        ?? candidates.find((candidate) => tiles[candidate].terrain === 6)
        ?? candidates[0];
      if (target === undefined) continue;
      const terrain = tiles[target].terrain === 4 ? 3 : 5;
      tiles[target] = { ...tiles[target], terrain, feature: terrain === 5 && tiles[target].feature === 3 ? 3 : 255 };
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const next = tiles.map((tile) => ({ ...tile }));
    for (let index = 0; index < tiles.length; index += 1) {
      if (!landMask[index] || explicitClimateTiles.has(index) || (constraints?.terrain[index] ?? -1) >= 0) continue;
      const adjacent = hexNeighbors(index, width, height, wraps).filter((neighbor) => landMask[neighbor]);
      const terrainCounts = new Map<number, number>();
      for (const neighbor of adjacent) terrainCounts.set(tiles[neighbor].terrain, (terrainCounts.get(tiles[neighbor].terrain) ?? 0) + 1);
      const majority = [...terrainCounts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
      const own = terrainCounts.get(tiles[index].terrain) ?? 0;
      if (majority && majority[1] >= 3 && own <= 1) next[index].terrain = majority[0];
      if ((constraints?.feature[index] ?? -1) >= 0) continue;
      if (tiles[index].feature !== 255) {
        const same = adjacent.filter((neighbor) => tiles[neighbor].feature === tiles[index].feature).length;
        if (same === 0) next[index].feature = 255;
      } else {
        const featureCounts = new Map<number, number>();
        for (const neighbor of adjacent) if (tiles[neighbor].feature !== 255) featureCounts.set(tiles[neighbor].feature, (featureCounts.get(tiles[neighbor].feature) ?? 0) + 1);
        const feature = [...featureCounts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
        if (feature && feature[1] >= 4 && next[index].elevation < 2) next[index].feature = feature[0];
      }
    }
    for (let index = 0; index < tiles.length; index += 1) tiles[index] = next[index];
  }

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
    if (narrativeReservations.riverPolygons.has(polygon)) guidance = Math.max(guidance, 0.9);
    riverGuidance[index] = guidance;
    if (narrative) {
      riverGuidance[index] = clamp(riverGuidance[index] + narrative.rivers[index] * narrativeInfluenceStrength("ECCENTRIC").rivers);
      if (options.preset === "GREAT_WATERSHEDS" && narrative.rivers[index] > 0.12) riverGuidance[index] = Math.max(riverGuidance[index], 0.72 + narrative.rivers[index] * 0.26);
    }
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
  // Crossroads seas are authored as several regional basins joined by narrow
  // straits. Their connected union remains in the superpolygon hierarchy, but
  // exposing that aggregate again as an INLAND_SEA double-counts the system as
  // a fifth "great sea" beside its four retained native members.
  const reportedBasins = options.preset === "SHATTERED_BASINS"
    ? basins.filter((object) => !(object.id.startsWith("inland_sea-") && object.tileIndices.length >= area * 0.08))
    : basins;
  const rifts = connectedTileObjects("RIFT", deepWaterMask, width, height, wraps, "Astronomy Rift");
  const climateObjects = objectsFromAssignments("CLIMATE_REGION", climateAssignments, desiredRegions, "Climate Realm").map((object, index) => ({
    ...object,
    attributes: { paletteSize: climatePalettes[index]?.anchors.length ?? 0, climateCell: climatePalettes[index]?.climateCell ?? -1, temperature: Math.round((climatePalettes[index]?.temperature ?? 0.5) * 100), rainfall: Math.round((climatePalettes[index]?.moisture ?? 0.5) * 100) },
  }));
  const collectionObjects: GeographicObject[] = [];
  for (let region = 0; region < climatePalettes.length; region += 1) {
    for (let collection = 0; collection < climatePalettes[region].anchors.length; collection += 1) {
      const mask = landMask.map((land, index) => land && polygonRegions[hexPolygons[index]] === region
        && collectionAssignments[region * subregionCount + subregions[index]] === collection);
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
  // The generic coastal-neighbor heuristic finds dozens of one-tile pockets
  // inside the Crossroads rim. Those are not the deliberately authored
  // Bosporus-like crossings, whose stricter cut detector is retained below.
  const reportedStraits = options.preset === "SHATTERED_BASINS" ? [] : straits;
  const identities: GeographicObject[] = [...archipelagos, ...reportedStraits, ...bays, ...capes, ...forestRealms, ...wastes];
  let nativeNarrativeObjects: GeographicObject[] = graphPlan ? [
    ...graphPlan.regions.flatMap((region): GeographicObject[] => {
      const realizedRegionTiles = narrativeReservations.realizedRegionTiles.get(region.id);
      const members = new Set(narrativeReservations.regionPolygons.get(region.id) ?? []);
      const ecologicalRoleTiles = (() => {
        if (graphPlan.grammarFamily !== "GRAPH_ECOLOGICAL_TRANSECT"
          || !["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW"].includes(region.role)) return undefined;
        const protectedExact = new Set(constraints?.semantics.find((semantic) => semantic.sourceSemanticId === `narrative:${region.id}`)?.tileIndices ?? []);
        const roleMembers = landMask.flatMap((land, index) => land && (livingWorldSurfaceRoles[index] === region.role || protectedExact.has(index)) ? [index] : []);
        const incidentPathMembers = graphPlan.paths.filter((path) => path.kind === "CAUSAL_TRANSITION" && (path.from === region.id || path.to === region.id)).map((path) => {
          const realized = narrativeReservations.realizedPathTiles.get(path.id);
          if (realized) return realized;
          const polygons = new Set(narrativeReservations.pathPolygons.get(path.id) ?? []);
          return landMask.flatMap((_land, index) => polygons.has(hexPolygons[index]) ? [index] : []);
        });
        const touches = (one: ReadonlyArray<number>, two: ReadonlyArray<number>) => {
          const target = new Set(two);
          return one.some((index) => target.has(index) || hexNeighbors(index, width, height, wraps).some((neighbor) => target.has(neighbor)));
        };
        return connectedTileSubsets(roleMembers, width, height, wraps).sort((one, two) => {
          const oneProtected = one.filter((index) => protectedExact.has(index)).length;
          const twoProtected = two.filter((index) => protectedExact.has(index)).length;
          const oneTouches = incidentPathMembers.filter((path) => touches(one, path)).length;
          const twoTouches = incidentPathMembers.filter((path) => touches(two, path)).length;
          return twoProtected - oneProtected || twoTouches - oneTouches || two.length - one.length || one[0] - two[0];
        })[0] ?? [];
      })();
      const riftCellTiles = (() => {
        if (graphPlan.grammarFamily !== "GRAPH_RIFT_LATTICE" || region.role !== "VIABLE_RIFT_CELL") return undefined;
        const regionPolygons = new Set(narrativeReservations.regionPolygons.get(region.id) ?? []);
        const members = landMask.flatMap((land, index) => land && regionPolygons.has(hexPolygons[index]) ? [index] : []);
        const incidentPaths = graphPlan.paths.filter((path) => (path.kind === "PRIMARY_RIFT" || path.kind === "SECONDARY_RIFT") && (path.from === region.id || path.to === region.id))
          .map((path) => {
            const realized = narrativeReservations.realizedPathTiles.get(path.id);
            if (realized) return realized;
            const polygons = new Set(narrativeReservations.pathPolygons.get(path.id) ?? []);
            return landMask.flatMap((land, index) => !land && polygons.has(hexPolygons[index]) ? [index] : []);
          });
        const touches = (component: readonly number[], path: readonly number[]) => {
          const target = new Set(path);
          return component.some((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => target.has(neighbor)));
        };
        return connectedTileSubsets(members, width, height, wraps).sort((one, two) => {
          const oneContacts = incidentPaths.filter((path) => touches(one, path)).length;
          const twoContacts = incidentPaths.filter((path) => touches(two, path)).length;
          const onePassable = one.filter((index) => elevations[index] < 2).length;
          const twoPassable = two.filter((index) => elevations[index] < 2).length;
          return twoContacts - oneContacts || twoPassable - onePassable || two.length - one.length || one[0] - two[0];
        })[0] ?? [];
      })();
      const tileIndices = ecologicalRoleTiles ?? riftCellTiles ?? realizedRegionTiles?.filter((index) => region.effect === "WATER" ? !landMask[index] : landMask[index]) ?? landMask.flatMap((land, index) => {
        if (!members.has(hexPolygons[index])) return [];
        if (region.role === "BARREN_MARCH" && !mythicMarchTiles.has(index)) return [];
        if (region.effect === "WATER") return land ? [] : [index];
        return land ? [index] : [];
      });
      if (!tileIndices.length) return [];
      const neighbors = [...new Set(graphPlan.paths.flatMap((path) => path.from === region.id ? [`narrative-${path.to}`] : path.to === region.id ? [`narrative-${path.from}`] : []))];
      const peninsulaAttributes: Record<string, string | number | boolean> = realizedRegionTiles && region.role === "PENINSULA_PROVINCE" ? {
        nativeAttachment: true,
        settleableTiles: tileIndices.filter((index) => elevations[index] < 2).length,
        coastalShare: peninsulaCoastalShare(tileIndices, landMask, width, height, wraps),
        attachmentNeckCount: graphPlan.paths.filter((path) => path.kind === "PENINSULA_NECK" && path.to === region.id && narrativeReservations.realizedPathTiles.has(path.id)).length,
      } : {};
      return [{ id: `narrative-${region.id}`, semanticId: `narrative:${region.id}`, name: region.role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_REGION", tileIndices, ...(neighbors.length ? { neighbors } : {}), attributes: { nativeNarrative: true, grammarFamily: graphPlan.grammarFamily, role: region.role, effect: region.effect, parent: region.parentId ?? "", priority: region.priority, ...peninsulaAttributes } }];
    }),
    ...graphPlan.paths.flatMap((path): GeographicObject[] => {
      const realizedTiles = narrativeReservations.realizedPathTiles.get(path.id);
      const supportTiles = narrativeReservations.realizedPathSupportTiles.get(path.id) ?? [];
      const members = new Set(narrativeReservations.pathPolygons.get(path.id) ?? []);
      const tileIndices = realizedTiles ?? landMask.flatMap((land, index) => {
        if (!members.has(hexPolygons[index])) return [];
        if (path.effect === "WATER_PATH") return land ? [] : [index];
        return path.effect === "LAND_PATH" || path.effect === "RIDGE_PATH" || path.effect === "RIVER_PATH" ? land ? [index] : [] : [index];
      });
      if (!tileIndices.length) return [];
      const targetHead = new Set(narrativeReservations.realizedRegionTiles.get(path.to) ?? []);
      const sourceRegion = new Set(narrativeReservations.realizedRegionTiles.get(path.from)
        ?? landMask.flatMap((land, index) => land && (narrativeReservations.regionPolygons.get(path.from) ?? []).includes(hexPolygons[index]) ? [index] : []));
      const peninsulaAttributes: Record<string, string | number | boolean> = realizedTiles && path.kind === "PENINSULA_NECK" ? {
        nativeAttachment: true,
        continuous: tileSetIsConnected(tileIndices, width, height, wraps),
        waterFlankedShare: peninsulaWaterFlankedShare(tileIndices, landMask, width, height, wraps),
        headConnected: tileIndices.some((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => targetHead.has(neighbor))),
        backboneConnected: supportTiles.length > 0
          && [...supportTiles, ...tileIndices].every((index) => landMask[index])
          && tileSetIsConnected([...new Set([...supportTiles, ...tileIndices])], width, height, wraps)
          && supportTiles.some((index) => sourceRegion.has(index) || hexNeighbors(index, width, height, wraps).some((neighbor) => sourceRegion.has(neighbor))),
        supportTileCount: supportTiles.length,
      } : {};
      const detectorRecognized = Boolean(realizedTiles) && (path.kind === "NARROW_STRAIT" || path.kind === "CANAL_ISTHMUS");
      const kind = path.kind === "NARROW_STRAIT" && detectorRecognized ? "STRAIT" as const : "NARRATIVE_PATH" as const;
      return [{ id: `narrative-${path.id}`, semanticId: `narrative:${path.id}`, name: path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind, tileIndices, neighbors: [`narrative-${path.from}`, `narrative-${path.to}`], attributes: { nativeNarrative: true, grammarFamily: graphPlan.grammarFamily, relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength, detectorRecognized, ...peninsulaAttributes } }];
    }),
  ] : [];
  if (graphPlan?.grammarFamily === "GRAPH_ENCIRCLED_SEAS") {
    const regionById = new Map(nativeNarrativeObjects.filter((object) => object.kind === "NARRATIVE_REGION")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const existingById = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const usedInteriors = new Set<number>();
    const rebound = new Map<string, GeographicObject>();
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "OUTER_CIRCUIT")) {
      const from = regionById.get(path.from);
      const to = regionById.get(path.to);
      if (!from || !to) continue;
      const endpoints = new Set([...from.tileIndices, ...to.tileIndices]);
      const otherNodes = new Set(nativeNarrativeObjects.filter((object) => object.kind === "NARRATIVE_REGION"
        && object.attributes?.role === "ENCLOSING_LAND" && object !== from && object !== to).flatMap((object) => object.tileIndices));
      const pairs = from.tileIndices.flatMap((origin) => to.tileIndices.map((target) => ({ origin, target, distance: pointDistanceSquared(
        { x: origin % width + 0.5, y: Math.floor(origin / width) + 0.5 },
        { x: target % width + 0.5, y: Math.floor(target / width) + 0.5 },
        width,
        wraps,
      ) }))).sort((one, two) => one.distance - two.distance || one.origin - two.origin || one.target - two.target).slice(0, 96);
      let route: number[] | undefined = pairs.flatMap(({ origin, target }) => {
        const blocked = new Set(landMask.flatMap((land, index) => !land || usedInteriors.has(index)
          || otherNodes.has(index) && !endpoints.has(index) ? [index] : []));
        const candidate = shortestTilePath(origin, target, width, height, wraps, blocked);
        return candidate.length >= 2 ? [candidate] : [];
      }).sort((one, two) => one.length - two.length || one[0] - two[0] || (one.at(-1) ?? 0) - (two.at(-1) ?? 0))[0];
      if (!route) route = pairs.flatMap(({ origin, target }) => {
        const blocked = new Set(landMask.flatMap((land, index) => !land || otherNodes.has(index) && !endpoints.has(index) ? [index] : []));
        const candidate = shortestTilePath(origin, target, width, height, wraps, blocked);
        return candidate.length >= 2 ? [candidate] : [];
      }).sort((one, two) => one.filter((index) => usedInteriors.has(index)).length - two.filter((index) => usedInteriors.has(index)).length
        || one.length - two.length || one[0] - two[0] || (one.at(-1) ?? 0) - (two.at(-1) ?? 0))[0];
      if (!route) {
        const hardWater = new Set<number>(constraints?.topology
          ? Array.from(constraints.topology, (value, index) => value === 0 ? index : -1).filter((index) => index >= 0)
          : []);
        route = pairs.flatMap(({ origin, target }) => {
          const blocked = new Set([...hardWater, ...otherNodes]);
          blocked.delete(origin);
          blocked.delete(target);
          const candidate = shortestTilePath(origin, target, width, height, wraps, blocked);
          return candidate.length >= 2 ? [candidate] : [];
        }).sort((one, two) => one.filter((index) => !landMask[index]).length - two.filter((index) => !landMask[index]).length
          || one.length - two.length || one[0] - two[0])[0];
        const additions = route?.filter((index) => !landMask[index]) ?? [];
        const claimedNative = new Set([...nativeNarrativeObjects.flatMap((object) => object.tileIndices), ...usedInteriors, ...(route ?? [])]);
        const donors = landMask.flatMap((land, index) => land && !claimedNative.has(index) && constraints?.topology[index] !== 1 ? [index] : [])
          .sort((one, two) => hexNeighbors(one, width, height, wraps).filter((neighbor) => landMask[neighbor]).length
            - hexNeighbors(two, width, height, wraps).filter((neighbor) => landMask[neighbor]).length || one - two);
        if (!route || donors.length < additions.length) route = undefined;
        else {
          for (const index of additions) {
            landMask[index] = true;
            elevations[index] = 0;
            reliefValues[index] = Math.min(reliefValues[index], 0.34);
            tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
          }
          for (const index of donors.slice(0, additions.length)) {
            landMask[index] = false;
            elevations[index] = 0;
            tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
          }
        }
      }
      if (!route) continue;
      const prior = existingById.get(`narrative-${path.id}`);
      const object: GeographicObject = prior ? { ...prior, tileIndices: route, attributes: { ...prior.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } } : {
        id: `narrative-${path.id}`,
        semanticId: `narrative:${path.id}`,
        name: "Outer Circuit",
        kind: "NARRATIVE_PATH",
        tileIndices: route,
        neighbors: [`narrative-${path.from}`, `narrative-${path.to}`],
        attributes: { nativeNarrative: true, grammarFamily: graphPlan.grammarFamily, relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength, outputEffectMatched: true, endpointTerminatingSpine: true },
      };
      rebound.set(object.id, object);
      for (const index of route.slice(1, -1)) usedInteriors.add(index);
    }
    nativeNarrativeObjects = nativeNarrativeObjects.filter((object) => object.attributes?.role !== "OUTER_CIRCUIT");
    nativeNarrativeObjects.push(...rebound.values());
  }
  if (graphPlan?.grammarFamily === "GRAPH_INLAND_SEA_CROSSROADS") {
    const seaPlans = graphPlan.regions.filter((region) => region.role === "GREAT_INLAND_SEA");
    // The canal isthmus deliberately keeps two principal inland-water
    // countries disconnected until a city is founded. Partition the complete
    // enclosed-water inventory, not only its largest connected component;
    // otherwise one canal shore and the strait attached to it disappear from
    // the causal graph even though their native cuts are physically present.
    const waterMembers = landMask.flatMap((land, index) => land ? [] : [index]);
    const waterSet = new Set(waterMembers);
    const straitPlans = graphPlan.paths.filter((path) => path.kind === "NARROW_STRAIT");
    const availableStraits = detectorNarrowCuts(landMask.map((land) => !land), landMask, width, height, wraps)
      .filter((cut) => cut.length <= 2 && narrowCutAdjacentSides(landMask.map((land) => !land), cut, width, height, wraps)
        .filter((side) => side.length >= Math.max(3, Math.floor(waterMembers.length * 0.04))).length >= 2);
    const sameCut = (one: readonly number[], two: readonly number[]) => one.length === two.length
      && [...one].sort((a, b) => a - b).every((index, position) => index === [...two].sort((a, b) => a - b)[position]);
    const usedCrossingTiles = new Set<number>();
    const selectedStraits = new Map<string, number[]>();
    const forcedSeeds = new Map<string, Set<number>>();
    const addForcedSeed = (id: string, index: number) => {
      const members = forcedSeeds.get(id) ?? new Set<number>();
      members.add(index);
      forcedSeeds.set(id, members);
    };
    const distanceToRegion = (index: number, id: string) => {
      const region = seaPlans.find((candidate) => candidate.id === id);
      return region ? pointDistanceSquared(
        { x: index % width + 0.5, y: Math.floor(index / width) + 0.5 },
        { x: region.anchor.x * width, y: region.anchor.y * height },
        width,
        wraps,
      ) : Number.POSITIVE_INFINITY;
    };
    // Fix the Panama-like crossing first. Its two water-facing shores anchor
    // the middle sea countries, so the later Bosporus cuts are oriented toward
    // those same connected countries instead of marooning a canal shore on
    // the wrong side of a strait.
    const selectedCanals = new Map<string, number[]>();
    let availableCanals = detectorNarrowCuts(
      landMask.map((land, index) => land && elevations[index] < 2),
      landMask.map((land) => !land),
      width,
      height,
      wraps,
    ).filter((cut) => cut.length <= 2);
    const rawCanalCuts = detectorNarrowCuts(landMask, landMask.map((land) => !land), width, height, wraps)
      .filter((cut) => cut.length <= 2 && cut.every((index) => constraints?.elevation[index] !== 2));
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "CANAL_ISTHMUS")) {
      const realized = narrativeReservations.realizedPathTiles.get(path.id);
      const prescribed = realized && availableCanals.find((cut) => sameCut(cut, realized));
      const selected = prescribed ?? nearestCutToPath(availableCanals, path.points, width, height, wraps)
        ?? nearestCutToPath(rawCanalCuts, path.points, width, height, wraps);
      if (!selected) continue;
      if (!availableCanals.some((cut) => sameCut(cut, selected))) {
        const support = canalSupportForCut(landMask, selected, width, height, wraps);
        for (const index of [...selected, ...support]) if (constraints?.elevation[index] !== 2) {
          elevations[index] = Math.min(1, elevations[index]) as 0 | 1;
          reliefValues[index] = Math.min(reliefValues[index], 0.3);
          tiles[index] = { ...tiles[index], elevation: Math.min(1, tiles[index].elevation) as 0 | 1 };
        }
        availableCanals = [...availableCanals, [...selected]];
      }
      const shores = [...new Set(selected.flatMap((index) => hexNeighbors(index, width, height, wraps)).filter((index) => !landMask[index]))];
      const fromShore = [...shores].sort((one, two) => distanceToRegion(one, path.from) - distanceToRegion(two, path.from) || one - two)[0];
      const toShore = shores.filter((index) => index !== fromShore)
        .sort((one, two) => distanceToRegion(one, path.to) - distanceToRegion(two, path.to) || one - two)[0];
      if (fromShore === undefined || toShore === undefined) continue;
      addForcedSeed(path.from, fromShore);
      addForcedSeed(path.to, toShore);
      selectedCanals.set(path.id, [...selected]);
      for (const index of selected) usedCrossingTiles.add(index);
    }
    for (const path of straitPlans) {
      const realized = narrativeReservations.realizedPathTiles.get(path.id);
      const prescribed = realized && availableStraits.find((cut) => sameCut(cut, realized));
      const orderedStraits = prescribed ? [prescribed, ...availableStraits.filter((cut) => cut !== prescribed)] : availableStraits;
      const candidates = orderedStraits.filter((cut) => cut.every((one) => [...usedCrossingTiles].every((two) => {
        const dx = Math.abs(one % width - two % width);
        const dy = Math.abs(Math.floor(one / width) - Math.floor(two / width));
        return Math.max(dx, dy) >= 3;
      }))).flatMap((cut) => {
        const sides = narrowCutAdjacentSides(landMask.map((land) => !land), cut, width, height, wraps);
        if (sides.length < 2) return [];
        // A prescribed cut has already survived the scale-aware native
        // compiler and the detector on this final mask. Canal-shore seeds are
        // allocation hints, not authority to discard that real Bosporus when
        // an endpoint sea has not yet been partitioned. Bind both exact shores
        // below, then let the multi-source territorial growth reconcile all
        // incident crossing seeds for that sea.
        if (cut === prescribed) return [{ cut, sides }];
        const fromSeed = [...(forcedSeeds.get(path.from) ?? [])][0];
        const toSeed = [...(forcedSeeds.get(path.to) ?? [])][0];
        if (fromSeed !== undefined && !sides.some((side) => side.includes(fromSeed))) return [];
        if (toSeed !== undefined && !sides.some((side) => side.includes(toSeed))) return [];
        if (fromSeed !== undefined && toSeed !== undefined
          && !sides.some((side, index) => side.includes(fromSeed) && sides[1 - index]?.includes(toSeed))) return [];
        return [{ cut, sides }];
      });
      const selectedCut = prescribed && candidates.some((candidate) => candidate.cut === prescribed)
        ? prescribed
        : nearestCutToPath(candidates.map((candidate) => candidate.cut), path.points, width, height, wraps);
      const selected = candidates.find((candidate) => candidate.cut === selectedCut);
      if (!selected) continue;
      const sideShore = (side: readonly number[], id: string) => side
        .filter((index) => hexNeighbors(index, width, height, wraps).some((neighbor) => selected.cut.includes(neighbor)))
        .sort((one, two) => distanceToRegion(one, id) - distanceToRegion(two, id) || one - two)[0];
      const existingFrom = [...(forcedSeeds.get(path.from) ?? [])][0];
      const existingTo = [...(forcedSeeds.get(path.to) ?? [])][0];
      const directScore = existingFrom !== undefined && selected.sides[0].includes(existingFrom)
        || existingTo !== undefined && selected.sides[1].includes(existingTo)
        ? Number.NEGATIVE_INFINITY
        : Math.min(...selected.sides[0].map((index) => distanceToRegion(index, path.from)))
          + Math.min(...selected.sides[1].map((index) => distanceToRegion(index, path.to)));
      const reverseScore = existingFrom !== undefined && selected.sides[1].includes(existingFrom)
        || existingTo !== undefined && selected.sides[0].includes(existingTo)
        ? Number.NEGATIVE_INFINITY
        : Math.min(...selected.sides[1].map((index) => distanceToRegion(index, path.from)))
          + Math.min(...selected.sides[0].map((index) => distanceToRegion(index, path.to)));
      const fromSide = directScore <= reverseScore ? selected.sides[0] : selected.sides[1];
      const toSide = directScore <= reverseScore ? selected.sides[1] : selected.sides[0];
      const fromShore = sideShore(fromSide, path.from);
      const toShore = sideShore(toSide, path.to);
      if (fromShore === undefined || toShore === undefined) continue;
      addForcedSeed(path.from, fromShore);
      addForcedSeed(path.to, toShore);
      selectedStraits.set(path.id, [...selected.cut]);
      for (const index of selected.cut) usedCrossingTiles.add(index);
    }
    const blockedStraits = new Set([...selectedStraits.values()].flat());
    const allocatableWater = waterMembers.filter((index) => !blockedStraits.has(index));
    const owner = new Int16Array(area).fill(-1);
    const forcedOwner = new Map<number, number>();
    for (const [order, region] of seaPlans.entries()) for (const index of forcedSeeds.get(region.id) ?? []) {
      if (!blockedStraits.has(index) && waterSet.has(index) && !forcedOwner.has(index)) forcedOwner.set(index, order);
    }
    for (const [order, region] of seaPlans.entries()) {
      const target = { x: region.anchor.x * width, y: region.anchor.y * height };
      const preferred = [...(forcedSeeds.get(region.id) ?? [])].filter((index) => waterSet.has(index) && !blockedStraits.has(index)
        && (forcedOwner.get(index) === undefined || forcedOwner.get(index) === order));
      if (!preferred.length) {
        const fallback = allocatableWater.filter((index) => owner[index] < 0 && !forcedOwner.has(index)).sort((one, two) => pointDistanceSquared(
          { x: one % width + 0.5, y: Math.floor(one / width) + 0.5 }, target, width, wraps,
        ) - pointDistanceSquared(
          { x: two % width + 0.5, y: Math.floor(two / width) + 0.5 }, target, width, wraps,
        ) || one - two)[0];
        if (fallback !== undefined) preferred.push(fallback);
      }
      if (!preferred.length) continue;
      owner[preferred[0]] = order;
      let connectedFrom = preferred[0];
      for (const endpoint of preferred.slice(1)) {
        const blocked = new Set<number>(blockedStraits);
        for (let index = 0; index < owner.length; index += 1) {
          if (!waterSet.has(index) || owner[index] >= 0 && owner[index] !== order) blocked.add(index);
        }
        for (const [index, assigned] of forcedOwner) if (assigned !== order) blocked.add(index);
        const route = shortestTilePath(connectedFrom, endpoint, width, height, wraps, blocked);
        if (!route.length || route.some((index) => !waterSet.has(index))) continue;
        for (const index of route) owner[index] = order;
        connectedFrom = endpoint;
      }
    }
    const queue = allocatableWater.filter((index) => owner[index] >= 0).sort((one, two) => one - two);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const next = hexNeighbors(queue[cursor], width, height, wraps)
        .filter((index) => waterSet.has(index) && !blockedStraits.has(index) && owner[index] < 0)
        .sort((one, two) => one - two);
      for (const index of next) { owner[index] = owner[queue[cursor]]; queue.push(index); }
    }
    const territories = new Map(seaPlans.map((region, order) => [region.id, allocatableWater.filter((index) => owner[index] === order)]));
    const exactSeaObjects = new Map(nativeNarrativeObjects
      .filter((object) => object.attributes?.role === "GREAT_INLAND_SEA")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const reboundSeas = new Map<string, GeographicObject>();
    for (const region of seaPlans) {
      const object = exactSeaObjects.get(region.id);
      const members = territories.get(region.id) ?? [];
      if (object && members.length >= 3 && tileSetIsConnected(members, width, height, wraps)) {
        reboundSeas.set(object.id, { ...object, tileIndices: members, attributes: { ...object.attributes, outputEffectMatched: true } });
      }
    }
    // Keep the ordinary geographic hierarchy useful to Explore and legacy
    // consumers without reintroducing the old fifth aggregate sea. Each
    // structural INLAND_SEA is an exact, non-native view of one authoritative
    // causal sea territory; the native REGION object remains the sole proof
    // binding for its authored cause.
    reportedBasins.push(...[...reboundSeas.values()].map((object, index): GeographicObject => ({
      id: `crossroads-inland-sea-${index + 1}`,
      name: `Great Inland Sea ${index + 1}`,
      kind: "INLAND_SEA",
      tileIndices: [...object.tileIndices],
      attributes: { authoritativeMember: object.id, designed: true },
    })));
    const effectiveSea = (id: string) => reboundSeas.get(`narrative-${id}`);
    const reboundCrossings = new Map<string, GeographicObject>();
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "NARROW_STRAIT" || candidate.kind === "CANAL_ISTHMUS")) {
      const crossingKind = path.kind as "NARROW_STRAIT" | "CANAL_ISTHMUS";
      const object = nativeNarrativeObjects.find((candidate) => candidate.id === `narrative-${path.id}`) ?? {
        id: `narrative-${path.id}`,
        semanticId: `narrative:${path.id}`,
        name: path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
        kind: path.kind === "NARROW_STRAIT" ? "STRAIT" as const : "NARRATIVE_PATH" as const,
        tileIndices: [],
        neighbors: [`narrative-${path.from}`, `narrative-${path.to}`],
        attributes: { nativeNarrative: true, grammarFamily: graphPlan.grammarFamily, relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength },
      };
      const from = effectiveSea(path.from);
      const to = effectiveSea(path.to);
      if (!from || !to) continue;
      const fromTiles = new Set(from.tileIndices);
      const toTiles = new Set(to.tileIndices);
      const touchesTerritory = (cut: readonly number[], territory: ReadonlySet<number>) => cut.some((index) => territory.has(index)
        || hexNeighbors(index, width, height, wraps).some((neighbor) => territory.has(neighbor)));
      const candidates = crossingKind === "NARROW_STRAIT"
        ? selectedStraits.has(path.id) ? [selectedStraits.get(path.id)!] : []
        : selectedCanals.has(path.id) ? [selectedCanals.get(path.id)!] : [];
      const accepted = candidates.filter((cut) => touchesTerritory(cut, fromTiles) && touchesTerritory(cut, toTiles));
      if (!accepted.length && crossingKind === "NARROW_STRAIT") {
        const touches = (index: number, territory: ReadonlySet<number>) => hexNeighbors(index, width, height, wraps).some((neighbor) => territory.has(neighbor));
        const oneTile = landMask.flatMap((land, index) => land && constraints?.topology[index] !== 1
          && touches(index, fromTiles) && touches(index, toTiles) ? [[index]] : []);
        const twoTile = oneTile.length ? [] : landMask.flatMap((land, index) => land && constraints?.topology[index] !== 1 && touches(index, fromTiles)
          ? hexNeighbors(index, width, height, wraps).filter((neighbor) => neighbor > index && landMask[neighbor]
            && constraints?.topology[neighbor] !== 1 && touches(neighbor, toTiles)).map((neighbor) => [index, neighbor])
          : []);
        const separates = (cut: readonly number[]) => {
          const removed = new Set(cut);
          const queue = [...fromTiles].filter((index) => !removed.has(index));
          const reached = new Set(queue);
          for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of hexNeighbors(queue[cursor], width, height, wraps)) {
            if (removed.has(next) || reached.has(next) || landMask[next]) continue;
            reached.add(next);
            queue.push(next);
          }
          return ![...toTiles].some((index) => reached.has(index));
        };
        const fallback = nearestCutToPath([...oneTile, ...twoTile].filter(separates), path.points, width, height, wraps);
        if (fallback) {
          const claimedNativeWater = new Set(nativeNarrativeObjects.flatMap((candidate) => candidate.tileIndices.filter((index) => !landMask[index])));
          const donors = landMask.flatMap((land, index) => !land && !fallback.includes(index) && !claimedNativeWater.has(index)
            && constraints?.topology[index] !== 0 ? [index] : [])
            .sort((one, two) => hexNeighbors(two, width, height, wraps).filter((neighbor) => landMask[neighbor]).length
              - hexNeighbors(one, width, height, wraps).filter((neighbor) => landMask[neighbor]).length || one - two);
          if (donors.length >= fallback.length) {
            for (const index of fallback) {
              landMask[index] = false;
              elevations[index] = 0;
              tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
            }
            for (const index of donors.slice(0, fallback.length)) {
              landMask[index] = true;
              elevations[index] = 0;
              reliefValues[index] = Math.min(reliefValues[index], 0.34);
              tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
            }
            accepted.push([...fallback]);
          }
        }
      }
      if (!accepted.length && crossingKind === "CANAL_ISTHMUS") {
        const passable = landMask.map((land, index) => land && elevations[index] < 2);
        const validCanal = (cut: readonly number[]) => {
          if (!touchesTerritory(cut, fromTiles) || !touchesTerritory(cut, toTiles)
            || cut.filter((index) => hexNeighbors(index, width, height, wraps).filter((neighbor) => !landMask[neighbor]).length >= 2).length / cut.length < 0.5) return false;
          const removed = new Set(cut);
          const field = connectedComponents(passable.map((value, index) => value && !removed.has(index)), width, height, wraps);
          const sides = new Set(cut.flatMap((index) => hexNeighbors(index, width, height, wraps))
            .map((index) => field.ids[index]).filter((component) => component >= 0 && field.sizes[component] >= 3));
          return sides.size >= 2;
        };
        const oneTile = landMask.flatMap((land, index) => land && elevations[index] < 2 ? [[index]] : []).filter(validCanal);
        const twoTile = oneTile.length ? [] : landMask.flatMap((land, index) => land && elevations[index] < 2
          ? hexNeighbors(index, width, height, wraps).filter((neighbor) => neighbor > index && landMask[neighbor] && elevations[neighbor] < 2)
            .map((neighbor) => [index, neighbor])
          : []).filter(validCanal);
        const fallback = nearestCutToPath([...oneTile, ...twoTile], path.points, width, height, wraps);
        if (fallback) accepted.push([...fallback]);
      }
      const selected = nearestCutToPath(accepted, path.points, width, height, wraps);
      if (!selected) continue;
      for (const index of selected) usedCrossingTiles.add(index);
      reboundCrossings.set(object.id, {
        ...object,
        kind: crossingKind === "NARROW_STRAIT" ? "STRAIT" : "NARRATIVE_PATH",
        tileIndices: [...selected],
        attributes: { ...object.attributes, detectorRecognized: true, outputEffectMatched: true },
      });
    }
    if (graphPlan.appliedRelaxations.some((step) => step.id === "relax-strait-isthmus") && reboundCrossings.size > 1) {
      const values = [...reboundCrossings.values()];
      const preferredRole = values.some((object) => object.attributes?.role === "NARROW_STRAIT") ? "NARROW_STRAIT" : "CANAL_ISTHMUS";
      for (const [id, object] of [...reboundCrossings]) if (object.attributes?.role !== preferredRole) reboundCrossings.delete(id);
    }
    nativeNarrativeObjects = nativeNarrativeObjects.flatMap((object) => {
      if (object.attributes?.role === "GREAT_INLAND_SEA") return reboundSeas.has(object.id) ? [reboundSeas.get(object.id)!] : [];
      if (object.attributes?.role === "NARROW_STRAIT" || object.attributes?.role === "CANAL_ISTHMUS") {
        return reboundCrossings.has(object.id) ? [reboundCrossings.get(object.id)!] : [];
      }
      return [object];
    });
    for (const [id, object] of reboundCrossings) if (!nativeNarrativeObjects.some((candidate) => candidate.id === id)) nativeNarrativeObjects.push(object);
  }
  if (graphPlan?.grammarFamily === "GRAPH_LONELY_OCEANS") {
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const rebound = new Map<string, GeographicObject>();
    const deepWater = tiles.map((tile) => tile.terrain === 0);
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "ISOLATED_FROM")) {
      const object = byId.get(`narrative-${path.id}`);
      const from = byId.get(`narrative-${path.from}`);
      const to = byId.get(`narrative-${path.to}`);
      if (!object || !from || !to) continue;
      const route = shortestDeepWaterRoute(
        from.tileIndices,
        to.tileIndices,
        landMask,
        deepWater,
        width,
        height,
        wraps,
      );
      if (route.length) rebound.set(object.id, { ...object, tileIndices: route, attributes: { ...object.attributes, outputEffectMatched: true } });
    }
    nativeNarrativeObjects = nativeNarrativeObjects.flatMap((object) => object.attributes?.role !== "ISOLATED_FROM"
      ? [object]
      : rebound.has(object.id) ? [rebound.get(object.id)!] : []);
  }
  if (graphPlan?.grammarFamily === "GRAPH_RIFT_LATTICE") {
    const riftCells = nativeNarrativeObjects.filter((object) => object.attributes?.role === "VIABLE_RIFT_CELL");
    const claimedCellTiles = new Set(riftCells.flatMap((object) => object.tileIndices));
    const plannedRiftTiles = new Set(nativeNarrativeObjects.filter((object) => object.attributes?.role === "PRIMARY_RIFT" || object.attributes?.role === "SECONDARY_RIFT")
      .flatMap((object) => object.tileIndices));
    for (const cell of [...riftCells].sort((one, two) => one.tileIndices.length - two.tileIndices.length || one.id.localeCompare(two.id))) {
      for (const index of cell.tileIndices) claimedCellTiles.delete(index);
      const cellLand = cell.tileIndices.filter((index) => landMask[index]);
      const members = new Set(connectedTileSubsets(cellLand, width, height, wraps)
        .sort((one, two) => two.length - one.length || one[0] - two[0])[0] ?? []);
      for (const index of members) if (elevations[index] === 2 && constraints?.elevation[index] !== 2) {
        elevations[index] = 1;
        tiles[index] = { ...tiles[index], elevation: 1 };
      }
      while (members.size < 3) {
        const frontier = [...new Set([...members].flatMap((index) => hexNeighbors(index, width, height, wraps)))]
          .filter((index) => landMask[index] && constraints?.elevation[index] !== 2 && !claimedCellTiles.has(index) && !members.has(index))
          .sort((one, two) => reliefValues[one] - reliefValues[two] || one - two);
        if (!frontier.length) break;
        const added = frontier[0];
        elevations[added] = Math.min(1, elevations[added]) as 0 | 1;
        tiles[added] = { ...tiles[added], elevation: elevations[added] };
        members.add(added);
      }
      while (members.size < 3) {
        const frontier = [...new Set([...members].flatMap((index) => hexNeighbors(index, width, height, wraps)))]
          .filter((index) => !landMask[index] && !claimedCellTiles.has(index) && !plannedRiftTiles.has(index)
            && constraints?.topology[index] !== 0
            && hexNeighbors(index, width, height, wraps).every((neighbor) => !claimedCellTiles.has(neighbor)))
          .sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
        const reservedNative = new Set([...claimedCellTiles, ...members, ...plannedRiftTiles]);
        const donor = landMask.flatMap((land, index) => land && elevations[index] < 2 && !reservedNative.has(index)
          && constraints?.topology[index] !== 1 ? [index] : [])
          .sort((one, two) => hexNeighbors(two, width, height, wraps).filter((neighbor) => !landMask[neighbor]).length
            - hexNeighbors(one, width, height, wraps).filter((neighbor) => !landMask[neighbor]).length || one - two)[0];
        const added = frontier[0];
        if (added === undefined || donor === undefined) break;
        landMask[added] = true;
        elevations[added] = 0;
        reliefValues[added] = Math.min(reliefValues[added], 0.34);
        tiles[added] = { ...tiles[added], terrain: 3, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
        landMask[donor] = false;
        elevations[donor] = 0;
        tiles[donor] = { ...tiles[donor], terrain: hexNeighbors(donor, width, height, wraps).some((neighbor) => landMask[neighbor]) ? 1 : 0, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
        members.add(added);
      }
      if (members.size) cell.tileIndices = [...members];
      cell.attributes = { ...cell.attributes, retainedPassableCellFloor: members.size };
      for (const index of cell.tileIndices) claimedCellTiles.add(index);
    }
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const rebound = new Map<string, GeographicObject>();
    const retainedRiftWater = new Set(nativeNarrativeObjects.filter((object) => object.attributes?.role === "PRIMARY_RIFT" || object.attributes?.role === "SECONDARY_RIFT")
      .flatMap((object) => object.tileIndices.filter((index) => !landMask[index])));
    const usedRiftTiles = new Set<number>();
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "PRIMARY_RIFT" || candidate.kind === "SECONDARY_RIFT")) {
      const object = byId.get(`narrative-${path.id}`);
      const from = byId.get(`narrative-${path.from}`);
      const to = byId.get(`narrative-${path.to}`);
      if (!object || !from || !to || from.id === to.id) continue;
      const currentDeepWater = tiles.map((tile, index) => !landMask[index] && tile.terrain === 0);
      const currentWater = landMask.map((land) => !land);
      let route = shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, currentDeepWater, width, height, wraps, usedRiftTiles)
        || shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, currentWater, width, height, wraps, usedRiftTiles);
      if (!route.length) {
        // If thresholding left two authored cells in different water basins,
        // cut the planned fracture through the intervening land and exchange an
        // equal number of unrelated coastal-water tiles back to low land. The
        // explicit sea level remains exact while the rift, rather than an
        // incidental ocean component, becomes the causal separator.
        const fromSet = new Set(from.tileIndices);
        const toSet = new Set(to.tileIndices);
        const hardLand = new Set<number>(constraints?.topology
          ? Array.from(constraints.topology, (value, index) => value === 1 && !fromSet.has(index) && !toSet.has(index) ? index : -1).filter((index) => index >= 0)
          : []);
        const planned = tilePathThroughPoints(path.points, width, height, wraps, hardLand);
        const lastFrom = planned.reduce((last, index, position) => fromSet.has(index) ? position : last, -1);
        const firstTo = planned.findIndex((index, position) => position > lastFrom && toSet.has(index));
        const segment = lastFrom >= 0 && firstTo > lastFrom + 1 ? planned.slice(lastFrom + 1, firstTo) : [];
        const segmentLand = segment.filter((index) => landMask[index]);
        const carved = segment.filter((index) => landMask[index] && constraints?.topology[index] !== 1);
        const donors = landMask.flatMap((land, index) => !land && !segment.includes(index) && !retainedRiftWater.has(index)
          && constraints?.topology[index] !== 0 ? [index] : [])
          .sort((one, two) => hexNeighbors(two, width, height, wraps).filter((index) => landMask[index]).length
            - hexNeighbors(one, width, height, wraps).filter((index) => landMask[index]).length
            || one - two);
        if (segment.length >= 2 && carved.length === segmentLand.length && donors.length >= carved.length) {
          for (const index of carved) {
            landMask[index] = false;
            elevations[index] = 0;
            tiles[index] = { ...tiles[index], terrain: 0, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
          }
          for (const index of donors.slice(0, carved.length)) {
            landMask[index] = true;
            elevations[index] = 0;
            reliefValues[index] = Math.min(reliefValues[index], 0.34);
            moistures[index] = clamp(moistures[index], 0.34, 0.62);
            temperatures[index] = clamp(temperatures[index], 0.38, 0.7);
            tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
          }
          route = segment;
        }
      }
      if (route.length) {
        // The rift is the authoritative deep fracture, not a coast-colored
        // shortest path which merely touches one ocean tile. Reclassifying its
        // existing water route does not change the explicit sea-level budget;
        // it makes the retained hierarchy visible in the exported terrain.
        route = route.filter((index) => !landMask[index]);
        for (const index of route) tiles[index] = { ...tiles[index], terrain: 0, feature: 255 };
        const deepWaterShare = route.filter((index) => tiles[index].terrain === 0).length / route.length;
        rebound.set(object.id, { ...object, tileIndices: route, attributes: { ...object.attributes, outputEffectMatched: true, deepWaterShare } });
        for (const index of route.slice(1, -1)) usedRiftTiles.add(index);
      }
    }
    nativeNarrativeObjects = nativeNarrativeObjects.flatMap((object) => object.attributes?.role !== "PRIMARY_RIFT" && object.attributes?.role !== "SECONDARY_RIFT"
      ? [object]
      : rebound.has(object.id) ? [rebound.get(object.id)!] : []);
  }
  if (graphPlan?.grammarFamily === "GRAPH_SCARRED_PANGAEA") {
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const rebound = new Map<string, GeographicObject>();
    const reservedScarWater = new Set(nativeNarrativeObjects.filter((object) => object.attributes?.role === "ALIEN_SCAR")
      .flatMap((object) => object.tileIndices.filter((index) => !landMask[index])));
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "ALIEN_SCAR")) {
      const object = byId.get(`narrative-${path.id}`);
      const from = byId.get(`narrative-${path.from}`);
      const to = byId.get(`narrative-${path.to}`);
      if (!object || !from || !to) continue;
      let selected: number[] = [];
      if (path.effect === "RIDGE_PATH") {
        const blocked = new Set(landMask.flatMap((land, index) => !land ? [index] : []));
        const pair = from.tileIndices.flatMap((left) => to.tileIndices.map((right) => ({ left, right, distance: pointDistanceSquared(
          { x: left % width + 0.5, y: Math.floor(left / width) + 0.5 },
          { x: right % width + 0.5, y: Math.floor(right / width) + 0.5 },
          width,
          wraps,
        ) }))).sort((one, two) => one.distance - two.distance || one.left - two.left || one.right - two.right)[0];
        selected = pair ? shortestTilePath(pair.left, pair.right, width, height, wraps, blocked) : [];
        for (const index of selected) {
          if (constraints?.elevation[index] === 0) continue;
          elevations[index] = Math.max(1, elevations[index]) as 1 | 2;
          reliefValues[index] = Math.max(reliefValues[index], 0.66);
          tiles[index] = { ...tiles[index], elevation: Math.max(1, tiles[index].elevation) as 1 | 2, feature: 255 };
        }
      } else {
        const deepWater = tiles.map((tile) => tile.terrain === 0);
        const allWater = landMask.map((land) => !land);
        selected = shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, deepWater, width, height, wraps)
          || shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, allWater, width, height, wraps);
        if (!selected.length) {
          const planned = tilePathThroughPoints(path.points, width, height, wraps, new Set<number>());
          const fromSet = new Set(from.tileIndices);
          const toSet = new Set(to.tileIndices);
          const lastFrom = planned.reduce((last, index, position) => fromSet.has(index) ? position : last, -1);
          const firstTo = planned.findIndex((index, position) => position > lastFrom && toSet.has(index));
          const segment = lastFrom >= 0 && firstTo > lastFrom + 1 ? planned.slice(lastFrom + 1, firstTo) : [];
          const carved = segment.filter((index) => landMask[index] && constraints?.topology[index] !== 1);
          const donors = landMask.flatMap((land, index) => !land && !segment.includes(index) && !reservedScarWater.has(index)
            && constraints?.topology[index] !== 0 ? [index] : [])
            .sort((one, two) => hexNeighbors(two, width, height, wraps).filter((index) => landMask[index]).length
              - hexNeighbors(one, width, height, wraps).filter((index) => landMask[index]).length || one - two);
          if (segment.length >= 2 && donors.length >= carved.length) {
            for (const index of carved) {
              landMask[index] = false;
              elevations[index] = 0;
              tiles[index] = { ...tiles[index], terrain: 0, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
            }
            for (const index of donors.slice(0, carved.length)) {
              landMask[index] = true;
              elevations[index] = 0;
              reliefValues[index] = Math.min(reliefValues[index], 0.34);
              tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
            }
            selected = segment;
          }
        }
        for (const index of selected) tiles[index] = { ...tiles[index], terrain: 0, elevation: 0, feature: 255 };
      }
      if (selected.length) rebound.set(object.id, { ...object, tileIndices: selected, attributes: { ...object.attributes, outputEffectMatched: true, taperedCausalScar: true } });
    }
    nativeNarrativeObjects = nativeNarrativeObjects.flatMap((object) => object.attributes?.role !== "ALIEN_SCAR"
      ? [object]
      : rebound.has(object.id) ? [rebound.get(object.id)!] : []);
    nativeNarrativeObjects = nativeNarrativeObjects.map((object) => object.kind === "NARRATIVE_REGION" && object.attributes?.effect === "LAND"
      ? { ...object, tileIndices: object.tileIndices.filter((index) => landMask[index]) }
      : object);
  }
  if (graphPlan?.grammarFamily === "GRAPH_PLATE_ATLAS") {
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const rebound = new Map<string, GeographicObject>();
    const regionRebound = new Map<string, GeographicObject>();
    const componentField = connectedComponents(landMask, width, height, wraps);
    const touchesEndpoint = (members: readonly number[], endpoint: readonly number[], radius = 2) => {
      let frontier = [...new Set(members)];
      const reached = new Set(frontier);
      for (let step = 0; step < radius; step += 1) {
        const next: number[] = [];
        for (const index of frontier) for (const neighbor of hexNeighbors(index, width, height, wraps)) if (!reached.has(neighbor)) {
          reached.add(neighbor);
          next.push(neighbor);
        }
        frontier = next;
      }
      return endpoint.some((index) => reached.has(index));
    };
    const routeWithinComponent = (origins: readonly number[], target: number, component: number) => {
      const previous = new Int32Array(landMask.length).fill(-2);
      const queue = [...new Set(origins.filter((index) => componentField.ids[index] === component))].sort((one, two) => one - two);
      for (const index of queue) previous[index] = -1;
      for (let cursor = 0; cursor < queue.length && previous[target] === -2; cursor += 1) for (const next of hexNeighbors(queue[cursor], width, height, wraps)) {
        if (previous[next] !== -2 || componentField.ids[next] !== component) continue;
        previous[next] = queue[cursor];
        queue.push(next);
      }
      if (previous[target] === -2) return [];
      const route: number[] = [];
      for (let index = target; index >= 0; index = previous[index]) route.push(index);
      return route.reverse();
    };
    const repaintHistory = (object: GeographicObject, members: readonly number[]) => {
      const effect = String(object.attributes?.effect ?? "");
      for (const index of members) {
        if (effect === "VOLCANIC" || effect === "RIDGE") {
          elevations[index] = Math.max(1, elevations[index]) as 1 | 2;
          reliefValues[index] = Math.max(reliefValues[index], 0.58);
          tiles[index] = { ...tiles[index], elevation: Math.max(1, tiles[index].elevation) as 1 | 2 };
        } else if (effect === "LOWLAND") {
          elevations[index] = Math.min(1, elevations[index]) as 0 | 1;
          reliefValues[index] = Math.min(reliefValues[index], 0.48);
          tiles[index] = { ...tiles[index], elevation: Math.min(1, tiles[index].elevation) as 0 | 1 };
        } else if (effect === "DRY") {
          tiles[index] = { ...tiles[index], terrain: tiles[index].terrain === 4 ? 4 : 3, feature: 255 };
        }
      }
    };
    // A geological history is a native material cause, not merely a polygon
    // label. Reassert its authored signature on its own retained land before
    // margin paths are rebound, so every history remains distinguishable in
    // the final terrain that the proof inspects.
    for (const history of nativeNarrativeObjects.filter((object) => object.attributes?.role === "GEOLOGIC_HISTORY")) {
      repaintHistory(history, history.tileIndices.filter((index) => landMask[index]));
    }
    const currentRegion = (id: string) => regionRebound.get(`narrative-${id}`) ?? byId.get(`narrative-${id}`);
    for (const path of graphPlan.paths.filter((candidate) => candidate.kind === "ACTIVE_MARGIN" || candidate.kind === "RIFT_MARGIN")) {
      const object = byId.get(`narrative-${path.id}`);
      let from = currentRegion(path.from);
      let to = currentRegion(path.to);
      if (!object || !from || !to) continue;
      const initialFrom = from;
      const initialTo = to;
      const candidates = connectedTileSubsets(object.tileIndices.filter((index) => path.kind === "RIFT_MARGIN" ? tiles[index].terrain < 2 : tiles[index].terrain >= 2), width, height, wraps)
        .filter((members) => touchesEndpoint(members, initialFrom.tileIndices) && touchesEndpoint(members, initialTo.tileIndices))
        .sort((one, two) => two.length - one.length || one[0] - two[0]);
      let selected: number[] | undefined = candidates[0];
      if (!selected?.length && path.kind === "RIFT_MARGIN") {
        // A broad authored rift raster can survive as two truthful coastal
        // halves separated by an unclaimed stretch of the same final ocean.
        // Neither half alone is a relationship: bind the cause to a single
        // continuous final-water route between its exact continental shores.
        // Prefer a route that actually crosses deep water, while retaining a
        // coastal-water fallback for small lawful maps without a deep cell.
        const deepWater = tiles.map((tile) => tile.terrain === 0);
        const allWater = tiles.map((tile) => tile.terrain < 2);
        selected = shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, deepWater, width, height, wraps);
        if (!selected.length) selected = shortestDeepWaterRoute(from.tileIndices, to.tileIndices, landMask, allWater, width, height, wraps);
      }
      if (!selected?.length && path.kind === "ACTIVE_MARGIN") {
        const fromComponent = componentField.ids[from.tileIndices.find((index) => landMask[index]) ?? -1];
        const toComponent = componentField.ids[to.tileIndices.find((index) => landMask[index]) ?? -1];
        const fromShore = landMask.flatMap((land, index) => land && componentField.ids[index] === fromComponent
          && hexNeighbors(index, width, height, wraps).some((neighbor) => !landMask[neighbor]) ? [index] : []);
        const toShore = new Set(landMask.flatMap((land, index) => land && componentField.ids[index] === toComponent
          && hexNeighbors(index, width, height, wraps).some((neighbor) => !landMask[neighbor]) ? [index] : []));
        const boundary = fromShore.filter((index) => touchesEndpoint([index], [...toShore], 2));
        selected = connectedTileSubsets(boundary, width, height, wraps).sort((one, two) => two.length - one.length || one[0] - two[0])[0];
        const opposing = selected?.length ? [...toShore].find((index) => touchesEndpoint(selected!, [index], 2)) : undefined;
        if (selected?.length && opposing !== undefined && fromComponent >= 0 && toComponent >= 0 && fromComponent !== toComponent) {
          const fromConnector = routeWithinComponent(from.tileIndices, selected[0], fromComponent);
          const toConnector = routeWithinComponent(to.tileIndices, opposing, toComponent);
          if (fromConnector.length && toConnector.length) {
            const fromMembers = largestConnectedTileSubset([...new Set([...from.tileIndices, ...fromConnector, ...selected])], width, height, wraps);
            const toMembers = largestConnectedTileSubset([...new Set([...to.tileIndices, ...toConnector])], width, height, wraps);
            repaintHistory(from, [...fromConnector, ...selected]);
            repaintHistory(to, toConnector);
            from = { ...from, tileIndices: fromMembers, attributes: { ...from.attributes, outputEffectMatched: true } };
            to = { ...to, tileIndices: toMembers, attributes: { ...to.attributes, outputEffectMatched: true } };
            regionRebound.set(from.id, from);
            regionRebound.set(to.id, to);
          } else selected = undefined;
        } else selected = undefined;
      }
      if (selected?.length && path.kind === "ACTIVE_MARGIN") for (const index of selected) {
        elevations[index] = Math.max(1, elevations[index]) as 1 | 2;
        reliefValues[index] = Math.max(reliefValues[index], 0.62);
        tiles[index] = { ...tiles[index], elevation: Math.max(1, tiles[index].elevation) as 1 | 2 };
      }
      if (selected?.length) rebound.set(object.id, { ...object, tileIndices: selected, attributes: { ...object.attributes, outputEffectMatched: true } });
    }
    nativeNarrativeObjects = nativeNarrativeObjects.flatMap((object) => {
      if (regionRebound.has(object.id)) return [regionRebound.get(object.id)!];
      if (object.attributes?.role !== "ACTIVE_MARGIN" && object.attributes?.role !== "RIFT_MARGIN") return [object];
      return rebound.has(object.id) ? [rebound.get(object.id)!] : [object];
    });
  }
  if (graphPlan?.grammarFamily === "GRAPH_BROKEN_ISLAND_CHAINS") {
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id, object]));
    const replacement = new Map<string, GeographicObject>();
    const completedParentIds = new Set<string>();
    const finalLandComponents = connectedComponents(landMask, width, height, wraps);
    const principalChains = graphPlan.regions.filter((region) => region.role === "CHAIN");
    for (const chainRegion of principalChains) {
      const arcPlan = graphPlan.paths.find((path) => path.kind === "FOLLOWS_ARC"
        && graphPlan.regions.find((region) => region.id === path.from)?.parentId === chainRegion.id
        && graphPlan.regions.find((region) => region.id === path.to)?.parentId === chainRegion.id);
      const arcObject = arcPlan ? byId.get(`narrative-${arcPlan.id}`) : undefined;
      const chainObject = byId.get(`narrative-${chainRegion.id}`);
      const childPlans = graphPlan.regions.filter((region) => region.parentId === chainRegion.id && (region.role === "ANCHOR" || region.role === "GENERIC"));
      const childObjects = childPlans.map((child) => byId.get(`narrative-${child.id}`));
      if (!arcPlan || !arcObject || !chainObject || childPlans.length < 3 || childObjects.some((object) => !object)) continue;
      const orderedArc = [...arcObject.tileIndices];
      if (orderedArc.length < childPlans.length + 1 || !tileSetIsConnected(orderedArc, width, height, wraps)) continue;
      const from = childPlans.find((region) => region.id === arcPlan.from);
      const to = childPlans.find((region) => region.id === arcPlan.to);
      if (!from || !to) continue;
      const positionedChildren = childPlans.map((child) => {
        const object = byId.get(`narrative-${child.id}`)!;
        const placement = orderedArc.reduce((best, tile, position) => {
          const distance = Math.min(...object.tileIndices.map((member) => pointDistanceSquared(
            { x: tile % width + 0.5, y: Math.floor(tile / width) + 0.5 },
            { x: member % width + 0.5, y: Math.floor(member / width) + 0.5 },
            width,
            wraps,
          )));
          return distance < best.distance ? { position, distance } : best;
        }, { position: 0, distance: Number.POSITIVE_INFINITY });
        return { child, ...placement };
      }).sort((one, two) => one.position - two.position || one.child.id.localeCompare(two.child.id));
      const orderedChildren = positionedChildren.map(({ child }) => child);
      const positions = positionedChildren.map(({ position, distance }) => ({ position, distance }));
      if (new Set(positions.map((entry) => entry.position)).size < 3
        || positions.some((entry) => entry.distance > 4.1)
        || orderedChildren[0] !== from || orderedChildren.at(-1) !== to) continue;
      const chainTiles = [...new Set(childObjects.flatMap((object) => object!.tileIndices))].sort((one, two) => one - two);
      const childComponents = new Set(chainTiles.map((index) => finalLandComponents.ids[index]).filter((component) => component >= 0));
      const arcLandShare = orderedArc.filter((index) => landMask[index]).length / orderedArc.length;
      if (childComponents.size < 2 || arcLandShare > 0.65) continue;
      replacement.set(chainObject.id, { ...chainObject, tileIndices: chainTiles, attributes: { ...chainObject.attributes, latentParentArc: true } });
      replacement.set(arcObject.id, {
        ...arcObject,
        tileIndices: orderedArc,
        attributes: {
          ...arcObject.attributes,
          latentShelfTrace: true,
          landShare: orderedArc.filter((index) => landMask[index]).length / orderedArc.length,
          orderedChildPositions: positions.map((entry) => entry.position).join(","),
        },
      });
      orderedChildren.forEach((child) => {
        const childObject = byId.get(`narrative-${child.id}`)!;
        const membershipPlan = graphPlan.paths.find((path) => path.kind === "BELONGS_TO" && path.from === child.id && path.to === chainRegion.id);
        const membershipObject = membershipPlan ? byId.get(`narrative-${membershipPlan.id}`) : undefined;
        if (membershipObject) replacement.set(membershipObject.id, { ...membershipObject, tileIndices: [childObject.tileIndices[0]], attributes: { ...membershipObject.attributes, latentMembership: true } });
      });
      completedParentIds.add(chainRegion.id);
    }
    nativeNarrativeObjects = nativeNarrativeObjects.map((object) => replacement.get(object.id) ?? object);
    if (completedParentIds.size >= 3) {
      const retainedRegionIds = new Set(nativeNarrativeObjects.filter((object) => object.kind === "NARRATIVE_REGION").flatMap((object) => {
        const role = String(object.attributes?.role ?? "");
        const parent = String(object.attributes?.parent ?? "");
        if (role === "CHAIN") return completedParentIds.has(object.id.replace(/^narrative-/, "")) ? [object.id.replace(/^narrative-/, "")] : [];
        if (parent) return completedParentIds.has(parent) ? [object.id.replace(/^narrative-/, "")] : [];
        return [object.id.replace(/^narrative-/, "")];
      }));
      nativeNarrativeObjects = nativeNarrativeObjects.filter((object) => {
        if (object.kind === "NARRATIVE_REGION") return retainedRegionIds.has(object.id.replace(/^narrative-/, ""));
        return retainedRegionIds.has(String(object.attributes?.from ?? "")) && retainedRegionIds.has(String(object.attributes?.to ?? ""));
      });
    }
  }
  if (graphPlan?.grammarFamily === "GRAPH_GREAT_PENINSULAS"
    && graphPlan.appliedRelaxations.some((step) => step.id === "relax-complete-peninsulas")) {
    const byId = new Map(nativeNarrativeObjects.map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const minimumHeadArea = Math.max(5, Math.round(Math.sqrt(tiles.length) / 3));
    const validHeads = new Set<string>();
    const validNecks = new Set<string>();
    const passable = (index: number) => tiles[index]?.terrain >= 2 && tiles[index].elevation < 2 && tiles[index].wonder === 255;
    for (const neck of nativeNarrativeObjects.filter((object) => object.attributes?.role === "PENINSULA_NECK")) {
      const from = byId.get(String(neck.attributes?.from ?? ""));
      const to = byId.get(String(neck.attributes?.to ?? ""));
      const head = from?.attributes?.role === "PENINSULA_PROVINCE" ? from : to?.attributes?.role === "PENINSULA_PROVINCE" ? to : undefined;
      const backbone = from?.attributes?.role === "CONTINENTAL_BACKBONE" ? from : to?.attributes?.role === "CONTINENTAL_BACKBONE" ? to : undefined;
      if (!head || !backbone || head.tileIndices.filter(passable).length < minimumHeadArea
        || neck.tileIndices.some((index) => !passable(index))
        || peninsulaWaterFlankedShare(neck.tileIndices, landMask, width, height, wraps) < 0.5) continue;
      const removed = new Set(neck.tileIndices);
      const queue = head.tileIndices.filter((index) => passable(index) && !removed.has(index));
      const reached = new Set(queue);
      for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of hexNeighbors(queue[cursor], width, height, wraps)) {
        if (removed.has(next) || reached.has(next) || !passable(next)) continue;
        reached.add(next);
        queue.push(next);
      }
      if (backbone.tileIndices.some((index) => reached.has(index))) continue;
      validHeads.add(head.id);
      validNecks.add(neck.id);
    }
    if (validHeads.size >= 3) {
      const target = Math.max(3, graphPlan.contract.topology.primarySystems[0]);
      const retainedHeads = new Set([...validHeads].sort((one, two) => (byId.get(two.replace(/^narrative-/, ""))?.tileIndices.length ?? 0)
        - (byId.get(one.replace(/^narrative-/, ""))?.tileIndices.length ?? 0) || one.localeCompare(two)).slice(0, target));
      const retainedNecks = new Set([...validNecks].filter((id) => {
        const neck = nativeNarrativeObjects.find((object) => object.id === id);
        return neck && [String(neck.attributes?.from ?? ""), String(neck.attributes?.to ?? "")].some((endpoint) => retainedHeads.has(`narrative-${endpoint}`));
      }));
      nativeNarrativeObjects = nativeNarrativeObjects.filter((object) => {
      if (object.attributes?.role === "PENINSULA_PROVINCE") return validHeads.has(object.id);
      if (object.attributes?.role === "PENINSULA_NECK") return retainedNecks.has(object.id);
      return true;
      }).filter((object) => object.attributes?.role !== "PENINSULA_PROVINCE" || retainedHeads.has(object.id));
    }
  }
  const lateProtectedWater = new Set<number>(protectedWater);
  const lateProtectedLand = new Set<number>(protectedLand);
  const essentialNativeWater = new Set<number>();
  for (const object of nativeNarrativeObjects) {
    const effect = String(object.attributes?.effect ?? "");
    if (effect === "WATER" || effect === "WATER_PATH") for (const index of object.tileIndices) {
      lateProtectedWater.add(index);
      essentialNativeWater.add(index);
    }
    else if (effect === "LAND" || effect === "LAND_PATH" || effect === "RIDGE" || effect === "RIDGE_PATH") {
      for (const index of object.tileIndices) lateProtectedLand.add(index);
    }
  }
  if (lateProtectedWater.size > targetWater) {
    const releasable = [...lateProtectedWater].filter((index) => !essentialNativeWater.has(index) && constraints?.topology[index] !== 0)
      .sort((one, two) => hexNeighbors(two, width, height, wraps).filter((index) => landMask[index]).length
        - hexNeighbors(one, width, height, wraps).filter((index) => landMask[index]).length || one - two);
    for (const index of releasable) {
      if (lateProtectedWater.size <= targetWater) break;
      lateProtectedWater.delete(index);
    }
  }
  reconcileWaterMask(landMask, targetWater, subregions, subregionCount, width, height, wraps, seed + 4001, lateProtectedWater, lateProtectedLand);
  let finalTopologySurfaceCorrections = 0;
  for (let index = 0; index < tiles.length; index += 1) {
    if (landMask[index] && tiles[index].terrain < 2) {
      tiles[index] = {
        ...tiles[index],
        terrain: chooseTerrain(temperatures[index], moistures[index], options.regionContrast, options.dominantTerrains),
        elevation: elevations[index],
        feature: 255,
      };
      finalTopologySurfaceCorrections += 1;
    } else if (!landMask[index] && tiles[index].terrain >= 2) {
      const coastal = hexNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
      elevations[index] = 0;
      tiles[index] = { ...tiles[index], terrain: coastal ? 1 : 0, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0 };
      finalTopologySurfaceCorrections += 1;
    }
  }
  // A relationship is final evidence only when both exact authored endpoint
  // regions survived the native realization. Keeping an orphaned path would
  // fabricate causality: it could carry the right label and medium while one
  // of the geographic things it claims to relate does not exist at all.
  const realizedRegionIds = new Set(nativeNarrativeObjects
    .filter((object) => object.kind === "NARRATIVE_REGION")
    .map((object) => object.id.replace(/^narrative-/, "")));
  nativeNarrativeObjects = nativeNarrativeObjects.filter((object) => {
    if (object.kind === "NARRATIVE_REGION") return true;
    const from = String(object.attributes?.from ?? "");
    const to = String(object.attributes?.to ?? "");
    return from !== to && realizedRegionIds.has(from) && realizedRegionIds.has(to);
  });
  const nativeObjectIds = new Set(nativeNarrativeObjects.map((object) => object.id));
  const retainedNarrativeEvidence = narrative ? {
    ...narrative.evidence,
    causalObjects: narrative.evidence.causalObjects.map((cause) => {
      const nativeObjectId = `narrative-${cause.id}`;
      return { ...cause, nativeObjectId, retained: nativeObjectIds.has(nativeObjectId) };
    }),
  } : undefined;
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
    objects: [...subregionObjects, ...polygonObjects, ...superpolygons, ...astronomyObjects, ...continents, ...reportedBasins, ...rifts, ...climateObjects, ...collectionObjects, ...identities, ...nativeNarrativeObjects],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: {
      ...diagnostics,
      scaleEccentricPolygonTarget: polygonCount,
      scaleEccentricSubregionTarget: subregionCount,
      superpolygons: superpolygons.length + astronomyObjects.length,
      inlandSeas: options.preset === "SHATTERED_BASINS"
        ? nativeNarrativeObjects.filter((object) => object.attributes?.role === "GREAT_INLAND_SEA" && object.tileIndices.length >= area * 0.08).length
        : basins.filter((object) => object.kind === "INLAND_SEA").length,
      lakes: basins.filter((object) => object.kind === "LAKE").length,
      rifts: rifts.length,
      narrativeTopologyInfluences: narrative?.evidence.diagnostics.topologyInfluences ?? 0,
      narrativeReliefInfluences: narrative?.evidence.diagnostics.reliefInfluences ?? 0,
      narrativeClimateInfluences: narrative?.evidence.diagnostics.climateInfluences ?? 0,
      narrativeHydrologyInfluences: narrative?.evidence.diagnostics.hydrologyInfluences ?? 0,
      nativeGraphPreTopologyReservations: (graphPlan?.regions.length ?? 0) + (graphPlan?.paths.length ?? 0),
      nativeGraphRegions: narrativeReservations.regionPolygons.size,
      nativeGraphPaths: narrativeReservations.pathPolygons.size,
      nativeGraphEdgeLandPolygons: [...narrativeReservations.edgeLandPolygons].filter((polygon) => narrativeReservations.forcedLand.has(polygon)).length,
      nativeGraphEdgeLandTiles: nativeEdgeLand.size,
      nativeGraphRelaxedLandTiles: nativeProtectedLandBeforeBudget - protectedLand.size,
      nativeGraphPlannedLandPolygons: narrativeReservationBudget.plannedLand,
      nativeGraphPlannedWaterPolygons: narrativeReservationBudget.plannedWater,
      nativeGraphForcedLandPolygons: narrativeReservations.forcedLand.size,
      nativeGraphForcedWaterPolygons: narrativeReservations.forcedWater.size,
      nativeGraphReservedLandTiles: narrativeReservationBudget.landTiles,
      nativeGraphReservedWaterTiles: narrativeReservationBudget.waterTiles,
      nativeGraphRelaxedLandPolygons: narrativeReservationBudget.relaxedLand,
      nativeGraphRelaxedWaterPolygons: narrativeReservationBudget.relaxedWater,
      nativeGraphSemanticReservations: narrativeReservations.semanticReservations,
      nativeGraphDetectorStraitTiles: nativeNarrowCrossings.straitTiles.length,
      nativeGraphDetectorCanalTiles: nativeNarrowCrossings.canalTiles.length,
      nativeGraphCrossingTopologyAdjusted: Number(nativeNarrowCrossings.topologyAdjusted),
      nativeGraphPeninsulaHeads: nativePeninsulaAttachments.realizedHeads,
      nativeGraphPeninsulaNecks: nativePeninsulaAttachments.realizedNecks,
      nativeGraphPeninsulaTopologyAdjusted: Number(nativePeninsulaAttachments.topologyAdjusted),
      nativeGraphDominantContinentConnected: Number(nativeDominantContinentConnected),
      nativeGraphParentSystemsSeparated: Number(nativeParentSystemSeparation),
      nativeGraphParentArcsRealized: nativeParentArcsRealized,
      nativeGraphRiftCellsSeparated: Number(nativeRiftCellSeparation),
      nativeGraphHistoriesSeparated: Number(nativeHistorySeparation),
      nativeGraphActiveMarginsRealized: nativeActiveMarginsRealized,
      nativeGraphEcologicalRibbonTiles: nativeEcologicalTransect.ribbonTiles.length,
      nativeGraphEcologicalStagesRealized: nativeEcologicalTransect.realizedStages,
      nativeGraphEcologicalTransitionsRealized: nativeEcologicalTransect.realizedTransitions,
      nativeGraphEcologicalTopologyAdjusted: Number(nativeEcologicalTransect.topologyAdjusted),
      nativeGraphBoundObjects: nativeNarrativeObjects.length,
      nativeGraphFinalTopologySurfaceCorrections: finalTopologySurfaceCorrections,
    },
    narrativeAdapter: retainedNarrativeEvidence,
  };

  return { landMask, reliefValues, temperatures, moistures, elevations, riverGuidance, tiles, structure, diagnostics };
}
