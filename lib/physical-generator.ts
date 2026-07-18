import type { Civ5Tile } from "./civ5-map.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { WorldScale } from "./generation-recipe.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";

type Point = { x: number; y: number };
type Plate = Point & { vx: number; vy: number; continental: boolean };
type ClimateFrame = { latitude: number; polewardX: number; polewardY: number; eastwardX: number; eastwardY: number };
type PhysicalProfile = { plateShift: number; activity: number; continentalShare: number; erosionShift: number; monsoon: number };

export type PhysicalGeography = {
  landMask: boolean[];
  reliefValues: number[];
  temperatures: number[];
  moistures: number[];
  elevations: number[];
  riverGuidance: number[];
  tiles: Civ5Tile[];
  structure: GenerationStructure;
};

function clamp(value: number, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }
function mix(one: number, two: number, amount: number) { return one * (1 - amount) + two * amount; }
function smooth(value: number) { return value * value * (3 - 2 * value); }
function smoothstep(edge0: number, edge1: number, value: number) { return smooth(clamp((value - edge0) / Math.max(0.0001, edge1 - edge0))); }

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
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

function neighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width;
  const y = Math.floor(index / width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    return nextX >= 0 && nextX < width && nextY >= 0 && nextY < height ? [nextY * width + nextX] : [];
  });
}

function distance(one: Point, two: Point, width: number, _height: number, wraps: boolean) {
  let dx = Math.abs(one.x - two.x);
  if (wraps) dx = Math.min(dx, width - dx);
  return Math.hypot(dx, Math.abs(one.y - two.y) * 0.866);
}

function vectorBetween(one: number, two: number, width: number, wraps: boolean) {
  const oneX = one % width;
  const oneY = Math.floor(one / width);
  const twoX = two % width;
  const twoY = Math.floor(two / width);
  let dx = twoX - oneX;
  if (wraps && Math.abs(dx) > width / 2) dx += dx > 0 ? -width : width;
  const dy = (twoY - oneY) * 0.866;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  return { x: dx / length, y: dy / length };
}

function physicalProfile(options: MapGenerationOptions): PhysicalProfile {
  if (options.preset === "COLLIDING_PLATES") return { plateShift: 3, activity: 1.16, continentalShare: 0.68, erosionShift: -1, monsoon: 0 };
  if (options.preset === "ANCIENT_CRATONS") return { plateShift: -2, activity: 0.78, continentalShare: 0.74, erosionShift: 1, monsoon: 0 };
  if (options.preset === "ISLAND_ARC_EARTH") return { plateShift: 5, activity: 1.22, continentalShare: 0.42, erosionShift: -1, monsoon: 0.18 };
  if (options.preset === "SUPERCONTINENT_INTERIOR") return { plateShift: -3, activity: 0.92, continentalShare: 0.82, erosionShift: 0, monsoon: 0 };
  if (options.preset === "MONSOON_CONTINENTS") return { plateShift: 0, activity: 1, continentalShare: 0.67, erosionShift: 0, monsoon: 0.72 };
  if (options.preset === "ICEHOUSE_EARTH") return { plateShift: -1, activity: 0.88, continentalShare: 0.72, erosionShift: 1, monsoon: 0 };
  return { plateShift: 0, activity: 1, continentalShare: 0.66, erosionShift: 0, monsoon: 0 };
}

function createPlates(count: number, continentalShare: number, width: number, height: number, wraps: boolean, random: () => number) {
  const centers: Point[] = [{ x: random() * width, y: random() * height }];
  while (centers.length < count) {
    let best = { x: random() * width, y: random() * height };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const candidate = { x: random() * width, y: random() * height };
      const separation = Math.min(...centers.map((center) => distance(center, candidate, width, height, wraps)));
      if (separation > bestDistance) { best = candidate; bestDistance = separation; }
    }
    centers.push(best);
  }
  return centers.map<Plate>((center, index) => {
    const angle = random() * Math.PI * 2;
    const continental = index === 0 || random() < continentalShare;
    return { ...center, vx: Math.cos(angle), vy: Math.sin(angle), continental };
  });
}

function assignPlates(plates: Plate[], width: number, height: number, wraps: boolean) {
  const owners = new Int32Array(width * height);
  const second = new Int32Array(width * height);
  const boundary = new Array<number>(width * height).fill(0);
  for (let index = 0; index < owners.length; index += 1) {
    const point = { x: index % width, y: Math.floor(index / width) };
    let nearest = Number.POSITIVE_INFINITY;
    let next = Number.POSITIVE_INFINITY;
    let owner = 0;
    let runnerUp = 0;
    for (let plate = 0; plate < plates.length; plate += 1) {
      const current = distance(point, plates[plate], width, height, wraps);
      if (current < nearest) { next = nearest; runnerUp = owner; nearest = current; owner = plate; }
      else if (current < next) { next = current; runnerUp = plate; }
    }
    owners[index] = owner;
    second[index] = runnerUp;
    boundary[index] = clamp(1 - (next - nearest) / Math.max(1.2, Math.sqrt(width * height) * 0.035));
  }
  return { owners, second, boundary };
}

function exactTopMask(values: number[], count: number) {
  const selected = new Set(values.map((_value, index) => index).sort((one, two) => values[two] - values[one]).slice(0, Math.max(0, Math.min(values.length, count))));
  return values.map((_value, index) => selected.has(index));
}

function blurField(values: number[], width: number, height: number, wraps: boolean, strength: number, passes: number) {
  let current = [...values];
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [...current];
    for (let index = 0; index < current.length; index += 1) {
      const adjacent = neighbors(index, width, height, wraps);
      const mean = adjacent.reduce((sum, neighbor) => sum + current[neighbor], 0) / Math.max(1, adjacent.length);
      next[index] = mix(current[index], mean, strength);
    }
    current = next;
  }
  return current;
}

function climateFrame(x: number, y: number, width: number, height: number, options: MapGenerationOptions, scale: WorldScale, seed: number): ClimateFrame {
  const normalizedX = width <= 1 ? 0.5 : x / (width - 1);
  const normalizedY = height <= 1 ? 0.5 : y / (height - 1);
  const latitude = scaledPoleProximity(x, y, width, height, options.projectionType, scale, seed + 43);
  if (options.projectionType === "POLAR_CENTERED") {
    const dx = normalizedX - 0.5;
    const dy = normalizedY - 0.5;
    const radius = Math.max(0.0001, Math.hypot(dx, dy));
    const polewardX = -dx / radius;
    const polewardY = -dy / radius;
    return { latitude, polewardX, polewardY, eastwardX: -polewardY, eastwardY: polewardX };
  }
  const polewardY = options.projectionType === "EQUATORIAL_POLE"
    ? normalizedY < 0.5 ? 1 : -1
    : normalizedY < 0.5 ? -1 : 1;
  return { latitude, polewardX: 0, polewardY, eastwardX: 1, eastwardY: 0 };
}

function distanceFromWater(landMask: boolean[], width: number, height: number, wraps: boolean) {
  const distances = new Int32Array(landMask.length).fill(-1);
  const towardWater = new Int32Array(landMask.length).fill(-1);
  const queue = new Int32Array(landMask.length);
  let read = 0;
  let write = 0;
  for (let index = 0; index < landMask.length; index += 1) {
    if (!landMask[index]) { distances[index] = 0; queue[write++] = index; }
  }
  if (write === 0) return { distances: new Array<number>(landMask.length).fill(Math.max(width, height)), towardWater };
  while (read < write) {
    const current = queue[read++];
    for (const next of neighbors(current, width, height, wraps)) {
      if (distances[next] >= 0) continue;
      distances[next] = distances[current] + 1;
      towardWater[next] = current;
      queue[write++] = next;
    }
  }
  return { distances: Array.from(distances), towardWater };
}

function prevailingWind(frame: ClimateFrame, rotation: MapGenerationOptions["physicalRotation"]) {
  const latitude = frame.latitude;
  const tropicalToTemperate = smoothstep(0.25, 0.42, latitude);
  const temperateToPolar = smoothstep(0.58, 0.75, latitude);
  const tropicalZonal = -0.92;
  const temperateZonal = 1;
  const polarZonal = -0.72;
  let zonal = mix(tropicalZonal, temperateZonal, tropicalToTemperate);
  zonal = mix(zonal, polarZonal, temperateToPolar);
  if (rotation === "RETROGRADE") zonal *= -1;
  const tropicalMeridional = -0.26;
  const temperateMeridional = 0.3;
  const polarMeridional = -0.2;
  let meridional = mix(tropicalMeridional, temperateMeridional, tropicalToTemperate);
  meridional = mix(meridional, polarMeridional, temperateToPolar);
  const x = frame.eastwardX * zonal + frame.polewardX * meridional;
  const y = frame.eastwardY * zonal + frame.polewardY * meridional;
  return { x, y, zonal, cell: latitude < 0.34 ? 0 : latitude < 0.67 ? 1 : 2 };
}

function upwindNeighbors(windX: number[], windY: number[], width: number, height: number, wraps: boolean) {
  const result = new Int32Array(windX.length).fill(-1);
  for (let index = 0; index < result.length; index += 1) {
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of neighbors(index, width, height, wraps)) {
      const vector = vectorBetween(index, candidate, width, wraps);
      const score = vector.x * -windX[index] + vector.y * -windY[index];
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    result[index] = best;
  }
  return result;
}

function simulateMoisture(
  options: MapGenerationOptions,
  profile: PhysicalProfile,
  landMask: boolean[],
  normalizedRelief: number[],
  temperatures: number[],
  continentality: number[],
  windX: number[],
  windY: number[],
  convergenceAir: number[],
  towardWater: Int32Array,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  scale: WorldScale,
) {
  const character = worldCharacterProfile(options.style).physical;
  const oceanInfluence = (options.physicalOceanInfluence === "STRONG" ? 1.28 : options.physicalOceanInfluence === "WEAK" ? 0.68 : 1) * character.oceanModeration;
  const rainfallShift = (options.rainfall === "WET" ? 0.13 : options.rainfall === "ARID" ? -0.12 : 0) + character.moistureBias;
  const effectiveWindX = [...windX];
  const effectiveWindY = [...windY];
  const seasonality = options.physicalSeasonality === "EXTREME" ? 1 : options.physicalSeasonality === "MILD" ? 0.2 : 0.58;
  if (profile.monsoon > 0 || seasonality > 0.8) {
    for (let index = 0; index < landMask.length; index += 1) {
      if (!landMask[index] || towardWater[index] < 0 || scaledPoleProximity(index % width, Math.floor(index / width), width, height, options.projectionType, scale, seed + 43) > 0.62) continue;
      const towardSea = vectorBetween(index, towardWater[index], width, wraps);
      const monsoon = clamp((profile.monsoon + seasonality * 0.22) * (1 - continentality[index] * 0.6));
      const x = mix(effectiveWindX[index], -towardSea.x, monsoon);
      const y = mix(effectiveWindY[index], -towardSea.y, monsoon);
      effectiveWindX[index] = x;
      effectiveWindY[index] = y;
    }
  }
  const upwind = upwindNeighbors(effectiveWindX, effectiveWindY, width, height, wraps);
  let vapor = landMask.map((land, index) => land ? 0.12 + (1 - continentality[index]) * 0.18 : 0.66 + temperatures[index] * 0.2);
  let groundWater = landMask.map(() => 0.18);
  const precipitation = new Array<number>(landMask.length).fill(0);
  const rainShadow = new Array<number>(landMask.length).fill(0);
  const cycles = Math.max(28, Math.min(54, Math.round(width * 0.42)));
  const sampleCycles = Math.max(8, Math.floor(cycles / 3));
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const nextVapor = new Array<number>(landMask.length).fill(0);
    const nextGround = [...groundWater];
    for (let index = 0; index < landMask.length; index += 1) {
      const source = upwind[index] >= 0 ? upwind[index] : index;
      const adjacent = neighbors(index, width, height, wraps);
      const neighborMean = adjacent.reduce((sum, neighbor) => sum + vapor[neighbor], 0) / Math.max(1, adjacent.length);
      const localEvaporation = landMask[index]
        ? groundWater[index] * (0.025 + temperatures[index] * 0.055) * oceanInfluence * character.moistureEfficiency
        : (0.12 + temperatures[index] * 0.11) * oceanInfluence * character.moistureEfficiency;
      let airborne = vapor[source] * 0.72 + vapor[index] * 0.12 + neighborMean * 0.1 + localEvaporation;
      const rise = landMask[index] ? Math.max(0, normalizedRelief[index] - normalizedRelief[source]) : 0;
      const descent = landMask[index] ? Math.max(0, normalizedRelief[source] - normalizedRelief[index]) : 0;
      const coldCondensation = Math.max(0, 0.42 - temperatures[index]) * 0.035;
      const condensation = landMask[index] ? clamp(0.025 + Math.max(0, convergenceAir[index]) * 0.12 + rise * 0.72 + coldCondensation, 0.015, 0.82) : 0.015;
      const rain = airborne * condensation;
      airborne = Math.max(0, airborne - rain - descent * 0.035);
      nextVapor[index] = clamp(airborne, 0, 1.5);
      if (landMask[index]) nextGround[index] = clamp(groundWater[index] * 0.86 + rain * 0.8 - (0.018 + temperatures[index] * 0.026));
      if (cycle >= cycles - sampleCycles) precipitation[index] += rain / sampleCycles;
      rainShadow[index] = Math.max(rainShadow[index], descent * 0.45 + Math.max(0, vapor[source] - airborne) * 0.22);
    }
    vapor = nextVapor;
    groundWater = nextGround;
  }
  const landRain = precipitation.filter((_value, index) => landMask[index]);
  const meanRain = landRain.reduce((sum, value) => sum + value, 0) / Math.max(1, landRain.length);
  const moistures = precipitation.map((rain, index) => {
    if (!landMask[index]) return 1;
    const normalizedRain = clamp(rain / Math.max(0.006, meanRain * 1.3));
    const evaporationDemand = clamp(temperatures[index] * 0.72 + (options.physicalSeasonality === "EXTREME" ? 0.08 : 0) + continentality[index] * 0.12);
    const coldRetention = Math.max(0, 0.38 - temperatures[index]) * 0.52;
    const maritime = (1 - continentality[index]) * 0.14 * oceanInfluence;
    return clamp(0.06 + normalizedRain * 0.94 + groundWater[index] * 0.28 + maritime + coldRetention + rainfallShift - evaporationDemand * 0.22 + (valueNoise(index % width + 137, Math.floor(index / width) + 811, 9, seed + 617) - 0.5) * 0.045 * character.climateVariance);
  });
  return { precipitation, moistures: blurField(moistures, width, height, wraps, 0.2, 3), rainShadow, windX: effectiveWindX, windY: effectiveWindY, upwind };
}

class MinHeap {
  private values: Array<{ index: number; priority: number }> = [];
  push(index: number, priority: number) {
    const item = { index, priority };
    this.values.push(item);
    let position = this.values.length - 1;
    while (position > 0) {
      const parent = Math.floor((position - 1) / 2);
      if (this.values[parent].priority <= priority) break;
      this.values[position] = this.values[parent];
      position = parent;
    }
    this.values[position] = item;
  }
  pop() {
    if (!this.values.length) return undefined;
    const root = this.values[0];
    const tail = this.values.pop()!;
    if (this.values.length) {
      let position = 0;
      while (true) {
        const left = position * 2 + 1;
        const right = left + 1;
        if (left >= this.values.length) break;
        const child = right < this.values.length && this.values[right].priority < this.values[left].priority ? right : left;
        if (this.values[child].priority >= tail.priority) break;
        this.values[position] = this.values[child];
        position = child;
      }
      this.values[position] = tail;
    }
    return root;
  }
  get length() { return this.values.length; }
}

function buildDrainage(landMask: boolean[], relief: number[], runoff: number[], basinByTile: Int32Array, basinCount: number, width: number, height: number, wraps: boolean) {
  const area = landMask.length;
  const parent = new Int32Array(area).fill(-1);
  const outlet = new Int32Array(area).fill(-1);
  const filled = new Array<number>(area).fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  for (let index = 0; index < area; index += 1) {
    if (landMask[index]) continue;
    filled[index] = relief[index];
    outlet[index] = basinByTile[index];
    heap.push(index, filled[index]);
  }
  if (!heap.length) {
    const assignments = new Int32Array(area).fill(landMask.some(Boolean) ? 0 : -1);
    return { guidance: new Array<number>(area).fill(0), assignments, accumulation: [...runoff], outletCount: 0 };
  }
  while (heap.length) {
    const current = heap.pop()!;
    if (current.priority !== filled[current.index]) continue;
    for (const next of neighbors(current.index, width, height, wraps)) {
      if (!landMask[next] || Number.isFinite(filled[next])) continue;
      filled[next] = Math.max(relief[next], filled[current.index] + 0.0001);
      parent[next] = current.index;
      outlet[next] = outlet[current.index];
      heap.push(next, filled[next]);
    }
  }
  const accumulation = runoff.map((value, index) => landMask[index] ? Math.max(0.001, value) : 0);
  const order = landMask.flatMap((land, index) => land ? [index] : []).sort((one, two) => filled[two] - filled[one]);
  for (const index of order) if (parent[index] >= 0) accumulation[parent[index]] += accumulation[index];
  const maximum = Math.max(0.001, ...accumulation.filter((_value, index) => landMask[index]));
  const guidance = accumulation.map((value, index) => landMask[index] ? clamp(Math.log1p(value) / Math.log1p(maximum)) : 0);
  const assignments = new Int32Array(area).fill(-1);
  for (let index = 0; index < area; index += 1) if (landMask[index]) assignments[index] = outlet[index];
  return { guidance, assignments, accumulation, outletCount: Math.min(basinCount, new Set(Array.from(assignments).filter((value) => value >= 0)).size) };
}

function chooseTerrain(temperature: number, moisture: number, dominant: MapGenerationOptions["dominantTerrains"]) {
  const chosen = new Set(dominant);
  const scores: Array<[number, number]> = [
    [2, 1.04 - Math.abs(moisture - 0.72) * 1.25 - Math.abs(temperature - 0.61) * 0.78 + (chosen.has("GRASSLAND") ? 0.58 : 0)],
    [3, 0.98 - Math.abs(moisture - 0.43) * 1.05 - Math.abs(temperature - 0.56) * 0.42 + (chosen.has("PLAINS") ? 0.58 : 0)],
    [4, temperature < 0.46 ? -10 : 0.5 + (temperature - 0.48) * 0.95 + (0.3 - moisture) * 1.95 + (chosen.has("DESERT") ? 0.58 : 0)],
    [5, 0.7 + (0.39 - temperature) * 1.82 - Math.abs(moisture - 0.46) * 0.24 + (chosen.has("TUNDRA") ? 0.58 : 0)],
    [6, 0.74 + (0.22 - temperature) * 4.1],
  ];
  return scores.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function contiguousClimateObjects(assignments: Int32Array, labels: string[], width: number, height: number, wraps: boolean) {
  const result: GeographicObject[] = [];
  for (let climate = 0; climate < labels.length; climate += 1) {
    const components = connectedTileObjects("CLIMATE_REGION", Array.from(assignments, (value) => value === climate), width, height, wraps, labels[climate]).filter((component) => component.tileIndices.length >= 3);
    for (const component of components) result.push({ ...component, id: `climate-region-${result.length + 1}`, name: `${labels[climate]} ${components.length > 1 ? result.length + 1 : ""}`.trim(), attributes: { biome: labels[climate] } });
  }
  return result;
}

export function generatePhysicalGeography(options: MapGenerationOptions, width: number, height: number, wraps: boolean, seed: number, random: () => number, scale: WorldScale = "GLOBAL"): PhysicalGeography {
  const area = width * height;
  const profile = physicalProfile(options);
  const character = worldCharacterProfile(options.style);
  const scaleProfile = worldScaleProfile(scale);
  // Scale owns how many tectonic systems the map represents. Map Size adds
  // samples inside those systems rather than silently turning a Local view
  // into a many-plate planet.
  const plateCount = Math.max(3, Math.min(24, Math.round((7 + profile.plateShift) * scaleProfile.physical.plateFrequency)));
  const plates = createPlates(plateCount, profile.continentalShare, width, height, wraps, random);
  const { owners, second, boundary } = assignPlates(plates, width, height, wraps);
  const activity = (options.plateActivity === "VIOLENT" ? 1.18 : options.plateActivity === "QUIET" ? 0.55 : 0.82) * profile.activity * character.physical.activity;
  const hypsometry = new Array<number>(area);
  const convergence = new Array<number>(area).fill(0);
  const divergence = new Array<number>(area).fill(0);

  for (let index = 0; index < area; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const one = plates[owners[index]];
    const two = plates[second[index]];
    let dx = two.x - one.x;
    if (wraps && Math.abs(dx) > width / 2) dx += dx > 0 ? -width : width;
    const dy = (two.y - one.y) * 0.866;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const relative = (one.vx - two.vx) * dx / length + (one.vy - two.vy) * dy / length;
    convergence[index] = boundary[index] * Math.max(0, relative) * activity;
    divergence[index] = boundary[index] * Math.max(0, -relative) * activity;
    const crust = one.continental ? 0.63 : 0.3;
    const continentalNoise = valueNoise(x + 101, y + 211, 18 * scaleProfile.physical.reliefSpan, seed + 101) * 0.22 * character.physical.continentalNoise;
    const regionalNoise = valueNoise(x + 307, y + 83, 7 * scaleProfile.physical.reliefSpan, seed + 211) * 0.12 * character.physical.continentalNoise;
    hypsometry[index] = crust + continentalNoise + regionalNoise + convergence[index] * 0.42 * character.physical.convergenceRelief - divergence[index] * 0.31 * character.physical.divergenceRelief;
  }

  const landCount = area - Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const landMask = exactTopMask(hypsometry.map((value, index) => value + hashNoise(index % width, Math.floor(index / width), seed + 313) * 0.00001), landCount);
  let reliefValues = hypsometry.map((value, index) => value + convergence[index] * 0.58 * character.physical.convergenceRelief - divergence[index] * 0.16 * character.physical.divergenceRelief);
  const baseErosionPasses = options.erosionStrength === "STRONG" ? 4 : options.erosionStrength === "LIGHT" ? 1 : 2;
  const erosionPasses = Math.max(1, Math.round((baseErosionPasses + profile.erosionShift + character.physical.erosionPassDelta) * scaleProfile.physical.erosionDetail));
  const erosionStrength = (options.erosionStrength === "STRONG" ? 0.24 : options.erosionStrength === "LIGHT" ? 0.09 : 0.16) * character.physical.erosionStrength;
  for (let pass = 0; pass < erosionPasses; pass += 1) {
    const next = [...reliefValues];
    for (let index = 0; index < area; index += 1) {
      const adjacent = neighbors(index, width, height, wraps);
      const mean = adjacent.reduce((sum, neighbor) => sum + reliefValues[neighbor], 0) / Math.max(1, adjacent.length);
      next[index] = reliefValues[index] * (1 - erosionStrength) + mean * erosionStrength + convergence[index] * 0.075;
    }
    reliefValues = next;
  }

  const landRelief = reliefValues.filter((_value, index) => landMask[index]);
  const minimumLand = landRelief.length ? Math.min(...landRelief) : 0;
  const maximumLand = landRelief.length ? Math.max(...landRelief) : 1;
  const normalizedRelief = reliefValues.map((value, index) => landMask[index] ? clamp((value - minimumLand) / Math.max(0.001, maximumLand - minimumLand)) : 0);
  const effectiveMountains = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" ? Math.max(18, options.mountainPercent) : Math.max(character.mountainFloor, options.mountainPercent);
  const landIndices = landMask.flatMap((land, index) => land ? [index] : []);
  const mountainCount = Math.round(landIndices.length * clamp(effectiveMountains / 100, 0, 0.42));
  const hillShare = options.worldAge === "YOUNG" ? 0.27 : options.worldAge === "OLD" ? 0.12 : 0.19;
  const rankedLand = [...landIndices].sort((one, two) => normalizedRelief[two] - normalizedRelief[one]);
  const mountains = new Set(rankedLand.slice(0, mountainCount));
  const hills = new Set(rankedLand.slice(mountainCount, mountainCount + Math.round(landIndices.length * hillShare)));
  const elevations = landMask.map((_land, index) => mountains.has(index) ? 2 : hills.has(index) ? 1 : 0);

  const waterDistance = distanceFromWater(landMask, width, height, wraps);
  const continentalityScale = Math.max(6, Math.min(width, height) * 0.24 * character.physical.oceanModeration);
  const continentality = waterDistance.distances.map((value, index) => landMask[index] ? clamp(value / continentalityScale) : 0);
  const oceanModeration = (options.physicalOceanInfluence === "STRONG" ? 1.25 : options.physicalOceanInfluence === "WEAK" ? 0.62 : 1) * character.physical.oceanModeration;
  const seasonality = options.physicalSeasonality === "EXTREME" ? 1 : options.physicalSeasonality === "MILD" ? 0.3 : 0.62;
  const climateShift = options.climate === "HOT" ? 0.13 : options.climate === "COOL" ? -0.14 : 0;
  const temperatures = new Array<number>(area);
  const annualRange = new Array<number>(area);
  const windX = new Array<number>(area);
  const windY = new Array<number>(area);
  const windCells = new Int32Array(area);
  const convergenceAir = new Array<number>(area);
  for (let index = 0; index < area; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const frame = climateFrame(x, y, width, height, options, scale, seed);
    const insolation = Math.pow(Math.cos(frame.latitude * Math.PI / 2), 0.72);
    const inland = continentality[index];
    const maritimeWeight = landMask[index] ? Math.exp(-waterDistance.distances[index] / Math.max(1.5, 4.2 * oceanModeration)) : 1;
    const localRange = (0.035 + Math.pow(frame.latitude, 1.18) * 0.28 * seasonality) * (landMask[index] ? 0.48 + inland * 0.9 : 0.28) / Math.max(0.62, oceanModeration);
    annualRange[index] = localRange;
    const radiative = 0.08 + insolation * 0.84 + climateShift;
    const maritimeTarget = 0.28 + insolation * 0.46 + climateShift * 0.72;
    const altitudeCooling = landMask[index] ? normalizedRelief[index] * 0.23 : 0;
    temperatures[index] = clamp(mix(radiative, maritimeTarget, maritimeWeight * 0.48) - altitudeCooling + (valueNoise(x + 701, y + 503, 12, seed + 521) - 0.5) * 0.105 * character.physical.climateVariance - localRange * 0.08);
    const wind = prevailingWind(frame, options.physicalRotation);
    windX[index] = wind.x;
    windY[index] = wind.y;
    windCells[index] = wind.cell;
    convergenceAir[index] = Math.exp(-Math.pow(frame.latitude / 0.11, 2)) * 0.7 + Math.exp(-Math.pow((frame.latitude - 0.65) / 0.1, 2)) * 0.55 - Math.exp(-Math.pow((frame.latitude - 0.33) / 0.085, 2)) * 0.48;
  }
  const smoothedTemperatures = blurField(temperatures, width, height, wraps, 0.18, 2);
  const atmosphere = simulateMoisture(options, profile, landMask, normalizedRelief, smoothedTemperatures, continentality, windX, windY, convergenceAir, waterDistance.towardWater, width, height, wraps, seed, scale);
  const moistures = atmosphere.moistures;

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  const continentByTile = new Int32Array(area).fill(-1);
  const basinByTile = new Int32Array(area).fill(-1);
  continents.forEach((continent, owner) => continent.tileIndices.forEach((index) => { continentByTile[index] = owner; }));
  basins.forEach((basin, owner) => basin.tileIndices.forEach((index) => { basinByTile[index] = owner; }));
  const runoff = atmosphere.precipitation.map((rain, index) => landMask[index] ? clamp(rain * 5.2 + moistures[index] * 0.18 - smoothedTemperatures[index] * 0.055, 0.001, 1) : 0);
  const drainage = buildDrainage(landMask, reliefValues, runoff, basinByTile, basins.length, width, height, wraps);

  const biomeAssignments = new Int32Array(area).fill(-1);
  const climateLabels = ["Glacial", "Tundra", "Arid", "Grassland", "Seasonal Forest", "Rainforest", "Steppe"];
  for (let index = 0; index < area; index += 1) {
    if (!landMask[index]) continue;
    const coldSeason = smoothedTemperatures[index] - annualRange[index] * 0.48;
    biomeAssignments[index] = coldSeason < 0.1 ? 0 : smoothedTemperatures[index] < 0.3 ? 1 : smoothedTemperatures[index] > 0.54 && moistures[index] < 0.25 ? 2 : smoothedTemperatures[index] > 0.7 && moistures[index] > 0.66 ? 5 : moistures[index] > 0.58 ? 4 : moistures[index] < 0.4 ? 6 : 3;
  }

  const tiles = landMask.map<Civ5Tile>((land, index) => {
    const adjacentLand = neighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    const terrain = land ? chooseTerrain(smoothedTemperatures[index], moistures[index], options.dominantTerrains) : adjacentLand ? 1 : 0;
    const coldSeason = smoothedTemperatures[index] - annualRange[index] * 0.48;
    let feature = 255;
    if (!land && coldSeason < 0.1 && random() > clamp(smoothedTemperatures[index] * 2.8)) feature = 3;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && smoothedTemperatures[index] > 0.7 && moistures[index] > 0.66) feature = 1;
    else if (land && elevations[index] === 0 && terrain === 2 && moistures[index] > 0.82) feature = 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && moistures[index] > (smoothedTemperatures[index] < 0.38 ? 0.48 : 0.57)) feature = 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.2 && random() > 0.96) feature = 4;
    return { terrain, resource: 255, feature, river: 0, elevation: elevations[index], continent: land ? continentByTile[index] + 1 : 0, wonder: 255, resourceAmount: 0 };
  });

  const plateObjects = objectsFromAssignments("TECTONIC_PLATE", owners, plates.length, "Plate").map((object, index) => ({ ...object, attributes: { continental: plates[index].continental, motionX: Number(plates[index].vx.toFixed(3)), motionY: Number(plates[index].vy.toFixed(3)) } }));
  const atmosphericCells = objectsFromAssignments("ATMOSPHERIC_CELL", windCells, 3, "Atmospheric Cell").map((object, index) => ({ ...object, attributes: { circulation: ["tropical", "temperate", "polar"][index], rotation: options.physicalRotation } }));
  const climateObjects = contiguousClimateObjects(biomeAssignments, climateLabels, width, height, wraps);
  const rainShadowMask = landMask.map((land, index) => land && atmosphere.rainShadow[index] > 0.1 && moistures[index] < 0.42);
  const rainShadows = connectedTileObjects("RAIN_SHADOW", rainShadowMask, width, height, wraps, "Rain Shadow").filter((object) => object.tileIndices.length >= 2).map((object, index) => ({ ...object, id: `rain-shadow-${index + 1}` }));
  const glacialMask = landMask.map((land, index) => land && smoothedTemperatures[index] - annualRange[index] * 0.48 < 0.1);
  const glacialRegions = connectedTileObjects("GLACIAL_REGION", glacialMask, width, height, wraps, "Glacial Region").filter((object) => object.tileIndices.length >= 2).map((object, index) => ({ ...object, id: `glacial-region-${index + 1}` }));
  const watershedObjects = objectsFromAssignments("WATERSHED", drainage.assignments, Math.max(1, basins.length), "Watershed").map((object, index) => ({ ...object, attributes: { outletBasin: basins.length ? index + 1 : 0, endorheic: basins.length === 0 } }));
  const ranges = connectedLinearFeatures(elevations.map((elevation, index) => landMask[index] && elevation === 2 && convergence[index] > 0.08), width, height, wraps, "Mountain Range");
  const mean = (values: number[], mask = values.map(() => true)) => values.reduce((sum, value, index) => sum + (mask[index] ? value : 0), 0) / Math.max(1, mask.filter(Boolean).length);
  const westerlyTiles = windCells.reduce((count, _cell, index) => count + (atmosphere.windX[index] > 0.2 ? 1 : 0), 0);
  const coastalMask = landMask.map((land, index) => land && waterDistance.distances[index] <= 2);
  const interiorMask = landMask.map((land, index) => land && waterDistance.distances[index] >= 6);
  const windwardMask = landMask.map((land, index) => land && atmosphere.upwind[index] >= 0 && normalizedRelief[index] - normalizedRelief[atmosphere.upwind[index]] > 0.09);
  const leewardMask = landMask.map((land, index) => land && atmosphere.upwind[index] >= 0 && normalizedRelief[atmosphere.upwind[index]] - normalizedRelief[index] > 0.09);
  let maximumWindJump = 0;
  let maximumTemperatureJump = 0;
  for (let index = 0; index < area; index += 1) {
    for (const adjacent of neighbors(index, width, height, wraps)) {
      maximumWindJump = Math.max(maximumWindJump, Math.hypot(atmosphere.windX[index] - atmosphere.windX[adjacent], atmosphere.windY[index] - atmosphere.windY[adjacent]));
      maximumTemperatureJump = Math.max(maximumTemperatureJump, Math.abs(smoothedTemperatures[index] - smoothedTemperatures[adjacent]));
    }
  }
  const structure: GenerationStructure = {
    engine: "PHYSICAL",
    objects: [...plateObjects, ...continents, ...basins, ...atmosphericCells, ...climateObjects, ...rainShadows, ...glacialRegions, ...watershedObjects],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: {
      passes: 9,
      plates: plateObjects.length,
      continentalPlates: plates.filter((plate) => plate.continental).length,
      continents: continents.length,
      oceanBasins: basins.length,
      atmosphericCells: atmosphericCells.length,
      climateRegions: climateObjects.length,
      rainShadows: rainShadows.length,
      glacialRegions: glacialRegions.length,
      watersheds: watershedObjects.length,
      outletBasins: drainage.outletCount,
      mountainRanges: ranges.length,
      convergentTiles: convergence.filter((value) => value > 0.08).length,
      divergentTiles: divergence.filter((value) => value > 0.08).length,
      meanTemperature: Math.round(mean(smoothedTemperatures, landMask) * 1000),
      meanMoisture: Math.round(mean(moistures, landMask) * 1000),
      meanPrecipitation: Math.round(mean(atmosphere.precipitation, landMask) * 100000),
      meanAnnualRange: Math.round(mean(annualRange, landMask) * 1000),
      coastalAnnualRange: Math.round(mean(annualRange, coastalMask) * 1000),
      interiorAnnualRange: Math.round(mean(annualRange, interiorMask) * 1000),
      meanContinentality: Math.round(mean(continentality, landMask) * 1000),
      meanWindX: Math.round(mean(atmosphere.windX) * 1000),
      maximumWindJump: Math.round(maximumWindJump * 1000),
      maximumTemperatureJump: Math.round(maximumTemperatureJump * 1000),
      windwardPrecipitation: Math.round(mean(atmosphere.precipitation, windwardMask) * 100000),
      leewardPrecipitation: Math.round(mean(atmosphere.precipitation, leewardMask) * 100000),
      meanRunoff: Math.round(mean(runoff, landMask) * 100000),
      westerlyTiles,
      easterlyTiles: area - westerlyTiles,
      drainageCorridorTiles: drainage.guidance.filter((value) => value >= 0.45).length,
      majorDrainageTiles: drainage.guidance.filter((value) => value >= 0.85).length,
      characterActivity: Math.round(character.physical.activity * 100),
      characterClimateVariance: Math.round(character.physical.climateVariance * 100),
      characterMoistureEfficiency: Math.round(character.physical.moistureEfficiency * 100),
    },
  };
  return { landMask, reliefValues, temperatures: smoothedTemperatures, moistures, elevations, riverGuidance: drainage.guidance, tiles, structure };
}
