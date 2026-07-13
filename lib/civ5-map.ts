export type Civ5Tile = {
  terrain: number;
  resource: number;
  feature: number;
  river: number;
  elevation: number;
  continent: number;
  wonder: number;
  resourceAmount: number;
};

export type Civ5Map = {
  name: string;
  description: string;
  worldSize: string;
  version: number;
  width: number;
  height: number;
  players: number;
  wraps: boolean;
  terrains: string[];
  features: string[];
  wonders: string[];
  resources: string[];
  tiles: Civ5Tile[];
  source: "demo" | "file";
};

const HEADER_SIZE = 42;
const TILE_SIZE = 8;
const MAX_DIMENSION = 512;
const decoder = new TextDecoder("utf-8");

function readStringList(bytes: Uint8Array) {
  const values = decoder.decode(bytes).split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function cleanText(bytes: Uint8Array) {
  return decoder.decode(bytes).replace(/\0+$/g, "").trim();
}

export function parseCiv5Map(buffer: ArrayBuffer, fallbackName: string): Civ5Map {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error("This file is too small to contain a Civ5 map header.");
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  const scenarioVersion = view.getUint8(offset++);
  const version = scenarioVersion & 0x0f;
  const width = view.getUint32(offset, true);
  offset += 4;
  const height = view.getUint32(offset, true);
  offset += 4;
  const players = view.getUint8(offset++);
  const settings = view.getUint8(offset);
  offset += 4;

  const terrainSize = view.getUint32(offset, true);
  offset += 4;
  const featureSize = view.getUint32(offset, true);
  offset += 4;
  const wonderSize = view.getUint32(offset, true);
  offset += 4;
  const resourceSize = view.getUint32(offset, true);
  offset += 4;
  const modSize = view.getUint32(offset, true);
  offset += 4;
  const nameSize = view.getUint32(offset, true);
  offset += 4;
  const descriptionSize = view.getUint32(offset, true);
  offset += 4;

  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`Unsupported map dimensions: ${width} × ${height}.`);
  }

  const take = (size: number, label: string) => {
    if (size < 0 || offset + size > bytes.byteLength) {
      throw new Error(`The ${label} section extends past the end of the file.`);
    }
    const result = bytes.subarray(offset, offset + size);
    offset += size;
    return result;
  };

  const terrains = readStringList(take(terrainSize, "terrain"));
  const features = readStringList(take(featureSize, "feature"));
  const wonders = readStringList(take(wonderSize, "natural wonder"));
  const resources = readStringList(take(resourceSize, "resource"));
  take(modSize, "mod data");
  const mapName = cleanText(take(nameSize, "map name"));
  const description = cleanText(take(descriptionSize, "map description"));

  let worldSize = "Custom";
  if (version >= 11) {
    if (offset + 4 > bytes.byteLength) {
      throw new Error("The world-size header is incomplete.");
    }
    const worldSizeLength = view.getUint32(offset, true);
    offset += 4;
    worldSize = cleanText(take(worldSizeLength, "world size")) || "Custom";
  }

  const tileBytes = width * height * TILE_SIZE;
  if (offset + tileBytes > bytes.byteLength) {
    throw new Error("The file ends before all map tiles can be read.");
  }

  const tiles: Civ5Tile[] = new Array(width * height);
  for (let index = 0; index < tiles.length; index += 1) {
    tiles[index] = {
      terrain: view.getUint8(offset),
      resource: view.getUint8(offset + 1),
      feature: view.getUint8(offset + 2),
      river: view.getUint8(offset + 3),
      elevation: view.getUint8(offset + 4),
      continent: view.getUint8(offset + 5),
      wonder: view.getUint8(offset + 6),
      resourceAmount: view.getUint8(offset + 7),
    };
    offset += TILE_SIZE;
  }

  return {
    name: mapName || fallbackName.replace(/\.civ5map$/i, ""),
    description,
    worldSize: worldSize.replace(/^WORLDSIZE_/i, "").replaceAll("_", " "),
    version,
    width,
    height,
    players,
    wraps: Boolean(settings & 1),
    terrains,
    features,
    wonders,
    resources,
    tiles,
    source: "file",
  };
}

function noise(x: number, y: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createDemoMap(): Civ5Map {
  const width = 28;
  const height = 16;
  const terrains = [
    "TERRAIN_OCEAN",
    "TERRAIN_COAST",
    "TERRAIN_GRASS",
    "TERRAIN_PLAINS",
    "TERRAIN_DESERT",
    "TERRAIN_TUNDRA",
    "TERRAIN_SNOW",
  ];
  const features = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH"];
  const resources = [
    "RESOURCE_WHEAT",
    "RESOURCE_IRON",
    "RESOURCE_GOLD",
    "RESOURCE_DEER",
    "RESOURCE_FISH",
  ];
  const tiles: Civ5Tile[] = [];

  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    const displayY = height - 1 - sourceY;
    for (let x = 0; x < width; x += 1) {
      const latitude = Math.abs(displayY / (height - 1) - 0.5) * 2;
      const western = Math.hypot((x - 8) / 6.5, (displayY - 8) / 6.8);
      const eastern = Math.hypot((x - 20) / 7.5, (displayY - 7) / 5.6);
      const landNoise = (noise(x, displayY) - 0.5) * 0.32;
      const land = Math.min(western, eastern) + landNoise < 0.92;
      const nearLand = Math.min(western, eastern) + landNoise < 1.1;
      let terrain = land ? 2 : nearLand ? 1 : 0;

      if (land && latitude > 0.84) terrain = 6;
      else if (land && latitude > 0.66) terrain = 5;
      else if (land && displayY > 5 && displayY < 10 && x > 15 && x < 24) terrain = 4;
      else if (land && noise(x + 4, displayY + 7) > 0.62) terrain = 3;

      let feature = 255;
      if (land && terrain === 2 && noise(x + 11, displayY) > 0.64) feature = 0;
      if (land && latitude < 0.28 && noise(x, displayY + 3) > 0.55) feature = 1;
      if (land && terrain === 2 && noise(x + 29, displayY) > 0.9) feature = 2;

      const elevationRoll = noise(x * 2 + 2, displayY * 3 + 5);
      const elevation = land && elevationRoll > 0.91 ? 2 : land && elevationRoll > 0.72 ? 1 : 0;
      const resourceRoll = noise(x + 71, displayY + 31);
      const resource = resourceRoll > 0.88 ? Math.floor(resourceRoll * resources.length) % resources.length : 255;

      tiles.push({
        terrain,
        resource: !land && resource !== 4 ? 255 : resource,
        feature,
        river: land && x === 7 && displayY > 3 && displayY < 12 ? 2 : 0,
        elevation,
        continent: land ? (x < 14 ? 1 : 2) : 0,
        wonder: 255,
        resourceAmount: resource === 255 ? 0 : 2,
      });
    }
  }

  return {
    name: "The Twin Continents",
    description: "A built-in sample map for exploring the renderer.",
    worldSize: "DEMO",
    version: 12,
    width,
    height,
    players: 8,
    wraps: true,
    terrains,
    features,
    wonders: [],
    resources,
    tiles,
    source: "demo",
  };
}
