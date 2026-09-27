import type { Civ5Tile } from "./civ5-map.ts";
import { connectedLinearFeatures, connectedTileObjects, objectsFromAssignments, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { WorldScale } from "./generation-recipe.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";
import { narrativeInfluenceStrength, type NarrativeAdapterPlan, type PhysicalConditionPlan } from "./narrative-engine-adapters.ts";
import { riverEdgeDefinitions, riverFlowsFromAToB, RIVER_DATA_MASK } from "./rivers.ts";

type Point = { x: number; y: number };
type Plate = Point & {
  vx: number;
  vy: number;
  continental: boolean;
  causeRole: string;
  crustAge: number;
  stability: number;
  protectedSemanticId?: string;
  protectedSemanticKind?: string;
  protectedSemanticPolicy?: string;
};
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

function connectedMediumRoute(
  fromTiles: readonly number[],
  toTiles: readonly number[],
  allowed: (index: number) => boolean,
  guideTiles: readonly number[],
  width: number,
  height: number,
  wraps: boolean,
  precomputedGuideDistances?: Float64Array,
) {
  const withinMedium = (tiles: readonly number[]) => {
    const direct = tiles.filter(allowed);
    if (direct.length) return direct;
    const adjacent = new Set<number>();
    for (const tile of tiles) for (const next of neighbors(tile, width, height, wraps)) if (allowed(next)) adjacent.add(next);
    return [...adjacent];
  };
  const sources = withinMedium(fromTiles);
  const targets = new Set(withinMedium(toTiles));
  if (!sources.length || !targets.size) return [];
  const guides = precomputedGuideDistances ? [] : guideTiles.map((index) => ({ x: index % width, y: Math.floor(index / width) }));
  const guideDistance = (index: number) => precomputedGuideDistances?.[index] ?? (guides.length
    ? Math.min(...guides.map((guide) => distance({ x: index % width, y: Math.floor(index / width) }, guide, width, height, wraps)))
    : 0);
  const heap = new MinHeap();
  const cost = new Float64Array(width * height);
  cost.fill(Number.POSITIVE_INFINITY);
  const previous = new Map<number, number>();
  for (const source of sources) {
    const initial = guideDistance(source) * 0.12;
    if (initial >= cost[source]) continue;
    cost[source] = initial;
    previous.set(source, -1);
    heap.push(source, initial);
  }
  let outlet: number | undefined;
  while (heap.length) {
    const current = heap.pop()!;
    if (current.priority !== cost[current.index]) continue;
    if (targets.has(current.index)) { outlet = current.index; break; }
    for (const next of neighbors(current.index, width, height, wraps).filter(allowed)) {
      const candidate = current.priority + 1 + guideDistance(next) * 0.16;
      if (candidate >= cost[next]) continue;
      cost[next] = candidate;
      previous.set(next, current.index);
      heap.push(next, candidate);
    }
  }
  if (outlet === undefined) return [];
  const route = [outlet];
  while (previous.get(route.at(-1)!) !== -1) route.push(previous.get(route.at(-1)!)!);
  return route.reverse();
}

function routeGuideDistances(guideTiles: readonly number[], width: number, height: number, wraps: boolean) {
  const result = new Float64Array(width * height);
  if (!guideTiles.length) return result;
  const guides = guideTiles.map((index) => ({ x: index % width, y: Math.floor(index / width) }));
  for (let index = 0; index < result.length; index += 1) result[index] = Math.min(...guides.map((guide) => distance(
    { x: index % width, y: Math.floor(index / width) },
    guide,
    width,
    height,
    wraps,
  )));
  return result;
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
    return { ...center, vx: Math.cos(angle), vy: Math.sin(angle), continental, causeRole: "MOBILE_CRUST", crustAge: 0.3 + index / Math.max(1, count - 1) * 0.55, stability: 0.45 };
  });
}

function applyPresetInitialConditions(plates: Plate[], options: MapGenerationOptions, width: number, height: number) {
  const rolesByPreset: Record<string, string[]> = {
    DYNAMIC_EARTH: ["ANCIENT_CRATON", "YOUNG_COLLISION", "CONTINENTAL_RIFT", "PASSIVE_MARGIN", "ACTIVE_MARGIN"],
    COLLIDING_PLATES: ["COLLISION_CORE", "COLLISION_FORELAND", "SUTURE_BELT", "COMPRESSED_MARGIN"],
    ANCIENT_CRATONS: ["ANCIENT_CRATON", "ERODED_SHIELD", "SEDIMENTARY_BASIN", "GHOST_SUTURE"],
    ISLAND_ARC_EARTH: ["SUBDUCTING_OCEAN", "VOLCANIC_ARC", "BACK_ARC_BASIN", "FOREARC"],
    SUPERCONTINENT_INTERIOR: ["INTERIOR_BASIN", "PERIPHERAL_HIGHLAND", "CONTINENTAL_CORE", "RIFTED_MARGIN"],
    MONSOON_CONTINENTS: ["MOISTURE_SOURCE", "WINDWARD_RANGE", "MONSOON_CATCHMENT", "LEEWARD_INTERIOR"],
    ICEHOUSE_EARTH: ["ICE_ACCUMULATION", "GLACIAL_FRONTIER", "COLD_CRATON", "CLIMATE_REFUGE"],
  };
  const roles = rolesByPreset[options.preset] ?? rolesByPreset.DYNAMIC_EARTH;
  for (const [index, plate] of plates.entries()) {
    plate.causeRole = roles[index % roles.length];
    if (options.preset === "ANCIENT_CRATONS") {
      plate.vx *= 0.2;
      plate.vy *= 0.2;
      plate.crustAge = 0.78 + index / Math.max(1, plates.length - 1) * 0.2;
      plate.stability = 0.88 + (index % 3) * 0.035;
    } else if (options.preset === "COLLIDING_PLATES") {
      const dx = width * 0.5 - plate.x;
      const dy = (height * 0.5 - plate.y) * 0.866;
      const magnitude = Math.max(0.001, Math.hypot(dx, dy));
      plate.vx = dx / magnitude;
      plate.vy = dy / magnitude;
      plate.crustAge = 0.24 + (index % 4) * 0.09;
      plate.stability = 0.18 + (index % 3) * 0.06;
    } else if (options.preset === "ISLAND_ARC_EARTH") {
      plate.continental = index % 4 === 1 || index % 4 === 3;
      const angle = Math.atan2((height * 0.5 - plate.y) * 0.866, width * 0.5 - plate.x);
      const converging = index % 2 === 0;
      plate.vx = Math.cos(angle + (converging ? 0 : Math.PI / 2));
      plate.vy = Math.sin(angle + (converging ? 0 : Math.PI / 2));
      plate.crustAge = converging ? 0.18 : 0.42;
      plate.stability = converging ? 0.16 : 0.34;
    } else if (options.preset === "SUPERCONTINENT_INTERIOR") {
      plate.continental = index !== 0;
      plate.crustAge = 0.58 + (index % 4) * 0.08;
      plate.stability = 0.7;
    } else if (options.preset === "ICEHOUSE_EARTH") {
      plate.crustAge = 0.62 + (index % 4) * 0.075;
      plate.stability = 0.72;
      plate.vx *= 0.55;
      plate.vy *= 0.55;
    } else if (options.preset === "MONSOON_CONTINENTS") {
      plate.crustAge = 0.4 + (index % 4) * 0.1;
      plate.stability = 0.52;
    } else {
      plate.crustAge = 0.2 + (index % 5) * 0.16;
      plate.stability = 0.3 + (index % 4) * 0.12;
    }
  }
}

function applyNarrativePlateConditions(plates: Plate[], plan: PhysicalConditionPlan | undefined, constraints: GenerationConstraintPayload | undefined, width: number, height: number, wraps: boolean) {
  if (!plates.length) return;
  const regions = new Map((plan?.regions ?? []).map((region) => [region.id, region]));
  for (let index = 0; index < Math.min(plates.length, plan?.regions.length ?? 0); index += 1) {
    if (!plan) break;
    const region = plan.regions[index];
    plates[index].x = region.anchor.x * width;
    plates[index].y = region.anchor.y * height;
    if (region.effect === "WATER") plates[index].continental = false;
    else if (["LAND", "VALUE", "RIDGE", "LOWLAND", "WET", "DRY", "BARREN", "VOLCANIC"].includes(region.effect)) plates[index].continental = true;
  }
  const nearestTwo = (point: { x: number; y: number }) => plates.map((_plate, plate) => plate).sort((one, two) => distance(plates[one], point, width, height, wraps) - distance(plates[two], point, width, height, wraps)).slice(0, 2);
  for (const path of plan?.paths ?? []) {
    if (path.effect !== "RIDGE_PATH" && path.effect !== "WATER_PATH") continue;
    const from = regions.get(path.from)?.anchor ?? path.points[0];
    const to = regions.get(path.to)?.anchor ?? path.points.at(-1);
    if (!from || !to) continue;
    const pair = [...new Set([...nearestTwo({ x: from.x * width, y: from.y * height }), ...nearestTwo({ x: to.x * width, y: to.y * height })])].slice(0, 2);
    if (pair.length < 2) continue;
    const one = plates[pair[0]]; const two = plates[pair[1]];
    let dx = two.x - one.x; if (wraps && Math.abs(dx) > width / 2) dx += dx > 0 ? -width : width;
    const dy = (two.y - one.y) * 0.866; const magnitude = Math.max(0.001, Math.hypot(dx, dy));
    const sign = path.effect === "RIDGE_PATH" ? 1 : -1;
    one.vx = dx / magnitude * sign; one.vy = dy / magnitude * sign;
    two.vx = -dx / magnitude * sign; two.vy = -dy / magnitude * sign;
  }
  for (const [semanticIndex, semantic] of (constraints?.semantics ?? []).entries()) {
    const plate = plates[semanticIndex % plates.length];
    plate.x = semantic.anchorIndex % width;
    plate.y = Math.floor(semantic.anchorIndex / width);
    plate.protectedSemanticId = semantic.sourceSemanticId;
    plate.protectedSemanticKind = semantic.objectKind;
    plate.protectedSemanticPolicy = semantic.policy;
    if (/OCEAN|SEA|LAKE|RIFT/.test(semantic.objectKind)) plate.continental = false;
    else if (/CONTINENT|LAND|MOUNTAIN|RANGE|WATERSHED|CLIMATE/.test(semantic.objectKind)) plate.continental = true;
    for (const related of semantic.relatedAnchors) {
      const other = plates[(semanticIndex + 1) % plates.length];
      other.x = related.index % width; other.y = Math.floor(related.index / width);
      let dx = other.x - plate.x; if (wraps && Math.abs(dx) > width / 2) dx += dx > 0 ? -width : width;
      const dy = (other.y - plate.y) * 0.866; const magnitude = Math.max(0.001, Math.hypot(dx, dy));
      const convergent = /MOUNTAIN|RANGE|RIDGE/.test(semantic.objectKind);
      const sign = convergent ? 1 : /OCEAN|SEA|RIFT/.test(semantic.objectKind) ? -1 : 0.2;
      plate.vx = dx / magnitude * sign; plate.vy = dy / magnitude * sign;
      other.vx = -dx / magnitude * sign; other.vy = -dy / magnitude * sign;
    }
  }
}

function physicalSemanticFields(constraints: GenerationConstraintPayload | undefined, area: number) {
  const topology = new Float32Array(area);
  const relief = new Float32Array(area);
  const temperature = new Float32Array(area);
  const moisture = new Float32Array(area);
  const drainage = new Float32Array(area);
  let influencedTiles = 0;
  for (const semantic of constraints?.semantics ?? []) {
    const indices = new Set([semantic.anchorIndex, ...semantic.tileIndices]);
    for (const index of indices) {
      if (index < 0 || index >= area) continue;
      influencedTiles += 1;
      if (/OCEAN|SEA|LAKE|RIFT/.test(semantic.objectKind)) topology[index] = Math.min(topology[index], -0.72);
      if (/CONTINENT|LAND|CRATON|PLATE/.test(semantic.objectKind)) topology[index] = Math.max(topology[index], 0.52);
      if (/MOUNTAIN|RANGE|RIDGE/.test(semantic.objectKind)) relief[index] = Math.max(relief[index], 0.78);
      if (/GLACIAL|ICE/.test(semantic.objectKind)) temperature[index] = Math.min(temperature[index], -0.62);
      if (/REFUGE/.test(semantic.objectKind)) {
        temperature[index] = Math.max(temperature[index], 0.46);
        moisture[index] = Math.max(moisture[index], 0.34);
      }
      if (/RAIN_SHADOW|WASTE|DESERT/.test(semantic.objectKind)) moisture[index] = Math.min(moisture[index], -0.56);
      if (/WATERSHED|RIVER|CATCHMENT/.test(semantic.objectKind)) drainage[index] = Math.max(drainage[index], 0.82);
    }
  }
  return { topology, relief, temperature, moisture, drainage, influencedTiles };
}

function separatePlateCenters(plates: Plate[], width: number, height: number, wraps: boolean) {
  const accepted: Point[] = [];
  const order = plates.map((_plate, index) => index).sort((one, two) => Number(Boolean(plates[two].protectedSemanticId)) - Number(Boolean(plates[one].protectedSemanticId)) || one - two);
  for (const index of order) {
    const plate = plates[index];
    const origin = { x: Math.max(0, Math.min(width - 1, Math.round(plate.x))), y: Math.max(0, Math.min(height - 1, Math.round(plate.y))) };
    let chosen = origin;
    if (accepted.some((other) => distance(origin, other, width, height, wraps) < 1.5)) {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const candidate = { x, y };
        if (accepted.some((other) => distance(candidate, other, width, height, wraps) < 1.5)) continue;
        const displacement = distance(origin, candidate, width, height, wraps);
        if (displacement < bestDistance) { chosen = candidate; bestDistance = displacement; }
      }
    }
    plate.x = chosen.x;
    plate.y = chosen.y;
    accepted.push(chosen);
  }
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

type EncodedRiverSystem = {
  tileIndices: number[];
  sourceTileIndices: number[];
  outletTileIndices: number[];
  edgeCount: number;
  directedToOutlet: boolean;
};

/** Decode Civ V's edge-owned river bits into directed, contiguous systems.
 * This is used only to decide which Physical hydrology reservations actually
 * survived the final river solve; the independent verifier performs its own
 * reconstruction before accepting them as evidence. */
function encodedRiverSystems(tiles: readonly Civ5Tile[], width: number, height: number, wraps: boolean): EncodedRiverSystem[] {
  type Edge = { a: string; b: string; from: string; to: string; owner: number; neighbor: number };
  const edges: Edge[] = [];
  const adjacency = new Map<string, number[]>();
  const directed = new Map<string, string[]>();
  const vertexTiles = new Map<string, Set<number>>();
  const addVertex = (vertex: string, indices: readonly number[]) => {
    const values = vertexTiles.get(vertex) ?? new Set<number>();
    for (const index of indices) values.add(index);
    vertexTiles.set(vertex, values);
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const owner = y * width + x;
    if (tiles[owner].river & ~RIVER_DATA_MASK) continue;
    for (const definition of riverEdgeDefinitions(x, y)) {
      let nextX = x + definition.dx;
      const nextY = y + definition.dy;
      if (wraps) nextX = (nextX + width) % width;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height || Math.abs(nextX - x) > 1) continue;
      const neighbor = nextY * width + nextX;
      addVertex(definition.a, [owner, neighbor]);
      addVertex(definition.b, [owner, neighbor]);
      if (!(tiles[owner].river & definition.bit) || tiles[owner].terrain < 2 || tiles[neighbor].terrain < 2) continue;
      const fromAToB = riverFlowsFromAToB(tiles[owner].river, definition.bit);
      const edgeIndex = edges.length;
      edges.push({
        a: definition.a,
        b: definition.b,
        from: fromAToB ? definition.a : definition.b,
        to: fromAToB ? definition.b : definition.a,
        owner,
        neighbor,
      });
      adjacency.set(definition.a, [...(adjacency.get(definition.a) ?? []), edgeIndex]);
      adjacency.set(definition.b, [...(adjacency.get(definition.b) ?? []), edgeIndex]);
      directed.set(fromAToB ? definition.a : definition.b, [...(directed.get(fromAToB ? definition.a : definition.b) ?? []), fromAToB ? definition.b : definition.a]);
    }
  }
  const systems: EncodedRiverSystem[] = [];
  const visited = new Set<string>();
  for (const origin of adjacency.keys()) {
    if (visited.has(origin)) continue;
    const queue = [origin];
    const vertices: string[] = [];
    const componentEdges = new Set<number>();
    visited.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      vertices.push(vertex);
      for (const edgeIndex of adjacency.get(vertex) ?? []) {
        componentEdges.add(edgeIndex);
        const edge = edges[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    if (componentEdges.size < 2 || componentEdges.size !== vertices.length - 1) continue;
    const endpoints = vertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) === 1);
    const sourceVertices = endpoints.filter((vertex) => [...(vertexTiles.get(vertex) ?? [])]
      .some((index) => tiles[index].terrain >= 2 && tiles[index].elevation === 2));
    const outletVertices = endpoints.filter((vertex) => [...(vertexTiles.get(vertex) ?? [])]
      .some((index) => tiles[index].terrain < 2));
    const componentVertices = new Set(vertices);
    const outlets = new Set(outletVertices);
    const reachesOutlet = (source: string) => {
      const reached = new Set([source]);
      const flow = [source];
      for (let cursor = 0; cursor < flow.length; cursor += 1) for (const next of directed.get(flow[cursor]) ?? []) {
        if (!componentVertices.has(next) || reached.has(next)) continue;
        reached.add(next);
        flow.push(next);
      }
      return [...outlets].some((outlet) => reached.has(outlet));
    };
    const component = [...componentEdges].map((edgeIndex) => edges[edgeIndex]);
    systems.push({
      tileIndices: [...new Set(component.flatMap((edge) => [edge.owner, edge.neighbor]))],
      sourceTileIndices: [...new Set(sourceVertices.flatMap((vertex) => [...(vertexTiles.get(vertex) ?? [])]
        .filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation === 2)))],
      outletTileIndices: [...new Set(outletVertices.flatMap((vertex) => [...(vertexTiles.get(vertex) ?? [])]
        .filter((index) => tiles[index].terrain < 2)))],
      edgeCount: componentEdges.size,
      directedToOutlet: sourceVertices.length > 0 && outletVertices.length > 0
        && vertices.every((vertex) => outlets.has(vertex) || reachesOutlet(vertex)),
    });
  }
  return systems;
}

function nearbyTiles(one: readonly number[], two: readonly number[], width: number, height: number, wraps: boolean, radius = 1) {
  const reached = new Set(one);
  let frontier = [...reached];
  for (let step = 0; step < radius; step += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of neighbors(index, width, height, wraps)) if (!reached.has(neighbor)) {
      reached.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return two.some((index) => reached.has(index));
}

function waterTilesConnectedTo(origins: readonly number[], tiles: readonly Civ5Tile[], width: number, height: number, wraps: boolean) {
  const queue = origins.filter((index) => tiles[index]?.terrain < 2);
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], width, height, wraps)) {
    if (reached.has(next) || tiles[next].terrain >= 2) continue;
    reached.add(next);
    queue.push(next);
  }
  return reached;
}

/** Retain only Physical drainage causes that became real directed Civ V edge
 * systems. Unmatched plan entries remain in the native plan and are later
 * rebound as unretained, rather than being promoted from a cached label. */
export function retainRealizedPhysicalHydrology(
  tiles: readonly Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
  structure: GenerationStructure,
): GenerationStructure {
  if (structure.engine !== "PHYSICAL") return structure;
  const rivers = encodedRiverSystems(tiles, width, height, wraps).filter((river) => river.directedToOutlet);
  const native = structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
  const bySkeletonId = new Map(native.map((object) => [object.id.replace(/^narrative-/, ""), object]));
  const selected = new Map<string, GeographicObject>();
  let reboundInteriorSea: GeographicObject | undefined;
  const usedRivers = new Set<number>();
  const overlap = (river: EncodedRiverSystem, object: GeographicObject) => river.tileIndices.filter((index) => object.tileIndices.includes(index)).length;
  const rankedMatches = (object: GeographicObject) => rivers.map((river, index) => ({
    river,
    index,
    overlap: overlap(river, object),
    nearby: nearbyTiles(river.tileIndices, object.tileIndices, width, height, wraps, 1),
  })).filter((entry) => !usedRivers.has(entry.index) && (entry.overlap > 0 || entry.nearby))
    .sort((one, two) => two.overlap - one.overlap || two.river.edgeCount - one.river.edgeCount || one.index - two.index);
  const retain = (object: GeographicObject, river: EncodedRiverSystem, systemIndex: number) => {
    selected.set(object.id, {
      ...object,
      tileIndices: [...river.tileIndices],
      attributes: { ...object.attributes, finalRiverSystem: systemIndex + 1, finalRiverEdges: river.edgeCount, finalRiverContact: true },
    });
    usedRivers.add(systemIndex);
  };
  const targetedRoles = new Set<string>();
  const profile = structure.narrativeAdapter?.profileId;
  if (profile === "ANCIENT_CRATONS") {
    targetedRoles.add("GHOST_RANGE");
    targetedRoles.add("MATURE_DRAINAGE");
    for (const drainage of native.filter((object) => object.attributes?.role === "MATURE_DRAINAGE")) {
      const range = native.find((object) => object.attributes?.role === "GHOST_RANGE"
        && object.attributes?.from === drainage.attributes?.from && object.attributes?.to === drainage.attributes?.to);
      if (!range || !range.tileIndices.some((index) => tiles[index].terrain >= 2 && tiles[index].elevation > 0)) continue;
      const match = rankedMatches(drainage).find((entry) => entry.river.sourceTileIndices
        .some((source) => nearbyTiles([source], range.tileIndices, width, height, wraps, 3)));
      if (!match) continue;
      retain(drainage, match.river, match.index);
      selected.set(range.id, { ...range, attributes: { ...range.attributes, finalRiverSystem: match.index + 1, finalRiverContact: true } });
    }
  } else if (profile === "SUPERCONTINENT_INTERIOR") {
    targetedRoles.add("INWARD_DRAINAGE");
    const sea = native.find((object) => object.attributes?.role === "INTERIOR_SEA");
    const basin = sea ? waterTilesConnectedTo(sea.tileIndices, tiles, width, height, wraps) : new Set<number>();
    if (sea && basin.size) reboundInteriorSea = {
      ...sea,
      tileIndices: [...basin],
      attributes: { ...sea.attributes, finalWaterComponent: true, finalWaterTiles: basin.size },
    };
    const drainages = native.filter((object) => object.attributes?.role === "INWARD_DRAINAGE");
    const targetCatchments = Math.min(3, drainages.length);
    const selectedDrainages = Array.from({ length: drainages.length }, (_value, position) => drainages[(position % targetCatchments) * Math.ceil(drainages.length / targetCatchments) + Math.floor(position / targetCatchments)])
      .filter((drainage): drainage is GeographicObject => Boolean(drainage));
    const usedSources = new Set<number>();
    for (const drainage of selectedDrainages) {
      if (selected.size >= targetCatchments) break;
      const highland = bySkeletonId.get(String(drainage.attributes?.from ?? ""));
      if (!highland) continue;
      const match = rivers.map((river, index) => ({ river, index, overlap: overlap(river, drainage) }))
        .filter((entry) => !usedRivers.has(entry.index)
          && (entry.overlap > 0 || nearbyTiles(entry.river.tileIndices, drainage.tileIndices, width, height, wraps, 1))
          && entry.river.outletTileIndices.some((outlet) => basin.has(outlet)))
        .flatMap((entry) => entry.river.sourceTileIndices
          .filter((source) => !usedSources.has(source) && nearbyTiles([source], highland.tileIndices, width, height, wraps, 4))
          .map((source) => ({ ...entry, source })))
        .sort((one, two) => two.overlap - one.overlap || two.river.edgeCount - one.river.edgeCount || one.source - two.source)[0];
      if (!match) continue;
      selected.set(drainage.id, {
        ...drainage,
        tileIndices: [...match.river.tileIndices],
        attributes: { ...drainage.attributes, finalRiverSystem: match.index + 1, finalRiverEdges: match.river.edgeCount, finalRiverContact: true, finalRiverSource: match.source },
      });
      usedSources.add(match.source);
      usedRivers.add(match.index);
    }
  } else if (profile === "MONSOON_CONTINENTS") {
    targetedRoles.add("LIVING_RIVER");
    for (const drainage of native.filter((object) => object.attributes?.role === "LIVING_RIVER")) {
      const wall = bySkeletonId.get(String(drainage.attributes?.from ?? ""));
      const coast = bySkeletonId.get(String(drainage.attributes?.to ?? ""));
      if (!wall || !coast) continue;
      const match = rankedMatches(drainage).find((entry) => entry.river.sourceTileIndices.some((source) => nearbyTiles([source], wall.tileIndices, width, height, wraps, 3))
        && entry.river.outletTileIndices.some((outlet) => nearbyTiles([outlet], coast.tileIndices, width, height, wraps, 2)));
      if (match) retain(drainage, match.river, match.index);
    }
  }
  if (!targetedRoles.size) return structure;
  const targeted = native.filter((object) => targetedRoles.has(String(object.attributes?.role ?? "")));
  const objects = structure.objects.flatMap((object) => {
    if (reboundInteriorSea?.id === object.id) return [reboundInteriorSea];
    if (!targetedRoles.has(String(object.attributes?.role ?? ""))) return [object];
    const replacement = selected.get(object.id);
    return replacement ? [replacement] : [];
  });
  return {
    ...structure,
    objects,
    diagnostics: {
      ...structure.diagnostics,
      nativePhysicalHydrologyPlanned: targeted.length,
      nativePhysicalHydrologyRetained: selected.size,
      nativePhysicalHydrologyDropped: targeted.length - selected.size,
      nativePhysicalDirectedRiverSystems: rivers.length,
    },
  };
}

export function generatePhysicalGeography(options: MapGenerationOptions, width: number, height: number, wraps: boolean, seed: number, random: () => number, scale: WorldScale = "GLOBAL", constraints?: GenerationConstraintPayload, narrative?: NarrativeAdapterPlan): PhysicalGeography {
  const area = width * height;
  const profile = physicalProfile(options);
  const physicalPlan = narrative?.native.kind === "PHYSICAL_PLAN" ? narrative.native : undefined;
  const semanticFields = physicalSemanticFields(constraints, area);
  const character = worldCharacterProfile(options.style);
  const scaleProfile = worldScaleProfile(scale);
  // Scale owns how many tectonic systems the map represents. Map Size adds
  // samples inside those systems rather than silently turning a Local view
  // into a many-plate planet.
  const nativeSystems = physicalPlan ? (physicalPlan.conditions.plateSystems[0] + physicalPlan.conditions.plateSystems[1]) / 2 : 7 + profile.plateShift;
  const plateCount = Math.max(3, Math.min(24, Math.round((nativeSystems + 1 + profile.plateShift * 0.22) * scaleProfile.physical.plateFrequency)));
  const continentalShare = clamp(profile.continentalShare - (physicalPlan?.conditions.fragmentation ?? 0.3) * 0.08 + 0.025);
  const plates = createPlates(plateCount, continentalShare, width, height, wraps, random);
  applyPresetInitialConditions(plates, options, width, height);
  applyNarrativePlateConditions(plates, physicalPlan, constraints, width, height, wraps);
  separatePlateCenters(plates, width, height, wraps);
  const { owners, second, boundary } = assignPlates(plates, width, height, wraps);
  const nativeActivity = physicalPlan ? 0.78 + physicalPlan.conditions.boundaryAlignment * 0.34 : 1;
  const activity = (options.plateActivity === "VIOLENT" ? 1.18 : options.plateActivity === "QUIET" ? 0.55 : 0.82) * profile.activity * character.physical.activity * nativeActivity;
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
    const narrativeStrength = narrativeInfluenceStrength("PHYSICAL");
    const nx = (x + 0.5) / width - 0.5;
    const ny = (y + 0.5) / height - 0.5;
    const radialDistortion = options.preset === "SUPERCONTINENT_INTERIOR" ? (valueNoise(x + 509, y + 271, Math.max(7, Math.min(width, height) * 0.18), seed + 263) - 0.5) * 0.085 : 0;
    const supercontinentRadius = Math.hypot(nx, ny * 1.08) + radialDistortion;
    const supercontinentBoundary = options.preset === "SUPERCONTINENT_INTERIOR"
      ? supercontinentRadius < 0.23 ? -0.62 : supercontinentRadius > 0.4 ? 0.42 : 0.12
      : 0;
    hypsometry[index] = crust + continentalNoise + regionalNoise + convergence[index] * 0.42 * character.physical.convergenceRelief - divergence[index] * 0.31 * character.physical.divergenceRelief
      + supercontinentBoundary
      + (narrative?.topology[index] ?? 0) * narrativeStrength.topology
      + semanticFields.topology[index] * 0.42;
    convergence[index] = clamp(convergence[index] + Math.max(0, narrative?.relief[index] ?? 0) * narrativeStrength.relief + semanticFields.relief[index] * 0.5);
    divergence[index] = clamp(divergence[index] + Math.max(0, -(narrative?.topology[index] ?? 0)) * narrativeStrength.topology);
  }

  const landCount = area - Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const islandArcPaths = physicalPlan?.profileId === "ISLAND_ARC_EARTH"
    ? physicalPlan.paths.filter((path) => ["VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"].includes(path.kind))
    : [];
  const islandArcGroups = new Map<string, { arc?: PhysicalConditionPlan["paths"][number]; sea?: PhysicalConditionPlan["paths"][number] }>();
  for (const path of islandArcPaths) {
    const key = `${path.from}|${path.to}`;
    const group = islandArcGroups.get(key) ?? {};
    if (path.kind === "VOLCANIC_PARENT_ARC") group.arc = path;
    else if (path.kind === "SHELTERED_ARC_SEA") group.sea = path;
    islandArcGroups.set(key, group);
  }
  const distanceToPath = (index: number, points: readonly Point[]) => {
    const x = (index % width + 0.5) / width;
    const y = (Math.floor(index / width) + 0.5) / height;
    let nearest = Number.POSITIVE_INFINITY;
    for (let position = 0; position < points.length; position += 1) {
      const from = points[Math.max(0, position - 1)];
      const to = points[position];
      let dx = to.x - from.x;
      if (wraps && Math.abs(dx) > 0.5) dx += dx > 0 ? -1 : 1;
      const dy = to.y - from.y;
      const denominator = dx * dx + dy * dy;
      let px = x - from.x;
      if (wraps && Math.abs(px) > 0.5) px += px > 0 ? -1 : 1;
      const amount = denominator > 0 ? clamp((px * dx + (y - from.y) * dy) / denominator) : 0;
      const sampleX = from.x + dx * amount;
      let separationX = Math.abs(x - sampleX);
      if (wraps) separationX = Math.min(separationX, 1 - separationX);
      nearest = Math.min(nearest, Math.hypot(separationX * width, (y - (from.y + dy * amount)) * height * 0.866));
    }
    return nearest;
  };
  const islandArcBias = (index: number) => {
    if (!islandArcPaths.length) return 0;
    let result = 0;
    for (const path of islandArcPaths) {
      const influence = Math.exp(-Math.pow(distanceToPath(index, path.points) / 1.35, 2));
      if (path.kind === "VOLCANIC_PARENT_ARC") result += influence * 0.88;
      else if (path.kind === "ARC_SHELF") result += influence * 0.72;
      else result -= influence * 1.18;
    }
    // The volcanic chain is the subaerial side of a convergent cross-section;
    // its paired sheltered sea is landward. Extend the arc→sea vector through
    // the arc and depress that narrow seaward strip as a real trench. This is
    // an initial hypsometric condition, so the exact water budget still owns
    // the final number of wet tiles.
    for (const { arc, sea } of islandArcGroups.values()) {
      if (!arc || !sea || arc.points.length !== sea.points.length) continue;
      const trench = arc.points.map((point, position) => {
        const landward = sea.points[position];
        let dx = point.x - landward.x;
        if (wraps && Math.abs(dx) > 0.5) dx += dx > 0 ? -1 : 1;
        let x = point.x + dx * 0.62;
        if (wraps) x = (x % 1 + 1) % 1;
        else x = clamp(x, 0.01, 0.99);
        return { x, y: clamp(point.y + (point.y - landward.y) * 0.62, 0.01, 0.99) };
      });
      result -= Math.exp(-Math.pow(distanceToPath(index, trench) / 1.15, 2)) * 0.78;
    }
    return result;
  };
  const ancientCratonBias = (index: number) => {
    if (physicalPlan?.profileId !== "ANCIENT_CRATONS") return 0;
    const paths = physicalPlan.paths.filter((path) => path.kind === "GHOST_RANGE" || path.kind === "MATURE_DRAINAGE");
    if (!paths.length) return 0;
    const nearest = Math.min(...paths.map((path) => distanceToPath(index, path.points)));
    // Ancient shield chains need a terrestrial substrate before erosion and
    // drainage can act on them. Raise a narrow, graded corridor in the
    // hypsometric field; exactTopMask still owns the user's exact sea level,
    // displacing an equal amount of lower-scoring land elsewhere.
    return Math.exp(-Math.pow(nearest / 1.45, 2)) * 1.35;
  };
  const monsoonRiverBias = (index: number) => {
    if (physicalPlan?.profileId !== "MONSOON_CONTINENTS") return 0;
    const paths = physicalPlan.paths.filter((path) => path.kind === "LIVING_RIVER");
    if (!paths.length) return 0;
    const nearest = Math.min(...paths.map((path) => distanceToPath(index, path.points)));
    // The wall-to-coast trunk is part of the initial drainage substrate. Keep
    // a narrow terrestrial corridor through fragmented coasts while the exact
    // sea-level rank displaces the same number of marginal land tiles.
    return Math.exp(-Math.pow(nearest / 1.25, 2)) * 1.15;
  };
  const icehouseSupplyBias = (index: number) => {
    if (physicalPlan?.profileId !== "ICEHOUSE_EARTH") return 0;
    const paths = physicalPlan.paths.filter((path) => path.kind === "SUPPLIES");
    if (!paths.length) return 0;
    const nearest = Math.min(...paths.map((path) => distanceToPath(index, path.points)));
    return Math.exp(-Math.pow(nearest / 1.2, 2)) * 1.05;
  };
  const supercontinentPassBias = (index: number) => {
    if (physicalPlan?.profileId !== "SUPERCONTINENT_INTERIOR") return 0;
    const paths = physicalPlan.paths.filter((path) => path.kind === "HIGHLAND_PASS");
    if (!paths.length) return 0;
    const nearest = Math.min(...paths.map((path) => distanceToPath(index, path.points)));
    return Math.exp(-Math.pow(nearest / 1.35, 2)) * 0.9;
  };
  const collisionBeltBias = (index: number) => {
    if (physicalPlan?.profileId !== "COLLIDING_PLATES") return 0;
    const paths = physicalPlan.paths.filter((path) => path.kind === "COLLISION_BELT");
    if (!paths.length) return 0;
    const nearest = Math.min(...paths.map((path) => distanceToPath(index, path.points)));
    // Collision belts are subaerial sutures between continental forelands.
    // Keep their narrow substrate above sea level before the exact rank is
    // solved; the rank displaces an equal number of marginal land tiles, so
    // the user's water control remains exact rather than being corrected later.
    return Math.exp(-Math.pow(nearest / 1.05, 2)) * 1.12;
  };
  const seaLevelScores = hypsometry.map((value, index) => value + islandArcBias(index) + ancientCratonBias(index) + monsoonRiverBias(index) + icehouseSupplyBias(index) + supercontinentPassBias(index) + collisionBeltBias(index) + hashNoise(index % width, Math.floor(index / width), seed + 313) * 0.00001);
  if (constraints?.topology.length === area) {
    for (let index = 0; index < area; index += 1) {
      if (constraints.topology[index] === 1) seaLevelScores[index] = Math.max(seaLevelScores[index], 2 + constraints.elevation[index] * 0.1);
      else if (constraints.topology[index] === 0) seaLevelScores[index] = Math.min(seaLevelScores[index], -1);
    }
  }
  const landMask = exactTopMask(seaLevelScores, landCount);
  applyConstrainedLandBudget(landMask, landCount, seaLevelScores, constraints);
  if (physicalPlan?.profileId === "ICEHOUSE_EARTH") {
    const supplyPaths = physicalPlan.paths.filter((path) => path.kind === "SUPPLIES");
    const corridor = new Set(landMask.flatMap((_land, index) => supplyPaths.some((path) => distanceToPath(index, path.points) <= 0.8)
      && constraints?.topology[index] !== 0 ? [index] : []));
    let raised = 0;
    for (const index of corridor) if (!landMask[index]) {
      landMask[index] = true;
      raised += 1;
    }
    const displaced = landMask.flatMap((land, index) => land && !corridor.has(index) && constraints?.topology[index] !== 1 ? [index] : [])
      .sort((one, two) => seaLevelScores[one] - seaLevelScores[two] || one - two);
    for (let count = 0; count < raised && count < displaced.length; count += 1) landMask[displaced[count]] = false;
  }
  if (options.preset === "SUPERCONTINENT_INTERIOR" && options.waterPercent > 0) {
    let raisedBoundary = 0;
    for (let index = 0; index < area; index += 1) {
      const x = index % width;
      const y = Math.floor(index / width);
      if (x !== 0 && x !== width - 1 && y !== 0 && y !== height - 1) continue;
      if (landMask[index] || constraints?.topology[index] === 0) continue;
      landMask[index] = true;
      raisedBoundary += 1;
    }
    const interior = landMask.flatMap((land, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return land && x > 1 && x < width - 2 && y > 1 && y < height - 2 && constraints?.topology[index] !== 1 ? [index] : [];
    }).sort((one, two) => seaLevelScores[one] - seaLevelScores[two] || one - two);
    for (let count = 0; count < raisedBoundary && count < interior.length; count += 1) landMask[interior[count]] = false;
  }
  const planRegionTiles = new Map<string, number[]>();
  if (physicalPlan) for (const region of physicalPlan.regions) planRegionTiles.set(region.id, landMask.flatMap((land, index) => {
    const x = (index % width + 0.5) / width;
    const y = (Math.floor(index / width) + 0.5) / height;
    let dx = Math.abs(x - region.anchor.x);
    if (wraps) dx = Math.min(dx, 1 - dx);
    const within = Math.hypot(
      dx * width / Math.max(width, height),
      (y - region.anchor.y) * height / Math.max(width, height) * 0.866,
    ) <= region.radius;
    if (!within) return [];
    if (region.effect === "WATER") return land ? [] : [index];
    return land ? [index] : [];
  }));
  let reliefValues = hypsometry.map((value, index) => value + convergence[index] * 0.58 * character.physical.convergenceRelief - divergence[index] * 0.16 * character.physical.divergenceRelief + (narrative?.relief[index] ?? 0) * narrativeInfluenceStrength("PHYSICAL").relief + semanticFields.relief[index] * 0.34);
  // Region effects are initial physical conditions, so realize them before
  // erosion and the exact mountain budget are solved. In particular a
  // LOWLAND province must represent subsidence in the relief field rather
  // than merely keep a lowland label after unrelated uplift wins the rank.
  // The offsets are deliberately moderate: local relief survives, while the
  // authored province shifts as a coherent material process.
  if (physicalPlan) for (const region of physicalPlan.regions) {
    const offset = region.effect === "LOWLAND" ? -0.42
      : region.effect === "RIDGE" || region.effect === "VOLCANIC" ? 0.28
        : 0;
    if (!offset) continue;
    for (const index of planRegionTiles.get(region.id) ?? []) reliefValues[index] += offset * region.priority;
  }
  const baseErosionPasses = options.erosionStrength === "STRONG" ? 4 : options.erosionStrength === "LIGHT" ? 1 : 2;
  const nativeErosionShift = physicalPlan?.conditions.reliefMode === "ERODED" ? 2 : physicalPlan?.conditions.reliefMode === "GLACIAL" ? 1 : physicalPlan?.conditions.reliefMode === "COLLISION" || physicalPlan?.conditions.reliefMode === "VOLCANIC" ? -1 : 0;
  const erosionPasses = Math.max(1, Math.round((baseErosionPasses + profile.erosionShift + nativeErosionShift + character.physical.erosionPassDelta) * scaleProfile.physical.erosionDetail));
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
  applyConstrainedRelief(reliefValues, elevations, landMask, constraints);

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
    const latitudeAuthority = physicalPlan?.conditions.latitudeAuthority ?? 0.78;
    const nativeClimateShift = physicalPlan?.conditions.climateMode === "GLACIAL" ? -0.16 : physicalPlan?.conditions.climateMode === "MONSOON" ? 0.035 : 0;
    const radiative = mix(0.52, 0.08 + insolation * 0.84, latitudeAuthority) + climateShift + nativeClimateShift;
    const maritimeTarget = 0.28 + insolation * 0.46 + climateShift * 0.72;
    const altitudeCooling = landMask[index] ? normalizedRelief[index] * 0.23 : 0;
    temperatures[index] = clamp(mix(radiative, maritimeTarget, maritimeWeight * 0.48) - altitudeCooling + (valueNoise(x + 701, y + 503, 12, seed + 521) - 0.5) * 0.105 * character.physical.climateVariance - localRange * 0.08 + (narrative?.temperature[index] ?? 0) * narrativeInfluenceStrength("PHYSICAL").climate + semanticFields.temperature[index] * 0.28);
    const wind = prevailingWind(frame, options.physicalRotation);
    windX[index] = wind.x;
    windY[index] = wind.y;
    windCells[index] = wind.cell;
    convergenceAir[index] = Math.exp(-Math.pow(frame.latitude / 0.11, 2)) * 0.7 + Math.exp(-Math.pow((frame.latitude - 0.65) / 0.1, 2)) * 0.55 - Math.exp(-Math.pow((frame.latitude - 0.33) / 0.085, 2)) * 0.48;
  }
  const smoothedTemperatures = blurField(temperatures, width, height, wraps, 0.18, 2);
  const atmosphere = simulateMoisture(options, profile, landMask, normalizedRelief, smoothedTemperatures, continentality, windX, windY, convergenceAir, waterDistance.towardWater, width, height, wraps, seed, scale);
  const moistures = atmosphere.moistures.map((value, index) => clamp(value + (narrative?.moisture[index] ?? 0) * narrativeInfluenceStrength("PHYSICAL").climate + semanticFields.moisture[index] * 0.34));

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  const continentByTile = new Int32Array(area).fill(-1);
  const basinByTile = new Int32Array(area).fill(-1);
  continents.forEach((continent, owner) => continent.tileIndices.forEach((index) => { continentByTile[index] = owner; }));
  basins.forEach((basin, owner) => basin.tileIndices.forEach((index) => { basinByTile[index] = owner; }));
  const runoff = atmosphere.precipitation.map((rain, index) => landMask[index] ? clamp(rain * 5.2 + moistures[index] * 0.18 - smoothedTemperatures[index] * 0.055, 0.001, 1) : 0);
  const drainage = buildDrainage(landMask, reliefValues, runoff, basinByTile, basins.length, width, height, wraps);
  if (narrative) for (let index = 0; index < area; index += 1) drainage.guidance[index] = clamp(drainage.guidance[index] + narrative.rivers[index] * narrativeInfluenceStrength("PHYSICAL").rivers);
  for (let index = 0; index < area; index += 1) if (semanticFields.drainage[index] > 0) drainage.guidance[index] = Math.max(drainage.guidance[index], semanticFields.drainage[index]);
  if (constraints?.hydrologyMask.length === area) for (let index = 0; index < area; index += 1) if (constraints.hydrologyMask[index]) drainage.guidance[index] = Math.max(drainage.guidance[index], constraints.rivers[index] ? 1 : 0.58);

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
  applyConstrainedSurface(tiles, landMask, elevations, constraints);

  const plateNarrativeRoles = new Map<number, string[]>();
  if (physicalPlan) for (const region of physicalPlan.regions) {
    const x = Math.max(0, Math.min(width - 1, Math.floor(region.anchor.x * width)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(region.anchor.y * height)));
    const plate = owners[y * width + x];
    plateNarrativeRoles.set(plate, [...(plateNarrativeRoles.get(plate) ?? []), region.role]);
  }
  const plateObjects = objectsFromAssignments("TECTONIC_PLATE", owners, plates.length, "Plate").map((object, index) => ({
    ...object,
    semanticId: plates[index].protectedSemanticId ? `protected:${plates[index].protectedSemanticId}` : `physical:plate:${options.preset.toLowerCase()}:${index + 1}`,
    attributes: {
      nativeCause: true,
      initialCondition: plates[index].causeRole,
      continental: plates[index].continental,
      crustAge: Number(plates[index].crustAge.toFixed(3)),
      stability: Number(plates[index].stability.toFixed(3)),
      motionX: Number(plates[index].vx.toFixed(3)),
      motionY: Number(plates[index].vy.toFixed(3)),
      ...(plates[index].protectedSemanticId ? { protectedSemanticId: plates[index].protectedSemanticId, protectedSemanticKind: plates[index].protectedSemanticKind ?? "", protectedSemanticPolicy: plates[index].protectedSemanticPolicy ?? "" } : {}),
      ...(plateNarrativeRoles.has(index) ? { narrativeRoles: plateNarrativeRoles.get(index)!.join(",") } : {}),
    },
  }));
  const atmosphericCells = objectsFromAssignments("ATMOSPHERIC_CELL", windCells, 3, "Atmospheric Cell").map((object, index) => ({ ...object, attributes: { circulation: ["tropical", "temperate", "polar"][index], rotation: options.physicalRotation } }));
  const climateObjects = contiguousClimateObjects(biomeAssignments, climateLabels, width, height, wraps);
  const rainShadowMask = landMask.map((land, index) => land && atmosphere.rainShadow[index] > 0.1 && moistures[index] < 0.42);
  const rainShadows = connectedTileObjects("RAIN_SHADOW", rainShadowMask, width, height, wraps, "Rain Shadow").filter((object) => object.tileIndices.length >= 2).map((object, index) => ({ ...object, id: `rain-shadow-${index + 1}` }));
  const glacialMask = landMask.map((land, index) => land && smoothedTemperatures[index] - annualRange[index] * 0.48 < 0.1);
  const glacialRegions = connectedTileObjects("GLACIAL_REGION", glacialMask, width, height, wraps, "Glacial Region").filter((object) => object.tileIndices.length >= 2).map((object, index) => ({ ...object, id: `glacial-region-${index + 1}` }));
  const basinTouchesOpenOcean = basins.map((basin) => basin.tileIndices.some((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return y === 0 || y === height - 1 || !wraps && (x === 0 || x === width - 1);
  }));
  const watershedObjects = objectsFromAssignments("WATERSHED", drainage.assignments, Math.max(1, basins.length), "Watershed").map((object) => {
    const basin = basins.length ? drainage.assignments[object.tileIndices[0]] : -1;
    return { ...object, attributes: { outletBasin: basin >= 0 ? basin + 1 : 0, hasOutlet: basin >= 0, endorheic: basin < 0 || !basinTouchesOpenOcean[basin] } };
  });
  const ranges = connectedLinearFeatures(elevations.map((elevation, index) => landMask[index] && elevation === 2 && convergence[index] > 0.08), width, height, wraps, "Mountain Range");
  const convergentCauseObjects = connectedTileObjects("NARRATIVE_PATH", convergence.map((value, index) => landMask[index] && value > 0.08), width, height, wraps, "Convergent Boundary")
    .filter((object) => object.tileIndices.length >= 2)
    .map((object, index): GeographicObject => ({ ...object, id: `physical-convergent-${index + 1}`, semanticId: `physical:cause:convergent:${index + 1}`, attributes: { nativeCause: true, initialCondition: "CONVERGENT_BOUNDARY", result: "UPLIFT", mapType: options.preset } }));
  const divergentCauseObjects = connectedTileObjects("NARRATIVE_PATH", divergence.map((value) => value > 0.08), width, height, wraps, "Divergent Boundary")
    .filter((object) => object.tileIndices.length >= 2)
    .map((object, index): GeographicObject => ({ ...object, id: `physical-divergent-${index + 1}`, semanticId: `physical:cause:divergent:${index + 1}`, attributes: { nativeCause: true, initialCondition: "DIVERGENT_BOUNDARY", result: "SUBSIDENCE", mapType: options.preset } }));
  const narrativeRegionTiles = planRegionTiles;
  const nativePhysicalRegionObjects: GeographicObject[] = physicalPlan ? physicalPlan.regions.flatMap((region): GeographicObject[] => {
    const tileIndices = narrativeRegionTiles.get(region.id) ?? [];
    if (!tileIndices.length) return [];
    return [{ id: `narrative-${region.id}`, semanticId: `narrative:${region.id}`, name: region.role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_REGION", tileIndices, attributes: { nativeNarrative: true, grammarFamily: physicalPlan.grammarFamily, physicalCause: physicalPlan.conditions.reliefMode, role: region.role, effect: region.effect, parent: region.parentId ?? "", priority: region.priority } }];
  }) : [];
  if (options.preset === "DYNAMIC_EARTH") {
    const processes = nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "PROCESS_PROVINCE");
    const componentAssignments = (included: readonly boolean[]) => {
      const assignments = new Int32Array(area).fill(-1);
      let component = 0;
      for (let origin = 0; origin < area; origin += 1) {
        if (!included[origin] || assignments[origin] >= 0) continue;
        const queue = [origin];
        assignments[origin] = component;
        for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], width, height, wraps)) {
          if (!included[next] || assignments[next] >= 0) continue;
          assignments[next] = component;
          queue.push(next);
        }
        component += 1;
      }
      return assignments;
    };
    const landComponents = componentAssignments(landMask);
    const waterComponents = componentAssignments(landMask.map((land) => !land));
    const convergentLandComponents = new Set(convergentCauseObjects.flatMap((object) => object.tileIndices)
      .map((index) => landComponents[index]).filter((component) => component >= 0));
    const divergentWaterComponents = new Set(divergentCauseObjects.flatMap((object) => object.tileIndices)
      .map((index) => waterComponents[index]).filter((component) => component >= 0));
    type ProcessChoice = {
      plate: GeographicObject;
      overlap: number[];
      age: number;
      ageBand: number;
      landComponents: Set<number>;
      waterComponents: Set<number>;
    };
    const choices = processes.map((process): ProcessChoice[] => {
      const members = new Set(process.tileIndices);
      return plateObjects.flatMap((plate): ProcessChoice[] => {
        const overlap = plate.tileIndices.filter((index) => members.has(index));
        if (!overlap.length) return [];
        const age = Number(plate.attributes?.crustAge ?? -1);
        const localLand = new Set(overlap.map((index) => landComponents[index]).filter((component) => component >= 0));
        const localWater = new Set(overlap.flatMap((index) => neighbors(index, width, height, wraps))
          .map((index) => waterComponents[index]).filter((component) => component >= 0));
        return [{ plate, overlap, age, ageBand: Math.round(age * 10), landComponents: localLand, waterComponents: localWater }];
      }).sort((one, two) => two.overlap.length - one.overlap.length || one.plate.id.localeCompare(two.plate.id));
    });
    const processIndex = new Map(processes.map((process, index) => [process.id.replace(/^narrative-/, ""), index]));
    const activePairs = physicalPlan?.paths.filter((path) => path.kind === "ACTIVE_MARGIN").flatMap((path) => {
      const from = processIndex.get(path.from);
      const to = processIndex.get(path.to);
      return from === undefined || to === undefined ? [] : [[from, to] as const];
    }) ?? [];
    const riftPairs = physicalPlan?.paths.filter((path) => path.kind === "RIFT_MARGIN").flatMap((path) => {
      const from = processIndex.get(path.from);
      const to = processIndex.get(path.to);
      return from === undefined || to === undefined ? [] : [[from, to] as const];
    }) ?? [];
    const intersects = (one: Set<number>, two: Set<number>, required: Set<number>) => [...one]
      .some((component) => two.has(component) && required.has(component));
    let best: { selected: ProcessChoice[]; score: number[] } | undefined;
    const selected: ProcessChoice[] = [];
    const usedPlates = new Set<string>();
    const better = (one: readonly number[], two: readonly number[]) => one.some((value, index) => value !== two[index]
      && value > (two[index] ?? Number.NEGATIVE_INFINITY)
      && one.slice(0, index).every((prefix, prefixIndex) => prefix === two[prefixIndex]));
    const inspect = () => {
      const activeConnections = activePairs.filter(([from, to]) => intersects(
        selected[from].landComponents,
        selected[to].landComponents,
        convergentLandComponents,
      )).length;
      const riftConnections = riftPairs.filter(([from, to]) => intersects(
        selected[from].waterComponents,
        selected[to].waterComponents,
        divergentWaterComponents,
      )).length;
      const ageBands = new Set(selected.map((choice) => choice.ageBand)).size;
      const minimumCore = Math.min(...selected.map((choice) => choice.overlap.length));
      const score = [
        Number(ageBands >= Math.min(3, processes.length) && activeConnections > 0 && riftConnections > 0),
        Number(activeConnections > 0) + Number(riftConnections > 0),
        activeConnections + riftConnections,
        ageBands,
        minimumCore,
        selected.reduce((sum, choice) => sum + choice.overlap.length, 0),
      ];
      if (!best || better(score, best.score)) best = { selected: [...selected], score };
    };
    const assign = (process: number) => {
      if (process === processes.length) { inspect(); return; }
      for (const choice of choices[process]) {
        if (usedPlates.has(choice.plate.id)) continue;
        usedPlates.add(choice.plate.id);
        selected.push(choice);
        assign(process + 1);
        selected.pop();
        usedPlates.delete(choice.plate.id);
      }
    };
    assign(0);
    for (let processIndex = 0; processIndex < processes.length; processIndex += 1) {
      const process = processes[processIndex];
      const selectedChoice: ProcessChoice | undefined = best?.selected[processIndex] ?? choices[processIndex][0];
      if (!selectedChoice) continue;
      // Bind the proof core to one measured plate instead of letting a very
      // thin world smear every province across the same dominant two plates.
      // The broader initial-condition field still shapes the surrounding
      // terrain, while this retained core has an exact final crustal owner.
      process.tileIndices = selectedChoice.overlap;
      process.attributes = {
        ...process.attributes,
        causalPlateId: selectedChoice.plate.id,
        causalCrustAge: selectedChoice.age,
      };
    }
  }
  const islandArcTilesByPair = new Map<string, Set<number>>();
  const preciseIslandPathTiles = (path: PhysicalConditionPlan["paths"][number], allowed: (index: number) => boolean) => {
    const pair = `${path.from}|${path.to}`;
    const priorArc = islandArcTilesByPair.get(pair) ?? new Set<number>();
    const samples: Point[] = [];
    for (let segment = 1; segment < path.points.length; segment += 1) {
      const from = path.points[segment - 1];
      const to = path.points[segment];
      let dx = to.x - from.x;
      if (wraps && Math.abs(dx) > 0.5) dx += dx > 0 ? -1 : 1;
      const dy = to.y - from.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx * width, dy * height * 0.866)));
      for (let step = segment === 1 ? 0 : 1; step <= steps; step += 1) {
        const amount = step / steps;
        samples.push({ x: from.x + dx * amount, y: from.y + dy * amount });
      }
    }
    const selected: number[] = [];
    const used = new Set<number>();
    for (const sample of samples) {
      let centerX = Math.floor(sample.x * width);
      if (wraps) centerX = (centerX % width + width) % width;
      else centerX = Math.max(0, Math.min(width - 1, centerX));
      const centerY = Math.max(0, Math.min(height - 1, Math.floor(sample.y * height)));
      const center = centerY * width + centerX;
      const candidates = [...new Set([center, ...neighbors(center, width, height, wraps), ...neighbors(center, width, height, wraps).flatMap((index) => neighbors(index, width, height, wraps))])]
        .filter(allowed)
        .sort((one, two) => {
          const score = (index: number) => distance({ x: index % width + 0.5, y: Math.floor(index / width) + 0.5 }, { x: sample.x * width, y: sample.y * height }, width, height, wraps)
            + (path.kind === "ARC_SHELF" && priorArc.has(index) ? 8 : 0)
            + (used.has(index) ? 0.25 : 0);
          return score(one) - score(two) || one - two;
        });
      const chosen = candidates[0];
      if (chosen !== undefined && !used.has(chosen)) {
        used.add(chosen);
        selected.push(chosen);
      }
    }
    if (path.kind === "VOLCANIC_PARENT_ARC") islandArcTilesByPair.set(pair, new Set(selected));
    return selected;
  };
  let droppedIcehouseSupplyTemplates = 0;
  let droppedIslandArcSystems = 0;
  let reassignedDynamicActiveMargins = 0;
  let dynamicExtremeLandExchangeTiles = 0;
  const nativeRegionTiles = new Map(nativePhysicalRegionObjects
    .map((object) => [object.id.replace(/^narrative-/, ""), object.tileIndices]));
  let nativePhysicalPathObjects: GeographicObject[] = physicalPlan ? physicalPlan.paths.flatMap((path): GeographicObject[] => {
      const samples = new Set<number>();
      for (const point of path.points) {
        const index = Math.max(0, Math.min(area - 1, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width))));
        samples.add(index); for (const adjacent of neighbors(index, width, height, wraps)) samples.add(adjacent);
      }
      const allowed = (index: number) => path.effect === "WATER_PATH" ? !landMask[index] : landMask[index];
      const endpointCore = (tiles: readonly number[], point: Point | undefined) => {
        if (!point || path.effect === "WATER_PATH") return [...tiles];
        const target = { x: point.x * width, y: point.y * height };
        const ranked = [...tiles].sort((one, two) => distance({ x: one % width, y: Math.floor(one / width) }, target, width, height, wraps)
          - distance({ x: two % width, y: Math.floor(two / width) }, target, width, height, wraps) || one - two);
        const minimum = ranked.length ? distance({ x: ranked[0] % width, y: Math.floor(ranked[0] / width) }, target, width, height, wraps) : Number.POSITIVE_INFINITY;
        return ranked.filter((index) => distance({ x: index % width, y: Math.floor(index / width) }, target, width, height, wraps) <= minimum + 1.5).slice(0, 12);
      };
      const fromRegionTiles = nativeRegionTiles.get(path.from) ?? narrativeRegionTiles.get(path.from) ?? [];
      const toRegionTiles = nativeRegionTiles.get(path.to) ?? narrativeRegionTiles.get(path.to) ?? [];
      let fromTiles = endpointCore(fromRegionTiles, path.points[0]);
      let toTiles = endpointCore(toRegionTiles, path.points.at(-1));
      if (path.effect === "RIVER_PATH") {
        const highSource = fromTiles.filter((index) => elevations[index] === 2);
        if (highSource.length) fromTiles = highSource;
        const coastalOutlet = toRegionTiles.filter((index) => landMask[index] && neighbors(index, width, height, wraps).some((next) => !landMask[next]));
        const waterShore = toRegionTiles.filter((index) => !landMask[index] && neighbors(index, width, height, wraps).some((next) => landMask[next]));
        if (coastalOutlet.length) toTiles = endpointCore(coastalOutlet, path.points.at(-1));
        else if (waterShore.length) toTiles = endpointCore(waterShore, path.points.at(-1));
      }
      let tileIndices = options.preset === "ISLAND_ARC_EARTH"
        ? preciseIslandPathTiles(path, allowed)
        : connectedMediumRoute(fromTiles, toTiles, allowed, [...samples], width, height, wraps);
      // A volcanic parent arc is a chain of land fragments across a
      // subduction system, not necessarily a walkable land bridge. Preserve
      // a truthful medium-filtered chain when the ocean separates its beads.
      if (!tileIndices.length && options.preset === "ISLAND_ARC_EARTH") tileIndices = [...samples].filter(allowed);
      // A climatic transition can cross fragmented coastal country without
      // pretending that it is a traversable road. Retain the final land
      // samples as a transition swath when no single land component spans the
      // two regional cores.
      if (!tileIndices.length && path.effect === "TRANSITION") tileIndices = [...samples].filter(allowed);
      if (!tileIndices.length && path.kind === "ACTIVE_MARGIN") {
        const sampleIndices = [...samples];
        const nearestBoundary = convergentCauseObjects.map((object) => {
          const separation = (candidate: number) => sampleIndices.reduce((minimum, sample) => Math.min(minimum, distance(
              { x: candidate % width, y: Math.floor(candidate / width) },
              { x: sample % width, y: Math.floor(sample / width) },
              width,
              height,
              wraps,
            )), Number.POSITIVE_INFINITY);
          const pivot = object.tileIndices.filter((index) => landMask[index])
            .sort((one, two) => separation(one) - separation(two) || one - two)[0];
          return pivot === undefined ? undefined : { object, pivot, separation: separation(pivot) };
        }).filter((entry): entry is { object: GeographicObject; pivot: number; separation: number } => Boolean(entry))
          .sort((one, two) => one.separation - two.separation || one.object.id.localeCompare(two.object.id))[0];
        if (nearestBoundary) {
          const first = connectedMediumRoute(fromTiles, [nearestBoundary.pivot], (index) => landMask[index], sampleIndices, width, height, wraps);
          const second = connectedMediumRoute([nearestBoundary.pivot], toTiles, (index) => landMask[index], sampleIndices, width, height, wraps);
          if (first.length && second.length) tileIndices = [...first, ...second.slice(1)];
        }
      }
      let subaerialRift = false;
      // A rift is a divergent tectonic process, not a promise that sea level
      // has already flooded it. At an explicit 0% water budget, bind the
      // authored RIFT_MARGIN to the nearest measured divergent boundary on
      // land. This preserves the geological epoch without inventing water or
      // claiming that an arbitrary dry raster sample is the rift.
      if (!tileIndices.length && path.kind === "RIFT_MARGIN" && basins.length === 0) {
        const tilePoint = (index: number): Point => ({ x: index % width, y: Math.floor(index / width) });
        const sampleIndices = [...samples];
        const nearestBoundary = divergentCauseObjects
          .map((object) => {
            let separation = Number.POSITIVE_INFINITY;
            for (const index of object.tileIndices) for (const sample of sampleIndices) {
              separation = Math.min(separation, distance(tilePoint(index), tilePoint(sample), width, height, wraps));
            }
            return { object, separation };
          })
          .sort((one, two) => one.separation - two.separation || one.object.id.localeCompare(two.object.id))[0]?.object;
        tileIndices = nearestBoundary?.tileIndices.filter((index) => landMask[index]) ?? [];
        subaerialRift = tileIndices.length > 0;
      }
      if (!tileIndices.length) return [];
      return [{ id: `narrative-${path.id}`, semanticId: `narrative:${path.id}`, name: path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_PATH", tileIndices, attributes: { nativeNarrative: true, grammarFamily: physicalPlan.grammarFamily, physicalCause: subaerialRift ? "continental-rifting-and-subsidence" : path.effect === "RIDGE_PATH" ? "boundary-motion" : path.effect === "RIVER_PATH" ? "drainage" : "initial-condition", relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength, ...(subaerialRift ? { subaerialRift: true, realizedMedium: "DIVERGENT_LAND_BOUNDARY", waterTileCount: 0 } : {}) } }];
    }) : [];
  if (options.preset === "ISLAND_ARC_EARTH") {
    const completePairs = new Set<string>();
    const emittedAnchorIds = new Set(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "VOLCANIC_ARC_ANCHOR")
      .map((object) => object.id.replace(/^narrative-/, "")));
    for (const path of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "VOLCANIC_PARENT_ARC")) {
      const pair = `${String(path.attributes?.from ?? "")}|${String(path.attributes?.to ?? "")}`;
      const roles = new Set(nativePhysicalPathObjects
        .filter((candidate) => `${String(candidate.attributes?.from ?? "")}|${String(candidate.attributes?.to ?? "")}` === pair)
        .map((candidate) => String(candidate.attributes?.role ?? "")));
      const planned = physicalPlan?.paths.filter((candidate) => `${candidate.from}|${candidate.to}` === pair) ?? [];
      const plannedByRole = new Map(planned.map((candidate) => [candidate.kind, candidate]));
      const plannedArc = plannedByRole.get("VOLCANIC_PARENT_ARC");
      const plannedShelf = plannedByRole.get("ARC_SHELF");
      const plannedSea = plannedByRole.get("SHELTERED_ARC_SEA");
      const plannedSigned = (candidate: PhysicalConditionPlan["paths"][number]) => {
        const from = candidate.points[0];
        const to = candidate.points.at(-1)!;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(0.0001, Math.hypot(dx, dy));
        return candidate.points.reduce((sum, point) => sum + ((point.x - from.x) * dy - (point.y - from.y) * dx) / length, 0) / candidate.points.length;
      };
      const orderedPlan = Boolean(plannedArc && plannedShelf && plannedSea && (() => {
        const arc = plannedSigned(plannedArc);
        const shelf = plannedSigned(plannedShelf);
        const sea = plannedSigned(plannedSea);
        const direction = Math.sign(sea - arc);
        return direction !== 0 && (shelf - arc) * direction >= 0.006 && (sea - shelf) * direction >= 0.006;
      })());
      if (orderedPlan
        && emittedAnchorIds.has(String(path.attributes?.from ?? ""))
        && emittedAnchorIds.has(String(path.attributes?.to ?? ""))
        && ["VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"].every((role) => roles.has(role))) completePairs.add(pair);
    }
    nativePhysicalPathObjects = nativePhysicalPathObjects.filter((object) => {
      const role = String(object.attributes?.role ?? "");
      if (!["VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"].includes(role)) return true;
      return completePairs.has(`${String(object.attributes?.from ?? "")}|${String(object.attributes?.to ?? "")}`);
    });
    const emittedRegionsById = new Map(nativePhysicalRegionObjects.map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const attachment = (region: GeographicObject, water: boolean, target: number | undefined) => {
      let reached = new Set(region.tileIndices);
      for (let radius = 0; radius <= 3; radius += 1) {
        const candidates = [...reached].filter((index) => water ? !landMask[index] : landMask[index]);
        if (candidates.length) return candidates.sort((one, two) => {
          if (target === undefined) return one - two;
          const targetPoint = { x: target % width, y: Math.floor(target / width) };
          return distance({ x: one % width, y: Math.floor(one / width) }, targetPoint, width, height, wraps)
            - distance({ x: two % width, y: Math.floor(two / width) }, targetPoint, width, height, wraps) || one - two;
        })[0];
        const expanded = new Set(reached);
        for (const index of reached) for (const next of neighbors(index, width, height, wraps)) expanded.add(next);
        reached = expanded;
      }
      return undefined;
    };
    for (const path of nativePhysicalPathObjects.filter((object) => ["VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"].includes(String(object.attributes?.role ?? "")))) {
      const from = emittedRegionsById.get(String(path.attributes?.from ?? ""));
      const to = emittedRegionsById.get(String(path.attributes?.to ?? ""));
      if (!from || !to) continue;
      const water = path.attributes?.role === "SHELTERED_ARC_SEA";
      const first = attachment(from, water, path.tileIndices[0]);
      const last = attachment(to, water, path.tileIndices.at(-1));
      path.tileIndices = [...new Set([
        ...(first === undefined ? [] : [first]),
        ...path.tileIndices,
        ...(last === undefined ? [] : [last]),
      ])];
    }
    // Rasterizing three nearby curves onto a coarse hex grid can put a shelf
    // on the far side of its sheltered sea even when the authored continuous
    // cross-section is correctly ordered. Re-solve the shelf against the
    // *emitted* volcanic anchors and final land/water media: it must occupy a
    // connected land band strictly between its paired arc and sheltered sea.
    const centroid = (indices: readonly number[]) => ({
      x: indices.reduce((sum, index) => sum + index % width + 0.5, 0) / Math.max(1, indices.length),
      y: indices.reduce((sum, index) => sum + (Math.floor(index / width) + 0.5) * 0.866, 0) / Math.max(1, indices.length),
    });
    for (const arc of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "VOLCANIC_PARENT_ARC")) {
      const from = emittedRegionsById.get(String(arc.attributes?.from ?? ""));
      const to = emittedRegionsById.get(String(arc.attributes?.to ?? ""));
      const shelf = nativePhysicalPathObjects.find((object) => object.attributes?.role === "ARC_SHELF"
        && object.attributes?.from === arc.attributes?.from && object.attributes?.to === arc.attributes?.to);
      const sea = nativePhysicalPathObjects.find((object) => object.attributes?.role === "SHELTERED_ARC_SEA"
        && object.attributes?.from === arc.attributes?.from && object.attributes?.to === arc.attributes?.to);
      if (!from || !to || !shelf || !sea) continue;
      const fromCenter = centroid(from.tileIndices);
      const toCenter = centroid(to.tileIndices);
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const length = Math.hypot(dx, dy);
      if (length < 2) continue;
      const signed = (index: number) => ((index % width + 0.5 - fromCenter.x) * dy
        - ((Math.floor(index / width) + 0.5) * 0.866 - fromCenter.y) * dx) / length;
      const meanSigned = (indices: readonly number[]) => indices.reduce((sum, index) => sum + signed(index), 0) / Math.max(1, indices.length);
      const arcSigned = meanSigned(arc.tileIndices);
      const seaSigned = meanSigned(sea.tileIndices);
      const landward = Math.sign(seaSigned - arcSigned);
      const separation = Math.abs(seaSigned - arcSigned);
      if (!landward || separation < 0.6) continue;
      const lower = Math.min(0.24, separation * 0.28);
      const upper = separation - Math.min(0.24, separation * 0.28);
      const inShelfBand = (index: number) => {
        const offset = (signed(index) - arcSigned) * landward;
        return landMask[index] && offset >= lower && offset <= upper;
      };
      const near = (index: number, region: GeographicObject) => region.tileIndices.some((member) => distance(
        { x: index % width, y: Math.floor(index / width) },
        { x: member % width, y: Math.floor(member / width) },
        width,
        height,
        wraps,
      ) <= 3);
      const candidates = landMask.flatMap((land, index) => land && inShelfBand(index) ? [index] : []);
      const route = connectedMediumRoute(
        candidates.filter((index) => near(index, from)),
        candidates.filter((index) => near(index, to)),
        inShelfBand,
        shelf.tileIndices,
        width,
        height,
        wraps,
      );
      let resolvedShelf = route.length >= 3 ? route : shelf.tileIndices;
      const targetSigned = arcSigned + (seaSigned - arcSigned) * 0.5;
      const shelfMean = meanSigned(resolvedShelf);
      if ((shelfMean - arcSigned) * landward < 0.12 || (seaSigned - shelfMean) * landward < 0.12) {
        const coreTarget = Math.max(4, Math.min(candidates.length, Math.max(resolvedShelf.length, 8)));
        resolvedShelf = [...candidates]
          .sort((one, two) => Math.abs(signed(one) - targetSigned) - Math.abs(signed(two) - targetSigned) || one - two)
          .slice(0, coreTarget);
      }
      const first = attachment(from, false, resolvedShelf[0]);
      const last = attachment(to, false, resolvedShelf.at(-1));
      shelf.tileIndices = [...new Set([
        ...(first === undefined ? [] : [first]),
        ...resolvedShelf,
        ...(last === undefined ? [] : [last]),
      ])];
    }
    const validFinalPairs = new Set<string>();
    for (const arc of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "VOLCANIC_PARENT_ARC")) {
      const pair = `${String(arc.attributes?.from ?? "")}|${String(arc.attributes?.to ?? "")}`;
      const from = emittedRegionsById.get(String(arc.attributes?.from ?? ""));
      const to = emittedRegionsById.get(String(arc.attributes?.to ?? ""));
      const shelf = nativePhysicalPathObjects.find((object) => object.attributes?.role === "ARC_SHELF"
        && object.attributes?.from === arc.attributes?.from && object.attributes?.to === arc.attributes?.to);
      const sea = nativePhysicalPathObjects.find((object) => object.attributes?.role === "SHELTERED_ARC_SEA"
        && object.attributes?.from === arc.attributes?.from && object.attributes?.to === arc.attributes?.to);
      if (!from || !to || !shelf || !sea) continue;
      const fromCenter = centroid(from.tileIndices);
      const toCenter = centroid(to.tileIndices);
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const length = Math.hypot(dx, dy);
      if (length < 2) continue;
      const signed = (index: number) => ((index % width + 0.5 - fromCenter.x) * dy
        - ((Math.floor(index / width) + 0.5) * 0.866 - fromCenter.y) * dx) / length;
      const meanSigned = (indices: readonly number[]) => indices.reduce((sum, index) => sum + signed(index), 0) / Math.max(1, indices.length);
      const arcSigned = meanSigned(arc.tileIndices);
      const shelfSigned = meanSigned(shelf.tileIndices);
      const seaSigned = meanSigned(sea.tileIndices);
      const landward = Math.sign(seaSigned - arcSigned);
      const endpointContact = (path: GeographicObject, region: GeographicObject) => path.tileIndices.some((index) => region.tileIndices.some((member) => distance(
        { x: index % width, y: Math.floor(index / width) },
        { x: member % width, y: Math.floor(member / width) },
        width,
        height,
        wraps,
      ) <= 3));
      let arcNeighborhood = new Set(arc.tileIndices);
      for (let radius = 0; radius < 3; radius += 1) {
        const expanded = new Set(arcNeighborhood);
        for (const index of arcNeighborhood) for (const next of neighbors(index, width, height, wraps)) expanded.add(next);
        arcNeighborhood = expanded;
      }
      const trench = [...arcNeighborhood].some((index) => tiles[index].terrain === 0
        && (signed(index) - arcSigned) * landward <= -0.35);
      const overlap = (one: readonly number[], two: readonly number[]) => {
        const right = new Set(two);
        return one.filter((index) => right.has(index)).length / Math.max(1, Math.min(new Set(one).size, right.size));
      };
      const valid = landward !== 0 && Math.abs(seaSigned - arcSigned) >= 0.6
        && (shelfSigned - arcSigned) * landward >= 0.12
        && (seaSigned - shelfSigned) * landward >= 0.12
        && trench
        && [arc, shelf, sea].every((path) => endpointContact(path, from) && endpointContact(path, to))
        && overlap(arc.tileIndices, shelf.tileIndices) <= 0.6
        && overlap(arc.tileIndices, sea.tileIndices) === 0
        && overlap(shelf.tileIndices, sea.tileIndices) === 0;
      if (valid) validFinalPairs.add(pair);
    }
    const finalArcPairCount = new Set(nativePhysicalPathObjects.filter((object) => object.attributes?.role === "VOLCANIC_PARENT_ARC")
      .map((object) => `${String(object.attributes?.from ?? "")}|${String(object.attributes?.to ?? "")}`)).size;
    droppedIslandArcSystems = finalArcPairCount - validFinalPairs.size;
    nativePhysicalPathObjects = nativePhysicalPathObjects.filter((object) => {
      const role = String(object.attributes?.role ?? "");
      return !["VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"].includes(role)
        || validFinalPairs.has(`${String(object.attributes?.from ?? "")}|${String(object.attributes?.to ?? "")}`);
    });
    const volcanicAnchorTiles = new Set(nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "VOLCANIC_ARC_ANCHOR").flatMap((object) => object.tileIndices));
    const arcTiles = new Set(nativePhysicalPathObjects.filter((object) => object.attributes?.role === "VOLCANIC_PARENT_ARC").flatMap((object) => object.tileIndices));
    const shelfTiles = new Set(nativePhysicalPathObjects.filter((object) => object.attributes?.role === "ARC_SHELF").flatMap((object) => object.tileIndices));
    for (const index of new Set([...volcanicAnchorTiles, ...arcTiles])) if (landMask[index] && elevations[index] === 0 && constraints?.elevation[index] !== 0) {
      elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: 1 };
    }
    const loweredShelf = [...shelfTiles].filter((index) => landMask[index] && elevations[index] === 2 && constraints?.elevation[index] !== 2);
    for (const index of loweredShelf) {
      elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: 1 };
    }
    const replacementSummits = landMask.flatMap((land, index) => land
      && elevations[index] < 2
      && !arcTiles.has(index)
      && !shelfTiles.has(index)
      && (constraints?.elevation[index] ?? -1) < 0
      ? [index]
      : []).sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
    for (let count = 0; count < loweredShelf.length && count < replacementSummits.length; count += 1) {
      const index = replacementSummits[count];
      elevations[index] = 2;
      tiles[index] = { ...tiles[index], elevation: 2, feature: 255 };
    }
  }
  if (options.preset === "SUPERCONTINENT_INTERIOR") {
    const highlandTiles = new Set(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "PERIPHERAL_HIGHLAND")
      .flatMap((object) => object.tileIndices));
    const highlandArcs = nativePhysicalPathObjects
      .filter((object) => object.attributes?.role === "BROKEN_HIGHLAND_ARC");
    const passTiles = new Set(nativePhysicalPathObjects
      .filter((object) => object.attributes?.role === "HIGHLAND_PASS")
      .flatMap((object) => object.tileIndices));
    for (const index of highlandTiles) if (landMask[index] && elevations[index] === 0 && constraints?.elevation[index] !== 0) {
      elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: 1 };
    }
    const loweredPassSummits = [...passTiles].filter((index) => landMask[index] && elevations[index] === 2 && constraints?.elevation[index] !== 2);
    for (const index of loweredPassSummits) {
      elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: 1 };
    }
    const replacementSummits = landMask.flatMap((land, index) => land
      && elevations[index] < 2
      && !passTiles.has(index)
      && !highlandTiles.has(index)
      && (constraints?.elevation[index] ?? -1) < 0
      ? [index]
      : []).sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
    for (let count = 0; count < loweredPassSummits.length && count < replacementSummits.length; count += 1) {
      const index = replacementSummits[count];
      elevations[index] = 2;
      tiles[index] = { ...tiles[index], elevation: 2, feature: 255 };
    }
    // Long perimeter links can otherwise retain relief only at their two
    // highland endpoints, reading as a flat artificial ring. Give each broken
    // arc a sparse sequence of evenly separated hill knuckles while leaving
    // its authored passes traversable and every explicit elevation constraint
    // authoritative. Hills express the interrupted range without changing the
    // user's exact mountain budget or sealing the continental interior.
    for (const arc of highlandArcs) {
      const desiredKnuckles = Math.max(1, Math.ceil(arc.tileIndices.length * 0.18));
      const raisedPositions = new Set(arc.tileIndices.flatMap((index, position) => landMask[index] && elevations[index] > 0 ? [position] : []));
      const candidates = arc.tileIndices.flatMap((index, position) => landMask[index]
        && elevations[index] === 0
        && !passTiles.has(index)
        && (constraints?.elevation[index] ?? -1) < 0
        ? [{ index, position }]
        : []);
      while (raisedPositions.size < desiredKnuckles && candidates.length) {
        candidates.sort((one, two) => {
          const separation = (position: number) => raisedPositions.size
            ? Math.min(...[...raisedPositions].map((raised) => Math.abs(position - raised)))
            : Math.min(position + 1, arc.tileIndices.length - position);
          return separation(two.position) - separation(one.position)
            || reliefValues[two.index] - reliefValues[one.index]
            || one.position - two.position;
        });
        const selected = candidates.shift()!;
        raisedPositions.add(selected.position);
        elevations[selected.index] = 1;
        reliefValues[selected.index] = Math.max(reliefValues[selected.index], 0.52);
        tiles[selected.index] = { ...tiles[selected.index], elevation: 1 };
      }
    }
  }
  if (options.preset === "ICEHOUSE_EARTH") {
    const bySkeletonId = new Map(nativePhysicalRegionObjects
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const refugeTiles = new Set(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "REFUGE")
      .flatMap((object) => object.tileIndices));
    const supplyPaths = nativePhysicalPathObjects.filter((object) => object.attributes?.role === "SUPPLIES");

    const outsideRefugeLand = landMask.flatMap((land, index) => land && !refugeTiles.has(index) ? [index] : []);
    const coldTarget = Math.ceil(outsideRefugeLand.length * 0.62);
    let coldCount = outsideRefugeLand.filter((index) => tiles[index].terrain === 5 || tiles[index].terrain === 6).length;
    for (const index of outsideRefugeLand.filter((member) => tiles[member].terrain !== 5 && tiles[member].terrain !== 6
      && (constraints?.terrain[member] ?? -1) < 0)
      .sort((one, two) => smoothedTemperatures[one] - smoothedTemperatures[two] || one - two)) {
      if (coldCount >= coldTarget) break;
      const snow = smoothedTemperatures[index] < 0.18;
      tiles[index] = { ...tiles[index], terrain: snow ? 6 : 5, feature: snow ? 255 : tiles[index].feature === 0 ? 0 : 255 };
      coldCount += 1;
    }

    // A refuge is an actual temperate, settleable interruption in the glacial
    // field. The supply relationships then leave that interruption and enter
    // a materially cold sheet instead of collapsing to a one-tile overlap
    // between two broad labelled reservations.
    for (const index of refugeTiles) if (landMask[index]) {
      reliefValues[index] = Math.min(reliefValues[index], minimumLand - 0.02);
      smoothedTemperatures[index] = Math.max(smoothedTemperatures[index], 0.46);
      moistures[index] = Math.max(moistures[index], 0.34);
      if (constraints?.elevation[index] !== 2 && elevations[index] === 2) elevations[index] = 1;
      if ((constraints?.terrain[index] ?? -1) < 0) {
        tiles[index] = { ...tiles[index], terrain: 2, feature: tiles[index].feature === 2 ? 2 : 255 };
      }
      tiles[index] = { ...tiles[index], elevation: elevations[index] };
    }
    for (const refuge of nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "REFUGE")) {
      const land = refuge.tileIndices.filter((index) => landMask[index]);
      refuge.attributes = {
        ...refuge.attributes,
        meanTemperature: land.reduce((sum, index) => sum + smoothedTemperatures[index], 0) / Math.max(1, land.length),
        meanMoisture: land.reduce((sum, index) => sum + moistures[index], 0) / Math.max(1, land.length),
        climateRealizedBeforeSurface: true,
      };
    }

    for (const sheet of nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "ICE_SHEET")) {
      const members = new Set(sheet.tileIndices.filter((index) => !refugeTiles.has(index)
        && landMask[index]
        && (tiles[index].terrain === 5 || tiles[index].terrain === 6)));
      const components = connectedTileObjects(
        "NARRATIVE_REGION",
        landMask.map((_land, index) => members.has(index)),
        width,
        height,
        wraps,
        "Ice Sheet",
      ).sort((one, two) => two.tileIndices.length - one.tileIndices.length || one.tileIndices[0] - two.tileIndices[0]);
      if (components[0]?.tileIndices.length) sheet.tileIndices = components[0].tileIndices;
    }

    const realizedSupplyIds = new Set<string>();
    for (const path of supplyPaths) {
      const refuge = bySkeletonId.get(String(path.attributes?.from ?? ""));
      const sheet = bySkeletonId.get(String(path.attributes?.to ?? ""));
      if (!refuge || !sheet) continue;
      const refugeLand = refuge.tileIndices.filter((index) => landMask[index]);
      const frontier = sheet.tileIndices.filter((index) => landMask[index]
        && !refugeTiles.has(index)
        && (tiles[index].terrain === 5 || tiles[index].terrain === 6)
        && refugeLand.every((source) => distance(
          { x: source % width, y: Math.floor(source / width) },
          { x: index % width, y: Math.floor(index / width) },
          width,
          height,
          wraps,
        ) >= 2));
      const route = connectedMediumRoute(
        refugeLand,
        frontier,
        (index) => landMask[index],
        path.tileIndices,
        width,
        height,
        wraps,
      );
      if (route.length >= 3) {
        path.tileIndices = route;
        realizedSupplyIds.add(path.id);
      }
    }
    droppedIcehouseSupplyTemplates = supplyPaths.length - realizedSupplyIds.size;
    nativePhysicalPathObjects = nativePhysicalPathObjects.filter((object) => object.attributes?.role !== "SUPPLIES" || realizedSupplyIds.has(object.id));
    const retainedSupplyPaths = supplyPaths.filter((object) => realizedSupplyIds.has(object.id));
    const supplyTiles = new Set(retainedSupplyPaths.flatMap((object) => object.tileIndices));
    const protectedPassable = new Set([...refugeTiles, ...supplyTiles]);
    const loweredSummits = [...protectedPassable].filter((index) => landMask[index]
      && elevations[index] === 2
      && constraints?.elevation[index] !== 2);
    for (const index of protectedPassable) if (landMask[index] && constraints?.elevation[index] !== 2) {
      reliefValues[index] = Math.min(reliefValues[index], minimumLand - 0.02);
      if (elevations[index] === 2) elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: elevations[index] };
    }
    const replacementSummits = landMask.flatMap((land, index) => land
      && elevations[index] < 2
      && !protectedPassable.has(index)
      && (constraints?.elevation[index] ?? -1) < 0
      ? [index]
      : []).sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
    for (let count = 0; count < loweredSummits.length && count < replacementSummits.length; count += 1) {
      const index = replacementSummits[count];
      elevations[index] = 2;
      tiles[index] = { ...tiles[index], elevation: 2, feature: 255 };
    }
    applyConstrainedSurface(tiles, landMask, elevations, constraints);
  }
  if (options.preset === "DYNAMIC_EARTH") {
    if (!nativePhysicalPathObjects.some((object) => object.attributes?.role === "ACTIVE_MARGIN")) {
      for (const template of physicalPlan?.paths.filter((path) => path.kind === "ACTIVE_MARGIN") ?? []) {
        const guide = [...new Set(template.points.map((point) => {
          const x = Math.max(0, Math.min(width - 1, Math.floor(point.x * width)));
          const y = Math.max(0, Math.min(height - 1, Math.floor(point.y * height)));
          return y * width + x;
        }))];
        nativePhysicalPathObjects.push({
          id: `narrative-${template.id}`,
          semanticId: `narrative:${template.id}`,
          name: "Active Margin",
          kind: "NARRATIVE_PATH",
          tileIndices: guide,
          attributes: {
            nativeNarrative: true,
            grammarFamily: physicalPlan?.grammarFamily ?? "PHYSICAL_DYNAMIC_EARTH",
            physicalCause: "boundary-motion",
            relationship: template.kind,
            role: template.kind,
            effect: template.effect,
            from: template.from,
            to: template.to,
            strength: template.strength,
            recoveredForExtremeGeometry: true,
          },
        });
      }
    }
    const bySkeletonId = new Map(nativePhysicalRegionObjects
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const convergentTiles = [...new Set(convergentCauseObjects.flatMap((object) => object.tileIndices)
      .filter((index) => landMask[index]))];
    const failedBoundaryPaths = new Set<string>();
    for (const path of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "ACTIVE_MARGIN")) {
      const from = bySkeletonId.get(String(path.attributes?.from ?? ""));
      const to = bySkeletonId.get(String(path.attributes?.to ?? ""));
      if (!from || !to || !convergentTiles.length) { failedBoundaryPaths.add(path.id); continue; }
      const guideDistances = routeGuideDistances(path.tileIndices, width, height, wraps);
      const pivots = [...convergentTiles].sort((one, two) => guideDistances[one] - guideDistances[two] || one - two);
      let realized: number[] | undefined;
      // `flatMap(...)[0]` computed routes through every boundary tile before
      // discarding all but the first. Preserve the same deterministic pivot
      // order and stop as soon as that first lawful route is found.
      for (const pivot of pivots) {
        const first = connectedMediumRoute(from.tileIndices, [pivot], (index) => landMask[index], path.tileIndices, width, height, wraps, guideDistances);
        if (!first.length) continue;
        const second = connectedMediumRoute([pivot], to.tileIndices, (index) => landMask[index], path.tileIndices, width, height, wraps, guideDistances);
        if (!second.length) continue;
        realized = [...first, ...second.slice(1)];
        break;
      }
      if (!realized) {
        const direct = connectedMediumRoute(from.tileIndices, to.tileIndices, (index) => landMask[index], path.tileIndices, width, height, wraps, guideDistances);
        if (direct.length >= 3) {
          // On five-tile Pin/String strips, thresholding the simulated plate
          // boundary can split a genuine narrative-driven convergence ribbon
          // into one-tile fragments. The relationship already contributed to
          // the pre-topology convergence field; retain its final connected land
          // trace as that measured cause instead of discarding the epoch.
          realized = direct;
          for (const index of direct) convergence[index] = Math.max(convergence[index], 0.09);
          convergentCauseObjects.push({
            id: `physical-convergent-${convergentCauseObjects.length + 1}`,
            semanticId: `physical:cause:convergent:${convergentCauseObjects.length + 1}`,
            name: "Narrative Convergent Boundary",
            kind: "NARRATIVE_PATH",
            tileIndices: [...direct],
            attributes: { nativeCause: true, initialCondition: "CONVERGENT_BOUNDARY", result: "UPLIFT", mapType: options.preset, narrativeDrivenBoundary: true },
          });
        }
      }
      if (realized) path.tileIndices = realized;
      else failedBoundaryPaths.add(path.id);
    }
    const activePaths = nativePhysicalPathObjects.filter((object) => object.attributes?.role === "ACTIVE_MARGIN");
    if (activePaths.length && activePaths.every((path) => failedBoundaryPaths.has(path.id))) {
      const fallback = activePaths[0];
      const processes = nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "PROCESS_PROVINCE");
      const plannedFrom = processes.find((object) => object.id === `narrative-${String(fallback.attributes?.from ?? "")}`);
      const plannedTo = processes.find((object) => object.id === `narrative-${String(fallback.attributes?.to ?? "")}`);
      let reassigned: { from: GeographicObject; to: GeographicObject; route: number[] } | undefined;
      if (plannedFrom && plannedTo) {
        const route = connectedMediumRoute(plannedFrom.tileIndices, plannedTo.tileIndices, (index) => landMask[index], fallback.tileIndices, width, height, wraps);
        if (route.length >= 3) reassigned = { from: plannedFrom, to: plannedTo, route };
      }
      if (!reassigned && Math.min(width, height) <= 5) {
        const protectedTiles = new Set([
          ...nativePhysicalRegionObjects.flatMap((object) => object.tileIndices),
          ...nativePhysicalPathObjects.filter((object) => object.attributes?.role === "RIFT_MARGIN").flatMap((object) => object.tileIndices),
        ]);
        const donors = landMask.flatMap((land, index) => land
          && elevations[index] < 2
          && !protectedTiles.has(index)
          && (constraints?.topology[index] ?? -1) < 0
          && (constraints?.elevation[index] ?? -1) < 0
          ? [index]
          : []).sort((one, two) => neighbors(two, width, height, wraps).filter((index) => !landMask[index]).length
            - neighbors(one, width, height, wraps).filter((index) => !landMask[index]).length || one - two);
        const cheapestRoute = (from: GeographicObject, to: GeographicObject) => {
          const targets = new Set(to.tileIndices);
          const costs = new Float64Array(area);
          costs.fill(Number.POSITIVE_INFINITY);
          const previous = new Int32Array(area).fill(-1);
          const heap = new MinHeap();
          for (const source of from.tileIndices) if (landMask[source]) { costs[source] = 0; heap.push(source, 0); }
          let terminal = -1;
          while (heap.length) {
            const current = heap.pop()!;
            if (current.priority !== costs[current.index]) continue;
            if (targets.has(current.index)) { terminal = current.index; break; }
            for (const next of neighbors(current.index, width, height, wraps)) {
              const convertible = landMask[next] || (constraints?.topology[next] ?? -1) < 0;
              if (!convertible) continue;
              const nextCost = current.priority + (landMask[next] ? 1 : 100);
              if (nextCost >= costs[next]) continue;
              costs[next] = nextCost;
              previous[next] = current.index;
              heap.push(next, nextCost);
            }
          }
          if (terminal < 0) return [];
          const route: number[] = [];
          for (let current = terminal; current >= 0; current = previous[current]) {
            route.push(current);
            if (previous[current] < 0) break;
          }
          return route.reverse();
        };
        let best: { from: GeographicObject; to: GeographicObject; route: number[]; water: number[] } | undefined;
        if (plannedFrom && plannedTo) {
          const route = cheapestRoute(plannedFrom, plannedTo);
          const water = route.filter((index) => !landMask[index]);
          if (route.length >= 3 && water.length > 0 && water.length <= donors.length) best = { from: plannedFrom, to: plannedTo, route, water };
        }
        if (best) {
          for (const index of best.water) {
            landMask[index] = true;
            elevations[index] = 0;
            reliefValues[index] = Math.max(reliefValues[index], minimumLand - 0.02);
            tiles[index] = {
              ...tiles[index],
              terrain: chooseTerrain(smoothedTemperatures[index], moistures[index], options.dominantTerrains),
              elevation: 0,
              feature: 255,
              continent: 1,
            };
          }
          for (const index of donors.slice(0, best.water.length)) {
            landMask[index] = false;
            elevations[index] = 0;
            reliefValues[index] = Math.min(reliefValues[index], minimumLand - 0.12);
            tiles[index] = { ...tiles[index], terrain: 0, elevation: 0, feature: 255, continent: 0 };
          }
          for (let index = 0; index < area; index += 1) if (!landMask[index]) {
            tiles[index] = { ...tiles[index], terrain: neighbors(index, width, height, wraps).some((next) => landMask[next]) ? 1 : 0, elevation: 0, continent: 0 };
          }
          reassigned = { from: best.from, to: best.to, route: best.route };
          dynamicExtremeLandExchangeTiles += best.water.length;
        }
      }
      if (reassigned) {
        const fromId = reassigned.from.id.replace(/^narrative-/, "");
        const toId = reassigned.to.id.replace(/^narrative-/, "");
        fallback.tileIndices = reassigned.route;
        fallback.attributes = { ...fallback.attributes, from: fromId, to: toId, reassignedForExtremeGeometry: true };
        failedBoundaryPaths.delete(fallback.id);
        for (const index of reassigned.route) convergence[index] = Math.max(convergence[index], 0.09);
        convergentCauseObjects.push({
          id: `physical-convergent-${convergentCauseObjects.length + 1}`,
          semanticId: `physical:cause:convergent:${convergentCauseObjects.length + 1}`,
          name: "Extreme-Geometry Convergent Boundary",
          kind: "NARRATIVE_PATH",
          tileIndices: [...reassigned.route],
          attributes: { nativeCause: true, initialCondition: "CONVERGENT_BOUNDARY", result: "UPLIFT", mapType: options.preset, narrativeDrivenBoundary: true, extremeGeometry: true },
        });
        reassignedDynamicActiveMargins += 1;
      }
    }
    for (const path of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "RIFT_MARGIN")) {
      const from = bySkeletonId.get(String(path.attributes?.from ?? ""));
      const to = bySkeletonId.get(String(path.attributes?.to ?? ""));
      const subaerialRift = path.attributes?.subaerialRift === true;
      const allowedRiftMedium = (index: number) => subaerialRift ? landMask[index] : !landMask[index];
      const divergentTiles = [...new Set(divergentCauseObjects.flatMap((object) => object.tileIndices)
        .filter(allowedRiftMedium))];
      if (!from || !to || !divergentTiles.length) { failedBoundaryPaths.add(path.id); continue; }
      const guideDistances = routeGuideDistances(path.tileIndices, width, height, wraps);
      const pivots = [...divergentTiles].sort((one, two) => guideDistances[one] - guideDistances[two] || one - two);
      let realized: number[] | undefined;
      for (const pivot of pivots) {
        const first = connectedMediumRoute(from.tileIndices, [pivot], allowedRiftMedium, path.tileIndices, width, height, wraps, guideDistances);
        if (!first.length) continue;
        const second = connectedMediumRoute([pivot], to.tileIndices, allowedRiftMedium, path.tileIndices, width, height, wraps, guideDistances);
        if (!second.length) continue;
        realized = [...new Set([...first, ...second.slice(1)])];
        break;
      }
      if (realized) path.tileIndices = realized;
      else failedBoundaryPaths.add(path.id);
    }
    nativePhysicalPathObjects = nativePhysicalPathObjects.filter((path) => !failedBoundaryPaths.has(path.id));

    const lowlandTiles = new Set(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "PROCESS_PROVINCE" && object.attributes?.effect === "LOWLAND")
      .flatMap((object) => object.tileIndices));
    const loweredSummits = [...lowlandTiles].filter((index) => landMask[index]
      && elevations[index] === 2
      && constraints?.elevation[index] !== 2);
    for (const index of lowlandTiles) if (landMask[index] && (constraints?.elevation[index] ?? -1) < 0) {
      reliefValues[index] = Math.min(reliefValues[index], minimumLand - 0.02);
      elevations[index] = 0;
      tiles[index] = { ...tiles[index], elevation: elevations[index] };
    }
    const upliftObjects = [
      ...nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "PROCESS_PROVINCE"
        && (object.attributes?.effect === "RIDGE" || object.attributes?.effect === "VOLCANIC")),
      ...nativePhysicalPathObjects.filter((object) => object.attributes?.role === "ACTIVE_MARGIN"),
    ];
    for (const object of upliftObjects) {
      const members = object.tileIndices.filter((index) => landMask[index]
        && !lowlandTiles.has(index)
        && constraints?.elevation[index] !== 0);
      const required = Math.max(1, Math.ceil(members.length * 0.16));
      const raised = members.filter((index) => elevations[index] > 0).length;
      for (const index of members.filter((member) => elevations[member] === 0)
        .sort((one, two) => reliefValues[two] - reliefValues[one] || one - two)
        .slice(0, Math.max(0, required - raised))) {
        elevations[index] = 1;
        tiles[index] = { ...tiles[index], elevation: 1 };
      }
    }
    for (const object of nativePhysicalRegionObjects.filter((candidate) => candidate.attributes?.role === "PROCESS_PROVINCE")) {
      const effect = String(object.attributes?.effect ?? "");
      if (effect !== "WET" && effect !== "DRY") continue;
      const eligible = object.tileIndices.filter((index) => landMask[index]
        && (constraints?.terrain[index] ?? -1) < 0);
      const predicate = (index: number) => effect === "WET"
        ? tiles[index].terrain === 2 || [0, 1, 2].includes(tiles[index].feature)
        : [3, 4].includes(tiles[index].terrain);
      const required = Math.ceil(object.tileIndices.length * (effect === "WET" ? 0.52 : 0.38));
      const present = object.tileIndices.filter(predicate).length;
      for (const index of eligible.filter((member) => !predicate(member))
        .sort((one, two) => effect === "WET" ? moistures[two] - moistures[one] || one - two : moistures[one] - moistures[two] || one - two)
        .slice(0, Math.max(0, required - present))) {
        if (effect === "WET") {
          moistures[index] = Math.max(moistures[index], 0.72);
          tiles[index] = {
            ...tiles[index],
            terrain: 2,
            feature: elevations[index] === 2 ? 255 : tiles[index].feature === 255 ? 0 : tiles[index].feature,
          };
        } else {
          moistures[index] = Math.min(moistures[index], 0.28);
          tiles[index] = { ...tiles[index], terrain: hashNoise(index % width, Math.floor(index / width), seed + 8861) > 0.58 ? 4 : 3, feature: 255 };
        }
      }
    }
    const protectedLowland = lowlandTiles;
    const replacementSummits = landMask.flatMap((land, index) => land
      && elevations[index] < 2
      && !protectedLowland.has(index)
      && (constraints?.elevation[index] ?? -1) < 0
      ? [index]
      : []).sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
    for (let count = 0; count < loweredSummits.length && count < replacementSummits.length; count += 1) {
      const index = replacementSummits[count];
      elevations[index] = 2;
      tiles[index] = { ...tiles[index], elevation: 2, feature: 255 };
    }
  }
  const nativePhysicalObjects: GeographicObject[] = [...nativePhysicalRegionObjects, ...nativePhysicalPathObjects];
  if (options.preset === "COLLIDING_PLATES") {
    const beltObjects = nativePhysicalPathObjects.filter((object) => object.attributes?.role === "COLLISION_BELT");
    const beltTiles = new Set(beltObjects
      .flatMap((object) => object.tileIndices));
    const lowered = [...beltTiles].filter((index) => landMask[index]
      && elevations[index] === 2
      && constraints?.elevation[index] !== 2);
    for (const index of beltTiles) if (landMask[index] && constraints?.elevation[index] !== 2) {
      reliefValues[index] = Math.min(reliefValues[index], minimumLand - 0.01);
    }
    for (const index of lowered) {
      elevations[index] = 1;
      tiles[index] = { ...tiles[index], elevation: 1 };
    }
    // A collision belt is still an uplifted hill/range system, but its exact
    // retained route is the authored pass through that system. Relocate any
    // displaced summit to the highest unconstrained relief outside the pass
    // so the user's mountain budget remains exact.
    const replacementSummits = landMask.flatMap((land, index) => land
      && elevations[index] < 2
      && !beltTiles.has(index)
      && (constraints?.elevation[index] ?? -1) < 0
      ? [index]
      : []).sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
    for (let count = 0; count < lowered.length && count < replacementSummits.length; count += 1) {
      const index = replacementSummits[count];
      elevations[index] = 2;
      tiles[index] = { ...tiles[index], elevation: 2, feature: 255 };
    }
    const beltNeighborhood = new Set([...beltTiles, ...[...beltTiles].flatMap((index) => neighbors(index, width, height, wraps))]);
    const usedSpineSummits = new Set<number>();
    for (const belt of beltObjects) {
      const neighborhood = new Set([...belt.tileIndices, ...belt.tileIndices.flatMap((index) => neighbors(index, width, height, wraps))]
        .filter((index) => landMask[index]));
      const desiredRelief = Math.ceil(neighborhood.size * 0.48);
      let presentRelief = [...neighborhood].filter((index) => elevations[index] > 0).length;
      for (const index of [...neighborhood].filter((member) => elevations[member] === 0
        && (constraints?.elevation[member] ?? -1) < 0)
        .sort((one, two) => reliefValues[two] - reliefValues[one] || one - two)) {
        if (presentRelief >= desiredRelief) break;
        elevations[index] = 1;
        reliefValues[index] = Math.max(reliefValues[index], 0.54);
        tiles[index] = { ...tiles[index], elevation: 1 };
        presentRelief += 1;
      }
      const desired = Math.max(1, Math.ceil(neighborhood.size * 0.1));
      let present = [...neighborhood].filter((index) => elevations[index] === 2).length;
      const candidates = [...neighborhood].filter((index) => !beltTiles.has(index) && elevations[index] < 2
        && !usedSpineSummits.has(index) && (constraints?.elevation[index] ?? -1) < 0)
        .sort((one, two) => reliefValues[two] - reliefValues[one] || one - two);
      while (present < desired && candidates.length) {
        const summit = candidates.shift()!;
        const donor = landMask.flatMap((land, index) => land && elevations[index] === 2
          && !beltNeighborhood.has(index) && (constraints?.elevation[index] ?? -1) < 0 ? [index] : [])
          .sort((one, two) => reliefValues[one] - reliefValues[two] || one - two)[0];
        if (donor === undefined) break;
        elevations[donor] = 1;
        tiles[donor] = { ...tiles[donor], elevation: 1 };
        elevations[summit] = 2;
        reliefValues[summit] = Math.max(reliefValues[summit], 0.86);
        tiles[summit] = { ...tiles[summit], elevation: 2, feature: 255 };
        usedSpineSummits.add(summit);
        present += 1;
      }
    }
  }
  if (options.preset === "MONSOON_CONTINENTS") {
    const wetCoasts = nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "WET_COAST");
    const lowlands = nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "MONSOON_LOWLAND");
    const dryInteriors = nativePhysicalRegionObjects.filter((object) => object.attributes?.role === "DRY_INTERIOR");
    for (const object of wetCoasts) for (const index of object.tileIndices) if (landMask[index]) {
      tiles[index] = { ...tiles[index], terrain: 2, feature: elevations[index] < 2 && hashNoise(index % width, Math.floor(index / width), seed + 8801) > 0.58 ? 0 : tiles[index].feature === 1 || tiles[index].feature === 2 ? tiles[index].feature : 255 };
    }
    for (const object of lowlands) for (const index of object.tileIndices) if (landMask[index] && tiles[index].terrain !== 2) {
      tiles[index] = { ...tiles[index], terrain: hashNoise(index % width, Math.floor(index / width), seed + 8813) > 0.72 ? 3 : 2 };
    }
    // Apply the leeward field last where broad narrative reservations overlap:
    // the resulting exclusive cores remain wet and dry, while their shared
    // fringe becomes the visibly graded transition rather than a hard band.
    for (const object of dryInteriors) for (const index of object.tileIndices) if (landMask[index]) {
      tiles[index] = { ...tiles[index], terrain: hashNoise(index % width, Math.floor(index / width), seed + 8821) > 0.58 ? 4 : 3, feature: 255 };
    }
    applyConstrainedSurface(tiles, landMask, elevations, constraints);
  }
  const authoredRiverSources = new Set<number>();
  const reserveAuthoredRiverSource = (drainage: GeographicObject, sourceObject: GeographicObject | undefined) => {
    if (!sourceObject) return;
    const sourceTiles = new Set(sourceObject.tileIndices);
    const source = drainage.tileIndices.slice(0, Math.max(1, Math.ceil(drainage.tileIndices.length * 0.4)))
      .find((index) => sourceTiles.has(index) || neighbors(index, width, height, wraps).some((next) => sourceTiles.has(next)));
    if (source === undefined || constraints?.elevation[source] === 0 || constraints?.elevation[source] === 1) return;
    authoredRiverSources.add(source);
    elevations[source] = 2;
    tiles[source] = { ...tiles[source], elevation: 2, feature: 255 };
    // Headwater selection ranks mountain junctions by physical height and
    // accumulated moisture. A pronounced surviving knuckle makes the exact
    // authored drainage competitive with unrelated peaks without changing
    // the final mountain count (the later exact-budget restore relocates one
    // unconstrained summit for every inserted source).
    reliefValues[source] = Math.max(reliefValues[source], maximumLand + 4);
  };
  if (options.preset === "ANCIENT_CRATONS") {
    const ranges = nativePhysicalPathObjects.filter((object) => object.attributes?.role === "GHOST_RANGE");
    for (const drainage of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "MATURE_DRAINAGE")) {
      const range = ranges.find((object) => object.attributes?.from === drainage.attributes?.from
        && object.attributes?.to === drainage.attributes?.to);
      reserveAuthoredRiverSource(drainage, range);
    }
  } else if (options.preset === "SUPERCONTINENT_INTERIOR") {
    const highlands = new Map(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "PERIPHERAL_HIGHLAND")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const drainages = nativePhysicalPathObjects.filter((object) => object.attributes?.role === "INWARD_DRAINAGE");
    const sourceCount = Math.min(drainages.length, Math.max(3, physicalPlan?.contract.hydrology.minimumCatchments ?? 3));
    const selected = new Set(Array.from({ length: sourceCount }, (_value, position) => Math.floor(position * drainages.length / sourceCount)));
    drainages.forEach((drainage, index) => {
      if (selected.has(index)) reserveAuthoredRiverSource(drainage, highlands.get(String(drainage.attributes?.from ?? "")));
    });
  } else if (options.preset === "MONSOON_CONTINENTS") {
    const walls = new Map(nativePhysicalRegionObjects
      .filter((object) => object.attributes?.role === "OROGRAPHIC_WALL")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    for (const drainage of nativePhysicalPathObjects.filter((object) => object.attributes?.role === "LIVING_RIVER")) {
      reserveAuthoredRiverSource(drainage, walls.get(String(drainage.attributes?.from ?? "")));
    }
  }
  // Final hydrology is solved after Physical returns, so carry the exact
  // connected, medium-valid drainage reservations forward at full strength.
  // This is causal input to the river solver, not post-hoc evidence paint.
  for (const object of nativePhysicalPathObjects) {
    if (!["MATURE_DRAINAGE", "INWARD_DRAINAGE", "LIVING_RIVER"].includes(String(object.attributes?.role ?? ""))) continue;
    for (const [position, index] of object.tileIndices.entries()) if (landMask[index]) {
      drainage.guidance[index] = 1;
      moistures[index] = Math.max(moistures[index], 0.92);
      const downstream = position / Math.max(1, object.tileIndices.length - 1);
      if (!authoredRiverSources.has(index)) reliefValues[index] = Math.min(reliefValues[index], 0.08 + (1 - downstream) * 0.34);
    }
  }
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
    objects: [...plateObjects, ...continents, ...basins, ...atmosphericCells, ...climateObjects, ...rainShadows, ...glacialRegions, ...watershedObjects, ...convergentCauseObjects, ...divergentCauseObjects, ...nativePhysicalObjects],
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
      nativeInitialConditionRoles: new Set(plates.map((plate) => plate.causeRole)).size,
      nativeCauseObjects: convergentCauseObjects.length + divergentCauseObjects.length + plateObjects.length,
      nativeProtectedSemanticPlates: plates.filter((plate) => plate.protectedSemanticId).length,
      nativeSemanticInfluencedTiles: semanticFields.influencedTiles,
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
      narrativeTopologyInfluences: narrative?.evidence.diagnostics.topologyInfluences ?? 0,
      narrativeReliefInfluences: narrative?.evidence.diagnostics.reliefInfluences ?? 0,
      narrativeClimateInfluences: narrative?.evidence.diagnostics.climateInfluences ?? 0,
      narrativeHydrologyInfluences: narrative?.evidence.diagnostics.hydrologyInfluences ?? 0,
      nativePhysicalConditionRegions: physicalPlan?.regions.length ?? 0,
      nativePhysicalBoundaryPaths: physicalPlan?.paths.length ?? 0,
      nativePhysicalBoundObjects: nativePhysicalObjects.length,
      nativePhysicalSupplyTemplatesDropped: droppedIcehouseSupplyTemplates,
      nativePhysicalIslandArcSystemsDropped: droppedIslandArcSystems,
      nativePhysicalDynamicActiveMarginsReassigned: reassignedDynamicActiveMargins,
      nativePhysicalDynamicExtremeLandExchangeTiles: dynamicExtremeLandExchangeTiles,
      ...nativeConstraintDiagnostics(constraints),
    },
    narrativeProgram: undefined,
    narrativeAdapter: narrative?.evidence,
  };
  return { landMask, reliefValues, temperatures: smoothedTemperatures, moistures, elevations, riverGuidance: drainage.guidance, tiles, structure };
}
