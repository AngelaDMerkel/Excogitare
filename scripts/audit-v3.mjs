import assert from 'node:assert/strict';
import { generateV3 } from '../lib/v3/generate.ts';
import { MAP_PRESETS } from '../lib/map-generator.ts';
const rows = [];
for (const preset of MAP_PRESETS) {
  const result = generateV3({ mode: 'ADVANCED', options: { preset: preset.id, engine: preset.engine, size: 'TINY', players: preset.id === 'THREE_REALMS' ? 3 : 4, cityStates: preset.id === 'LONELY_OCEANS' ? 0 : 2 } }, 'v3-catalogue');
  assert.equal(result.provenance.assessment.accepted, true);
  assert.equal(result.provenance.assessment.coastlines.accepted, true);
  rows.push({ type: preset.id, candidate: result.provenance.candidate, players: result.provenance.assessment.starts.length, spread: result.provenance.assessment.scoreSpread });
}
for (let i = 0; i < 12; i++) {
  const result = generateV3({ mode: 'RANDOMISE' }, `v3-random-${i}`);
  assert.equal(result.provenance.assessment.accepted, true);
  assert.equal(result.provenance.assessment.coastlines.accepted, true);
  rows.push({ randomSeed: i, players: result.provenance.assessment.starts.length, spread: result.provenance.assessment.scoreSpread });
}
console.log(JSON.stringify({ passed: rows.length, nativeMapTypes: MAP_PRESETS.length, randomizedRequests: 12, rows }, null, 2));
