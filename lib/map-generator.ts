import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";

export const MAP_SIZES = [
  { id: "DUEL", label: "Duel", width: 40, height: 24, recommendedPlayers: 2 },
  { id: "TINY", label: "Tiny", width: 56, height: 36, recommendedPlayers: 4 },
  { id: "SMALL", label: "Small", width: 66, height: 42, recommendedPlayers: 6 },
  { id: "STANDARD", label: "Standard", width: 80, height: 52, recommendedPlayers: 8 },
  { id: "LARGE", label: "Large", width: 104, height: 64, recommendedPlayers: 10 },
  { id: "HUGE", label: "Huge", width: 128, height: 80, recommendedPlayers: 12 },
] as const;

export type MapSizeId = (typeof MAP_SIZES)[number]["id"];
export type MapPresetId = "CONTINENTS" | "PANGAEA" | "ARCHIPELAGO" | "INLAND_SEAS" | "EARTHSEA" | "RIFT_REALMS" | "LABYRINTH" | "WILD_REGIONS";
export type MultiplayerBalance = "STANDARD" | "TOURNAMENT" | "TEAMS";
export type ClimateSetting = "COOL" | "TEMPERATE" | "HOT";
export type RainfallSetting = "ARID" | "NORMAL" | "WET";
export type WorldAgeSetting = "YOUNG" | "NORMAL" | "OLD";
export type StartQuality = "STANDARD" | "BALANCED" | "LEGENDARY";
export type WorldModifier = "NONE" | "FANTASTICAL" | "STRATEGIC_DEPTH" | "FRACTURED" | "DOOMSDAY";
export type GenerationStyle = "REALISTIC" | "FANTASTICAL" | "MUNDANE" | "BRUTAL";
export type DominantTerrain = "GRASSLAND" | "PLAINS" | "DESERT" | "TUNDRA";

export const DOMINANT_TERRAINS: ReadonlyArray<{ id: DominantTerrain; label: string }> = [
  { id: "GRASSLAND", label: "Grassland" },
  { id: "PLAINS", label: "Plains" },
  { id: "DESERT", label: "Desert" },
  { id: "TUNDRA", label: "Tundra" },
];

export const MAP_PRESETS: ReadonlyArray<{ id: MapPresetId; label: string; description: string; water: number; mountains: number }> = [
  { id: "CONTINENTS", label: "Convoluted Continents", description: "Broad, asymmetric continents with hooked peninsulas and broken inland coasts.", water: 58, mountains: 12 },
  { id: "PANGAEA", label: "Broken Pangaea", description: "One dominant landmass cleaved by gulfs, rifts, and difficult interiors.", water: 46, mountains: 14 },
  { id: "ARCHIPELAGO", label: "Shattered Isles", description: "Dense island chains, coastal empires, and narrow naval routes.", water: 72, mountains: 9 },
  { id: "INLAND_SEAS", label: "Inland Kingdoms", description: "A land-heavy non-wrapping realm punctured by lakes and irregular inland seas.", water: 24, mountains: 13 },
  { id: "EARTHSEA", label: "Earthsea Realms", description: "Many irregular continents, isolated minor islands, and long voyages.", water: 64, mountains: 11 },
  { id: "RIFT_REALMS", label: "Astronomy Rifts", description: "Fantastical basins divided by long deep-water scars and isolated shelves.", water: 61, mountains: 15 },
  { id: "LABYRINTH", label: "Labyrinth Realm", description: "A non-wrapping maze of land bridges, inland channels, chambers, and chokepoints.", water: 43, mountains: 18 },
  { id: "WILD_REGIONS", label: "Fantastical Regions", description: "Violently warped coastlines and climate regions with little concern for realism.", water: 55, mountains: 16 },
];

export const WORLD_MODIFIERS: ReadonlyArray<{ id: WorldModifier; label: string; description: string }> = [
  { id: "NONE", label: "None", description: "Use the selected map type without an additional world rule." },
  { id: "STRATEGIC_DEPTH", label: "Strategic Depth", description: "Builds long mountain systems, narrow passes, defended basins, and invasion corridors." },
  { id: "FRACTURED", label: "Fractured World", description: "Breaks land and water into smaller contested regions with abundant chokepoints." },
  { id: "DOOMSDAY", label: "Doomsday", description: "Creates scarred highlands, barren regions, fallout pockets, and harsh starts." },
];

export type MapGenerationOptions = {
  preset: MapPresetId;
  size: MapSizeId;
  seed: string;
  players: number;
  balance: MultiplayerBalance;
  strategicBalance: boolean;
  style: GenerationStyle;
  startQuality: StartQuality;
  modifier: WorldModifier;
  waterPercent: number;
  mountainPercent: number;
  dominantTerrains: DominantTerrain[];
  climate: ClimateSetting;
  rainfall: RainfallSetting;
  worldAge: WorldAgeSetting;
};

export const DEFAULT_GENERATION_OPTIONS: MapGenerationOptions = {
  preset: "WILD_REGIONS",
  size: "STANDARD",
  seed: "excogitare",
  players: 8,
  balance: "STANDARD",
  strategicBalance: false,
  style: "FANTASTICAL",
  startQuality: "BALANCED",
  modifier: "NONE",
  waterPercent: 55,
  mountainPercent: 16,
  dominantTerrains: [],
  climate: "TEMPERATE",
  rainfall: "NORMAL",
  worldAge: "NORMAL",
};

const TERRAINS = [
  "TERRAIN_OCEAN",
  "TERRAIN_COAST",
  "TERRAIN_GRASS",
  "TERRAIN_PLAINS",
  "TERRAIN_DESERT",
  "TERRAIN_TUNDRA",
  "TERRAIN_SNOW",
];
const FEATURES = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FALLOUT"];
const RESOURCES = [
  "RESOURCE_WHEAT",
  "RESOURCE_CATTLE",
  "RESOURCE_SHEEP",
  "RESOURCE_DEER",
  "RESOURCE_FISH",
  "RESOURCE_IRON",
  "RESOURCE_HORSE",
  "RESOURCE_COAL",
  "RESOURCE_OIL",
  "RESOURCE_ALUMINUM",
  "RESOURCE_URANIUM",
  "RESOURCE_GOLD",
  "RESOURCE_GEMS",
  "RESOURCE_SPICES",
];

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
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

function fractalNoise(x: number, y: number, seed: number) {
  return valueNoise(x, y, 18, seed) * 0.5 + valueNoise(x, y, 9, seed + 31) * 0.3 + valueNoise(x, y, 4.5, seed + 67) * 0.2;
}

function wrappedDistance(a: number, b: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 1 - distance);
}

type Center = { x: number; y: number; radiusX: number; radiusY: number };

function createCenters(count: number, random: () => number, radius: [number, number], realm = false): Center[] {
  return Array.from({ length: count }, () => ({
    x: realm ? 0.12 + random() * 0.76 : random(),
    y: 0.14 + random() * 0.72,
    radiusX: radius[0] + random() * (radius[1] - radius[0]),
    radiusY: radius[0] + random() * (radius[1] - radius[0]),
  }));
}

function centerField(nx: number, ny: number, centers: Center[], wraps: boolean) {
  let field = 0;
  for (const center of centers) {
    const dx = (wraps ? wrappedDistance(nx, center.x) : Math.abs(nx - center.x)) / center.radiusX;
    const dy = Math.abs(ny - center.y) / center.radiusY;
    field = Math.max(field, 1 - Math.hypot(dx, dy));
  }
  return field;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function voronoiBoundary(nx: number, ny: number, centers: Center[], wraps: boolean) {
  let nearest = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  for (const center of centers) {
    const dx = wraps ? wrappedDistance(nx, center.x) : Math.abs(nx - center.x);
    const distance = Math.hypot(dx, Math.abs(ny - center.y));
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
    } else if (distance < second) second = distance;
  }
  return clamp((second - nearest) * 9);
}

function warpedCoordinates(x: number, y: number, width: number, height: number, seed: number, strength: number) {
  const warpX = (fractalNoise(x + 401, y + 193, seed + 2003) - 0.5) * strength;
  const warpY = (fractalNoise(x + 89, y + 577, seed + 4001) - 0.5) * strength;
  return {
    x: x / width + warpX,
    y: y / Math.max(1, height - 1) + warpY,
  };
}

function diffuseRefine(
  source: number[],
  width: number,
  height: number,
  seed: number,
  wraps: boolean,
  passes: number,
  smoothing: number,
  detail: number,
) {
  let current = [...source];
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Array<number>(current.length);
    const scheduledDetail = detail * (1 - pass / Math.max(1, passes));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const around = neighbors(x, y, width, height, wraps);
        const neighborMean = around.reduce((sum, [nx, ny]) => sum + current[ny * width + nx], 0) / Math.max(1, around.length);
        const index = y * width + x;
        const noise = hashNoise(x + pass * 131, y + pass * 71, seed + pass * 977) - 0.5;
        next[index] = current[index] * (1 - smoothing) + neighborMean * smoothing + noise * scheduledDetail;
      }
    }
    current = next;
  }
  return current;
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(percentile * (sorted.length - 1))))];
}

function presetField(
  preset: MapPresetId,
  nx: number,
  ny: number,
  noise: number,
  centers: Center[],
  wraps: boolean,
) {
  const blobs = centerField(nx, ny, centers, wraps);
  const boundaries = voronoiBoundary(nx, ny, centers, wraps);
  if (preset === "PANGAEA") return blobs * 0.7 + noise * 0.46 + boundaries * 0.08 - Math.abs(ny - 0.5) * 0.08;
  if (preset === "ARCHIPELAGO") return blobs * 0.48 + noise * 0.56 + boundaries * 0.06;
  if (preset === "INLAND_SEAS") return 0.78 - blobs * 0.5 + noise * 0.27 - boundaries * 0.08;
  if (preset === "EARTHSEA") return blobs * 0.56 + noise * 0.5 + boundaries * 0.08;
  if (preset === "RIFT_REALMS") {
    const rift = Math.abs(Math.sin((nx * 4.4 + Math.sin(ny * 11) * 0.22 + noise * 0.34) * Math.PI));
    return blobs * 0.55 + noise * 0.43 - (1 - rift) * 0.32 + boundaries * 0.08;
  }
  if (preset === "LABYRINTH") {
    const maze = Math.abs(Math.sin((nx * 5.2 + noise * 0.8) * Math.PI) * Math.cos((ny * 4.4 - noise * 0.6) * Math.PI));
    return maze * 0.46 + blobs * 0.22 + noise * 0.42 - boundaries * 0.13;
  }
  if (preset === "WILD_REGIONS") {
    const brokenCells = Math.sin((nx * 7 + noise * 2.4) * Math.PI) * Math.cos((ny * 6 - noise * 1.7) * Math.PI);
    return blobs * 0.38 + noise * 0.5 + brokenCells * 0.14 + boundaries * 0.13;
  }
  return blobs * 0.62 + noise * 0.44 + boundaries * 0.08;
}

function neighbors(x: number, y: number, width: number, height: number, wraps: boolean) {
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const result: Array<[number, number]> = [];
  for (const [dx, dy] of offsets) {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) result.push([nextX, nextY]);
  }
  return result;
}

function passableReach(
  origin: number,
  landMask: boolean[],
  elevations: number[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const reached = new Set<number>([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
      const next = ny * width + nx;
      if (!landMask[next] || elevations[next] === 2 || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/**
 * Mountains may constrain movement, but may never seal off otherwise walkable
 * territory. Each landmass receives the fewest short hill passes needed to
 * join all of its non-mountain regions.
 */
function carveAccessiblePasses(
  landMask: boolean[],
  elevations: number[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const assigned = new Set<number>();
  for (let origin = 0; origin < landMask.length; origin += 1) {
    if (!landMask[origin] || assigned.has(origin)) continue;
    const landmass: number[] = [];
    const landQueue = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < landQueue.length; cursor += 1) {
      const index = landQueue[cursor];
      landmass.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
        const next = ny * width + nx;
        if (!landMask[next] || assigned.has(next)) continue;
        assigned.add(next);
        landQueue.push(next);
      }
    }

    let passableOrigin = landmass.find((index) => elevations[index] !== 2);
    if (passableOrigin === undefined) {
      passableOrigin = landmass[0];
      elevations[passableOrigin] = 1;
    }
    let accessible = passableReach(passableOrigin, landMask, elevations, width, height, wraps);
    let target = landmass.find((index) => elevations[index] !== 2 && !accessible.has(index));

    while (target !== undefined) {
      const previous = new Int32Array(landMask.length);
      previous.fill(-2);
      const queue = [...accessible];
      for (const index of accessible) previous[index] = -1;
      let bridge = -1;
      for (let cursor = 0; cursor < queue.length && bridge < 0; cursor += 1) {
        const index = queue[cursor];
        const x = index % width;
        const y = Math.floor(index / width);
        for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
          const next = ny * width + nx;
          if (!landMask[next] || previous[next] !== -2) continue;
          previous[next] = index;
          if (elevations[next] !== 2 && !accessible.has(next)) {
            bridge = next;
            break;
          }
          queue.push(next);
        }
      }
      if (bridge < 0) break;
      for (let index = bridge; index >= 0 && !accessible.has(index); index = previous[index]) {
        if (elevations[index] === 2) elevations[index] = 1;
      }
      accessible = passableReach(passableOrigin, landMask, elevations, width, height, wraps);
      target = landmass.find((index) => elevations[index] !== 2 && !accessible.has(index));
    }
  }
}

function chooseTerrain(
  temperature: number,
  moisture: number,
  variation: number,
  dominantTerrains: DominantTerrain[],
  brutal: boolean,
) {
  const dominant = new Set(dominantTerrains);
  const bias = (terrain: DominantTerrain) => dominant.has(terrain) ? 0.62 : 0;
  const scores: Array<[number, number]> = [
    [2, 1.08 - Math.abs(moisture - 0.72) * 1.35 - Math.abs(temperature - 0.61) * 0.72 + bias("GRASSLAND") - (brutal ? 0.22 : 0)],
    [3, 0.98 - Math.abs(moisture - 0.48) * 1.12 - Math.abs(temperature - 0.57) * 0.42 + bias("PLAINS") + (brutal ? 0.12 : 0)],
    [4, 0.62 + (temperature - 0.58) * 0.7 + (0.35 - moisture) * 1.7 + bias("DESERT") + (brutal ? 0.16 : 0)],
    [5, 0.75 + (0.4 - temperature) * 1.62 - Math.abs(moisture - 0.5) * 0.32 + bias("TUNDRA") + (brutal ? 0.08 : 0)],
    [6, 0.75 + (0.24 - temperature) * 3.4 - Math.abs(moisture - 0.56) * 0.18],
  ];
  // Broad, low-amplitude regional variation breaks visible latitude bands
  // without erasing the overall temperature gradient.
  scores[0][1] += variation * 0.16;
  scores[1][1] -= variation * 0.08;
  scores[2][1] -= variation * 0.12;
  scores[3][1] += variation * 0.1;
  return scores.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

function hexDistance(a: [number, number], b: [number, number], width: number, wraps: boolean) {
  const toCube = ([x, y]: [number, number]) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y];
  };
  const direct = (one: [number, number], two: [number, number]) => {
    const ac = toCube(one);
    const bc = toCube(two);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(a, b);
  return Math.min(direct(a, b), direct([a[0] - width, a[1]], b), direct([a[0] + width, a[1]], b));
}

function placeStartLocations(
  tiles: Civ5Tile[],
  width: number,
  height: number,
  count: number,
  wraps: boolean,
  balance: MultiplayerBalance,
  random: () => number,
) {
  const candidates: Array<[number, number]> = [];
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = tiles[y * width + x];
      if (tile.terrain < 2 || tile.elevation === 2) continue;
      const workable = neighbors(x, y, width, height, wraps).filter(([nx, ny]) => {
        const neighbor = tiles[ny * width + nx];
        return neighbor.terrain >= 2 && neighbor.elevation < 2;
      }).length;
      if (workable >= 4) candidates.push([x, y]);
    }
  }
  if (!candidates.length) return [];

  const selected: Array<[number, number]> = [candidates[Math.floor(random() * candidates.length)]];
  while (selected.length < count && selected.length < candidates.length) {
    let best = candidates[0];
    let bestScore = -1;
    for (const candidate of candidates) {
      if (selected.some((item) => item[0] === candidate[0] && item[1] === candidate[1])) continue;
      const nearest = Math.min(...selected.map((item) => hexDistance(candidate, item, width, wraps)));
      const localYield = neighbors(candidate[0], candidate[1], width, height, wraps).reduce((score, [x, y]) => {
        const tile = tiles[y * width + x];
        return score + (tile.terrain === 2 ? 2 : tile.terrain === 3 ? 1.4 : tile.terrain >= 4 ? 0.8 : 0.25) + (tile.resource !== 255 ? 1 : 0);
      }, 0);
      const target = balance === "TOURNAMENT" ? nearest * 2.5 + localYield : nearest * 3 + localYield * 0.35;
      if (target > bestScore) {
        bestScore = target;
        best = candidate;
      }
    }
    selected.push(best);
  }

  if (balance === "TEAMS" && selected.length > 3) {
    const ordered: Array<[number, number]> = [];
    const remaining = [...selected];
    while (remaining.length) {
      const anchor = remaining.shift()!;
      let partnerIndex = 0;
      let partnerDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const distance = hexDistance(anchor, remaining[index], width, wraps);
        if (distance < partnerDistance) {
          partnerDistance = distance;
          partnerIndex = index;
        }
      }
      ordered.push(anchor);
      if (remaining.length) ordered.push(remaining.splice(partnerIndex, 1)[0]);
    }
    selected.splice(0, selected.length, ...ordered);
  }

  return selected.map<Civ5StartLocation>(([x, y], player) => ({
    x,
    y,
    player,
    civilization: "",
    leader: "",
    team: balance === "TEAMS" ? Math.floor(player / 2) : player,
    playable: true,
    cityState: false,
  }));
}

function normalizeStarts(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  quality: StartQuality,
  tournament: boolean,
) {
  const resourceIndex = (name: string) => RESOURCES.indexOf(name);
  for (const start of starts) {
    const origin = tiles[start.y * width + start.x];
    if (quality === "LEGENDARY") {
      origin.terrain = 2;
      origin.elevation = 0;
      origin.feature = 255;
    }
    const visited = new Set([`${start.x},${start.y}`]);
    let frontier: Array<[number, number]> = [[start.x, start.y]];
    const workable: Array<{ x: number; y: number; tile: Civ5Tile }> = [];
    for (let radius = 0; radius < (quality === "LEGENDARY" ? 2 : 1); radius += 1) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          visited.add(key);
          next.push([nx, ny]);
          const tile = tiles[ny * width + nx];
          if (quality === "LEGENDARY" && tile.terrain >= 2 && tile.elevation === 2 && workable.length < 2) tile.elevation = 1;
          if (tile.terrain >= 2 && tile.elevation < 2) workable.push({ x: nx, y: ny, tile });
        }
      }
      frontier = next;
    }
    if (quality === "LEGENDARY") {
      for (const [index, target] of workable.slice(0, 4).entries()) {
        if (index < 2) target.tile.terrain = 2;
        target.tile.elevation = index === 3 ? 1 : 0;
      }
    }
    const placements = quality === "LEGENDARY"
      ? ["RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_GOLD", "RESOURCE_GEMS"]
      : ["RESOURCE_WHEAT", "RESOURCE_IRON", "RESOURCE_HORSE", ...(tournament ? ["RESOURCE_CATTLE"] : [])];
    placements.forEach((resource, index) => {
      const target = workable[index % Math.max(1, workable.length)];
      if (!target) return;
      target.tile.resource = resourceIndex(resource);
      target.tile.resourceAmount = resource.includes("IRON") || resource.includes("HORSE") ? 2 : 1;
    });
  }
}

export function balanceMapStarts(map: Civ5Map, options: MapGenerationOptions) {
  const resolved = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const random = randomFactory(seedHash(`${resolved.seed}:starts:${map.width}x${map.height}`));
  const playerCount = Math.max(2, Math.min(22, Math.round(resolved.players)));
  const startLocations = placeStartLocations(tiles, map.width, map.height, playerCount, map.wraps, resolved.balance, random);
  if (resolved.startQuality !== "STANDARD" || resolved.strategicBalance || resolved.balance === "TOURNAMENT") {
    normalizeStarts(tiles, startLocations, map.width, map.height, map.wraps, resolved.startQuality, resolved.balance === "TOURNAMENT");
  }
  return { ...map, tiles, players: playerCount, startLocations };
}

export function generateMap(options: MapGenerationOptions): Civ5Map {
  const resolved = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  if (resolved.modifier === "FANTASTICAL") resolved.style = "FANTASTICAL";
  const size = MAP_SIZES.find((item) => item.id === resolved.size) ?? MAP_SIZES[3];
  const width = size.width;
  const height = size.height;
  const seed = seedHash(`${resolved.seed}:${resolved.preset}:${resolved.size}:${resolved.style}:${resolved.modifier}`);
  const random = randomFactory(seed);
  const wraps = resolved.preset !== "INLAND_SEAS" && resolved.preset !== "LABYRINTH";
  const centerConfig: Record<MapPresetId, [number, [number, number]]> = {
    CONTINENTS: [4, [0.18, 0.31]],
    PANGAEA: [1, [0.43, 0.54]],
    ARCHIPELAGO: [28, [0.045, 0.12]],
    INLAND_SEAS: [9, [0.07, 0.17]],
    EARTHSEA: [12, [0.08, 0.21]],
    RIFT_REALMS: [9, [0.11, 0.25]],
    LABYRINTH: [13, [0.07, 0.17]],
    WILD_REGIONS: [15, [0.065, 0.2]],
  };
  const [centerCount, centerRadius] = centerConfig[resolved.preset];
  const centers = createCenters(centerCount, random, centerRadius, !wraps);
  const plateCenters = createCenters(Math.max(6, Math.round(centerCount * 0.7)), random, [0.09, 0.19], !wraps);
  if (resolved.preset === "PANGAEA") centers[0] = { x: 0.5, y: 0.5, radiusX: 0.49, radiusY: 0.43 };
  const landMask = new Array<boolean>(width * height);
  let fieldValues = new Array<number>(width * height);
  const warpStrength = (resolved.style === "FANTASTICAL" ? 0.24 : resolved.style === "REALISTIC" ? 0.1 : resolved.style === "BRUTAL" ? 0.15 : 0.035)
    + (resolved.modifier === "FRACTURED" ? 0.07 : resolved.modifier === "STRATEGIC_DEPTH" ? 0.035 : 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const warped = warpedCoordinates(x, y, width, height, seed, warpStrength);
      const nx = wraps ? ((warped.x % 1) + 1) % 1 : clamp(warped.x, -0.1, 1.1);
      const ny = clamp(warped.y, -0.08, 1.08);
      const noise = fractalNoise(x, y, seed);
      const fineDetail = valueNoise(x + 701, y + 311, resolved.style === "FANTASTICAL" ? 2.2 : 3.8, seed + 9001) - 0.5;
      let field = presetField(resolved.preset, nx, ny, noise, centers, wraps);
      field += fineDetail * (resolved.style === "FANTASTICAL" ? 0.2 : resolved.style === "REALISTIC" ? 0.08 : resolved.style === "BRUTAL" ? 0.13 : 0.035);
      if (resolved.modifier === "FRACTURED") field += (valueNoise(x, y, 2.1, seed + 1171) - 0.5) * 0.28;
      const polarPenalty = wraps ? Math.max(0, Math.abs(y / Math.max(1, height - 1) - 0.5) - 0.43) * (resolved.style === "FANTASTICAL" ? 0.65 : 1.45) : 0;
      if (!wraps) {
        const edge = Math.min(x / width, 1 - x / width, y / height, 1 - y / height);
        if (edge < 0.055) field -= (0.055 - edge) * 3.5;
      }
      const index = y * width + x;
      fieldValues[index] = field - polarPenalty;
    }
  }

  // Terrain Diffusion uses a coarse conditioning map followed by learned refinement.
  // The browser-native realistic style mirrors that two-stage structure with a
  // deterministic denoising/refinement schedule and Earth-like quantile targets.
  if (resolved.style === "REALISTIC") {
    fieldValues = diffuseRefine(fieldValues, width, height, seed + 3001, wraps, 4, 0.2, 0.07);
  }
  const waterPercent = clamp(resolved.waterPercent, 0, 90);
  const landThreshold = waterPercent === 0 ? Number.NEGATIVE_INFINITY : quantile(fieldValues, waterPercent / 100);
  const reliefBaseline = Number.isFinite(landThreshold) ? landThreshold : quantile(fieldValues, 0.15);
  for (let index = 0; index < landMask.length; index += 1) landMask[index] = waterPercent === 0 || fieldValues[index] > landThreshold;

  const tiles: Civ5Tile[] = [];
  let reliefValues = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const nx = x / width;
      const ny = y / Math.max(1, height - 1);
      const detail = fractalNoise(x + 211, y + 307, seed + 1301);
      const plateBoundary = 1 - voronoiBoundary(nx, ny, plateCenters, wraps);
      let relief = detail * 0.62 + Math.max(0, fieldValues[index] - reliefBaseline) * 0.16;
      if (resolved.style === "REALISTIC") relief += Math.pow(plateBoundary, 3) * 0.52;
      if (resolved.style === "FANTASTICAL") relief += Math.pow(1 - voronoiBoundary(nx, ny, centers, wraps), 2) * 0.22;
      if (resolved.style === "BRUTAL") {
        const contestedRidge = 1 - Math.abs(Math.sin((nx * 4.8 + detail * 0.56 + Math.sin(ny * 8.2) * 0.18) * Math.PI));
        relief += Math.pow(plateBoundary, 2.4) * 0.26 + Math.pow(contestedRidge, 3.2) * 0.35;
      }
      if (resolved.modifier === "STRATEGIC_DEPTH") {
        const ridgeA = 1 - Math.abs(Math.sin((nx * 5.6 + detail * 0.75 + Math.sin(ny * 9) * 0.17) * Math.PI));
        const ridgeB = 1 - Math.abs(Math.cos((ny * 4.3 - detail * 0.62 + Math.sin(nx * 11) * 0.14) * Math.PI));
        relief += Math.pow(Math.max(ridgeA, ridgeB * 0.8), 3) * 0.76;
      }
      if (resolved.modifier === "DOOMSDAY") relief += valueNoise(x + 13, y + 29, 6, seed + 817) * 0.3;
      reliefValues[index] = relief;
    }
  }
  if (resolved.style === "REALISTIC") {
    reliefValues = diffuseRefine(reliefValues, width, height, seed + 6007, wraps, 2, 0.12, 0.045);
  }
  const landRelief = reliefValues.filter((_, index) => landMask[index]);
  const effectiveMountainPercent = resolved.modifier === "STRATEGIC_DEPTH"
    ? Math.max(22, resolved.mountainPercent)
    : resolved.modifier === "DOOMSDAY" || resolved.style === "BRUTAL" ? Math.max(18, resolved.mountainPercent) : clamp(resolved.mountainPercent, 0, 38);
  const hillPercent = resolved.worldAge === "YOUNG" ? 27 : resolved.worldAge === "OLD" ? 12 : 19;
  // Generate a small surplus because the accessibility pass intentionally
  // demotes mountains wherever a complete range would seal off land.
  const mountainSelectionPercent = effectiveMountainPercent <= 0 ? 0 : clamp(
    effectiveMountainPercent + (resolved.modifier === "STRATEGIC_DEPTH" ? 4 : 2.2),
    0,
    42,
  );
  const mountainThreshold = mountainSelectionPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - mountainSelectionPercent / 100);
  const hillThreshold = quantile(landRelief, 1 - clamp(mountainSelectionPercent + hillPercent, 0, 72) / 100);
  const rainShift = resolved.rainfall === "WET" ? -0.1 : resolved.rainfall === "ARID" ? 0.12 : 0;
  const tempShift = resolved.climate === "HOT" ? 0.16 : resolved.climate === "COOL" ? -0.16 : 0;
  const elevations = landMask.map((land, index) => land ? (reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0) : 0);
  carveAccessiblePasses(landMask, elevations, width, height, wraps);
  const dominantTerrains = Array.isArray(resolved.dominantTerrains) ? resolved.dominantTerrains : [];
  const temperatures = new Array<number>(width * height);
  const moistures = new Array<number>(width * height);

  for (let y = 0; y < height; y += 1) {
    const latitude = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
    let airborneMoisture = clamp(0.6 - rainShift + (valueNoise(0, y + 43, 8, seed + 1741) - 0.5) * 0.18);
    let upwindRelief = reliefValues[y * width];
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const regionalTemperature = (valueNoise(x + 311, y + 907, 11, seed + 2711) - 0.5)
        * (resolved.style === "FANTASTICAL" ? 0.62 : resolved.style === "REALISTIC" ? 0.34 : resolved.style === "BRUTAL" ? 0.3 : 0.25);
      const localTemperature = (fractalNoise(x + 389, y + 127, seed + 2203) - 0.5)
        * (resolved.style === "FANTASTICAL" ? 0.36 : resolved.style === "REALISTIC" ? 0.18 : 0.14);
      const altitudeCooling = resolved.style === "REALISTIC" ? Math.max(0, reliefValues[index] - 0.48) * 0.26 : 0;
      const latitudeTemperature = 0.1 + Math.cos(latitude * Math.PI / 2) * 0.82;
      temperatures[index] = clamp(latitudeTemperature + tempShift + regionalTemperature + localTemperature - altitudeCooling);

      const backgroundMoisture = clamp(fractalNoise(x + 101, y + 53, seed + 701) - rainShift - (resolved.style === "BRUTAL" ? 0.09 : 0));
      if (resolved.style === "REALISTIC") {
        if (!landMask[index]) airborneMoisture += (0.84 - airborneMoisture) * 0.34;
        else airborneMoisture += (backgroundMoisture - airborneMoisture) * 0.12;
        const rise = Math.max(0, reliefValues[index] - upwindRelief);
        const mountainLift = elevations[index] === 2 ? 0.06 : elevations[index] === 1 ? 0.015 : 0;
        const precipitation = rise * 0.72 + mountainLift;
        moistures[index] = clamp(airborneMoisture + precipitation * 0.7);
        airborneMoisture = clamp(airborneMoisture - precipitation * 0.78);
        upwindRelief = reliefValues[index];
      } else {
        moistures[index] = backgroundMoisture;
      }
      if (resolved.modifier === "DOOMSDAY") moistures[index] = clamp(moistures[index] - 0.14);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const land = landMask[index];
      const adjacentLand = neighbors(x, y, width, height, wraps).some(([nx, ny]) => landMask[ny * width + nx]);
      const latitude = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
      const relief = reliefValues[index];
      const climateValue = temperatures[index];
      const moisture = moistures[index];
      const biomeVariation = valueNoise(x + 733, y + 419, 6.5, seed + 3511) - 0.5;
      let terrain = land ? 2 : adjacentLand ? 1 : 0;
      if (land) terrain = chooseTerrain(climateValue, moisture, biomeVariation, dominantTerrains, resolved.style === "BRUTAL");

      let feature = 255;
      if (!land && latitude > 0.9 && random() > 0.25) feature = 3;
      else if (land && resolved.modifier === "DOOMSDAY" && random() > 0.87) feature = 5;
      else if (land && terrain === 4 && moisture < 0.25 && random() > 0.95) feature = 4;
      else if (land && climateValue > 0.72 && moisture > 0.66) feature = 1;
      else if (land && terrain === 2 && moisture > 0.83) feature = 2;
      else if (land && terrain !== 4 && terrain !== 6 && moisture > 0.61) feature = 0;

      const elevation = elevations[index];
      let resource = 255;
      if (random() > (resolved.style === "BRUTAL" ? 0.95 : 0.91)) {
        if (!land) resource = adjacentLand ? 4 : 255;
        else if (elevation === 2) resource = random() > 0.5 ? 11 : 12;
        else resource = Math.floor(random() * RESOURCES.length);
      }

      const riverChance = resolved.style === "REALISTIC"
        ? clamp((moisture - 0.56) * 0.12 + Math.max(0, relief - 0.58) * 0.04, 0, 0.11)
        : resolved.style === "FANTASTICAL" ? 0.035 : resolved.style === "BRUTAL" ? 0.012 : 0.022;
      tiles.push({
        terrain,
        resource,
        feature,
        river: land && elevation < 2 && random() < riverChance ? 1 << Math.floor(random() * 3) : 0,
        elevation,
        continent: land ? 1 + Math.floor(random() * 4) : 0,
        wonder: 255,
        resourceAmount: resource === 255 ? 0 : resource >= 5 && resource <= 10 ? 2 : 1,
      });
    }
  }

  const playerCount = Math.max(2, Math.min(22, Math.round(resolved.players)));
  const startLocations = placeStartLocations(tiles, width, height, playerCount, wraps, resolved.balance, random);
  if (resolved.startQuality !== "STANDARD" || resolved.strategicBalance || resolved.balance === "TOURNAMENT") {
    normalizeStarts(tiles, startLocations, width, height, wraps, resolved.startQuality, resolved.balance === "TOURNAMENT");
  }
  const presetName = MAP_PRESETS.find((preset) => preset.id === resolved.preset)?.label ?? "Generated World";
  const modifierName = WORLD_MODIFIERS.find((modifier) => modifier.id === resolved.modifier)?.label;

  return {
    name: `${presetName} — ${resolved.seed}`,
    description: `A seeded ${resolved.style.toLowerCase()} ${presetName.toLowerCase()} map${modifierName && modifierName !== "None" ? ` with ${modifierName}` : ""}, targeting ${Math.round(waterPercent)}% water and ${Math.round(effectiveMountainPercent)}% mountains.`,
    worldSize: size.id,
    version: 12,
    width,
    height,
    players: playerCount,
    wraps,
    terrains: [...TERRAINS],
    features: [...FEATURES],
    wonders: [],
    resources: [...RESOURCES],
    tiles,
    startLocations,
    source: "generated",
    generation: { ...resolved, waterPercent, mountainPercent: effectiveMountainPercent },
  };
}
