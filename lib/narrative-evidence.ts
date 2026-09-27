import type { Civ5Map } from "./civ5-map.ts";
import { narrativeConstraintProgramHash, type NarrativeConstraintProgram } from "./narrative-constraints.ts";
import {
  narrativeEvaluationInputHash,
  type NarrativeProgramEvaluation,
  type NarrativeSemanticModel,
} from "./narrative-semantics.ts";

export const NARRATIVE_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const NARRATIVE_EXTRACTOR_VERSION = 1 as const;

export type NarrativeEvidenceState = "CURRENT" | "STALE" | "RECOMPUTED";

export type PersistedNarrativeEvidence = {
  schemaVersion: 1;
  extractorVersion: 1;
  state: NarrativeEvidenceState;
  sourceMapHash: string;
  staleReason?: string;
  program: NarrativeConstraintProgram;
  model: NarrativeSemanticModel;
  evaluation: NarrativeProgramEvaluation;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([one], [two]) => one.localeCompare(two)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} contains unsupported field ${unknown[0]}.`);
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function unitInterval(value: unknown, label: string) {
  finite(value, label);
  if ((value as number) < 0 || (value as number) > 1) throw new Error(`${label} must be between zero and one.`);
}

function hash(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}$/.test(value)) throw new Error(`${label} must be an eight-character deterministic hash.`);
}

function semanticSource(map: Civ5Map) {
  return {
    width: map.width,
    height: map.height,
    wraps: map.wraps,
    tiles: map.tiles.map((tile) => [tile.terrain, tile.elevation, tile.feature, tile.river, tile.resource, tile.wonder]),
    starts: map.startLocations.map((start) => [start.x, start.y, start.player, start.team, start.cityState]),
    strategicGraph: map.structure?.strategicGraph,
  };
}

export function narrativeSourceMapHash(map: Civ5Map) {
  return hashText(JSON.stringify(stableValue(semanticSource(map))));
}

export function cloneNarrativeEvidence(evidence: PersistedNarrativeEvidence | undefined) {
  return evidence ? structuredClone(evidence) : undefined;
}

export function narrativeEvidenceMatchesMap(evidence: PersistedNarrativeEvidence | undefined, map: Civ5Map) {
  return Boolean(evidence && evidence.state !== "STALE" && evidence.sourceMapHash === narrativeSourceMapHash(map));
}

export function markNarrativeEvidenceStale(evidence: PersistedNarrativeEvidence | undefined, reason: string) {
  if (!evidence) return undefined;
  const normalizedReason = reason.trim() || "The authored map changed after narrative evaluation.";
  return {
    ...cloneNarrativeEvidence(evidence)!,
    state: "STALE" as const,
    staleReason: normalizedReason,
  };
}

export function createNarrativeEvidence(
  map: Civ5Map,
  program: NarrativeConstraintProgram,
  model: NarrativeSemanticModel,
  evaluation: NarrativeProgramEvaluation,
  state: Extract<NarrativeEvidenceState, "CURRENT" | "RECOMPUTED"> = "CURRENT",
) {
  const evidence: PersistedNarrativeEvidence = {
    schemaVersion: NARRATIVE_EVIDENCE_SCHEMA_VERSION,
    extractorVersion: NARRATIVE_EXTRACTOR_VERSION,
    state,
    sourceMapHash: narrativeSourceMapHash(map),
    program: structuredClone(program),
    model: structuredClone(model),
    evaluation: structuredClone(evaluation),
  };
  validateNarrativeEvidence(evidence, map);
  return evidence;
}

function validateProgram(value: unknown) {
  record(value, "Narrative constraint program");
  hash(value.inputHash, "Narrative constraint program inputHash");
  if (value.schemaVersion !== 1) throw new Error(`Unsupported narrative constraint program schema version: ${String(value.schemaVersion)}.`);
  if (typeof value.profileId !== "string" || typeof value.engine !== "string" || typeof value.verb !== "string") throw new Error("Narrative constraint program identity is malformed.");
  record(value.context, "Narrative constraint program context");
  for (const key of ["width", "height", "area", "majorPlayers", "cityStates"]) finite(value.context[key], `Narrative constraint program context.${key}`);
  if (!Array.isArray(value.context.enabledVictories) || !Array.isArray(value.context.emphasizedVictories)) throw new Error("Narrative constraint program victory context is malformed.");
  record(value.constraints, "Narrative constraint program constraints");
  const constraintGroups = value.constraints;
  const groups = ["essential", "preferred", "prohibited"].flatMap((key) => {
    const constraints = constraintGroups[key];
    if (!Array.isArray(constraints)) throw new Error(`Narrative constraint program ${key} constraints are malformed.`);
    return constraints;
  });
  if (!groups.length || !Array.isArray(value.requiredEvidence) || !Array.isArray(value.relaxationOrder)) throw new Error("Narrative constraint program lacks constraints, evidence or relaxation order.");
  const constraintIds = new Set<string>();
  for (const constraint of groups) {
    record(constraint, "Narrative constraint");
    if (typeof constraint.id !== "string" || constraintIds.has(constraint.id)) throw new Error("Narrative constraint identifiers are missing or duplicated.");
    constraintIds.add(constraint.id);
    finite(constraint.weight, `Narrative constraint ${constraint.id} weight`);
    unitInterval(constraint.tolerance, `Narrative constraint ${constraint.id} tolerance`);
  }
  const relaxationIds = new Set<string>();
  for (const relaxation of value.relaxationOrder) {
    record(relaxation, "Narrative relaxation");
    if (typeof relaxation.id !== "string" || relaxationIds.has(relaxation.id) || !Array.isArray(relaxation.constraintIds) || relaxation.constraintIds.some((id) => typeof id !== "string" || !constraintIds.has(id))) throw new Error("Narrative relaxation references are malformed.");
    relaxationIds.add(relaxation.id);
  }
  for (const evidence of value.requiredEvidence) {
    record(evidence, "Narrative evidence definition");
    if (typeof evidence.id !== "string" || typeof evidence.constraintId !== "string" || !constraintIds.has(evidence.constraintId) || typeof evidence.measureKey !== "string") throw new Error("Narrative evidence definition references are malformed.");
    unitInterval(evidence.minimumConfidence, `Narrative evidence ${evidence.id} minimumConfidence`);
  }
  if (narrativeConstraintProgramHash(value as unknown as NarrativeConstraintProgram) !== value.inputHash) throw new Error("Narrative constraint program hash does not match its payload.");
  return { constraintIds, relaxationIds, program: value as unknown as NarrativeConstraintProgram };
}

function validateModel(value: unknown) {
  record(value, "Narrative semantic model");
  hash(value.inputHash, "Narrative semantic model inputHash");
  if (value.schemaVersion !== 1) throw new Error(`Unsupported narrative semantic model schema version: ${String(value.schemaVersion)}.`);
  if (value.stage !== "LEGAL_NORMALIZED" || !Number.isInteger(value.width) || (value.width as number) < 1 || !Number.isInteger(value.height) || (value.height as number) < 1 || typeof value.wraps !== "boolean") throw new Error("Narrative semantic model dimensions or stage are malformed.");
  if (!Array.isArray(value.objects) || !Array.isArray(value.limitations)) throw new Error("Narrative semantic model objects or limitations are malformed.");
  record(value.metrics, "Narrative semantic metrics");
  const tileCount = (value.width as number) * (value.height as number);
  const objectIds = new Set<string>();
  for (const object of value.objects) {
    record(object, "Narrative semantic object");
    if (typeof object.id !== "string" || objectIds.has(object.id) || typeof object.kind !== "string" || !Array.isArray(object.tileIndices) || object.tileIndices.some((index) => !Number.isInteger(index) || (index as number) < 0 || (index as number) >= tileCount)) throw new Error("Narrative semantic object identity or tile references are malformed.");
    objectIds.add(object.id);
    if (!Array.isArray(object.relatedObjectIds)) throw new Error(`Narrative semantic object ${object.id} relationships are malformed.`);
    unitInterval(object.confidence, `Narrative semantic object ${object.id} confidence`);
    record(object.metrics, `Narrative semantic object ${object.id} metrics`);
  }
  for (const object of value.objects) if ((object as Record<string, unknown>).relatedObjectIds && ((object as Record<string, unknown>).relatedObjectIds as unknown[]).some((id) => typeof id !== "string" || !objectIds.has(id))) throw new Error("Narrative semantic object references an unknown related object.");
  for (const [key, metric] of Object.entries(value.metrics)) {
    record(metric, `Narrative semantic metric ${key}`);
    if (metric.key !== key || !Array.isArray(metric.objectIds) || metric.objectIds.some((id) => typeof id !== "string" || !objectIds.has(id))) throw new Error(`Narrative semantic metric ${key} references unknown evidence.`);
    finite(metric.value, `Narrative semantic metric ${key} value`);
    unitInterval(metric.confidence, `Narrative semantic metric ${key} confidence`);
  }
  return { objectIds, model: value as unknown as NarrativeSemanticModel };
}

function validateEvaluation(
  value: unknown,
  program: NarrativeConstraintProgram,
  constraintIds: Set<string>,
  relaxationIds: Set<string>,
  model: NarrativeSemanticModel,
  objectIds: Set<string>,
) {
  record(value, "Narrative program evaluation");
  if (value.schemaVersion !== 1) throw new Error(`Unsupported narrative evaluation schema version: ${String(value.schemaVersion)}.`);
  hash(value.inputHash, "Narrative evaluation inputHash");
  if (value.programHash !== program.inputHash || value.modelHash !== model.inputHash || value.profileId !== program.profileId) throw new Error("Narrative evaluation does not match its program and semantic model.");
  if (!["SATISFIED", "WEAKENED", "FAILED", "UNEVALUABLE"].includes(String(value.status)) || typeof value.essentialFloorMet !== "boolean") throw new Error("Narrative evaluation status is malformed.");
  finite(value.score, "Narrative evaluation score");
  if (!Array.isArray(value.findings) || !Array.isArray(value.appliedRelaxations) || !Array.isArray(value.limitations)) throw new Error("Narrative evaluation findings or limitations are malformed.");
  if (value.appliedRelaxations.some((id) => typeof id !== "string" || !relaxationIds.has(id))) throw new Error("Narrative evaluation references an unknown relaxation.");
  const findingIds = new Set<string>();
  for (const finding of value.findings) {
    record(finding, "Narrative evaluation finding");
    if (typeof finding.constraintId !== "string" || !constraintIds.has(finding.constraintId) || findingIds.has(finding.constraintId) || !Array.isArray(finding.objectIds) || finding.objectIds.some((id) => typeof id !== "string" || !objectIds.has(id))) throw new Error("Narrative evaluation finding references unknown or duplicate evidence.");
    findingIds.add(finding.constraintId);
    finite(finding.score, `Narrative finding ${finding.constraintId} score`);
    unitInterval(finding.confidence, `Narrative finding ${finding.constraintId} confidence`);
  }
  if (findingIds.size !== constraintIds.size) throw new Error("Narrative evaluation does not contain exactly one finding per constraint.");
  const expectedHash = narrativeEvaluationInputHash(program.inputHash, model.inputHash, value.appliedRelaxations as string[]);
  if (value.inputHash !== expectedHash) throw new Error("Narrative evaluation hash does not match its payload.");
}

export function validateNarrativeEvidence(value: unknown, map?: Civ5Map): asserts value is PersistedNarrativeEvidence {
  record(value, "Persisted narrative evidence");
  exactKeys(value, ["schemaVersion", "extractorVersion", "state", "sourceMapHash", "staleReason", "program", "model", "evaluation"], "Persisted narrative evidence");
  if (value.schemaVersion !== NARRATIVE_EVIDENCE_SCHEMA_VERSION) throw new Error(`Unsupported persisted narrative evidence schema version: ${String(value.schemaVersion)}.`);
  if (value.extractorVersion !== NARRATIVE_EXTRACTOR_VERSION) throw new Error(`Unsupported narrative extractor version: ${String(value.extractorVersion)}.`);
  if (!["CURRENT", "STALE", "RECOMPUTED"].includes(String(value.state))) throw new Error("Persisted narrative evidence state is malformed.");
  hash(value.sourceMapHash, "Persisted narrative evidence sourceMapHash");
  if (value.state === "STALE") {
    if (typeof value.staleReason !== "string" || !value.staleReason.trim()) throw new Error("Stale narrative evidence requires an explanation.");
  } else if (value.staleReason !== undefined) throw new Error("Current or recomputed narrative evidence cannot carry a stale explanation.");
  const { constraintIds, relaxationIds, program } = validateProgram(value.program);
  const { objectIds, model } = validateModel(value.model);
  validateEvaluation(value.evaluation, program, constraintIds, relaxationIds, model, objectIds);
  if (program.context.width !== model.width || program.context.height !== model.height || program.context.wraps !== model.wraps || program.context.area !== model.width * model.height) throw new Error("Narrative program context does not match its semantic model.");
  if (map && value.state !== "STALE" && value.sourceMapHash !== narrativeSourceMapHash(map)) throw new Error("Current narrative evidence does not match its authored map.");
}
