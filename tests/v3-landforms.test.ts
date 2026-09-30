import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoMap, serializeCiv5Map, parseCiv5Map, type Civ5Map } from '../lib/civ5-map.ts';
import { assessCoastlines } from '../lib/coastline-quality.ts';
import { buildNativeFieldLandform } from '../lib/native-landforms.ts';
import type { NarrativeFieldSource } from '../lib/narrative-engine-adapters.ts';
import { adjacentCoordinates } from '../lib/civ5-rules.ts';
import { generateMapFoundation } from '../lib/map-generator.ts';
import { normalizeV3Request } from '../lib/v3/request.ts';
import { compileV3Plan, homelandConstraints } from '../lib/v3/plan.ts';
import { generateV3 } from '../lib/v3/generate.ts';
import { generationInputHash } from '../lib/generation-pass-graph.ts';

function fixture(predicate: (x: number, y: number, index: number) => boolean, wraps = false, width = 80, height = 64): Civ5Map {
  const map = createDemoMap();
  return { ...map, width, height, wraps, players: 0, startLocations: [], structure: undefined, tiles: Array.from({ length: width * height }, (_, i) => ({ terrain: predicate(i % width + (Math.floor(i / width) % 2) * .5, Math.floor(i / width) * Math.sqrt(3) / 2, i) ? 2 : 0, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, river: 0, continent: 0 })) };
}
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation = 0) {
  const dx = x - cx, dy = y - cy;
  return Math.hypot((dx * Math.cos(rotation) + dy * Math.sin(rotation)) / rx, (-dx * Math.sin(rotation) + dy * Math.cos(rotation)) / ry);
}

test('Coastline assessment detects filled circles and rotated elongated ellipses', () => {
  for (const [rx, ry, rotation] of [[11, 11, 0], [22, 7, .6], [9, 17, 1.2]]) {
    const result = assessCoastlines(fixture((x, y) => ellipse(x, y, 40, 27, rx, ry, rotation) <= 1));
    assert.equal(result.accepted, false);
    assert.ok(result.regularComponents >= 1);
  }
});

test('Pixel roughness and a token spike do not disguise an ellipse', () => {
  const noisy = fixture((x, y) => {
    const angle = Math.atan2(y - 27, x - 40);
    return ellipse(x, y, 40, 27, 18, 10) <= 1 + .035 * Math.sin(angle * 43);
  });
  const spike = fixture((x, y) => ellipse(x, y, 40, 27, 15, 10) <= 1 || x > 53 && x < 65 && Math.abs(y - 27) < .5);
  assert.equal(assessCoastlines(noisy).accepted, false);
  assert.equal(assessCoastlines(spike).accepted, false);
});

test('Broad bays, hollow atolls and unresolved small islets are allowed', () => {
  const irregular = fixture((x, y) => { const a = Math.atan2(y - 27, x - 40); return Math.hypot(x - 40, y - 27) < 13 * (1 + .25 * Math.sin(a * 3) + .18 * Math.cos(a * 5)); });
  const atoll = fixture((x, y) => { const d = ellipse(x, y, 40, 27, 15, 11); return d < 1 && d > .65; });
  const small = fixture((x, y) => ellipse(x, y, 40, 27, 2.8, 2.8) < 1);
  assert.equal(assessCoastlines(irregular).accepted, true);
  assert.equal(assessCoastlines(atoll).accepted, true);
  assert.equal(assessCoastlines(small).accepted, true);
});

test('Volcanic exceptions require local construction evidence and a central peak', () => {
  const map = fixture((x, y) => ellipse(x, y, 40, 27, 7, 7) <= 1);
  const center = Math.round(27 / (Math.sqrt(3) / 2)) * map.width + 40;
  assert.equal(assessCoastlines(map).accepted, false);
  map.structure = { engine: 'PHYSICAL', objects: [{ id: 'cone', kind: 'TECTONIC_PLATE', name: 'Volcanic anchor', tileIndices: [center], attributes: { role: 'VOLCANIC_ARC_ANCHOR' } }], diagnostics: {}, mountainRanges: [], riverSystems: [] };
  assert.equal(assessCoastlines(map).accepted, false);
  map.tiles[center].elevation = 2;
  assert.equal(assessCoastlines(map).accepted, true);
});

test('Shape assessment unwraps seam-crossing islands consistently', () => {
  const interior = fixture((x, y) => ellipse(x, y, 40, 27, 12, 9) <= 1, true);
  const seam = fixture((x, y) => { let dx = x - 1; if (dx > 40) dx -= 80; return Math.hypot(dx / 12, (y - 27) / 9) <= 1; }, true);
  const a = assessCoastlines(interior), b = assessCoastlines(seam);
  assert.equal(a.accepted, false); assert.equal(b.accepted, false);
  assert.equal(a.components[0].tiles, b.components[0].tiles);
  assert.ok(Math.abs(a.components[0].broadRadiusSpread - b.components[0].broadRadiusSpread) < 1e-8);
});

test('Native growth is connected, deterministic and constrained to its area budget', () => {
  const source: NarrativeFieldSource = { id: 'test-country', role: 'ISLAND_CONTINENT', effect: 'LAND', x: .03, y: .5, radiusX: .2, radiusY: .16, rotation: .7, strength: 1 };
  for (const [width, height, wraps] of [[80, 48, true], [32, 80, false], [100, 24, false]] as const) {
    const a = buildNativeFieldLandform(source, width, height, wraps, 823, 200);
    const b = buildNativeFieldLandform(source, width, height, wraps, 823, 200);
    const c = buildNativeFieldLandform(source, width, height, wraps, 921, 200);
    assert.deepEqual(a, b); assert.notDeepEqual(a.tiles, c.tiles);
    assert.equal(a.tiles.length, 200); assert.equal(new Set(a.tiles).size, 200);
    const members = new Set(a.tiles), seen = new Set([a.tiles[0]]), queue = [a.tiles[0]];
    for (let i = 0; i < queue.length; i++) for (const [x, y] of adjacentCoordinates(queue[i] % width, Math.floor(queue[i] / width), width, height, wraps)) { const j = y * width + x; if (members.has(j) && !seen.has(j)) { seen.add(j); queue.push(j); } }
    assert.equal(seen.size, a.tiles.length);
    assert.ok(a.backbone.some(point => point.strength > .7));
  }
});

test('The reproduced native ellipses are corrected before climate and resource passes', () => {
  for (const seed of ['round-islands-0', 'round-islands-1', 'round-islands-2']) {
    const request = normalizeV3Request({ mode: 'STANDARD', parameters: { size: 'STANDARD', players: 4, water: 'HIGH', isolation: 'HIGH' } }, seed);
    const plan = compileV3Plan(request), recipe = { ...plan.recipe, settings: { ...plan.recipe.settings, seed: `${seed}:v3:geography:1` } };
    const old = generateMapFoundation(recipe);
    const updated = generateMapFoundation(recipe, undefined, { fieldConstruction: 'BRANCHING', coordinateSpace: 'HEX' });
    assert.equal(assessCoastlines(old).accepted, false);
    assert.equal(assessCoastlines(updated).accepted, true);
    assert.ok(assessCoastlines(updated).inspected >= 2, "The fix must retain inspectable islands, not merely clip them against map edges.");
    assert.equal(old.tiles.filter(t => t.terrain < 2).length, updated.tiles.filter(t => t.terrain < 2).length);
    assert.ok((updated.structure?.diagnostics.nativeLandformBranches ?? 0) > 0);
    const constraints = homelandConstraints(plan)!;
    constraints.topology[10 * updated.width + 10] = 1;
    constraints.topology[11 * updated.width + 10] = 0;
    const protectedMap = generateMapFoundation(recipe, undefined, { fieldConstruction: 'BRANCHING', coordinateSpace: 'HEX', constraints });
    assert.ok(protectedMap.tiles[10 * updated.width + 10].terrain >= 2);
    assert.ok(protectedMap.tiles[11 * updated.width + 10].terrain < 2);
  }
});

test('Accepted V3 output retains its new geometry through game-map round trip', () => {
  const result = generateV3({ mode: 'STANDARD', parameters: { size: 'TINY', water: 'HIGH', isolation: 'HIGH', players: 4 } }, 'coastline-round-trip');
  assert.equal(result.provenance.version, '3');
  assert.equal(result.provenance.assessment.coastlines.accepted, true);
  const restored = parseCiv5Map(serializeCiv5Map(result.map), result.map.name);
  assert.equal(generationInputHash(restored.tiles.map(tile => tile.terrain < 2)), generationInputHash(result.map.tiles.map(tile => tile.terrain < 2)));
  assert.equal(assessCoastlines(restored).accepted, true);
});

test('Functional validity cannot override a failed coastline check', async () => {
  const { placeV3Starts, balanceV3Content } = await import('../lib/v3/balance.ts');
  const { assessV3Map } = await import('../lib/v3/assessment.ts');
  const request = normalizeV3Request({ mode: 'STANDARD', parameters: { size: 'TINY', players: 2, water: 'OCEANIC', mountains: 'NONE' } }, 'valid-but-round');
  const plan = compileV3Plan(request), base = generateMapFoundation(plan.recipe), width = 56, height = 36;
  const round: Civ5Map = { ...base, width, height, wraps: false, structure: undefined, startLocations: [], tiles: Array.from({ length: width * height }, (_, i) => ({ terrain: ellipse(i % width + (Math.floor(i / width) % 2) * .5, Math.floor(i / width) * Math.sqrt(3) / 2, 28, 15, 15, 8) < 1 ? 2 : 0, elevation: 0, feature: 255, wonder: 255, resource: 255, resourceAmount: 0, river: 0, continent: 0 })) };
  const started = placeV3Starts(round, request, plan), balanced = balanceV3Content(started, request, plan);
  const result = assessV3Map(balanced.map, plan, balanced.changes);
  assert.equal(result.accepted, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every(message => message.includes('coastline')), result.errors.join(' '));
});

test('Native map families retain their distinct topology after coastline reconstruction', async () => {
  const { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS } = await import('../lib/map-generator.ts');
  const { generationRecipeFromOptions } = await import('../lib/generation-recipe.ts');
  const groups = (map: Civ5Map, water: boolean) => {
    const visited = new Set<number>(), result: number[][] = [];
    for (let i = 0; i < map.tiles.length; i++) {
      if (visited.has(i) || (map.tiles[i].terrain < 2) !== water) continue;
      const region = [i]; visited.add(i);
      for (let k = 0; k < region.length; k++) for (const [x, y] of adjacentCoordinates(region[k] % map.width, Math.floor(region[k] / map.width), map.width, map.height, map.wraps)) { const j = y * map.width + x; if (!visited.has(j) && (map.tiles[j].terrain < 2) === water) { visited.add(j); region.push(j); } }
      result.push(region);
    }
    return result.sort((a, b) => b.length - a.length);
  };
  for (const id of ['PANGAEA', 'CONTINENTS', 'ARCHIPELAGO', 'EARTHSEA', 'INLAND_SEAS'] as const) {
    const preset = MAP_PRESETS.find(p => p.id === id)!;
    const recipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine: 'EXCOGITARE', preset: id, seed: 'coast-identity', size: 'STANDARD', style: 'REALISTIC', waterPercent: preset.water, mountainPercent: preset.mountains, players: 4, cityStates: 0, wrapType: 'NONE' });
    const map = generateMapFoundation(recipe, undefined, { fieldConstruction: 'BRANCHING', coordinateSpace: 'HEX' });
    const land = groups(map, false), water = groups(map, true), totalLand = land.reduce((sum, region) => sum + region.length, 0);
    assert.ok(Math.abs((map.tiles.length - totalLand) - Math.round(map.tiles.length * preset.water / 100)) <= 1, `${id} lost its water budget`);
    if (id === 'PANGAEA') assert.ok(land[0].length / totalLand >= .6, 'Pangaea lost its dominant continent');
    if (id === 'CONTINENTS') assert.ok(land.filter(region => region.length >= 100).length >= 2, 'Continents collapsed into one world');
    if (id === 'ARCHIPELAGO') assert.ok(land.filter(region => region.length >= 12).length >= 3, 'The island mosaic was lost');
    if (id === 'EARTHSEA') assert.ok(land.filter(region => region.length >= 32).length >= 3, 'Island homelands were lost');
    if (id === 'INLAND_SEAS') {
      const enclosed = water.filter(region => region.length >= 8 && region.every(i => i % map.width > 0 && i % map.width < map.width - 1 && i >= map.width && i < map.tiles.length - map.width));
      assert.ok(enclosed.length >= 2, 'Lake Kingdoms lost its enclosed basins');
    }
  }
});


test('A supported volcanic island keeps its classification at higher resolution', () => {
  for (const scale of [1, 2]) {
    const map = fixture((x, y) => ellipse(x, y, 40 * scale, 27 * scale, 7 * scale, 7 * scale) <= 1, false, 80 * scale, 64 * scale);
    const center = Math.round(27 * scale / (Math.sqrt(3) / 2)) * map.width + 40 * scale;
    map.tiles[center].elevation = 2;
    map.structure = { engine: 'PHYSICAL', objects: [{ id: 'cone', kind: 'TECTONIC_PLATE', name: 'Volcanic anchor', tileIndices: [center], attributes: { role: 'VOLCANIC_ARC_ANCHOR' } }], diagnostics: {}, mountainRanges: [], riverSystems: [] };
    const assessment = assessCoastlines(map);
    assert.equal(assessment.accepted, true);
    assert.equal(assessment.components[0].volcanic, true);
  }
});
