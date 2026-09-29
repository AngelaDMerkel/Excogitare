// Build illustration assets with existing generators. This is not a V3 engine.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GENERATION_OPTIONS, generateMap } from '../../lib/map-generator.ts';

const source = process.argv[2];
if (!source) throw new Error('Provide the existing V2 starter-world.json path.');
const compact = map => ({ width: map.width, height: map.height, terrains: map.terrains, features: map.features, resources: map.resources, wonders: map.wonders, tiles: map.tiles.map(t => [t.terrain, t.elevation, t.feature, t.river, t.resource, t.wonder]), starts: map.startLocations.filter(s => !s.cityState).slice(0, 4).map(s => [s.x, s.y]) });
const sample = JSON.parse(readFileSync(source, 'utf8')).map;
const samples = [{ id: 'watersheds', title: 'The Verdant Divide', subtitle: 'Rival valleys, a shared horizon.', description: 'Mountain-fed valleys gather around a sheltered inland sea. The easy land lies close to home; the interesting choices lie across the water.', premise: 'Rival watersheds', seed: 'watersheds-v3:candidate-2', tags: ['River country', 'Inland seas', 'Mountain crossings'], map: compact(sample) }];
for (const [id, preset, engine, title, subtitle, description, premise, water, mountains, tags] of [
  ['shores', 'ARCHIPELAGO', 'EXCOGITARE', 'The Drowned Coast', 'A continent remembered by its islands.', 'Long ridges survive as islands above drowned lowlands. Sheltered shores offer a foothold; distant land rewards a willingness to sail.', 'Scattered shores', 71, 12, ['Island homelands', 'Coastal journeys', 'Distant horizons']],
  ['winter', 'ICEHOUSE_EARTH', 'PHYSICAL', 'The Winter Marches', 'Good land at the edge of the cold.', 'A few generous valleys interrupt the frozen uplands. Follow the thaw toward new ground, or make a home behind the mountains.', 'Cold frontiers', 40, 15, ['Temperate refuges', 'Cold uplands', 'Narrow approaches']],
  ['watersheds-2', 'GREAT_WATERSHEDS', 'ECCENTRIC', 'The Long Confluence', 'Separate valleys, connected stories.', 'Broad rivers lead out of wooded uplands toward a common lowland. Several crossings put the next valley within reach.', 'Rival watersheds', 34, 14, ['Wooded uplands', 'Shared lowlands', 'River crossings']],
  ['shores-2', 'ARCHIPELAGO', 'EXCOGITARE', 'The Quiet Archipelago', 'Every coast suggests another journey.', 'Scattered highlands keep their distance across a wide shallow sea. Inland shelter and coastal opportunity pull settlement in different directions.', 'Scattered shores', 69, 10, ['Sheltered islands', 'Open water', 'Coastal choices']],
  ['winter-2', 'ICEHOUSE_EARTH', 'PHYSICAL', 'The Last Green Shore', 'A foothold between ice and ocean.', 'The habitable shores hold room for a beginning. Beyond them, cold ridges separate the next stretch of useful land.', 'Cold frontiers', 43, 12, ['Green refuges', 'Frozen divides', 'Distant shores']],
]) {
  const seed = `v3-mockup-${id}-2026`;
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, seed, engine, preset, size: 'STANDARD', players: 4, cityStates: 0, waterPercent: water, mountainPercent: mountains, style: 'REALISTIC', climate: id === 'winter' ? 'COOL' : 'TEMPERATE', wrapType: 'NONE' });
  samples.push({ id, family: id.split('-')[0], title, subtitle, description, premise, seed, tags, map: compact(map) });
  console.log(`Prepared ${id}: ${map.width}×${map.height}`);
}
writeFileSync(fileURLToPath(new URL('./samples.js', import.meta.url)), `// Existing-engine illustration fixtures. No V3 generation or balance claim.\nwindow.V3_MAP_SAMPLES = ${JSON.stringify(samples)};\n`);
console.log(`Saved ${samples.length} illustration fixtures.`);
