import { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS, resolveMapDimensions, type MapGenerationOptions, type MapPresetId } from '../map-generator.ts';
import { generationRecipeFromOptions, type GenerationRecipe } from '../generation-recipe.ts';
import type { GenerationConstraintPayload } from '../generation-constraints.ts';
import { advancedRecipe, choose, randomStream, type V3Request } from './request.ts';
import { deterministicPassSeed } from '../generation-pass-graph.ts';
import { noise } from './spatial.ts';
import { HEX_ROW_HEIGHT } from '../generation-space.ts';
export type V3Plan = { version: 1; seed: string; premise: string; isolationMechanism: 'OPEN' | 'OCEAN' | 'PASSES' | 'DRY_INTERIOR'; recipe: GenerationRecipe; homelands: { x: number; y: number }[]; minimumOpeningLand: number; resourceFloor: number; competition: number; isolationStrength: number };
export function compileV3Plan(request: V3Request): V3Plan {
  if (request.mode === 'ADVANCED') { const recipe = advancedRecipe(request); return { version: 1, seed: request.seed, premise: MAP_PRESETS.find(p => p.id === recipe.mapType)!.label, isolationMechanism: recipe.settings.waterPercent > 60 ? 'OCEAN' : 'OPEN', recipe, homelands: [], minimumOpeningLand: 7, resourceFloor: 1, competition: .5, isolationStrength: .5 }; }
  const p = request.parameters, random = randomStream(request.seed, 'plan');
  const water = { MINIMAL: 10, LOW: 28, MODERATE: 48, HIGH: 68, OCEANIC: 82 }[p.water];
  const mountains = { NONE: 0, FEW: 6, MODERATE: 15, MANY: 27, EXTREME: 38 }[p.mountains];
  const isolation = ['OPEN', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'].indexOf(p.isolation) / 4;
  const competition = ['LOW', 'MODERATE', 'HIGH', 'INTENSE'].indexOf(p.competition) / 3;
  const mechanism = isolation < .4 ? 'OPEN' : water >= 60 ? 'OCEAN' : mountains >= 20 ? 'PASSES' : 'DRY_INTERIOR';
  const pool: MapPresetId[] = mechanism === 'OCEAN' ? ['RIFT_REALMS', 'EARTHSEA'] : water >= 65 ? ['ARCHIPELAGO', 'ISLAND_ARC_EARTH'] : mechanism === 'PASSES' ? ['COLLIDING_PLATES', 'TECTONIC_CONTINENTS'] : mechanism === 'DRY_INTERIOR' ? ['SUPERCONTINENT_INTERIOR', 'CONTINENTS'] : competition > .6 ? ['CONTESTED_HEARTLAND', 'OPPOSING_FRONTS'] : water < 35 ? ['INLAND_SEAS', 'GREAT_WATERSHEDS'] : ['CONTINENTS', 'DYNAMIC_EARTH', 'LIVING_WORLD'];
  const presetId = choose(pool, random);
  const preset = MAP_PRESETS.find(item => item.id === presetId)!;
  const abundance = p.challenge === 'GENTLE' ? 'ABUNDANT' : p.challenge === 'HARSH' ? 'SCARCE' : 'STANDARD';
  const options: MapGenerationOptions = { ...DEFAULT_GENERATION_OPTIONS, engine: preset.engine, preset: preset.id, seed: request.seed, size: p.size, geometry: p.geometry, players: p.players, cityStates: p.players, style: 'REALISTIC', wrapType: 'NONE', waterPercent: water, mountainPercent: mountains, climate: ['COLD', 'COOL'].includes(p.climate) ? 'COOL' : ['WARM', 'HOT'].includes(p.climate) ? 'HOT' : 'TEMPERATE', rainfall: mechanism === 'DRY_INTERIOR' && isolation > .6 ? 'ARID' : choose(['NORMAL', 'WET'] as const, random), climateRealism: true, regionClimateLogic: 'ORDERED', regionContrast: p.regionalVariety === 'DRAMATIC' ? 'EXTREME' : p.regionalVariety === 'UNIFORM' ? 'BLENDED' : 'VARIED', granularity: p.regionalVariety === 'DRAMATIC' ? 'VERY_HIGH' : p.regionalVariety === 'UNIFORM' ? 'LOW' : 'FAIR', bonusAbundance: abundance, strategicAbundance: abundance, luxuryAbundance: abundance, balance: 'STANDARD', startQuality: 'STANDARD', strategicBalance: false, polisExpansionPressure: competition > .6 ? 'IMMEDIATE' : competition < .2 ? 'RELAXED' : 'STANDARD', polisContestedResourcePercent: Math.round(15 + competition * 65), polisChokepointDensity: Math.round(isolation * 80), polisSymmetry: 'EQUIVALENT', wonderCount: Math.max(2, Math.round(p.players / 2)), dominantTerrains: [] };
  const { width, height } = resolveMapDimensions(options.size, options.geometry), homelands: V3Plan['homelands'] = [];
  // Farthest-point sampling supplies varied starting regions, not a fixed ring.
  const spread = 1 - competition * .23 + (isolation - .5) * .16;
  for (let i = 0; i < p.players; i++) {
    const candidates = Array.from({ length: 48 }, () => ({ x: Math.round(width * (.5 + (random() - .5) * .78 * spread)), y: Math.round(height * (.5 + (random() - .5) * .72 * spread)) }));
    const distance = (point: { x: number; y: number }) => homelands.length ? Math.min(...homelands.map(other => Math.hypot(point.x - other.x, (point.y - other.y) * HEX_ROW_HEIGHT))) : 1;
    candidates.sort((a, b) => distance(b) - distance(a)); homelands.push(candidates[0]);
  }
  return { version: 1, seed: request.seed, premise: mechanism === 'OCEAN' ? 'Distant maritime homelands' : mechanism === 'PASSES' ? 'Rival valleys and mountain crossings' : mechanism === 'DRY_INTERIOR' ? 'Fertile borders around a difficult interior' : competition > .6 ? 'Shared frontier and contested expansion' : 'Connected homelands and open frontiers', isolationMechanism: mechanism, recipe: generationRecipeFromOptions(options), homelands, minimumOpeningLand: p.challenge === 'GENTLE' ? 15 : 12, resourceFloor: p.challenge === 'GENTLE' ? 3 : p.challenge === 'HARSH' ? 1 : 2, competition, isolationStrength: isolation };
}
export function homelandConstraints(plan: V3Plan): GenerationConstraintPayload | undefined {
  if (!plan.homelands.length) return undefined;
  const { width, height } = resolveMapDimensions(plan.recipe.settings.size, plan.recipe.settings.geometry), n = width * height;
  const constraints: GenerationConstraintPayload = { schemaVersion: 1, width, height, adapter: ({ EXCOGITARE: 'EXCOGITARE_FIELDS', ECCENTRIC: 'ECCENTRIC_GRAPH', PHYSICAL: 'PHYSICAL_BOUNDARY', POLIS: 'POLIS_STRATEGIC' } as const)[plan.recipe.engine], topology: new Int8Array(n).fill(-1), elevation: new Int8Array(n).fill(-1), terrain: new Int16Array(n).fill(-1), feature: new Int16Array(n).fill(-1), hydrologyMask: new Uint8Array(n), rivers: new Uint8Array(n), contentMask: new Uint8Array(n), startsMask: new Uint8Array(n), scenarioMask: new Uint8Array(n), semantics: [], sourceStarts: [], constrainedChannels: ['TOPOLOGY', 'ELEVATION'] };
  // Influence native fields, plates and strategic anchors without stamping
  // guaranteed circular islands onto whichever water happens to lie below them.
  const radius = Math.max(4, Math.sqrt(n * (1 - plan.recipe.settings.waterPercent / 100) / plan.homelands.length) / 3);
  const seed = deterministicPassSeed(plan.seed, 'V3:homelands', 1);
  for (const [player, point] of plan.homelands.entries()) {
    const members: number[] = [];
    for (let y = Math.max(0, Math.floor(point.y - radius * 1.3)); y <= Math.min(height - 1, Math.ceil(point.y + radius * 1.3)); y++) {
      for (let x = Math.max(0, Math.floor(point.x - radius * 1.3)); x <= Math.min(width - 1, Math.ceil(point.x + radius * 1.3)); x++) {
        if (Math.hypot(x - point.x, y - point.y) <= radius * (.75 + noise(x / 4, y / 4, seed + player) * .5)) members.push(y * width + x);
      }
    }
    constraints.semantics.push({ id: `v3-homeland-${player}`, sourceSemanticId: `v3:homeland:${player}`, objectKind: plan.recipe.engine === 'POLIS' ? 'STRATEGIC_REGION' : 'CONTINENT', policy: 'FUNCTION', hard: false, tileIndices: members, anchorIndex: point.y * width + point.x, relatedAnchors: [] });
  }
  return constraints;
}
