import { createHash } from "node:crypto";
import { captureEngineNarrativeStage, observableFromMap } from "../lib/engine-narrative-diagnostics.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { GENERATION_PASS_DEFINITIONS } from "../lib/generation-pass-graph.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  GENERATION_PIPELINE_VERSION,
  MAP_PRESETS,
  fantasticalityForPreset,
  generateMapFromRecipe,
  polisPatternForPreset,
  resolveMapDimensions,
  type GenerationEngine,
  type MapGenerationOptions,
  type MapPresetId,
} from "../lib/map-generator.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { inspectCiv5MapStructure, serializeCiv5Map, type Civ5Map } from "../lib/civ5-map.ts";
import { narrativeConstraintProgramHash } from "../lib/narrative-constraints.ts";
import { evaluateNarrativeContentEvidence } from "../lib/narrative-content-evidence.ts";
import { evaluateNarrativeNativeEvidence } from "../lib/narrative-native-evidence.ts";
import { evaluateNarrativeNaturalism } from "../lib/narrative-naturalism.ts";
import { evaluateNarrativeConstraintProgram, extractNarrativeSemantics, narrativeEvaluationInputHash } from "../lib/narrative-semantics.ts";

type FinalMetrics = ReturnType<typeof finalMetrics>;
type InterventionMetrics = NonNullable<ReturnType<typeof interventionMetrics>>;

type AuditFailureCode =
  | "GENERATION_FAILED"
  | "NATIVE_EVIDENCE_NOT_PROVEN"
  | "CONTENT_EVIDENCE_UNAVAILABLE"
  | "CONTENT_EVIDENCE_FAILED"
  | "NATURALISM_FAILED"
  | "SEMANTIC_HARD_FAILURE"
  | "UNAUTHORIZED_CAPACITY"
  | "NARRATIVE_TOPOLOGY_CHANGED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_STALE"
  | "REPAIR_ERROR"
  | "INVALID_CIV5MAP_STRUCTURE"
  | "NONDETERMINISTIC_OUTPUT";

type AuditFailure = {
  profileId: MapPresetId;
  engine: GenerationEngine;
  seed: string;
  code: AuditFailureCode;
  detail: string;
  run?: 1 | 2;
};

type SeedRecord = {
  seed: string;
  status: "PASS" | "FAIL";
  normalizedMapDigest?: string;
  binaryDigest?: string;
  failureCodes: AuditFailureCode[];
};

const arguments_ = process.argv.slice(2);
const valueArgument = (name: string) => arguments_.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const sizeArgument = valueArgument("size");
const supportedSizes = ["DUEL", "TINY", "SMALL", "STANDARD", "LARGE", "HUGE"] as const;
if (sizeArgument && !supportedSizes.includes(sizeArgument as typeof supportedSizes[number])) throw new Error(`Unsupported audit size ${sizeArgument}.`);
const SIZE = (sizeArgument ?? "TINY") as MapGenerationOptions["size"];
const seedsArgument = valueArgument("seeds");
const AUDIT_SEEDS = seedsArgument === undefined ? ["audit-alpha", "audit-delta"] : seedsArgument.split(",").filter(Boolean);
if (!AUDIT_SEEDS.length) throw new Error("The audit requires at least one non-empty seed.");
const focusArgument = valueArgument("focus");
const FOCUS = new Set(focusArgument?.split(",").filter(Boolean) ?? []);
const unknownFocus = [...FOCUS].filter((id) => !MAP_PRESETS.some((preset) => preset.id === id));
if (unknownFocus.length) throw new Error(`Unknown focused Map Type(s): ${unknownFocus.join(", ")}.`);
const selectedPresets = MAP_PRESETS.filter((candidate) => !FOCUS.size || FOCUS.has(candidate.id));
if (!selectedPresets.length) throw new Error("The audit selected no owner Map Types.");
const INJECT_FAILURE = valueArgument("inject-failure");
if (INJECT_FAILURE && !["NONDETERMINISM", "STALE_EVIDENCE"].includes(INJECT_FAILURE)) throw new Error(`Unsupported deliberate failure injection ${INJECT_FAILURE}.`);
const JSON_MODE = arguments_.includes("--json") || !arguments_.includes("--text");

function optionsForPreset(presetId: MapPresetId, seed: string): MapGenerationOptions {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`Unknown Map Type ${presetId}`);
  const naturalCharacter = preset.engine === "ECCENTRIC"
    ? "FANTASTICAL"
    : preset.engine === "PHYSICAL"
      ? "REALISTIC"
      : "MUNDANE";
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: preset.id,
    size: SIZE,
    seed,
    players: 4,
    cityStates: 4,
    style: naturalCharacter,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    climateRealism: preset.climateRealism ?? DEFAULT_GENERATION_OPTIONS.climateRealism,
    riverDensity: preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    fantasticality: fantasticalityForPreset(preset.id),
    polisConflictPattern: polisPatternForPreset(preset.id),
  };
}

function finalMetrics(map: Civ5Map) {
  const retained = map.structure?.engineNarrativeEvidence?.stages.FINAL?.metrics
    ?? captureEngineNarrativeStage("FINAL", observableFromMap(map), map.width, map.height, map.wraps).metrics;
  const narrative = map.structure?.narrativeAssessment;
  const semantic = map.structure?.narrativeEvaluation;
  const native = map.structure?.narrativeNativeEvidence;
  const content = map.structure?.narrativeContentEvidence;
  return {
    landShare: retained.landShare,
    landComponents: retained.landComponents,
    waterComponents: retained.waterComponents,
    dominantLandShare: retained.dominantLandShare,
    smallIslandShare: retained.smallIslandShare,
    coastlinePerLandTile: retained.coastlinePerLandTile,
    mountainShareOfLand: retained.mountainShareOfLand,
    horizontalMirrorMismatch: retained.horizontalMirrorMismatch,
    verticalMirrorMismatch: retained.verticalMirrorMismatch,
    majorStarts: map.startLocations.filter((start) => !start.cityState).length,
    cityStateStarts: map.startLocations.filter((start) => start.cityState).length,
    riverTiles: map.tiles.filter((tile) => tile.river).length,
    narrativeScore: narrative?.score ?? 0,
    motifPassRate: narrative?.motifs.length ? narrative.motifs.filter((motif) => motif.status === "MET").length / narrative.motifs.length : 0,
    antiMotifPassRate: narrative?.antiMotifs.length ? narrative.antiMotifs.filter((motif) => motif.status === "MET").length / narrative.antiMotifs.length : 0,
    weakenedCount: narrative?.weakened.length ?? 0,
    semanticScore: semantic?.score ?? 0,
    hardSemanticFailures: semantic?.findings.filter((finding) => (finding.strength === "ESSENTIAL" || finding.strength === "PROHIBITED") && (finding.status === "FAILED" || finding.status === "UNAVAILABLE")).length ?? 1,
    nativeInvariantFailures: native?.findings.filter((finding) => finding.status !== "PROVEN").length ?? 1,
    contentFailures: content?.status === "FAILED" || content?.status === "NOT_APPLICABLE" ? 1 : 0,
    naturalismScore: map.structure?.narrativeNaturalismEvidence?.score ?? 0,
    naturalismFailures: map.structure?.narrativeNaturalismEvidence?.findings.filter((finding) => finding.status === "FAILED").length ?? 1,
    authoredRelaxations: semantic?.appliedRelaxations.length ?? 0,
  };
}

function interventionMetrics(map: Civ5Map) {
  const evidence = map.structure?.engineNarrativeEvidence;
  const raw = evidence?.stages.RAW_NATIVE;
  const realized = evidence?.stages.NARRATIVE_REALIZED;
  const comparison = evidence?.comparisons.find((item) => item.from === "RAW_NATIVE" && item.to === "NARRATIVE_REALIZED");
  if (!raw || !realized || !comparison) return undefined;
  return {
    topologyChanged: comparison.topologyChanged,
    landRemoved: comparison.landRemoved,
    waterRaised: comparison.waterRaised,
    elevationChanged: comparison.elevationChanged,
    reliefChanged: comparison.reliefChanged ?? 0,
    moistureMeanDelta: comparison.moistureMeanDelta ?? 0,
    temperatureMeanDelta: comparison.temperatureMeanDelta ?? 0,
    polygonImpurityBefore: raw.metrics.polygonImpurity,
    polygonImpurityAfter: realized.metrics.polygonImpurity,
    subregionImpurityBefore: raw.metrics.subregionImpurity,
    subregionImpurityAfter: realized.metrics.subregionImpurity,
  };
}

function average<T extends Record<string, number>>(values: T[]): T {
  const keys = Object.keys(values[0] ?? {}) as Array<keyof T>;
  return Object.fromEntries(keys.map((key) => [key, values.reduce((sum, value) => sum + value[key], 0) / Math.max(1, values.length)])) as T;
}

function rounded<T extends Record<string, number>>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Number(item.toFixed(4))])) as T;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>).map(stableValue);
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([one], [two]) => one.localeCompare(two))
    .map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function normalizedDigest(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
}

function binaryDigest(buffer: ArrayBuffer) {
  return `sha256:${createHash("sha256").update(new Uint8Array(buffer)).digest("hex")}`;
}

function requestedMajorPopulation(value: number) { return Math.max(2, Math.min(22, Math.round(value))); }
function requestedCityStatePopulation(value: number) { return Math.max(0, Math.min(41, Math.round(value))); }

function narrativePopulationTarget(requested: number, adjustment: { reduceMajorsBy: number; minimumMajors: number }) {
  const normalized = requestedMajorPopulation(requested);
  if (adjustment.reduceMajorsBy <= 0) return normalized;
  const minimum = Math.min(normalized, Math.max(2, Math.min(22, Math.round(adjustment.minimumMajors))));
  return Math.max(minimum, normalized - Math.max(0, Math.round(adjustment.reduceMajorsBy)));
}

function narrativeCityStateTarget(requested: number, adjustment: { cityStateFraction: number }) {
  return Math.max(0, Math.min(41, Math.round(requestedCityStatePopulation(requested) * Math.max(0, Math.min(1, adjustment.cityStateFraction)))));
}

function failure(profileId: MapPresetId, engine: GenerationEngine, seed: string, code: AuditFailureCode, detail: string, run?: 1 | 2): AuditFailure {
  return { profileId, engine, seed, code, detail, ...(run ? { run } : {}) };
}

function capacityFailure(map: Civ5Map, options: MapGenerationOptions) {
  const plan = map.structure?.narrativeNativePlan;
  const program = map.structure?.narrativeProgram;
  if (!plan || !program?.generative) return "Population authorization evidence is missing.";
  const adjustment = plan.populationAdjustment;
  const actualMajors = map.startLocations.filter((start) => !start.cityState).length;
  const requestedMajors = requestedMajorPopulation(options.players);
  const expectedMajors = narrativePopulationTarget(requestedMajors, adjustment);
  const actualCityStates = map.startLocations.filter((start) => start.cityState).length;
  const requestedCityStates = requestedCityStatePopulation(options.cityStates);
  const expectedCityStates = narrativeCityStateTarget(requestedCityStates, adjustment);
  const capacityPolicy = program.generative.gameplay.capacityPolicy;
  const populationSteps = program.generative.relaxationPolicy.filter((step) => step.operations.some((operation) => operation.kind === "REDUCE_POPULATION"));
  const activePopulationOperations = plan.appliedRelaxations.flatMap((step) => step.operations).filter((operation) => operation.kind === "REDUCE_POPULATION");
  const populationFloor = Math.min(requestedMajors, Math.max(2, activePopulationOperations.reduce((minimum, operation) => operation.kind === "REDUCE_POPULATION" ? Math.max(minimum, operation.minimum) : minimum, 2)));
  const populationReductionAuthorized = capacityPolicy === "REDUCE_POPULATION" && (populationSteps.length === 0 || activePopulationOperations.length > 0);
  const startDeficit = actualMajors < expectedMajors && !(populationReductionAuthorized && actualMajors >= populationFloor) ? expectedMajors - actualMajors : 0;
  const populationExcess = Math.max(0, actualMajors - expectedMajors);
  const activeCityStateReduction = plan.appliedRelaxations.some((step) => step.operations.some((operation) => operation.kind === "REDUCE_CITY_STATES"));
  const cityStateReductionAuthorized = capacityPolicy === "REDUCE_CITY_STATES" || activeCityStateReduction;
  const cityStateDeficit = actualCityStates < expectedCityStates && !cityStateReductionAuthorized ? expectedCityStates - actualCityStates : 0;
  const cityStateExcess = Math.max(0, actualCityStates - expectedCityStates);
  return startDeficit || populationExcess || cityStateDeficit || cityStateExcess
    ? `Majors actual/expected/requested ${actualMajors}/${expectedMajors}/${requestedMajors}; city states ${actualCityStates}/${expectedCityStates}/${requestedCityStates}; unauthorized deficit/excess ${startDeficit}/${populationExcess}/${cityStateDeficit}/${cityStateExcess}.`
    : undefined;
}

function auditOwnerMap(profileId: MapPresetId, engine: GenerationEngine, seed: string, run: 1 | 2, options: MapGenerationOptions, map: Civ5Map) {
  const failures: AuditFailure[] = [];
  const structure = map.structure;
  const program = structure?.narrativeProgram;
  const adapter = structure?.narrativeAdapter;
  const semanticModel = structure?.narrativeSemanticModel;
  const evaluation = structure?.narrativeEvaluation;
  const native = structure?.narrativeNativeEvidence;
  const content = structure?.narrativeContentEvidence;
  const naturalism = structure?.narrativeNaturalismEvidence;
  const review = structure?.reviewEvidence;
  const engineEvidence = structure?.engineNarrativeEvidence;
  const requiredStages = ["RAW_NATIVE", "NARRATIVE_REALIZED", "LEGAL_NORMALIZED", "FINAL"] as const;
  const missing = [
    !structure && "structure",
    !program && "narrativeProgram",
    !adapter && "narrativeAdapter",
    !semanticModel && "narrativeSemanticModel",
    !evaluation && "narrativeEvaluation",
    !native && "narrativeNativeEvidence",
    !content && "narrativeContentEvidence",
    !naturalism && "narrativeNaturalismEvidence",
    !review && "reviewEvidence",
    !engineEvidence && "engineNarrativeEvidence",
    !structure?.inputHash && "inputHash",
    !structure?.generatorVersion && "generatorVersion",
    !structure?.provenance?.length && "provenance",
    !structure?.passEvidence?.length && "passEvidence",
    ...requiredStages.map((stage) => !engineEvidence?.stages[stage] && `stage:${stage}`),
    !engineEvidence?.comparisons.some((comparison) => comparison.from === "RAW_NATIVE" && comparison.to === "NARRATIVE_REALIZED") && "comparison:RAW_NATIVE→NARRATIVE_REALIZED",
  ].filter((item): item is string => Boolean(item));
  if (missing.length) failures.push(failure(profileId, engine, seed, "EVIDENCE_MISSING", `Missing ${missing.join(", ")}.`, run));

  const stale: string[] = [];
  let currentEvaluation = evaluation;
  let currentNative = native;
  let currentContent = content;
  let currentNaturalism = naturalism;
  if (structure && structure.evidenceState !== "CURRENT") stale.push(`structure=${structure.evidenceState ?? "unset"}`);
  if (structure && structure.engine !== engine) stale.push(`structure engine ${structure.engine} does not match owner ${engine}`);
  if (structure?.generatorVersion && structure.generatorVersion !== GENERATION_PIPELINE_VERSION) stale.push(`generator version ${structure.generatorVersion} is not current ${GENERATION_PIPELINE_VERSION}`);
  if (program && (program.profileId !== profileId || program.engine !== engine)) stale.push(`program owner ${program.profileId}/${program.engine} does not match ${profileId}/${engine}`);
  if (adapter && (adapter.schemaVersion !== 1 || adapter.profileId !== profileId || adapter.engine !== engine)) stale.push("adapter schema or owner mismatch");
  if (semanticModel && semanticModel.schemaVersion !== 1) stale.push("semantic model schema mismatch");
  if (evaluation && (evaluation.schemaVersion !== 1 || evaluation.profileId !== profileId)) stale.push("semantic evaluation schema or owner mismatch");
  if (native && (native.schemaVersion !== 1 || native.profileId !== profileId)) stale.push("native evidence schema or owner mismatch");
  if (content && (content.schemaVersion !== 1 || content.profileId !== profileId)) stale.push("content evidence schema or owner mismatch");
  if (naturalism && (naturalism.schemaVersion !== 1 || naturalism.profileId !== profileId)) stale.push("naturalism evidence schema or owner mismatch");
  if (review && review.schemaVersion !== 1) stale.push("review evidence schema mismatch");
  if (engineEvidence && (engineEvidence.schemaVersion !== 1 || engineEvidence.engine !== engine)) stale.push("engine evidence schema or owner mismatch");
  if (structure?.passEvidence) {
    const definitions = new Map(GENERATION_PASS_DEFINITIONS.map((definition) => [definition.id, definition]));
    const expectedPasses = new Set(definitions.keys());
    const retainedPasses = new Set(structure.passEvidence.map((entry) => entry.passId));
    if (structure.passEvidence.length !== definitions.size || retainedPasses.size !== definitions.size || [...expectedPasses].some((passId) => !retainedPasses.has(passId))) stale.push("pass coverage is incomplete, duplicated, or unexpected");
    if (structure.passEvidence.some((entry) => entry.state !== "CURRENT" || entry.inputHash !== structure.inputHash)) stale.push("pass state/hash mismatch");
    if (structure.passEvidence.some((entry) => definitions.get(entry.passId)?.version !== entry.passVersion)) stale.push("pass version mismatch");
  }
  if (structure?.provenance) {
    const definitions = new Map(GENERATION_PASS_DEFINITIONS.map((definition) => [definition.id, definition]));
    const retainedPasses = new Set(structure.provenance.map((entry) => entry.passId));
    if (structure.provenance.length !== definitions.size || retainedPasses.size !== definitions.size || [...definitions.keys()].some((passId) => !retainedPasses.has(passId))) stale.push("provenance coverage is incomplete, duplicated, or unexpected");
    if (structure.provenance.some((entry) => {
      const definition = definitions.get(entry.passId);
      return !definition
        || entry.passVersion !== definition.version
        || normalizedDigest(entry.dependencies) !== normalizedDigest(definition.dependencies)
        || normalizedDigest(entry.ownedOutputs) !== normalizedDigest(definition.ownedOutputs);
    })) stale.push("provenance definition mismatch");
  }
  if (program && adapter && adapter.programHash !== narrativeConstraintProgramHash(program)) stale.push("adapter/program hash mismatch");
  if (program && evaluation && adapter && semanticModel) {
    if (evaluation.programHash !== adapter.programHash || evaluation.modelHash !== semanticModel.inputHash) stale.push("semantic evaluation lineage mismatch");
    if (evaluation.inputHash !== narrativeEvaluationInputHash(evaluation.programHash, evaluation.modelHash, evaluation.appliedRelaxations)) stale.push("semantic evaluation input hash mismatch");
    if (extractNarrativeSemantics(map).inputHash !== semanticModel.inputHash) stale.push("semantic model no longer matches final map");
  }
  if (native && adapter && (native.programHash !== adapter.programHash || native.grammarFamily !== adapter.grammarFamily)) stale.push("native evidence lineage mismatch");
  if (program) {
    try {
      const recomputedModel = extractNarrativeSemantics(map);
      if (semanticModel && normalizedDigest(recomputedModel) !== normalizedDigest(semanticModel)) stale.push("semantic model payload no longer matches final map");
      const recomputedEvaluation = evaluateNarrativeConstraintProgram(program, recomputedModel, evaluation?.appliedRelaxations ?? []);
      if (evaluation && normalizedDigest(recomputedEvaluation) !== normalizedDigest(evaluation)) stale.push("semantic evaluation payload no longer matches recomputed evidence");
      currentEvaluation = recomputedEvaluation;
      const recomputedContent = evaluateNarrativeContentEvidence(map, program, structure?.narrativeNativePlan?.contract);
      if (content && normalizedDigest(recomputedContent) !== normalizedDigest(content)) stale.push("content evidence payload no longer matches final map");
      currentContent = recomputedContent;
      const recomputedNaturalism = evaluateNarrativeNaturalism(map, program);
      if (naturalism && normalizedDigest(recomputedNaturalism) !== normalizedDigest(naturalism)) stale.push("naturalism evidence payload no longer matches final geography");
      currentNaturalism = recomputedNaturalism;
      if (adapter && structure) {
        const recomputedNative = evaluateNarrativeNativeEvidence(
          { ...map, structure: { ...structure, narrativeSemanticModel: recomputedModel } },
          program,
          adapter,
        );
        if (native && normalizedDigest(recomputedNative) !== normalizedDigest(native)) stale.push("native evidence payload no longer matches final native objects");
        currentNative = recomputedNative;
      }
    } catch (error) {
      stale.push(`evidence recomputation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (engineEvidence?.stages.FINAL) {
    const currentFinal = captureEngineNarrativeStage("FINAL", observableFromMap(map), map.width, map.height, map.wraps);
    if (currentFinal.fingerprint !== engineEvidence.stages.FINAL.fingerprint) stale.push("FINAL fingerprint no longer matches map");
  }
  if (stale.length) failures.push(failure(profileId, engine, seed, "EVIDENCE_STALE", stale.join("; ") + ".", run));

  const nonProvenNative = currentNative?.findings.filter((finding) => finding.status !== "PROVEN").map((finding) => `${finding.invariantId}:${finding.status}`) ?? [];
  if (!native || currentNative?.status !== "PROVEN" || nonProvenNative.length) failures.push(failure(profileId, engine, seed, "NATIVE_EVIDENCE_NOT_PROVEN", currentNative ? `Native status ${currentNative.status}; non-proven findings ${nonProvenNative.join(", ") || "none"}.` : "Native evidence is unavailable.", run));
  const contentApplicable = Boolean(program?.generative && program.generative.content.pattern !== "DISTRIBUTED");
  if (contentApplicable && (!content || currentContent?.status === "NOT_APPLICABLE")) failures.push(failure(profileId, engine, seed, "CONTENT_EVIDENCE_UNAVAILABLE", currentContent ? `Applicable content pattern ${currentContent.pattern} produced no assessable evidence.` : "Applicable content evidence is unavailable.", run));
  else if (currentContent?.status === "FAILED") failures.push(failure(profileId, engine, seed, "CONTENT_EVIDENCE_FAILED", `Failed findings: ${currentContent.findings.filter((finding) => finding.status === "FAILED").map((finding) => finding.id).join(", ") || "unspecified"}.`, run));
  if (!naturalism || currentNaturalism?.status === "FAILED") failures.push(failure(profileId, engine, seed, "NATURALISM_FAILED", currentNaturalism
    ? `Failed findings: ${currentNaturalism.findings.filter((finding) => finding.status === "FAILED").map((finding) => finding.id).join(", ") || "unspecified"}.`
    : "Naturalism evidence is unavailable.", run));

  const hardFindings = currentEvaluation?.findings.filter((finding) => (finding.strength === "ESSENTIAL" || finding.strength === "PROHIBITED") && (finding.status === "FAILED" || finding.status === "UNAVAILABLE")) ?? [];
  if (currentEvaluation && (!currentEvaluation.essentialFloorMet || hardFindings.length)) failures.push(failure(profileId, engine, seed, "SEMANTIC_HARD_FAILURE", `${hardFindings.length} essential/prohibited findings failed or were unavailable: ${hardFindings.map((finding) => finding.constraintId).join(", ") || "essential floor false"}.`, run));

  const capacity = capacityFailure(map, options);
  if (capacity) failures.push(failure(profileId, engine, seed, "UNAUTHORIZED_CAPACITY", capacity, run));
  const rawToRealized = engineEvidence?.comparisons.find((comparison) => comparison.from === "RAW_NATIVE" && comparison.to === "NARRATIVE_REALIZED");
  if (rawToRealized && rawToRealized.topologyChanged !== 0) failures.push(failure(profileId, engine, seed, "NARRATIVE_TOPOLOGY_CHANGED", `RAW_NATIVE→NARRATIVE_REALIZED changed ${rawToRealized.topologyChanged} topology tiles.`, run));

  try {
    const repairErrors = buildRepairIssues(map).filter((issue) => issue.severity === "ERROR");
    if (repairErrors.length) failures.push(failure(profileId, engine, seed, "REPAIR_ERROR", `${repairErrors.length} Repair error(s): ${repairErrors.slice(0, 5).map((issue) => issue.id).join(", ")}.`, run));
  } catch (error) {
    failures.push(failure(profileId, engine, seed, "REPAIR_ERROR", `Repair inspection threw: ${error instanceof Error ? error.message : String(error)}.`, run));
  }
  try {
    const structuralErrors = inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR");
    if (structuralErrors.length) failures.push(failure(profileId, engine, seed, "INVALID_CIV5MAP_STRUCTURE", `${structuralErrors.length} structural error(s): ${structuralErrors.slice(0, 5).map((issue) => issue.code).join(", ")}.`, run));
  } catch (error) {
    failures.push(failure(profileId, engine, seed, "INVALID_CIV5MAP_STRUCTURE", `Structural serialization/inspection threw: ${error instanceof Error ? error.message : String(error)}.`, run));
  }
  return failures;
}

function applyDeliberateFailure(map: Civ5Map, run: 1 | 2) {
  if (INJECT_FAILURE === "NONDETERMINISM" && run === 2) map.name = `${map.name} [deliberate nondeterminism]`;
  if (INJECT_FAILURE === "STALE_EVIDENCE" && map.structure?.narrativeEvaluation) {
    map.structure.narrativeEvaluation = {
      ...map.structure.narrativeEvaluation,
      score: map.structure.narrativeEvaluation.score + 0.01,
    };
  }
}

const records: Array<{
  id: MapPresetId;
  label: string;
  engine: GenerationEngine;
  status: "PASS" | "FAIL";
  failureCount: number;
  runs: SeedRecord[];
  final?: FinalMetrics;
  intervention?: InterventionMetrics;
}> = [];
const failures: AuditFailure[] = [];
const started = performance.now();

for (const preset of selectedPresets) {
  const finals: FinalMetrics[] = [];
  const interventions: InterventionMetrics[] = [];
  const runs: SeedRecord[] = [];
  for (const seed of AUDIT_SEEDS) {
    const options = optionsForPreset(preset.id, seed);
    const recipe = { ...generationRecipeFromOptions(options), effort: "STANDARD" as const };
    let first: Civ5Map | undefined;
    let second: Civ5Map | undefined;
    for (const run of [1, 2] as const) {
      try {
        const map = generateMapFromRecipe(recipe);
        applyDeliberateFailure(map, run);
        if (run === 1) first = map;
        else second = map;
        failures.push(...auditOwnerMap(preset.id, preset.engine, seed, run, options, map));
      } catch (error) {
        failures.push(failure(preset.id, preset.engine, seed, "GENERATION_FAILED", error instanceof Error ? error.message : String(error), run));
      }
    }
    if (first) {
      finals.push(finalMetrics(first));
      const intervention = interventionMetrics(first);
      if (intervention) interventions.push(intervention);
    }
    let mapDigest: string | undefined;
    let serializedDigest: string | undefined;
    if (first && second) {
      const firstDigest = normalizedDigest(first);
      const secondDigest = normalizedDigest(second);
      mapDigest = firstDigest;
      try {
        const firstBinary = binaryDigest(serializeCiv5Map(first));
        const secondBinary = binaryDigest(serializeCiv5Map(second));
        serializedDigest = firstBinary;
        if (firstDigest !== secondDigest || firstBinary !== secondBinary) failures.push(failure(preset.id, preset.engine, seed, "NONDETERMINISTIC_OUTPUT", `Repeated normalized map digests ${firstDigest}/${secondDigest}; Civ5Map binary digests ${firstBinary}/${secondBinary}.`));
      } catch (error) {
        failures.push(failure(preset.id, preset.engine, seed, "INVALID_CIV5MAP_STRUCTURE", `Determinism serialization threw: ${error instanceof Error ? error.message : String(error)}.`));
      }
    }
    const seedFailures = failures.filter((item) => item.profileId === preset.id && item.seed === seed);
    runs.push({
      seed,
      status: seedFailures.length ? "FAIL" : "PASS",
      ...(mapDigest ? { normalizedMapDigest: mapDigest } : {}),
      ...(serializedDigest ? { binaryDigest: serializedDigest } : {}),
      failureCodes: [...new Set(seedFailures.map((item) => item.code))].sort(),
    });
  }
  const profileFailures = failures.filter((item) => item.profileId === preset.id);
  records.push({
    id: preset.id,
    label: preset.label,
    engine: preset.engine,
    status: profileFailures.length ? "FAIL" : "PASS",
    failureCount: profileFailures.length,
    runs,
    ...(finals.length ? { final: rounded(average(finals)) } : {}),
    ...(interventions.length ? { intervention: rounded(average(interventions)) } : {}),
  });
}

const engineSummary = (["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"] as const).map((engine) => {
  const members = records.filter((record) => record.engine === engine);
  const finals = members.flatMap((member) => member.final ? [member.final] : []);
  const interventions = members.flatMap((member) => member.intervention ? [member.intervention] : []);
  return {
    engine,
    mapTypes: members.length,
    passed: members.filter((member) => member.status === "PASS").length,
    failed: members.filter((member) => member.status === "FAIL").length,
    ...(finals.length ? { final: rounded(average(finals)) } : {}),
    ...(interventions.length ? { intervention: rounded(average(interventions)) } : {}),
  };
});

const nearestWithinEngine = records.flatMap((record) => {
  if (!record.final) return [];
  const candidates = records.filter((candidate) => candidate.engine === record.engine && candidate.id !== record.id && candidate.final);
  const dimensions: Array<keyof FinalMetrics> = ["landComponents", "waterComponents", "dominantLandShare", "smallIslandShare", "coastlinePerLandTile", "mountainShareOfLand", "horizontalMirrorMismatch", "verticalMirrorMismatch", "riverTiles"];
  const distance = (candidate: typeof record) => Math.sqrt(dimensions.reduce((sum, key) => {
    const normalizer = key === "riverTiles" ? 40 : key === "landComponents" || key === "waterComponents" ? 12 : 1;
    return sum + ((record.final![key] - candidate.final![key]) / normalizer) ** 2;
  }, 0));
  const nearest = candidates.map((candidate) => ({ candidate, distance: distance(candidate) })).sort((one, two) => one.distance - two.distance)[0];
  return [{ id: record.id, label: record.label, engine: record.engine, nearestId: nearest?.candidate.id, nearestLabel: nearest?.candidate.label, distance: Number((nearest?.distance ?? 0).toFixed(4)) }];
});

failures.sort((one, two) => one.profileId.localeCompare(two.profileId) || one.seed.localeCompare(two.seed) || one.code.localeCompare(two.code) || (one.run ?? 0) - (two.run ?? 0) || one.detail.localeCompare(two.detail));
const normalizedReport = {
  schemaVersion: 2,
  status: failures.length ? "FAIL" as const : "PASS" as const,
  experiment: {
    mapSize: SIZE,
    dimensions: resolveMapDimensions(SIZE, "STANDARD"),
    seeds: AUDIT_SEEDS,
    repeatsPerSeed: 2,
    effort: "STANDARD",
    characterPolicy: "Eccentric=Fantastical; Physical=Realistic; Excogitare/Polis=Mundane",
    rawBoundary: "All four engines must retain equivalent raw-native, narrative-realized, legal-normalized and final observations.",
    scopeLimitations: ["This automated audit does not claim perceptual blind recognition.", "This automated audit does not claim Civilization V runtime compatibility."],
    ...(INJECT_FAILURE ? { deliberateFailureInjection: INJECT_FAILURE } : {}),
  },
  summary: {
    selectedProfiles: records.length,
    passedProfiles: records.filter((record) => record.status === "PASS").length,
    failedProfiles: records.filter((record) => record.status === "FAIL").length,
    failureRecords: failures.length,
  },
  engineSummary,
  records,
  nearestWithinEngine,
  failures,
};
const report = { ...normalizedReport, normalizedDigest: normalizedDigest(normalizedReport), elapsedMilliseconds: Math.round(performance.now() - started) };

if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.status} ${report.normalizedDigest} — ${report.summary.passedProfiles}/${report.summary.selectedProfiles} profiles passed; ${report.summary.failureRecords} failure record(s).`);
  for (const item of report.failures) console.log(`${item.profileId} ${item.seed}${item.run ? ` run-${item.run}` : ""} ${item.code}: ${item.detail}`);
}
if (failures.length) process.exitCode = 1;
