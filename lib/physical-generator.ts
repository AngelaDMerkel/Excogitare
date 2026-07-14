import type { Civ5Tile } from "./civ5-map.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";

type Point = { x: number; y: number };
type Plate = Point & { vx: number; vy: number; continental: boolean };

export type PhysicalGeography = {
  landMask: boolean[];
  reliefValues: number[];
  temperatures: number[];
  moistures: number[];
  elevations: number[];
  tiles: Civ5Tile[];
  structure: GenerationStructure;
};

function clamp(value: number, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function smooth(value: number) { return value * value * (3 - 2 * value); }

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

function distance(one: Point, two: Point, width: number, height: number, wraps: boolean) {
  let dx = Math.abs(one.x - two.x);
  if (wraps) dx = Math.min(dx, width - dx);
  return Math.hypot(dx, Math.abs(one.y - two.y) * 0.866);
}

function createPlates(count: number, width: number, height: number, wraps: boolean, random: () => number) {
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
    return { ...center, vx: Math.cos(angle), vy: Math.sin(angle), continental: index % 3 !== 0 };
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

function chooseTerrain(temperature: number, moisture: number, dominant: MapGenerationOptions["dominantTerrains"]) {
  const chosen = new Set(dominant);
  const scores: Array<[number, number]> = [
    [2, 1.02 - Math.abs(moisture - 0.72) * 1.3 - Math.abs(temperature - 0.62) * 0.7 + (chosen.has("GRASSLAND") ? 0.6 : 0)],
    [3, 0.94 - Math.abs(moisture - 0.48) * 1.05 - Math.abs(temperature - 0.57) * 0.4 + (chosen.has("PLAINS") ? 0.6 : 0)],
    [4, 0.58 + (temperature - 0.56) * 0.82 + (0.35 - moisture) * 1.72 + (chosen.has("DESERT") ? 0.6 : 0)],
    [5, 0.7 + (0.4 - temperature) * 1.7 - Math.abs(moisture - 0.48) * 0.3 + (chosen.has("TUNDRA") ? 0.6 : 0)],
    [6, 0.72 + (0.23 - temperature) * 3.6],
  ];
  return scores.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

export function generatePhysicalGeography(options: MapGenerationOptions, width: number, height: number, wraps: boolean, seed: number, random: () => number): PhysicalGeography {
  const area = width * height;
  const presetPlateShift = options.preset === "COLLIDING_PLATES" ? 3 : options.preset === "ANCIENT_CRATONS" ? -2 : 0;
  const plateCount = Math.max(6, Math.min(24, Math.round(Math.sqrt(area) / 4.4) + presetPlateShift));
  const plates = createPlates(plateCount, width, height, wraps, random);
  const { owners, second, boundary } = assignPlates(plates, width, height, wraps);
  const presetActivity = options.preset === "COLLIDING_PLATES" ? 1.15 : options.preset === "ANCIENT_CRATONS" ? 0.82 : 1;
  const activity = (options.plateActivity === "VIOLENT" ? 1.18 : options.plateActivity === "QUIET" ? 0.55 : 0.82) * presetActivity;
  const baseElevation = new Array<number>(area);
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
    const crust = one.continental ? 0.64 : 0.31;
    const continentalNoise = valueNoise(x + 101, y + 211, 18, seed + 101) * 0.22;
    const regionalNoise = valueNoise(x + 307, y + 83, 7, seed + 211) * 0.12;
    baseElevation[index] = crust + continentalNoise + regionalNoise + convergence[index] * 0.38 - divergence[index] * 0.28;
  }

  const landCount = area - Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const landMask = exactTopMask(baseElevation.map((value, index) => value + hashNoise(index % width, Math.floor(index / width), seed + 313) * 0.00001), landCount);
  let reliefValues = baseElevation.map((value, index) => value + convergence[index] * 0.62 - divergence[index] * 0.18);
  const baseErosionPasses = options.erosionStrength === "STRONG" ? 4 : options.erosionStrength === "LIGHT" ? 1 : 2;
  const erosionPasses = Math.max(1, baseErosionPasses + (options.preset === "ANCIENT_CRATONS" ? 1 : options.preset === "COLLIDING_PLATES" ? -1 : 0));
  for (let pass = 0; pass < erosionPasses; pass += 1) {
    const next = [...reliefValues];
    for (let index = 0; index < area; index += 1) {
      const adjacent = neighbors(index, width, height, wraps);
      const mean = adjacent.reduce((sum, neighbor) => sum + reliefValues[neighbor], 0) / Math.max(1, adjacent.length);
      const erosion = options.erosionStrength === "STRONG" ? 0.24 : options.erosionStrength === "LIGHT" ? 0.09 : 0.16;
      next[index] = reliefValues[index] * (1 - erosion) + mean * erosion + convergence[index] * 0.08;
    }
    reliefValues = next;
  }

  const effectiveMountains = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" || options.style === "BRUTAL" ? Math.max(18, options.mountainPercent) : options.mountainPercent;
  const landIndices = landMask.flatMap((land, index) => land ? [index] : []);
  const mountainCount = Math.round(landIndices.length * clamp(effectiveMountains / 100, 0, 0.42));
  const hillShare = options.worldAge === "YOUNG" ? 0.27 : options.worldAge === "OLD" ? 0.12 : 0.19;
  const rankedLand = [...landIndices].sort((one, two) => reliefValues[two] - reliefValues[one]);
  const mountains = new Set(rankedLand.slice(0, mountainCount));
  const hills = new Set(rankedLand.slice(mountainCount, mountainCount + Math.round(landIndices.length * hillShare)));
  const elevations = landMask.map((_land, index) => mountains.has(index) ? 2 : hills.has(index) ? 1 : 0);

  const temperatures = new Array<number>(area);
  const moistures = new Array<number>(area);
  const climateShift = options.climate === "HOT" ? 0.14 : options.climate === "COOL" ? -0.14 : 0;
  const rainShift = options.rainfall === "WET" ? 0.14 : options.rainfall === "ARID" ? -0.16 : 0;
  for (let y = 0; y < height; y += 1) {
    const latitude = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
    let airborne = clamp(0.58 + rainShift + (valueNoise(0, y + 17, 9, seed + 419) - 0.5) * 0.16);
    let upwind = reliefValues[y * width];
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const altitude = landMask[index] ? Math.max(0, reliefValues[index] - 0.48) * 0.28 : 0;
      temperatures[index] = clamp(0.1 + Math.cos(latitude * Math.PI / 2) * 0.82 + climateShift + (valueNoise(x + 701, y + 503, 12, seed + 521) - 0.5) * 0.18 - altitude);
      if (!landMask[index]) airborne += (0.88 - airborne) * 0.36;
      else airborne += (0.48 + rainShift - airborne) * 0.07;
      const rise = Math.max(0, reliefValues[index] - upwind);
      const lift = rise * 0.78 + (elevations[index] === 2 ? 0.07 : elevations[index] === 1 ? 0.018 : 0);
      moistures[index] = clamp(airborne + lift * 0.72 + (valueNoise(x + 137, y + 811, 8, seed + 617) - 0.5) * 0.1);
      airborne = clamp(airborne - lift * 0.86);
      upwind = reliefValues[index];
    }
  }

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  const continentByTile = new Int32Array(area).fill(-1);
  continents.forEach((continent, owner) => continent.tileIndices.forEach((index) => { continentByTile[index] = owner; }));
  const climateAssignments = new Int32Array(area).fill(-1);
  for (let index = 0; index < area; index += 1) if (landMask[index]) climateAssignments[index] = temperatures[index] < 0.28 ? 0 : temperatures[index] > 0.7 && moistures[index] < 0.32 ? 1 : moistures[index] > 0.68 ? 2 : moistures[index] < 0.4 ? 3 : 4;

  const tiles = landMask.map<Civ5Tile>((land, index) => {
    const adjacentLand = neighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    const terrain = land ? chooseTerrain(temperatures[index], moistures[index], options.dominantTerrains) : adjacentLand ? 1 : 0;
    let feature = 255;
    if (!land && Math.abs(Math.floor(index / width) / Math.max(1, height - 1) - 0.5) > 0.44 && random() > 0.4) feature = 3;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && temperatures[index] > 0.72 && moistures[index] > 0.67) feature = 1;
    else if (land && elevations[index] === 0 && terrain === 2 && moistures[index] > 0.84) feature = 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && moistures[index] > 0.61) feature = 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.22 && random() > 0.96) feature = 4;
    return { terrain, resource: 255, feature, river: 0, elevation: elevations[index], continent: land ? continentByTile[index] + 1 : 0, wonder: 255, resourceAmount: 0 };
  });

  const plateObjects = objectsFromAssignments("TECTONIC_PLATE", owners, plates.length, "Plate").map((object, index) => ({ ...object, attributes: { continental: plates[index].continental, motionX: Number(plates[index].vx.toFixed(3)), motionY: Number(plates[index].vy.toFixed(3)) } }));
  const climateObjects = objectsFromAssignments("CLIMATE_REGION", climateAssignments, 5, "Climate Zone");
  const ranges = connectedLinearFeatures(elevations.map((elevation, index) => landMask[index] && elevation === 2 && convergence[index] > 0.08), width, height, wraps, "Mountain Range");
  const structure: GenerationStructure = {
    engine: "PHYSICAL",
    objects: [...plateObjects, ...continents, ...basins, ...climateObjects],
    mountainRanges: ranges,
    riverSystems: [],
    diagnostics: { plates: plateObjects.length, continents: continents.length, oceanBasins: basins.length, climateRegions: climateObjects.length, mountainRanges: ranges.length, convergentTiles: convergence.filter((value) => value > 0.08).length, divergentTiles: divergence.filter((value) => value > 0.08).length },
  };
  return { landMask, reliefValues, temperatures, moistures, elevations, tiles, structure };
}
