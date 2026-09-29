import { V3_MAP_SIZES, V3_MAP_GEOMETRIES, V3_RANDOM_SIZES, V3_RANDOM_GEOMETRIES } from './dimensions.ts';
import { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS, type MapGenerationOptions } from '../map-generator.ts';
import { generationRecipeFromOptions, type GenerationRecipe } from '../generation-recipe.ts';
import { ARCHETYPE_PROFILES } from '../world-archetype.ts';
import { deterministicPassSeed } from '../generation-pass-graph.ts';

export const STANDARD_CHOICES = {
  players: [2, 3, 4, 6, 8], size: V3_MAP_SIZES.map(size => size.id),
  geometry: V3_MAP_GEOMETRIES.map(geometry => geometry.id), mobility: ['VERY_SLOW', 'SLOW', 'MODERATE', 'FAST', 'VERY_FAST'],
  isolation: ['OPEN', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'], water: ['MINIMAL', 'LOW', 'MODERATE', 'HIGH', 'OCEANIC'],
  mountains: ['NONE', 'FEW', 'MODERATE', 'MANY', 'EXTREME'], challenge: ['GENTLE', 'MODERATE', 'DEMANDING', 'HARSH'],
  regionalVariety: ['UNIFORM', 'SUBTLE', 'VARIED', 'DRAMATIC'], competition: ['LOW', 'MODERATE', 'HIGH', 'INTENSE'],
  climate: ['COLD', 'COOL', 'TEMPERATE', 'WARM', 'HOT'],
} as const;
export type StandardParameters = { [K in keyof typeof STANDARD_CHOICES]: (typeof STANDARD_CHOICES)[K][number] };
export const STANDARD_DEFAULTS: StandardParameters = { players: 4, size: 'STANDARD', geometry: 'STANDARD', mobility: 'MODERATE', isolation: 'MODERATE', water: 'MODERATE', mountains: 'MODERATE', challenge: 'MODERATE', regionalVariety: 'VARIED', competition: 'MODERATE', climate: 'TEMPERATE' };
export type V3Request = { mode: 'STANDARD'; seed: string; parameters: StandardParameters } | { mode: 'ADVANCED'; seed: string; options: Partial<MapGenerationOptions>; recipe: Partial<Pick<GenerationRecipe, 'scale' | 'archetype' | 'archetypeIntensity' | 'effort'>> };
export function randomStream(seed: string, stage: string) {
  let state = deterministicPassSeed(seed, `V3:${stage}`, 1);
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function choose<T>(items: readonly T[], random: () => number): T { return items[Math.floor(random() * items.length)]; }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Generation settings must be an object.'); return value as Record<string, unknown>; }
const domains: Record<string, readonly unknown[]> = {
  engine: ['EXCOGITARE', 'ECCENTRIC', 'PHYSICAL', 'POLIS'], preset: MAP_PRESETS.map(p => p.id), size: STANDARD_CHOICES.size,
  geometry: STANDARD_CHOICES.geometry, projectionType: ['NORTH_SOUTH', 'POLAR_CENTERED', 'EQUATORIAL_POLE'],
  wrapType: ['PRESET', 'EAST_WEST', 'NONE'], style: ['REALISTIC', 'FANTASTICAL', 'MUNDANE', 'BRUTAL'], modifier: ['NONE', 'STRATEGIC_DEPTH', 'FRACTURED', 'DOOMSDAY'],
  climate: ['COOL', 'TEMPERATE', 'HOT'], rainfall: ['ARID', 'NORMAL', 'WET'], riverDensity: ['SPARSE', 'NORMAL', 'DENSE'], worldAge: ['YOUNG', 'NORMAL', 'OLD'],
  bonusAbundance: ['SCARCE', 'STANDARD', 'ABUNDANT'], luxuryAbundance: ['SCARCE', 'STANDARD', 'ABUNDANT'], strategicAbundance: ['SCARCE', 'STANDARD', 'ABUNDANT'], strategicDistribution: ['EVEN', 'REGIONAL', 'CLUSTERED'],
  balance: ['STANDARD', 'TOURNAMENT', 'TEAMS'], startQuality: ['STANDARD', 'BALANCED', 'LEGENDARY'], teamSize: [2, 3, 4], teamLayout: ['CLUSTERED', 'FRONTLINES', 'DISTRIBUTED'],
  cityStateDistribution: ['EVEN', 'REGIONAL'], cityStateCoastalPreference: ['ANY', 'PREFER', 'REQUIRE'], barbarianAbundance: ['NONE', 'SCARCE', 'STANDARD', 'RAGING'], ruinAbundance: ['NONE', 'SCARCE', 'STANDARD', 'RAGING'],
  fantasticality: ['RESTRAINED', 'MYTHIC', 'UNBOUND'], granularity: ['LOW', 'FAIR', 'HIGH', 'VERY_HIGH'], regionClimateLogic: ['LAWLESS', 'INFLUENCED', 'ORDERED'], regionContrast: ['BLENDED', 'VARIED', 'EXTREME'], eccentricExtreme: ['NONE', 'SNOWBALL', 'JURASSIC', 'ARRAKIS', 'ARBOREA'],
  plateActivity: ['QUIET', 'NORMAL', 'VIOLENT'], erosionStrength: ['LIGHT', 'MODERATE', 'STRONG'], physicalRotation: ['PROGRADE', 'RETROGRADE'], physicalSeasonality: ['MILD', 'EARTHLIKE', 'EXTREME'], physicalOceanInfluence: ['WEAK', 'NORMAL', 'STRONG'],
  polisConflictPattern: ['RADIAL', 'OPPOSING_FRONTS', 'CROSSROADS', 'RIVAL_CONTINENTS'], polisSymmetry: ['EQUIVALENT', 'MIRRORED', 'ROTATIONAL', 'ASYMMETRIC'], polisExpansionPressure: ['RELAXED', 'STANDARD', 'IMMEDIATE'], polisNavalImportance: ['LOW', 'BALANCED', 'HIGH'],
};
const ranges: Record<string, readonly [number, number]> = { players: [2, 22], cityStates: [0, 41], waterPercent: [0, 90], mountainPercent: [0, 38], offshoreOilPercent: [0, 100], cityStateMinSpacing: [5, 12], wonderCount: [0, 12], wonderMinSpacing: [3, 20], wonderStartBuffer: [0, 15], barbarianStartDistance: [2, 15], ruinStartDistance: [1, 12], oceanBasins: [1, 5], coastalRangePercent: [0, 100], polisChokepointDensity: [0, 100], polisContestedResourcePercent: [0, 100], polisSafeRadius: [2, 8] };
const recipeDomains: Record<string, readonly string[]> = { scale: ['GLOBAL', 'CONTINENTAL', 'REGIONAL', 'PROVINCIAL', 'LOCAL'], archetype: ['EXISTING', 'NARRATIVE_DEFAULT', ...Object.keys(ARCHETYPE_PROFILES)], archetypeIntensity: ['HINT', 'STRONG', 'TRANSFORMATIVE'], effort: ['STANDARD', 'THOROUGH', 'EXHAUSTIVE'] };
export function normalizeV3Request(input: unknown, suppliedSeed?: string): V3Request {
  const raw = object(input), seedValue = raw.seed ?? (raw.mode === 'ADVANCED' ? object(raw.options ?? {}).seed : undefined) ?? suppliedSeed;
  if (typeof seedValue !== 'string') throw new Error('A text seed is required.');
  const seed = seedValue.trim();
  if (!seed || seed.length > 160) throw new Error('A seed of 1–160 characters is required.');
  if (raw.mode === 'RANDOMISE') {
    const random = randomStream(seed, 'randomise'), parameters = { ...STANDARD_DEFAULTS };
    for (const key of Object.keys(STANDARD_CHOICES) as (keyof StandardParameters)[]) (parameters as Record<string, unknown>)[key] = choose((key === 'size' ? V3_RANDOM_SIZES : key === 'geometry' ? V3_RANDOM_GEOMETRIES : STANDARD_CHOICES[key]) as readonly unknown[], random);
    if (raw.fullSizeRange !== undefined && typeof raw.fullSizeRange !== 'boolean') throw new Error('The random size policy must be enabled or disabled.');
    if (!raw.fullSizeRange) parameters.size = choose(['TINY', 'SMALL', 'STANDARD'] as const, random);
    return { mode: 'STANDARD', seed, parameters };
  }
  if (raw.mode === 'STANDARD') {
    const values = { ...STANDARD_DEFAULTS, ...object(raw.parameters ?? {}) };
    for (const [key, value] of Object.entries(values)) if (!(STANDARD_CHOICES[key as keyof StandardParameters] as readonly unknown[] | undefined)?.includes(value)) throw new Error(`Unsupported Standard ${key}: ${String(value)}.`);
    return { mode: 'STANDARD', seed, parameters: values as StandardParameters };
  }
  if (raw.mode !== 'ADVANCED') throw new Error('Choose Standard or Advanced generation.');
  const options = object(raw.options ?? {}), recipe = object(raw.recipe ?? {});
  for (const [key, value] of Object.entries(options)) {
    if (key === 'seed') continue;
    if (domains[key]) { if (!domains[key].includes(value)) throw new Error(`Unsupported ${key}.`); }
    else if (ranges[key]) { const [min, max] = ranges[key]; if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`); }
    else if (typeof DEFAULT_GENERATION_OPTIONS[key as keyof MapGenerationOptions] === 'boolean') { if (typeof value !== 'boolean') throw new Error(`${key} must be enabled or disabled.`); }
    else throw new Error(`Unsupported Advanced option: ${key}.`);
  }
  for (const [key, value] of Object.entries(recipe)) if (!recipeDomains[key]?.includes(String(value))) throw new Error(`Unsupported recipe ${key}.`);
  const preset = MAP_PRESETS.find(p => p.id === options.preset);
  if (preset && options.engine && preset.engine !== options.engine) throw new Error('The map type belongs to a different engine.');
  return { mode: 'ADVANCED', seed, options: { ...options, seed }, recipe: { ...recipe } } as V3Request;
}
export function advancedRecipe(request: Extract<V3Request, { mode: 'ADVANCED' }>): GenerationRecipe {
  const random = randomStream(request.seed, 'plan');
  const preset = MAP_PRESETS.find(p => p.id === request.options.preset) ?? choose(MAP_PRESETS.filter(p => !request.options.engine || p.engine === request.options.engine), random);
  const options: MapGenerationOptions = { ...DEFAULT_GENERATION_OPTIONS, engine: preset.engine, preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, climateRealism: preset.climateRealism ?? false, style: 'REALISTIC', players: preset.id === 'THREE_REALMS' ? 3 : 4, cityStates: preset.id === 'LONELY_OCEANS' ? 0 : 4, seed: request.seed, ...request.options, dominantTerrains: [] };
  return { ...generationRecipeFromOptions(options), ...request.recipe };
}
