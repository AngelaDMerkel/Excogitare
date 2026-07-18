import type {
  GenerationEngine,
  GenerationStyle,
  MapGenerationOptions,
  MapPresetId,
  MultiplayerBalance,
  TeamLayout,
  WorldModifier,
} from "./map-generator.ts";

export const GENERATION_RECIPE_SCHEMA_VERSION = 1 as const;

export type WorldScale = "GLOBAL" | "CONTINENTAL" | "REGIONAL" | "PROVINCIAL" | "LOCAL";
export type ArchetypeIntensity = "HINT" | "STRONG" | "TRANSFORMATIVE";
export type WorldArchetype =
  | "EXISTING"
  | "NARRATIVE_DEFAULT"
  | "TEMPERATE"
  | "JUNGLE"
  | "SUNSCOURGED"
  | "WORLDFROST"
  | "MONSOON"
  | "MEDITERRANEAN"
  | "STEPPE"
  | "SAVANNA"
  | "MARSHLAND"
  | "VOLCANIC"
  | "JURASSIC"
  | "POST_COLLAPSE"
  | "FALLOUT_WASTES";
export type GenerationEffort = "STANDARD" | "THOROUGH" | "EXHAUSTIVE";
export type SeatControl = "HUMAN" | "AI" | "FLEXIBLE";
export type VictoryCondition = "DOMINATION" | "SCIENCE" | "CULTURE" | "DIPLOMACY" | "TIME";

export type SeatIntent = {
  control: SeatControl;
  team?: number;
};

export type MatchIntent = {
  schemaVersion: 1;
  humanPlayers: number;
  aiPlayers: number;
  flexiblePlayers: number;
  seats?: SeatIntent[];
  enabledVictories: VictoryCondition[];
  emphasizedVictories: VictoryCondition[];
  teamIntent: "FREE_FOR_ALL" | "FIXED_TEAMS" | "FLEXIBLE";
  competitiveStrictness: "CASUAL" | "BALANCED" | "TOURNAMENT" | "ASYMMETRIC";
  aiAccommodation: "NORMAL" | "STRONG";
  balanceMode: MultiplayerBalance;
  teamSize: 2 | 3 | 4;
  teamLayout: TeamLayout;
  strategicBalance: boolean;
};

type RecipeOwnedOption =
  | "engine"
  | "preset"
  | "style"
  | "modifier"
  | "players"
  | "cityStates"
  | "balance"
  | "teamSize"
  | "teamLayout"
  | "strategicBalance";

export type GenerationSettings = Omit<MapGenerationOptions, RecipeOwnedOption>;

export type GenerationRecipe = {
  schemaVersion: 1;
  engine: GenerationEngine;
  mapType: MapPresetId;
  scale: WorldScale;
  character: GenerationStyle;
  archetype: WorldArchetype;
  archetypeIntensity: ArchetypeIntensity;
  modifier: WorldModifier;
  effort: GenerationEffort;
  cityStates: number;
  matchIntent: MatchIntent;
  settings: GenerationSettings;
};

const ALL_VICTORIES: VictoryCondition[] = ["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"];

function cloneSettings(settings: GenerationSettings): GenerationSettings {
  return { ...settings, dominantTerrains: [...settings.dominantTerrains] };
}

function matchIntentFromOptions(options: MapGenerationOptions): MatchIntent {
  return {
    schemaVersion: 1,
    humanPlayers: 0,
    aiPlayers: 0,
    flexiblePlayers: options.players,
    enabledVictories: [...ALL_VICTORIES],
    emphasizedVictories: [],
    teamIntent: options.balance === "TEAMS" ? "FIXED_TEAMS" : "FLEXIBLE",
    competitiveStrictness: options.balance === "TOURNAMENT" ? "TOURNAMENT" : "BALANCED",
    aiAccommodation: "NORMAL",
    balanceMode: options.balance,
    teamSize: options.teamSize,
    teamLayout: options.teamLayout,
    strategicBalance: options.strategicBalance,
  };
}

export function generationRecipeFromOptions(options: MapGenerationOptions): GenerationRecipe {
  const {
    engine,
    preset,
    style,
    modifier,
    players: _players,
    cityStates,
    balance: _balance,
    teamSize: _teamSize,
    teamLayout: _teamLayout,
    strategicBalance: _strategicBalance,
    ...settings
  } = options;
  void [_players, _balance, _teamSize, _teamLayout, _strategicBalance];
  return {
    schemaVersion: GENERATION_RECIPE_SCHEMA_VERSION,
    engine,
    mapType: preset,
    scale: "GLOBAL",
    character: style,
    archetype: "NARRATIVE_DEFAULT",
    archetypeIntensity: "STRONG",
    modifier,
    effort: "STANDARD",
    cityStates,
    matchIntent: matchIntentFromOptions(options),
    settings: cloneSettings(settings),
  };
}

function normalizedPlayerCount(intent: MatchIntent) {
  return Math.max(2, Math.min(22, Math.round(intent.humanPlayers) + Math.round(intent.aiPlayers) + Math.round(intent.flexiblePlayers)));
}

export function generationOptionsFromRecipe(recipe: GenerationRecipe): MapGenerationOptions {
  return {
    ...cloneSettings(recipe.settings),
    engine: recipe.engine,
    preset: recipe.mapType,
    style: recipe.character,
    modifier: recipe.modifier,
    players: normalizedPlayerCount(recipe.matchIntent),
    cityStates: Math.max(0, Math.min(41, Math.round(recipe.cityStates))),
    balance: recipe.matchIntent.balanceMode,
    teamSize: recipe.matchIntent.teamSize,
    teamLayout: recipe.matchIntent.teamLayout,
    strategicBalance: recipe.matchIntent.strategicBalance,
  };
}

function cloneMatchIntent(intent: MatchIntent): MatchIntent {
  return {
    ...intent,
    seats: intent.seats?.map((seat) => ({ ...seat })),
    enabledVictories: [...intent.enabledVictories],
    emphasizedVictories: [...intent.emphasizedVictories],
  };
}

export function cloneGenerationRecipe(recipe: GenerationRecipe | undefined) {
  if (!recipe) return undefined;
  return {
    ...recipe,
    matchIntent: cloneMatchIntent(recipe.matchIntent),
    settings: cloneSettings(recipe.settings),
  } satisfies GenerationRecipe;
}

function isRecipe(value: unknown): value is GenerationRecipe {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && "settings" in value && "matchIntent" in value);
}

export function normalizeGenerationRecipe(value: unknown, legacyDefaults: MapGenerationOptions): GenerationRecipe {
  if (!isRecipe(value)) {
    if (!value || typeof value !== "object") throw new Error("Generation recipe data must be an object.");
    const legacy = value as Partial<MapGenerationOptions>;
    const requestedEngine = String(legacy.engine ?? legacyDefaults.engine);
    const engine = requestedEngine === "FIELD" ? "EXCOGITARE" : requestedEngine === "REGION_GRAPH" ? "ECCENTRIC" : requestedEngine;
    if (!["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"].includes(engine)) throw new Error(`Unsupported legacy generation engine: ${requestedEngine}.`);
    return generationRecipeFromOptions({ ...legacyDefaults, ...legacy, engine: engine as MapGenerationOptions["engine"], dominantTerrains: [...(legacy.dominantTerrains ?? legacyDefaults.dominantTerrains)] });
  }
  if (value.schemaVersion !== GENERATION_RECIPE_SCHEMA_VERSION) {
    throw new Error(`Unsupported generation recipe schema version: ${String(value.schemaVersion)}.`);
  }
  const enabled = [...new Set(value.matchIntent.enabledVictories.filter((victory) => ALL_VICTORIES.includes(victory)))];
  if (!enabled.length) throw new Error("A generation recipe must enable at least one victory condition.");
  const emphasized = [...new Set(value.matchIntent.emphasizedVictories.filter((victory) => enabled.includes(victory)))];
  const normalized = cloneGenerationRecipe(value)!;
  normalized.scale = (["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"] as const).includes(normalized.scale) ? normalized.scale : "GLOBAL";
  normalized.archetype = (["EXISTING", "NARRATIVE_DEFAULT", "TEMPERATE", "JUNGLE", "SUNSCOURGED", "WORLDFROST", "MONSOON", "MEDITERRANEAN", "STEPPE", "SAVANNA", "MARSHLAND", "VOLCANIC", "JURASSIC", "POST_COLLAPSE", "FALLOUT_WASTES"] as const).includes(normalized.archetype) ? normalized.archetype : "NARRATIVE_DEFAULT";
  normalized.archetypeIntensity = (["HINT", "STRONG", "TRANSFORMATIVE"] as const).includes(normalized.archetypeIntensity) ? normalized.archetypeIntensity : "STRONG";
  normalized.matchIntent.enabledVictories = enabled;
  normalized.matchIntent.emphasizedVictories = emphasized;
  normalized.matchIntent.humanPlayers = Math.max(0, Math.round(normalized.matchIntent.humanPlayers));
  normalized.matchIntent.aiPlayers = Math.max(0, Math.round(normalized.matchIntent.aiPlayers));
  normalized.matchIntent.flexiblePlayers = Math.max(0, Math.round(normalized.matchIntent.flexiblePlayers));
  normalized.cityStates = Math.max(0, Math.min(41, Math.round(normalized.cityStates)));
  return normalized;
}
