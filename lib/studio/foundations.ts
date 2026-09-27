import { createDemoMap, type Civ5Map } from "../civ5-map.ts";
import { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS, generateMap, type MapGenerationOptions } from "../map-generator.ts";
import type { EngineNarrativeStageSnapshot } from "../engine-narrative-diagnostics.ts";
import { fieldsFromNative, identifyFeatures } from "./geography.ts";
import { assess } from "./assessment.ts";
import { LANDSCAPES, defaultRecipe, hash, migrateRecipe, random, type StudioRecipe, type World } from "./model.ts";

export function mapOptions(recipe: StudioRecipe, seed = recipe.seed): MapGenerationOptions {
  const landscape = LANDSCAPES.find(l => l.id === recipe.landscape)!;
  const presetId = landscape.preset;
  const preset = MAP_PRESETS.find(p => p.id === presetId)!;
  const rng = random(seed);
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine, preset: preset.id, seed, size: recipe.size, geometry: recipe.geometry,
    wrapType: recipe.wraps ? "EAST_WEST" : "NONE", style: recipe.character,
    climateRealism: true, regionClimateLogic: "ORDERED",
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    waterPercent: Math.round(recipe.water[0] + rng() * (recipe.water[1] - recipe.water[0])),
    mountainPercent: Math.round(recipe.mountains[0] + rng() * (recipe.mountains[1] - recipe.mountains[0])),
    players: recipe.players, cityStates: recipe.cityStates,
    climate: recipe.temperature < 35 ? "COOL" : recipe.temperature > 65 ? "HOT" : "TEMPERATE",
    rainfall: recipe.rainfall < 35 ? "ARID" : recipe.rainfall > 65 ? "WET" : "NORMAL",
    erosionStrength: recipe.erosion < 34 ? "LIGHT" : recipe.erosion > 66 ? "STRONG" : preset.erosionStrength ?? "MODERATE",
    riverDensity: recipe.rivers < 34 ? "SPARSE" : recipe.rivers > 66 ? "DENSE" : "NORMAL",
    bonusAbundance: recipe.resources < 34 ? "SCARCE" : recipe.resources > 66 ? "ABUNDANT" : "STANDARD",
    luxuryAbundance: recipe.luxuries < 34 ? "SCARCE" : recipe.luxuries > 66 ? "ABUNDANT" : "STANDARD",
    strategicAbundance: recipe.strategics < 34 ? "SCARCE" : recipe.strategics > 66 ? "ABUNDANT" : "STANDARD",
    wonderCount: recipe.wonders, barbarianAbundance: "NONE", ruinAbundance: "NONE",
    balance: recipe.teams && recipe.players / recipe.teams >= 2 ? "TEAMS" : "STANDARD",
    teamSize: Math.max(2, Math.min(4, Math.ceil(recipe.players / Math.max(1, recipe.teams)))) as 2 | 3 | 4,
    teamLayout: "CLUSTERED",
  };
}
export function worldFromMap(map: Civ5Map, recipe = defaultRecipe(), origin: World["origin"] = "IMPORTED", snapshot?: EngineNarrativeStageSnapshot): World {
  const safe = structuredClone(map), fields = fieldsFromNative(safe, snapshot), features = identifyFeatures(safe, [], origin !== "GENERATED");
  const id = `foundation:${hash(`${recipe.seed}:${map.name}:${map.width}:${map.height}`).toString(36)}`;
  const baselineRecipe = { ...structuredClone(recipe), events: [] };
  return {
    version: 3, revision: 0, map: safe, recipe: structuredClone(recipe), base: [...fields.elevation], baseRivers: safe.tiles.map(t => t.river), fields,
    substrate: { id, seed: recipe.seed, engine: safe.structure?.engine ?? "INFERRED", confidence: snapshot?.reliefValues ? "NATIVE" : "INFERRED", tiles: structuredClone(safe.tiles), fields: structuredClone(fields), recipe: baselineRecipe, places: structuredClone(features), ...(snapshot?.reliefValues ? { nativeFields: { relief: [...snapshot.reliefValues], ...(snapshot.moistures ? { moisture: [...snapshot.moistures] } : {}), ...(snapshot.temperatures ? { temperature: [...snapshot.temperatures] } : {}) } } : {}) },
    strokes: [], locked: [], protections: [], features, origin, assessment: assess(safe, recipe),
    development: { causes: [{ id, kind: safe.structure?.engine ?? "INFERRED", label: snapshot ? "Retained native geography and its construction plan" : "Observed geography; physical fields inferred", tiles: [], parentIds: [], inferred: !snapshot }], changes: { direct: [], dependent: [], retained: safe.tiles.length, affectedPlaces: [], explanation: [] }, proposals: [], candidates: [] },
    messages: snapshot ? ["Native tiles and geographic plans retained. Raw engine fields are stored alongside a relief calibration for local editing."] : ["Physical fields are inferred from observed tiles. Original geography is preserved; its geological history is unknown."],
  };
}
export function migrateWorld(value: World | unknown): World {
  const old = value as World;
  if (!old || !old.map || !old.recipe) throw new Error("Invalid world record.");
  if (old.version === 3) {
    const current = structuredClone(old);
    if (current.substrate) current.substrate.seed ??= current.map.generation?.seed ?? current.recipe.seed;
    return current;
  }
  if ((old.version as number) !== 2) throw new Error("Unsupported world version.");
  const recipe = migrateRecipe(old.recipe), current = worldFromMap(old.map, { ...recipe, events: [] }, old.origin);
  current.revision = old.revision; current.label = old.label; current.source = old.source ? structuredClone(old.source) : undefined; current.locked = [...old.locked];
  current.substrate.legacyAuthoring = { recipe: structuredClone(old.recipe), strokes: structuredClone(old.strokes) };
  current.features = identifyFeatures(current.map, old.features, true); current.substrate.places = structuredClone(current.features);
  current.messages.push("Earlier V2 edits are preserved in this accepted foundation. Their prior physical causes were not retained, so future changes begin from this snapshot.");
  return current;
}
export function nativeFoundation(recipe: StudioRecipe, seed: string, progress: (label: string) => void = () => {}): World {
  let snapshot: EngineNarrativeStageSnapshot | undefined;
  const map = generateMap(mapOptions(recipe, seed), progress, { onEngineNarrativeStage: stage => { if (stage.reliefValues && (stage.stage === "RAW_NATIVE" || stage.stage === "NARRATIVE_REALIZED")) snapshot = stage; } });
  const landscape = LANDSCAPES.find(l => l.id === recipe.landscape)!;
  map.name = landscape.name;
  map.description = `${landscape.description} Seed ${seed}. Civ V assigns multiplayer starts.`;
  const world = worldFromMap(map, { ...recipe, seed }, "GENERATED", snapshot);
  if (!snapshot?.reliefValues) world.messages.push("This constructor did not supply continuous relief; the working field is inferred and its confidence is shown.");
  return world;
}
export function sampleWorld() { const map = createDemoMap(); map.name = "The Twin Continents"; return worldFromMap(map, defaultRecipe(), "SAMPLE"); }
