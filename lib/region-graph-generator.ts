import type { Civ5Tile } from "./civ5-map.ts";
import { poleProximity } from "./climate-projection.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";

type Point = { x: number; y: number };
type Edge = { one: number; two: number; coastal: boolean };

export type RegionGraphDiagnostics = {
  subregions: number;
  polygons: number;
  climateRegions: number;
  continents: number;
  oceanBasins: number;
  mountainRanges: number;
};

export type RegionGraphGeography = {
  landMask: boolean[];
  reliefValues: number[];
  temperatures: number[];
  moistures: number[];
  elevations: number[];
  tiles: Civ5Tile[];
  structure: GenerationStructure;
  diagnostics: RegionGraphDiagnostics;
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

function pointDistance(one: Point, two: Point, width: number, height: number, wraps: boolean) {
  let dx = Math.abs(one.x - two.x);
  if (wraps) dx = Math.min(dx, width - dx);
  const dy = Math.abs(one.y - two.y) * 0.866;
  return Math.hypot(dx, dy);
}

function farthestPoints(count: number, width: number, height: number, wraps: boolean, random: () => number) {
  const points: Point[] = [{ x: random() * width, y: random() * height }];
  while (points.length < count) {
    let best = { x: random() * width, y: random() * height };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const candidate = { x: random() * width, y: random() * height };
      const distance = Math.min(...points.map((point) => pointDistance(point, candidate, width, height, wraps)));
      if (distance > bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    points.push(best);
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
        const distance = pointDistance(location, points[point], width, height, wraps);
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

function relaxPoints(points: Point[], assignments: Int32Array, width: number, height: number, wraps: boolean) {
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
    const circularX = (Math.atan2(sum.sin, sum.cos) / (Math.PI * 2) * width + width) % width;
    return { x: wraps ? circularX : sum.x / sum.count, y: sum.y / sum.count };
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
    }
  }
  return adjacency;
}

function graphPartition(adjacency: Array<Set<number>>, centers: Point[], count: number, width: number, height: number, wraps: boolean, random: () => number, allowed?: ReadonlySet<number>) {
  const available = centers.flatMap((_center, index) => !allowed || allowed.has(index) ? [index] : []);
  if (!available.length) return new Int32Array(centers.length).fill(-1);
  const seeds: number[] = [available[Math.floor(random() * available.length)]];
  while (seeds.length < Math.min(count, available.length)) {
    let best = available[0];
    let bestDistance = -1;
    for (const candidate of available) {
      if (seeds.includes(candidate)) continue;
      const distance = Math.min(...seeds.map((seed) => pointDistance(centers[candidate], centers[seed], width, height, wraps)));
      if (distance > bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    seeds.push(best);
  }
  const owners = new Int32Array(centers.length);
  owners.fill(-1);
  const queue = [...seeds];
  seeds.forEach((seed, owner) => { owners[seed] = owner; });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const neighbors = [...adjacency[current]].sort((one, two) => hashNoise(one, current, seeds.length) - hashNoise(two, current, seeds.length));
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
      if (other >= 0 && other !== owner) adjacency[owner].add(other);
    }
  }
  return adjacency;
}

function growGraph(adjacency: Array<Set<number>>, seeds: number[], areas: number[], targetArea: number, seed: number) {
  const selected = new Set<number>();
  const frontier = [...seeds];
  let area = 0;
  while (frontier.length && area < targetArea) {
    frontier.sort((one, two) => hashNoise(one, selected.size, seed) - hashNoise(two, selected.size, seed));
    const current = frontier.shift()!;
    if (selected.has(current)) continue;
    selected.add(current);
    area += areas[current];
    for (const neighbor of adjacency[current]) if (!selected.has(neighbor)) frontier.push(neighbor);
  }
  return selected;
}

function connectedComponents(mask: boolean[], width: number, height: number, wraps: boolean) {
  const ids = new Int32Array(mask.length);
  ids.fill(-1);
  let count = 0;
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
    count += 1;
  }
  return { ids, count };
}

function exactWaterMask(mask: boolean[], targetWater: number, width: number, height: number, wraps: boolean, seed: number) {
  let water = mask.reduce((count, land) => count + (land ? 0 : 1), 0);
  while (water !== targetWater) {
    const addWater = water < targetWater;
    const candidates = mask.flatMap((land, index) => {
      if (addWater !== land) return [];
      const boundary = hexNeighbors(index, width, height, wraps).some((neighbor) => mask[neighbor] !== land);
      return boundary ? [index] : [];
    });
    if (!candidates.length) break;
    candidates.sort((one, two) => hashNoise(one % width, Math.floor(one / width), seed) - hashNoise(two % width, Math.floor(two / width), seed));
    const change = Math.min(Math.abs(targetWater - water), candidates.length);
    for (let index = 0; index < change; index += 1) mask[candidates[index]] = !addWater;
    water += addWater ? change : -change;
  }
  return mask;
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

function presetTopology(options: MapGenerationOptions) {
  if (options.preset === "PANGAEA") return { landSeeds: 1, basinCount: 1, growLand: true, rifts: 0 };
  if (options.preset === "ARCHIPELAGO") return { landSeeds: 18, basinCount: 2, growLand: true, rifts: 0 };
  if (options.preset === "SHATTERED_BASINS") return { landSeeds: 10, basinCount: Math.max(3, options.oceanBasins), growLand: true, rifts: 2 };
  if (options.preset === "RIFT_REALMS") return { landSeeds: 7, basinCount: Math.max(2, options.oceanBasins), growLand: true, rifts: 2 };
  if (options.preset === "GREAT_WATERSHEDS" || options.preset === "INLAND_SEAS") return { landSeeds: 1, basinCount: Math.max(2, options.oceanBasins), growLand: false, rifts: 0 };
  if (options.preset === "EARTHSEA") return { landSeeds: 11, basinCount: 3, growLand: true, rifts: 1 };
  if (options.preset === "LABYRINTH") return { landSeeds: 8, basinCount: 4, growLand: false, rifts: 2 };
  if (options.preset === "MYTHIC_REGIONS" || options.preset === "WILD_REGIONS") return { landSeeds: 6, basinCount: Math.max(2, options.oceanBasins), growLand: true, rifts: 1 };
  return { landSeeds: options.preset === "TECTONIC_CONTINENTS" ? 4 : 3, basinCount: options.oceanBasins, growLand: true, rifts: 0 };
}

export function generateRegionGraphGeography(
  options: MapGenerationOptions,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  random: () => number,
): RegionGraphGeography {
  const area = width * height;
  const polygonTargets = { LOW: 70, FAIR: 120, HIGH: 180, VERY_HIGH: 250 } as const;
  const polygonCount = Math.max(12, Math.min(Math.floor(area / 7), polygonTargets[options.granularity]));
  const subregionCount = Math.max(polygonCount, Math.min(Math.floor(area / 3), Math.round(polygonCount * 1.85)));
  let subregionCenters = farthestPoints(subregionCount, width, height, wraps, random);
  let subregions = assignHexes(subregionCenters, width, height, wraps);
  for (let relaxation = 0; relaxation < 2; relaxation += 1) {
    subregionCenters = relaxPoints(subregionCenters, subregions, width, height, wraps);
    subregions = assignHexes(subregionCenters, width, height, wraps);
  }
  const subregionAdjacency = buildAdjacency(subregions, subregionCount, width, height, wraps);
  const subregionToPolygon = graphPartition(subregionAdjacency, subregionCenters, polygonCount, width, height, wraps, random);
  const polygonCenters = aggregateCenters(subregionToPolygon, subregionCenters, polygonCount, width, wraps);
  const polygonAdjacency = aggregateAdjacency(subregionAdjacency, subregionToPolygon, polygonCount);
  const hexPolygons = new Int32Array(area);
  const polygonAreas = new Array<number>(polygonCount).fill(0);
  for (let index = 0; index < area; index += 1) {
    const polygon = subregionToPolygon[subregions[index]];
    hexPolygons[index] = polygon;
    polygonAreas[polygon] += 1;
  }

  const topology = presetTopology(options);
  const targetWater = Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const targetLand = area - targetWater;
  let polygonLand = new Array<boolean>(polygonCount).fill(!topology.growLand);
  if (targetWater === 0) {
    polygonLand.fill(true);
  } else if (topology.growLand) {
    const landSeeds = farthestPoints(Math.min(topology.landSeeds, polygonCount), width, height, wraps, random)
      .map((point) => polygonCenters.reduce((best, center, index) => pointDistance(point, center, width, height, wraps) < pointDistance(point, polygonCenters[best], width, height, wraps) ? index : best, 0));
    const land = growGraph(polygonAdjacency, [...new Set(landSeeds)], polygonAreas, targetLand, seed + 101);
    polygonLand = polygonLand.map((_value, index) => land.has(index));
  } else {
    const candidates = polygonCenters.map((_center, index) => index);
    const boundary = candidates.filter((index) => !wraps && (polygonCenters[index].x < width * 0.08 || polygonCenters[index].x > width * 0.92 || polygonCenters[index].y < height * 0.08 || polygonCenters[index].y > height * 0.92));
    const basinSeeds: number[] = [];
    const pool = boundary.length ? boundary : candidates;
    basinSeeds.push(pool[Math.floor(random() * pool.length)]);
    while (basinSeeds.length < Math.min(topology.basinCount, pool.length)) {
      basinSeeds.push(pool.reduce((best, candidate) => {
        if (basinSeeds.includes(candidate)) return best;
        const distance = Math.min(...basinSeeds.map((other) => pointDistance(polygonCenters[candidate], polygonCenters[other], width, height, wraps)));
        const bestDistance = Math.min(...basinSeeds.map((other) => pointDistance(polygonCenters[best], polygonCenters[other], width, height, wraps)));
        return distance > bestDistance ? candidate : best;
      }, pool[0]));
    }
    const water = growGraph(polygonAdjacency, basinSeeds, polygonAreas, targetWater, seed + 211);
    polygonLand = polygonLand.map((_value, index) => !water.has(index));
  }

  const riftPolygons = new Set<number>();
  for (let rift = 0; rift < topology.rifts && targetWater > 0; rift += 1) {
    const center = (rift + 1) / (topology.rifts + 1);
    for (let polygon = 0; polygon < polygonCount; polygon += 1) {
      const normalizedX = polygonCenters[polygon].x / width;
      const normalizedY = polygonCenters[polygon].y / height;
      const line = center + Math.sin((normalizedY * 2.4 + rift) * Math.PI) * 0.055;
      if (Math.abs(normalizedX - line) < 0.022 + (options.granularity === "VERY_HIGH" ? 0.008 : 0)) { polygonLand[polygon] = false; riftPolygons.add(polygon); }
    }
  }
  if (!options.landAtPoles && targetWater > 0) {
    for (let polygon = 0; polygon < polygonCount; polygon += 1) {
      const center = polygonCenters[polygon];
      if (poleProximity(center.x, center.y, width, height, options.projectionType) > 0.93) polygonLand[polygon] = false;
    }
  }

  const landMask = Array.from(hexPolygons, (polygon) => polygonLand[polygon]);
  exactWaterMask(landMask, targetWater, width, height, wraps, seed + 307);
  const { ids: continentIds, count: continentCount } = connectedComponents(landMask, width, height, wraps);
  const waterComponents = connectedComponents(landMask.map((land) => !land), width, height, wraps).count;

  const landPolygons = new Set<number>();
  for (let index = 0; index < area; index += 1) if (landMask[index]) landPolygons.add(hexPolygons[index]);
  const desiredRegions = Math.max(1, Math.ceil(landPolygons.size / (options.regionContrast === "EXTREME" ? 3 : options.regionContrast === "BLENDED" ? 7 : 5)));
  const polygonRegions = graphPartition(polygonAdjacency, polygonCenters, desiredRegions, width, height, wraps, random, landPolygons);
  const regionCenters = aggregateCenters(polygonRegions, polygonCenters, desiredRegions, width, wraps);
  const regionClimate = regionCenters.map((center, index) => {
    const latitude = poleProximity(center.x, center.y, width, height, options.projectionType);
    const realism = options.climateRealism;
    const contrast = options.regionContrast === "EXTREME" ? 0.48 : options.regionContrast === "BLENDED" ? 0.16 : 0.3;
    const temperature = realism ? 0.12 + Math.cos(latitude * Math.PI / 2) * 0.78 + (random() - 0.5) * contrast : 0.1 + random() * 0.82;
    const rainfall = realism ? 0.5 + Math.sin((latitude + 0.08) * Math.PI * 2) * 0.16 + (random() - 0.5) * contrast : 0.08 + random() * 0.86;
    return { temperature: clamp(temperature + (options.climate === "HOT" ? 0.14 : options.climate === "COOL" ? -0.14 : 0)), rainfall: clamp(rainfall + (options.rainfall === "WET" ? 0.16 : options.rainfall === "ARID" ? -0.16 : 0)), index };
  });

  const edges: Edge[] = [];
  for (let polygon = 0; polygon < polygonCount; polygon += 1) {
    for (const other of polygonAdjacency[polygon]) {
      if (other <= polygon || !polygonLand[polygon] && !polygonLand[other]) continue;
      edges.push({ one: polygon, two: other, coastal: polygonLand[polygon] !== polygonLand[other] });
    }
  }
  const desiredRangeEdges = Math.max(1, Math.round(edges.length * clamp(options.mountainPercent / 100, 0, 0.38) * 1.7));
  const selectedEdges = new Set<string>();
  const edgeKey = (one: number, two: number) => one < two ? `${one}:${two}` : `${two}:${one}`;
  const edgePool = [...edges];
  let mountainRanges = 0;
  while (selectedEdges.size < desiredRangeEdges && edgePool.length) {
    edgePool.sort((one, two) => {
      const onePreference = one.coastal ? options.coastalRangePercent / 100 : 1 - options.coastalRangePercent / 100;
      const twoPreference = two.coastal ? options.coastalRangePercent / 100 : 1 - options.coastalRangePercent / 100;
      return twoPreference + hashNoise(two.one, two.two, seed + 401) * 0.6 - onePreference - hashNoise(one.one, one.two, seed + 401) * 0.6;
    });
    let edge = edgePool.shift()!;
    if (selectedEdges.has(edgeKey(edge.one, edge.two))) continue;
    mountainRanges += 1;
    const length = 2 + Math.floor(random() * 5);
    for (let step = 0; step < length && edge && selectedEdges.size < desiredRangeEdges; step += 1) {
      selectedEdges.add(edgeKey(edge.one, edge.two));
      const connected = edgePool.filter((candidate) => candidate.one === edge.one || candidate.one === edge.two || candidate.two === edge.one || candidate.two === edge.two);
      if (!connected.length) break;
      edge = connected[Math.floor(random() * connected.length)];
    }
  }

  const mountainCore = new Uint8Array(area);
  const boundaryDistance = new Uint8Array(area);
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const polygon = hexPolygons[index];
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      const other = hexPolygons[neighbor];
      if (other !== polygon && selectedEdges.has(edgeKey(polygon, other))) {
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
  const temperatures = new Array<number>(area);
  const moistures = new Array<number>(area);
  for (let index = 0; index < area; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const polygon = hexPolygons[index];
    const region = polygonRegions[polygon];
    const climate = region >= 0 ? regionClimate[region] : { temperature: 0.5, rainfall: 0.5 };
    const detail = valueNoise(x + 101, y + 211, 5.5, seed + 503) - 0.5;
    temperatures[index] = clamp(climate.temperature + detail * (options.regionContrast === "EXTREME" ? 0.18 : 0.1));
    moistures[index] = clamp(climate.rainfall + (valueNoise(x + 419, y + 73, 7, seed + 601) - 0.5) * 0.2);
    reliefValues[index] = valueNoise(x + 811, y + 307, 8.5, seed + 701) * 0.5 + mountainCore[index] * 0.82 + boundaryDistance[index] * 0.28;
  }
  const landRelief = reliefValues.filter((_value, index) => landMask[index]);
  const effectiveMountainPercent = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" || options.style === "BRUTAL" ? Math.max(18, options.mountainPercent) : options.mountainPercent;
  const hillPercent = options.worldAge === "YOUNG" ? 27 : options.worldAge === "OLD" ? 12 : 19;
  const mountainThreshold = effectiveMountainPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - clamp(effectiveMountainPercent / 100, 0, 0.42));
  const hillThreshold = quantile(landRelief, 1 - clamp((effectiveMountainPercent + hillPercent) / 100, 0, 0.72));
  const elevations = landMask.map((land, index) => land ? reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0 : 0);

  if (options.climateRealism) {
    for (let y = 0; y < height; y += 1) {
      let airborneMoisture = clamp(0.56 + (valueNoise(0, y + 43, 8, seed + 809) - 0.5) * 0.16);
      let upwindRelief = reliefValues[y * width];
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const regionalMoisture = moistures[index];
        if (!landMask[index]) {
          airborneMoisture += (0.86 - airborneMoisture) * 0.34;
          moistures[index] = regionalMoisture;
          upwindRelief = reliefValues[index];
          continue;
        }
        airborneMoisture += (regionalMoisture - airborneMoisture) * 0.1;
        const rise = Math.max(0, reliefValues[index] - upwindRelief);
        const mountainLift = elevations[index] === 2 ? 0.075 : elevations[index] === 1 ? 0.02 : 0;
        const precipitation = rise * 0.72 + mountainLift;
        moistures[index] = clamp(regionalMoisture * 0.36 + airborneMoisture * 0.64 + precipitation * 0.78);
        airborneMoisture = clamp(airborneMoisture - precipitation * 0.84);
        upwindRelief = reliefValues[index];
      }
    }
  }
  if (options.modifier === "DOOMSDAY") {
    for (let index = 0; index < moistures.length; index += 1) moistures[index] = clamp(moistures[index] - 0.14);
  }

  const tiles = landMask.map<Civ5Tile>((land, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const adjacentLand = hexNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    let terrain = land ? chooseTerrain(temperatures[index], moistures[index], options.regionContrast, options.dominantTerrains) : adjacentLand ? 1 : 0;
    let feature = 255;
    if (!land && poleProximity(x, y, width, height, options.projectionType) > 0.86 && random() > 0.38) feature = 3;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && temperatures[index] > 0.72 && moistures[index] > 0.7) feature = 1;
    else if (land && elevations[index] === 0 && terrain === 2 && moistures[index] > 0.83) feature = 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && moistures[index] > 0.6) feature = 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.22 && random() > 0.96) feature = 4;
    if (!land) terrain = adjacentLand ? 1 : 0;
    return {
      terrain,
      resource: 255,
      feature,
      river: 0,
      elevation: elevations[index],
      continent: land ? continentIds[index] + 1 : 0,
      wonder: 255,
      resourceAmount: 0,
    };
  });

  const climateAssignments = new Int32Array(area).fill(-1);
  for (let index = 0; index < area; index += 1) if (landMask[index]) climateAssignments[index] = polygonRegions[hexPolygons[index]];
  const subregionObjects = objectsFromAssignments("SUBREGION", subregions, subregionCount, "Subregion");
  const polygonObjects = objectsFromAssignments("POLYGON", hexPolygons, polygonCount, "Polygon").map((object, index) => ({
    ...object,
    neighbors: [...polygonAdjacency[index]].map((neighbor) => `polygon-${neighbor + 1}`),
    attributes: { land: Boolean(polygonLand[index]) },
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
  const superpolygons: GeographicObject[] = [...continents, ...basins].map((object, index) => ({ id: `superpolygon-${index + 1}`, name: `Superpolygon ${index + 1}`, kind: "SUPERPOLYGON", tileIndices: [...object.tileIndices], attributes: { geography: object.kind, member: object.id } }));
  const rifts = connectedTileObjects("RIFT", Array.from(hexPolygons, (polygon, index) => riftPolygons.has(polygon) && !landMask[index]), width, height, wraps, "Rift");
  const climateObjects = objectsFromAssignments("CLIMATE_REGION", climateAssignments, desiredRegions, "Climate Province");
  const ranges = connectedLinearFeatures(Array.from(mountainCore, (value, index) => Boolean(value) && landMask[index]), width, height, wraps, "Mountain Range");
  const structure: GenerationStructure = {
    engine: "REGION_GRAPH",
    objects: [...subregionObjects, ...polygonObjects, ...superpolygons, ...continents, ...basins, ...rifts, ...climateObjects],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: { subregions: subregionObjects.length, polygons: polygonObjects.length, superpolygons: superpolygons.length, climateRegions: climateObjects.length, continents: continents.length, oceanBasins: basins.filter((object) => object.kind === "OCEAN_BASIN").length, inlandSeas: basins.filter((object) => object.kind === "INLAND_SEA").length, lakes: basins.filter((object) => object.kind === "LAKE").length, rifts: rifts.length, mountainRanges: ranges.length },
  };

  return {
    landMask,
    reliefValues,
    temperatures,
    moistures,
    elevations,
    tiles,
    structure,
    diagnostics: {
      subregions: subregionCount,
      polygons: polygonCount,
      climateRegions: desiredRegions,
      continents: continentCount,
      oceanBasins: waterComponents,
      mountainRanges,
    },
  };
}
