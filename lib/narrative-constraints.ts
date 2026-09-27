import type { GenerationRecipe, WorldScale } from "./generation-recipe.ts";
import { validateNarrativeNativeContract, type NarrativeGenerativeContract } from "./narrative-native-contracts.ts";
import type { NarrativeProfile } from "./narrative-types.ts";

export const NARRATIVE_CONSTRAINT_PROGRAM_SCHEMA_VERSION = 1 as const;

export const NARRATIVE_AUTHORITY_ORDER = [
  "CIV5_LEGALITY",
  "USER_PROTECTION",
  "EXPLICIT_CONTROLS",
  "ACCESSIBILITY_HYDROLOGY_CAPACITY",
  "ESSENTIAL_NARRATIVE",
  "WORLD_CHARACTER",
  "WORLD_MODIFIER",
  "NARRATIVE_PREFERENCES",
] as const;

export type NarrativeAuthority = (typeof NARRATIVE_AUTHORITY_ORDER)[number];
export type NarrativeConstraintScope = "MAP" | "ENTITY" | "RELATIONSHIP" | "GAMEPLAY";
export type NarrativeConstraintStrength = "ESSENTIAL" | "PREFERRED" | "PROHIBITED";
export type NarrativeScaleLaw = "FIXED" | "AREA" | "LINEAR" | "PLAYER_COUNT" | "REALM_COUNT";
export type NarrativeMeasureKey =
  | "land-share"
  | "largest-land-share"
  | "land-component-count"
  | "water-body-count"
  | "edge-ocean-share"
  | "enclosed-sea-count"
  | "lake-count"
  | "navigation-basin-count"
  | "strait-count"
  | "canal-isthmus-count"
  | "peninsula-count"
  | "strategic-corridor-count"
  | "mountain-range-count"
  | "broken-range-count"
  | "mountain-pass-count"
  | "watershed-count"
  | "valid-watershed-share"
  | "endorheic-watershed-count"
  | "tributary-junction-count"
  | "climate-region-count"
  | "climate-transition-count"
  | "rain-shadow-count"
  | "refuge-count"
  | "hostile-frontier-share"
  | "start-realm-count"
  | "isolated-major-share"
  | "city-state-region-count"
  | "route-redundancy"
  | "minimum-start-distance"
  | "resource-concentration"
  | "value-gradient"
  | "barren-march-share"
  | "contested-objective-count"
  | "realm-separation"
  | "crossing-density"
  | "oceanic-negative-space"
  | "coastal-hopping";
export type NarrativeEvidenceOperator = "AT_LEAST" | "AT_MOST" | "BETWEEN" | "EQUALS";

export type NarrativeConstraintDefinition = {
  id: string;
  label: string;
  semanticKey: string;
  scope: NarrativeConstraintScope;
  roles: string[];
  weight: number;
  tolerance: number;
  scaleLaw: NarrativeScaleLaw;
  relaxable: boolean;
};

export type NarrativeRelaxationDefinition = {
  id: string;
  label: string;
  constraintIds: string[];
  consequence: string;
};

export type NarrativeEvidenceDefinition = {
  id: string;
  constraintId: string;
  measureKey: NarrativeMeasureKey;
  operator: NarrativeEvidenceOperator;
  target: number | readonly [number, number];
  minimumConfidence: number;
};

export type NarrativeProgramDefinition = {
  schemaVersion: 1;
  profileId: NarrativeProfile["id"];
  engine: NarrativeProfile["engine"];
  essential: NarrativeConstraintDefinition[];
  preferred: NarrativeConstraintDefinition[];
  prohibited: NarrativeConstraintDefinition[];
  relaxationOrder: NarrativeRelaxationDefinition[];
  requiredEvidence: NarrativeEvidenceDefinition[];
  /** Native construction law. Optional only for legacy/project migration and focused unit fixtures. */
  generative?: NarrativeGenerativeContract;
};

export type NarrativeConstraint = Readonly<NarrativeConstraintDefinition & {
  strength: NarrativeConstraintStrength;
}>;

export type NarrativeControlConflict = Readonly<{
  id: string;
  control: "WATER_PERCENT" | "MOUNTAIN_PERCENT";
  requested: number;
  accepted: readonly [number, number];
  effect: "WEAKENS_IDENTITY";
}>;

export type NarrativeConstraintProgram = Readonly<{
  schemaVersion: 1;
  inputHash: string;
  profileId: NarrativeProfile["id"];
  engine: NarrativeProfile["engine"];
  verb: string;
  scale: WorldScale;
  identity: Readonly<{
    label: string;
    premise: string;
    blindRecognition: string;
    nearestConfusions: readonly NarrativeProfile["id"][];
  }>;
  context: Readonly<{
    width: number;
    height: number;
    area: number;
    wraps: boolean;
    majorPlayers: number;
    cityStates: number;
    enabledVictories: readonly string[];
    emphasizedVictories: readonly string[];
  }>;
  explicitInputs: Readonly<{
    waterPercent: number;
    mountainPercent: number;
    riverDensity: string;
    character: string;
    modifier: string;
    archetype: string;
    archetypeIntensity: string;
  }>;
  parameterEnvelope: Readonly<{
    water: readonly [number, number];
    mountains: readonly [number, number];
    preferredWater: number;
    preferredMountains: number;
    preferredRiverDensity?: string;
  }>;
  authority: readonly Readonly<{ rank: number; authority: NarrativeAuthority }>[];
  constraints: Readonly<{
    essential: readonly NarrativeConstraint[];
    preferred: readonly NarrativeConstraint[];
    prohibited: readonly NarrativeConstraint[];
  }>;
  relaxationOrder: readonly Readonly<NarrativeRelaxationDefinition & { order: number }>[];
  requiredEvidence: readonly Readonly<NarrativeEvidenceDefinition>[];
  generative?: NarrativeGenerativeContract;
  conflicts: readonly NarrativeControlConflict[];
}>;

const DEFINITION_KEYS = ["schemaVersion", "profileId", "engine", "essential", "preferred", "prohibited", "relaxationOrder", "requiredEvidence", "generative"] as const;
const CONSTRAINT_KEYS = ["id", "label", "semanticKey", "scope", "roles", "weight", "tolerance", "scaleLaw", "relaxable"] as const;
const RELAXATION_KEYS = ["id", "label", "constraintIds", "consequence"] as const;
const EVIDENCE_KEYS = ["id", "constraintId", "measureKey", "operator", "target", "minimumConfidence"] as const;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCOPES = new Set<NarrativeConstraintScope>(["MAP", "ENTITY", "RELATIONSHIP", "GAMEPLAY"]);
const SCALE_LAWS = new Set<NarrativeScaleLaw>(["FIXED", "AREA", "LINEAR", "PLAYER_COUNT", "REALM_COUNT"]);
const EVIDENCE_OPERATORS = new Set<NarrativeEvidenceOperator>(["AT_LEAST", "AT_MOST", "BETWEEN", "EQUALS"]);
const MEASURE_KEYS = new Set<NarrativeMeasureKey>([
  "land-share", "largest-land-share", "land-component-count", "water-body-count", "edge-ocean-share", "enclosed-sea-count", "lake-count", "navigation-basin-count",
  "strait-count", "canal-isthmus-count", "peninsula-count", "strategic-corridor-count", "mountain-range-count", "broken-range-count", "mountain-pass-count",
  "watershed-count", "valid-watershed-share", "endorheic-watershed-count", "tributary-junction-count", "climate-region-count", "climate-transition-count",
  "rain-shadow-count", "refuge-count", "hostile-frontier-share", "start-realm-count", "isolated-major-share", "city-state-region-count", "route-redundancy",
  "minimum-start-distance", "resource-concentration", "value-gradient", "barren-march-share", "contested-objective-count", "realm-separation",
  "crossing-density", "oceanic-negative-space", "coastal-hopping",
]);

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} contains unsupported fields: ${extras.join(", ")}.`);
}

function assertId(value: unknown, label: string) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} must use a stable lower-kebab-case identifier.`);
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
}

function assertUnitInterval(value: unknown, label: string, zeroAllowed = true) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (zeroAllowed ? 0 : Number.EPSILON) || value > 1) throw new Error(`${label} must be between ${zeroAllowed ? "0" : "greater than 0"} and 1.`);
}

function validateConstraint(value: unknown, label: string): asserts value is NarrativeConstraintDefinition {
  assertRecord(value, label);
  assertAllowedKeys(value, CONSTRAINT_KEYS, label);
  assertId(value.id, `${label}.id`);
  assertString(value.label, `${label}.label`);
  assertId(value.semanticKey, `${label}.semanticKey`);
  if (!SCOPES.has(value.scope as NarrativeConstraintScope)) throw new Error(`${label}.scope is unsupported.`);
  if (!Array.isArray(value.roles) || !value.roles.length || value.roles.some((role) => typeof role !== "string" || !ID_PATTERN.test(role))) throw new Error(`${label}.roles must contain at least one stable lower-kebab-case identifier.`);
  assertUnitInterval(value.weight, `${label}.weight`, false);
  assertUnitInterval(value.tolerance, `${label}.tolerance`);
  if (!SCALE_LAWS.has(value.scaleLaw as NarrativeScaleLaw)) throw new Error(`${label}.scaleLaw is unsupported.`);
  if (typeof value.relaxable !== "boolean") throw new Error(`${label}.relaxable must be boolean.`);
}

function validateRelaxation(value: unknown, label: string): asserts value is NarrativeRelaxationDefinition {
  assertRecord(value, label);
  assertAllowedKeys(value, RELAXATION_KEYS, label);
  assertId(value.id, `${label}.id`);
  assertString(value.label, `${label}.label`);
  assertString(value.consequence, `${label}.consequence`);
  if (!Array.isArray(value.constraintIds) || !value.constraintIds.length) throw new Error(`${label}.constraintIds must not be empty.`);
  for (const [index, id] of value.constraintIds.entries()) assertId(id, `${label}.constraintIds[${index}]`);
}

function validateEvidence(value: unknown, label: string): asserts value is NarrativeEvidenceDefinition {
  assertRecord(value, label);
  assertAllowedKeys(value, EVIDENCE_KEYS, label);
  assertId(value.id, `${label}.id`);
  assertId(value.constraintId, `${label}.constraintId`);
  if (!MEASURE_KEYS.has(value.measureKey as NarrativeMeasureKey)) throw new Error(`${label}.measureKey is unsupported.`);
  if (!EVIDENCE_OPERATORS.has(value.operator as NarrativeEvidenceOperator)) throw new Error(`${label}.operator is unsupported.`);
  if (value.operator === "BETWEEN") {
    if (!Array.isArray(value.target) || value.target.length !== 2 || value.target.some((target) => typeof target !== "number" || !Number.isFinite(target)) || value.target[0] > value.target[1]) throw new Error(`${label}.target must be an ordered numeric range.`);
  } else if (typeof value.target !== "number" || !Number.isFinite(value.target)) throw new Error(`${label}.target must be numeric.`);
  assertUnitInterval(value.minimumConfidence, `${label}.minimumConfidence`);
}

function uniqueIds(values: ReadonlyArray<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`${label} contains duplicate identifier ${value.id}.`);
    ids.add(value.id);
  }
  return ids;
}

export function validateNarrativeProgramDefinition(
  definition: NarrativeProgramDefinition,
  profile: NarrativeProfile,
) {
  assertRecord(definition, "Narrative program definition");
  assertAllowedKeys(definition, DEFINITION_KEYS, "Narrative program definition");
  if (definition.schemaVersion !== NARRATIVE_CONSTRAINT_PROGRAM_SCHEMA_VERSION) throw new Error(`Unsupported narrative program definition schema version: ${String(definition.schemaVersion)}.`);
  if (definition.profileId !== profile.id) throw new Error(`Narrative program definition ${definition.profileId} does not match profile ${profile.id}.`);
  if (definition.engine !== profile.engine) throw new Error(`Narrative program definition engine ${definition.engine} does not match ${profile.id}'s ${profile.engine} engine.`);
  if (definition.generative) validateNarrativeNativeContract(definition.generative, profile.id, profile.engine);
  for (const key of ["essential", "preferred", "prohibited"] as const) {
    if (!Array.isArray(definition[key])) throw new Error(`Narrative program definition ${key} must be an array.`);
    definition[key].forEach((constraint, index) => validateConstraint(constraint, `${key}[${index}]`));
  }
  if (!definition.essential.length) throw new Error("Narrative program definition must contain at least one essential constraint.");
  if (!Array.isArray(definition.relaxationOrder)) throw new Error("Narrative program definition relaxationOrder must be an array.");
  definition.relaxationOrder.forEach((relaxation, index) => validateRelaxation(relaxation, `relaxationOrder[${index}]`));
  if (!Array.isArray(definition.requiredEvidence)) throw new Error("Narrative program definition requiredEvidence must be an array.");
  definition.requiredEvidence.forEach((evidence, index) => validateEvidence(evidence, `requiredEvidence[${index}]`));

  const constraints = [...definition.essential, ...definition.preferred, ...definition.prohibited];
  const constraintIds = uniqueIds(constraints, "Narrative constraints");
  uniqueIds(definition.relaxationOrder, "Narrative relaxation order");
  uniqueIds(definition.requiredEvidence, "Narrative evidence requirements");
  const relaxed = new Set<string>();
  for (const relaxation of definition.relaxationOrder) {
    for (const constraintId of relaxation.constraintIds) {
      const constraint = constraints.find((candidate) => candidate.id === constraintId);
      if (!constraint) throw new Error(`Narrative relaxation ${relaxation.id} references unknown constraint ${constraintId}.`);
      if (!constraint.relaxable) throw new Error(`Narrative relaxation ${relaxation.id} references non-relaxable constraint ${constraintId}.`);
      if (relaxed.has(constraintId)) throw new Error(`Narrative constraint ${constraintId} appears in more than one relaxation step.`);
      relaxed.add(constraintId);
    }
  }
  for (const evidence of definition.requiredEvidence) {
    if (!constraintIds.has(evidence.constraintId)) throw new Error(`Narrative evidence ${evidence.id} references unknown constraint ${evidence.constraintId}.`);
  }
  for (const constraint of definition.essential) {
    if (!definition.requiredEvidence.some((evidence) => evidence.constraintId === constraint.id)) throw new Error(`Essential narrative constraint ${constraint.id} lacks a required evidence definition.`);
  }
  if (definition.generative) {
    const nativePolicy = definition.generative.relaxationPolicy;
    if (definition.relaxationOrder.length !== nativePolicy.length) throw new Error(`${profile.id}'s programme relaxation order must mirror its authored native relaxation policy.`);
    for (const [index, relaxation] of definition.relaxationOrder.entries()) {
      const native = nativePolicy[index];
      if (!native || relaxation.id !== native.id || relaxation.label !== native.label || relaxation.consequence !== native.consequence || relaxation.constraintIds.length !== native.constraintIds.length || relaxation.constraintIds.some((id, constraintIndex) => id !== native.constraintIds[constraintIndex])) {
        throw new Error(`${profile.id}'s programme relaxation ${relaxation.id} does not match native policy step ${native?.id ?? index + 1}.`);
      }
    }
    const identityFloor = [...definition.essential, ...definition.prohibited].filter((constraint) => constraint.relaxable);
    for (const constraint of identityFloor) {
      if (!relaxed.has(constraint.id)) throw new Error(`${profile.id}'s relaxable identity constraint ${constraint.id} lacks an authored native relaxation operation.`);
    }
    for (const constraint of constraints) {
      if (!definition.requiredEvidence.some((evidence) => evidence.constraintId === constraint.id)) throw new Error(`${profile.id}'s native narrative constraint ${constraint.id} lacks required evidence.`);
    }
    if (definition.preferred.some((constraint) => constraint.relaxable)) throw new Error(`${profile.id}'s authored preferences must remain non-relaxable bonuses rather than a hidden identity floor.`);
    const evidenceSignature = (constraintId: string) => JSON.stringify(definition.requiredEvidence
      .filter((evidence) => evidence.constraintId === constraintId)
      .map(({ measureKey, operator, target, minimumConfidence }) => ({ measureKey, operator, target, minimumConfidence }))
      .sort((one, two) => JSON.stringify(one).localeCompare(JSON.stringify(two))));
    const essentialSignatures = new Set(definition.essential.map((constraint) => evidenceSignature(constraint.id)));
    for (const preference of definition.preferred) {
      if (essentialSignatures.has(evidenceSignature(preference.id))) throw new Error(`${profile.id}'s preference ${preference.id} mechanically duplicates an essential evidence target.`);
    }
  }
}

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

export function narrativeConstraintProgramHash(program: NarrativeConstraintProgram) {
  const programWithoutHash: Record<string, unknown> = { ...program };
  delete programWithoutHash.inputHash;
  return hashText(JSON.stringify(stableValue(programWithoutHash)));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function cloneConstraint(constraint: NarrativeConstraintDefinition, strength: NarrativeConstraintStrength): NarrativeConstraint {
  return {
    ...constraint,
    strength,
    roles: [...constraint.roles].sort(),
  };
}

function normalizedPlayers(recipe: GenerationRecipe) {
  const intent = recipe.matchIntent;
  return Math.max(2, Math.min(22, Math.round(intent.humanPlayers) + Math.round(intent.aiPlayers) + Math.round(intent.flexiblePlayers)));
}

function controlConflicts(profile: NarrativeProfile, recipe: GenerationRecipe): NarrativeControlConflict[] {
  const conflicts: NarrativeControlConflict[] = [];
  const water = profile.parameterEnvelope.water;
  const mountains = profile.parameterEnvelope.mountains;
  if (recipe.settings.waterPercent < water[0] || recipe.settings.waterPercent > water[1]) conflicts.push({
    id: "control-water-percent",
    control: "WATER_PERCENT",
    requested: recipe.settings.waterPercent,
    accepted: [...water],
    effect: "WEAKENS_IDENTITY",
  });
  if (recipe.settings.mountainPercent < mountains[0] || recipe.settings.mountainPercent > mountains[1]) conflicts.push({
    id: "control-mountain-percent",
    control: "MOUNTAIN_PERCENT",
    requested: recipe.settings.mountainPercent,
    accepted: [...mountains],
    effect: "WEAKENS_IDENTITY",
  });
  return conflicts;
}

export function compileNarrativeConstraintProgram(
  definition: NarrativeProgramDefinition,
  profile: NarrativeProfile,
  recipe: GenerationRecipe,
  context: { width: number; height: number; wraps: boolean },
): NarrativeConstraintProgram {
  validateNarrativeProgramDefinition(definition, profile);
  if (recipe.mapType !== profile.id) throw new Error(`Generation recipe ${recipe.mapType} cannot compile narrative profile ${profile.id}.`);
  if (recipe.engine !== profile.engine) throw new Error(`Generation recipe engine ${recipe.engine} cannot compile ${profile.id}'s ${profile.engine} narrative program.`);
  if (!Number.isInteger(context.width) || context.width < 1 || !Number.isInteger(context.height) || context.height < 1 || typeof context.wraps !== "boolean") throw new Error("Narrative program context requires positive integer dimensions and explicit wrap behavior.");

  const programWithoutHash = {
    schemaVersion: NARRATIVE_CONSTRAINT_PROGRAM_SCHEMA_VERSION,
    profileId: profile.id,
    engine: profile.engine,
    verb: profile.verb,
    scale: recipe.scale,
    identity: {
      label: profile.label,
      premise: profile.premise,
      blindRecognition: profile.blindRecognition,
      nearestConfusions: [...profile.nearestConfusions],
    },
    context: {
      width: context.width,
      height: context.height,
      area: context.width * context.height,
      wraps: context.wraps,
      majorPlayers: normalizedPlayers(recipe),
      cityStates: Math.max(0, Math.min(41, Math.round(recipe.cityStates))),
      enabledVictories: [...recipe.matchIntent.enabledVictories],
      emphasizedVictories: [...recipe.matchIntent.emphasizedVictories],
    },
    explicitInputs: {
      waterPercent: recipe.settings.waterPercent,
      mountainPercent: recipe.settings.mountainPercent,
      riverDensity: recipe.settings.riverDensity,
      character: recipe.character,
      modifier: recipe.modifier,
      archetype: recipe.archetype,
      archetypeIntensity: recipe.archetypeIntensity,
    },
    parameterEnvelope: {
      water: [...profile.parameterEnvelope.water] as [number, number],
      mountains: [...profile.parameterEnvelope.mountains] as [number, number],
      preferredWater: profile.parameterEnvelope.preferredWater,
      preferredMountains: profile.parameterEnvelope.preferredMountains,
      ...(profile.parameterEnvelope.preferredRiverDensity ? { preferredRiverDensity: profile.parameterEnvelope.preferredRiverDensity } : {}),
    },
    authority: NARRATIVE_AUTHORITY_ORDER.map((authority, index) => ({ rank: index + 1, authority })),
    constraints: {
      essential: definition.essential.map((constraint) => cloneConstraint(constraint, "ESSENTIAL")).sort((one, two) => one.id.localeCompare(two.id)),
      preferred: definition.preferred.map((constraint) => cloneConstraint(constraint, "PREFERRED")).sort((one, two) => one.id.localeCompare(two.id)),
      prohibited: definition.prohibited.map((constraint) => cloneConstraint(constraint, "PROHIBITED")).sort((one, two) => one.id.localeCompare(two.id)),
    },
    relaxationOrder: definition.relaxationOrder.map((relaxation, index) => ({ ...relaxation, constraintIds: [...relaxation.constraintIds].sort(), order: index + 1 })),
    requiredEvidence: definition.requiredEvidence.map((evidence) => ({ ...evidence, target: Array.isArray(evidence.target) ? [...evidence.target] as [number, number] : evidence.target })).sort((one, two) => one.id.localeCompare(two.id)),
    ...(definition.generative ? { generative: structuredClone(definition.generative) } : {}),
    conflicts: controlConflicts(profile, recipe),
  };
  const inputHash = hashText(JSON.stringify(stableValue(programWithoutHash)));
  return deepFreeze({ ...programWithoutHash, inputHash });
}
