import assert from 'node:assert/strict';
import test from 'node:test';
import { MAP_SIZES, GAME_BREAKING_GEOMETRIES, resolveMapDimensions } from '../lib/map-generator.ts';
import { V3_MAP_GEOMETRIES, V3_DIMENSION_WARNING } from '../lib/v3/dimensions.ts';
import { normalizeV3Request } from '../lib/v3/request.ts';
import { compileV3Plan } from '../lib/v3/plan.ts';
import { generateV3 } from '../lib/v3/generate.ts';
import { parseCiv5Map, serializeCiv5Map } from '../lib/civ5-map.ts';
import { generationInputHash } from '../lib/generation-pass-graph.ts';

function checkMap(input: unknown, seed: string, width: number, height: number) {
  const result = generateV3(input, seed);
  assert.deepEqual([result.map.width, result.map.height], [width, height], seed);
  assert.equal(result.map.tiles.length, width * height);
  assert.ok(result.provenance.assessment.accepted, seed);
  assert.equal(result.provenance.assessment.starts.length, 4);
  assert.ok(result.provenance.assessment.warnings.includes(V3_DIMENSION_WARNING));
  const restored = parseCiv5Map(serializeCiv5Map(result.map), result.map.name);
  assert.deepEqual([restored.width, restored.height], [width, height]);
  const geography = (tiles: typeof result.map.tiles) => tiles.map(({ terrain, elevation, feature, resource, resourceAmount, river }) => ({ terrain, elevation, feature, resource, resourceAmount, river }));
  assert.equal(generationInputHash(geography(restored.tiles)), generationInputHash(geography(result.map.tiles)));
  return result;
}

test('Every native size and geometry reaches both V3 planning modes unchanged', () => {
  for (const size of MAP_SIZES) for (const geometry of V3_MAP_GEOMETRIES) {
    for (const mode of ['STANDARD', 'ADVANCED'] as const) {
      const settings = { size: size.id, geometry: geometry.id };
      const request = normalizeV3Request(mode === 'STANDARD' ? { mode, parameters: settings } : { mode, options: settings }, 'dimension-catalogue');
      const recipe = compileV3Plan(request).recipe;
      assert.equal(recipe.settings.size, size.id);
      assert.equal(recipe.settings.geometry, geometry.id);
      assert.deepEqual(resolveMapDimensions(recipe.settings.size, recipe.settings.geometry), resolveMapDimensions(size.id, geometry.id));
    }
  }
  for (const mode of ['STANDARD', 'ADVANCED']) for (const settings of [{size:'INFINITE'}, {geometry:'CIRCLE'}]) {
    assert.throws(() => normalizeV3Request(mode === 'STANDARD' ? {mode,parameters:settings} : {mode,options:settings}, 'bad-dimensions'), /Unsupported/);
  }
});

test('Randomise retains its existing size and geometry pools', () => {
  for (const fullSizeRange of [false, true]) for (let i = 0; i < 100; i++) {
    const request = normalizeV3Request({mode:'RANDOMISE',fullSizeRange}, `dimensions-random-${i}`);
    assert.equal(request.mode, 'STANDARD');
    if (request.mode !== 'STANDARD') continue;
    assert.ok(['STANDARD','WIDE','TALL','SQUARE'].includes(request.parameters.geometry));
    assert.ok((fullSizeRange ? ['TINY','SMALL','STANDARD','LARGE','HUGE'] : ['TINY','SMALL','STANDARD']).includes(request.parameters.size));
  }
});

test('Standard generates extended sizes and all four extreme proportions with exact round trips', () => {
  for (const [geometry, width, height] of [['NEEDLE',19,219], ['RIBBON',223,19], ['PIN',10,416], ['STRING',408,10]] as const) {
    const input = {mode:'STANDARD',parameters:{size:'STANDARD',geometry}}, seed = `standard-dimensions-${geometry}`;
    const result = checkMap(input, seed, width, height);
    if (geometry === 'RIBBON') assert.equal(generationInputHash(generateV3(input, seed)), generationInputHash(result));
  }
  checkMap({mode:'STANDARD',parameters:{size:'EXTREME'}}, 'extended-dimensions-4', 180, 94);
  checkMap({mode:'STANDARD',parameters:{size:'COLOSSAL'}}, 'extended-dimensions-5', 170, 110);
});

test('All native engines retain extreme geometry through Advanced and binary export', () => {
  let i = 6;
  for (const [engine, preset] of [['EXCOGITARE','CONTINENTS'], ['ECCENTRIC','LIVING_WORLD'], ['PHYSICAL','DYNAMIC_EARTH'], ['POLIS','OPPOSING_FRONTS']] as const) {
    for (const geometry of GAME_BREAKING_GEOMETRIES) {
      const expected = {NEEDLE:[13,155], RIBBON:[156,13], PIN:[7,288], STRING:[284,7]}[geometry];
      checkMap({mode:'ADVANCED',options:{size:'TINY',geometry,engine,preset,players:4,cityStates:2}}, `extended-dimensions-${i++}`, expected[0], expected[1]);
    }
  }
  checkMap({mode:'ADVANCED',options:{size:'COLOSSAL',geometry:'RIBBON',engine:'EXCOGITARE',preset:'CONTINENTS',players:4,cityStates:2}}, 'extended-dimensions-22', 474, 39);
});
