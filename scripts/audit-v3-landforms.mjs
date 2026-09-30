import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { generateV3, V3_GENERATOR_VERSION } from '../lib/v3/generate.ts';
import { MAP_PRESETS } from '../lib/map-generator.ts';
const rows = [], failures = [];
function run(options, seed, label) {
  try {
    const result = generateV3({ mode: 'ADVANCED', options }, seed), map = result.map, q = result.provenance.assessment.coastlines;
    assert.equal(q.accepted, true);
    assert.equal(result.provenance.assessment.accepted, true);
    rows.push({ label, seed, type: result.provenance.plan.recipe.mapType, engine: result.provenance.plan.recipe.engine, size: options.size, geometry: options.geometry ?? 'STANDARD', wraps: map.wraps, water: result.provenance.assessment.waterPercent, waterTarget: result.provenance.plan.recipe.settings.waterPercent, inspected: q.inspected, regular: q.regularComponents, candidate: result.provenance.candidate });
  } catch (error) { failures.push({ label, seed, message: error.message }); }
}
for (const p of MAP_PRESETS) run({ preset: p.id, engine: p.engine, size: 'TINY', players: p.id === 'THREE_REALMS' ? 3 : 4, cityStates: p.id === 'LONELY_OCEANS' ? 0 : 2 }, 'v3-catalogue', 'catalogue');
for (const p of MAP_PRESETS.filter(p => p.engine === 'EXCOGITARE')) {
  for (const geometry of ['STANDARD', 'SQUARE', 'WIDE', 'TALL']) for (const variant of [0, 1]) {
    run({ preset: p.id, engine: p.engine, size: variant ? 'SMALL' : 'TINY', geometry, players: 4, cityStates: 0, waterPercent: p.water, mountainPercent: p.mountains, wrapType: variant ? 'EAST_WEST' : 'NONE' }, `coast:${p.id}:${geometry}:${variant}`, 'field-geometry');
  }
}
for (let i = 0; i < 12; i++) {
  try { const r = generateV3({ mode: 'RANDOMISE' }, `v3-random-${i}`); assert.ok(r.provenance.assessment.coastlines.accepted); rows.push({ label: 'randomise', seed: i, type: r.provenance.plan.recipe.mapType, candidate: r.provenance.candidate, inspected: r.provenance.assessment.coastlines.inspected }); }
  catch(error) { failures.push({ label: 'randomise', seed: i, message: error.message }); }
}
const report = { generatorVersion: V3_GENERATOR_VERSION, cases: rows.length + failures.length, passed: rows.length, failed: failures.length, failures, rows };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
