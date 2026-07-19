export type Civ5Tile = {
  terrain: number;
  resource: number;
  feature: number;
  river: number;
  elevation: number;
  continent: number;
  wonder: number;
  resourceAmount: number;
  improvement?: string;
  route?: "ROUTE_ROAD" | "ROUTE_RAILROAD";
  owner?: number;
};

export type Civ5StartLocation = {
  x: number;
  y: number;
  player: number;
  civilization: string;
  leader: string;
  team: number;
  playable: boolean;
  cityState: boolean;
  teamColor?: string;
};

export type Civ5City = {
  id: number;
  name: string;
  owner: number;
  population: number;
  x: number;
  y: number;
  recordValid: boolean;
  duplicate: boolean;
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
  startLocations: Civ5StartLocation[];
  scenarioPlayerSlots?: number;
  scenarioCityStateSlots?: number;
  scenarioDataPresent?: boolean;
  scenarioMarker?: number;
  scenarioImprovementTypes?: string[];
  cities?: Civ5City[];
  source: "demo" | "file" | "generated" | "script";
  generation?: import("./map-generator.ts").MapGenerationOptions;
  recipe?: import("./generation-recipe.ts").GenerationRecipe;
  structure?: import("./generation-structure.ts").GenerationStructure;
};

const HEADER_SIZE = 42;
const TILE_SIZE = 8;
const GAME_DESCRIPTION_HEADER_SIZE = 120;
const GAME_DESCRIPTION_V11_HEADER_SIZE = 128;
const LEGACY_SYNTHETIC_TEAM_RECORD_SIZE = 64;
const PLAYER_RECORD_SIZE = 436;
const MAX_DIMENSION = 512;
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

export type Civ5MapStructureIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  offset?: number;
};

/**
 * Identifies the incomplete scenario envelope emitted by Excogitare 1.3.2.
 * The exact size and generated `Team N` table make this deliberately narrower
 * than a general "small scenario" test, so authored WorldBuilder scenarios are
 * never stripped merely because they omit optional content.
 */
export function isLegacySyntheticScenario(buffer: ArrayBuffer) {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const view = new DataView(buffer);
  const versionByte = view.getUint8(0);
  if ((versionByte & 0x0f) < 11 || versionByte >> 4 !== 8) return false;
  const width = view.getUint32(1, true);
  const height = view.getUint32(5, true);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
  let scenarioOffset: number;
  try {
    scenarioOffset = tileDataOffset(buffer) + width * height * TILE_SIZE;
  } catch {
    return false;
  }
  if (scenarioOffset + GAME_DESCRIPTION_V11_HEADER_SIZE > buffer.byteLength) return false;
  const playerCount = view.getUint8(scenarioOffset + 80);
  const cityStateCount = view.getUint8(scenarioOffset + 81);
  const recordCount = playerCount + cityStateCount;
  if (!recordCount || recordCount > 128 || view.getUint8(scenarioOffset + 82) !== recordCount) return false;
  const improvementTypeBytes = view.getUint32(scenarioOffset + 84, true);
  for (const relativeOffset of [88, 92, 96, 100, 104, 108, 112, 116]) {
    if (view.getUint32(scenarioOffset + relativeOffset, true) !== 0) return false;
  }
  const expectedLength = scenarioOffset
    + GAME_DESCRIPTION_V11_HEADER_SIZE
    + improvementTypeBytes
    + recordCount * LEGACY_SYNTHETIC_TEAM_RECORD_SIZE
    + recordCount * PLAYER_RECORD_SIZE
    + width * height * TILE_SIZE;
  if (expectedLength !== buffer.byteLength) return false;
  const bytes = new Uint8Array(buffer);
  const teamDataOffset = scenarioOffset + GAME_DESCRIPTION_V11_HEADER_SIZE + improvementTypeBytes;
  for (let team = 0; team < recordCount; team += 1) {
    const offset = teamDataOffset + team * LEGACY_SYNTHETIC_TEAM_RECORD_SIZE;
    if (cleanText(bytes.subarray(offset, offset + LEGACY_SYNTHETIC_TEAM_RECORD_SIZE)) !== `Team ${team + 1}`) return false;
  }
  return true;
}

export function stripLegacySyntheticScenario(buffer: ArrayBuffer) {
  if (!isLegacySyntheticScenario(buffer)) return buffer;
  const view = new DataView(buffer);
  const scenarioOffset = tileDataOffset(buffer) + view.getUint32(1, true) * view.getUint32(5, true) * TILE_SIZE;
  const output = buffer.slice(0, scenarioOffset);
  const outputView = new DataView(output);
  outputView.setUint8(0, outputView.getUint8(0) & 0x0f);
  return output;
}

export function inspectCiv5MapStructure(buffer: ArrayBuffer): Civ5MapStructureIssue[] {
  const issues: Civ5MapStructureIssue[] = [];
  const add = (severity: Civ5MapStructureIssue["severity"], code: string, message: string, offset?: number) => issues.push({ severity, code, message, offset });
  if (buffer.byteLength < HEADER_SIZE) {
    add("ERROR", "HEADER_TRUNCATED", `The file has ${buffer.byteLength} bytes; a Civ5Map header requires ${HEADER_SIZE}.`, 0);
    return issues;
  }
  const view = new DataView(buffer);
  const versionByte = view.getUint8(0);
  const version = versionByte & 0x0f;
  const marker = versionByte >> 4;
  const width = view.getUint32(1, true);
  const height = view.getUint32(5, true);
  const headerPlayers = view.getUint8(9);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) add("ERROR", "DIMENSIONS", `The header declares unsafe dimensions ${width} × ${height}.`, 1);
  if (version > 12) add("WARNING", "VERSION", `Map version ${version} is newer than the supported Civ V v12 container.`, 0);

  const sectionSizes = [14, 18, 22, 26, 30, 34, 38].map((offset) => view.getUint32(offset, true));
  let offset = HEADER_SIZE;
  for (const [index, size] of sectionSizes.entries()) {
    if (offset + size > buffer.byteLength) {
      add("ERROR", "SECTION_BOUNDS", `Header section ${index + 1} extends ${offset + size - buffer.byteLength} bytes past the end of the file.`, offset);
      return issues;
    }
    offset += size;
  }
  if (version >= 11) {
    if (offset + 4 > buffer.byteLength) {
      add("ERROR", "WORLD_SIZE_HEADER", "The world-size length field is truncated.", offset);
      return issues;
    }
    const worldSizeLength = view.getUint32(offset, true);
    offset += 4;
    if (!worldSizeLength) add("WARNING", "WORLD_SIZE_EMPTY", "The v11/v12 world-size section is empty.", offset - 4);
    if (offset + worldSizeLength > buffer.byteLength) {
      add("ERROR", "WORLD_SIZE_BOUNDS", "The world-size section extends past the end of the file.", offset);
      return issues;
    }
    offset += worldSizeLength;
  }
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) return issues;
  const geographyBytes = width * height * TILE_SIZE;
  const scenarioOffset = offset + geographyBytes;
  if (scenarioOffset > buffer.byteLength) {
    add("ERROR", "TILE_GRID_TRUNCATED", `The geography grid is missing ${scenarioOffset - buffer.byteLength} bytes.`, offset);
    return issues;
  }
  const scenarioBytes = buffer.byteLength - scenarioOffset;
  if (!scenarioBytes) {
    if (marker !== 0) add("ERROR", "SCENARIO_MARKER", `The header declares scenario marker ${marker}, but no scenario data follows the geography grid.`, 0);
    return issues;
  }
  if (marker !== 8) add("ERROR", "SCENARIO_MARKER", `Scenario data is present, but the header marker is ${marker}; Civ V WorldBuilder maps use marker 8.`, 0);
  const scenarioHeaderSize = GAME_DESCRIPTION_HEADER_SIZE;
  if (scenarioBytes < scenarioHeaderSize) {
    add("ERROR", "SCENARIO_HEADER_TRUNCATED", `The scenario section has ${scenarioBytes} bytes; its header requires ${scenarioHeaderSize}.`, scenarioOffset);
    return issues;
  }
  const playerCount = view.getUint8(scenarioOffset + 80);
  const cityStateCount = view.getUint8(scenarioOffset + 81);
  const declaredRecordCount = view.getUint8(scenarioOffset + 82);
  const recordCount = playerCount + cityStateCount;
  if (!recordCount || recordCount > 128) add("ERROR", "SCENARIO_SLOTS", `The scenario declares ${recordCount} player records; the supported range is 1–128.`, scenarioOffset + 80);
  if (declaredRecordCount && declaredRecordCount !== recordCount) add("WARNING", "SCENARIO_RECORD_COUNT", `The scenario record count is ${declaredRecordCount}, but major and city-state slots total ${recordCount}.`, scenarioOffset + 82);
  if (headerPlayers !== playerCount) add("WARNING", "HEADER_PLAYER_COUNT", `The map header declares ${headerPlayers} major players while the scenario stores ${playerCount}.`, 9);
  if (!recordCount || recordCount > 128) return issues;

  const leadingDataSize = [84, 88, 92, 96, 100, 104, 108, 112, 116].reduce((total, relativeOffset) => total + view.getUint32(scenarioOffset + relativeOffset, true), 0);
  const improvementTileBytes = width * height * TILE_SIZE;
  const playerDataOffset = buffer.byteLength - improvementTileBytes - recordCount * PLAYER_RECORD_SIZE;
  const minimumRecordOffset = scenarioOffset + scenarioHeaderSize + leadingDataSize;
  if (playerDataOffset < minimumRecordOffset) {
    add("ERROR", "SCENARIO_RECORD_BOUNDS", "Scenario type, player and improvement blocks overlap or extend beyond the file.", scenarioOffset);
    return issues;
  }
  for (let player = 0; player < recordCount; player += 1) {
    const recordOffset = playerDataOffset + player * PLAYER_RECORD_SIZE;
    const x = view.getUint32(recordOffset + 424, true);
    const y = view.getUint32(recordOffset + 428, true);
    const unplaced = x === 0xffffffff && y === 0xffffffff;
    if (!unplaced && (x >= width || y >= height)) add("ERROR", "START_COORDINATES", `Scenario record ${player + 1} starts outside the ${width} × ${height} map at ${x}, ${y}.`, recordOffset + 424);
  }
  if (isLegacySyntheticScenario(buffer)) {
    add("WARNING", "LEGACY_SYNTHETIC_SCENARIO", "This file contains Excogitare's incomplete legacy scenario envelope. Re-exporting it will preserve the geography and remove that envelope.", scenarioOffset);
  }
  return issues;
}

function assertCiv5MapStructure(buffer: ArrayBuffer) {
  const error = inspectCiv5MapStructure(buffer).find((issue) => issue.severity === "ERROR");
  if (error) throw new Error(`Invalid Civ5Map structure: ${error.message}`);
  return buffer;
}

function encodeMetadataString(value: string) {
  return encoder.encode(`${value.replaceAll("\0", "")}\0`);
}

function readStringList(bytes: Uint8Array) {
  const values = decoder.decode(bytes).split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function cleanText(bytes: Uint8Array) {
  return decoder.decode(bytes).replace(/\0+$/g, "").trim();
}

export function updateCiv5MapMetadata(buffer: ArrayBuffer, name: string, description: string) {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error("This file is too small to contain a Civ5 map header.");
  }

  const source = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const terrainSize = view.getUint32(14, true);
  const featureSize = view.getUint32(18, true);
  const wonderSize = view.getUint32(22, true);
  const resourceSize = view.getUint32(26, true);
  const modSize = view.getUint32(30, true);
  const oldNameSize = view.getUint32(34, true);
  const oldDescriptionSize = view.getUint32(38, true);
  const nameOffset = HEADER_SIZE + terrainSize + featureSize + wonderSize + resourceSize + modSize;
  const suffixOffset = nameOffset + oldNameSize + oldDescriptionSize;

  if (nameOffset > source.byteLength || suffixOffset > source.byteLength) {
    throw new Error("The map metadata sections extend past the end of the file.");
  }

  const nameBytes = encodeMetadataString(name);
  const descriptionBytes = encodeMetadataString(description);
  const output = new Uint8Array(source.byteLength - oldNameSize - oldDescriptionSize + nameBytes.byteLength + descriptionBytes.byteLength);

  output.set(source.subarray(0, nameOffset));
  const outputView = new DataView(output.buffer);
  outputView.setUint32(34, nameBytes.byteLength, true);
  outputView.setUint32(38, descriptionBytes.byteLength, true);
  output.set(nameBytes, nameOffset);
  output.set(descriptionBytes, nameOffset + nameBytes.byteLength);
  output.set(source.subarray(suffixOffset), nameOffset + nameBytes.byteLength + descriptionBytes.byteLength);
  return output.buffer;
}

function tileDataOffset(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const version = view.getUint8(0) & 0x0f;
  let offset = HEADER_SIZE;
  for (const headerOffset of [14, 18, 22, 26, 30, 34, 38]) offset += view.getUint32(headerOffset, true);
  if (version >= 11) {
    if (offset + 4 > buffer.byteLength) throw new Error("The world-size header is incomplete.");
    const worldSizeLength = view.getUint32(offset, true);
    offset += 4 + worldSizeLength;
  }
  return offset;
}

function writeTiles(view: DataView, offset: number, map: Civ5Map) {
  for (const tile of map.tiles) {
    view.setUint8(offset, tile.terrain);
    view.setUint8(offset + 1, tile.resource);
    view.setUint8(offset + 2, tile.feature);
    view.setUint8(offset + 3, tile.river);
    view.setUint8(offset + 4, tile.elevation);
    view.setUint8(offset + 5, tile.continent);
    view.setUint8(offset + 6, tile.wonder);
    view.setUint8(offset + 7, tile.resourceAmount);
    offset += TILE_SIZE;
  }
}

function writeScenarioStarts(buffer: ArrayBuffer, map: Civ5Map) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const scenarioOffset = tileDataOffset(buffer) + map.width * map.height * TILE_SIZE;
  if (scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE > bytes.byteLength) return;
  const playerCount = view.getUint8(scenarioOffset + 80);
  const cityStateCount = view.getUint8(scenarioOffset + 81);
  const recordCount = playerCount + cityStateCount;
  if (!recordCount || recordCount > 128) return;
  const improvementDataSize = map.width * map.height * TILE_SIZE;
  const playerDataOffset = bytes.byteLength - improvementDataSize - recordCount * PLAYER_RECORD_SIZE;
  if (playerDataOffset < scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE) return;
  const requestedMajorSlots = map.scenarioPlayerSlots ?? map.startLocations.filter((start) => !start.cityState).length;
  const requestedCityStateSlots = map.scenarioCityStateSlots ?? map.startLocations.filter((start) => start.cityState).length;
  if (requestedMajorSlots + requestedCityStateSlots === recordCount) {
    view.setUint8(scenarioOffset + 80, requestedMajorSlots);
    view.setUint8(scenarioOffset + 81, requestedCityStateSlots);
    view.setUint8(scenarioOffset + 82, recordCount);
    view.setUint8(9, requestedMajorSlots);
  }
  for (const start of map.startLocations) {
    if (start.player < 0 || start.player >= recordCount || start.x < 0 || start.y < 0 || start.x >= map.width || start.y >= map.height) continue;
    const offset = playerDataOffset + start.player * PLAYER_RECORD_SIZE;
    outputFixedString(bytes, offset + 32, 64, start.leader);
    outputFixedString(bytes, offset + 160, 64, start.civilization);
    outputFixedString(bytes, offset + 224, 64, start.teamColor ?? "");
    view.setUint32(offset + 424, start.x, true);
    view.setUint32(offset + 428, start.y, true);
    view.setUint8(offset + 432, Math.max(0, Math.min(255, start.team)));
    view.setUint8(offset + 433, start.playable ? 1 : 0);
  }
}

function outputFixedString(bytes: Uint8Array, offset: number, size: number, value: string) {
  bytes.fill(0, offset, offset + size);
  writeFixedString(bytes, offset, size, value);
}

function scenarioLayout(buffer: ArrayBuffer, width: number, height: number) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const scenarioOffset = tileDataOffset(buffer) + width * height * TILE_SIZE;
  if (scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE > bytes.byteLength) return undefined;
  const version = view.getUint8(0) & 0x0f;
  const headerSize = version >= 11 ? GAME_DESCRIPTION_V11_HEADER_SIZE : GAME_DESCRIPTION_HEADER_SIZE;
  const recordCount = view.getUint8(scenarioOffset + 80) + view.getUint8(scenarioOffset + 81);
  if (!recordCount || recordCount > 128) return undefined;
  const improvementDataSize = width * height * TILE_SIZE;
  const playerDataOffset = bytes.byteLength - improvementDataSize - recordCount * PLAYER_RECORD_SIZE;
  const improvementOffset = bytes.byteLength - improvementDataSize;
  const improvementTypeDataSize = view.getUint32(scenarioOffset + 84, true);
  const improvementTypes = scenarioOffset + headerSize + improvementTypeDataSize <= bytes.byteLength
    ? readStringList(bytes.subarray(scenarioOffset + headerSize, scenarioOffset + headerSize + improvementTypeDataSize))
    : [];
  const cityDataSize = view.getUint32(scenarioOffset + 116, true);
  const leadingDataSize = [84, 88, 92, 96, 100, 104, 108, 112].reduce((total, relativeOffset) => total + view.getUint32(scenarioOffset + relativeOffset, true), 0);
  const cityDataOffset = scenarioOffset + headerSize + leadingDataSize;
  return { view, bytes, version, scenarioOffset, headerSize, recordCount, playerDataOffset, improvementOffset, improvementTypes, cityDataSize, cityDataOffset };
}

function writeScenarioTileMetadata(buffer: ArrayBuffer, map: Civ5Map) {
  const layout = scenarioLayout(buffer, map.width, map.height);
  if (!layout || layout.improvementOffset < layout.scenarioOffset + layout.headerSize) return;
  for (let index = 0; index < map.tiles.length; index += 1) {
    const tile = map.tiles[index];
    const offset = layout.improvementOffset + index * TILE_SIZE;
    layout.view.setUint8(offset + 4, tile.owner === undefined ? 0xff : Math.max(0, Math.min(254, tile.owner)));
    const improvementIndex = tile.improvement ? layout.improvementTypes.indexOf(tile.improvement) : -1;
    layout.view.setUint8(offset + 5, improvementIndex >= 0 ? improvementIndex : 0xff);
    layout.view.setUint8(offset + 6, tile.route === "ROUTE_ROAD" ? 0 : tile.route === "ROUTE_RAILROAD" ? 1 : 0xff);
    layout.view.setUint8(offset + 7, tile.route ? tile.owner ?? 0xff : 0xff);
  }
}

function writeScenarioCities(buffer: ArrayBuffer, map: Civ5Map) {
  if (!map.cities) return;
  const layout = scenarioLayout(buffer, map.width, map.height);
  if (!layout || layout.improvementOffset < 0) return;
  const cityRecordSize = layout.version >= 12 ? 136 : 104;
  const cityRecordCount = layout.cityDataSize % cityRecordSize === 0 ? layout.cityDataSize / cityRecordSize : 0;
  for (let index = 0; index < map.width * map.height; index += 1) layout.view.setUint16(layout.improvementOffset + index * TILE_SIZE, 0xffff, true);
  for (const city of map.cities) {
    if (city.id < 0 || city.id > 0xfffe || city.x < 0 || city.y < 0 || city.x >= map.width || city.y >= map.height) continue;
    layout.view.setUint16(layout.improvementOffset + (city.y * map.width + city.x) * TILE_SIZE, city.id, true);
    if (city.id < cityRecordCount) {
      const recordOffset = layout.cityDataOffset + city.id * cityRecordSize;
      outputFixedString(layout.bytes, recordOffset, 64, city.name);
      layout.view.setUint8(recordOffset + 64, Math.max(0, Math.min(255, city.owner)));
      layout.view.setUint16(recordOffset + 66, Math.max(1, Math.min(65_535, Math.round(city.population))), true);
    }
  }
}

export function updateCiv5Map(buffer: ArrayBuffer, map: Civ5Map) {
  const source = stripLegacySyntheticScenario(buffer);
  const original = parseCiv5Map(source, map.name);
  if (original.width !== map.width || original.height !== map.height || map.tiles.length !== original.tiles.length) {
    throw new Error("Imported maps cannot be resized during export.");
  }
  const output = updateCiv5MapMetadata(source, map.name, map.description);
  const outputView = new DataView(output);
  const scenarioMarker = original.scenarioDataPresent ? map.scenarioMarker ?? 8 : 0;
  outputView.setUint8(0, (outputView.getUint8(0) & 0x0f) | (Math.max(0, Math.min(15, scenarioMarker)) << 4));
  outputView.setUint8(9, Math.max(0, Math.min(255, map.players)));
  const offset = tileDataOffset(output);
  if (offset + map.tiles.length * TILE_SIZE > output.byteLength) throw new Error("The map tile section is incomplete.");
  writeTiles(new DataView(output), offset, map);
  if (original.scenarioDataPresent) {
    writeScenarioStarts(output, map);
    writeScenarioTileMetadata(output, map);
    writeScenarioCities(output, map);
  }
  return assertCiv5MapStructure(output);
}

function encodeStringList(values: string[]) {
  return encoder.encode(values.length ? `${values.join("\0")}\0` : "");
}

function writeFixedString(bytes: Uint8Array, offset: number, size: number, value: string) {
  const encoded = encoder.encode(value.replaceAll("\0", ""));
  bytes.set(encoded.subarray(0, size), offset);
}

export function serializeCiv5Map(map: Civ5Map) {
  if (!map.width || !map.height || map.tiles.length !== map.width * map.height) {
    throw new Error("The generated map does not contain a complete tile grid.");
  }
  const terrainBytes = encodeStringList(map.terrains);
  const featureBytes = encodeStringList(map.features);
  const wonderBytes = encodeStringList(map.wonders);
  const resourceBytes = encodeStringList(map.resources);
  const nameBytes = encodeMetadataString(map.name);
  const descriptionBytes = encodeMetadataString(map.description);
  const worldSizeBytes = encoder.encode(`WORLDSIZE_${map.worldSize.replace(/^WORLDSIZE_/i, "").replaceAll(" ", "_").toUpperCase()}`);
  const geographySize = terrainBytes.length + featureBytes.length + wonderBytes.length + resourceBytes.length + nameBytes.length + descriptionBytes.length;
  const tileBytes = map.tiles.length * TILE_SIZE;
  const output = new ArrayBuffer(HEADER_SIZE + geographySize + 4 + worldSizeBytes.length + tileBytes);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  view.setUint8(0, 0x0c);
  view.setUint32(1, map.width, true);
  view.setUint32(5, map.height, true);
  view.setUint8(9, Math.min(255, map.players));
  view.setUint8(10, map.wraps ? 1 : 0);
  view.setUint32(14, terrainBytes.length, true);
  view.setUint32(18, featureBytes.length, true);
  view.setUint32(22, wonderBytes.length, true);
  view.setUint32(26, resourceBytes.length, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, nameBytes.length, true);
  view.setUint32(38, descriptionBytes.length, true);
  let offset = HEADER_SIZE;
  for (const section of [terrainBytes, featureBytes, wonderBytes, resourceBytes, nameBytes, descriptionBytes]) {
    bytes.set(section, offset);
    offset += section.length;
  }
  view.setUint32(offset, worldSizeBytes.length, true);
  offset += 4;
  bytes.set(worldSizeBytes, offset);
  offset += worldSizeBytes.length;
  writeTiles(view, offset, map);
  return assertCiv5MapStructure(output);
}

function parseStartLocations(
  view: DataView,
  bytes: Uint8Array,
  scenarioOffset: number,
  width: number,
  height: number,
) {
  const startLocations: Civ5StartLocation[] = [];
  if (scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE > bytes.byteLength) return startLocations;

  const playerCount = view.getUint8(scenarioOffset + 80);
  const cityStateCount = view.getUint8(scenarioOffset + 81);
  const recordCount = playerCount + cityStateCount;
  if (!recordCount || recordCount > 128) return startLocations;

  const improvementDataSize = width * height * TILE_SIZE;
  const playerDataSize = recordCount * PLAYER_RECORD_SIZE;
  const playerDataOffset = bytes.byteLength - improvementDataSize - playerDataSize;
  if (playerDataOffset < scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE || playerDataOffset + playerDataSize > bytes.byteLength) {
    return startLocations;
  }

  for (let player = 0; player < recordCount; player += 1) {
    const recordOffset = playerDataOffset + player * PLAYER_RECORD_SIZE;
    const x = view.getUint32(recordOffset + 424, true);
    const y = view.getUint32(recordOffset + 428, true);
    if (x >= width || y >= height) continue;

    startLocations.push({
      x,
      y,
      player,
      leader: cleanText(bytes.subarray(recordOffset + 32, recordOffset + 96)),
      civilization: cleanText(bytes.subarray(recordOffset + 160, recordOffset + 224)),
      teamColor: cleanText(bytes.subarray(recordOffset + 224, recordOffset + 288)),
      team: view.getUint8(recordOffset + 432),
      playable: Boolean(view.getUint8(recordOffset + 433)),
      cityState: player >= playerCount,
    });
  }

  return startLocations;
}

function parseScenarioSlotCounts(
  view: DataView,
  bytes: Uint8Array,
  scenarioOffset: number,
  width: number,
  height: number,
) {
  if (scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE > bytes.byteLength) return undefined;
  const players = view.getUint8(scenarioOffset + 80);
  const cityStates = view.getUint8(scenarioOffset + 81);
  const recordCount = players + cityStates;
  if (!recordCount || recordCount > 128) return undefined;
  const improvementDataSize = width * height * TILE_SIZE;
  const playerDataSize = recordCount * PLAYER_RECORD_SIZE;
  const playerDataOffset = bytes.byteLength - improvementDataSize - playerDataSize;
  if (playerDataOffset < scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE || playerDataOffset + playerDataSize > bytes.byteLength) return undefined;
  return { players, cityStates };
}

function parseScenarioTileMetadata(
  view: DataView,
  bytes: Uint8Array,
  scenarioOffset: number,
  width: number,
  height: number,
  tiles: Civ5Tile[],
) {
  if (scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE > bytes.byteLength) return;
  const version = view.getUint8(0) & 0x0f;
  const headerSize = version >= 11 ? GAME_DESCRIPTION_V11_HEADER_SIZE : GAME_DESCRIPTION_HEADER_SIZE;
  const improvementTypeDataSize = view.getUint32(scenarioOffset + 84, true);
  const improvementTypes = scenarioOffset + headerSize + improvementTypeDataSize <= bytes.byteLength
    ? readStringList(bytes.subarray(scenarioOffset + headerSize, scenarioOffset + headerSize + improvementTypeDataSize))
    : [];
  const improvementDataSize = width * height * TILE_SIZE;
  const improvementOffset = bytes.byteLength - improvementDataSize;
  if (improvementOffset < scenarioOffset + GAME_DESCRIPTION_HEADER_SIZE) return;

  for (let index = 0; index < tiles.length; index += 1) {
    const offset = improvementOffset + index * TILE_SIZE;
    const owner = view.getUint8(offset + 4);
    const improvement = improvementTypes[view.getUint8(offset + 5)];
    const route = view.getUint8(offset + 6);
    if (owner !== 0xff) tiles[index].owner = owner;
    if (improvement) tiles[index].improvement = improvement;
    if (route === 0) tiles[index].route = "ROUTE_ROAD";
    if (route === 1) tiles[index].route = "ROUTE_RAILROAD";
  }
}

function parseCities(
  view: DataView,
  bytes: Uint8Array,
  scenarioOffset: number,
  width: number,
  height: number,
  version: number,
) {
  const cities: Civ5City[] = [];
  const headerSize = version >= 11 ? GAME_DESCRIPTION_V11_HEADER_SIZE : GAME_DESCRIPTION_HEADER_SIZE;
  if (scenarioOffset + headerSize > bytes.byteLength) return undefined;
  const cityRecordSize = version >= 12 ? 136 : 104;
  const cityDataSize = view.getUint32(scenarioOffset + 116, true);
  const leadingDataSize = [84, 88, 92, 96, 100, 104, 108, 112].reduce((total, relativeOffset) => total + view.getUint32(scenarioOffset + relativeOffset, true), 0);
  const cityDataOffset = scenarioOffset + headerSize + leadingDataSize;
  if (cityDataSize % cityRecordSize !== 0 || cityDataOffset + cityDataSize > bytes.byteLength) return undefined;

  const records = Array.from({ length: cityDataSize / cityRecordSize }, (_, id) => {
    const offset = cityDataOffset + id * cityRecordSize;
    return {
      id,
      name: cleanText(bytes.subarray(offset, offset + 64)),
      owner: view.getUint8(offset + 64),
      population: view.getUint16(offset + 66, true),
    };
  });
  const improvementDataSize = width * height * TILE_SIZE;
  const improvementOffset = bytes.byteLength - improvementDataSize;
  if (improvementOffset < cityDataOffset + cityDataSize) return cities;
  const seen = new Set<number>();
  for (let index = 0; index < width * height; index += 1) {
    const id = view.getUint16(improvementOffset + index * TILE_SIZE, true);
    if (id === 0xffff) continue;
    const record = records[id];
    cities.push({
      id,
      name: record?.name || `Unknown city ${id}`,
      owner: record?.owner ?? 255,
      population: record?.population ?? 0,
      x: index % width,
      y: Math.floor(index / width),
      recordValid: Boolean(record),
      duplicate: seen.has(id),
    });
    seen.add(id);
  }
  for (const record of records) {
    if (seen.has(record.id)) continue;
    cities.push({ ...record, x: -1, y: -1, recordValid: true, duplicate: false });
  }
  return cities;
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

  parseScenarioTileMetadata(view, bytes, offset, width, height, tiles);
  const scenarioSlots = parseScenarioSlotCounts(view, bytes, offset, width, height);
  const startLocations = parseStartLocations(view, bytes, offset, width, height);
  const cities = parseCities(view, bytes, offset, width, height, version);

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
    startLocations,
    scenarioPlayerSlots: scenarioSlots?.players,
    scenarioCityStateSlots: scenarioSlots?.cityStates,
    scenarioDataPresent: offset < bytes.byteLength,
    scenarioMarker: scenarioVersion >> 4,
    scenarioImprovementTypes: offset < bytes.byteLength ? (() => {
      const headerSize = version >= 11 ? GAME_DESCRIPTION_V11_HEADER_SIZE : GAME_DESCRIPTION_HEADER_SIZE;
      const size = offset + headerSize <= bytes.byteLength ? view.getUint32(offset + 84, true) : 0;
      return size && offset + headerSize + size <= bytes.byteLength ? readStringList(bytes.subarray(offset + headerSize, offset + headerSize + size)) : [];
    })() : undefined,
    cities,
    source: "file",
  };
}

export type RepairParseResult = {
  map: Civ5Map;
  salvaged: boolean;
  diagnostics: string[];
};

export function parseCiv5MapForRepair(buffer: ArrayBuffer, fallbackName: string): RepairParseResult {
  try {
    return { map: parseCiv5Map(buffer, fallbackName), salvaged: false, diagnostics: ["The file structure parsed normally."] };
  } catch (error) {
    const diagnostics = [error instanceof Error ? error.message : "The normal parser rejected this file."];
    if (buffer.byteLength < HEADER_SIZE) throw new Error("The file is too short to contain a recoverable Civ5Map header.");
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const version = view.getUint8(0) & 0x0f;
    const width = view.getUint32(1, true);
    const height = view.getUint32(5, true);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error(`The damaged map declares unsafe dimensions: ${width} × ${height}.`);
    const sizes = [14, 18, 22, 26, 30, 34, 38].map((offset) => view.getUint32(offset, true));
    let offset = HEADER_SIZE;
    const take = (size: number, label: string) => {
      const available = Math.max(0, Math.min(size, bytes.byteLength - offset));
      if (available < size) diagnostics.push(`${label} was truncated from ${size} to ${available} bytes.`);
      const result = bytes.subarray(offset, offset + available);
      offset += available;
      return result;
    };
    const terrains = readStringList(take(sizes[0], "Terrain definitions"));
    const features = readStringList(take(sizes[1], "Feature definitions"));
    const wonders = readStringList(take(sizes[2], "Wonder definitions"));
    const resources = readStringList(take(sizes[3], "Resource definitions"));
    take(sizes[4], "Mod data");
    const mapName = cleanText(take(sizes[5], "Map name"));
    const description = cleanText(take(sizes[6], "Map description"));
    let worldSize = "Custom";
    if (version >= 11 && offset + 4 <= bytes.byteLength) {
      const length = view.getUint32(offset, true);
      offset += 4;
      worldSize = cleanText(take(length, "World size")) || "Custom";
    }
    if (!terrains.length) {
      terrains.push("TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW");
      diagnostics.push("Default terrain definitions were supplied so the map can render.");
    }
    const tiles: Civ5Tile[] = [];
    const expectedTiles = width * height;
    const readableTiles = Math.min(expectedTiles, Math.floor((bytes.byteLength - offset) / TILE_SIZE));
    for (let index = 0; index < readableTiles; index += 1) {
      tiles.push({ terrain: view.getUint8(offset), resource: view.getUint8(offset + 1), feature: view.getUint8(offset + 2), river: view.getUint8(offset + 3), elevation: view.getUint8(offset + 4), continent: view.getUint8(offset + 5), wonder: view.getUint8(offset + 6), resourceAmount: view.getUint8(offset + 7) });
      offset += TILE_SIZE;
    }
    while (tiles.length < expectedTiles) tiles.push({ terrain: 0, resource: 255, feature: 255, river: 0, elevation: 0, continent: 0, wonder: 255, resourceAmount: 0 });
    if (readableTiles < expectedTiles) diagnostics.push(`${expectedTiles - readableTiles} missing tiles were replaced with empty ocean tiles.`);
    return {
      map: {
        name: mapName || fallbackName.replace(/\.civ5map$/i, ""),
        description,
        worldSize: worldSize.replace(/^WORLDSIZE_/i, "").replaceAll("_", " "),
        version,
        width,
        height,
        players: view.getUint8(9),
        wraps: Boolean(view.getUint8(10) & 1),
        terrains,
        features,
        wonders,
        resources,
        tiles,
        startLocations: [],
        source: "file",
      },
      salvaged: true,
      diagnostics,
    };
  }
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
    startLocations: [
      { x: 7, y: 7, player: 0, civilization: "CIVILIZATION_ROME", leader: "Augustus Caesar", team: 0, playable: true, cityState: false },
      { x: 11, y: 4, player: 1, civilization: "CIVILIZATION_EGYPT", leader: "Ramesses II", team: 1, playable: true, cityState: false },
      { x: 18, y: 8, player: 2, civilization: "CIVILIZATION_CHINA", leader: "Wu Zetian", team: 2, playable: true, cityState: false },
      { x: 22, y: 5, player: 3, civilization: "CIVILIZATION_PERSIA", leader: "Darius I", team: 3, playable: true, cityState: false },
    ],
    source: "demo",
  };
}
