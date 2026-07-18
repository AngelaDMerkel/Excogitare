import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import { resourcePlacementVerdict, wonderPlacementVerdict } from "./civ5-rules.ts";
import type { ArchetypeIntensity, WorldArchetype } from "./generation-recipe.ts";
import type { GenerationStyle, MapGenerationOptions } from "./map-generator.ts";

type LandTerrain = 2 | 3 | 4 | 5 | 6;
type SurfaceFeature = 0 | 1 | 2 | 4 | 5 | 255;

export type ArchetypeProfile = {
  id: Exclude<WorldArchetype, "EXISTING" | "NARRATIVE_DEFAULT">;
  label: string;
  description: string;
  compatibleCharacters: readonly GenerationStyle[];
  climateEnvelope: { temperature: readonly [number, number]; moisture: readonly [number, number] };
  terrainWeights: ReadonlyArray<readonly [terrain: LandTerrain, weight: number]>;
  featureWeights: ReadonlyArray<readonly [feature: SurfaceFeature, weight: number]>;
  resourceEcology: readonly string[];
  wonderTendencies: readonly string[];
};

export const ARCHETYPE_PROFILES: Record<ArchetypeProfile["id"], ArchetypeProfile> = {
  TEMPERATE: { id: "TEMPERATE", label: "Temperate", description: "Mixed grassland, plains and deciduous forest under a moderate seasonal climate.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE"], climateEnvelope: { temperature: [0.38, 0.7], moisture: [0.36, 0.72] }, terrainWeights: [[2, 0.58], [3, 0.42]], featureWeights: [[0, 0.28], [255, 0.72]], resourceEcology: ["grain", "cattle", "deer", "horses"], wonderTendencies: ["forested uplands", "fertile valleys"] },
  JUNGLE: { id: "JUNGLE", label: "Jungle", description: "Hot, wet forest basins broken by marshes and narrow cleared country.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE"], climateEnvelope: { temperature: [0.7, 1], moisture: [0.68, 1] }, terrainWeights: [[2, 0.76], [3, 0.24]], featureWeights: [[1, 0.62], [2, 0.1], [0, 0.1], [255, 0.18]], resourceEcology: ["spices", "gems", "bananas", "sugar"], wonderTendencies: ["rainforest interiors", "humid mountain margins"] },
  SUNSCOURGED: { id: "SUNSCOURGED", label: "Sunscourged", description: "Austere desert and dry steppe organized around rare oases and river life.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"], climateEnvelope: { temperature: [0.68, 1], moisture: [0, 0.3] }, terrainWeights: [[4, 0.74], [3, 0.26]], featureWeights: [[4, 0.045], [255, 0.955]], resourceEcology: ["oil", "gold", "sheep", "oasis food"], wonderTendencies: ["desert massifs", "isolated fertile basins"] },
  WORLDFROST: { id: "WORLDFROST", label: "Worldfrost", description: "Snow and tundra consume the world while scarce productive refuges retain disproportionate value.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"], climateEnvelope: { temperature: [0, 0.28], moisture: [0.12, 0.72] }, terrainWeights: [[6, 0.58], [5, 0.34], [3, 0.08]], featureWeights: [[0, 0.07], [255, 0.93]], resourceEcology: ["deer", "fish", "whales", "furs", "strategic minerals"], wonderTendencies: ["glacial margins", "geothermal refuges"] },
  MONSOON: { id: "MONSOON", label: "Monsoon", description: "Seasonally drenched grasslands, jungle belts and marshy river plains.", compatibleCharacters: ["REALISTIC", "FANTASTICAL"], climateEnvelope: { temperature: [0.58, 0.94], moisture: [0.56, 1] }, terrainWeights: [[2, 0.68], [3, 0.32]], featureWeights: [[1, 0.36], [2, 0.25], [0, 0.12], [255, 0.27]], resourceEcology: ["rice-like grain", "spices", "sugar", "cattle"], wonderTendencies: ["floodplains", "monsoon escarpments"] },
  MEDITERRANEAN: { id: "MEDITERRANEAN", label: "Mediterranean", description: "Dry plains and scrubby grasslands cluster around valuable coasts and folded uplands.", compatibleCharacters: ["REALISTIC", "MUNDANE"], climateEnvelope: { temperature: [0.5, 0.82], moisture: [0.26, 0.58] }, terrainWeights: [[3, 0.52], [2, 0.34], [4, 0.14]], featureWeights: [[0, 0.18], [255, 0.82]], resourceEcology: ["wine", "olives", "fish", "sheep"], wonderTendencies: ["coastal cliffs", "limestone interiors"] },
  STEPPE: { id: "STEPPE", label: "Steppe", description: "Broad dry plains and cold grasslands favor movement, horses and exposed frontiers.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"], climateEnvelope: { temperature: [0.28, 0.62], moisture: [0.16, 0.42] }, terrainWeights: [[3, 0.72], [5, 0.18], [2, 0.1]], featureWeights: [[0, 0.08], [255, 0.92]], resourceEcology: ["horses", "sheep", "cattle", "uranium"], wonderTendencies: ["open plateaus", "remote mountain lakes"] },
  SAVANNA: { id: "SAVANNA", label: "Savanna", description: "Warm seasonal plains retain grassland corridors and scattered wooded country.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE"], climateEnvelope: { temperature: [0.62, 0.94], moisture: [0.28, 0.58] }, terrainWeights: [[3, 0.66], [2, 0.2], [4, 0.14]], featureWeights: [[0, 0.12], [255, 0.88]], resourceEcology: ["cattle", "ivory-like luxuries", "horses", "gold"], wonderTendencies: ["isolated mesas", "rift lakes"] },
  MARSHLAND: { id: "MARSHLAND", label: "Marshland", description: "Low wet country, reed-choked basins and slow river plains dominate usable land.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "MUNDANE"], climateEnvelope: { temperature: [0.4, 0.82], moisture: [0.72, 1] }, terrainWeights: [[2, 0.72], [3, 0.28]], featureWeights: [[2, 0.48], [0, 0.16], [255, 0.36]], resourceEcology: ["fish", "sugar", "spices", "oil"], wonderTendencies: ["wetland deltas", "peat basins"] },
  VOLCANIC: { id: "VOLCANIC", label: "Volcanic", description: "Dark young soils and broken forest country cling to active mountain systems.", compatibleCharacters: ["REALISTIC", "FANTASTICAL", "BRUTAL"], climateEnvelope: { temperature: [0.42, 0.9], moisture: [0.28, 0.78] }, terrainWeights: [[3, 0.58], [4, 0.25], [2, 0.17]], featureWeights: [[0, 0.1], [255, 0.9]], resourceEcology: ["iron", "coal", "gems", "uranium"], wonderTendencies: ["volcanic chains", "caldera basins"] },
  JURASSIC: { id: "JURASSIC", label: "Jurassic", description: "Hot, saturated vegetation blankets a biologically extravagant world.", compatibleCharacters: ["FANTASTICAL", "REALISTIC"], climateEnvelope: { temperature: [0.72, 1], moisture: [0.7, 1] }, terrainWeights: [[2, 0.82], [3, 0.18]], featureWeights: [[1, 0.54], [2, 0.2], [0, 0.15], [255, 0.11]], resourceEcology: ["spices", "gems", "oil", "dense food"], wonderTendencies: ["primeval forests", "lost inland seas"] },
  POST_COLLAPSE: { id: "POST_COLLAPSE", label: "Post-Collapse", description: "Ordinary recovering terrain is scarred by sparse contamination and abandoned strategic ground.", compatibleCharacters: ["MUNDANE", "BRUTAL", "FANTASTICAL"], climateEnvelope: { temperature: [0.34, 0.78], moisture: [0.2, 0.66] }, terrainWeights: [[3, 0.56], [2, 0.28], [4, 0.16]], featureWeights: [[5, 0.09], [0, 0.12], [255, 0.79]], resourceEcology: ["salvage", "coal", "oil", "scarce food"], wonderTendencies: ["ruined corridors", "surviving green enclaves"] },
  FALLOUT_WASTES: { id: "FALLOUT_WASTES", label: "Fallout Wastes", description: "Contaminated desert and barren plains make clean land and intact resources strategic prizes.", compatibleCharacters: ["BRUTAL", "FANTASTICAL"], climateEnvelope: { temperature: [0.48, 0.9], moisture: [0.06, 0.38] }, terrainWeights: [[4, 0.58], [3, 0.36], [2, 0.06]], featureWeights: [[5, 0.31], [255, 0.69]], resourceEcology: ["uranium", "oil", "salvage", "isolated food"], wonderTendencies: ["impact wastes", "protected clean basins"] },
};

function hashUnit(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function seedSalt(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

function smooth(value: number) { return value * value * (3 - 2 * value); }

function coherentUnit(x: number, y: number, scale: number, salt: number) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const sample = (sx: number, sy: number) => hashUnit(Math.imul(sx + 4096, 8191) ^ Math.imul(sy + 4096, 131071), salt);
  const top = sample(x0, y0) * (1 - tx) + sample(x0 + 1, y0) * tx;
  const bottom = sample(x0, y0 + 1) * (1 - tx) + sample(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function weightedChoice<T>(weights: ReadonlyArray<readonly [T, number]>, value: number) {
  const total = weights.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  let cursor = value * Math.max(0.0001, total);
  for (const [choice, weight] of weights) {
    cursor -= Math.max(0, weight);
    if (cursor <= 0) return choice;
  }
  return weights.at(-1)![0];
}

function compatibleFeature(feature: SurfaceFeature, terrain: LandTerrain, elevation: number) {
  if (elevation === 2) return 255;
  if (feature === 1 || feature === 2) return terrain === 2 || terrain === 3 ? feature : 255;
  if (feature === 4) return terrain === 4 && elevation === 0 ? feature : 255;
  if (feature === 0) return terrain !== 4 && terrain !== 6 ? feature : 255;
  return feature;
}

export function archetypeStrength(intensity: ArchetypeIntensity) {
  return intensity === "HINT" ? 0.32 : intensity === "TRANSFORMATIVE" ? 1 : 0.68;
}

export function compatibleArchetypes(options: Pick<MapGenerationOptions, "style">) {
  return Object.values(ARCHETYPE_PROFILES).filter((profile) => profile.compatibleCharacters.includes(options.style));
}

export function randomCompatibleArchetype(options: Pick<MapGenerationOptions, "style">, random: () => number): WorldArchetype {
  const compatible = compatibleArchetypes(options);
  if (!compatible.length || random() < 0.18) return "NARRATIVE_DEFAULT";
  return compatible[Math.min(compatible.length - 1, Math.floor(random() * compatible.length))].id;
}

export function applyWorldArchetype(map: Civ5Map, archetype: WorldArchetype, intensity: ArchetypeIntensity = "STRONG"): Civ5Map {
  if (archetype === "EXISTING" || archetype === "NARRATIVE_DEFAULT") return map;
  const profile = ARCHETYPE_PROFILES[archetype];
  const salt = seedSalt(`${map.recipe?.settings.seed ?? map.generation?.seed ?? map.name}:${archetype}`);
  const strength = archetypeStrength(intensity);
  const regionScale = Math.max(3.5, Math.min(map.width, map.height) / 7);
  const tiles = map.tiles.map((source, index): Civ5Tile => {
    if (source.terrain < 2) return { ...source };
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const adoption = coherentUnit(x + 17, y + 29, regionScale * 0.72, salt ^ 0x6a09e667);
    if (adoption > strength) return { ...source };
    const terrain = weightedChoice(profile.terrainWeights, coherentUnit(x, y, regionScale, salt));
    const featureChoice = weightedChoice(profile.featureWeights, coherentUnit(x + 73, y + 41, regionScale * 0.58, salt ^ 0x9e3779b9));
    const feature = compatibleFeature(featureChoice, terrain, source.elevation);
    return { ...source, terrain, feature };
  });
  return { ...map, tiles };
}

const RESOURCE_ECOLOGY_TOKENS: Record<string, readonly string[]> = {
  grain: ["WHEAT"], cattle: ["CATTLE"], deer: ["DEER"], horses: ["HORSE"], spices: ["SPICES"], gems: ["GEMS"], bananas: ["WHEAT"], sugar: ["SUGAR"], oil: ["OIL"], gold: ["GOLD"], sheep: ["SHEEP"], "oasis food": ["WHEAT", "SHEEP"], fish: ["FISH"], whales: ["WHALE"], furs: ["FURS"], "strategic minerals": ["IRON", "COAL", "ALUMINUM", "URANIUM"], wine: ["WINE"], olives: ["WINE"], "rice-like grain": ["WHEAT"], "ivory-like luxuries": ["IVORY"], uranium: ["URANIUM"], iron: ["IRON"], coal: ["COAL"], "dense food": ["WHEAT", "CATTLE", "DEER", "FISH"], salvage: ["IRON", "COAL", "ALUMINUM"], "scarce food": ["WHEAT", "SHEEP", "DEER"], "isolated food": ["WHEAT", "SHEEP", "DEER"],
};

const WONDER_TENDENCY_TOKENS: Record<string, readonly string[]> = {
  "forested uplands": ["FUJI", "KAILASH"], "fertile valleys": ["VICTORIA", "FOUNTAIN"], "rainforest interiors": ["VICTORIA", "FOUNTAIN"], "humid mountain margins": ["FUJI", "KAILASH"], "desert massifs": ["ULURU", "GRAND_MESA"], "isolated fertile basins": ["FOUNTAIN", "VICTORIA"], "glacial margins": ["KAILASH", "OLD_FAITHFUL"], "geothermal refuges": ["OLD_FAITHFUL", "FUJI"], "coastal cliffs": ["GIBRALTAR", "KRAKATOA"], "limestone interiors": ["GRAND_MESA", "BARRINGER"], "floodplains": ["VICTORIA", "FOUNTAIN"], "monsoon escarpments": ["FUJI", "KAILASH"], "open plateaus": ["GRAND_MESA", "ULURU"], "remote mountain lakes": ["KAILASH", "VICTORIA"], "isolated mesas": ["GRAND_MESA", "BARRINGER"], "rift lakes": ["VICTORIA", "OLD_FAITHFUL"], "wetland deltas": ["VICTORIA", "FOUNTAIN"], "peat basins": ["VICTORIA", "OLD_FAITHFUL"], "volcanic chains": ["FUJI", "KRAKATOA"], "caldera basins": ["OLD_FAITHFUL", "KRAKATOA"], "primeval forests": ["FOUNTAIN", "EL_DORADO"], "lost inland seas": ["VICTORIA", "KRAKATOA"], "ruined corridors": ["BARRINGER", "GRAND_MESA"], "surviving green enclaves": ["FOUNTAIN", "VICTORIA"], "impact wastes": ["BARRINGER", "ULURU"], "protected clean basins": ["FOUNTAIN", "VICTORIA"],
};

function matchingIndices(values: readonly string[], terms: readonly string[], vocabulary: Record<string, readonly string[]>) {
  const tokens = terms.flatMap((term) => vocabulary[term] ?? [term.replaceAll(" ", "_").toUpperCase()]);
  return values.flatMap((value, index) => tokens.some((token) => value.includes(token)) ? [index] : []);
}

/** Biases a freshly regenerated content pass toward the selected ecology without changing counts or locations. */
export function applyArchetypeContentEcology(map: Civ5Map, archetype: WorldArchetype): Civ5Map {
  if (archetype === "EXISTING" || archetype === "NARRATIVE_DEFAULT") return map;
  const profile = ARCHETYPE_PROFILES[archetype];
  const preferredResources = matchingIndices(map.resources, profile.resourceEcology, RESOURCE_ECOLOGY_TOKENS);
  const preferredWonders = matchingIndices(map.wonders, profile.wonderTendencies, WONDER_TENDENCY_TOKENS);
  if (!preferredResources.length && !preferredWonders.length) return map;
  const salt = seedSalt(`${map.recipe?.settings.seed ?? map.generation?.seed ?? map.name}:${archetype}:content`);
  const tiles = map.tiles.map((source, index) => {
    const tile = { ...source };
    if (tile.resource !== 255 && preferredResources.length) {
      const legal = preferredResources.filter((resource) => resourcePlacementVerdict(map, { ...tile, resource }).valid);
      if (legal.length) tile.resource = legal[Math.min(legal.length - 1, Math.floor(hashUnit(index, salt) * legal.length))];
    }
    if (tile.wonder !== 255 && preferredWonders.length) {
      const legal = preferredWonders.filter((wonder) => wonderPlacementVerdict(map, { ...tile, wonder }).valid);
      if (legal.length) tile.wonder = legal[Math.min(legal.length - 1, Math.floor(hashUnit(index, salt ^ 0x510e527f) * legal.length))];
    }
    return tile;
  });
  return { ...map, tiles };
}

export function describeArchetype(archetype: WorldArchetype, intensity: ArchetypeIntensity) {
  if (archetype === "EXISTING") return "Retains the current surface without repainting it.";
  if (archetype === "NARRATIVE_DEFAULT") return "Delegates the environmental surface to Map Type and World Character.";
  const profile = ARCHETYPE_PROFILES[archetype];
  const consequence = intensity === "HINT" ? "A restrained share of the surface is repainted." : intensity === "STRONG" ? "The coat is dominant while existing geography remains visible." : "The complete surface and compatible content ecology are rebuilt in a confirmed preview.";
  return `${profile.description} ${consequence}`;
}
