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
  const baselineRecipe = structuredClone(recipe);
  return {
    version: 4, revision: 0, map: safe, recipe: structuredClone(recipe), base: [...fields.elevation], baseRivers: safe.tiles.map(t => t.river), fields,
    substrate: { id, seed: recipe.seed, engine: safe.structure?.engine ?? "INFERRED", confidence: snapshot?.reliefValues ? "NATIVE" : "INFERRED", tiles: structuredClone(safe.tiles), fields: structuredClone(fields), recipe: baselineRecipe, places: structuredClone(features), ...(snapshot?.reliefValues ? { nativeFields: { relief: [...snapshot.reliefValues], ...(snapshot.moistures ? { moisture: [...snapshot.moistures] } : {}), ...(snapshot.temperatures ? { temperature: [...snapshot.temperatures] } : {}) } } : {}) },
    strokes: [], locked: [], protections: [], features, origin, assessment: assess(safe, recipe),
    development: { operations: [{ id, kind: safe.structure?.engine ?? "INFERRED", label: snapshot ? "Retained native geography and its construction plan" : "Observed geography; physical fields inferred", tiles: [], parentIds: [], inferred: !snapshot }], changes: { direct: [], dependent: [], retained: safe.tiles.length, affectedPlaces: [], explanation: [] }, proposals: [], candidates: [] },
    messages: snapshot ? ["Native tiles and geographic plans retained. Raw engine fields are stored alongside a relief calibration for local editing."] : ["Physical fields are inferred from observed tiles. Original geography is preserved; its geological history is unknown."],
  };
}
/** Preserve old accepted maps; a fictional programme is never replayed during migration. */
export function migrateWorld(value: unknown): World {
  const old = value as Partial<Omit<World, "version" | "recipe">> & { version: number; recipe?: unknown };
  if (!old || !old.map || !old.recipe || ![2, 3, 4].includes(old.version)) throw new Error("Invalid or unsupported world record.");
  if (old.version === 4) return structuredClone(value) as World;
  const n = old.map.width * old.map.height;
  if (!Number.isInteger(n) || n < 1 || n > 20000 || !Array.isArray(old.map.tiles) || old.map.tiles.length !== n) throw new Error("The earlier world has an invalid or oversized grid.");
  const recipe = migrateRecipe(old.recipe);
  const earlierRecipe = old.recipe as { events?: unknown[] };
  if (earlierRecipe.events !== undefined && (!Array.isArray(earlierRecipe.events) || earlierRecipe.events.length > 8)) throw new Error("The earlier world's edit programme is malformed.");
  if (old.version === 2) {
    const current = worldFromMap(old.map, recipe, old.origin);
    current.revision = old.revision ?? 0;
    current.label = old.label;
    current.source = old.source ? structuredClone(old.source) : undefined;
    current.locked = [...(old.locked ?? [])];
    current.protections = structuredClone(old.protections ?? []);
    current.substrate.legacyAuthoring = { recipe: structuredClone(old.recipe), strokes: structuredClone(old.strokes ?? []) };
    current.features = identifyFeatures(current.map, old.features ?? [], true);
    current.substrate.places = structuredClone(current.features);
    current.messages.push("Earlier edits are preserved in the saved geography. Future changes begin from this landscape.");
    return current;
  }
  if (!old.substrate || !old.fields || !old.development) throw new Error("The earlier world is missing its retained geography.");
  const current = structuredClone(value) as World;
  current.version = 4;
  current.recipe = recipe;
  current.substrate.recipe = migrateRecipe(old.substrate.recipe);
  current.substrate.seed ??= current.map.generation?.seed ?? recipe.seed;
  const earlierDevelopment = old.development as unknown as { causes: World["development"]["operations"] };
  if (!Array.isArray(earlierDevelopment.causes)) throw new Error("The earlier world is missing its operation records.");
  current.development.operations = structuredClone(earlierDevelopment.causes);
  delete (current.development as unknown as Record<string, unknown>).causes;
  const replayable = current.development.candidates.filter(candidate => {
    const priorRecipe = candidate.recipe as unknown as { events?: unknown[] } | undefined;
    return !priorRecipe?.events?.length;
  });
  current.development.candidates = replayable.map(candidate => ({ ...candidate, ...(candidate.recipe ? { recipe: migrateRecipe(candidate.recipe) } : {}) }));
  if (earlierRecipe.events?.length) {
    // Save the accepted surface as the new editing baseline. Keep its previous
    // native fields and authoring programme as an archive, never active inputs.
    current.substrate = {
      id: `saved:${hash(JSON.stringify(current.map.tiles)).toString(36)}`,
      seed: current.substrate.seed,
      engine: current.substrate.engine,
      confidence: "RETAINED",
      tiles: structuredClone(current.map.tiles),
      fields: structuredClone(current.fields),
      recipe: structuredClone(recipe),
      places: structuredClone(current.features),
      legacyAuthoring: {
        recipe: structuredClone(old.recipe), strokes: structuredClone(old.strokes ?? []),
        foundation: structuredClone(old.substrate), operations: structuredClone(earlierDevelopment.causes),
      },
    };
    current.base = [...current.fields.elevation];
    current.baseRivers = current.map.tiles.map(tile => tile.river);
    current.strokes = [];
    current.development = {
      operations: [{ id: current.substrate.id, kind: "SAVED", label: "Previously edited geography retained", tiles: [], parentIds: [], inferred: false }],
      changes: { direct: [], dependent: [], retained: n, affectedPlaces: [], explanation: [] },
      proposals: [], candidates: [],
    };
    current.messages.push("Earlier programmed edits are preserved in this landscape. Their records are archived; new edits work directly on the saved geography.");
  }
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
