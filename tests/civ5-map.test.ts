import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, updateCiv5MapMetadata } from "../lib/civ5-map.ts";

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
