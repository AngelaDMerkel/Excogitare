import type { Civ5Map, Civ5Tile } from "../civ5-map.ts";
import type { MapSizeId, MapGeometry, MapPresetId, GenerationStyle } from "../map-generator.ts";

export const STUDIO_VERSION = 4;
export type Range = [number, number];
export type Landscape = "WATERSHEDS" | "COLLISION" | "SHELVES" | "GLACIAL" | "LAKES" | "CONTINENTS" | "SHIELDS" | "ICE_MARGINS" | "RIVAL_SHORES";
export type Foundation = "GEOGRAPHY" | "GAMEPLAY";
export type Balance = "OPEN" | "OPENING" | "STRATEGIC" | "SYMMETRIC";
export type StudioRecipe = {
  version: 4; seed: string; foundation: Foundation; landscape: Landscape; character: GenerationStyle;
  size: MapSizeId; geometry: MapGeometry;
  wraps: boolean; water: Range; mountains: Range; players: number; cityStates: number;
  temperature: number; rainfall: number; erosion: number; rivers: number;
  resources: number; luxuries: number; strategics: number; wonders: number;
  balance: Balance; teams: number; candidates: number; passageWidth: number; oceanWidth: number;
  development: number; contact: Range; frontage: Range;
};
export type Fields = { elevation: number[]; moisture: number[]; temperature: number[]; drainage: number[] };
export type Feature = { id: string; name: string; kind: "LAND" | "WATER" | "RANGE" | "RIVER" | "BASIN" | "PASS" | "REFUGE" | "PLATE" | "CLIMATE"; tiles: number[]; inferred: boolean; sourceId?: string; neighbors?: string[]; cause?: string; status?: "RETAINED" | "CHANGED" | "CREATED" };
export type Stroke = { kind: "RIDGE" | "BASIN" | "LAND" | "PASS" | "WET" | "DRY" | "WARM" | "COOL" | "PAINT"; tiles: number[]; strength: number; terrain?: number; elevation?: number; feature?: number; resource?: number; river?: number; wonder?: number; resourceAmount?: number };
export type World = {
  version: 4; revision: number; map: Civ5Map; recipe: StudioRecipe; base: number[]; baseRivers: number[]; fields: Fields;
  strokes: Stroke[]; locked: number[]; features: Feature[]; messages: string[];
  substrate: { id: string; seed: string; engine: string; confidence: "NATIVE" | "INFERRED" | "RETAINED"; tiles: Civ5Tile[]; fields: Fields; recipe: StudioRecipe; nativeFields?: { relief: number[]; moisture?: number[]; temperature?: number[] }; places: Feature[]; legacyAuthoring?: { recipe: unknown; strokes: Stroke[]; foundation?: unknown; operations?: unknown } };
  development: { operations: MapOperation[]; changes: ChangeReport; proposals: Proposal[]; candidates: CandidateSummary[] };
  protections: Array<{ id: string; policy: "SHAPE" | "FUNCTION"; tiles: number[]; kind: Feature["kind"] }>;
  source?: { name: string; bytes: number[]; salvaged: boolean };
  origin: "GENERATED" | "IMPORTED" | "SAMPLE"; assessment: Assessment; label?: string;
};
export type Assessment = {
  water: number; mountains: number; fertileShare: number; riverTiles: number;
  sampleSpread: number; candidate: number; attempts: number; notes: string[];
  axes?: Array<{ name: string; spread: number; values: number[]; unit: string }>;
  layouts: Array<{ sites: number[]; openingSpread: number; expansionSpread: number; isolation: number }>;
  stages: Array<{ id: "LAND" | "COASTAL" | "OCEAN"; label: string; reachablePairs: number; pairs: number; medianCost: number }>;
  opportunities: Array<{ tile: number; food: number; production: number; value: number; coastal: boolean; space: number }>;
  findings: Array<{ id: string; label: string; detail: string; severity: "INFO" | "WEAK"; tiles: number[] }>;
  quality: { coherence: number; identity: number; opportunity: number; variety: number; fidelity: number };
};
export type MapOperation = { id: string; kind: string; label: string; tiles: number[]; parentIds: string[]; inferred: boolean };
export type ChangeReport = { direct: number[]; dependent: number[]; retained: number; affectedPlaces: string[]; explanation: string[] };
export type Proposal = { id: string; title: string; reason: string; tradeoff: string; stroke: Stroke; gain: number; changed: number; effects: Array<{ label: string; before: number; after: number }> };
export type CandidateSummary = { seed: string; selected: boolean; water: number; mountains: number; quality: Assessment["quality"]; improvements: string[]; recipe?: StudioRecipe; strokes?: Stroke[]; fingerprint?: string };
export type Revision = { id: number; label: string; world: World; checkpoint?: boolean };
export type Session = { current: World; past: Revision[]; future: Revision[]; draft?: StudioRecipe; developmentDraft?: StudioRecipe; legacyDrafts?: { draft?: unknown; developmentDraft?: unknown } };
export type Job =
  | { kind: "GENERATE"; recipe: StudioRecipe }
  | { kind: "RANDOMISE"; seed: string }
  | { kind: "REFINE"; world: World; recipe: StudioRecipe }
  | { kind: "STROKE"; world: World; stroke: Stroke }
  | { kind: "DEVELOP"; world: World; proposalId?: string; selection?: number[] }
  | { kind: "ALTERNATIVE"; world: World; seed: string }
  | { kind: "REBALANCE"; world: World; balance: Balance }
  | { kind: "REPAIR"; world: World; issues: string[] };
export type Progress = (label: string, completed: number, total: number) => void;

export const LANDSCAPES: ReadonlyArray<{ id: Landscape; name: string; description: string; preset: MapPresetId; water: Range; mountains: Range }> = [
  { id: "WATERSHEDS", name: "Great Watersheds", description: "Mountain-fed rivers, inland lakes and generous valley country.", preset: "GREAT_WATERSHEDS", water: [28, 40], mountains: [10, 19] },
  { id: "COLLISION", name: "Colliding Plates", description: "Connected uplands, eroded foothills and sheltered basins.", preset: "COLLIDING_PLATES", water: [44, 60], mountains: [16, 28] },
  { id: "SHELVES", name: "Island Shelves", description: "Clusters of islands share shallow shelves, separated by deeper channels.", preset: "ARCHIPELAGO", water: [64, 78], mountains: [6, 16] },
  { id: "GLACIAL", name: "Glacial World", description: "Frozen frontiers surround scarce productive country.", preset: "ICEHOUSE_EARTH", water: [32, 48], mountains: [9, 19] },
  { id: "LAKES", name: "Inland Sea Crossroads", description: "Great inland waters, narrow straits and long land journeys.", preset: "SHATTERED_BASINS", water: [60, 76], mountains: [5, 15] },
  { id: "CONTINENTS", name: "Crooked Continents", description: "Broad interiors, deep gulfs and unexpected coastal routes.", preset: "CONTINENTS", water: [48, 65], mountains: [8, 20] },
  { id: "SHIELDS", name: "Continental Shields", description: "Broad uplands, worn ridges, mineral-rich interiors and mature river basins.", preset: "ANCIENT_CRATONS", water: [32, 48], mountains: [4, 14] },
  { id: "ICE_MARGINS", name: "Ice Margins", description: "Open water meets frozen coasts, with habitable pockets between cold uplands.", preset: "ICEHOUSE_EARTH", water: [38, 54], mountains: [9, 19] },
  { id: "RIVAL_SHORES", name: "Rival shores", description: "Substantial homelands face each other across costly crossings. Coastal development competes with inland security as ocean travel changes access.", preset: "RIVAL_CONTINENTS", water: [44, 62], mountains: [8, 22] },
];
export const LANDSCAPE_DETAILS: Record<Landscape, { identity: string; play: string; processes: string }> = {
  WATERSHEDS: { identity: "Headwaters join tributaries and great trunks; upland divides and downstream flood basins remain recognizable.", play: "Valley settlement, contested confluences and alternative approaches through the divides.", processes: "Regional composition · retained drainage · climate and valley development" },
  COLLISION: { identity: "Converging crust raises connected highlands, sheltered basins and contrasting windward and leeward country.", play: "Productive uplands, defensible crossings and trade-offs between access and shelter.", processes: "Plate conditions · erosion · moisture transport" },
  SHELVES: { identity: "Shallow shelves connect island groups; deeper channels divide their coasts.", play: "Coastal contact and useful anchor islands, with deeper channels changing the scale of later voyages.", processes: "Continental fields · shallow shelves · maritime access" },
  GLACIAL: { identity: "Cold interiors and broken highlands surround productive refuges.", play: "Development in scarce habitable country and costly access to frontier resources.", processes: "Physical climate · glacial regions · refuge capacity" },
  LAKES: { identity: "Great inland seas concentrate habitable land along their margins and between unequal basins.", play: "Straits and canal sites connect distinct naval theatres; shoreland is valuable and exposed.", processes: "Basin relationships · shoreline development · navigation" },
  CONTINENTS: { identity: "Hooked coasts and deep gulfs complicate broad continental interiors.", play: "Discovery can change plans as short voyages bypass long land journeys.", processes: "Warped landform fields · coastal composition · regional climate" },
  SHIELDS: { identity: "Low ridges divide broad interiors, with river basins and exposed uplands connecting the coast to inland country.", play: "Open approaches, productive valleys and mineral-rich uplands support different development choices.", processes: "Physical relief · erosion · drainage and regional climate" },
  ICE_MARGINS: { identity: "Cold uplands and ice-fringed water sit beside more habitable coastal and river country.", play: "Productive pockets, difficult land routes and restricted coastal access create competing priorities.", processes: "Physical climate · temperature gradients · coast and refuge capacity" },
  RIVAL_SHORES: { identity: "Unequal but viable homelands meet through multiple expensive maritime hinges.", play: "Early local development and later overseas pressure, without assuming fixed multiplayer starts.", processes: "Strategic relationships · geographic realization · staged access" },
};
export function defaultRecipe(): StudioRecipe {
  return { version: 4, seed: "watersheds-v3", foundation: "GEOGRAPHY", landscape: "WATERSHEDS", character: "REALISTIC", size: "STANDARD", geometry: "STANDARD", wraps: false, water: [28, 40], mountains: [10, 19], players: 4, cityStates: 8, temperature: 50, rainfall: 65, erosion: 45, rivers: 75, resources: 50, luxuries: 50, strategics: 50, wonders: 4, balance: "OPEN", teams: 0, candidates: 3, passageWidth: 2, oceanWidth: 5, development: 2, contact: [12, 40], frontage: [2, 6] };
}
/** Old story recipes can be inspected in project archives, but cannot drive new terrain. */
export function migrateRecipe(value: unknown): StudioRecipe {
  const old = value as Record<string, unknown>;
  if (!old || ![2, 3, 4].includes(old.version as number)) throw new Error("Unsupported world recipe version.");
  if (old.version === 4) return structuredClone(value) as StudioRecipe;
  const recipe = defaultRecipe();
  for (const key of Object.keys(recipe) as Array<keyof StudioRecipe>) {
    if (Object.hasOwn(old, key)) Object.assign(recipe, { [key]: structuredClone(old[key]) });
  }
  recipe.version = 4;
  if (old.landscape === "COMET_SEAS") recipe.landscape = "SHIELDS";
  if (old.landscape === "POLAR_THAW") recipe.landscape = "ICE_MARGINS";
  return recipe;
}
export function selectLandscape(recipe: StudioRecipe, id: Landscape): StudioRecipe {
  const landscape = LANDSCAPES.find(item => item.id === id)!;
  return {
    ...recipe, landscape: id, water: [...landscape.water], mountains: [...landscape.mountains],
    temperature: id === "GLACIAL" ? 25 : id === "ICE_MARGINS" ? 45 : 50,
  };
}
export function hash(value: string) { let h = 2166136261; for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; }
export function random(seed: string) { let state = hash(seed); return () => { state = Math.imul(1664525, state) + 1013904223 | 0; return (state >>> 0) / 4294967296; }; }
export function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }
export function choose<T>(items: readonly T[], rng: () => number) { return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]; }
export function randomRecipe(rng = Math.random): StudioRecipe {
  const landscape = choose(LANDSCAPES, rng);
  const count = choose([2, 3, 4, 6, 8, 10, 12], rng);
  const seed = Math.floor(rng() * 0xffffffff).toString(36);
  const recipe: StudioRecipe = { ...defaultRecipe(), seed, landscape: landscape.id, foundation: choose(["GEOGRAPHY", "GAMEPLAY"] as const, rng), size: choose(["DUEL", "TINY", "SMALL", "STANDARD", "LARGE", "HUGE"] as const, rng), geometry: choose(["STANDARD", "WIDE", "TALL", "SQUARE"] as const, rng), wraps: rng() > .5, water: [...landscape.water], mountains: [...landscape.mountains], players: count, cityStates: Math.floor(rng() * 16), balance: choose(["OPEN", "OPENING", "STRATEGIC", "SYMMETRIC"] as const, rng), teams: choose([0, 2], rng), candidates: choose([3, 6, 12], rng), passageWidth: choose([1, 2, 3, 4], rng), oceanWidth: choose([4, 5, 6, 8], rng), temperature: Math.round(rng() * 100), rainfall: Math.round(rng() * 100), erosion: Math.round(rng() * 100), rivers: Math.round(rng() * 100), resources: Math.round(rng() * 100), luxuries: Math.round(rng() * 100), strategics: Math.round(rng() * 100), wonders: Math.floor(rng() * 9) };
  for (const key of ["water", "mountains"] as const) {
    const [low, high] = recipe[key], width = high - low;
    recipe[key] = [Math.round(low + rng() * width * .3), Math.round(high - rng() * width * .3)];
  }
  recipe.character = choose(["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const, rng);
  recipe.development = choose([0, 1, 2, 4], rng);
  recipe.contact = [8 + Math.floor(rng() * 12), 26 + Math.floor(rng() * 25)];
  recipe.frontage = [1 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 4)];
  if (recipe.size === "DUEL" && recipe.players > 4) recipe.size = "STANDARD";
  return recipe;
}
export function validateRecipe(recipe: StudioRecipe) {
  if (!recipe || recipe.version !== 4 || !LANDSCAPES.some(l => l.id === recipe.landscape)) throw new Error("Unsupported world recipe.");
  if (!["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"].includes(recipe.character)) throw new Error("Unsupported world character.");
  if (!Number.isInteger(recipe.development) || recipe.development < 0 || recipe.development > 6) throw new Error("Choose zero to six development rounds.");
  for (const [name, range] of [["Contact", recipe.contact], ["Frontage", recipe.frontage]] as const) if (!Array.isArray(range) || range.length !== 2 || range.some(v => !Number.isFinite(v) || v < 1 || v > 100) || range[0] > range[1]) throw new Error(`${name} needs a positive ordered range.`);
  if (!["GEOGRAPHY", "GAMEPLAY"].includes(recipe.foundation)) throw new Error("Choose a generation foundation.");
  for (const [name, range, limit] of [["Water", recipe.water, 90], ["Mountains", recipe.mountains, 38]] as const) if (!Array.isArray(range) || range.length !== 2 || range.some(v => !Number.isFinite(v) || v < 0 || v > limit) || range[0] > range[1]) throw new Error(`${name} needs an ordered range between 0 and ${limit}%.`);
  for (const key of ["temperature", "rainfall", "erosion", "rivers", "resources", "luxuries", "strategics"] as const) if (!Number.isFinite(recipe[key]) || recipe[key] < 0 || recipe[key] > 100) throw new Error(`${key} must be between 0 and 100.`);
  if (!Number.isInteger(recipe.players) || recipe.players < 2 || recipe.players > 22 || !Number.isInteger(recipe.cityStates) || recipe.cityStates < 0 || recipe.cityStates > 41) throw new Error("Choose 2–22 players and 0–41 city states.");
  if ("events" in recipe || "motifs" in recipe) throw new Error("This recipe uses retired story controls. Open its saved project to preserve the existing geography.");
  if (!Number.isInteger(recipe.candidates) || recipe.candidates < 1 || recipe.candidates > 12) throw new Error("Search uses 1–12 initial candidates.");
  if (!["DUEL", "TINY", "SMALL", "STANDARD", "LARGE", "HUGE", "EXTREME", "COLOSSAL"].includes(recipe.size) || !["STANDARD", "TALL", "WIDE", "SQUARE"].includes(recipe.geometry)) throw new Error("Unsupported map dimensions.");
  if (!["OPEN", "OPENING", "STRATEGIC", "SYMMETRIC"].includes(recipe.balance) || ![0, 2, 3, 4].includes(recipe.teams)) throw new Error("Unsupported match configuration.");
  if (!Number.isInteger(recipe.wonders) || recipe.wonders < 0 || recipe.wonders > 12 || !Number.isInteger(recipe.passageWidth) || recipe.passageWidth < 1 || recipe.passageWidth > 6 || !Number.isInteger(recipe.oceanWidth) || recipe.oceanWidth < 3 || recipe.oceanWidth > 12) throw new Error("Invalid content or passage settings.");
  if (typeof recipe.seed !== "string" || recipe.seed.length > 256 || typeof recipe.wraps !== "boolean") throw new Error("Invalid seed or wrapping.");
}
export function acceptWorld(session: Session, world: World, label: string): Session {
  const entry: Revision = { id: session.current.revision, label: session.current.label ?? session.current.map.name, world: session.current };
  const past = [...session.past, entry];
  while (past.length > 20 && past.some(e => !e.checkpoint)) past.splice(past.findIndex(e => !e.checkpoint), 1);
  return { ...session, current: { ...world, label, revision: session.current.revision + 1 }, past, future: [] };
}
export function undo(session: Session): Session {
  const entry = session.past.at(-1); if (!entry) return session;
  return { ...session, current: entry.world, past: session.past.slice(0, -1), future: [{ id: session.current.revision, label: session.current.label ?? session.current.map.name, world: session.current }, ...session.future] };
}
export function redo(session: Session): Session {
  const entry = session.future[0]; if (!entry) return session;
  return { ...session, current: entry.world, past: [...session.past, { id: session.current.revision, label: session.current.label ?? session.current.map.name, world: session.current }], future: session.future.slice(1) };
}
