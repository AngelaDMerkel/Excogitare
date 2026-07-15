import type { Civ5Tile } from "./civ5-map.ts";
import { poleProximity } from "./climate-projection.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";

type Point = { x: number; y: number };
type PolygonEdge = { one: number; two: number; coastal: boolean; contrast: number };
type ClimateAnchor = { temperature: number; moisture: number };
type ClimatePalette = { temperature: number; moisture: number; anchors: ClimateAnchor[] };
type LandmassGrammar = "CONTINENTS" | "ENCIRCLING" | "PANGAEA" | "RIFTED" | "ARCHIPELAGO" | "LONELY_OCEANS" | "PENINSULA";

type TopologyProfile = {
  grammar: LandmassGrammar;
  landSeeds: number;
  waterSeeds: number;
  rifts: number;
  astronomyBlobs: number;
  islandPressure: number;
};

export type RegionGraphDiagnostics = {
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

function pointDistanceSquared(one: Point, two: Point, width: number, wraps: boolean) {
  let dx = Math.abs(one.x - two.x);
  if (wraps) dx = Math.min(dx, width - dx);
  const dy = Math.abs(one.y - two.y) * 0.866;
  return dx * dx + dy * dy;
}

function scatteredPoints(count: number, width: number, height: number, random: () => number, fantasticality: MapGenerationOptions["fantasticality"]) {
  const columns = Math.max(1, Math.round(Math.sqrt(count * width / Math.max(1, height))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const jitter = fantasticality === "UNBOUND" ? 1.35 : fantasticality === "MYTHIC" ? 1.05 : 0.72;
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

function growGraph(adjacency: Array<Set<number>>, seeds: number[], areas: number[], targetArea: number, seed: number, blocked = new Set<number>()) {
  const selected = new Set<number>();
  const frontier = [...new Set(seeds.filter((value) => !blocked.has(value)))];
  let area = 0;
  while (frontier.length && area < targetArea) {
    frontier.sort((one, two) => hashNoise(one, selected.size, seed) - hashNoise(two, selected.size, seed));
    const current = frontier.shift()!;
    if (selected.has(current) || blocked.has(current)) continue;
    selected.add(current);
    area += areas[current];
    for (const neighbor of adjacency[current]) if (!selected.has(neighbor) && !blocked.has(neighbor)) frontier.push(neighbor);
  }
  return selected;
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

function closestPolygon(centers: Point[], point: Point, width: number, wraps: boolean, allowed?: (index: number) => boolean) {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centers.length; index += 1) {
    if (allowed && !allowed(index)) continue;
    const next = pointDistanceSquared(centers[index], point, width, wraps);
    if (next < distance) {
      best = index;
      distance = next;
    }
  }
  return best;
}

function graphPath(adjacency: Array<Set<number>>, centers: Point[], start: number, end: number, width: number, targetX: number, seed: number) {
  const costs = new Float64Array(centers.length);
  costs.fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(centers.length);
  parents.fill(-1);
  costs[start] = 0;
  const open = [start];
  while (open.length) {
    open.sort((one, two) => costs[one] - costs[two]);
    const current = open.shift()!;
    if (current === end) break;
    for (const neighbor of adjacency[current]) {
      let dx = Math.abs(centers[neighbor].x - targetX);
      dx = Math.min(dx, width - dx);
      const candidate = costs[current] + 1 + dx / Math.max(8, width) * 1.9 + hashNoise(neighbor, current, seed) * 0.34;
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

function topologyForPreset(options: MapGenerationOptions): TopologyProfile {
  if (options.preset === "ENCIRCLING_LANDS" || options.preset === "GREAT_WATERSHEDS" || options.preset === "INLAND_SEAS") return { grammar: "ENCIRCLING", landSeeds: 1, waterSeeds: Math.max(2, options.oceanBasins), rifts: 0, astronomyBlobs: 0, islandPressure: 2 };
  if (options.preset === "ASTRAL_PANGAEA" || options.preset === "PANGAEA") return { grammar: "PANGAEA", landSeeds: 1, waterSeeds: 1, rifts: 1, astronomyBlobs: 1, islandPressure: 3 };
  if (options.preset === "RIFTWORLD" || options.preset === "RIFT_REALMS" || options.preset === "SHATTERED_BASINS") return { grammar: "RIFTED", landSeeds: 5, waterSeeds: Math.max(2, options.oceanBasins), rifts: options.preset === "RIFTWORLD" ? 3 : 2, astronomyBlobs: 2, islandPressure: 7 };
  if (options.preset === "LONELY_OCEANS") return { grammar: "LONELY_OCEANS", landSeeds: 18, waterSeeds: 4, rifts: 1, astronomyBlobs: 3, islandPressure: 18 };
  if (options.preset === "PENINSULA_REALM" || options.preset === "LABYRINTH") return { grammar: "PENINSULA", landSeeds: 1, waterSeeds: Math.max(3, options.oceanBasins), rifts: 1, astronomyBlobs: 1, islandPressure: 4 };
  if (options.preset === "SHATTERED_ARCHIPELAGO" || options.preset === "ARCHIPELAGO") return { grammar: "ARCHIPELAGO", landSeeds: 22, waterSeeds: 3, rifts: 1, astronomyBlobs: 2, islandPressure: 16 };
  if (options.preset === "EARTHSEA") return { grammar: "ARCHIPELAGO", landSeeds: 13, waterSeeds: 3, rifts: 1, astronomyBlobs: 1, islandPressure: 11 };
  if (options.preset === "MYTHIC_REGIONS" || options.preset === "WILD_REGIONS") return { grammar: "CONTINENTS", landSeeds: 7, waterSeeds: Math.max(2, options.oceanBasins), rifts: 1, astronomyBlobs: 1, islandPressure: 8 };
  return { grammar: "CONTINENTS", landSeeds: options.preset === "TECTONIC_CONTINENTS" ? 4 : 3, waterSeeds: Math.max(1, options.oceanBasins), rifts: 0, astronomyBlobs: 0, islandPressure: 4 };
}

function createLandPolygons(profile: TopologyProfile, adjacency: Array<Set<number>>, centers: Point[], areas: number[], targetLand: number, width: number, height: number, wraps: boolean, random: () => number, seed: number) {
  const count = centers.length;
  if (targetLand >= areas.reduce((sum, area) => sum + area, 0)) return new Array<boolean>(count).fill(true);
  const all = centers.map((_center, index) => index);
  if (profile.grammar === "ENCIRCLING" || profile.grammar === "PENINSULA") {
    const boundary = profile.grammar === "PENINSULA" ? edgePolygons(centers, width, height) : all.filter((index) => centers[index].x > width * 0.18 && centers[index].x < width * 0.82 && centers[index].y > height * 0.18 && centers[index].y < height * 0.82);
    const waterTarget = areas.reduce((sum, area) => sum + area, 0) - targetLand;
    const seeds = selectGraphSeeds(boundary.length ? boundary : all, centers, profile.waterSeeds, width, wraps, random, 0.75);
    const water = growGraph(adjacency, seeds, areas, waterTarget, seed + 101);
    return all.map((index) => !water.has(index));
  }
  const seedPool = profile.grammar === "PANGAEA"
    ? all.filter((index) => centers[index].x > width * 0.2 && centers[index].x < width * 0.8 && centers[index].y > height * 0.16 && centers[index].y < height * 0.84)
    : all;
  const countSeeds = profile.grammar === "PANGAEA" ? 1 : profile.landSeeds;
  const seeds = selectGraphSeeds(seedPool.length ? seedPool : all, centers, countSeeds, width, wraps, random, profile.grammar === "LONELY_OCEANS" || profile.grammar === "ARCHIPELAGO" ? 1 : 0.62);
  const land = growGraph(adjacency, seeds, areas, targetLand, seed + 211);
  return all.map((index) => land.has(index));
}

function carveRifts(profile: TopologyProfile, polygonLand: boolean[], adjacency: Array<Set<number>>, centers: Point[], width: number, height: number, seed: number, fantasticality: MapGenerationOptions["fantasticality"]) {
  const rifts = new Set<number>();
  const top = edgePolygons(centers, width, height, "TOP");
  const bottom = edgePolygons(centers, width, height, "BOTTOM");
  for (let number = 0; number < profile.rifts; number += 1) {
    const targetX = width * (number + 1) / (profile.rifts + 1) + (hashNoise(number, 17, seed) - 0.5) * width * 0.12;
    const start = top.length ? top.reduce((best, candidate) => Math.abs(centers[candidate].x - targetX) < Math.abs(centers[best].x - targetX) ? candidate : best, top[0]) : closestPolygon(centers, { x: targetX, y: 0 }, width, false);
    const end = bottom.length ? bottom.reduce((best, candidate) => Math.abs(centers[candidate].x - targetX) < Math.abs(centers[best].x - targetX) ? candidate : best, bottom[0]) : closestPolygon(centers, { x: targetX, y: height - 1 }, width, false);
    const path = graphPath(adjacency, centers, start, end, width, targetX, seed + number * 101);
    for (const polygon of path) {
      rifts.add(polygon);
      polygonLand[polygon] = false;
      if (fantasticality === "UNBOUND" && hashNoise(polygon, number, seed + 877) > 0.54) {
        const choices = [...adjacency[polygon]].filter((neighbor) => !rifts.has(neighbor));
        if (choices.length) {
          const neighbor = choices[Math.floor(hashNoise(polygon, number, seed + 991) * choices.length)];
          rifts.add(neighbor);
          polygonLand[neighbor] = false;
        }
      }
    }
  }
  return rifts;
}

function exactWaterMask(mask: boolean[], targetWater: number, width: number, height: number, wraps: boolean, seed: number, protectedWater: ReadonlySet<number>) {
  let water = mask.reduce((count, land) => count + (land ? 0 : 1), 0);
  let cycle = 0;
  while (water !== targetWater && cycle < mask.length * 2) {
    const addWater = water < targetWater;
    let candidates = mask.flatMap((land, index) => {
      if (addWater !== land || !addWater && protectedWater.has(index)) return [];
      const boundary = hexNeighbors(index, width, height, wraps).some((neighbor) => mask[neighbor] !== land);
      return boundary ? [index] : [];
    });
    if (!candidates.length) candidates = mask.flatMap((land, index) => addWater === land && (addWater || !protectedWater.has(index)) ? [index] : []);
    if (!candidates.length) break;
    candidates.sort((one, two) => {
      const oneNeighbors = hexNeighbors(one, width, height, wraps).filter((neighbor) => mask[neighbor] !== mask[one]).length;
      const twoNeighbors = hexNeighbors(two, width, height, wraps).filter((neighbor) => mask[neighbor] !== mask[two]).length;
      const oneScore = oneNeighbors + hashNoise(one % width, Math.floor(one / width), seed + cycle) * 2.2;
      const twoScore = twoNeighbors + hashNoise(two % width, Math.floor(two / width), seed + cycle) * 2.2;
      return twoScore - oneScore;
    });
    const change = Math.min(Math.abs(targetWater - water), Math.max(1, Math.ceil(candidates.length * 0.18)));
    for (let index = 0; index < change; index += 1) mask[candidates[index]] = !addWater;
    water += addWater ? change : -change;
    cycle += 1;
  }
  return mask;
}

function createClimatePalette(region: number, center: Point, options: MapGenerationOptions, width: number, height: number, random: () => number) {
  const latitude = poleProximity(center.x, center.y, width, height, options.projectionType);
  const orderedTemperature = 0.12 + Math.cos(latitude * Math.PI / 2) * 0.78;
  const orderedMoisture = 0.48 + Math.sin((latitude + 0.08) * Math.PI * 2) * 0.16;
  const logic = options.regionClimateLogic;
  const influence = logic === "ORDERED" ? 0.88 : logic === "INFLUENCED" ? 0.52 : 0.08;
  const temperature = clamp(orderedTemperature * influence + (0.08 + random() * 0.86) * (1 - influence) + (options.climate === "HOT" ? 0.14 : options.climate === "COOL" ? -0.14 : 0));
  const moisture = clamp(orderedMoisture * influence + (0.05 + random() * 0.9) * (1 - influence) + (options.rainfall === "WET" ? 0.17 : options.rainfall === "ARID" ? -0.17 : 0));
  const anchorCount = options.fantasticality === "UNBOUND" ? 4 : options.fantasticality === "MYTHIC" ? 3 : 2;
  const spread = options.fantasticality === "UNBOUND" ? 0.57 : options.fantasticality === "MYTHIC" ? 0.34 : 0.16;
  const anchors: ClimateAnchor[] = [{ temperature, moisture }];
  for (let index = 1; index < anchorCount; index += 1) {
    const opposite = options.fantasticality === "UNBOUND" && index === anchorCount - 1;
    anchors.push({
      temperature: clamp(opposite ? 1 - temperature + (random() - 0.5) * 0.2 : temperature + (random() - 0.5) * spread * 2),
      moisture: clamp(opposite ? 1 - moisture + (random() - 0.5) * 0.2 : moisture + (random() - 0.5) * spread * 2),
    });
  }
  return { temperature, moisture, anchors, region };
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

function selectMountainEdges(edges: PolygonEdge[], desired: number, coastalPercent: number, fantasticality: MapGenerationOptions["fantasticality"], random: () => number, seed: number) {
  const selected = new Set<string>();
  const unused = [...edges];
  let ranges = 0;
  const maxLength = fantasticality === "UNBOUND" ? 7 : fantasticality === "MYTHIC" ? 6 : 4;
  while (selected.size < desired && unused.length) {
    unused.sort((one, two) => {
      const preference = (edge: PolygonEdge) => (edge.coastal ? coastalPercent / 100 : 1 - coastalPercent / 100) + edge.contrast * (fantasticality === "UNBOUND" ? 1.8 : 1.25) + hashNoise(edge.one, edge.two, seed) * 0.55;
      return preference(two) - preference(one);
    });
    let current = unused.shift()!;
    if (selected.has(edgeKey(current.one, current.two))) continue;
    ranges += 1;
    for (let step = 0; step < maxLength && current && selected.size < desired; step += 1) {
      selected.add(edgeKey(current.one, current.two));
      const currentCoastal = current.coastal;
      const connected = unused.filter((edge) => edge.coastal === currentCoastal && (edge.one === current.one || edge.one === current.two || edge.two === current.one || edge.two === current.two) && !selected.has(edgeKey(edge.one, edge.two)));
      if (!connected.length) break;
      connected.sort((one, two) => two.contrast + random() * 0.2 - one.contrast - random() * 0.2);
      current = connected[0];
      const index = unused.indexOf(current);
      if (index >= 0) unused.splice(index, 1);
    }
  }
  return { selected, ranges };
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
  const profile = topologyForPreset(options);
  const organicity = options.fantasticality === "UNBOUND" ? 1 : options.fantasticality === "MYTHIC" ? 0.72 : 0.38;
  const polygonTargets = { LOW: 100, FAIR: 200, HIGH: 250, VERY_HIGH: 300 } as const;
  const polygonCount = Math.max(18, Math.min(Math.floor(area / 3), polygonTargets[options.granularity]));
  const hexesPerSubregion = Math.max(1, 1.05292 * Math.log(area) - 5.74245);
  const subregionCount = Math.max(polygonCount * 2, Math.min(area, Math.ceil(area / hexesPerSubregion)));

  // Pass 1: render a dense, deliberately uneven subpolygon world.
  let subregionCenters = scatteredPoints(subregionCount, width, height, random, options.fantasticality);
  let subregions = assignHexes(subregionCenters, width, height, wraps);
  if (options.fantasticality === "RESTRAINED") {
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

  // Pass 3: compile a landmass grammar, then cut genuine graph-contiguous rifts through it.
  const targetWater = Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const targetLand = area - targetWater;
  const polygonLand = createLandPolygons(profile, polygonAdjacency, polygonCenters, polygonAreas, targetLand, width, height, wraps, random, seed);
  const riftPolygons = targetWater > 0 ? carveRifts(profile, polygonLand, polygonAdjacency, polygonCenters, width, height, seed + 307, options.fantasticality) : new Set<number>();
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
  const landMask = Array.from(hexPolygons, (polygon) => polygonLand[polygon]);
  const protectedWater = new Set<number>();
  for (let index = 0; index < area; index += 1) if (riftPolygons.has(hexPolygons[index]) || polarWaterPolygons.has(hexPolygons[index])) protectedWater.add(index);
  exactWaterMask(landMask, targetWater, width, height, wraps, seed + 401, protectedWater);
  const { ids: continentIds, count: continentCount, sizes: continentSizes } = connectedComponents(landMask, width, height, wraps);
  const waterComponents = connectedComponents(landMask.map((land) => !land), width, height, wraps);

  const landPolygons = new Set<number>();
  const polygonLandTiles = new Array<number>(polygonCount).fill(0);
  for (let index = 0; index < area; index += 1) if (landMask[index]) polygonLandTiles[hexPolygons[index]] += 1;
  for (let polygon = 0; polygon < polygonCount; polygon += 1) if (polygonLandTiles[polygon] >= polygonAreas[polygon] * 0.5) landPolygons.add(polygon);

  // Pass 4: regions receive biome collections in abstract temperature/rainfall space.
  const regionDivisor = options.fantasticality === "UNBOUND" ? 2.6 : options.fantasticality === "MYTHIC" ? 4 : 6;
  const contrastFactor = options.regionContrast === "EXTREME" ? 0.74 : options.regionContrast === "BLENDED" ? 1.3 : 1;
  const desiredRegions = Math.max(1, Math.min(landPolygons.size, Math.ceil(landPolygons.size / regionDivisor / contrastFactor)));
  const polygonRegions = graphPartition(polygonAdjacency, polygonCenters, desiredRegions, width, wraps, random, organicity, landPolygons);
  const regionCenters = aggregateCenters(polygonRegions, polygonCenters, desiredRegions, width, wraps);
  const climatePalettes: ClimatePalette[] = regionCenters.map((center, region) => createClimatePalette(region, center, options, width, height, random));
  const temperatures = new Array<number>(area);
  const moistures = new Array<number>(area);
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
    const anchor = palette.anchors[Math.min(palette.anchors.length - 1, Math.floor(hashNoise(subregion, region, seed + 503) * palette.anchors.length))];
    const detailScale = options.fantasticality === "UNBOUND" ? 3.2 : 5.4;
    temperatures[index] = clamp(anchor.temperature + (valueNoise(x + 101, y + 211, detailScale, seed + 601) - 0.5) * 0.16);
    moistures[index] = clamp(anchor.moisture + (valueNoise(x + 419, y + 73, detailScale + 1.3, seed + 701) - 0.5) * 0.2);
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

  // Pass 5: ranges follow coast arcs and the borders between dissonant regional palettes.
  const desiredRangeEdges = Math.max(1, Math.round(edges.length * clamp(options.mountainPercent / 100, 0, 0.38) * (options.fantasticality === "UNBOUND" ? 2.15 : 1.72)));
  const mountainSelection = selectMountainEdges(edges, desiredRangeEdges, options.coastalRangePercent, options.fantasticality, random, seed + 809);
  const mountainCore = new Uint8Array(area);
  const boundaryDistance = new Uint8Array(area);
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const polygon = hexPolygons[index];
    for (const neighbor of hexNeighbors(index, width, height, wraps)) {
      const other = hexPolygons[neighbor];
      if (other !== polygon && mountainSelection.selected.has(edgeKey(polygon, other))) {
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
    const regionalUplift = hashNoise(polygonRegions[hexPolygons[index]], hexPolygons[index], seed + 907) > (options.fantasticality === "UNBOUND" ? 0.79 : 0.9) ? 0.24 : 0;
    reliefValues[index] = valueNoise(x + 811, y + 307, options.fantasticality === "UNBOUND" ? 5.2 : 8.2, seed + 1009) * 0.42 + mountainCore[index] * 0.9 + boundaryDistance[index] * 0.3 + regionalUplift;
  }
  const landRelief = reliefValues.filter((_value, index) => landMask[index]);
  const effectiveMountainPercent = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" || options.style === "BRUTAL" ? Math.max(18, options.mountainPercent) : options.mountainPercent;
  const hillPercent = options.worldAge === "YOUNG" ? 29 : options.worldAge === "OLD" ? 12 : 20;
  const mountainThreshold = effectiveMountainPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - clamp(effectiveMountainPercent / 100, 0, 0.42));
  const hillThreshold = quantile(landRelief, 1 - clamp((effectiveMountainPercent + hillPercent) / 100, 0, 0.74));
  const elevations = landMask.map((land, index) => land ? reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0 : 0);

  // Pass 6: optional realism adds west-to-east rain shadows without erasing the regional palette.
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

  // Pass 7: render every retained small-region decision into Civ V tile content.
  const tiles = landMask.map<Civ5Tile>((land, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const adjacentLand = hexNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    let terrain = land ? chooseTerrain(temperatures[index], moistures[index], options.regionContrast, options.dominantTerrains) : adjacentLand ? 1 : 0;
    let feature = 255;
    const featureNoise = hashNoise(subregions[index], index, seed + 1201);
    if (!land && poleProximity(x, y, width, height, options.projectionType) > 0.86 && featureNoise > 0.34) feature = 3;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && temperatures[index] > 0.68 && moistures[index] > 0.68 && featureNoise > 0.19) feature = 1;
    else if (land && elevations[index] === 0 && terrain === 2 && moistures[index] > 0.8 && featureNoise > 0.34) feature = 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && moistures[index] > 0.55 && featureNoise > 0.3) feature = 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.24 && featureNoise > 0.955) feature = 4;
    if (!land) terrain = adjacentLand ? 1 : 0;
    return { terrain, resource: 255, feature, river: 0, elevation: elevations[index], continent: land ? continentIds[index] + 1 : 0, wonder: 255, resourceAmount: 0 };
  });

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
  const deepWaterMask = landMask.map((land, index) => !land && (riftPolygons.has(hexPolygons[index]) || !hexNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor])));
  const astronomyComponents = connectedComponents(deepWaterMask.map((deep) => !deep), width, height, wraps);
  const astronomyAssignments = astronomyComponents.ids;
  const astronomyObjects = objectsFromAssignments("SUPERPOLYGON", astronomyAssignments, astronomyComponents.count, "Astronomy Basin").map((object) => ({ ...object, attributes: { geography: "ASTRONOMY_BASIN" } }));
  const superpolygons: GeographicObject[] = [...continents, ...basins].map((object, index) => ({ id: `superpolygon-${index + 1}`, name: `Superpolygon ${index + 1}`, kind: "SUPERPOLYGON", tileIndices: [...object.tileIndices], attributes: { geography: object.kind, member: object.id } }));
  const rifts = connectedTileObjects("RIFT", deepWaterMask, width, height, wraps, "Astronomy Rift");
  const climateObjects = objectsFromAssignments("CLIMATE_REGION", climateAssignments, desiredRegions, "Climate Realm").map((object, index) => ({
    ...object,
    attributes: { paletteSize: climatePalettes[index]?.anchors.length ?? 0, temperature: Math.round((climatePalettes[index]?.temperature ?? 0.5) * 100), rainfall: Math.round((climatePalettes[index]?.moisture ?? 0.5) * 100) },
  }));
  const ranges = connectedLinearFeatures(Array.from(mountainCore, (value, index) => Boolean(value) && landMask[index]), width, height, wraps, "Mountain Range");
  const tinyIslands = continentSizes.filter((size) => size < area * 0.018).length;
  const diagnostics: RegionGraphDiagnostics = {
    passes: 7,
    subregions: subregionObjects.length,
    polygons: polygonObjects.length,
    climateRegions: climateObjects.length,
    climatePalettes: climatePalettes.reduce((sum, palette) => sum + palette.anchors.length, 0),
    biomeTransitions,
    continents: continentCount,
    oceanBasins: waterComponents.count,
    astronomyBasins: astronomyComponents.count,
    deepWaterBarriers: rifts.length,
    tinyIslands,
    mountainRanges: ranges.length,
  };
  const structure: GenerationStructure = {
    engine: "REGION_GRAPH",
    objects: [...subregionObjects, ...polygonObjects, ...superpolygons, ...astronomyObjects, ...continents, ...basins, ...rifts, ...climateObjects],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: { ...diagnostics, superpolygons: superpolygons.length + astronomyObjects.length, inlandSeas: basins.filter((object) => object.kind === "INLAND_SEA").length, lakes: basins.filter((object) => object.kind === "LAKE").length, rifts: rifts.length },
  };

  return { landMask, reliefValues, temperatures, moistures, elevations, tiles, structure, diagnostics };
}
