import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, serializeCiv5Map, updateCiv5Map, updateCiv5MapMetadata } from "../lib/civ5-map.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, randomGenerationOptions, resolveMapDimensions } from "../lib/map-generator.ts";
import { createLuaMapScript, mapFromLuaScript } from "../lib/map-script.ts";
import { analyzeMultiplayerBalance, validateCiv5Map } from "../lib/map-analysis.ts";

const encoder = new TextEncoder();

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
        if (map.tiles[owner].terrain < 2 && map.tiles[neighbor].terrain < 2) continue;
        for (const vertex of [definition.a, definition.b]) {
          addTile(vertex, owner);
          addTile(vertex, neighbor);
        }
        if (map.tiles[owner].river & definition.bit) addRiverEdge(definition.a, definition.b);
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
    const touchesMountain = endpoints.some((vertex) => [...(vertexTiles.get(vertex) ?? [])].some((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation === 2));
    const touchesWater = endpoints.some((vertex) => [...(vertexTiles.get(vertex) ?? [])].some((index) => map.tiles[index].terrain < 2));
    assert.ok(componentEdges >= 3, "a river was too short to form a continuous channel");
    assert.equal(componentEdges, componentVertices.length - 1, "a river network contained a loop");
    assert.ok(touchesMountain, "a river network did not begin at a mountain");
    assert.ok(touchesWater, "a river network did not terminate in water");
  }
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
  view.setUint32(playerOffset + 424, 1, true);
  view.setUint32(playerOffset + 428, 0, true);
  view.setUint8(playerOffset + 432, 2);
  view.setUint8(playerOffset + 433, 1);
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
    team: 2,
    playable: true,
    cityState: false,
  }]);
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

test("geometry choices preserve the size budget while changing the aspect ratio", () => {
  assert.deepEqual(resolveMapDimensions("STANDARD", "STANDARD"), { width: 80, height: 52 });
  const tall = resolveMapDimensions("STANDARD", "TALL");
  const wide = resolveMapDimensions("STANDARD", "WIDE");
  const square = resolveMapDimensions("STANDARD", "SQUARE");
  assert.ok(tall.height / tall.width > 2);
  assert.ok(wide.width / wide.height > 3);
  assert.equal(square.width, square.height);
  for (const dimensions of [tall, wide, square]) {
    assert.ok(Math.abs(dimensions.width * dimensions.height - 80 * 52) / (80 * 52) < 0.03);
  }

  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", geometry: "TALL", seed: "vertical-world" });
  assert.equal(generated.width, resolveMapDimensions("DUEL", "TALL").width);
  assert.equal(generated.height, resolveMapDimensions("DUEL", "TALL").height);
});

test("Randomise produces complete valid settings and wrap choices control export geography", () => {
  let state = 0x12345678;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const wrapTypes = new Set<string>();
  const geometries = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const options = randomGenerationOptions(random);
    wrapTypes.add(options.wrapType);
    geometries.add(options.geometry);
    assert.ok(options.waterPercent >= 0 && options.waterPercent <= 90);
    assert.ok(options.mountainPercent >= 0 && options.mountainPercent <= 38);
    assert.ok(options.players >= 2 && options.players <= 22);
    assert.ok(options.cityStates >= 0 && options.cityStates <= 41);
    assert.ok(options.seed.length >= 10);
    if (options.modifier === "STRATEGIC_DEPTH") assert.ok(options.mountainPercent >= 22);
    if (options.modifier === "DOOMSDAY" || options.style === "BRUTAL") assert.ok(options.mountainPercent >= 18);
  }
  assert.deepEqual(wrapTypes, new Set(["PRESET", "EAST_WEST", "NONE"]));
  assert.deepEqual(geometries, new Set(["STANDARD", "TALL", "WIDE", "SQUARE"]));

  const eastWest = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "INLAND_SEAS", size: "DUEL", wrapType: "EAST_WEST" });
  const flat = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "CONTINENTS", size: "DUEL", wrapType: "NONE" });
  const presetFlat = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "LABYRINTH", size: "DUEL", wrapType: "PRESET" });
  assert.equal(eastWest.wraps, true);
  assert.equal(flat.wraps, false);
  assert.equal(presetFlat.wraps, false);
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
    return geography;
  }));
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
