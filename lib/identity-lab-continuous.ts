import type { Civ5Map } from "./civ5-map.ts";
import { generationOptionsFromRecipe, generationRecipeFromOptions, normalizeGenerationRecipe, type GenerationRecipe, type WorldScale } from "./generation-recipe.ts";
import {
  captureIdentityDiagnostics,
  exportIdentityLabSession as exportLegacyIdentityLabSession,
  identityLabFileName as legacyIdentityLabFileName,
  importIdentityLabSession as importLegacyIdentityLabSession,
  type IdentityLabSession as LegacyIdentityLabSession,
} from "./identity-lab.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  fantasticalityForPreset,
  MAP_PRESETS,
  MAP_SIZES,
  type GenerationStyle,
  type MapGenerationOptions,
  type MapPresetId,
  type MapSizeId,
  type WorldModifier,
} from "./map-generator.ts";
import { NARRATIVE_PROFILES } from "./narrative-map-types.ts";
import type { NarrativeAssessment } from "./narrative-types.ts";

export const CONTINUOUS_IDENTITY_LAB_SCHEMA = "excogitare.identity-lab";
export const CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION = 2;
export const CONTINUOUS_IDENTITY_LAB_STORAGE_KEY = "excogitare.identity-lab.v2";
export const CONTINUOUS_IDENTITY_NARRATIVE_GUIDE = {
  version: 1,
  path: "docs/features/map-type-narrative-identities.md",
} as const;

export type ContinuousIdentityLabConfiguration = {
  sessionSeed: string;
  size: MapSizeId;
  style: GenerationStyle;
  modifier: WorldModifier;
  targetTypes: MapPresetId[];
};

export type IdentityLabNarrativeEvidence = Pick<NarrativeAssessment,
  "profileId" | "label" | "grade" | "score" | "summary" | "motifs" | "antiMotifs" | "parameterDeviations" | "weakened" | "nearestConfusions" | "legalityRelaxations"
>;

export type ContinuousIdentityLabTrial = {
  id: string;
  sequence: number;
  targetPreset: MapPresetId;
  choices: [MapPresetId, MapPresetId, MapPresetId, MapPresetId];
  correctPosition: 0 | 1 | 2 | 3;
  recipe: GenerationRecipe;
  options: MapGenerationOptions;
  createdAt: string;
  presentedAt?: string;
  generatedAt?: string;
  generationError?: string;
  diagnostics?: Record<string, number>;
  narrativeEvidence?: IdentityLabNarrativeEvidence;
  selectedPreset?: MapPresetId;
  selectedPosition?: 0 | 1 | 2 | 3;
  answeredAt?: string;
  responseTimeMs?: number;
};

export type ContinuousIdentityLabSummary = {
  trialsCreated: number;
  trialsAnswered: number;
  correct: number;
  accuracyPercent: number;
  averageResponseTimeMs: number;
  byIdentity: Array<{ targetPreset: MapPresetId; answered: number; correct: number; accuracyPercent: number }>;
  confusions: Array<{ targetPreset: MapPresetId; selectedPreset: MapPresetId; count: number }>;
  choicePositions: [number, number, number, number];
};

export type ContinuousIdentityLabSession = {
  schema: typeof CONTINUOUS_IDENTITY_LAB_SCHEMA;
  schemaVersion: typeof CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION;
  narrativeGuide: typeof CONTINUOUS_IDENTITY_NARRATIVE_GUIDE;
  id: string;
  status: "ACTIVE" | "ENDED";
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  currentTrialId: string;
  configuration: ContinuousIdentityLabConfiguration;
  trials: ContinuousIdentityLabTrial[];
  summary: ContinuousIdentityLabSummary;
};

export type IdentityLabEvidence = ContinuousIdentityLabSession | LegacyIdentityLabSession;

const presetIds = new Set<MapPresetId>(MAP_PRESETS.map((preset) => preset.id));
const styleIds = new Set<GenerationStyle>(["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"]);
const modifierIds = new Set<WorldModifier>(["NONE", "STRATEGIC_DEPTH", "FRACTURED", "FANTASTICAL", "DOOMSDAY"]);

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffled<T>(values: ReadonlyArray<T>, seed: string) {
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

function normalizedConfiguration(configuration: Partial<ContinuousIdentityLabConfiguration>): ContinuousIdentityLabConfiguration {
  const targetTypes = configuration.targetTypes?.filter((preset): preset is MapPresetId => presetIds.has(preset)) ?? MAP_PRESETS.map((preset) => preset.id);
  return {
    sessionSeed: (configuration.sessionSeed ?? "continuous-lab").trim().slice(0, 80) || "continuous-lab",
    size: MAP_SIZES.some((size) => size.id === configuration.size) ? configuration.size! : "STANDARD",
    style: styleIds.has(configuration.style as GenerationStyle) ? configuration.style! : "MUNDANE",
    modifier: modifierIds.has(configuration.modifier as WorldModifier) ? configuration.modifier! : "NONE",
    targetTypes: [...new Set(targetTypes.length >= 4 ? targetTypes : MAP_PRESETS.map((preset) => preset.id))],
  };
}

function targetForSequence(configuration: ContinuousIdentityLabConfiguration, sequence: number) {
  const batch = Math.floor(sequence / configuration.targetTypes.length);
  const position = sequence % configuration.targetTypes.length;
  return shuffled(configuration.targetTypes, `${configuration.sessionSeed}:targets:${batch}`)[position];
}

function distractorsForTarget(target: MapPresetId, configuration: ContinuousIdentityLabConfiguration, sequence: number) {
  const profile = NARRATIVE_PROFILES[target];
  const allowed = new Set(configuration.targetTypes);
  const explicit = profile.nearestConfusions.filter((preset): preset is MapPresetId => presetIds.has(preset as MapPresetId) && allowed.has(preset as MapPresetId)) as MapPresetId[];
  const reciprocal = configuration.targetTypes.filter((preset) => preset !== target && NARRATIVE_PROFILES[preset].nearestConfusions.includes(target));
  const sameEngine = configuration.targetTypes.filter((preset) => preset !== target && NARRATIVE_PROFILES[preset].engine === profile.engine);
  const fallback = configuration.targetTypes.filter((preset) => preset !== target);
  const ranked: MapPresetId[] = [];
  for (const [tier, values] of [explicit, reciprocal, sameEngine, fallback].entries()) {
    for (const preset of shuffled(values, `${configuration.sessionSeed}:distractors:${sequence}:${target}:${tier}`)) if (preset !== target && !ranked.includes(preset)) ranked.push(preset);
  }
  return ranked.slice(0, 3) as [MapPresetId, MapPresetId, MapPresetId];
}

function polisPlayerCount(preset: MapPresetId, recommended: number) {
  if (preset === "THREE_REALMS") return Math.max(3, Math.floor(Math.max(3, recommended) / 3) * 3);
  if (["OPPOSING_FRONTS", "UNEQUAL_REALMS", "THALASSIC_LEAGUE"].includes(preset)) return Math.max(4, recommended);
  return recommended;
}

function optionsForTrial(target: MapPresetId, configuration: ContinuousIdentityLabConfiguration, sequence: number) {
  const preset = MAP_PRESETS.find((item) => item.id === target)!;
  const profile = NARRATIVE_PROFILES[target];
  const size = MAP_SIZES.find((item) => item.id === configuration.size) ?? MAP_SIZES[3];
  const scale = (profile.preferredScales[0] ?? "GLOBAL") as WorldScale;
  const players = preset.engine === "POLIS" ? polisPlayerCount(target, size.recommendedPlayers) : size.recommendedPlayers;
  const options: MapGenerationOptions = {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: target,
    size: configuration.size,
    seed: `identity-${configuration.sessionSeed}-${String(sequence + 1).padStart(5, "0")}-${target.toLowerCase()}`,
    players,
    cityStates: Math.min(size.recommendedCityStates, players),
    style: configuration.style,
    modifier: configuration.modifier,
    waterPercent: profile.parameterEnvelope.preferredWater,
    mountainPercent: configuration.style === "BRUTAL" ? Math.max(18, profile.parameterEnvelope.preferredMountains) : profile.parameterEnvelope.preferredMountains,
    riverDensity: profile.parameterEnvelope.preferredRiverDensity ?? preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    climateRealism: preset.climateRealism ?? false,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    fantasticality: preset.engine === "ECCENTRIC" ? fantasticalityForPreset(target) : DEFAULT_GENERATION_OPTIONS.fantasticality,
    regionClimateLogic: preset.engine === "ECCENTRIC" && preset.climateRealism ? "ORDERED" : "LAWLESS",
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    dominantTerrains: [],
  };
  const recipe = generationRecipeFromOptions(options);
  recipe.scale = scale;
  return { options, recipe };
}

function createTrial(configuration: ContinuousIdentityLabConfiguration, sequence: number, now: string): ContinuousIdentityLabTrial {
  const targetPreset = targetForSequence(configuration, sequence);
  const distractors = distractorsForTarget(targetPreset, configuration, sequence);
  const choices = shuffled([targetPreset, ...distractors], `${configuration.sessionSeed}:choice-order:${sequence}`) as [MapPresetId, MapPresetId, MapPresetId, MapPresetId];
  const { options, recipe } = optionsForTrial(targetPreset, configuration, sequence);
  return {
    id: `trial-${sequence + 1}-${hashText(`${configuration.sessionSeed}:${sequence}:${targetPreset}`).toString(36)}`,
    sequence,
    targetPreset,
    choices,
    correctPosition: choices.indexOf(targetPreset) as 0 | 1 | 2 | 3,
    recipe,
    options,
    createdAt: now,
  };
}

export function summarizeContinuousIdentityLab(session: Pick<ContinuousIdentityLabSession, "configuration" | "trials">): ContinuousIdentityLabSummary {
  const answered = session.trials.filter((trial) => trial.answeredAt && trial.selectedPreset);
  const correct = answered.filter((trial) => trial.selectedPreset === trial.targetPreset).length;
  const byIdentity = session.configuration.targetTypes.map((targetPreset) => {
    const trials = answered.filter((trial) => trial.targetPreset === targetPreset);
    const matches = trials.filter((trial) => trial.selectedPreset === targetPreset).length;
    return { targetPreset, answered: trials.length, correct: matches, accuracyPercent: trials.length ? Math.round(matches / trials.length * 100) : 0 };
  });
  const confusionCounts = new Map<string, number>();
  for (const trial of answered) {
    if (!trial.selectedPreset || trial.selectedPreset === trial.targetPreset) continue;
    const key = `${trial.targetPreset}:${trial.selectedPreset}`;
    confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
  }
  const confusions = [...confusionCounts.entries()].map(([key, count]) => {
    const [targetPreset, selectedPreset] = key.split(":") as [MapPresetId, MapPresetId];
    return { targetPreset, selectedPreset, count };
  }).sort((one, two) => two.count - one.count || one.targetPreset.localeCompare(two.targetPreset));
  const responseTimes = answered.flatMap((trial) => trial.responseTimeMs === undefined ? [] : [trial.responseTimeMs]);
  const choicePositions = answered.reduce<[number, number, number, number]>((counts, trial) => {
    if (trial.selectedPosition !== undefined) counts[trial.selectedPosition] += 1;
    return counts;
  }, [0, 0, 0, 0]);
  return {
    trialsCreated: session.trials.length,
    trialsAnswered: answered.length,
    correct,
    accuracyPercent: answered.length ? Math.round(correct / answered.length * 100) : 0,
    averageResponseTimeMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : 0,
    byIdentity,
    confusions,
    choicePositions,
  };
}

function cloneTrial(trial: ContinuousIdentityLabTrial): ContinuousIdentityLabTrial {
  return {
    ...trial,
    choices: [...trial.choices] as ContinuousIdentityLabTrial["choices"],
    options: { ...trial.options, dominantTerrains: [...trial.options.dominantTerrains] },
    recipe: { ...trial.recipe, settings: { ...trial.recipe.settings, dominantTerrains: [...trial.recipe.settings.dominantTerrains] }, matchIntent: { ...trial.recipe.matchIntent, enabledVictories: [...trial.recipe.matchIntent.enabledVictories], emphasizedVictories: [...trial.recipe.matchIntent.emphasizedVictories], seats: trial.recipe.matchIntent.seats?.map((seat) => ({ ...seat })) } },
    diagnostics: trial.diagnostics ? { ...trial.diagnostics } : undefined,
    narrativeEvidence: trial.narrativeEvidence ? {
      ...trial.narrativeEvidence,
      motifs: trial.narrativeEvidence.motifs.map((finding) => ({ ...finding })),
      antiMotifs: trial.narrativeEvidence.antiMotifs.map((finding) => ({ ...finding })),
      parameterDeviations: [...trial.narrativeEvidence.parameterDeviations],
      weakened: [...trial.narrativeEvidence.weakened],
      nearestConfusions: trial.narrativeEvidence.nearestConfusions.map((finding) => ({ ...finding })),
      legalityRelaxations: [...trial.narrativeEvidence.legalityRelaxations],
    } : undefined,
  };
}

function reconcile(session: Omit<ContinuousIdentityLabSession, "summary"> | ContinuousIdentityLabSession): ContinuousIdentityLabSession {
  const trials = session.trials.map(cloneTrial).sort((one, two) => one.sequence - two.sequence);
  const result = { ...session, configuration: { ...session.configuration, targetTypes: [...session.configuration.targetTypes] }, trials } as ContinuousIdentityLabSession;
  result.summary = summarizeContinuousIdentityLab(result);
  return result;
}

export function createContinuousIdentityLabSession(configuration: Partial<ContinuousIdentityLabConfiguration>, now: string): ContinuousIdentityLabSession {
  const normalized = normalizedConfiguration(configuration);
  const trials = [createTrial(normalized, 0, now), createTrial(normalized, 1, now)];
  return reconcile({
    schema: CONTINUOUS_IDENTITY_LAB_SCHEMA,
    schemaVersion: CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION,
    narrativeGuide: CONTINUOUS_IDENTITY_NARRATIVE_GUIDE,
    id: `lab-${hashText(`${normalized.sessionSeed}:${now}`).toString(36)}`,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    currentTrialId: trials[0].id,
    configuration: normalized,
    trials,
  });
}

export function currentContinuousIdentityLabTrial(session: ContinuousIdentityLabSession) {
  return session.trials.find((trial) => trial.id === session.currentTrialId);
}

export function prefetchedContinuousIdentityLabTrial(session: ContinuousIdentityLabSession) {
  const current = currentContinuousIdentityLabTrial(session);
  return current ? session.trials.find((trial) => trial.sequence === current.sequence + 1) : undefined;
}

export function presentContinuousIdentityLabTrial(session: ContinuousIdentityLabSession, trialId: string, now: string) {
  if (session.status !== "ACTIVE") return session;
  return reconcile({ ...session, updatedAt: now, trials: session.trials.map((trial) => trial.id === trialId && !trial.presentedAt ? { ...trial, presentedAt: now } : trial) });
}

function narrativeEvidence(map: Civ5Map): IdentityLabNarrativeEvidence | undefined {
  const assessment = map.structure?.narrativeAssessment;
  if (!assessment) return undefined;
  return {
    profileId: assessment.profileId,
    label: assessment.label,
    grade: assessment.grade,
    score: assessment.score,
    summary: assessment.summary,
    motifs: assessment.motifs.map((finding) => ({ ...finding })),
    antiMotifs: assessment.antiMotifs.map((finding) => ({ ...finding })),
    parameterDeviations: [...assessment.parameterDeviations],
    weakened: [...assessment.weakened],
    nearestConfusions: assessment.nearestConfusions.map((finding) => ({ ...finding })),
    legalityRelaxations: [...assessment.legalityRelaxations],
  };
}

export function recordContinuousIdentityLabGeneration(session: ContinuousIdentityLabSession, trialId: string, map: Civ5Map, now: string) {
  if (!session.trials.some((trial) => trial.id === trialId)) throw new Error("Identity Lab trial was not found.");
  return reconcile({
    ...session,
    updatedAt: now,
    trials: session.trials.map((trial) => trial.id === trialId ? { ...trial, generatedAt: now, generationError: undefined, diagnostics: captureIdentityDiagnostics(map), narrativeEvidence: narrativeEvidence(map) } : trial),
  });
}

export function recordContinuousIdentityLabGenerationError(session: ContinuousIdentityLabSession, trialId: string, message: string, now: string) {
  if (!session.trials.some((trial) => trial.id === trialId)) throw new Error("Identity Lab trial was not found.");
  return reconcile({ ...session, updatedAt: now, trials: session.trials.map((trial) => trial.id === trialId ? { ...trial, generationError: message.slice(0, 500) } : trial) });
}

export function submitContinuousIdentityLabAnswer(session: ContinuousIdentityLabSession, trialId: string, selectedPreset: MapPresetId, now: string) {
  if (session.status !== "ACTIVE") throw new Error("This Identity Lab session has ended.");
  const current = currentContinuousIdentityLabTrial(session);
  if (!current || current.id !== trialId) throw new Error("Only the current Identity Lab trial can be answered.");
  if (current.answeredAt) throw new Error("This Identity Lab trial has already been answered.");
  const selectedPosition = current.choices.indexOf(selectedPreset);
  if (selectedPosition < 0) throw new Error("Choose one of the four presented Map Types.");
  const presented = Date.parse(current.presentedAt ?? current.generatedAt ?? current.createdAt);
  const answered = Date.parse(now);
  const responseTimeMs = Number.isFinite(presented) && Number.isFinite(answered) ? Math.max(0, Math.min(86_400_000, answered - presented)) : 0;
  const answeredTrials = session.trials.map((trial) => trial.id === trialId ? { ...trial, selectedPreset, selectedPosition: selectedPosition as 0 | 1 | 2 | 3, answeredAt: now, responseTimeMs } : trial);
  const next = answeredTrials.find((trial) => trial.sequence === current.sequence + 1);
  if (!next) throw new Error("Identity Lab prefetch metadata is missing; retry without losing this trial.");
  const highestSequence = Math.max(...answeredTrials.map((trial) => trial.sequence));
  const trials = [...answeredTrials, createTrial(session.configuration, highestSequence + 1, now)];
  return reconcile({ ...session, updatedAt: now, currentTrialId: next.id, trials });
}

export function endContinuousIdentityLabSession(session: ContinuousIdentityLabSession, now: string) {
  return reconcile({ ...session, status: "ENDED", endedAt: now, updatedAt: now });
}

export function isContinuousIdentityLabSession(evidence: IdentityLabEvidence): evidence is ContinuousIdentityLabSession {
  return evidence.schemaVersion === CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Identity Lab JSON is missing ${field}.`);
  return value;
}

function validatedOptions(value: unknown, target: MapPresetId, field: string) {
  if (!isRecord(value)) throw new Error(`Identity Lab JSON contains invalid ${field}.`);
  const preset = MAP_PRESETS.find((item) => item.id === target)!;
  return { ...DEFAULT_GENERATION_OPTIONS, ...value, engine: preset.engine, preset: target, dominantTerrains: Array.isArray(value.dominantTerrains) ? [...value.dominantTerrains] : [] } as MapGenerationOptions;
}

function importV2(parsed: Record<string, unknown>): ContinuousIdentityLabSession {
  if (!isRecord(parsed.configuration) || !Array.isArray(parsed.trials) || parsed.trials.length < 2 || parsed.trials.length > 100_000) throw new Error("Identity Lab JSON does not contain a valid continuous trial stream.");
  const configuration = normalizedConfiguration({
    sessionSeed: requiredString(parsed.configuration.sessionSeed, "configuration.sessionSeed"),
    size: String(parsed.configuration.size) as MapSizeId,
    style: String(parsed.configuration.style) as GenerationStyle,
    modifier: String(parsed.configuration.modifier) as WorldModifier,
    targetTypes: Array.isArray(parsed.configuration.targetTypes) ? parsed.configuration.targetTypes.filter((preset): preset is MapPresetId => presetIds.has(String(preset) as MapPresetId)) : [],
  });
  const ids = new Set<string>();
  const sequences = new Set<number>();
  const trials = parsed.trials.map((value, index): ContinuousIdentityLabTrial => {
    if (!isRecord(value)) throw new Error(`Identity Lab trial ${index + 1} is invalid.`);
    const id = requiredString(value.id, `trial ${index + 1} id`).slice(0, 160);
    const sequence = Math.round(Number(value.sequence));
    const targetPreset = String(value.targetPreset) as MapPresetId;
    const choices = Array.isArray(value.choices) ? value.choices.map(String) as MapPresetId[] : [];
    if (ids.has(id) || !Number.isInteger(sequence) || sequence < 0 || sequences.has(sequence)) throw new Error(`Identity Lab trial ${index + 1} has a duplicate id or sequence.`);
    if (!presetIds.has(targetPreset) || choices.length !== 4 || new Set(choices).size !== 4 || !choices.every((choice) => presetIds.has(choice)) || !choices.includes(targetPreset)) throw new Error(`Identity Lab trial ${index + 1} does not contain exactly four valid choices and one target.`);
    ids.add(id); sequences.add(sequence);
    const importedOptions = validatedOptions(value.options, targetPreset, `trial ${index + 1} options`);
    const recipe = normalizeGenerationRecipe(value.recipe ?? importedOptions, importedOptions);
    if (recipe.mapType !== targetPreset || recipe.engine !== MAP_PRESETS.find((item) => item.id === targetPreset)!.engine) throw new Error(`Identity Lab trial ${index + 1} recipe does not match its target identity.`);
    const options = generationOptionsFromRecipe(recipe);
    const selectedPreset = value.selectedPreset ? String(value.selectedPreset) as MapPresetId : undefined;
    const selectedPosition = selectedPreset ? choices.indexOf(selectedPreset) : -1;
    if (selectedPreset && selectedPosition < 0) throw new Error(`Identity Lab trial ${index + 1} selected an unavailable choice.`);
    const diagnostics = isRecord(value.diagnostics) ? Object.fromEntries(Object.entries(value.diagnostics).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : undefined;
    return {
      id,
      sequence,
      targetPreset,
      choices: choices as ContinuousIdentityLabTrial["choices"],
      correctPosition: choices.indexOf(targetPreset) as 0 | 1 | 2 | 3,
      options,
      recipe,
      createdAt: requiredString(value.createdAt, `trial ${index + 1} createdAt`),
      presentedAt: typeof value.presentedAt === "string" ? value.presentedAt : undefined,
      generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : undefined,
      generationError: typeof value.generationError === "string" ? value.generationError.slice(0, 500) : undefined,
      diagnostics,
      narrativeEvidence: isRecord(value.narrativeEvidence) ? value.narrativeEvidence as unknown as IdentityLabNarrativeEvidence : undefined,
      selectedPreset,
      selectedPosition: selectedPosition >= 0 ? selectedPosition as 0 | 1 | 2 | 3 : undefined,
      answeredAt: typeof value.answeredAt === "string" ? value.answeredAt : undefined,
      responseTimeMs: selectedPreset ? Math.max(0, Math.min(86_400_000, Math.round(Number(value.responseTimeMs) || 0))) : undefined,
    };
  }).sort((one, two) => one.sequence - two.sequence);
  const currentTrialId = requiredString(parsed.currentTrialId, "currentTrialId");
  const current = trials.find((trial) => trial.id === currentTrialId);
  const status = parsed.status === "ENDED" ? "ENDED" as const : "ACTIVE" as const;
  if (!current) throw new Error("Identity Lab JSON points to a missing current trial.");
  if (status === "ACTIVE") {
    const unanswered = trials.filter((trial) => !trial.answeredAt);
    if (unanswered.length !== 2 || unanswered[0].id !== currentTrialId || unanswered[1].sequence !== current.sequence + 1) throw new Error("An active Identity Lab session must retain exactly the current and prefetched trial metadata.");
  }
  return reconcile({
    schema: CONTINUOUS_IDENTITY_LAB_SCHEMA,
    schemaVersion: CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION,
    narrativeGuide: CONTINUOUS_IDENTITY_NARRATIVE_GUIDE,
    id: requiredString(parsed.id, "session id").slice(0, 160),
    status,
    createdAt: requiredString(parsed.createdAt, "createdAt"),
    updatedAt: requiredString(parsed.updatedAt, "updatedAt"),
    endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : undefined,
    currentTrialId,
    configuration,
    trials,
  });
}

export function importIdentityLabEvidence(source: string): IdentityLabEvidence {
  if (new TextEncoder().encode(source).byteLength > 16 * 1024 * 1024) throw new Error("Identity Lab JSON exceeds the 16 MB safety limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("Identity Lab JSON could not be parsed."); }
  if (!isRecord(parsed) || parsed.schema !== CONTINUOUS_IDENTITY_LAB_SCHEMA) throw new Error(`Expected ${CONTINUOUS_IDENTITY_LAB_SCHEMA} JSON.`);
  if (parsed.schemaVersion === 1) return importLegacyIdentityLabSession(source);
  if (parsed.schemaVersion === CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION) return importV2(parsed);
  throw new Error(`Identity Lab schema version ${String(parsed.schemaVersion)} is not supported; expected version 1 or 2.`);
}

export function exportIdentityLabEvidence(evidence: IdentityLabEvidence) {
  return isContinuousIdentityLabSession(evidence) ? `${JSON.stringify(reconcile(evidence), null, 2)}\n` : exportLegacyIdentityLabSession(evidence);
}

export function continuousIdentityLabFileName(evidence: IdentityLabEvidence) {
  if (!isContinuousIdentityLabSession(evidence)) return legacyIdentityLabFileName(evidence);
  const date = evidence.updatedAt.slice(0, 10) || "session";
  return `excogitare-identity-lab-v2-${date}-${evidence.id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.json`;
}
