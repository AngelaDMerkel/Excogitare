import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, parseCiv5MapForRepair, serializeCiv5Map, updateCiv5Map, updateCiv5MapMetadata, type Civ5Map, type Civ5Tile } from "../lib/civ5-map.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, MAP_PRESETS, randomGenerationOptions, resolveMapDimensions } from "../lib/map-generator.ts";
import { createLuaMapScript, mapExportBaseName, mapFromLuaScript } from "../lib/map-script.ts";
import { analyzeMultiplayerBalance, validateCiv5Map } from "../lib/map-analysis.ts";
import { addGenerationToHistory, MAX_GENERATION_HISTORY, restoreGeneration, type GenerationHistoryEntry } from "../lib/generation-history.ts";
import { applyRepairIssues, buildRepairIssues } from "../lib/map-repair.ts";
import { featurePlacementVerdict, isPassableLand, resourcePlacementVerdict, wonderPlacementVerdict } from "../lib/civ5-rules.ts";
import { buildPoliticalOwnership, hasPoliticalLayer, politicalColors } from "../lib/political-map.ts";
import { fitViewport, minimumViewportZoom } from "../lib/map-viewport.ts";

const encoder = new TextEncoder();

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
  let riverEdges = 0;
  const addTile = (vertex: string, tile: number) => {
    if (!vertexTiles.has(vertex)) vertexTiles.set(vertex, new Set());
    vertexTiles.get(vertex)!.add(tile);
  };
  const addRiverEdge = (a: string, b: string) => {
    if (!riverNeighbors.has(a)) riverNeighbors.set(a, new Set());
    if (!riverNeighbors.has(b)) riverNeighbors.set(b, new Set());
    riverNeighbors.get(a)!.add(b);
    riverNeighbors.get(b)!.add(a);
    riverEdges += 1;
  };

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const owner = y * map.width + x;
      const centerX = x * 2 + (y & 1);
      const centerY = y * 3;
      const definitions = y % 2 === 0
        ? [
            { bit: 1, dx: -1, dy: 0, a: `${centerX - 1},${centerY + 1}`, b: `${centerX - 1},${centerY - 1}` },
            { bit: 2, dx: -1, dy: -1, a: `${centerX - 1},${centerY - 1}`, b: `${centerX},${centerY - 2}` },
            { bit: 4, dx: 0, dy: -1, a: `${centerX},${centerY - 2}`, b: `${centerX + 1},${centerY - 1}` },
          ]
        : [
            { bit: 1, dx: -1, dy: 0, a: `${centerX - 1},${centerY + 1}`, b: `${centerX - 1},${centerY - 1}` },
            { bit: 2, dx: 0, dy: -1, a: `${centerX - 1},${centerY - 1}`, b: `${centerX},${centerY - 2}` },
            { bit: 4, dx: 1, dy: -1, a: `${centerX},${centerY - 2}`, b: `${centerX + 1},${centerY - 1}` },
          ];
      for (const definition of definitions) {
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
          addRiverEdge(definition.a, definition.b);
        }
      }
    }
  }

  assert.ok(riverEdges > 0, "the generated map did not contain a river network");
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
  }
}

function riverEdgeRecords(map: Civ5Map) {
  const records: Array<{ owner: number; neighbor: number; bit: 1 | 2 | 4; a: string; b: string }> = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const owner = y * map.width + x;
      const centerX = x * 2 + (y & 1);
      const centerY = y * 3;
      const definitions = y % 2 === 0
        ? [
            { bit: 1 as const, dx: -1, dy: 0, a: `${centerX - 1},${centerY + 1}`, b: `${centerX - 1},${centerY - 1}` },
            { bit: 2 as const, dx: -1, dy: -1, a: `${centerX - 1},${centerY - 1}`, b: `${centerX},${centerY - 2}` },
            { bit: 4 as const, dx: 0, dy: -1, a: `${centerX},${centerY - 2}`, b: `${centerX + 1},${centerY - 1}` },
          ]
        : [
            { bit: 1 as const, dx: -1, dy: 0, a: `${centerX - 1},${centerY + 1}`, b: `${centerX - 1},${centerY - 1}` },
            { bit: 2 as const, dx: 0, dy: -1, a: `${centerX - 1},${centerY - 1}`, b: `${centerX},${centerY - 2}` },
            { bit: 4 as const, dx: 1, dy: -1, a: `${centerX},${centerY - 2}`, b: `${centerX + 1},${centerY - 1}` },
          ];
      for (const definition of definitions) {
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

  view.setUint8(0, 0x1c);
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

  view.setUint8(0, 0x1c);
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
});

test("parses scenario political ownership, player colors, and routes", () => {
  const parsed = parseCiv5Map(createScenarioMap(), "political.Civ5Map");
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
  const truncated = serialized.slice(0, serialized.byteLength - 8);
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

test("region-built generation is deterministic, exact, legal, and geographically structured", () => {
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "REGION_GRAPH" as const,
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
  assert.match(first.description, /Region-Graph engine/);
  assert.equal(first.startLocations.filter((start) => !start.cityState).length, 4);
  assert.equal(first.startLocations.filter((start) => start.cityState).length, 6);
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);
  assertMountainPassability(first);
  assertRiverNetworks(first);
  assert.equal(first.structure?.engine, "REGION_GRAPH");
  assert.ok(first.structure!.objects.some((object) => object.kind === "SUBREGION"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "POLYGON"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "SUPERPOLYGON"));
  assert.ok(first.structure!.objects.some((object) => object.kind === "CLIMATE_REGION"));
  assert.ok(first.structure!.mountainRanges.length > 0);
  assert.ok(first.structure!.riverSystems.length > 0);
});

test("Excogitare, Region-Graph, and Physical are distinct generation engines", () => {
  const families = new Map(MAP_PRESETS.map((preset) => [preset.id, preset.engine]));
  assert.equal(families.get("WILD_REGIONS"), "EXCOGITARE");
  assert.equal(families.get("LIVING_WORLD"), "REGION_GRAPH");
  assert.equal(families.get("DYNAMIC_EARTH"), "PHYSICAL");
  assert.deepEqual(new Set(MAP_PRESETS.map((preset) => preset.engine)), new Set(["EXCOGITARE", "REGION_GRAPH", "PHYSICAL"]));

  const common = { ...DEFAULT_GENERATION_OPTIONS, size: "DUEL" as const, players: 4, cityStates: 4, waterPercent: 55, mountainPercent: 20, seed: "three-engines" };
  const maps = [
    generateMap({ ...common, engine: "EXCOGITARE", preset: "WILD_REGIONS" }),
    generateMap({ ...common, engine: "REGION_GRAPH", preset: "LIVING_WORLD" }),
    generateMap({ ...common, engine: "PHYSICAL", preset: "DYNAMIC_EARTH" }),
  ];
  assert.deepEqual(maps.map((map) => map.structure?.engine), ["EXCOGITARE", "REGION_GRAPH", "PHYSICAL"]);
  assert.equal(new Set(maps.map((map) => map.tiles.map((tile) => `${tile.terrain}:${tile.elevation}`).join("|"))).size, 3);
  for (const map of maps) {
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.55));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
    assertMountainPassability(map);
  }

  const legacy = generateMap({ ...common, engine: "FIELD", preset: "CONTINENTS" } as unknown as typeof common & { engine: "EXCOGITARE"; preset: "CONTINENTS" });
  assert.equal(legacy.generation?.engine, "EXCOGITARE");
});

test("Physical generation retains plates, boundaries, erosion controls, climate, and drainage", () => {
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
  assert.ok(first.structure!.diagnostics.convergentTiles > 0);
  assert.ok(first.structure!.diagnostics.divergentTiles > 0);
  assert.ok(first.structure!.mountainRanges.length > 0);
  assert.ok(first.structure!.riverSystems.some((river) => river.source !== undefined && river.outlet !== undefined));
  assert.ok(stages.includes("Simulating tectonic plates and erosion"));
  assert.ok(stages.includes("Resolving drainage and rivers"));
  assertMountainPassability(first);
  assertRiverNetworks(first);
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);

  const wetness = (terrain: number) => terrain === 2 ? 1 : terrain === 3 ? 0.55 : terrain === 5 ? 0.4 : terrain === 6 ? 0.25 : 0.05;
  const rainShadows: number[] = [];
  for (let y = 3; y < first.height - 3; y += 1) {
    let x = 4;
    while (x < first.width - 4) {
      if (first.tiles[y * first.width + x].elevation !== 2) { x += 1; continue; }
      const westEdge = x;
      while (x < first.width - 4 && first.tiles[y * first.width + x].elevation === 2) x += 1;
      const eastEdge = x - 1;
      const west = [westEdge - 3, westEdge - 2, westEdge - 1].map((column) => first.tiles[y * first.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      const east = [eastEdge + 1, eastEdge + 2, eastEdge + 3].map((column) => first.tiles[y * first.width + column]).filter((tile) => tile.terrain >= 2 && tile.elevation < 2);
      if (west.length >= 2 && east.length >= 2) rainShadows.push(west.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / west.length - east.reduce((sum, tile) => sum + wetness(tile.terrain), 0) / east.length);
    }
  }
  assert.ok(rainShadows.length > 10);
  assert.ok(rainShadows.reduce((sum, difference) => sum + difference, 0) / rainShadows.length > 0.1);

  const quiet = generateMap({ ...options, plateActivity: "QUIET", erosionStrength: "LIGHT" });
  assert.notDeepEqual(quiet.tiles.map((tile) => tile.elevation), first.tiles.map((tile) => tile.elevation));
});

test("region-built presets remain valid through extreme Pin and String geometries", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "REGION_GRAPH");
  assert.deepEqual(presets.map((preset) => preset.id), ["LIVING_WORLD", "TECTONIC_CONTINENTS", "GREAT_WATERSHEDS", "SHATTERED_BASINS", "MYTHIC_REGIONS"]);
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
  const shattered = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine: "REGION_GRAPH", preset: "SHATTERED_BASINS", size: "STANDARD", players: 2, cityStates: 0, seed: "objects-SHATTERED_BASINS" });
  const kinds = new Set(shattered.structure?.objects.map((object) => object.kind));
  for (const kind of (["SUBREGION", "POLYGON", "SUPERPOLYGON", "CONTINENT", "OCEAN_BASIN", "INLAND_SEA", "LAKE", "RIFT", "CLIMATE_REGION"] as const)) assert.ok(kinds.has(kind), `missing ${kind}`);
});

test("generation history retains the newest 30 exact map snapshots", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "history-source" });
  let history: GenerationHistoryEntry[] = [];
  for (let id = 1; id <= 35; id += 1) history = addGenerationToHistory(history, generated, id);

  assert.equal(history.length, MAX_GENERATION_HISTORY);
  assert.equal(history[0].id, 35);
  assert.equal(history.at(-1)?.id, 6);
  const restored = restoreGeneration(history[0]);
  restored.tiles[0].terrain = 99;
  restored.generation!.dominantTerrains.push("DESERT");
  restored.structure!.objects[0].tileIndices[0] = 999_999;
  assert.notEqual(history[0].map.tiles[0].terrain, 99);
  assert.notDeepEqual(history[0].map.generation?.dominantTerrains, restored.generation?.dominantTerrains);
  assert.notEqual(history[0].map.structure?.objects[0].tileIndices[0], 999_999);
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

test("Randomise produces complete valid settings and wrap choices control export geography", () => {
  let state = 0x12345678;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const wrapTypes = new Set<string>();
  const geometries = new Set<string>();
  const engines = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const options = randomGenerationOptions(random);
    wrapTypes.add(options.wrapType);
    geometries.add(options.geometry);
    engines.add(options.engine);
    assert.ok(options.waterPercent >= 0 && options.waterPercent <= 90);
    assert.ok(options.mountainPercent >= 0 && options.mountainPercent <= 38);
    assert.ok(options.players >= 2 && options.players <= 22);
    assert.ok(options.cityStates >= 0 && options.cityStates <= 41);
    assert.ok(options.seed.length >= 10);
    if (options.modifier === "STRATEGIC_DEPTH") assert.ok(options.mountainPercent >= 22);
    if (options.modifier === "DOOMSDAY" || options.style === "BRUTAL") assert.ok(options.mountainPercent >= 18);
  }
  assert.deepEqual(wrapTypes, new Set(["PRESET", "EAST_WEST", "NONE"]));
  assert.deepEqual(geometries, new Set(["STANDARD", "TALL", "WIDE", "NEEDLE", "RIBBON", "PIN", "STRING", "SQUARE"]));
  assert.deepEqual(engines, new Set(["EXCOGITARE", "REGION_GRAPH", "PHYSICAL"]));

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

test("region-built realistic climates retain west-to-east rain shadows", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "REGION_GRAPH",
    preset: "TECTONIC_CONTINENTS",
    size: "STANDARD",
    players: 4,
    cityStates: 4,
    style: "REALISTIC",
    climateRealism: true,
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
  assert.deepEqual(parsed.tiles, generated.tiles.map((tile) => {
    const geography = { ...tile };
    delete geography.improvement;
    delete geography.route;
    return geography;
  }));
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

  assert.equal(imported.source, "script");
  assert.deepEqual(imported.generation, generated.generation);
  assert.deepEqual(imported.tiles, generated.tiles);
});
