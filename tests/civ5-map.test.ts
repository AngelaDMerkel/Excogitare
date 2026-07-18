import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, parseCiv5MapForRepair, serializeCiv5Map, updateCiv5Map, updateCiv5MapMetadata, type Civ5Map, type Civ5Tile } from "../lib/civ5-map.ts";
import { DEFAULT_GENERATION_OPTIONS, GAME_BREAKING_GEOMETRIES, GAME_BREAKING_MAP_SIZES, generateMap, isGameBreakingMapSize, MAP_PRESETS, MAP_SIZES, randomGenerationOptions, resolveMapDimensions, SAFE_MAP_GEOMETRIES, SAFE_MAP_SIZES, type GenerationEngine, type GenerationStyle, type MapGenerationOptions } from "../lib/map-generator.ts";
import { createLuaMapScript, mapExportBaseName, mapFromLuaScript } from "../lib/map-script.ts";
import { analyzeMultiplayerBalance, validateCiv5Map } from "../lib/map-analysis.ts";
import { addGenerationToHistory, MAX_GENERATION_HISTORY, restoreGeneration, type GenerationHistoryEntry } from "../lib/generation-history.ts";
import { applyRepairIssues, buildRepairIssues } from "../lib/map-repair.ts";
import { featurePlacementVerdict, isPassableLand, resourcePlacementVerdict, wonderPlacementVerdict } from "../lib/civ5-rules.ts";
import { buildPoliticalOwnership, hasPoliticalLayer, politicalColors } from "../lib/political-map.ts";
import { fitViewport, minimumViewportZoom } from "../lib/map-viewport.ts";
import { RIVER_DATA_MASK, riverEdgeDefinitions, riverFlowsFromAToB } from "../lib/rivers.ts";
import { poleProximity } from "../lib/climate-projection.ts";
import { MINIMUM_START_DISTANCE } from "../lib/start-locations.ts";
import { generatePolisGeography } from "../lib/polis-generator.ts";
import { generateEccentricGeography } from "../lib/eccentric-generator.ts";
import { generatePhysicalGeography } from "../lib/physical-generator.ts";
import { describeWorldCharacter, WORLD_CHARACTER_PROFILES, worldCharacterProfile } from "../lib/world-character.ts";

const encoder = new TextEncoder();

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function variance(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
}

function metadataSections(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const sizes = [14, 18, 22, 26, 30, 34, 38].map((offset) => view.getUint32(offset, true));
  const nameOffset = 42 + sizes.slice(0, 5).reduce((total, size) => total + size, 0);
  const descriptionOffset = nameOffset + sizes[5];
  const bytes = new Uint8Array(buffer);
  return {
    name: bytes.subarray(nameOffset, descriptionOffset),
    description: bytes.subarray(descriptionOffset, descriptionOffset + sizes[6]),
  };
}

test("climate projections relocate the poles without changing map geometry", () => {
  const width = 101;
  const height = 61;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;

  assert.equal(poleProximity(centerX, 0, width, height, "NORTH_SOUTH"), 1);
  assert.equal(poleProximity(centerX, centerY, width, height, "NORTH_SOUTH"), 0);
  assert.equal(poleProximity(centerX, centerY, width, height, "POLAR_CENTERED"), 1);
  assert.equal(poleProximity(0, centerY, width, height, "POLAR_CENTERED"), 0);
  assert.equal(poleProximity(centerX, centerY, width, height, "EQUATORIAL_POLE"), 1);
  assert.equal(poleProximity(centerX, 0, width, height, "EQUATORIAL_POLE"), 0);
});

test("generation records and applies alternate climate projections", () => {
  const conventional = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", waterPercent: 0, seed: "projection-audit", projectionType: "NORTH_SOUTH" });
  const centered = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", waterPercent: 0, seed: "projection-audit", projectionType: "POLAR_CENTERED" });
  const equatorialPole = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", waterPercent: 0, seed: "projection-audit", projectionType: "EQUATORIAL_POLE" });

  assert.equal(centered.generation?.projectionType, "POLAR_CENTERED");
  assert.equal(equatorialPole.generation?.projectionType, "EQUATORIAL_POLE");
  assert.notDeepEqual(centered.tiles.map((tile) => tile.terrain), conventional.tiles.map((tile) => tile.terrain));
  assert.notDeepEqual(equatorialPole.tiles.map((tile) => tile.terrain), conventional.tiles.map((tile) => tile.terrain));
});

test("Fit keeps extreme horizontal and vertical maps inside the visible viewport", () => {
  const viewport = { width: 1000, height: 600 };
  for (const bounds of [{ width: 12_000, height: 300 }, { width: 300, height: 12_000 }]) {
    const view = fitViewport(viewport, bounds);
    assert.ok(view.zoom < 0.16);
    assert.ok(view.x >= 22 - 1e-9);
    assert.ok(view.y >= 22 - 1e-9);
    assert.ok(view.x + bounds.width * view.zoom <= viewport.width - 22 + 1e-9);
    assert.ok(view.y + bounds.height * view.zoom <= viewport.height - 22 + 1e-9);
    assert.equal(minimumViewportZoom(viewport, bounds), view.zoom);
  }
});

function adjacentIndices(index: number, width: number, height: number, wraps: boolean) {
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

function startDistance(one: { x: number; y: number }, two: { x: number; y: number }, width: number, wraps: boolean) {
  const cube = ({ x, y }: { x: number; y: number }) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y];
  };
  const direct = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ac = cube(a);
    const bc = cube(b);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(one, two);
  return Math.min(direct(one, two), direct({ x: one.x - width, y: one.y }, two), direct({ x: one.x + width, y: one.y }, two));
}

function assertStartSpacing(map: Civ5Map, minimum = MINIMUM_START_DISTANCE) {
  for (let one = 0; one < map.startLocations.length; one += 1) {
    for (let two = one + 1; two < map.startLocations.length; two += 1) {
      assert.ok(startDistance(map.startLocations[one], map.startLocations[two], map.width, map.wraps) >= minimum, `starts ${one} and ${two} were too close`);
    }
  }
}

function assertMountainPassability(map: ReturnType<typeof generateMap>) {
  const assignedLand = new Set<number>();
  for (let origin = 0; origin < map.tiles.length; origin += 1) {
    if (map.tiles[origin].terrain < 2 || assignedLand.has(origin)) continue;
    const landmass: number[] = [];
    const queue = [origin];
    assignedLand.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      landmass.push(index);
      for (const next of adjacentIndices(index, map.width, map.height, map.wraps)) {
        if (map.tiles[next].terrain < 2 || assignedLand.has(next)) continue;
        assignedLand.add(next);
        queue.push(next);
      }
    }
    const passable = landmass.filter((index) => map.tiles[index].elevation !== 2);
    assert.ok(passable.length > 0, "a landmass was entirely mountains");
    const reached = new Set<number>([passable[0]]);
    const paths = [passable[0]];
    for (let cursor = 0; cursor < paths.length; cursor += 1) {
      for (const next of adjacentIndices(paths[cursor], map.width, map.height, map.wraps)) {
        if (map.tiles[next].terrain < 2 || map.tiles[next].elevation === 2 || reached.has(next)) continue;
        reached.add(next);
        paths.push(next);
      }
    }
    assert.equal(reached.size, passable.length, "mountains isolated passable territory");
  }
}

function assertRiverNetworks(map: ReturnType<typeof generateMap>) {
  const vertexTiles = new Map<string, Set<number>>();
  const riverNeighbors = new Map<string, Set<string>>();
  const riverFlow = new Map<string, { incoming: number; outgoing: number }>();
  let riverEdges = 0;
  const addTile = (vertex: string, tile: number) => {
    if (!vertexTiles.has(vertex)) vertexTiles.set(vertex, new Set());
    vertexTiles.get(vertex)!.add(tile);
  };
  const addRiverEdge = (a: string, b: string, fromAToB: boolean) => {
    if (!riverNeighbors.has(a)) riverNeighbors.set(a, new Set());
    if (!riverNeighbors.has(b)) riverNeighbors.set(b, new Set());
    riverNeighbors.get(a)!.add(b);
    riverNeighbors.get(b)!.add(a);
    const from = fromAToB ? a : b;
    const to = fromAToB ? b : a;
    const fromFlow = riverFlow.get(from) ?? { incoming: 0, outgoing: 0 };
    const toFlow = riverFlow.get(to) ?? { incoming: 0, outgoing: 0 };
    fromFlow.outgoing += 1;
    toFlow.incoming += 1;
    riverFlow.set(from, fromFlow);
    riverFlow.set(to, toFlow);
    riverEdges += 1;
  };

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const owner = y * map.width + x;
      for (const definition of riverEdgeDefinitions(x, y)) {
        let nextX = x + definition.dx;
        const nextY = y + definition.dy;
        if (map.wraps) nextX = (nextX + map.width) % map.width;
        if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height || Math.abs(nextX - x) > 1) continue;
        const neighbor = nextY * map.width + nextX;
        for (const vertex of [definition.a, definition.b]) {
          addTile(vertex, owner);
          addTile(vertex, neighbor);
        }
        if (map.tiles[owner].river & definition.bit) {
          assert.ok(map.tiles[owner].terrain >= 2 && map.tiles[neighbor].terrain >= 2, "a river occupied an ocean or shoreline edge");
          addRiverEdge(definition.a, definition.b, riverFlowsFromAToB(map.tiles[owner].river, definition.bit));
        }
      }
    }
  }

  assert.ok(riverEdges > 0, "the generated map did not contain a river network");
  assert.equal(map.tiles.some((tile) => Boolean(tile.river & ~RIVER_DATA_MASK)), false, "the generator emitted unsupported river bits");
  assert.ok(map.tiles.some((tile) => Boolean(tile.river & 0x38)), "the generator omitted every river flow direction bit");
  const assigned = new Set<string>();
  for (const origin of riverNeighbors.keys()) {
    if (assigned.has(origin)) continue;
    const componentVertices: string[] = [];
    const queue = [origin];
    assigned.add(origin);
    let componentEdgeDegree = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      componentVertices.push(vertex);
      const connected = riverNeighbors.get(vertex)!;
      componentEdgeDegree += connected.size;
      for (const next of connected) {
        if (assigned.has(next)) continue;
        assigned.add(next);
        queue.push(next);
      }
    }
    const componentEdges = componentEdgeDegree / 2;
    const endpoints = componentVertices.filter((vertex) => riverNeighbors.get(vertex)!.size === 1);
    const vertexTouchesMountain = (vertex: string) => [...(vertexTiles.get(vertex) ?? [])].some((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation === 2);
    const vertexTouchesWater = (vertex: string) => [...(vertexTiles.get(vertex) ?? [])].some((index) => map.tiles[index].terrain < 2);
    const touchesMountain = endpoints.some(vertexTouchesMountain);
    const touchesWater = endpoints.some(vertexTouchesWater);
    assert.ok(componentEdges >= 3, "a river was too short to form a continuous channel");
    assert.equal(componentEdges, componentVertices.length - 1, "a river network contained a loop");
    assert.ok(touchesMountain, "a river network did not begin at a mountain");
    assert.ok(touchesWater, "a river network did not terminate in water");
    assert.ok(endpoints.every((vertex) => vertexTouchesMountain(vertex) || vertexTouchesWater(vertex)), "a river network ended inland away from a mountain");
    assert.ok(componentVertices.filter(vertexTouchesWater).every((vertex) => riverNeighbors.get(vertex)!.size === 1), "a river continued through an ocean or lake outlet");
    for (const vertex of componentVertices.filter((candidate) => riverNeighbors.get(candidate)!.size > 1)) {
      const flow = riverFlow.get(vertex)!;
      assert.ok(flow.incoming > 0 && flow.outgoing > 0, "adjacent river edges had contradictory flow directions");
    }
  }
}

function riverEdgeRecords(map: Civ5Map) {
  const records: Array<{ owner: number; neighbor: number; bit: 1 | 2 | 4; a: string; b: string }> = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const owner = y * map.width + x;
      for (const definition of riverEdgeDefinitions(x, y)) {
        let nextX = x + definition.dx;
        const nextY = y + definition.dy;
        if (map.wraps) nextX = (nextX + map.width) % map.width;
        if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height || Math.abs(nextX - x) > 1) continue;
        records.push({ owner, neighbor: nextY * map.width + nextX, bit: definition.bit, a: definition.a, b: definition.b });
      }
    }
  }
  return records;
}

function createScenarioMap() {
  const width = 2;
  const height = 2;
  const terrain = encoder.encode("TERRAIN_GRASS\0");
  const name = encoder.encode("Old name");
  const description = encoder.encode("Old description");
  const worldSize = encoder.encode("WORLDSIZE_DUEL");
  const tileDataSize = width * height * 8;
  const tileOffset = 42 + terrain.length + name.length + description.length + 4 + worldSize.length;
  const scenarioOffset = tileOffset + tileDataSize;
  const playerOffset = scenarioOffset + 120;
  const buffer = new ArrayBuffer(playerOffset + 436 + tileDataSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint8(0, 0x8c);
  view.setUint32(1, width, true);
  view.setUint32(5, height, true);
  view.setUint8(9, 1);
  view.setUint32(14, terrain.length, true);
  view.setUint32(34, name.length, true);
  view.setUint32(38, description.length, true);

  let offset = 42;
  bytes.set(terrain, offset);
  offset += terrain.length;
  bytes.set(name, offset);
  offset += name.length;
  bytes.set(description, offset);
  offset += description.length;
  view.setUint32(offset, worldSize.length, true);
  offset += 4;
  bytes.set(worldSize, offset);
  offset += worldSize.length;

  for (let tile = 0; tile < width * height; tile += 1) {
    const current = offset + tile * 8;
    view.setUint8(current, 0);
    view.setUint8(current + 1, 0xff);
    view.setUint8(current + 2, 0xff);
    view.setUint8(current + 5, 1);
    view.setUint8(current + 6, 0xff);
  }

  view.setUint8(scenarioOffset + 80, 1);
  bytes.set(encoder.encode("CIVILIZATION_TEST"), playerOffset + 160);
  bytes.set(encoder.encode("PLAYERCOLOR_RED"), playerOffset + 224);
  view.setUint32(playerOffset + 424, 1, true);
  view.setUint32(playerOffset + 428, 0, true);
  view.setUint8(playerOffset + 432, 2);
  view.setUint8(playerOffset + 433, 1);
  for (let tile = 0; tile < width * height; tile += 1) {
    const improvement = playerOffset + 436 + tile * 8;
    view.setUint16(improvement, 0xffff, true);
    view.setUint16(improvement + 2, 0xffff, true);
    view.setUint8(improvement + 4, tile < 2 ? 0 : 0xff);
    view.setUint8(improvement + 5, 0xff);
    view.setUint8(improvement + 6, tile === 0 ? 0 : 0xff);
    view.setUint8(improvement + 7, 0xff);
  }
  return buffer;
}

function createScenarioMapWithMissingStarts() {
  const width = 40;
  const height = 24;
  const playerCount = 2;
  const terrain = encoder.encode("TERRAIN_OCEAN\0TERRAIN_COAST\0TERRAIN_GRASS\0");
  const name = encoder.encode("Missing starts");
  const description = encoder.encode("Scenario records have invalid coordinates");
  const worldSize = encoder.encode("WORLDSIZE_DUEL");
  const tileDataSize = width * height * 8;
  const tileOffset = 42 + terrain.length + name.length + description.length + 4 + worldSize.length;
  const scenarioOffset = tileOffset + tileDataSize;
  const playerOffset = scenarioOffset + 120;
  const improvementOffset = playerOffset + playerCount * 436;
  const buffer = new ArrayBuffer(improvementOffset + tileDataSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  view.setUint8(0, 0x8c);
  view.setUint32(1, width, true);
  view.setUint32(5, height, true);
  view.setUint8(9, playerCount);
  view.setUint32(14, terrain.length, true);
  view.setUint32(34, name.length, true);
  view.setUint32(38, description.length, true);
  let offset = 42;
  bytes.set(terrain, offset);
  offset += terrain.length;
  bytes.set(name, offset);
  offset += name.length;
  bytes.set(description, offset);
  offset += description.length;
  view.setUint32(offset, worldSize.length, true);
  offset += 4;
  bytes.set(worldSize, offset);
  offset += worldSize.length;
  for (let index = 0; index < width * height; index += 1) {
    const tile = offset + index * 8;
    view.setUint8(tile, 2);
    view.setUint8(tile + 1, 0xff);
    view.setUint8(tile + 2, 0xff);
    view.setUint8(tile + 5, 1);
    view.setUint8(tile + 6, 0xff);
  }
  view.setUint8(scenarioOffset + 80, playerCount);
  for (let player = 0; player < playerCount; player += 1) {
    const record = playerOffset + player * 436;
    bytes.set(encoder.encode(`CIVILIZATION_TEST_${player}`), record + 160);
    view.setUint32(record + 424, width + player, true);
    view.setUint32(record + 428, height + player, true);
    view.setUint8(record + 432, player);
    view.setUint8(record + 433, 1);
  }
  for (let index = 0; index < width * height; index += 1) {
    const improvement = improvementOffset + index * 8;
    view.setUint16(improvement, 0xffff, true);
    view.setUint16(improvement + 2, 0xffff, true);
    view.setUint8(improvement + 4, 0xff);
    view.setUint8(improvement + 5, 0xff);
    view.setUint8(improvement + 6, 0xff);
    view.setUint8(improvement + 7, 0xff);
  }
  return buffer;
}

function createScenarioCityMap() {
  const width = 2;
  const height = 2;
  const terrain = encoder.encode("TERRAIN_OCEAN\0TERRAIN_GRASS\0");
  const name = encoder.encode("Broken city");
  const description = encoder.encode("City begins in the ocean");
  const worldSize = encoder.encode("WORLDSIZE_DUEL");
  const tileDataSize = width * height * 8;
  const tileOffset = 42 + terrain.length + name.length + description.length + 4 + worldSize.length;
  const scenarioOffset = tileOffset + tileDataSize;
  const cityOffset = scenarioOffset + 128;
  const teamOffset = cityOffset + 136;
  const playerOffset = teamOffset + 64;
  const improvementOffset = playerOffset + 436;
  const buffer = new ArrayBuffer(improvementOffset + tileDataSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint8(0, 0x8c);
  view.setUint32(1, width, true);
  view.setUint32(5, height, true);
  view.setUint8(9, 1);
  view.setUint32(14, terrain.length, true);
  view.setUint32(34, name.length, true);
  view.setUint32(38, description.length, true);
  let offset = 42;
  bytes.set(terrain, offset);
  offset += terrain.length;
  bytes.set(name, offset);
  offset += name.length;
  bytes.set(description, offset);
  offset += description.length;
  view.setUint32(offset, worldSize.length, true);
  offset += 4;
  bytes.set(worldSize, offset);
  offset += worldSize.length;
  for (let tileIndex = 0; tileIndex < width * height; tileIndex += 1) {
    const tile = offset + tileIndex * 8;
    view.setUint8(tile, tileIndex === 0 ? 0 : 1);
    view.setUint8(tile + 1, 0xff);
    view.setUint8(tile + 2, 0xff);
    view.setUint8(tile + 5, 1);
    view.setUint8(tile + 6, 0xff);
  }

  view.setUint8(scenarioOffset + 80, 1);
  view.setUint8(scenarioOffset + 82, 1);
  view.setUint32(scenarioOffset + 116, 136, true);
  bytes.set(encoder.encode("Atlantis"), cityOffset);
  view.setUint8(cityOffset + 64, 0);
  view.setUint16(cityOffset + 66, 4, true);
  bytes.set(encoder.encode("Team 1"), teamOffset);
  bytes.set(encoder.encode("CIVILIZATION_TEST"), playerOffset + 160);
  view.setUint32(playerOffset + 424, 1, true);
  view.setUint32(playerOffset + 428, 1, true);
  view.setUint8(playerOffset + 433, 1);
  for (let tileIndex = 0; tileIndex < width * height; tileIndex += 1) {
    const improvement = improvementOffset + tileIndex * 8;
    view.setUint16(improvement, tileIndex === 0 ? 0 : 0xffff, true);
    view.setUint16(improvement + 2, 0xffff, true);
    view.setUint8(improvement + 5, 0xff);
    view.setUint8(improvement + 6, 0xff);
    view.setUint8(improvement + 7, 0xff);
  }
  return buffer;
}

test("rewrites map metadata without disturbing scenario data", () => {
  const original = createScenarioMap();
  const exported = updateCiv5MapMetadata(original, "A much longer map name", "Edited description ✓");
  const parsed = parseCiv5Map(exported, "fallback.Civ5Map");

  assert.equal(parsed.name, "A much longer map name");
  assert.equal(parsed.description, "Edited description ✓");
  assert.deepEqual(parsed.startLocations, [{
    x: 1,
    y: 0,
    player: 0,
    civilization: "CIVILIZATION_TEST",
    leader: "",
    teamColor: "PLAYERCOLOR_RED",
    team: 2,
    playable: true,
    cityState: false,
  }]);
  const metadata = metadataSections(exported);
  assert.equal(metadata.name.at(-1), 0);
  assert.equal(metadata.description.at(-1), 0);
});

test("generated map metadata keeps Civ V names and descriptions independently terminated", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "metadata-terminators" });
  generated.name = "Ægir's Reach";
  generated.description = "A cold description ✓";
  const exported = serializeCiv5Map(generated);
  assert.equal(new DataView(exported).getUint8(0), 0x8c);
  const metadata = metadataSections(exported);
  assert.equal(metadata.name.at(-1), 0);
  assert.equal(metadata.description.at(-1), 0);
  assert.equal(new TextDecoder().decode(metadata.name.subarray(0, -1)), generated.name);
  assert.equal(new TextDecoder().decode(metadata.description.subarray(0, -1)), generated.description);
  const parsed = parseCiv5Map(exported, "fallback.Civ5Map");
  assert.equal(parsed.name, generated.name);
  assert.equal(parsed.description, generated.description);
  assert.equal(parsed.startLocations.filter((start) => !start.cityState).length, 2);
});

test("geography-only exports do not claim to contain scenario data", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "geography-marker" });
  generated.startLocations = [];
  const exported = serializeCiv5Map(generated);
  assert.equal(new DataView(exported).getUint8(0), 0x0c);
  assert.equal(parseCiv5Map(exported, "geography.Civ5Map").scenarioDataPresent, false);
});

test("Repair detects and normalizes the invalid synthetic scenario marker", () => {
  const invalid = createScenarioMap();
  new DataView(invalid).setUint8(0, 0x1c);
  const parsed = parseCiv5Map(invalid, "invalid-marker.Civ5Map");
  const issue = buildRepairIssues(parsed).find((candidate) => candidate.id === "structure-scenario-marker");
  assert.equal(issue?.mutation?.kind, "NORMALIZE_SCENARIO_MARKER");
  const repaired = applyRepairIssues(parsed, [issue!], new Set([issue!.id]));
  const exported = updateCiv5Map(invalid, repaired);
  assert.equal(new DataView(exported).getUint8(0), 0x8c);
  assert.equal(parseCiv5Map(exported, "repaired-marker.Civ5Map").scenarioMarker, 8);
});

test("parses scenario political ownership, player colors, and routes", () => {
  const parsed = parseCiv5Map(createScenarioMap(), "political.Civ5Map");
  assert.equal(parsed.scenarioPlayerSlots, 1);
  assert.equal(parsed.scenarioCityStateSlots, 0);
  assert.deepEqual(parsed.tiles.map((tile) => tile.owner), [0, 0, undefined, undefined]);
  assert.equal(parsed.tiles[0].route, "ROUTE_ROAD");
  assert.equal(parsed.startLocations[0].teamColor, "PLAYERCOLOR_RED");
  assert.equal(hasPoliticalLayer(parsed), true);
  assert.deepEqual([...buildPoliticalOwnership(parsed)], [0, 0, -1, -1]);
  assert.match(politicalColors(parsed, 0).fill, /^#[0-9a-f]{6}$/i);
});

test("projects generated-map political influence onto land around starts", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 2, seed: "political-influence" });
  const ownership = buildPoliticalOwnership(generated);
  assert.equal(hasPoliticalLayer(generated), true);
  assert.ok([...ownership].some((owner) => owner >= 0));
  for (let index = 0; index < generated.tiles.length; index += 1) {
    const terrain = generated.terrains[generated.tiles[index].terrain] ?? "";
    if (terrain.includes("OCEAN") || terrain.includes("COAST")) assert.equal(ownership[index], -1);
  }
});

test("export filenames follow the current editor map name", () => {
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "export-name" });
  map.name = "  Ashes & Empires: Redux / 2  ";
  assert.equal(mapExportBaseName(map), "ashes-empires-redux-2");
  map.name = "!?";
  assert.equal(mapExportBaseName(map), "excogitare-map");
});

test("exports tile edits while preserving imported scenario starts", () => {
  const original = createScenarioMap();
  const edited = parseCiv5Map(original, "test.Civ5Map");
  edited.tiles[0] = { ...edited.tiles[0], elevation: 2, river: 4 };
  const parsed = parseCiv5Map(updateCiv5Map(original, edited), "test.Civ5Map");

  assert.equal(parsed.tiles[0].elevation, 2);
  assert.equal(parsed.tiles[0].river, 4);
  assert.equal(parsed.startLocations.length, 1);
  assert.equal(parsed.startLocations[0].x, 1);
});

test("exports repaired start coordinates and scenario flags into player records", () => {
  const original = createScenarioMap();
  new DataView(original).setUint8(9, 8);
  const repaired = parseCiv5Map(original, "test.Civ5Map");
  repaired.startLocations[0] = { ...repaired.startLocations[0], x: 0, y: 1, team: 4, playable: false };
  const issues = buildRepairIssues(repaired);
  const fixed = applyRepairIssues(repaired, issues, new Set(issues.filter((issue) => issue.mutation).map((issue) => issue.id)));
  const parsed = parseCiv5Map(updateCiv5Map(original, fixed), "test.Civ5Map");

  assert.equal(parsed.startLocations[0].x, 0);
  assert.equal(parsed.startLocations[0].y, 1);
  assert.equal(parsed.startLocations[0].team, 4);
  assert.equal(parsed.startLocations[0].playable, false);
  assert.equal(parsed.players, 1);
});

test("repaired missing starts survive export through existing scenario player slots", () => {
  const original = createScenarioMapWithMissingStarts();
  const imported = parseCiv5Map(original, "missing-starts.Civ5Map");
  assert.equal(imported.startLocations.length, 0);
  assert.equal(imported.scenarioPlayerSlots, 2);
  const issues = buildRepairIssues(imported);
  const missing = issues.find((issue) => issue.id === "missing-start-locations");
  assert.equal(missing?.mutation?.kind, "REPLACE_STARTS");
  const repaired = applyRepairIssues(imported, issues, new Set([missing!.id]));
  const roundTripped = parseCiv5Map(updateCiv5Map(original, repaired), "missing-starts-repaired.Civ5Map");
  assert.equal(roundTripped.startLocations.filter((start) => !start.cityState).length, 2);
  assertStartSpacing(roundTripped);
});

test("repairs scenario cities placed on water and preserves the corrected tile link on export", () => {
  const original = createScenarioCityMap();
  const parsed = parseCiv5Map(original, "city-test.Civ5Map");
  assert.deepEqual(parsed.cities?.map((city) => ({ name: city.name, x: city.x, y: city.y })), [{ name: "Atlantis", x: 0, y: 0 }]);
  const issues = buildRepairIssues(parsed);
  const cityIssue = issues.find((issue) => issue.id === "city-placement-0");
  assert.equal(cityIssue?.mutation?.kind, "MOVE_CITY");
  const repaired = applyRepairIssues(parsed, issues, new Set([cityIssue!.id]));
  const roundTrip = parseCiv5Map(updateCiv5Map(original, repaired), "city-test.Civ5Map");
  const city = roundTrip.cities?.[0];
  assert.ok(city);
  assert.equal(isPassableLand(roundTrip, roundTrip.tiles[city.y * roundTrip.width + city.x]), true);
  assert.notDeepEqual([city.x, city.y], [0, 0]);
});

test("repair parser recovers truncated geography into a complete renderable grid", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "repair-salvage" });
  const serialized = serializeCiv5Map(generated);
  const view = new DataView(serialized);
  let geographyLength = 42;
  for (const headerOffset of [14, 18, 22, 26, 30, 34, 38]) geographyLength += view.getUint32(headerOffset, true);
  geographyLength += 4 + view.getUint32(geographyLength, true) + generated.tiles.length * 8;
  const truncated = serialized.slice(0, geographyLength - 8);
  const recovered = parseCiv5MapForRepair(truncated, "damaged.Civ5Map");

  assert.equal(recovered.salvaged, true);
  assert.equal(recovered.map.tiles.length, generated.width * generated.height);
  assert.ok(recovered.diagnostics.some((diagnostic) => /missing tiles/i.test(diagnostic)));
});

test("repair tests correct illegal resources, features, and river bytes", () => {
  const tile = (terrain = 2, elevation = 0): Civ5Tile => ({ terrain, resource: 255, feature: 255, river: 0, elevation, continent: 0, wonder: 255, resourceAmount: 0 });
  const map: Civ5Map = {
    name: "Broken placements", description: "", worldSize: "Custom", version: 12, width: 4, height: 3, players: 0, wraps: false,
    terrains: ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT"],
    features: ["FEATURE_FOREST", "FEATURE_OASIS"], wonders: [], resources: ["RESOURCE_FISH", "RESOURCE_GOLD"],
    tiles: Array.from({ length: 12 }, () => tile()), startLocations: [], source: "file",
  };
  map.tiles[0] = { ...tile(0), feature: 0 };
  map.tiles[1] = tile(1);
  map.tiles[4] = { ...tile(2), resource: 0, resourceAmount: 1 };
  map.tiles[5] = { ...tile(2, 2), resource: 1, resourceAmount: 1 };
  map.tiles[6] = { ...tile(2), feature: 1 };
  map.tiles[8].river = 128;

  const issues = buildRepairIssues(map);
  assert.ok(issues.some((issue) => issue.category === "RESOURCES" && issue.severity === "ERROR"));
  assert.ok(issues.some((issue) => issue.category === "FEATURES" && issue.severity === "ERROR"));
  assert.ok(issues.some((issue) => issue.category === "RIVERS" && issue.severity === "ERROR"));
  const selected = new Set(issues.filter((issue) => issue.mutation).map((issue) => issue.id));
  const repaired = applyRepairIssues(map, issues, selected);
  for (const repairedTile of repaired.tiles) assert.equal(resourcePlacementVerdict(repaired, repairedTile).valid, true);
  assert.equal(repaired.tiles[0].feature, 255);
  assert.equal(repaired.tiles[6].feature, 255);
  assert.equal(repaired.tiles[8].river, 0);
});

test("illegal resources are deleted when no compatible relocation exists", () => {
  const map: Civ5Map = {
    name: "No ocean", description: "", worldSize: "Custom", version: 12, width: 3, height: 2, players: 0, wraps: false,
    terrains: ["TERRAIN_GRASS"], features: [], wonders: [], resources: ["RESOURCE_FISH"],
    tiles: Array.from({ length: 6 }, () => ({ terrain: 0, resource: 255, feature: 255, river: 0, elevation: 0, continent: 0, wonder: 255, resourceAmount: 0 })),
    startLocations: [], source: "file",
  };
  map.tiles[0].resource = 0;
  map.tiles[0].resourceAmount = 2;
  const issues = buildRepairIssues(map);
  const issue = issues.find((candidate) => candidate.id === "resource-0");
  assert.equal(issue?.mutation?.kind, "REMOVE_RESOURCE");
  const repaired = applyRepairIssues(map, issues, new Set([issue!.id]));
  assert.equal(repaired.tiles[0].resource, 255);
  assert.equal(repaired.tiles[0].resourceAmount, 0);
});

test("repair rebuilds broken river fragments into logical mountain-to-sea networks", () => {
  const generated = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    style: "REALISTIC",
    rainfall: "WET",
    waterPercent: 45,
    mountainPercent: 24,
    seed: "repair-river-network",
  });
  assert.equal(buildRepairIssues(generated).some((issue) => issue.id === "river-network"), false, "a generated logical network was incorrectly flagged");
  const broken: Civ5Map = { ...generated, tiles: generated.tiles.map((tile) => ({ ...tile, river: 0 })) };
  const fragment = broken.tiles.findIndex((tile, index) => {
    const x = index % broken.width;
    return x > 0 && tile.terrain >= 2 && broken.tiles[index - 1].terrain >= 2;
  });
  assert.ok(fragment >= 0);
  broken.tiles[fragment].river = 1;
  const issues = buildRepairIssues(broken);
  const riverIssue = issues.find((issue) => issue.id === "river-network");
  assert.equal(riverIssue?.mutation?.kind, "SET_RIVER_NETWORK");
  const repaired = applyRepairIssues(broken, issues, new Set([riverIssue!.id]));
  assert.notEqual(repaired.tiles.map((tile) => tile.river).join(","), broken.tiles.map((tile) => tile.river).join(","));
  assertRiverNetworks(repaired as ReturnType<typeof generateMap>);
});

test("repair removes water-edge rivers and inland tributary dead ends", () => {
  const generated = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    style: "REALISTIC",
    rainfall: "WET",
    waterPercent: 45,
    mountainPercent: 24,
    seed: "repair-river-water-correctness",
  });
  assertRiverNetworks(generated);
  const records = riverEdgeRecords(generated);
  const shoreline = records.find((edge) => generated.tiles[edge.owner].terrain < 2 || generated.tiles[edge.neighbor].terrain < 2);
  assert.ok(shoreline, "test map did not contain a shoreline edge");

  const inWater: Civ5Map = { ...generated, tiles: generated.tiles.map((tile) => ({ ...tile })) };
  inWater.tiles[shoreline.owner].river |= shoreline.bit;
  const waterIssues = buildRepairIssues(inWater);
  const waterIssue = waterIssues.find((issue) => issue.id === "river-network");
  assert.equal(waterIssue?.mutation?.kind, "SET_RIVER_NETWORK");
  const waterRepaired = applyRepairIssues(inWater, waterIssues, new Set([waterIssue!.id]));
  assertRiverNetworks(waterRepaired as ReturnType<typeof generateMap>);

  const riverVertices = new Set(records.flatMap((edge) => generated.tiles[edge.owner].river & edge.bit ? [edge.a, edge.b] : []));
  const vertexTiles = new Map<string, Set<number>>();
  for (const edge of records) {
    for (const vertex of [edge.a, edge.b]) {
      const tiles = vertexTiles.get(vertex) ?? new Set<number>();
      tiles.add(edge.owner);
      tiles.add(edge.neighbor);
      vertexTiles.set(vertex, tiles);
    }
  }
  const deadEndEdge = records.find((edge) => {
    if (generated.tiles[edge.owner].river & edge.bit) return false;
    if (generated.tiles[edge.owner].terrain < 2 || generated.tiles[edge.neighbor].terrain < 2) return false;
    const attached = riverVertices.has(edge.a) !== riverVertices.has(edge.b);
    if (!attached) return false;
    const end = riverVertices.has(edge.a) ? edge.b : edge.a;
    return [...(vertexTiles.get(end) ?? [])].every((index) => generated.tiles[index].terrain >= 2 && generated.tiles[index].elevation !== 2);
  });
  assert.ok(deadEndEdge, "test map did not contain a suitable inland branch edge");

  const deadEnd: Civ5Map = { ...generated, tiles: generated.tiles.map((tile) => ({ ...tile })) };
  deadEnd.tiles[deadEndEdge.owner].river |= deadEndEdge.bit;
  const deadEndIssues = buildRepairIssues(deadEnd);
  const deadEndIssue = deadEndIssues.find((issue) => issue.id === "river-network");
  assert.equal(deadEndIssue?.mutation?.kind, "SET_RIVER_NETWORK");
  assert.match(deadEndIssue?.detail ?? "", /inland dead end/i);
  const deadEndRepaired = applyRepairIssues(deadEnd, deadEndIssues, new Set([deadEndIssue!.id]));
  assertRiverNetworks(deadEndRepaired as ReturnType<typeof generateMap>);
});

test("start-location repair tests cover passability, duplicates, counts, city-state flags, and reachability", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 4, cityStates: 1, seed: "broken-starts" });
  const map: Civ5Map = { ...generated, players: 9, tiles: generated.tiles.map((item) => ({ ...item })), startLocations: generated.startLocations.map((start) => ({ ...start })) };
  const invalidIndex = map.startLocations[0].y * map.width + map.startLocations[0].x;
  map.tiles[invalidIndex].terrain = 0;
  map.tiles[invalidIndex].elevation = 0;
  map.startLocations[1].x = map.startLocations[0].x;
  map.startLocations[1].y = map.startLocations[0].y;
  map.startLocations.at(-1)!.playable = true;

  const issues = buildRepairIssues(map);
  assert.ok(issues.some((issue) => issue.category === "STARTS" && issue.severity === "ERROR"));
  assert.ok(issues.some((issue) => issue.id === "player-count"));
  assert.ok(issues.some((issue) => issue.id.startsWith("city-state-playable-")));
  const selected = new Set(issues.filter((issue) => issue.mutation).map((issue) => issue.id));
  const repaired = applyRepairIssues(map, issues, selected);
  const positions = repaired.startLocations.map((start) => `${start.x},${start.y}`);
  assert.equal(new Set(positions).size, positions.length);
  for (const start of repaired.startLocations) assert.equal(isPassableLand(repaired, repaired.tiles[start.y * repaired.width + start.x]), true);
  assert.equal(repaired.startLocations.find((start) => start.cityState)?.playable, false);
  assert.equal(repaired.players, repaired.startLocations.filter((start) => !start.cityState).length);

  const pocketTile = (): Civ5Tile => ({ terrain: 2, resource: 255, feature: 255, river: 0, elevation: 0, continent: 0, wonder: 255, resourceAmount: 0 });
  const pocket: Civ5Map = {
    name: "Pocket", description: "", worldSize: "Custom", version: 12, width: 5, height: 4, players: 1, wraps: false,
    terrains: ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS"], features: [], wonders: [], resources: [],
    tiles: Array.from({ length: 20 }, pocketTile),
    startLocations: [{ x: 2, y: 1, player: 0, civilization: "", leader: "", team: 0, playable: true, cityState: false }], source: "file",
  };
  for (const neighbor of adjacentIndices(7, pocket.width, pocket.height, false)) pocket.tiles[neighbor].elevation = 2;
  assert.ok(buildRepairIssues(pocket).some((issue) => issue.id === "start-access-0" && issue.mutation?.kind === "MOVE_START"));
});

test("Repair treats missing start locations as an error and rebuilds writable scenario slots", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 4, cityStates: 0, seed: "missing-start-fixture" });
  const writable: Civ5Map = { ...generated, source: "file", players: 4, scenarioPlayerSlots: 4, scenarioCityStateSlots: 0, startLocations: [] };
  const issues = buildRepairIssues(writable);
  const missing = issues.find((issue) => issue.id === "missing-start-locations");
  assert.equal(missing?.severity, "ERROR");
  assert.equal(missing?.mutation?.kind, "REPLACE_STARTS");
  const repaired = applyRepairIssues(writable, issues, new Set([missing!.id]));
  assert.equal(repaired.startLocations.filter((start) => !start.cityState).length, 4);
  assert.equal(repaired.players, 4);
  assertStartSpacing(repaired);
  assert.equal(validateCiv5Map(repaired).some((issue) => issue.category === "STARTS" && issue.severity === "ERROR"), false);

  const noSlots: Civ5Map = { ...writable, players: 0, scenarioPlayerSlots: 0, scenarioDataPresent: true };
  const blocked = buildRepairIssues(noSlots).find((issue) => issue.id === "missing-start-locations");
  assert.equal(blocked?.severity, "ERROR");
  assert.equal(blocked?.mutation, undefined);
  assert.match(blocked?.detail ?? "", /no writable scenario player slots/i);
  assert.ok(validateCiv5Map(noSlots).some((issue) => issue.category === "STARTS" && issue.severity === "ERROR"));
});

test("Repair creates scenario starts for geography-only generated exports", () => {
  const generated = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC",
    preset: "PENINSULA_REALM",
    size: "COLOSSAL",
    geometry: "SQUARE",
    players: 6,
    cityStates: 6,
    seed: "1t4c9pc-18g28ve",
  });
  const completeExport = serializeCiv5Map(generated);
  assert.equal(new DataView(completeExport).getUint8(0), 0x8c);
  const view = new DataView(completeExport);
  let geographyLength = 42;
  for (const headerOffset of [14, 18, 22, 26, 30, 34, 38]) geographyLength += view.getUint32(headerOffset, true);
  geographyLength += 4 + view.getUint32(geographyLength, true) + generated.tiles.length * 8;
  const legacyExport = completeExport.slice(0, geographyLength);
  new DataView(legacyExport).setUint8(0, 0x0c);
  const imported = parseCiv5Map(legacyExport, "peninsula-realm-legacy.Civ5Map");
  assert.equal(imported.startLocations.length, 0);
  assert.equal(imported.scenarioDataPresent, false);

  const issues = buildRepairIssues(imported);
  const missing = issues.find((issue) => issue.id === "missing-start-locations");
  assert.equal(missing?.mutation?.kind, "REPLACE_STARTS");
  assert.match(missing?.detail ?? "", /new scenario section/i);
  const repaired = applyRepairIssues(imported, issues, new Set([missing!.id]));
  assert.equal(repaired.startLocations.filter((start) => !start.cityState).length, 6);
  assert.equal(repaired.startLocations.filter((start) => start.cityState).length, 6);
  assertStartSpacing(repaired);

  const repairedExport = updateCiv5Map(legacyExport, repaired);
  assert.equal(new DataView(repairedExport).getUint8(0), 0x8c);
  const roundTripped = parseCiv5Map(repairedExport, "peninsula-realm-repaired.Civ5Map");
  assert.equal(roundTripped.scenarioPlayerSlots, 6);
  assert.equal(roundTripped.scenarioCityStateSlots, 6);
  assert.equal(roundTripped.startLocations.filter((start) => !start.cityState).length, 6);
  assert.equal(roundTripped.startLocations.filter((start) => start.cityState).length, 6);
  assertStartSpacing(roundTripped);
});

test("Repair replaces overcrowded starts and Competitive balancing changes the whole layout", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 4, cityStates: 3, balance: "STANDARD", startQuality: "STANDARD", seed: "start-rebalance-fixture" });
  const imported: Civ5Map = { ...generated, source: "file", scenarioPlayerSlots: 4, scenarioCityStateSlots: 3, startLocations: generated.startLocations.map((start) => ({ ...start })) };
  const first = imported.startLocations[0];
  const nearbyIndex = imported.tiles.findIndex((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && startDistance(first, { x: index % imported.width, y: Math.floor(index / imported.width) }, imported.width, imported.wraps) === 2);
  assert.ok(nearbyIndex >= 0);
  imported.startLocations[1].x = nearbyIndex % imported.width;
  imported.startLocations[1].y = Math.floor(nearbyIndex / imported.width);
  const crowdedIssues = buildRepairIssues(imported);
  const spacing = crowdedIssues.find((issue) => issue.id === "start-spacing");
  assert.equal(spacing?.severity, "ERROR");
  assert.equal(spacing?.mutation?.kind, "REPLACE_STARTS");
  const separated = applyRepairIssues(imported, crowdedIssues, new Set([spacing!.id]));
  assertStartSpacing(separated);

  const validImported: Civ5Map = { ...generated, source: "file", scenarioPlayerSlots: 4, scenarioCityStateSlots: 3, startLocations: generated.startLocations.map((start) => ({ ...start })) };
  const balanceIssue = buildRepairIssues(validImported).find((issue) => issue.id === "start-balance");
  assert.equal(balanceIssue?.mutation?.kind, "REPLACE_STARTS");
  const balanced = applyRepairIssues(validImported, [balanceIssue!], new Set([balanceIssue!.id]));
  assert.notDeepEqual(balanced.startLocations.map((start) => [start.x, start.y]), validImported.startLocations.map((start) => [start.x, start.y]));
  assertStartSpacing(balanced);
});

test("all generation engines enforce five-hex start spacing", () => {
  const configurations = [
    { engine: "EXCOGITARE", preset: "CONTINENTS" },
    { engine: "ECCENTRIC", preset: "LIVING_WORLD" },
    { engine: "PHYSICAL", preset: "DYNAMIC_EARTH" },
    { engine: "POLIS", preset: "IMPERIAL_RING" },
  ] as const;
  for (const configuration of configurations) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, ...configuration, size: "DUEL", players: 6, cityStates: 6, waterPercent: 48, seed: `spacing-${configuration.engine}` });
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, 6);
    assertStartSpacing(map);
    assert.equal(validateCiv5Map(map).some((issue) => issue.category === "STARTS" && issue.severity === "ERROR"), false);
  }
  for (const configuration of configurations.slice(0, 3)) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, ...configuration, size: "DUEL", players: 2, cityStates: 2, waterPercent: 90, seed: `sparse-spacing-${configuration.engine}` });
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, 2);
    assertStartSpacing(map);
  }
});

test("all generation engines retain legal starts on Colossal maps", () => {
  const configurations = [
    { engine: "EXCOGITARE", preset: "CONTINENTS" },
    { engine: "ECCENTRIC", preset: "PENINSULA_REALM" },
    { engine: "PHYSICAL", preset: "DYNAMIC_EARTH" },
    { engine: "POLIS", preset: "IMPERIAL_RING" },
  ] as const;
  for (const configuration of configurations) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, ...configuration, size: "COLOSSAL", players: 6, cityStates: 6, seed: `colossal-starts-${configuration.engine}` });
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, 6);
    assert.equal(map.startLocations.filter((start) => start.cityState).length, 6);
    assertStartSpacing(map);
  }
});

test("Polis reduces impossible major and city-state populations and records actual counts", () => {
  let state = 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const geography = generatePolisGeography({ ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS", preset: "IMPERIAL_RING", players: 22, cityStates: 41, waterPercent: 90 }, 12, 8, false, 1234, random);
  const majors = geography.startLocations.filter((start) => !start.cityState);
  const cityStates = geography.startLocations.filter((start) => start.cityState);
  assert.ok(majors.length > 0 && majors.length < 22);
  assert.ok(cityStates.length < 41);
  assert.equal(geography.diagnostics.majorStarts, majors.length);
  assert.equal(geography.diagnostics.cityStates, cityStates.length);
  assertStartSpacing({ width: 12, height: 8, wraps: false, startLocations: geography.startLocations } as Civ5Map);
  assert.ok(geography.structure.strategicGraph?.relaxations.some((message) => /requested major starts/.test(message)));
  assert.ok(geography.structure.strategicGraph?.relaxations.some((message) => /requested city states/.test(message)));

  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS", preset: "IMPERIAL_RING", size: "DUEL", players: 22, cityStates: 41, waterPercent: 90, seed: "polis-capacity" });
  const actualCityStates = generated.startLocations.filter((start) => start.cityState).length;
  assert.ok(actualCityStates < 41);
  assert.equal(generated.generation?.cityStates, actualCityStates);
  assert.equal(generated.players, generated.startLocations.filter((start) => !start.cityState).length);
});

test("city-state defaults and Randomise avoid opening-map overpopulation", () => {
  assert.equal(DEFAULT_GENERATION_OPTIONS.cityStates, 8);
  assert.equal(DEFAULT_GENERATION_OPTIONS.cityStateMinSpacing, MINIMUM_START_DISTANCE);
  for (const size of MAP_SIZES) assert.equal(size.recommendedCityStates, size.recommendedPlayers);
  let state = 0x91827364;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = 0; index < 100; index += 1) {
    const options = randomGenerationOptions(random);
    const size = MAP_SIZES.find((candidate) => candidate.id === options.size)!;
    assert.ok(options.cityStates <= size.recommendedCityStates);
    assert.ok(options.players <= size.recommendedPlayers + 2);
    assert.ok(options.cityStateMinSpacing >= MINIMUM_START_DISTANCE);
  }
});

test("seeded generation is deterministic and uses standard map sizes", () => {
  const options = { ...DEFAULT_GENERATION_OPTIONS, size: "DUEL" as const, players: 4, cityStates: 6, seed: "same-world" };
  const first = generateMap(options);
  const second = generateMap(options);

  assert.equal(first.width, 40);
  assert.equal(first.height, 24);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.equal(first.startLocations.filter((start) => !start.cityState).length, 4);
  assert.equal(first.startLocations.filter((start) => start.cityState).length, 6);
  assert.equal(new Set(first.startLocations.map((start) => `${start.x},${start.y}`)).size, 10);
});

test("World Character profiles exhaustively define directional behavior for every engine", () => {
  const styles: GenerationStyle[] = ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"];
  const engines: GenerationEngine[] = ["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"];
  assert.deepEqual(Object.keys(WORLD_CHARACTER_PROFILES).sort(), [...styles].sort());
  for (const style of styles) {
    assert.equal(worldCharacterProfile(style).id, style);
    for (const engine of engines) assert.ok(describeWorldCharacter(engine, style).length >= 80, `${engine} ${style} lacks a useful explanation`);
  }
  assert.ok(worldCharacterProfile("REALISTIC").riverSourceFactor > worldCharacterProfile("FANTASTICAL").riverSourceFactor);
  assert.ok(worldCharacterProfile("FANTASTICAL").riverSourceFactor > worldCharacterProfile("MUNDANE").riverSourceFactor);
  assert.ok(worldCharacterProfile("MUNDANE").riverSourceFactor > worldCharacterProfile("BRUTAL").riverSourceFactor);
  assert.equal(worldCharacterProfile("BRUTAL").mountainFloor, 18);
  assert.ok(worldCharacterProfile("FANTASTICAL").eccentric.paletteDelta > worldCharacterProfile("MUNDANE").eccentric.paletteDelta);
  assert.ok(worldCharacterProfile("BRUTAL").physical.activity > worldCharacterProfile("MUNDANE").physical.activity);
  assert.ok(worldCharacterProfile("BRUTAL").polis.corridorBarrier > worldCharacterProfile("MUNDANE").polis.corridorBarrier);
});

test("World Character produces deterministic, legal, materially distinct output in every engine", () => {
  const styles: GenerationStyle[] = ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"];
  const configurations: ReadonlyArray<{ engine: GenerationEngine; preset: MapGenerationOptions["preset"] }> = [
    { engine: "EXCOGITARE", preset: "CONTINENTS" },
    { engine: "ECCENTRIC", preset: "MYTHIC_REGIONS" },
    { engine: "PHYSICAL", preset: "DYNAMIC_EARTH" },
    { engine: "POLIS", preset: "IMPERIAL_RING" },
  ];
  for (const configuration of configurations) {
    const signatures = new Set<string>();
    for (const style of styles) {
      const options = { ...DEFAULT_GENERATION_OPTIONS, ...configuration, style, size: "DUEL" as const, players: 4, cityStates: 4, waterPercent: 52, mountainPercent: 14, seed: "world-character-matrix" };
      const first = generateMap(options);
      const second = generateMap(options);
      assert.deepEqual(first, second, `${configuration.engine} ${style} was not deterministic`);
      assert.equal(first.structure?.engine, configuration.engine);
      assert.equal(first.generation?.style, style);
      assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * 0.52));
      assertStartSpacing(first);
      assertMountainPassability(first);
      assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${configuration.engine} ${style} unexpectedly required Repair`);
      if (style === "BRUTAL") assert.ok((first.generation?.mountainPercent ?? 0) >= 18);
      const exported = parseCiv5Map(serializeCiv5Map(first), `${configuration.engine}-${style}.Civ5Map`);
      assert.deepEqual(exported.tiles, first.tiles, `${configuration.engine} ${style} tile consequences did not survive Civ5Map export`);
      signatures.add(first.tiles.map((tile) => `${tile.terrain}${tile.elevation}${tile.feature}:${tile.river}`).join("|"));
    }
    assert.equal(signatures.size, styles.length, `${configuration.engine} characters did not produce four distinct worlds`);
  }
});

test("structured engines apply character direction to retained geography rather than metadata alone", () => {
  const styles: GenerationStyle[] = ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"];
  const options = { ...DEFAULT_GENERATION_OPTIONS, size: "DUEL" as const, players: 4, cityStates: 4, waterPercent: 52, mountainPercent: 14, seed: "character-direction" };
  const eccentric = Object.fromEntries(styles.map((style) => [style, generateEccentricGeography({ ...options, engine: "ECCENTRIC", preset: "MYTHIC_REGIONS", style }, 40, 24, true, 4901, seededRandom(771))])) as Record<GenerationStyle, ReturnType<typeof generateEccentricGeography>>;
  assert.ok(eccentric.FANTASTICAL.diagnostics.climatePalettes > eccentric.MUNDANE.diagnostics.climatePalettes);
  assert.ok(eccentric.FANTASTICAL.diagnostics.climatePalettes > eccentric.REALISTIC.diagnostics.climatePalettes);
  assert.ok(eccentric.BRUTAL.moistures.reduce((sum, value) => sum + value, 0) < eccentric.REALISTIC.moistures.reduce((sum, value) => sum + value, 0));
  assert.ok(variance(eccentric.BRUTAL.reliefValues) > variance(eccentric.MUNDANE.reliefValues));

  const physical = Object.fromEntries(styles.map((style) => [style, generatePhysicalGeography({ ...options, engine: "PHYSICAL", preset: "DYNAMIC_EARTH", style }, 40, 24, true, 4901, seededRandom(771))])) as Record<GenerationStyle, ReturnType<typeof generatePhysicalGeography>>;
  assert.ok((physical.BRUTAL.structure.diagnostics.convergentTiles ?? 0) > (physical.MUNDANE.structure.diagnostics.convergentTiles ?? 0));
  assert.ok((physical.BRUTAL.structure.diagnostics.meanMoisture ?? 0) < (physical.REALISTIC.structure.diagnostics.meanMoisture ?? 0));
  assert.ok(variance(physical.BRUTAL.reliefValues) > variance(physical.MUNDANE.reliefValues));

  const polis = Object.fromEntries(styles.map((style) => [style, generatePolisGeography({ ...options, engine: "POLIS", preset: "IMPERIAL_RING", style }, 40, 24, true, 4901, seededRandom(771))])) as Record<GenerationStyle, ReturnType<typeof generatePolisGeography>>;
  assert.ok((polis.BRUTAL.structure.diagnostics.characterChokepointDensity ?? 0) > (polis.MUNDANE.structure.diagnostics.characterChokepointDensity ?? 0));
  const averageWidth = (style: GenerationStyle) => polis[style].structure.strategicGraph!.edges.reduce((sum, edge) => sum + edge.width, 0) / Math.max(1, polis[style].structure.strategicGraph!.edges.length);
  assert.ok(averageWidth("BRUTAL") < averageWidth("MUNDANE"));
  assert.ok(variance(polis.BRUTAL.reliefValues) > variance(polis.MUNDANE.reliefValues));
});

test("Eccentric generation is deterministic, exact, legal, and geographically structured", () => {
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC" as const,
    preset: "LIVING_WORLD" as const,
    size: "DUEL" as const,
    players: 4,
    cityStates: 6,
    waterPercent: 57,
    mountainPercent: 21,
    granularity: "HIGH" as const,
    riverDensity: "DENSE" as const,
    seed: "region-world-audit",
  };
  const first = generateMap(options);
  const second = generateMap(options);

  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * 0.57));
  assert.match(first.description, /Eccentric engine/);
  assert.equal(first.startLocations.filter((start) => !start.cityState).length, 4);
  assert.equal(first.startLocations.filter((start) => start.cityState).length, 6);
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);
  assertMountainPassability(first);
  assertRiverNetworks(first);
  assert.equal(first.structure?.engine, "ECCENTRIC");
  assert.ok(first.structure!.objects.some((object) => object.kind === "SUBREGION"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "POLYGON"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "SUPERPOLYGON"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "CLIMATE_REGION"));
  assert.ok(first.structure!.mountainRanges.length > 0);
  assert.ok(first.structure!.riverSystems.length > 0);
  assert.equal(first.structure!.diagnostics.passes, 8);
  assert.ok(first.structure!.diagnostics.subregions > first.tiles.length * 0.5);
  assert.ok(first.structure!.diagnostics.climatePalettes > first.structure!.diagnostics.climateRegions);
  assert.ok(first.structure!.diagnostics.biomeTransitions > 0);
});

test("Fantasticality changes retained regional complexity instead of merely changing copy", () => {
  const common = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC" as const,
    preset: "MYTHIC_REGIONS" as const,
    size: "DUEL" as const,
    players: 2,
    cityStates: 0,
    regionClimateLogic: "LAWLESS" as const,
    waterPercent: 52,
    seed: "fantasticality-is-architecture",
  };
  const restrained = generateMap({ ...common, fantasticality: "RESTRAINED" });
  const unbound = generateMap({ ...common, fantasticality: "UNBOUND" });
  assert.notDeepEqual(restrained.tiles.map((tile) => `${tile.terrain}:${tile.feature}:${tile.elevation}`), unbound.tiles.map((tile) => `${tile.terrain}:${tile.feature}:${tile.elevation}`));
  assert.ok(unbound.structure!.diagnostics.climatePalettes > restrained.structure!.diagnostics.climatePalettes);
  assert.ok(unbound.structure!.diagnostics.climateRegions >= restrained.structure!.diagnostics.climateRegions);
  assert.equal(unbound.structure!.diagnostics.passes, 8);
  assert.deepEqual(buildRepairIssues(unbound).filter((issue) => issue.id !== "clean"), []);
  assertMountainPassability(unbound);
  assertRiverNetworks(unbound);
});

test("Fantastical landmass grammars produce distinct legal navigation architectures", () => {
  const presets = ["ENCIRCLING_LANDS", "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO"] as const;
  const signatures = new Set<string>();
  for (const preset of presets) {
    const definition = MAP_PRESETS.find((item) => item.id === preset)!;
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      engine: "ECCENTRIC",
      preset,
      size: "DUEL",
      players: 2,
      cityStates: 0,
      waterPercent: definition.water,
      fantasticality: "UNBOUND",
      regionClimateLogic: "LAWLESS",
      seed: `grammar-${preset}`,
    });
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * definition.water / 100));
    assert.equal(map.structure?.diagnostics.passes, 8);
    assert.ok((map.structure?.diagnostics.subregions ?? 0) > map.tiles.length * 0.5);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
    signatures.add(`${map.structure?.diagnostics.continents}:${map.structure?.diagnostics.oceanBasins}:${map.structure?.diagnostics.astronomyBasins}:${map.structure?.diagnostics.deepWaterBarriers}:${map.tiles.map((tile) => tile.terrain < 2 ? "0" : "1").join("")}`);
  }
  assert.equal(signatures.size, presets.length);
});

test("Map Type display-name migration preserves stable preset ids and exempt names", () => {
  const expectedLabels = new Map([
    ["CONTINENTS", "Crooked Continents"],
    ["PANGAEA", "Broken Pangaea"],
    ["ARCHIPELAGO", "Drowned Shelves"],
    ["INLAND_SEAS", "Lake Kingdoms"],
    ["EARTHSEA", "Island Continents"],
    ["RIFT_REALMS", "Deep-Ocean Divides"],
    ["LABYRINTH", "Land and Sea Maze"],
    ["WILD_REGIONS", "Patchwork Provinces"],
    ["LIVING_WORLD", "Ecological Transect"],
    ["TECTONIC_CONTINENTS", "Plate-Built Continents"],
    ["GREAT_WATERSHEDS", "Great Watersheds"],
    ["SHATTERED_BASINS", "Inland Sea Crossroads"],
    ["MYTHIC_REGIONS", "Wonder Heartlands"],
    ["ENCIRCLING_LANDS", "Encircled Seas"],
    ["ASTRAL_PANGAEA", "Scarred Pangaea"],
    ["RIFTWORLD", "Rift Lattice"],
    ["LONELY_OCEANS", "Lonely Oceans"],
    ["PENINSULA_REALM", "Great Peninsulas"],
    ["SHATTERED_ARCHIPELAGO", "Broken Island Chains"],
    ["DYNAMIC_EARTH", "Dynamic Earth"],
    ["COLLIDING_PLATES", "Colliding Plates"],
    ["ANCIENT_CRATONS", "Ancient Continental Shields"],
    ["ISLAND_ARC_EARTH", "Volcanic Island Arcs"],
    ["SUPERCONTINENT_INTERIOR", "Inland Supercontinent"],
    ["MONSOON_CONTINENTS", "Monsoon Continents"],
    ["ICEHOUSE_EARTH", "Glacial World"],
    ["IMPERIAL_RING", "Imperial Ring"],
    ["OPPOSING_FRONTS", "Opposing Fronts"],
    ["CONTESTED_HEARTLAND", "Contested Heartland"],
    ["RIVAL_CONTINENTS", "Rival Continents"],
  ]);
  assert.deepEqual(new Map(MAP_PRESETS.map((preset) => [preset.id, preset.label])), expectedLabels);
});

test("Eccentric retains its dense hierarchy across stock map budgets", () => {
  const minimumSubregions = { DUEL: 580, STANDARD: 1300, HUGE: 2400 } as const;
  for (const size of ["DUEL", "STANDARD", "HUGE"] as const) {
    const started = performance.now();
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "ECCENTRIC", preset: "MYTHIC_REGIONS", size, players: 2, cityStates: 0, seed: `eccentric-density-${size}` });
    assert.ok((map.structure?.diagnostics.subregions ?? 0) >= minimumSubregions[size]);
    assert.ok((map.structure?.diagnostics.polygons ?? 0) >= 180);
    assert.ok(performance.now() - started < 5000, `${size} Eccentric generation exceeded the browser-practical regression budget`);
  }
});

test("legacy Region-Graph settings normalize to Eccentric without remaining authoritative", () => {
  const legacy = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "REGION_GRAPH",
    preset: "MYTHIC_REGIONS",
    size: "DUEL",
    players: 2,
    cityStates: 0,
    seed: "legacy-region-graph",
  } as unknown as Parameters<typeof generateMap>[0]);
  assert.equal(legacy.structure?.engine, "ECCENTRIC");
  assert.equal(legacy.generation?.engine, "ECCENTRIC");
  assert.match(legacy.description, /Eccentric engine/);
});

test("Eccentric Astronomy basins are authoritative and honor feasible counts", () => {
  for (const oceanBasins of [1, 2, 3, 4, 5]) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      engine: "ECCENTRIC",
      preset: "RIFTWORLD",
      size: "DUEL",
      players: 2,
      cityStates: 0,
      oceanBasins,
      seed: `eccentric-basins-${oceanBasins}`,
    });
    assert.equal(map.structure?.diagnostics.requestedAstronomyBasins, oceanBasins);
    assert.equal(map.structure?.diagnostics.astronomyBasins, oceanBasins);
    const basins = map.structure!.objects.filter((object) => object.kind === "SUPERPOLYGON" && object.attributes?.geography === "ASTRONOMY_BASIN");
    assert.equal(basins.length, oceanBasins);
    assert.ok(basins.every((basin) => basin.attributes?.authoritative === true));
  }
});

test("Eccentric climate realms contain contiguous two-to-four-part biome collections", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC",
    preset: "MYTHIC_REGIONS",
    size: "STANDARD",
    players: 2,
    cityStates: 0,
    fantasticality: "UNBOUND",
    regionClimateLogic: "LAWLESS",
    seed: "eccentric-biome-collections",
  });
  const collections = map.structure!.objects.filter((object) => object.kind === "BIOME_COLLECTION");
  assert.ok(collections.length > 20);
  const regionCollections = new Map<number, Set<number>>();
  for (const object of collections) {
    const region = Number(object.attributes?.region);
    const collection = Number(object.attributes?.collection);
    if (!regionCollections.has(region)) regionCollections.set(region, new Set());
    regionCollections.get(region)!.add(collection);
    const allowed = new Set(object.tileIndices);
    const reached = new Set<number>([object.tileIndices[0]]);
    const queue = [object.tileIndices[0]];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const next of adjacentIndices(queue[cursor], map.width, map.height, map.wraps)) {
        if (!allowed.has(next) || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    assert.equal(reached.size, object.tileIndices.length, `${object.name} was not graph-contiguous`);
  }
  assert.ok([...regionCollections.values()].every((collections) => collections.size >= 2 && collections.size <= 4));
});

test("Eccentric world extremes materially compose frozen, Jurassic, arid, and arboreal worlds", () => {
  const maps = Object.fromEntries((["SNOWBALL", "JURASSIC", "ARRAKIS", "ARBOREA"] as const).map((eccentricExtreme) => {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "ECCENTRIC", preset: "MYTHIC_REGIONS", size: "DUEL", players: 2, cityStates: 0, eccentricExtreme, seed: "eccentric-extremes" });
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    return [eccentricExtreme, map];
  }));
  const landRatio = (map: Civ5Map, predicate: (tile: Civ5Tile) => boolean) => {
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    return land.filter(predicate).length / Math.max(1, land.length);
  };
  assert.ok(landRatio(maps.SNOWBALL, (tile) => tile.terrain === 5 || tile.terrain === 6) > 0.75);
  assert.ok(landRatio(maps.JURASSIC, (tile) => tile.terrain === 2 || tile.feature === 1) > 0.55);
  assert.ok(landRatio(maps.ARRAKIS, (tile) => tile.terrain === 4) > 0.75);
  assert.ok(landRatio(maps.ARBOREA, (tile) => tile.feature === 0 || tile.feature === 1) > 0.4);
});

test("Eccentric retains boundary ranges, river hierarchy, and geographic identities", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC",
    preset: "LIVING_WORLD",
    size: "DUEL",
    players: 2,
    cityStates: 0,
    waterPercent: 57,
    mountainPercent: 21,
    granularity: "HIGH",
    regionContrast: "EXTREME",
    riverDensity: "DENSE",
    rainfall: "WET",
    seed: "region-world-audit",
  });
  assert.ok((map.structure?.diagnostics.boundaryRangeEdges ?? 0) > 0);
  assert.ok((map.structure?.diagnostics.majorRiverCorridorTiles ?? 0) > 0);
  assert.ok((map.structure?.diagnostics.minorRiverCorridorTiles ?? 0) > 0);
  assert.ok((map.structure?.diagnostics.majorRiverTiles ?? 0) + (map.structure?.diagnostics.minorRiverTiles ?? 0) > 0);
  const kinds = new Set(map.structure?.objects.map((object) => object.kind));
  for (const kind of ["BAY", "CAPE", "STRAIT", "ARCHIPELAGO", "FOREST_REALM", "WASTE", "RIVER_BASIN"] as const) assert.ok(kinds.has(kind), `missing ${kind}`);
  assertRiverNetworks(map);
  assertMountainPassability(map);
  assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
});

test("all Eccentric landmass grammars remain exact, accessible, spaced, and Repair-clean", () => {
  for (const preset of MAP_PRESETS.filter((definition) => definition.engine === "ECCENTRIC")) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      engine: "ECCENTRIC",
      preset: preset.id,
      size: "DUEL",
      players: 4,
      cityStates: 4,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `eccentric-legality-${preset.id}`,
    });
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * preset.water / 100));
    assertStartSpacing(map);
    assertMountainPassability(map);
    assertRiverNetworks(map);
    const issues = buildRepairIssues(map).filter((issue) => issue.id !== "clean");
    assert.deepEqual(issues, [], `${preset.label} unexpectedly required Repair: ${issues.map((issue) => issue.detail).join("; ")}`);
  }
});

test("Eccentric climate logic and pole projection materially alter regional composition", () => {
  const common = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC" as const,
    preset: "MYTHIC_REGIONS" as const,
    size: "DUEL" as const,
    players: 2,
    cityStates: 0,
    seed: "eccentric-climate-logic",
  };
  const lawless = generateMap({ ...common, regionClimateLogic: "LAWLESS", climateRealism: false });
  const influenced = generateMap({ ...common, regionClimateLogic: "INFLUENCED", climateRealism: false });
  const ordered = generateMap({ ...common, regionClimateLogic: "ORDERED", climateRealism: true });
  const centered = generateMap({ ...common, regionClimateLogic: "ORDERED", climateRealism: true, projectionType: "POLAR_CENTERED" });
  const signature = (map: Civ5Map) => map.tiles.map((tile) => `${tile.terrain}:${tile.feature}`);
  assert.notDeepEqual(signature(lawless), signature(influenced));
  assert.notDeepEqual(signature(influenced), signature(ordered));
  assert.notDeepEqual(signature(ordered), signature(centered));
});

test("Excogitare, Eccentric, Physical, and Polis are distinct generation engines", () => {
  const families = new Map(MAP_PRESETS.map((preset) => [preset.id, preset.engine]));
  assert.equal(families.get("WILD_REGIONS"), "EXCOGITARE");
  assert.equal(families.get("LIVING_WORLD"), "ECCENTRIC");
  assert.equal(families.get("DYNAMIC_EARTH"), "PHYSICAL");
  assert.equal(families.get("IMPERIAL_RING"), "POLIS");
  assert.deepEqual(new Set(MAP_PRESETS.map((preset) => preset.engine)), new Set(["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"]));

  const common = { ...DEFAULT_GENERATION_OPTIONS, size: "DUEL" as const, players: 4, cityStates: 4, waterPercent: 55, mountainPercent: 20, seed: "four-engines" };
  const maps = [
    generateMap({ ...common, engine: "EXCOGITARE", preset: "WILD_REGIONS" }),
    generateMap({ ...common, engine: "ECCENTRIC", preset: "LIVING_WORLD" }),
    generateMap({ ...common, engine: "PHYSICAL", preset: "DYNAMIC_EARTH" }),
    generateMap({ ...common, engine: "POLIS", preset: "IMPERIAL_RING", polisConflictPattern: "RADIAL" }),
  ];
  assert.deepEqual(maps.map((map) => map.structure?.engine), ["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"]);
  assert.equal(new Set(maps.map((map) => map.tiles.map((tile) => `${tile.terrain}:${tile.elevation}`).join("|"))).size, 4);
  for (const map of maps) {
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.55));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
  }

  const legacy = generateMap({ ...common, engine: "FIELD", preset: "CONTINENTS" } as unknown as typeof common & { engine: "EXCOGITARE"; preset: "CONTINENTS" });
  assert.equal(legacy.generation?.engine, "EXCOGITARE");
});

test("Polis compiles a deterministic strategic graph before terrain and preserves every hard route", () => {
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "POLIS" as const,
    preset: "CONTESTED_HEARTLAND" as const,
    polisConflictPattern: "CROSSROADS" as const,
    polisSymmetry: "EQUIVALENT" as const,
    polisExpansionPressure: "IMMEDIATE" as const,
    polisNavalImportance: "BALANCED" as const,
    polisChokepointDensity: 82,
    polisContestedResourcePercent: 60,
    polisSafeRadius: 4,
    size: "SMALL" as const,
    players: 6,
    cityStates: 10,
    waterPercent: 28,
    mountainPercent: 24,
    strategicStartGuarantee: true,
    luxuryStartGuarantee: true,
    seed: "polis-strategic-compiler",
  };
  const stages: string[] = [];
  const first = generateMap(options, (stage) => stages.push(stage));
  const second = generateMap(options);
  const graph = first.structure?.strategicGraph;

  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.deepEqual(first.structure, second.structure);
  assert.equal(first.structure?.engine, "POLIS");
  assert.ok(graph);
  assert.equal(graph!.version, 1);
  assert.equal(graph!.pattern, "CROSSROADS");
  assert.equal(graph!.symmetry, "EQUIVALENT");
  assert.equal(graph!.nodes.filter((node) => node.kind === "MAJOR_START").length, 6);
  assert.equal(graph!.nodes.filter((node) => node.kind === "CITY_STATE").length, 10);
  assert.ok(graph!.nodes.some((node) => node.kind === "OBJECTIVE"));
  assert.ok(graph!.edges.length >= 6);
  assert.equal(first.startLocations.filter((start) => !start.cityState).length, 6);
  assert.equal(first.startLocations.filter((start) => start.cityState).length, 10);
  assert.ok(stages.includes("Compiling strategic graph and protected routes"));

  for (const index of graph!.protectedTileIndices) {
    assert.ok(first.tiles[index].terrain >= 2, `protected tile ${index} became water`);
    assert.ok(first.tiles[index].elevation < 2, `protected tile ${index} became a mountain`);
  }
  for (const edge of graph!.edges.filter((item) => item.kind !== "NAVAL")) {
    assert.ok(edge.tileIndices.length >= 2);
    for (let index = 1; index < edge.tileIndices.length; index += 1) {
      assert.ok(adjacentIndices(edge.tileIndices[index - 1], first.width, first.height, first.wraps).includes(edge.tileIndices[index]), `${edge.id} is discontinuous`);
    }
  }
  for (const start of first.startLocations.filter((item) => !item.cityState)) {
    const tile = first.tiles[start.y * first.width + start.x];
    assert.ok(tile.terrain >= 2 && tile.elevation < 2);
    assert.ok(graph!.nodes.some((node) => node.kind === "MAJOR_START" && node.owner === start.player && node.x === start.x && node.y === start.y));
  }

  const contested = new Set(first.structure!.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role !== "SAFE").flatMap((object) => object.tileIndices));
  assert.ok([...contested].some((index) => first.tiles[index].resource >= 5 && first.tiles[index].resource !== 255));
  const balance = analyzeMultiplayerBalance(first);
  assert.ok(balance.spread <= 12, `Polis equivalent starts spread by ${balance.spread} points`);
  assert.ok(["A", "B"].includes(balance.grade));
  assert.equal(validateCiv5Map(first).filter((issue) => issue.severity === "ERROR").length, 0);
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);
  assertMountainPassability(first);
  assertRiverNetworks(first);
});

test("Polis presets produce distinct audited conflict topologies", () => {
  const presets = [
    ["IMPERIAL_RING", "RADIAL"],
    ["OPPOSING_FRONTS", "OPPOSING_FRONTS"],
    ["CONTESTED_HEARTLAND", "CROSSROADS"],
    ["RIVAL_CONTINENTS", "RIVAL_CONTINENTS"],
  ] as const;
  const signatures = new Set<string>();
  for (const [preset, polisConflictPattern] of presets) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS", preset, polisConflictPattern, size: "DUEL", players: 4, cityStates: 6, waterPercent: preset === "RIVAL_CONTINENTS" ? 54 : 34, seed: `polis-${preset.toLowerCase()}` });
    assert.equal(map.structure?.strategicGraph?.pattern, polisConflictPattern);
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, 4);
    assert.equal(map.startLocations.filter((start) => start.cityState).length, 6);
    assert.equal(validateCiv5Map(map).filter((issue) => issue.severity === "ERROR").length, 0);
    signatures.add(map.tiles.map((tile) => `${tile.terrain}:${tile.elevation}`).join("|"));
  }
  assert.equal(signatures.size, presets.length);
});

test("Polis hard constraints survive ordinary sizes, wraps, and repeated seeds", () => {
  const patterns = [
    ["IMPERIAL_RING", "RADIAL", 34],
    ["OPPOSING_FRONTS", "OPPOSING_FRONTS", 28],
    ["CONTESTED_HEARTLAND", "CROSSROADS", 22],
    ["RIVAL_CONTINENTS", "RIVAL_CONTINENTS", 54],
  ] as const;
  const sizes = [
    ["DUEL", 4, 4],
    ["SMALL", 6, 8],
    ["STANDARD", 8, 12],
  ] as const;
  for (const [preset, polisConflictPattern, waterPercent] of patterns) {
    for (const [size, players, cityStates] of sizes) {
      const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS", preset, polisConflictPattern, size, players, cityStates, waterPercent, wrapType: preset === "CONTESTED_HEARTLAND" ? "NONE" : "EAST_WEST", seed: `polis-audit-${preset}-${size}` });
      const graph = map.structure?.strategicGraph;
      assert.ok(graph);
      assert.equal(map.startLocations.filter((start) => !start.cityState).length, players);
      assert.equal(map.startLocations.filter((start) => start.cityState).length, cityStates);
      assert.equal(validateCiv5Map(map).filter((issue) => issue.severity === "ERROR").length, 0);
      assert.ok(analyzeMultiplayerBalance(map).spread <= 18);
      for (const index of graph!.protectedTileIndices) assert.ok(map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
      assertMountainPassability(map);
    }
  }
});

test("Physical generation retains its nine-pass tectonic, climate, and drainage model", () => {
  const options = { ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL" as const, preset: "COLLIDING_PLATES" as const, size: "STANDARD" as const, players: 6, cityStates: 8, waterPercent: 54, mountainPercent: 23, plateActivity: "VIOLENT" as const, erosionStrength: "STRONG" as const, rainfall: "WET" as const, seed: "physical-architecture" };
  const stages: string[] = [];
  const first = generateMap(options, (stage) => stages.push(stage));
  const second = generateMap(options);
  assert.deepEqual(first.tiles, second.tiles);
  assert.equal(first.structure?.engine, "PHYSICAL");
  assert.ok(first.structure!.objects.filter((object) => object.kind === "TECTONIC_PLATE").length >= 6);
  assert.ok(first.structure!.objects.some((object) => object.kind === "CONTINENT"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "OCEAN_BASIN"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "CLIMATE_REGION"));
  assert.equal(first.structure!.objects.filter((object) => object.kind === "ATMOSPHERIC_CELL").length, 3);
  assert.ok(first.structure!.objects.some((object) => object.kind === "RAIN_SHADOW"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "GLACIAL_REGION"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "WATERSHED"));
  assert.equal(first.structure!.diagnostics.passes, 9);
  assert.ok(first.structure!.diagnostics.convergentTiles > 0);
  assert.ok(first.structure!.diagnostics.divergentTiles > 0);
  assert.ok(first.structure!.diagnostics.interiorAnnualRange > first.structure!.diagnostics.coastalAnnualRange);
  assert.ok(first.structure!.diagnostics.windwardPrecipitation > first.structure!.diagnostics.leewardPrecipitation * 2);
  assert.ok(first.structure!.diagnostics.drainageCorridorTiles > 0);
  assert.ok(first.structure!.mountainRanges.length > 0);
  assert.ok(first.structure!.riverSystems.some((river) => river.source !== undefined && river.outlet !== undefined));
  assert.ok(stages.includes("Simulating plates, circulation, climate, and watersheds"));
  assert.ok(stages.includes("Resolving drainage and rivers"));
  assertMountainPassability(first);
  assertRiverNetworks(first);
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);

  const quiet = generateMap({ ...options, plateActivity: "QUIET", erosionStrength: "LIGHT" });
  assert.notDeepEqual(quiet.tiles.map((tile) => tile.elevation), first.tiles.map((tile) => tile.elevation));
});

test("Physical circulation reverses with rotation and remains spatially smooth", () => {
  const common = { ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL" as const, preset: "DYNAMIC_EARTH" as const, size: "STANDARD" as const, players: 4, cityStates: 0, seed: "physical-rotation" };
  const prograde = generateMap({ ...common, physicalRotation: "PROGRADE" });
  const retrograde = generateMap({ ...common, physicalRotation: "RETROGRADE" });
  assert.ok(prograde.structure!.diagnostics.meanWindX < 0);
  assert.ok(retrograde.structure!.diagnostics.meanWindX > 0);
  assert.ok(prograde.structure!.diagnostics.maximumWindJump < 900);
  assert.ok(prograde.structure!.diagnostics.maximumTemperatureJump < 240);
  assert.notDeepEqual(prograde.tiles.map((tile) => [tile.terrain, tile.feature]), retrograde.tiles.map((tile) => [tile.terrain, tile.feature]));
});

test("Physical seasonality and maritime influence alter climate rather than metadata alone", () => {
  const common = { ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL" as const, preset: "DYNAMIC_EARTH" as const, size: "STANDARD" as const, players: 4, cityStates: 0, seed: "physical-climate-controls" };
  const maritime = generateMap({ ...common, physicalSeasonality: "MILD", physicalOceanInfluence: "STRONG" });
  const continental = generateMap({ ...common, physicalSeasonality: "EXTREME", physicalOceanInfluence: "WEAK" });
  assert.ok(continental.structure!.diagnostics.meanAnnualRange > maritime.structure!.diagnostics.meanAnnualRange * 2);
  assert.ok(continental.structure!.diagnostics.interiorAnnualRange > continental.structure!.diagnostics.coastalAnnualRange);
  assert.ok(maritime.structure!.diagnostics.meanMoisture > continental.structure!.diagnostics.meanMoisture);
  assert.notDeepEqual(maritime.tiles.map((tile) => [tile.terrain, tile.feature]), continental.tiles.map((tile) => [tile.terrain, tile.feature]));
});

test("all seven Physical presets have distinct, legal climate signatures", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL");
  assert.deepEqual(presets.map((preset) => preset.id), ["DYNAMIC_EARTH", "COLLIDING_PLATES", "ANCIENT_CRATONS", "ISLAND_ARC_EARTH", "SUPERCONTINENT_INTERIOR", "MONSOON_CONTINENTS", "ICEHOUSE_EARTH"]);
  const maps = presets.map((preset) => generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "PHYSICAL",
    preset: preset.id,
    size: "STANDARD",
    players: 4,
    cityStates: 0,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    seed: "physical-preset-signatures",
  }));
  const signatures = maps.map((map) => map.tiles.map((tile) => `${tile.terrain}${tile.elevation}${tile.feature}`).join(""));
  assert.equal(new Set(signatures).size, presets.length);
  for (const [index, map] of maps.entries()) {
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * presets[index].water / 100));
    assert.ok(map.structure!.diagnostics.atmosphericCells === 3);
    assert.ok(map.structure!.diagnostics.watersheds > 0);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
    assertRiverNetworks(map);
  }
  const byPreset = new Map(presets.map((preset, index) => [preset.id, maps[index]]));
  const island = byPreset.get("ISLAND_ARC_EARTH")!;
  const supercontinent = byPreset.get("SUPERCONTINENT_INTERIOR")!;
  const monsoon = byPreset.get("MONSOON_CONTINENTS")!;
  const icehouse = byPreset.get("ICEHOUSE_EARTH")!;
  const dynamic = byPreset.get("DYNAMIC_EARTH")!;
  assert.ok(island.structure!.diagnostics.meanMoisture > supercontinent.structure!.diagnostics.meanMoisture);
  assert.ok(island.structure!.diagnostics.meanAnnualRange < supercontinent.structure!.diagnostics.meanAnnualRange);
  assert.ok(monsoon.tiles.filter((tile) => tile.feature === 1).length > dynamic.tiles.filter((tile) => tile.feature === 1).length);
  assert.ok(icehouse.tiles.filter((tile) => tile.terrain === 6).length > dynamic.tiles.filter((tile) => tile.terrain === 6).length);
});

test("Physical preserves exact sea level and reports waterless drainage honestly", () => {
  for (const waterPercent of [0, 35, 55, 75, 90]) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size: "DUEL", players: 2, cityStates: 0, waterPercent, seed: `physical-water-${waterPercent}` });
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * waterPercent / 100));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
    if (waterPercent === 0) {
      assert.equal(map.structure!.diagnostics.outletBasins, 0);
      assert.equal(map.structure!.diagnostics.drainageCorridorTiles, 0);
      assert.equal(map.structure!.riverSystems.length, 0);
    } else {
      assert.ok(map.structure!.diagnostics.outletBasins > 0);
    }
  }
});

test("Physical supports every safe size, wrap mode, and climate projection", () => {
  for (const [index, size] of SAFE_MAP_SIZES.entries()) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size, wrapType: index % 2 ? "NONE" : "EAST_WEST", players: 2, cityStates: 0, waterPercent: 55, seed: `physical-size-${size.toLowerCase()}` });
    const dimensions = resolveMapDimensions(size, "STANDARD");
    assert.deepEqual([map.width, map.height], [dimensions.width, dimensions.height]);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.55));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
  }
  const projected = (["NORTH_SOUTH", "POLAR_CENTERED", "EQUATORIAL_POLE"] as const).map((projectionType) => generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size: "DUEL", projectionType, players: 2, cityStates: 0, seed: "physical-projections" }));
  assert.equal(new Set(projected.map((map) => map.tiles.map((tile) => `${tile.terrain}${tile.feature}`).join(""))).size, 3);
  for (const map of projected) {
    assert.equal(map.structure!.diagnostics.atmosphericCells, 3);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
  }
});

test("Eccentric presets remain valid through extreme Pin and String geometries", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "ECCENTRIC");
  assert.deepEqual(presets.map((preset) => preset.id), ["LIVING_WORLD", "TECTONIC_CONTINENTS", "GREAT_WATERSHEDS", "SHATTERED_BASINS", "MYTHIC_REGIONS", "ENCIRCLING_LANDS", "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO"]);
  for (const [index, geometry] of (["PIN", "STRING"] as const).entries()) {
    const preset = presets[index === 0 ? 2 : 3];
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      engine: preset.engine,
      preset: preset.id,
      size: "DUEL",
      geometry,
      players: 2,
      cityStates: 0,
      waterPercent: 44,
      seed: `region-${geometry.toLowerCase()}`,
    });
    assert.equal(map.tiles.length, map.width * map.height);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.44));
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, 2);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
  }
  for (const geometry of ["PIN", "STRING"] as const) {
    const physical = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size: "DUEL", geometry, players: 2, cityStates: 0, waterPercent: 44, seed: `physical-${geometry.toLowerCase()}` });
    assert.equal(physical.tiles.length, physical.width * physical.height);
    assert.equal(physical.tiles.filter((tile) => tile.terrain < 2).length, Math.round(physical.tiles.length * 0.44));
    assert.deepEqual(buildRepairIssues(physical).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(physical);
  }
  const shattered = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "ECCENTRIC", preset: "SHATTERED_BASINS", size: "STANDARD", players: 2, cityStates: 0, seed: "objects-SHATTERED_BASINS" });
  const kinds = new Set(shattered.structure?.objects.map((object) => object.kind));
  for (const kind of (["SUBREGION", "POLYGON", "SUPERPOLYGON", "CONTINENT", "OCEAN_BASIN", "INLAND_SEA", "LAKE", "RIFT", "CLIMATE_REGION"] as const)) assert.ok(kinds.has(kind), `missing ${kind}`);
});

test("generation history retains the newest 30 exact map snapshots", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, style: "FANTASTICAL", seed: "history-source" });
  let history: GenerationHistoryEntry[] = [];
  for (let id = 1; id <= 35; id += 1) history = addGenerationToHistory(history, generated, id, { parentId: id === 1 ? undefined : id - 1, operation: id % 2 ? "GENERATE" : "SELECTIVE_CLIMATE", createdAt: `2026-07-17T00:00:${String(id).padStart(2, "0")}.000Z` });

  assert.equal(history.length, MAX_GENERATION_HISTORY);
  assert.equal(history[0].id, 35);
  assert.equal(history.at(-1)?.id, 6);
  assert.equal(history[0].parentId, 34);
  assert.equal(history[0].operation, "GENERATE");
  assert.equal(history[1].operation, "SELECTIVE_CLIMATE");
  assert.equal(history[0].createdAt, "2026-07-17T00:00:35.000Z");
  const restored = restoreGeneration(history[0]);
  restored.tiles[0].terrain = 99;
  restored.generation!.dominantTerrains.push("DESERT");
  restored.structure!.objects[0].tileIndices[0] = 999_999;
  assert.notEqual(history[0].map.tiles[0].terrain, 99);
  assert.notDeepEqual(history[0].map.generation?.dominantTerrains, restored.generation?.dominantTerrains);
  assert.notEqual(history[0].map.structure?.objects[0].tileIndices[0], 999_999);
  assert.equal(history[0].map.generation?.style, "FANTASTICAL");
});

test("geometry choices preserve the size budget while changing the aspect ratio", () => {
  assert.deepEqual(resolveMapDimensions("STANDARD", "STANDARD"), { width: 80, height: 52 });
  const tall = resolveMapDimensions("STANDARD", "TALL");
  const wide = resolveMapDimensions("STANDARD", "WIDE");
  const needle = resolveMapDimensions("STANDARD", "NEEDLE");
  const ribbon = resolveMapDimensions("STANDARD", "RIBBON");
  const pin = resolveMapDimensions("STANDARD", "PIN");
  const string = resolveMapDimensions("STANDARD", "STRING");
  const square = resolveMapDimensions("STANDARD", "SQUARE");
  assert.ok(tall.height / tall.width > 2);
  assert.ok(wide.width / wide.height > 3);
  assert.ok(needle.height / needle.width > 10);
  assert.ok(ribbon.width / ribbon.height > 10);
  assert.ok(pin.height / pin.width > 30);
  assert.ok(string.width / string.height > 30);
  assert.ok(pin.height / pin.width > needle.height / needle.width);
  assert.ok(string.width / string.height > ribbon.width / ribbon.height);
  assert.equal(square.width, square.height);
  for (const dimensions of [tall, wide, needle, ribbon, pin, string, square]) {
    assert.ok(Math.abs(dimensions.width * dimensions.height - 80 * 52) / (80 * 52) < 0.03);
  }

  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", geometry: "TALL", seed: "vertical-world" });
  assert.equal(generated.width, resolveMapDimensions("DUEL", "TALL").width);
  assert.equal(generated.height, resolveMapDimensions("DUEL", "TALL").height);
  const extreme = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", geometry: "RIBBON", seed: "horizontal-world" });
  assert.ok(extreme.width / extreme.height > 10);
  assert.equal(extreme.tiles.length, extreme.width * extreme.height);
});

test("source-backed extended tile budgets retain exact dimensions and round-trip", () => {
  const extreme = MAP_SIZES.find((size) => size.id === "EXTREME")!;
  const colossal = MAP_SIZES.find((size) => size.id === "COLOSSAL")!;
  assert.deepEqual({ width: extreme.width, height: extreme.height, tiles: extreme.width * extreme.height }, { width: 180, height: 94, tiles: 16_920 });
  assert.deepEqual({ width: colossal.width, height: colossal.height, tiles: colossal.width * colossal.height }, { width: 170, height: 110, tiles: 18_700 });
  assert.equal(isGameBreakingMapSize("HUGE"), false);
  assert.equal(isGameBreakingMapSize("EXTREME"), true);
  assert.equal(isGameBreakingMapSize("COLOSSAL"), true);

  const startedAt = performance.now();
  for (const size of ["EXTREME", "COLOSSAL"] as const) {
    const options = { ...DEFAULT_GENERATION_OPTIONS, engine: "EXCOGITARE" as const, preset: "CONTINENTS" as const, size, players: 2, cityStates: 0, seed: `round-trip-${size.toLowerCase()}` };
    const generated = generateMap(options);
    const dimensions = resolveMapDimensions(size, "STANDARD");
    assert.equal(generated.width, dimensions.width);
    assert.equal(generated.height, dimensions.height);
    assert.equal(generated.tiles.length, dimensions.width * dimensions.height);
    const parsed = parseCiv5Map(serializeCiv5Map(generated), `${size}.Civ5Map`);
    assert.equal(parsed.width, dimensions.width);
    assert.equal(parsed.height, dimensions.height);
    assert.equal(parsed.tiles.length, generated.tiles.length);
    assert.equal(parsed.worldSize, size);
    assert.deepEqual(parsed.tiles, generated.tiles);
  }
  assert.ok(performance.now() - startedAt < 30_000, "both extended maps should generate and round-trip within 30 seconds");

  const deterministicOptions = { ...DEFAULT_GENERATION_OPTIONS, size: "EXTREME" as const, players: 2, cityStates: 0, seed: "extended-determinism" };
  assert.deepEqual(generateMap(deterministicOptions).tiles, generateMap(deterministicOptions).tiles);
});

test("Randomise produces complete valid settings and wrap choices control export geography", () => {
  let state = 0x12345678;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const wrapTypes = new Set<string>();
  const geometries = new Set<string>();
  const gameBreakingGeometries = new Set<string>();
  const sizes = new Set<string>();
  const gameBreakingSizes = new Set<string>();
  const engines = new Set<string>();
  const styles = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const options = randomGenerationOptions(random);
    wrapTypes.add(options.wrapType);
    geometries.add(options.geometry);
    sizes.add(options.size);
    engines.add(options.engine);
    styles.add(options.style);
    assert.ok(options.waterPercent >= 0 && options.waterPercent <= 90);
    assert.ok(options.mountainPercent >= 0 && options.mountainPercent <= 38);
    assert.ok(options.players >= 2 && options.players <= 22);
    assert.ok(options.cityStates >= 0 && options.cityStates <= 41);
    assert.ok(options.seed.length >= 10);
    if (options.modifier === "STRATEGIC_DEPTH") assert.ok(options.mountainPercent >= 22);
    if (options.modifier === "DOOMSDAY" || options.style === "BRUTAL") assert.ok(options.mountainPercent >= 18);
  }
  for (let index = 0; index < 240; index += 1) {
    const options = randomGenerationOptions(random, true);
    gameBreakingGeometries.add(options.geometry);
    gameBreakingSizes.add(options.size);
  }
  assert.deepEqual(wrapTypes, new Set(["PRESET", "EAST_WEST", "NONE"]));
  assert.deepEqual(geometries, new Set(SAFE_MAP_GEOMETRIES));
  assert.deepEqual(sizes, new Set(SAFE_MAP_SIZES));
  assert.deepEqual(gameBreakingGeometries, new Set([...SAFE_MAP_GEOMETRIES, ...GAME_BREAKING_GEOMETRIES]));
  assert.deepEqual(gameBreakingSizes, new Set([...SAFE_MAP_SIZES, ...GAME_BREAKING_MAP_SIZES]));
  assert.deepEqual(engines, new Set(["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"]));
  assert.deepEqual(styles, new Set(["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"]));

  const eastWest = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "INLAND_SEAS", size: "DUEL", wrapType: "EAST_WEST" });
  const flat = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "CONTINENTS", size: "DUEL", wrapType: "NONE" });
  const presetFlat = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "LABYRINTH", size: "DUEL", wrapType: "PRESET" });
  assert.equal(eastWest.wraps, true);
  assert.equal(flat.wraps, false);
  assert.equal(presetFlat.wraps, false);
});

test("Create output passes Repair correctness checks across styles, presets, and geometry", () => {
  const styles = ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const;
  const presets = ["CONTINENTS", "ARCHIPELAGO", "INLAND_SEAS", "WILD_REGIONS"] as const;
  const geometries = ["STANDARD", "TALL", "RIBBON", "NEEDLE"] as const;
  for (let index = 0; index < 16; index += 1) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      size: "DUEL",
      players: 2,
      cityStates: 4,
      style: styles[index % styles.length],
      preset: presets[Math.floor(index / 4) % presets.length],
      geometry: geometries[(index * 3) % geometries.length],
      wonderCount: 10,
      seed: `create-correctness-${index}`,
    });
    const issues = buildRepairIssues(map).filter((issue) => issue.id !== "clean");
    assert.deepEqual(issues, [], `${map.name} unexpectedly required Repair: ${issues.map((issue) => issue.detail).join("; ")}`);
    for (const tile of map.tiles) {
      assert.equal(featurePlacementVerdict(map, tile).valid, true);
      assert.equal(resourcePlacementVerdict(map, tile).valid, true);
      assert.equal(wonderPlacementVerdict(map, tile).valid, true);
      assert.equal(tile.wonder !== 255 && tile.resource !== 255, false, "a generated wonder overlapped a resource");
      assert.equal(Boolean(tile.improvement) && (tile.terrain < 2 || tile.elevation === 2), false, "a generated site occupied impassable terrain");
    }
  }
});

test("generation styles honor requested water and mountain percentages", () => {
  for (const style of ["REALISTIC", "FANTASTICAL", "MUNDANE"] as const) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      size: "DUEL",
      players: 4,
      style,
      waterPercent: 63,
      mountainPercent: 19,
      seed: `distribution-${style}`,
    });
    const water = map.tiles.filter((tile) => tile.terrain < 2).length / map.tiles.length * 100;
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    const mountains = land.filter((tile) => tile.elevation === 2).length / land.length * 100;
    assert.ok(Math.abs(water - 63) < 1, `${style} water was ${water}`);
    assert.ok(Math.abs(mountains - 19) < 1.5, `${style} mountains were ${mountains}`);
  }
});

test("Strategic Depth enforces mountain systems and Legendary Start adds local riches", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "DUEL",
    players: 4,
    modifier: "STRATEGIC_DEPTH",
    mountainPercent: 5,
    startQuality: "LEGENDARY",
    seed: "deep-legend",
  });
  const land = map.tiles.filter((tile) => tile.terrain >= 2);
  const mountains = land.filter((tile) => tile.elevation === 2).length / land.length * 100;
  assert.ok(mountains >= 20);

  const nearby = (originX: number, originY: number) => {
    const visited = new Set([`${originX},${originY}`]);
    let frontier: Array<[number, number]> = [[originX, originY]];
    const indices = new Set<number>();
    for (let radius = 0; radius < 2; radius += 1) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        const offsets = y % 2 === 0
          ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
          : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
        for (const [dx, dy] of offsets) {
          const nx = (x + dx + map.width) % map.width;
          const ny = y + dy;
          const key = `${nx},${ny}`;
          if (ny < 0 || ny >= map.height || visited.has(key)) continue;
          visited.add(key);
          next.push([nx, ny]);
          indices.add(ny * map.width + nx);
        }
      }
      frontier = next;
    }
    return [...indices].filter((index) => map.tiles[index].resource !== 255).length;
  };
  for (const start of map.startLocations.filter((item) => !item.cityState)) assert.ok(nearby(start.x, start.y) >= 5);
});

test("zero-water worlds remain traversable through mountain passes", () => {
  for (const style of ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      size: "DUEL",
      style,
      modifier: "STRATEGIC_DEPTH",
      waterPercent: 0,
      mountainPercent: 35,
      seed: `all-land-${style}`,
    });
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, 0);
    assertMountainPassability(map);
  }
  const physical = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL", preset: "COLLIDING_PLATES", size: "DUEL", players: 2, cityStates: 0, waterPercent: 0, mountainPercent: 35, plateActivity: "VIOLENT", seed: "all-land-physical" });
  assert.equal(physical.tiles.filter((tile) => tile.terrain < 2).length, 0);
  assertMountainPassability(physical);
  assert.deepEqual(buildRepairIssues(physical).filter((issue) => issue.id !== "clean"), []);
});

test("dominant terrain choices visibly control the generated mix", () => {
  const desert = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    style: "REALISTIC",
    waterPercent: 35,
    dominantTerrains: ["DESERT"],
    seed: "dominant-desert",
  });
  const desertLand = desert.tiles.filter((tile) => tile.terrain >= 2);
  const desertCount = desertLand.filter((tile) => tile.terrain === 4).length;
  assert.ok(desertCount / desertLand.length > 0.5);

  const temperate = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    style: "REALISTIC",
    waterPercent: 35,
    dominantTerrains: ["GRASSLAND", "PLAINS"],
    seed: "dominant-temperate",
  });
  const temperateLand = temperate.tiles.filter((tile) => tile.terrain >= 2);
  const selectedCount = temperateLand.filter((tile) => tile.terrain === 2 || tile.terrain === 3).length;
  assert.ok(selectedCount / temperateLand.length > 0.7);
});

test("realistic terrain creates west-to-east rain shadows and softened latitude transitions", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    preset: "PANGAEA",
    style: "REALISTIC",
    waterPercent: 25,
    mountainPercent: 28,
    seed: "rain-shadow-audit",
  });
  const wetness = (terrain: number) => terrain === 2 ? 1 : terrain === 3 ? 0.55 : terrain === 5 ? 0.4 : terrain === 6 ? 0.25 : 0.05;
  const shadowDifferences: number[] = [];
  for (let y = 3; y < map.height - 3; y += 1) {
    let x = 4;
    while (x < map.width - 4) {
      if (map.tiles[y * map.width + x].elevation !== 2) {
        x += 1;
        continue;
      }
      const westEdge = x;
      while (x < map.width - 4 && map.tiles[y * map.width + x].elevation === 2) x += 1;
      const eastEdge = x - 1;
      const west = [westEdge - 3, westEdge - 2, westEdge - 1].map((column) => map.tiles[y * map.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      const east = [eastEdge + 1, eastEdge + 2, eastEdge + 3].map((column) => map.tiles[y * map.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      if (west.length >= 2 && east.length >= 2) {
        shadowDifferences.push(west.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / west.length - east.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / east.length);
      }
    }
  }
  assert.ok(shadowDifferences.length > 20);
  assert.ok(shadowDifferences.reduce((sum, difference) => sum + difference, 0) / shadowDifferences.length > 0.1);

  const allLand = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "STANDARD", style: "REALISTIC", waterPercent: 0, seed: "soft-latitudes" });
  const transitionRows = [4, 8, 12, allLand.height - 13, allLand.height - 9, allLand.height - 5];
  for (const row of transitionRows) {
    const terrains = new Set(allLand.tiles.slice(row * allLand.width, (row + 1) * allLand.width).map((tile) => tile.terrain));
    assert.ok(terrains.size >= 2, `latitude row ${row} collapsed into one sharp biome band`);
  }
});

test("Eccentric Ordered climates retain west-to-east rain shadows", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC",
    preset: "TECTONIC_CONTINENTS",
    size: "STANDARD",
    players: 4,
    cityStates: 4,
    style: "REALISTIC",
    climateRealism: true,
    regionClimateLogic: "ORDERED",
    waterPercent: 30,
    mountainPercent: 28,
    seed: "region-rain-audit",
  });
  const wetness = (terrain: number) => terrain === 2 ? 1 : terrain === 3 ? 0.55 : terrain === 5 ? 0.4 : terrain === 6 ? 0.25 : 0.05;
  const differences: number[] = [];
  for (let y = 3; y < map.height - 3; y += 1) {
    let x = 4;
    while (x < map.width - 4) {
      if (map.tiles[y * map.width + x].elevation !== 2) { x += 1; continue; }
      const westEdge = x;
      while (x < map.width - 4 && map.tiles[y * map.width + x].elevation === 2) x += 1;
      const eastEdge = x - 1;
      const west = [westEdge - 3, westEdge - 2, westEdge - 1].map((column) => map.tiles[y * map.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      const east = [eastEdge + 1, eastEdge + 2, eastEdge + 3].map((column) => map.tiles[y * map.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      if (west.length >= 2 && east.length >= 2) differences.push(west.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / west.length - east.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / east.length);
    }
  }
  assert.ok(differences.length > 40);
  assert.ok(differences.reduce((sum, difference) => sum + difference, 0) / differences.length > 0.12);
});

test("generated rivers form continuous mountain-to-water drainage networks", () => {
  for (const style of ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const) {
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      size: "STANDARD",
      style,
      rainfall: "WET",
      waterPercent: 45,
      mountainPercent: 22,
      seed: `river-network-${style}`,
    });
    assertRiverNetworks(map);
  }
});

test("Brutal generation is scarce, mountainous, competitive, and still accessible", () => {
  const brutal = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    style: "BRUTAL",
    balance: "TOURNAMENT",
    waterPercent: 42,
    mountainPercent: 18,
    seed: "brutal-competition",
  });
  const land = brutal.tiles.filter((tile) => tile.terrain >= 2);
  const mountainShare = land.filter((tile) => tile.elevation === 2).length / land.length;
  const resourceShare = brutal.tiles.filter((tile) => tile.resource !== 255).length / brutal.tiles.length;
  assert.ok(mountainShare >= 0.17);
  assert.ok(resourceShare < 0.075);
  assert.equal(brutal.startLocations.filter((start) => !start.cityState).length, DEFAULT_GENERATION_OPTIONS.players);
  assertMountainPassability(brutal);
});

test("generated city states are distinct non-playable starts", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 4, cityStates: 7, seed: "minor-powers" });
  const majors = generated.startLocations.filter((start) => !start.cityState);
  const cityStates = generated.startLocations.filter((start) => start.cityState);
  assert.equal(majors.length, 4);
  assert.equal(cityStates.length, 7);
  assert.equal(new Set(generated.startLocations.map((start) => `${start.x},${start.y}`)).size, 11);
  for (const [index, start] of cityStates.entries()) {
    assert.equal(start.player, 4 + index);
    assert.equal(start.playable, false);
    assert.equal(start.team, 255);
    assert.equal(generated.tiles[start.y * generated.width + start.x].elevation < 2, true);
  }
});

test("generated maps serialize to a readable Civ5Map geography file", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, seed: "round-trip" });
  const parsed = parseCiv5Map(serializeCiv5Map(generated), "fallback.Civ5Map");

  assert.equal(parsed.name, generated.name);
  assert.equal(parsed.description, generated.description);
  assert.equal(parsed.worldSize, "DUEL");
  assert.equal(parsed.width, generated.width);
  assert.equal(parsed.height, generated.height);
  assert.equal(parsed.scenarioPlayerSlots, generated.startLocations.filter((start) => !start.cityState).length);
  assert.equal(parsed.scenarioCityStateSlots, generated.startLocations.filter((start) => start.cityState).length);
  assert.equal(parsed.startLocations.length, generated.startLocations.length);
  assert.deepEqual(parsed.startLocations.map((start) => [start.x, start.y, start.cityState]), generated.startLocations.map((start) => [start.x, start.y, start.cityState]));
  assertStartSpacing(parsed);
  assert.deepEqual(parsed.tiles, generated.tiles);
});

test("Doomsday adds restrained fallout, ruined cities, and surviving road fragments", () => {
  const generated = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    modifier: "DOOMSDAY",
    barbarianAbundance: "NONE",
    ruinAbundance: "NONE",
    seed: "doomsday-infrastructure",
  });
  const land = generated.tiles.filter((tile) => tile.terrain >= 2);
  const fallout = generated.tiles.filter((tile) => generated.features[tile.feature]?.includes("FALLOUT"));
  const cityRuins = generated.tiles.filter((tile) => tile.improvement === "IMPROVEMENT_CITY_RUINS");
  const roads = generated.tiles.filter((tile) => tile.route === "ROUTE_ROAD");
  assert.ok(fallout.length / land.length > 0.01 && fallout.length / land.length < 0.05, `fallout covered ${(fallout.length / land.length * 100).toFixed(1)}% of land`);
  assert.ok(cityRuins.length >= 2, "Doomsday did not place ruined cities");
  assert.ok(roads.length > cityRuins.length, "Doomsday did not form surviving road fragments");
  for (const tile of cityRuins) assert.equal(tile.route, "ROUTE_ROAD");
  for (const tile of roads) assert.ok(tile.terrain >= 2 && tile.elevation < 2, "a Doomsday road crossed impassable terrain");
  assert.deepEqual(buildRepairIssues(generated).filter((issue) => issue.id !== "clean"), []);

  const ordinary = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", modifier: "NONE", seed: "no-doomsday-infrastructure" });
  assert.equal(ordinary.tiles.some((tile) => tile.improvement === "IMPROVEMENT_CITY_RUINS" || tile.route), false);
});

test("content rules place wonders, guaranteed resources, camps, and ruins", () => {
  const generated = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    players: 6,
    cityStates: 8,
    wonderCount: 7,
    wonderMinSpacing: 6,
    strategicStartGuarantee: true,
    luxuryStartGuarantee: true,
    barbarianAbundance: "RAGING",
    ruinAbundance: "RAGING",
    seed: "content-rules",
  });
  assert.equal(generated.tiles.filter((tile) => tile.wonder !== 255).length, 7);
  assert.ok(generated.tiles.filter((tile) => tile.improvement === "IMPROVEMENT_BARBARIAN_CAMP").length > 10);
  assert.ok(generated.tiles.filter((tile) => tile.improvement === "IMPROVEMENT_GOODY_HUT").length > 10);
  for (const start of generated.startLocations.filter((item) => !item.cityState)) {
    const nearby = generated.tiles.filter((_tile, index) => {
      const x = index % generated.width;
      const y = Math.floor(index / generated.width);
      return Math.abs(x - start.x) <= 4 && Math.abs(y - start.y) <= 4;
    });
    assert.ok(nearby.some((tile) => tile.resource >= 5 && tile.resource <= 10));
    assert.ok(nearby.some((tile) => tile.resource >= 11 && tile.resource !== 255));
  }
});

test("analysis reports player balance and export validation problems", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 4, seed: "analyze-this" });
  const report = analyzeMultiplayerBalance(generated);
  assert.equal(report.players.length, 4);
  assert.match(report.summary, /major starts/);
  const broken = { ...generated, players: 7, tiles: generated.tiles.map((tile) => ({ ...tile })) };
  broken.tiles[0].river = 128;
  const issues = validateCiv5Map(broken);
  assert.ok(issues.some((issue) => issue.category === "RIVERS" && issue.severity === "ERROR"));
  assert.ok(issues.some((issue) => issue.category === "SCENARIO" && issue.severity === "WARNING"));
});

test("Excogitare Lua exports retain safe native generation settings", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", seed: "lua-round-trip" });
  const source = createLuaMapScript(generated);
  const imported = mapFromLuaScript(source).map;

  assert.match(source, /bit\.band\(river, 8\).*FLOWDIRECTION_NORTH.*FLOWDIRECTION_SOUTH/);
  assert.match(source, /bit\.band\(river, 16\).*FLOWDIRECTION_NORTHEAST.*FLOWDIRECTION_SOUTHWEST/);
  assert.match(source, /bit\.band\(river, 32\).*FLOWDIRECTION_NORTHWEST.*FLOWDIRECTION_SOUTHEAST/);
  assert.equal(imported.source, "script");
  assert.deepEqual(imported.generation, generated.generation);
  assert.deepEqual(imported.tiles, generated.tiles);
});
