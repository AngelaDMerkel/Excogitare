import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, serializeCiv5Map, updateCiv5Map, updateCiv5MapMetadata } from "../lib/civ5-map.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";
import { createLuaMapScript, mapFromLuaScript } from "../lib/map-script.ts";

const encoder = new TextEncoder();

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
  const options = { ...DEFAULT_GENERATION_OPTIONS, size: "DUEL" as const, players: 4, seed: "same-world" };
  const first = generateMap(options);
  const second = generateMap(options);

  assert.equal(first.width, 40);
  assert.equal(first.height, 24);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.equal(first.startLocations.length, 4);
  assert.equal(new Set(first.startLocations.map((start) => `${start.x},${start.y}`)).size, 4);
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
  for (const start of map.startLocations) assert.ok(nearby(start.x, start.y) >= 5);
});

test("generated maps serialize to a readable Civ5Map geography file", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, seed: "round-trip" });
  const parsed = parseCiv5Map(serializeCiv5Map(generated), "fallback.Civ5Map");

  assert.equal(parsed.name, generated.name);
  assert.equal(parsed.description, generated.description);
  assert.equal(parsed.worldSize, "DUEL");
  assert.equal(parsed.width, generated.width);
  assert.equal(parsed.height, generated.height);
  assert.deepEqual(parsed.tiles, generated.tiles);
});

test("Excogitare Lua exports retain safe native generation settings", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", seed: "lua-round-trip" });
  const source = createLuaMapScript(generated);
  const imported = mapFromLuaScript(source).map;

  assert.equal(imported.source, "script");
  assert.deepEqual(imported.generation, generated.generation);
  assert.deepEqual(imported.tiles, generated.tiles);
});
