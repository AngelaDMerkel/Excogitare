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
export type MapPresetId = "CONTINENTS" | "PANGAEA" | "ARCHIPELAGO" | "INLAND_SEAS" | "EARTHSEA" | "RIFT_REALMS";
export type MultiplayerBalance = "STANDARD" | "TOURNAMENT" | "TEAMS";
export type ClimateSetting = "COOL" | "TEMPERATE" | "HOT";
export type RainfallSetting = "ARID" | "NORMAL" | "WET";
export type WorldAgeSetting = "YOUNG" | "NORMAL" | "OLD";

export const MAP_PRESETS: ReadonlyArray<{ id: MapPresetId; label: string; description: string }> = [
  { id: "CONTINENTS", label: "Twin Continents", description: "Two to four broad landmasses divided by navigable oceans." },
  { id: "PANGAEA", label: "Great Pangaea", description: "One dominant continent with a broken, varied coastline." },
  { id: "ARCHIPELAGO", label: "Shattered Isles", description: "Dense island chains, coastal empires, and naval routes." },
  { id: "INLAND_SEAS", label: "Inland Kingdoms", description: "A land-heavy realm punctuated by lakes and inland seas." },
  { id: "EARTHSEA", label: "Earthsea Realms", description: "Many irregular continents and isolated minor islands." },
  { id: "RIFT_REALMS", label: "Astral Rifts", description: "Fantastical basins split by long, deep ocean rifts." },
];

export type MapGenerationOptions = {
  preset: MapPresetId;
  size: MapSizeId;
  seed: string;
  players: number;
  balance: MultiplayerBalance;
  strategicBalance: boolean;
  climate: ClimateSetting;
  rainfall: RainfallSetting;
  worldAge: WorldAgeSetting;
};

export const DEFAULT_GENERATION_OPTIONS: MapGenerationOptions = {
  preset: "CONTINENTS",
  size: "STANDARD",
  seed: "excogitare",
  players: 8,
  balance: "STANDARD",
  strategicBalance: true,
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
const FEATURES = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS"];
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

function presetField(
  preset: MapPresetId,
  nx: number,
  ny: number,
  noise: number,
  centers: Center[],
  wraps: boolean,
) {
  const blobs = centerField(nx, ny, centers, wraps);
  if (preset === "PANGAEA") return blobs * 0.84 + noise * 0.37 - Math.abs(ny - 0.5) * 0.08;
  if (preset === "ARCHIPELAGO") return blobs * 0.64 + noise * 0.48;
  if (preset === "INLAND_SEAS") return 0.78 - blobs * 0.55 + noise * 0.2;
  if (preset === "EARTHSEA") return blobs * 0.7 + noise * 0.43;
  if (preset === "RIFT_REALMS") {
    const rift = Math.abs(Math.sin((nx * 3.2 + Math.sin(ny * 8) * 0.14) * Math.PI));
    return blobs * 0.72 + noise * 0.34 - (1 - rift) * 0.25;
  }
  return blobs * 0.78 + noise * 0.34;
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
  tournament: boolean,
) {
  const resourceIndex = (name: string) => RESOURCES.indexOf(name);
  for (const start of starts) {
    const ring = neighbors(start.x, start.y, width, height, wraps)
      .map(([x, y]) => ({ x, y, tile: tiles[y * width + x] }))
      .filter(({ tile }) => tile.terrain >= 2 && tile.elevation < 2);
    const placements = ["RESOURCE_WHEAT", "RESOURCE_IRON", "RESOURCE_HORSE", ...(tournament ? ["RESOURCE_CATTLE"] : [])];
    placements.forEach((resource, index) => {
      const target = ring[index % Math.max(1, ring.length)];
      if (!target) return;
      target.tile.resource = resourceIndex(resource);
      target.tile.resourceAmount = resource.includes("IRON") || resource.includes("HORSE") ? 2 : 1;
    });
  }
}

export function balanceMapStarts(map: Civ5Map, options: MapGenerationOptions) {
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const random = randomFactory(seedHash(`${options.seed}:starts:${map.width}x${map.height}`));
  const playerCount = Math.max(2, Math.min(22, Math.round(options.players)));
  const startLocations = placeStartLocations(tiles, map.width, map.height, playerCount, map.wraps, options.balance, random);
  if (options.strategicBalance || options.balance === "TOURNAMENT") {
    normalizeStarts(tiles, startLocations, map.width, map.height, map.wraps, options.balance === "TOURNAMENT");
  }
  return { ...map, tiles, players: playerCount, startLocations };
}

export function generateMap(options: MapGenerationOptions): Civ5Map {
  const size = MAP_SIZES.find((item) => item.id === options.size) ?? MAP_SIZES[3];
  const width = size.width;
  const height = size.height;
  const seed = seedHash(`${options.seed}:${options.preset}:${options.size}`);
  const random = randomFactory(seed);
  const wraps = options.preset !== "INLAND_SEAS";
  const centerConfig: Record<MapPresetId, [number, [number, number]]> = {
    CONTINENTS: [3, [0.2, 0.32]],
    PANGAEA: [1, [0.43, 0.54]],
    ARCHIPELAGO: [22, [0.055, 0.13]],
    INLAND_SEAS: [7, [0.08, 0.18]],
    EARTHSEA: [9, [0.1, 0.23]],
    RIFT_REALMS: [7, [0.13, 0.27]],
  };
  const [centerCount, centerRadius] = centerConfig[options.preset];
  const centers = createCenters(centerCount, random, centerRadius, !wraps);
  if (options.preset === "PANGAEA") centers[0] = { x: 0.5, y: 0.5, radiusX: 0.48, radiusY: 0.42 };
  const threshold: Record<MapPresetId, number> = {
    CONTINENTS: 0.36,
    PANGAEA: 0.34,
    ARCHIPELAGO: 0.36,
    INLAND_SEAS: 0.35,
    EARTHSEA: 0.35,
    RIFT_REALMS: 0.35,
  };
  const landMask = new Array<boolean>(width * height);
  const fieldValues = new Array<number>(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / Math.max(1, height - 1);
      const noise = fractalNoise(x, y, seed);
      const field = presetField(options.preset, nx, ny, noise, centers, wraps);
      const polarPenalty = wraps ? Math.max(0, Math.abs(ny - 0.5) - 0.43) * 1.5 : 0;
      const index = y * width + x;
      fieldValues[index] = field;
      landMask[index] = field - polarPenalty > threshold[options.preset];
    }
  }

  const tiles: Civ5Tile[] = [];
  const ageElevation = options.worldAge === "YOUNG" ? [0.69, 0.84] : options.worldAge === "OLD" ? [0.79, 0.93] : [0.74, 0.89];
  const rainShift = options.rainfall === "WET" ? -0.1 : options.rainfall === "ARID" ? 0.12 : 0;
  const tempShift = options.climate === "HOT" ? 0.16 : options.climate === "COOL" ? -0.16 : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const land = landMask[index];
      const adjacentLand = neighbors(x, y, width, height, wraps).some(([nx, ny]) => landMask[ny * width + nx]);
      const latitude = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
      const climateValue = Math.max(0, Math.min(1, 1 - latitude + tempShift));
      const moisture = fractalNoise(x + 101, y + 53, seed + 701) - rainShift;
      let terrain = land ? 2 : adjacentLand ? 1 : 0;
      if (land && climateValue < 0.12) terrain = 6;
      else if (land && climateValue < 0.28) terrain = 5;
      else if (land && climateValue > 0.66 && moisture < 0.43) terrain = 4;
      else if (land && moisture < 0.58) terrain = 3;

      let feature = 255;
      if (!land && latitude > 0.9 && random() > 0.25) feature = 3;
      else if (land && terrain === 4 && moisture < 0.25 && random() > 0.95) feature = 4;
      else if (land && climateValue > 0.72 && moisture > 0.66) feature = 1;
      else if (land && terrain === 2 && moisture > 0.83) feature = 2;
      else if (land && terrain !== 4 && terrain !== 6 && moisture > 0.61) feature = 0;

      const relief = fractalNoise(x + 211, y + 307, seed + 1301) + (fieldValues[index] - threshold[options.preset]) * 0.18;
      const elevation = land ? (relief > ageElevation[1] ? 2 : relief > ageElevation[0] ? 1 : 0) : 0;
      let resource = 255;
      if (random() > 0.91) {
        if (!land) resource = adjacentLand ? 4 : 255;
        else if (elevation === 2) resource = random() > 0.5 ? 11 : 12;
        else resource = Math.floor(random() * RESOURCES.length);
      }

      tiles.push({
        terrain,
        resource,
        feature,
        river: land && elevation < 2 && random() > 0.975 ? 1 << Math.floor(random() * 3) : 0,
        elevation,
        continent: land ? 1 + Math.floor(random() * 4) : 0,
        wonder: 255,
        resourceAmount: resource === 255 ? 0 : resource >= 5 && resource <= 10 ? 2 : 1,
      });
    }
  }

  const playerCount = Math.max(2, Math.min(22, Math.round(options.players)));
  const startLocations = placeStartLocations(tiles, width, height, playerCount, wraps, options.balance, random);
  if (options.strategicBalance || options.balance === "TOURNAMENT") {
    normalizeStarts(tiles, startLocations, width, height, wraps, options.balance === "TOURNAMENT");
  }
  const presetName = MAP_PRESETS.find((preset) => preset.id === options.preset)?.label ?? "Generated World";

  return {
    name: `${presetName} — ${options.seed}`,
    description: `A seeded ${presetName.toLowerCase()} map generated by Excogitare with ${options.balance.toLowerCase()} multiplayer balance.`,
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
    generation: { ...options },
  };
}
