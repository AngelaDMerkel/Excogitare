import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV3 } from '../lib/v3/generate.ts';
import { normalizeV3Request, STANDARD_DEFAULTS } from '../lib/v3/request.ts';
import { compileV3Plan } from '../lib/v3/plan.ts';
import { distance } from '../lib/v3/spatial.ts';
import { generationInputHash, GenerationCancelledError } from '../lib/generation-pass-graph.ts';
import { serializeCiv5Map, parseCiv5Map, inspectCiv5MapStructure } from '../lib/civ5-map.ts';
import { featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict, adjacentCoordinates } from '../lib/civ5-rules.ts';

const standard = (parameters = {}, seed = 'v3-sweep') => generateV3({ mode: 'STANDARD', parameters: { size: 'TINY', players: 4, ...parameters } }, seed);
const variance = (values: number[]) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length; };

test('V3 rejects malformed controls and isolates Standard and Advanced drafts', () => {
  assert.throws(() => normalizeV3Request({ mode: 'STANDARD', seed: 42 }), /text seed/);
  assert.throws(() => normalizeV3Request({ mode: 'STANDARD', parameters: { water: 'INVALID' } }, 'seed'), /water/);
  assert.throws(() => normalizeV3Request({ mode: 'ADVANCED', options: { waterPercent: NaN } }, 'seed'), /waterPercent/);
  assert.throws(() => normalizeV3Request({ mode: 'ADVANCED', options: { engine: 'PHYSICAL', preset: 'PANGAEA' } }, 'seed'), /different engine/);
  assert.throws(() => normalizeV3Request({ mode: 'ADVANCED', recipe: { scale: 'UNBOUNDED' } }, 'seed'), /scale/);
  const request = normalizeV3Request({ mode: 'STANDARD', options: { waterPercent: 90 } }, 'seed');
  assert.deepEqual(request, { mode: 'STANDARD', seed: 'seed', parameters: STANDARD_DEFAULTS });
  const advanced = normalizeV3Request({ mode: 'ADVANCED', options: { engine: 'PHYSICAL', preset: 'DYNAMIC_EARTH', seed: 'fixed' }, parameters: { water: 'MINIMAL' } });
  assert.equal(compileV3Plan(advanced).recipe.settings.waterPercent, 62);
});

test('V3 replays the same request and seed, changes with a new seed, and preserves the input', () => {
  const request = { mode: 'STANDARD', parameters: { size: 'TINY', players: 2 } }, original = structuredClone(request);
  const a = generateV3(request, 'repeat'), b = generateV3(request, 'repeat'), c = generateV3(request, 'different');
  assert.equal(generationInputHash(a), generationInputHash(b));
  assert.notEqual(generationInputHash(a.map.tiles), generationInputHash(c.map.tiles));
  assert.deepEqual(request, original);
  assert.equal(a.provenance.state, 'CURRENT');
  assert.equal(a.map.structure?.evidenceState, 'STALE');
});

test('Water and mountain choices affect actual map coverage independently', () => {
  const dry = standard({ water: 'MINIMAL' }), wet = standard({ water: 'OCEANIC' });
  assert.ok(dry.provenance.assessment.waterPercent < 15);
  assert.ok(wet.provenance.assessment.waterPercent > 75);
  const flat = standard({ mountains: 'NONE' }), peaks = standard({ mountains: 'EXTREME' });
  assert.equal(flat.provenance.assessment.mountainPercent, 0);
  assert.ok(peaks.provenance.assessment.mountainPercent > 35);
});

test('Mobility, Climate, Challenge and Regional variety change finished geography', () => {
  const slow = standard({ mobility: 'VERY_SLOW' }), fast = standard({ mobility: 'VERY_FAST' });
  assert.ok(slow.provenance.assessment.movementCost > fast.provenance.assessment.movementCost + .15);
  assert.ok(Math.abs(slow.provenance.assessment.mountainPercent - fast.provenance.assessment.mountainPercent) < 1);
  const cold = standard({ climate: 'COLD' }), hot = standard({ climate: 'HOT' });
  assert.ok(cold.provenance.assessment.coldLandPercent > hot.provenance.assessment.coldLandPercent + 30);
  const gentle = standard({ challenge: 'GENTLE' }), harsh = standard({ challenge: 'HARSH' });
  assert.ok(gentle.provenance.assessment.resourceTiles > harsh.provenance.assessment.resourceTiles * 1.3);
  const uniform = standard({ regionalVariety: 'UNIFORM' }), dramatic = standard({ regionalVariety: 'DRAMATIC' });
  assert.ok(variance(dramatic.provenance.climate.moisture) > variance(uniform.provenance.climate.moisture));
});

test('Gameplay planning selects isolation mechanisms and competition changes homeland spacing', () => {
  const plan = (parameters: object) => compileV3Plan(normalizeV3Request({ mode: 'STANDARD', parameters }, 'flow'));
  assert.equal(plan({ isolation: 'EXTREME', water: 'OCEANIC' }).isolationMechanism, 'OCEAN');
  assert.equal(plan({ isolation: 'EXTREME', water: 'LOW', mountains: 'MANY' }).isolationMechanism, 'PASSES');
  assert.equal(plan({ isolation: 'EXTREME', water: 'LOW', mountains: 'FEW' }).isolationMechanism, 'DRY_INTERIOR');
  const spread = (p: ReturnType<typeof plan>) => p.homelands.reduce((sum, a, i) => sum + Math.min(...p.homelands.filter((_, j) => j !== i).map(b => Math.hypot(a.x - b.x, a.y - b.y))), 0);
  assert.ok(spread(plan({ competition: 'LOW' })) > spread(plan({ competition: 'INTENSE' })));
  const open = standard({ isolation: 'OPEN' }), isolated = standard({ isolation: 'EXTREME' });
  assert.notEqual(generationInputHash(open.map.tiles), generationInputHash(isolated.map.tiles));
});

test('Players, size and geometry produce the requested roster and dimensions', () => {
  const two = standard({ players: 2, geometry: 'WIDE' }), six = standard({ players: 6, geometry: 'TALL', size: 'SMALL' });
  assert.equal(two.provenance.assessment.starts.length, 2); assert.ok(two.map.width > two.map.height);
  assert.equal(six.provenance.assessment.starts.length, 6); assert.ok(six.map.height > six.map.width);
  assert.ok(six.map.tiles.length > two.map.tiles.length);
});

test('Accepted Standard maps have reachable equal early resources, valid placements and spaced starts', () => {
  for (const parameters of [{}, { water: 'OCEANIC' }, { mountains: 'EXTREME', mobility: 'VERY_FAST' }]) {
    const { map, provenance } = standard(parameters), starts = map.startLocations.filter(s => !s.cityState);
    assert.equal(provenance.assessment.accepted, true);
    assert.equal(new Set(provenance.assessment.starts.map(s => `${s.bonus}:${s.luxury}:${s.earlyStrategic}:${s.earlyStrategicUnits}`)).size, 1);
    assert.ok(provenance.assessment.starts.every(s => s.reachableLand >= provenance.plan.minimumOpeningLand));
    for (let i = 0; i < starts.length; i++) for (let j = 0; j < i; j++) assert.ok(distance(map, starts[i].y * map.width + starts[i].x, starts[j].y * map.width + starts[j].x) >= 7);
    for (const start of starts) {
      const seen = new Set([start.y * map.width + start.x]); let frontier = [...seen];
      for (let radius = 0; radius < 3; radius++) { const next: number[] = []; for (const i of frontier) for (const [x, y] of adjacentCoordinates(i % map.width, Math.floor(i / map.width), map.width, map.height, map.wraps)) { const j = y * map.width + x, tile = map.tiles[j]; if (!seen.has(j) && tile.terrain >= 2 && tile.elevation < 2) { seen.add(j); next.push(j); } } frontier = next; }
      const names = [...seen].map(i => map.resources[map.tiles[i].resource] ?? '');
      assert.equal(names.filter(name => ['RESOURCE_WHEAT','RESOURCE_CATTLE','RESOURCE_SHEEP','RESOURCE_DEER','RESOURCE_FISH'].includes(name)).length, 2);
      assert.equal(names.filter(name => name === 'RESOURCE_IRON').length, 1);
      assert.equal(names.filter(name => name === 'RESOURCE_HORSE').length, 1);
    }
    assert.ok(provenance.balance.normalizedTiles <= starts.length * 37);
    assert.ok(map.tiles.every(t => featurePlacementVerdict(map, t).valid && resourcePlacementVerdict(map, t).valid && wonderPlacementVerdict(map, t).valid));
  }
});

test('Advanced uses each native engine and retains its explicit recipe controls', () => {
  for (const [engine, preset] of [['EXCOGITARE', 'PANGAEA'], ['ECCENTRIC', 'GREAT_WATERSHEDS'], ['PHYSICAL', 'DYNAMIC_EARTH'], ['POLIS', 'CONTESTED_HEARTLAND']]) {
    const result = generateV3({ mode: 'ADVANCED', options: { engine, preset, size: 'DUEL', players: 2, cityStates: 0, waterPercent: 40, mountainPercent: 12, strategicStartGuarantee: false, luxuryStartGuarantee: false }, recipe: { scale: 'GLOBAL', archetype: 'EXISTING' } }, 'v3-advanced');
    assert.equal(result.provenance.plan.recipe.engine, engine);
    assert.equal(result.provenance.plan.recipe.settings.strategicStartGuarantee, false);
    assert.equal(result.provenance.plan.recipe.archetype, 'EXISTING');
    assert.equal(result.provenance.balance.normalized, false);
    assert.equal(result.provenance.assessment.accepted, true);
  }
});

test('Generated map serialization preserves geography and omits synthetic scenario starts', () => {
  const { map } = standard({ players: 2 }, 'round-trip'), bytes = serializeCiv5Map(map), restored = parseCiv5Map(bytes, 'V3 round trip');
  assert.equal(inspectCiv5MapStructure(bytes).filter(i => i.severity === 'ERROR').length, 0);
  const channels = (m: typeof map) => m.tiles.map(t => [t.terrain, t.elevation, t.feature, t.resource, t.resourceAmount, t.wonder, t.river, t.continent]);
  assert.equal(generationInputHash(channels(map)), generationInputHash(channels(restored)));
  assert.equal(restored.startLocations.length, 0);
});

test('Cancellation and infeasible rosters do not return an accepted result', () => {
  assert.throws(() => generateV3({ mode: 'STANDARD' }, 'cancel', { isCancelled: () => true }), GenerationCancelledError);
  assert.throws(() => generateV3({ mode: 'ADVANCED', options: { engine: 'EXCOGITARE', preset: 'ARCHIPELAGO', size: 'DUEL', players: 22, cityStates: 41, waterPercent: 90, cityStateMinSpacing: 12 } }, 'impossible'), /Could not satisfy/);
});


test('Automatic population rules and sparse warm islands remain feasible', () => {
  for (const preset of ['THREE_REALMS', 'LONELY_OCEANS']) {
    const result = generateV3({ mode: 'ADVANCED', options: { preset, size: 'TINY' } }, 'v3-catalogue');
    assert.equal(result.provenance.assessment.accepted, true);
    assert.equal(result.provenance.assessment.starts.length, preset === 'THREE_REALMS' ? 3 : 4);
  }
  assert.equal(generateV3({ mode: 'RANDOMISE' }, 'v3-random-9').provenance.assessment.accepted, true);
});


test('Competition changes real resource frontiers and Isolation changes ocean gates', () => {
  const low = standard({ competition: 'LOW' }, 'v3-flow-check'), intense = standard({ competition: 'INTENSE' }, 'v3-flow-check');
  assert.ok(intense.provenance.assessment.sharedResourceAccess > low.provenance.assessment.sharedResourceAccess + .3);
  const open = standard({ isolation: 'OPEN', water: 'HIGH' }, 'v3-flow-check'), isolated = standard({ isolation: 'EXTREME', water: 'HIGH' }, 'v3-flow-check');
  assert.ok(isolated.map.tiles.filter(tile => tile.terrain === 0).length > open.map.tiles.filter(tile => tile.terrain === 0).length);
});


test('Desktop Randomise all includes large sizes while mobile keeps compact sizes', () => {
  const desktop = new Set<string>(), mobile = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const a = normalizeV3Request({ mode: 'RANDOMISE', fullSizeRange: true }, `size-policy-${i}`);
    const b = normalizeV3Request({ mode: 'RANDOMISE' }, `size-policy-${i}`);
    assert.equal(a.mode, 'STANDARD'); assert.equal(b.mode, 'STANDARD');
    if (a.mode === 'STANDARD' && b.mode === 'STANDARD') { desktop.add(a.parameters.size); mobile.add(b.parameters.size); }
  }
  assert.ok(desktop.has('LARGE') && desktop.has('HUGE'));
  assert.ok(!mobile.has('LARGE') && !mobile.has('HUGE'));
  assert.throws(() => normalizeV3Request({ mode: 'RANDOMISE', fullSizeRange: 'yes' }, 'invalid'), /size policy/);
});
