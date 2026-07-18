import type { Civ5Map } from "./civ5-map.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  fantasticalityForPreset,
  MAP_PRESETS,
  MAP_SIZES,
  type GenerationEngine,
  type GenerationStyle,
  type MapGenerationOptions,
  type MapPresetId,
  type MapSizeId,
  type WorldModifier,
} from "./map-generator.ts";

export const IDENTITY_LAB_SCHEMA = "excogitare.identity-lab";
export const IDENTITY_LAB_SCHEMA_VERSION = 1;
export const IDENTITY_LAB_STORAGE_KEY = "excogitare.identity-lab.v1";
export const IDENTITY_NARRATIVE_GUIDE = {
  version: 1,
  path: "docs/features/map-type-narrative-identities.md",
} as const;

export const IDENTITY_LAB_PROTOTYPES = [
  {
    preset: "LONELY_OCEANS",
    label: "Lonely Oceans",
    engine: "ECCENTRIC",
    dimension: "Isolation and negative space",
    premise: "A few viable island realms are separated by intimidating expanses of ocean and a genuine absence of convenient intermediate land.",
    guideAnchor: "Lonely Oceans",
  },
  {
    preset: "SHATTERED_ARCHIPELAGO",
    label: "Broken Island Chains",
    engine: "ECCENTRIC",
    dimension: "Correlated island-chain geometry",
    premise: "Several long island chains, broken crescents and branching arcs structure a densely maritime world.",
    guideAnchor: "Broken Island Chains",
  },
  {
    preset: "GREAT_WATERSHEDS",
    label: "Great Watersheds",
    engine: "ECCENTRIC",
    dimension: "Hierarchical hydrology and deltas",
    premise: "Large drainage basins organize settlement, terrain and regional identity around a few dominant river systems.",
    guideAnchor: "Great Watersheds",
  },
  {
    preset: "ICEHOUSE_EARTH",
    label: "Glacial World",
    engine: "PHYSICAL",
    dimension: "Planetary cold and glaciation",
    premise: "A cold, strongly seasonal planet is organized by continental ice, glaciated uplands, tundra margins and restricted temperate refuges.",
    guideAnchor: "Glacial World",
  },
] as const satisfies ReadonlyArray<{ preset: MapPresetId; label: string; engine: GenerationEngine; dimension: string; premise: string; guideAnchor: string }>;

export const IDENTITY_LAB_CUES = [
  { id: "EMPTY_OCEAN", label: "Large empty ocean" },
  { id: "ISOLATED_REALMS", label: "Isolated viable realms" },
  { id: "STEPPING_STONES", label: "Stepping-stone islands" },
  { id: "ISLAND_CHAINS", label: "Island chains" },
  { id: "CURVED_ARCS", label: "Curved or branching arcs" },
  { id: "SHALLOW_SHELVES", label: "Shared coastal shelves" },
  { id: "TRUNK_RIVERS", label: "Dominant trunk rivers" },
  { id: "TRIBUTARIES", label: "Merging tributaries" },
  { id: "DELTAS", label: "Deltas or estuaries" },
  { id: "MARSHLANDS", label: "Marshes and floodplains" },
  { id: "ICE_SHEETS", label: "Broad ice sheets" },
  { id: "GLACIATED_HIGHLANDS", label: "Glaciated highlands" },
  { id: "TUNDRA_GRADIENT", label: "Tundra transition" },
  { id: "TEMPERATE_REFUGES", label: "Temperate refuges" },
  { id: "GENERIC_OR_UNCLEAR", label: "Generic or unclear geography" },
] as const;

export type IdentityCue = (typeof IDENTITY_LAB_CUES)[number]["id"];
export type IdentityVerdict = "RECOGNIZABLE" | "AMBIGUOUS" | "ATTRACTIVE_WRONG" | "FAILED";

export type IdentityLabReview = {
  guessPrimary: MapPresetId;
  guessSecondary?: MapPresetId;
  confidence: 1 | 2 | 3 | 4 | 5;
  cues: IdentityCue[];
  notes: string;
  submittedAt: string;
  verdict?: IdentityVerdict;
};

export type IdentityLabCandidate = {
  id: string;
  intendedPreset: MapPresetId;
  engine: GenerationEngine;
  options: MapGenerationOptions;
  generatedAt?: string;
  generationError?: string;
  diagnostics?: Record<string, number>;
  review?: IdentityLabReview;
  revealedAt?: string;
};

export type IdentityLabConfiguration = {
  sessionSeed: string;
  samplesPerType: number;
  size: MapSizeId;
  style: GenerationStyle;
  modifier: WorldModifier;
  prototypeTypes: MapPresetId[];
};

export type IdentityLabSummary = {
  candidates: number;
  generated: number;
  reviewed: number;
  revealed: number;
  firstChoiceCorrect: number;
  topTwoCorrect: number;
  firstChoicePercent: number;
  topTwoPercent: number;
  byIdentity: Array<{ intendedPreset: MapPresetId; candidates: number; reviewed: number; firstChoiceCorrect: number; topTwoCorrect: number }>;
  confusions: Array<{ intendedPreset: MapPresetId; guessedPreset: MapPresetId; count: number }>;
};

export type IdentityLabSession = {
  schema: typeof IDENTITY_LAB_SCHEMA;
  schemaVersion: typeof IDENTITY_LAB_SCHEMA_VERSION;
  narrativeGuide: typeof IDENTITY_NARRATIVE_GUIDE;
  id: string;
  createdAt: string;
  updatedAt: string;
  currentIndex: number;
  configuration: IdentityLabConfiguration;
  candidates: IdentityLabCandidate[];
  summary: IdentityLabSummary;
};

export type IdentityLabReviewInput = Omit<IdentityLabReview, "submittedAt" | "verdict">;

const cueIds = new Set<string>(IDENTITY_LAB_CUES.map((cue) => cue.id));
const prototypeIds = new Set<MapPresetId>(IDENTITY_LAB_PROTOTYPES.map((prototype) => prototype.preset));
const presetIds = new Set<MapPresetId>(MAP_PRESETS.map((preset) => preset.id));

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffled<T>(values: T[], seed: string) {
  const result = [...values];
  let state = hashText(seed) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function optionsForCandidate(presetId: MapPresetId, configuration: IdentityLabConfiguration, sample: number) {
  const preset = MAP_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Identity Lab does not recognize Map Type ${presetId}.`);
  const size = MAP_SIZES.find((item) => item.id === configuration.size) ?? MAP_SIZES[3];
  const seed = `identity-${configuration.sessionSeed}-${presetId.toLowerCase()}-${sample + 1}`;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: preset.id,
    size: configuration.size,
    seed,
    players: size.recommendedPlayers,
    cityStates: size.recommendedCityStates,
    style: configuration.style,
    modifier: configuration.modifier,
    waterPercent: preset.water,
    mountainPercent: configuration.style === "BRUTAL" ? Math.max(18, preset.mountains) : preset.mountains,
    climateRealism: preset.climateRealism ?? false,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    riverDensity: preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    fantasticality: preset.engine === "ECCENTRIC" ? fantasticalityForPreset(preset.id) : DEFAULT_GENERATION_OPTIONS.fantasticality,
    regionClimateLogic: preset.engine === "ECCENTRIC" && preset.climateRealism ? "ORDERED" : "LAWLESS",
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    dominantTerrains: [],
  } satisfies MapGenerationOptions;
}

export function summarizeIdentityLab(session: Pick<IdentityLabSession, "candidates">): IdentityLabSummary {
  const reviewed = session.candidates.filter((candidate) => candidate.review);
  const firstChoiceCorrect = reviewed.filter((candidate) => candidate.review?.guessPrimary === candidate.intendedPreset).length;
  const topTwoCorrect = reviewed.filter((candidate) => candidate.review?.guessPrimary === candidate.intendedPreset || candidate.review?.guessSecondary === candidate.intendedPreset).length;
  const byIdentity = IDENTITY_LAB_PROTOTYPES.map((prototype) => {
    const candidates = session.candidates.filter((candidate) => candidate.intendedPreset === prototype.preset);
    const identityReviews = candidates.filter((candidate) => candidate.review);
    return {
      intendedPreset: prototype.preset,
      candidates: candidates.length,
      reviewed: identityReviews.length,
      firstChoiceCorrect: identityReviews.filter((candidate) => candidate.review?.guessPrimary === prototype.preset).length,
      topTwoCorrect: identityReviews.filter((candidate) => candidate.review?.guessPrimary === prototype.preset || candidate.review?.guessSecondary === prototype.preset).length,
    };
  });
  const confusionCounts = new Map<string, number>();
  for (const candidate of reviewed) {
    if (!candidate.review || candidate.review.guessPrimary === candidate.intendedPreset) continue;
    const key = `${candidate.intendedPreset}:${candidate.review.guessPrimary}`;
    confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
  }
  const confusions = [...confusionCounts.entries()].map(([key, count]) => {
    const [intendedPreset, guessedPreset] = key.split(":") as [MapPresetId, MapPresetId];
    return { intendedPreset, guessedPreset, count };
  }).sort((one, two) => two.count - one.count || one.intendedPreset.localeCompare(two.intendedPreset));
  return {
    candidates: session.candidates.length,
    generated: session.candidates.filter((candidate) => candidate.generatedAt).length,
    reviewed: reviewed.length,
    revealed: session.candidates.filter((candidate) => candidate.revealedAt).length,
    firstChoiceCorrect,
    topTwoCorrect,
    firstChoicePercent: reviewed.length ? Math.round(firstChoiceCorrect / reviewed.length * 100) : 0,
    topTwoPercent: reviewed.length ? Math.round(topTwoCorrect / reviewed.length * 100) : 0,
    byIdentity,
    confusions,
  };
}

function reconciled(session: Omit<IdentityLabSession, "summary"> | IdentityLabSession): IdentityLabSession {
  const candidateCount = session.candidates.length;
  const result = {
    ...session,
    currentIndex: Math.max(0, Math.min(Math.max(0, candidateCount - 1), Math.round(session.currentIndex))),
    candidates: session.candidates.map((candidate) => ({
      ...candidate,
      options: { ...candidate.options, dominantTerrains: [...candidate.options.dominantTerrains] },
      diagnostics: candidate.diagnostics ? { ...candidate.diagnostics } : undefined,
      review: candidate.review ? { ...candidate.review, cues: [...candidate.review.cues] } : undefined,
    })),
  } as IdentityLabSession;
  result.summary = summarizeIdentityLab(result);
  return result;
}

export function createIdentityLabSession(configuration: Partial<IdentityLabConfiguration>, now: string): IdentityLabSession {
  const prototypes = configuration.prototypeTypes?.filter((preset): preset is MapPresetId => prototypeIds.has(preset)) ?? IDENTITY_LAB_PROTOTYPES.map((prototype) => prototype.preset);
  const normalized: IdentityLabConfiguration = {
    sessionSeed: (configuration.sessionSeed ?? "lab").trim().slice(0, 80) || "lab",
    samplesPerType: Math.max(1, Math.min(5, Math.round(configuration.samplesPerType ?? 2))),
    size: configuration.size ?? "STANDARD",
    style: configuration.style ?? "MUNDANE",
    modifier: configuration.modifier ?? "NONE",
    prototypeTypes: prototypes.length ? [...new Set(prototypes)] : IDENTITY_LAB_PROTOTYPES.map((prototype) => prototype.preset),
  };
  const candidates = normalized.prototypeTypes.flatMap((preset) => Array.from({ length: normalized.samplesPerType }, (_value, sample) => {
    const prototype = IDENTITY_LAB_PROTOTYPES.find((item) => item.preset === preset)!;
    return {
      id: `${preset.toLowerCase()}-${sample + 1}-${hashText(`${normalized.sessionSeed}:${preset}:${sample}`).toString(36)}`,
      intendedPreset: preset,
      engine: prototype.engine,
      options: optionsForCandidate(preset, normalized, sample),
    } satisfies IdentityLabCandidate;
  }));
  const session = {
    schema: IDENTITY_LAB_SCHEMA,
    schemaVersion: IDENTITY_LAB_SCHEMA_VERSION,
    narrativeGuide: IDENTITY_NARRATIVE_GUIDE,
    id: `lab-${hashText(`${normalized.sessionSeed}:${now}`).toString(36)}`,
    createdAt: now,
    updatedAt: now,
    currentIndex: 0,
    configuration: normalized,
    candidates: shuffled(candidates, `${normalized.sessionSeed}:deck`),
  } as Omit<IdentityLabSession, "summary">;
  return reconciled(session);
}

export function selectIdentityLabCandidate(session: IdentityLabSession, index: number, now: string) {
  return reconciled({ ...session, currentIndex: index, updatedAt: now });
}

export function recordIdentityLabGeneration(session: IdentityLabSession, candidateId: string, map: Civ5Map, now: string) {
  const diagnostics = captureIdentityDiagnostics(map);
  return reconciled({
    ...session,
    updatedAt: now,
    candidates: session.candidates.map((candidate) => candidate.id === candidateId
      ? { ...candidate, generatedAt: now, generationError: undefined, diagnostics }
      : candidate),
  });
}

export function recordIdentityLabGenerationError(session: IdentityLabSession, candidateId: string, message: string, now: string) {
  return reconciled({
    ...session,
    updatedAt: now,
    candidates: session.candidates.map((candidate) => candidate.id === candidateId
      ? { ...candidate, generationError: message.slice(0, 500) }
      : candidate),
  });
}

export function submitIdentityLabReview(session: IdentityLabSession, candidateId: string, input: IdentityLabReviewInput, now: string) {
  const candidate = session.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Identity Lab candidate was not found.");
  const choices = identityLabChoices(candidate.engine);
  if (!choices.some((choice) => choice.id === input.guessPrimary)) throw new Error("Choose a primary Map Type from the candidate's engine.");
  if (input.guessSecondary && !choices.some((choice) => choice.id === input.guessSecondary)) throw new Error("Choose a secondary Map Type from the candidate's engine.");
  if (input.guessSecondary === input.guessPrimary) throw new Error("Primary and secondary guesses must be different.");
  const review: IdentityLabReview = {
    guessPrimary: input.guessPrimary,
    guessSecondary: input.guessSecondary,
    confidence: Math.max(1, Math.min(5, Math.round(input.confidence))) as IdentityLabReview["confidence"],
    cues: [...new Set(input.cues.filter((cue) => cueIds.has(cue)))],
    notes: input.notes.trim().slice(0, 4000),
    submittedAt: now,
  };
  return reconciled({
    ...session,
    updatedAt: now,
    candidates: session.candidates.map((item) => item.id === candidateId ? { ...item, review, revealedAt: now } : item),
  });
}

export function setIdentityLabVerdict(session: IdentityLabSession, candidateId: string, verdict: IdentityVerdict, now: string) {
  const allowed: IdentityVerdict[] = ["RECOGNIZABLE", "AMBIGUOUS", "ATTRACTIVE_WRONG", "FAILED"];
  if (!allowed.includes(verdict)) throw new Error("Identity Lab verdict is not recognized.");
  return reconciled({
    ...session,
    updatedAt: now,
    candidates: session.candidates.map((candidate) => candidate.id === candidateId && candidate.review
      ? { ...candidate, review: { ...candidate.review, verdict } }
      : candidate),
  });
}

export function identityLabChoices(engine: GenerationEngine) {
  return MAP_PRESETS.filter((preset) => preset.engine === engine).map((preset) => ({ id: preset.id, label: preset.label }));
}

export function identityLabPrototype(preset: MapPresetId) {
  return IDENTITY_LAB_PROTOTYPES.find((prototype) => prototype.preset === preset);
}

export function captureIdentityDiagnostics(map: Civ5Map) {
  const land = map.tiles.filter((tile) => tile.terrain >= 2);
  const objects = map.structure?.objects ?? [];
  const continents = objects.filter((object) => object.kind === "CONTINENT");
  const largestContinent = continents.reduce((largest, continent) => Math.max(largest, continent.tileIndices.length), 0);
  const riverLengths = map.structure?.riverSystems.map((river) => river.tileIndices.length) ?? [];
  const countObjects = (kind: string) => objects.filter((object) => object.kind === kind).length;
  const percentage = (count: number, total = map.tiles.length) => Math.round(count / Math.max(1, total) * 1000) / 10;
  return {
    width: map.width,
    height: map.height,
    tiles: map.tiles.length,
    waterPercent: percentage(map.tiles.length - land.length),
    mountainLandPercent: percentage(land.filter((tile) => tile.elevation === 2).length, land.length),
    landComponents: continents.length,
    largestLandShare: percentage(largestContinent, land.length),
    oceanBasins: countObjects("OCEAN_BASIN"),
    archipelagos: countObjects("ARCHIPELAGO"),
    lakes: countObjects("LAKE"),
    rifts: countObjects("RIFT"),
    watersheds: countObjects("WATERSHED"),
    riverBasins: countObjects("RIVER_BASIN"),
    riverSystems: map.structure?.riverSystems.length ?? 0,
    riverTiles: map.tiles.filter((tile) => tile.river > 0).length,
    longestRiver: riverLengths.length ? Math.max(...riverLengths) : 0,
    marshTiles: map.tiles.filter((tile) => tile.feature === 2).length,
    iceTiles: map.tiles.filter((tile) => tile.feature === 3).length,
    snowLandPercent: percentage(map.tiles.filter((tile) => tile.terrain === 6).length, land.length),
    tundraLandPercent: percentage(map.tiles.filter((tile) => tile.terrain === 5).length, land.length),
    glacialRegions: countObjects("GLACIAL_REGION"),
  };
}

export function exportIdentityLabSession(session: IdentityLabSession) {
  return `${JSON.stringify(reconciled(session), null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Identity Lab JSON is missing ${field}.`);
  return value;
}

export function importIdentityLabSession(source: string): IdentityLabSession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Identity Lab JSON could not be parsed.");
  }
  if (!isRecord(parsed) || parsed.schema !== IDENTITY_LAB_SCHEMA || parsed.schemaVersion !== IDENTITY_LAB_SCHEMA_VERSION) {
    throw new Error(`Expected ${IDENTITY_LAB_SCHEMA} schema version ${IDENTITY_LAB_SCHEMA_VERSION}.`);
  }
  if (!isRecord(parsed.configuration) || !Array.isArray(parsed.candidates) || !parsed.candidates.length || parsed.candidates.length > 100) {
    throw new Error("Identity Lab JSON does not contain a valid candidate deck.");
  }
  const configuration: IdentityLabConfiguration = {
    sessionSeed: requiredString(parsed.configuration.sessionSeed, "configuration.sessionSeed").slice(0, 80),
    samplesPerType: Math.max(1, Math.min(5, Math.round(Number(parsed.configuration.samplesPerType) || 1))),
    size: String(parsed.configuration.size) as MapSizeId,
    style: String(parsed.configuration.style) as GenerationStyle,
    modifier: String(parsed.configuration.modifier) as WorldModifier,
    prototypeTypes: Array.isArray(parsed.configuration.prototypeTypes)
      ? parsed.configuration.prototypeTypes.filter((preset): preset is MapPresetId => presetIds.has(String(preset) as MapPresetId))
      : [],
  };
  if (!MAP_SIZES.some((size) => size.id === configuration.size)) throw new Error("Identity Lab JSON uses an unknown map size.");
  const candidates = parsed.candidates.map((value, index): IdentityLabCandidate => {
    if (!isRecord(value) || !isRecord(value.options)) throw new Error(`Identity Lab candidate ${index + 1} is invalid.`);
    const intendedPreset = String(value.intendedPreset) as MapPresetId;
    const preset = MAP_PRESETS.find((item) => item.id === intendedPreset);
    if (!preset || !prototypeIds.has(intendedPreset)) throw new Error(`Identity Lab candidate ${index + 1} uses an unsupported intended identity.`);
    const options = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...value.options,
      engine: preset.engine,
      preset: intendedPreset,
      dominantTerrains: Array.isArray(value.options.dominantTerrains) ? [...value.options.dominantTerrains] : [],
    } as MapGenerationOptions;
    let review: IdentityLabReview | undefined;
    if (isRecord(value.review)) {
      const guessPrimary = String(value.review.guessPrimary) as MapPresetId;
      const guessSecondary = value.review.guessSecondary ? String(value.review.guessSecondary) as MapPresetId : undefined;
      const choices = identityLabChoices(preset.engine);
      if (!choices.some((choice) => choice.id === guessPrimary) || guessSecondary && !choices.some((choice) => choice.id === guessSecondary)) {
        throw new Error(`Identity Lab candidate ${index + 1} contains a guess from the wrong engine.`);
      }
      review = {
        guessPrimary,
        guessSecondary,
        confidence: Math.max(1, Math.min(5, Math.round(Number(value.review.confidence) || 1))) as IdentityLabReview["confidence"],
        cues: Array.isArray(value.review.cues) ? value.review.cues.filter((cue): cue is IdentityCue => cueIds.has(String(cue))) : [],
        notes: typeof value.review.notes === "string" ? value.review.notes.slice(0, 4000) : "",
        submittedAt: requiredString(value.review.submittedAt, `candidate ${index + 1} review timestamp`),
        verdict: (["RECOGNIZABLE", "AMBIGUOUS", "ATTRACTIVE_WRONG", "FAILED"] as string[]).includes(String(value.review.verdict)) ? value.review.verdict as IdentityVerdict : undefined,
      };
    }
    const diagnostics = isRecord(value.diagnostics)
      ? Object.fromEntries(Object.entries(value.diagnostics).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
      : undefined;
    return {
      id: requiredString(value.id, `candidate ${index + 1} id`).slice(0, 160),
      intendedPreset,
      engine: preset.engine,
      options,
      generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : undefined,
      generationError: typeof value.generationError === "string" ? value.generationError.slice(0, 500) : undefined,
      diagnostics,
      review,
      revealedAt: typeof value.revealedAt === "string" ? value.revealedAt : undefined,
    };
  });
  return reconciled({
    schema: IDENTITY_LAB_SCHEMA,
    schemaVersion: IDENTITY_LAB_SCHEMA_VERSION,
    narrativeGuide: IDENTITY_NARRATIVE_GUIDE,
    id: requiredString(parsed.id, "session id").slice(0, 160),
    createdAt: requiredString(parsed.createdAt, "createdAt"),
    updatedAt: requiredString(parsed.updatedAt, "updatedAt"),
    currentIndex: Math.round(Number(parsed.currentIndex) || 0),
    configuration,
    candidates,
  });
}

export function identityLabFileName(session: IdentityLabSession) {
  const date = session.updatedAt.slice(0, 10) || "session";
  return `excogitare-identity-lab-${date}-${session.id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.json`;
}
