import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStructureOperation,
  compareMaps,
  createMapCheckpoint,
  generateBatchCandidate,
  regenerateMapStage,
  restoreMapCheckpoint,
} from "../lib/map-design.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";

const options = {
  ...DEFAULT_GENERATION_OPTIONS,
  size: "DUEL" as const,
  players: 6,
  cityStates: 2,
  seed: "design-pass-tests",
  startQuality: "STANDARD" as const,
};

test("selective generation passes preserve unrelated map structure", () => {
  const map = generateMap(options);
  const climate = regenerateMapStage(map, options, "CLIMATE", 1);
  const rivers = regenerateMapStage(map, options, "RIVERS", 2);
  const content = regenerateMapStage(map, options, "CONTENT", 3);
  const starts = regenerateMapStage(map, options, "STARTS", 4);

  assert.deepEqual(climate.tiles.map((tile) => tile.elevation), map.tiles.map((tile) => tile.elevation));
  assert.deepEqual(climate.tiles.map((tile) => tile.terrain < 2), map.tiles.map((tile) => tile.terrain < 2));
  assert.deepEqual(rivers.tiles.map((tile) => [tile.terrain, tile.elevation, tile.resource]), map.tiles.map((tile) => [tile.terrain, tile.elevation, tile.resource]));
  assert.deepEqual(content.tiles.map((tile) => [tile.terrain, tile.elevation, tile.river]), map.tiles.map((tile) => [tile.terrain, tile.elevation, tile.river]));
  assert.deepEqual(starts.tiles.map((tile) => [tile.terrain, tile.elevation]), map.tiles.map((tile) => [tile.terrain, tile.elevation]));
  assert.equal(starts.startLocations.filter((start) => !start.cityState).length, options.players);
});

test("team layouts honor 2v2, 3-player, and 4-player grouping", () => {
  for (const teamSize of [2, 3, 4] as const) {
    const playerCount = teamSize * 2;
    const map = generateMap({ ...options, players: playerCount, balance: "TEAMS", teamSize, teamLayout: "FRONTLINES" });
    const majors = map.startLocations.filter((start) => !start.cityState);
    assert.equal(majors.filter((start) => start.team === 0).length, teamSize);
    assert.equal(majors.filter((start) => start.team === 1).length, teamSize);
    assert.ok(Math.max(...majors.filter((start) => start.team === 0).map((start) => start.x)) <= Math.min(...majors.filter((start) => start.team === 1).map((start) => start.x)));
  }
});

test("batch candidates receive bounded, auditable balance scores", () => {
  const one = generateBatchCandidate(options, 0);
  const two = generateBatchCandidate(options, 1);
  assert.notEqual(one.seed, two.seed);
  assert.ok(one.score >= 0 && one.score <= 100);
  assert.equal(one.balance.players.length, options.players);
  assert.equal(one.errors, 0);
});

test("world structure operations affect only the selected region", () => {
  const map = generateMap(options);
  const region = { minX: 8, minY: 6, maxX: 20, maxY: 14 };
  const ridge = applyStructureOperation(map, region, "RIDGE", 3, options, 1);
  const changed = compareMaps(ridge, map).changedTiles;
  assert.ok(changed.size > 0);
  for (const index of changed) {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    assert.ok(x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY);
  }
  assert.ok(ridge.tiles.some((tile, index) => changed.has(index) && tile.elevation === 2));
});

test("named checkpoints are immutable and produce tile comparisons", () => {
  const map = generateMap(options);
  const checkpoint = createMapCheckpoint(map, "Before ridge", 1, 1000);
  map.tiles[0].terrain = map.tiles[0].terrain === 0 ? 2 : 0;
  const comparison = compareMaps(map, checkpoint.map);
  assert.equal(comparison.dimensionsMatch, true);
  assert.ok(comparison.changedTiles.has(0));
  const restored = restoreMapCheckpoint(checkpoint);
  assert.notEqual(restored, checkpoint.map);
  assert.deepEqual(restored.tiles, checkpoint.map.tiles);
});
