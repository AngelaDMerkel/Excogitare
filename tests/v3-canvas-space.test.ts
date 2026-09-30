import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNativeFieldLandform } from '../lib/native-landforms.ts';
import type { NarrativeFieldSource } from '../lib/narrative-engine-adapters.ts';
import { adjacentCoordinates } from '../lib/civ5-rules.ts';
import { generationSpace, spaceSegmentDistance } from '../lib/generation-space.ts';
import { resolveMapDimensions } from '../lib/map-generator.ts';
import { generateV3 } from '../lib/v3/generate.ts';
import { parseCiv5Map, serializeCiv5Map } from '../lib/civ5-map.ts';

const source: NarrativeFieldSource = { id: 'geometry-audit', role: 'CONTINENT', effect: 'LAND', x: .5, y: .5, radiusX: .18, radiusY: .15, rotation: .8, strength: 1 };

test('A local landform is identical when surrounding space changes aspect without touching it', () => {
  let reference: string[] | undefined;
  for (const [width, height] of [[80, 80], [160, 40], [40, 160]]) {
    const result = buildNativeFieldLandform(source, width, height, false, 42, 200);
    const local = result.tiles.map(i => `${i % width - width / 2}:${Math.floor(i / width) - height / 2}`).sort();
    if (reference) assert.deepEqual(local, reference, `${width} × ${height} distorted the local shape`);
    reference = local;
  }
});

test('The reported 500-tile Ribbon landform uses the available depth instead of stretching its template', () => {
  const bounds = [];
  for (const geometry of ['STANDARD', 'WIDE', 'RIBBON'] as const) {
    const { width, height } = resolveMapDimensions('STANDARD', geometry);
    const result = buildNativeFieldLandform(source, width, height, false, 42, 500);
    const xs = result.tiles.map(i => i % width), ys = result.tiles.map(i => Math.floor(i / width));
    bounds.push({ width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 });
    assert.equal(result.tiles.length, 500);
  }
  assert.ok(Math.abs(bounds[1].width - bounds[0].width) <= 2);
  assert.ok(Math.abs(bounds[1].height - bounds[0].height) <= 2);
  assert.ok(bounds[2].width < bounds[0].width * 1.5, 'Ribbon stretched the landform along its long axis');
  assert.ok(bounds[2].height >= 15, 'Ribbon compressed the landform while usable depth remained');
});

test('Growth preserves its connected area inside narrow, tall and wrapped canvases', () => {
  for (const geometry of ['RIBBON', 'NEEDLE', 'PIN', 'STRING'] as const) for (const wraps of [false, true]) {
    const { width, height } = resolveMapDimensions('STANDARD', geometry);
    const settings = { ...source, x: .015, y: .08 };
    const result = buildNativeFieldLandform(settings, width, height, wraps, 91, 500);
    assert.deepEqual(buildNativeFieldLandform(settings, width, height, wraps, 91, 500), result);
    const members = new Set(result.tiles), reached = new Set([result.tiles[0]]), queue = [result.tiles[0]];
    assert.equal(members.size, 500);
    assert.ok(result.tiles.every(i => i >= 0 && i < width * height));
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const i = queue[cursor];
      for (const [x, y] of adjacentCoordinates(i % width, Math.floor(i / width), width, height, wraps)) {
        const next = y * width + x;
        if (members.has(next) && !reached.has(next)) { reached.add(next); queue.push(next); }
      }
    }
    assert.equal(reached.size, 500);
  }
});

test('Path distances use physical projection and the closest wrapped image of the whole segment', () => {
  const space = generationSpace(200, 20), from = { x: .1, y: .1 }, to = { x: .8, y: .8 };
  const point = { x: .5, y: .9 };
  const whole = spaceSegmentDistance(point, from, to, space, false);
  const middle = { x: .45, y: .45 };
  assert.ok(Math.abs(whole - Math.min(spaceSegmentDistance(point, from, middle, space, false), spaceSegmentDistance(point, middle, to, space, false))) < 1e-12);
  assert.ok(Math.abs(spaceSegmentDistance({ x: .7, y: .5 }, { x: .1, y: .5 }, { x: .55, y: .5 }, space, true) * space.scale - 30) < 1e-10);
  assert.equal(spaceSegmentDistance({ x: 0, y: .5 }, { x: .95, y: .5 }, { x: .05, y: .5 }, space, true), 0);
});

test('All native engines generate in square, wide and tall grids with retained water and exports', () => {
  for (const [engine, preset] of [['EXCOGITARE', 'CONTINENTS'], ['ECCENTRIC', 'LIVING_WORLD'], ['PHYSICAL', 'DYNAMIC_EARTH'], ['POLIS', 'OPPOSING_FRONTS']] as const) {
    for (const geometry of ['SQUARE', 'WIDE', 'TALL'] as const) {
      const result = generateV3({ mode: 'ADVANCED', options: { engine, preset, size: 'TINY', geometry, players: 4, cityStates: 2, waterPercent: 55 } }, `canvas-${engine}-${geometry}`);
      const { map, provenance } = result, dimensions = resolveMapDimensions('TINY', geometry);
      assert.equal(provenance.version, '3');
      assert.equal(provenance.plan.recipe.engine, engine);
      assert.equal(provenance.assessment.accepted, true);
      assert.deepEqual([map.width, map.height], [dimensions.width, dimensions.height]);
      assert.equal(map.tiles.filter(t => t.terrain < 2).length, Math.round(map.tiles.length * .55));
      assert.equal(map.startLocations.filter(s => !s.cityState).length, 4);
      const restored = parseCiv5Map(serializeCiv5Map(map), map.name);
      assert.deepEqual([restored.width, restored.height], [map.width, map.height]);
      assert.deepEqual(restored.tiles.map(t => [t.terrain, t.elevation, t.feature, t.resource]), map.tiles.map(t => [t.terrain, t.elevation, t.feature, t.resource]));
    }
  }
});
