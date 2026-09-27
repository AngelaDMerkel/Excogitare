import type { Civ5Map, Civ5Tile } from "../civ5-map.ts";
import type { MapSizeId, MapGeometry, MapPresetId, GenerationStyle } from "../map-generator.ts";

export const STUDIO_VERSION = 3;
export type Range = [number, number];
export type Landscape = "WATERSHEDS" | "COLLISION" | "SHELVES" | "GLACIAL" | "LAKES" | "CONTINENTS" | "COMET_SEAS" | "POLAR_THAW" | "RIVAL_SHORES";
export type Motif = "PASSES" | "OCEAN_DIVIDES" | "HEARTLAND";
export type StoryKind = "FLOOD" | "CRATERS" | "THAW" | "RUINS";
export type Foundation = "GEOGRAPHY" | "GAMEPLAY";
export type Balance = "OPEN" | "OPENING" | "STRATEGIC" | "SYMMETRIC";
export type StudioRecipe = {
  version: 3; seed: string; foundation: Foundation; landscape: Landscape; character: GenerationStyle;
  motifs: Motif[]; events: WorldEvent[]; size: MapSizeId; geometry: MapGeometry;
  wraps: boolean; water: Range; mountains: Range; players: number; cityStates: number;
  temperature: number; rainfall: number; erosion: number; rivers: number;
  resources: number; luxuries: number; strategics: number; wonders: number;
  balance: Balance; teams: number; candidates: number; passageWidth: number; oceanWidth: number;
  development: number; contact: Range; frontage: Range;
};
export type WorldEvent = { id: string; kind: StoryKind; intensity: number; age: number; x: number; y: number; radius: number; placement?: "FIXED" | "INLAND" | "ICE_MARGIN" };
export type Fields = { elevation: number[]; moisture: number[]; temperature: number[]; drainage: number[] };
export type Feature = { id: string; name: string; kind: "LAND" | "WATER" | "RANGE" | "RIVER" | "BASIN" | "PASS" | "REFUGE" | "PLATE" | "CLIMATE"; tiles: number[]; inferred: boolean; sourceId?: string; neighbors?: string[]; cause?: string; status?: "RETAINED" | "CHANGED" | "CREATED" };
export type Stroke = { kind: "RIDGE" | "BASIN" | "LAND" | "PASS" | "WET" | "DRY" | "PAINT"; tiles: number[]; strength: number; terrain?: number; elevation?: number; feature?: number; resource?: number; river?: number; wonder?: number; resourceAmount?: number };
export type World = {
  version: 3; revision: number; map: Civ5Map; recipe: StudioRecipe; base: number[]; baseRivers: number[]; fields: Fields;
  strokes: Stroke[]; locked: number[]; features: Feature[]; messages: string[];
  substrate: { id: string; seed: string; engine: string; confidence: "NATIVE" | "INFERRED"; tiles: Civ5Tile[]; fields: Fields; recipe: StudioRecipe; nativeFields?: { relief: number[]; moisture?: number[]; temperature?: number[] }; places: Feature[]; legacyAuthoring?: { recipe: unknown; strokes: Stroke[] } };
  development: { causes: Cause[]; changes: ChangeReport; proposals: Proposal[]; candidates: CandidateSummary[] };
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
export type Cause = { id: string; kind: string; label: string; tiles: number[]; parentIds: string[]; inferred: boolean };
export type ChangeReport = { direct: number[]; dependent: number[]; retained: number; affectedPlaces: string[]; explanation: string[] };
export type Proposal = { id: string; title: string; reason: string; tradeoff: string; stroke: Stroke; gain: number; changed: number; effects: Array<{ label: string; before: number; after: number }> };
export type CandidateSummary = { seed: string; selected: boolean; water: number; mountains: number; quality: Assessment["quality"]; improvements: string[]; recipe?: StudioRecipe; strokes?: Stroke[]; fingerprint?: string };
export type Revision = { id: number; label: string; world: World; checkpoint?: boolean };
export type Session = { current: World; past: Revision[]; future: Revision[]; draft?: StudioRecipe; developmentDraft?: StudioRecipe };
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

export const LANDSCAPES: ReadonlyArray<{ id: Landscape; name: string; description: string; preset: MapPresetId; water: Range; mountains: Range; story?: StoryKind }> = [
  { id: "WATERSHEDS", name: "Great Watersheds", description: "Mountain-fed rivers, inland lakes and generous valley country.", preset: "GREAT_WATERSHEDS", water: [28, 40], mountains: [10, 19] },
  { id: "COLLISION", name: "Colliding Plates", description: "Connected uplands, eroded foothills and sheltered basins.", preset: "COLLIDING_PLATES", water: [44, 60], mountains: [16, 28] },
  { id: "SHELVES", name: "Drowned Shelves", description: "Old continental highlands survive as island clusters.", preset: "ARCHIPELAGO", water: [64, 78], mountains: [6, 16] },
  { id: "GLACIAL", name: "Glacial World", description: "Frozen frontiers surround scarce productive country.", preset: "ICEHOUSE_EARTH", water: [32, 48], mountains: [9, 19] },
  { id: "LAKES", name: "Inland Sea Crossroads", description: "Great inland waters, narrow straits and long land journeys.", preset: "SHATTERED_BASINS", water: [60, 76], mountains: [5, 15] },
  { id: "CONTINENTS", name: "Crooked Continents", description: "Broad interiors, deep gulfs and unexpected coastal routes.", preset: "CONTINENTS", water: [48, 65], mountains: [8, 20] },
  { id: "COMET_SEAS", name: "The comet seas", description: "Impacts flood an old continental interior. Eroded crater rims, breached lakes and surviving uplands frame rival shorelands.", preset: "ANCIENT_CRATONS", water: [20, 36], mountains: [4, 14], story: "FLOOD" },
  { id: "POLAR_THAW", name: "The retreating ice", description: "Meltwater opens a frozen world. Productive refuges border harsh, resource-bearing uplands and narrow maritime approaches.", preset: "ICEHOUSE_EARTH", water: [32, 48], mountains: [9, 19], story: "THAW" },
  { id: "RIVAL_SHORES", name: "Rival shores", description: "Substantial homelands face each other across costly crossings. Coastal development competes with inland security as ocean travel changes access.", preset: "RIVAL_CONTINENTS", water: [44, 62], mountains: [8, 22] },
];
export const PREMISE_DETAILS: Record<Landscape, { identity: string; play: string; processes: string }> = {
  WATERSHEDS: { identity: "Headwaters join tributaries and great trunks; upland divides and downstream flood basins remain recognizable.", play: "Valley settlement, contested confluences and alternative approaches through the divides.", processes: "Regional composition · retained drainage · climate and valley development" },
  COLLISION: { identity: "Converging crust raises connected highlands, sheltered basins and contrasting windward and leeward country.", play: "Productive uplands, defensible crossings and trade-offs between access and shelter.", processes: "Plate conditions · erosion · moisture transport" },
  SHELVES: { identity: "Island groups retain the ancestry of drowned continental shelves.", play: "Coastal contact and useful anchor islands, with deeper channels changing the scale of later voyages.", processes: "Continental fields · submergence · maritime access" },
  GLACIAL: { identity: "Cold interiors and broken highlands surround productive refuges.", play: "Development in scarce habitable country and costly access to frontier resources.", processes: "Physical climate · glacial regions · refuge capacity" },
  LAKES: { identity: "Great inland seas concentrate habitable land along their margins and between unequal basins.", play: "Straits and canal sites connect distinct naval theatres; shoreland is valuable and exposed.", processes: "Basin relationships · shoreline development · navigation" },
  CONTINENTS: { identity: "Hooked coasts and deep gulfs complicate broad continental interiors.", play: "Discovery can change plans as short voyages bypass long land journeys.", processes: "Warped landform fields · coastal composition · regional climate" },
  COMET_SEAS: { identity: "Old drainage survives between impact basins; age erodes the rims and opens lake outlets.", play: "Sheltered lake country, exposed shorelands and rival approaches to valuable breaches.", processes: "Continental foundation · impact and water deposition · erosion and drainage" },
  POLAR_THAW: { identity: "A retreating ice margin exposes connected meltwater basins and surviving cold uplands.", play: "Choose between productive refuges, difficult overland frontiers and new coastal access.", processes: "Physical icehouse · regional warming · meltwater and ecological recovery" },
  RIVAL_SHORES: { identity: "Unequal but viable homelands meet through multiple expensive maritime hinges.", play: "Early local development and later overseas pressure, without assuming fixed multiplayer starts.", processes: "Strategic relationships · geographic realization · staged access" },
};
export const MOTIFS: ReadonlyArray<{ id: Motif; name: string; description: string }> = [
  { id: "PASSES", name: "Narrow Passes", description: "Connected uplands concentrate movement through deliberate gaps." },
  { id: "OCEAN_DIVIDES", name: "Ocean Divides", description: "Deep-water seams divide local worlds and change access to distant land." },
  { id: "HEARTLAND", name: "Contested Heartland", description: "Productive interior country gives rivals a common destination." },
];
export const STORIES: ReadonlyArray<{ id: StoryKind; name: string; description: string }> = [
  { id: "FLOOD", name: "Comet flood", description: "Impact, subsidence and new water drown parts of the old landscape." },
  { id: "CRATERS", name: "Flooded craters", description: "Basin lakes, surviving rims and eroded breaches mark old impacts." },
  { id: "THAW", name: "Thawing ice cap", description: "Meltwater occupies low terrain along a retreating ice margin." },
  { id: "RUINS", name: "Abandoned terraforming", description: "Excavated channels, artificial terraces and broken embankments survive abandonment." },
];
export function defaultRecipe(): StudioRecipe {
  return { version: 3, seed: "watersheds-v3", foundation: "GEOGRAPHY", landscape: "WATERSHEDS", character: "REALISTIC", motifs: [], events: [], size: "STANDARD", geometry: "STANDARD", wraps: false, water: [28, 40], mountains: [10, 19], players: 4, cityStates: 8, temperature: 50, rainfall: 65, erosion: 45, rivers: 75, resources: 50, luxuries: 50, strategics: 50, wonders: 4, balance: "OPEN", teams: 0, candidates: 3, passageWidth: 2, oceanWidth: 5, development: 2, contact: [12, 40], frontage: [2, 6] };
}
export function migrateRecipe(value: StudioRecipe | (Omit<StudioRecipe, "version"> & { version: number })): StudioRecipe {
  if (!value || ![2, 3].includes(value.version)) throw new Error("Unsupported world recipe version.");
  return { ...defaultRecipe(), ...structuredClone(value), motifs: [], version: 3 };
}
export function selectLandscape(recipe: StudioRecipe, id: Landscape): StudioRecipe {
  const landscape = LANDSCAPES.find(item => item.id === id)!;
  const events: WorldEvent[] = landscape.story ? [{ ...newEvent(landscape.story, random(`${recipe.seed}:${id}`)), intensity: .6, age: .55, x: .5, y: id === "POLAR_THAW" ? .78 : .5, radius: .24, placement: id === "POLAR_THAW" ? "ICE_MARGIN" : "INLAND" }] : [];
  return { ...recipe, landscape: id, water: [...landscape.water], mountains: [...landscape.mountains], events, temperature: id === "POLAR_THAW" || id === "GLACIAL" ? 30 : 50 };
}
export function hash(value: string) { let h = 2166136261; for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0; }
export function random(seed: string) { let state = hash(seed); return () => { state = Math.imul(1664525, state) + 1013904223 | 0; return (state >>> 0) / 4294967296; }; }
export function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }
export function choose<T>(items: readonly T[], rng: () => number) { return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]; }
export function randomRecipe(rng = Math.random): StudioRecipe {
  const landscape = choose(LANDSCAPES, rng);
  const count = choose([2, 3, 4, 6, 8, 10, 12], rng);
  const seed = Math.floor(rng() * 0xffffffff).toString(36);
  const recipe: StudioRecipe = { ...defaultRecipe(), seed, landscape: landscape.id, foundation: choose(["GEOGRAPHY", "GAMEPLAY"] as const, rng), size: choose(["DUEL", "TINY", "SMALL", "STANDARD", "LARGE", "HUGE"] as const, rng), geometry: choose(["STANDARD", "WIDE", "TALL", "SQUARE"] as const, rng), wraps: rng() > .5, water: [...landscape.water], mountains: [...landscape.mountains], players: count, cityStates: Math.floor(rng() * 16), balance: choose(["OPEN", "OPENING", "STRATEGIC", "SYMMETRIC"] as const, rng), teams: choose([0, 2], rng), candidates: choose([3, 6, 12], rng), passageWidth: choose([1, 2, 3, 4], rng), oceanWidth: choose([4, 5, 6, 8], rng), motifs: MOTIFS.filter(() => rng() > .65).map(m => m.id), events: rng() > .55 ? [newEvent(choose(STORIES, rng).id, rng)] : [], temperature: Math.round(rng() * 100), rainfall: Math.round(rng() * 100), erosion: Math.round(rng() * 100), rivers: Math.round(rng() * 100), resources: Math.round(rng() * 100), luxuries: Math.round(rng() * 100), strategics: Math.round(rng() * 100), wonders: Math.floor(rng() * 9) };
  recipe.motifs = [];
  for (const key of ["water", "mountains"] as const) {
    const [low, high] = recipe[key], width = high - low;
    recipe[key] = [Math.round(low + rng() * width * .3), Math.round(high - rng() * width * .3)];
  }
  recipe.events = recipe.events.map(event => ({ ...event, intensity: .2 + rng() * .75, age: rng(), radius: .08 + rng() * .22 }));
  recipe.character = choose(["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const, rng);
  recipe.development = choose([0, 1, 2, 4], rng);
  recipe.contact = [8 + Math.floor(rng() * 12), 26 + Math.floor(rng() * 25)];
  recipe.frontage = [1 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 4)];
  if (landscape.story && !recipe.events.some(event => event.kind === landscape.story)) recipe.events.unshift({ ...newEvent(landscape.story, rng), placement: landscape.story === "THAW" ? "ICE_MARGIN" : "INLAND" });
  if (recipe.size === "DUEL" && recipe.players > 4) recipe.size = "STANDARD";
  return recipe;
}
export function newEvent(kind: StoryKind, rng = Math.random): WorldEvent { return { id: `event-${Math.floor(rng() * 0xffffffff).toString(36)}`, kind, intensity: .55, age: .35, x: .25 + rng() * .5, y: .25 + rng() * .5, radius: .18 }; }
export function validateRecipe(recipe: StudioRecipe) {
  if (!recipe || recipe.version !== 3 || !LANDSCAPES.some(l => l.id === recipe.landscape)) throw new Error("Unsupported world recipe.");
  if (!["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"].includes(recipe.character)) throw new Error("Unsupported world character.");
  if (!Number.isInteger(recipe.development) || recipe.development < 0 || recipe.development > 6) throw new Error("Choose zero to six development rounds.");
  for (const [name, range] of [["Contact", recipe.contact], ["Frontage", recipe.frontage]] as const) if (!Array.isArray(range) || range.length !== 2 || range.some(v => !Number.isFinite(v) || v < 1 || v > 100) || range[0] > range[1]) throw new Error(`${name} needs a positive ordered range.`);
  if (!["GEOGRAPHY", "GAMEPLAY"].includes(recipe.foundation)) throw new Error("Choose a generation foundation.");
  for (const [name, range, limit] of [["Water", recipe.water, 90], ["Mountains", recipe.mountains, 38]] as const) if (!Array.isArray(range) || range.length !== 2 || range.some(v => !Number.isFinite(v) || v < 0 || v > limit) || range[0] > range[1]) throw new Error(`${name} needs an ordered range between 0 and ${limit}%.`);
  for (const key of ["temperature", "rainfall", "erosion", "rivers", "resources", "luxuries", "strategics"] as const) if (!Number.isFinite(recipe[key]) || recipe[key] < 0 || recipe[key] > 100) throw new Error(`${key} must be between 0 and 100.`);
  if (!Number.isInteger(recipe.players) || recipe.players < 2 || recipe.players > 22 || !Number.isInteger(recipe.cityStates) || recipe.cityStates < 0 || recipe.cityStates > 41) throw new Error("Choose 2–22 players and 0–41 city states.");
  if (!Array.isArray(recipe.motifs) || recipe.motifs.some(m => !MOTIFS.some(item => item.id === m)) || new Set(recipe.motifs).size !== recipe.motifs.length) throw new Error("Invalid or repeated gameplay idea.");
  if (recipe.motifs.includes("OCEAN_DIVIDES") && recipe.water[1] < 22) throw new Error("Ocean Divides needs at least 22% water in the allowed range. Widen the range or remove the divide.");
  if (recipe.motifs.includes("PASSES") && recipe.mountains[1] < 8) throw new Error("Narrow Passes needs a mountain allowance of at least 8%.");
  if (!Array.isArray(recipe.events) || recipe.events.length > 8) throw new Error("A world supports up to eight history events.");
  for (const event of recipe.events) if (typeof event.id !== "string" || !event.id || !STORIES.some(s => s.id === event.kind) || [event.x, event.y, event.intensity, event.age].some(n => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(event.radius) || event.radius < .03 || event.radius > .5) throw new Error("Invalid world-history event.");
  if (new Set(recipe.events.map(e => e.id)).size !== recipe.events.length) throw new Error("World-history events need distinct identities.");
  if (recipe.events.some(event => event.placement && !["FIXED", "INLAND", "ICE_MARGIN"].includes(event.placement))) throw new Error("Invalid event placement policy.");
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
