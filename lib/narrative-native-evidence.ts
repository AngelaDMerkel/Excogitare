import type { Civ5Map } from "./civ5-map.ts";
import type { NarrativeConstraintProgram } from "./narrative-constraints.ts";
import type { NarrativeAdapterEvidence, NativeNarrativePlan } from "./narrative-engine-adapters.ts";
import type { NarrativeNativeInvariant } from "./narrative-native-contracts.ts";
import type { MapPresetId } from "./map-generator.ts";
import { proveEccentricNativeFacts, type EccentricNativeInvariantId } from "./narrative-native-eccentric-proof.ts";
import { proveExcogitareNativeInvariant, type ExcogitareNativeInvariantId } from "./narrative-native-excogitare-proof.ts";
import { provePhysicalPolisNativeFacts } from "./narrative-native-physical-polis-proof.ts";

export type NarrativeInvariantFinding = {
  invariantId: string;
  category: NarrativeNativeInvariant["category"];
  proofStage: NarrativeNativeInvariant["proofStage"];
  requirement: string;
  status: "PROVEN" | "WEAK" | "FAILED" | "UNAVAILABLE";
  score: number;
  evidence: string[];
  objectIds: string[];
};

export type NarrativeNativeEvidence = {
  schemaVersion: 1;
  profileId: NarrativeConstraintProgram["profileId"];
  programHash: string;
  grammarFamily: NarrativeAdapterEvidence["grammarFamily"];
  status: "PROVEN" | "WEAK" | "FAILED" | "UNAVAILABLE";
  score: number;
  findings: NarrativeInvariantFinding[];
  retainedCauseCount: number;
  boundObjectCount: number;
};

function evidenceResult(
  invariant: NarrativeNativeInvariant,
  ok: boolean,
  evidence: string[],
  objectIds: string[],
): NarrativeInvariantFinding {
  return {
    invariantId: invariant.id,
    category: invariant.category,
    proofStage: invariant.proofStage,
    requirement: invariant.requirement,
    status: ok ? "PROVEN" : "FAILED",
    score: ok ? 99 : 5,
    evidence,
    objectIds,
  };
}

type ProofContext = Readonly<{
  map: Civ5Map;
  program: NarrativeConstraintProgram;
  adapter: NarrativeAdapterEvidence;
  invariant: NarrativeNativeInvariant;
}>;

type InvariantVerifier = (context: ProofContext) => NarrativeInvariantFinding;
type RegisteredVerifier = Readonly<{ profileId: MapPresetId; verify: InvariantVerifier }>;

function registered(profileId: MapPresetId, verify: InvariantVerifier): RegisteredVerifier {
  return { profileId, verify };
}

function eccentricSpatialProof(context: ProofContext) {
  const facts = proveEccentricNativeFacts(context.invariant.id as EccentricNativeInvariantId, context.map, context.adapter);
  const namedBindings = facts.objectIds.length
    ? `Required native bindings: ${facts.objectIds.join(", ")}.`
    : "Required native bindings: none survived exact spatial verification.";
  return evidenceResult(context.invariant, facts.ok, [namedBindings, ...facts.evidence], facts.objectIds);
}

function excogitareSpatialProof(context: ProofContext) {
  const facts = proveExcogitareNativeInvariant(context.invariant.id as ExcogitareNativeInvariantId, context.map, context.adapter);
  return evidenceResult(context.invariant, facts.ok, facts.evidence, facts.objectIds);
}

function physicalPolisSpatialProof(context: ProofContext) {
  const facts = provePhysicalPolisNativeFacts(context.program.profileId, context.map, context.adapter);
  const namedBindings = facts.objectIds.length
    ? `Required native bindings: ${facts.objectIds.join(", ")}.`
    : "Required native bindings: none survived exact spatial verification.";
  return evidenceResult(context.invariant, facts.ok, [namedBindings, ...facts.evidence], facts.objectIds);
}

type NativeProofContextValidation = Readonly<{
  errors: string[];
  boundObjectCount: number;
}>;

const EXPECTED_ADAPTER = {
  EXCOGITARE: "FIELD_BOUNDARY",
  ECCENTRIC: "GRAPH_RESERVATION",
  PHYSICAL: "PHYSICAL_BOUNDARY",
  POLIS: "STRATEGIC_DISGUISE",
} as const;

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) if (seen.has(value)) duplicates.add(value); else seen.add(value);
  return [...duplicates];
}

function planEntry(plan: NativeNarrativePlan, id: string) {
  const region = plan.regions.find((candidate) => candidate.id === id);
  if (region) return { kind: "REGION" as const, role: region.role };
  const path = plan.paths.find((candidate) => candidate.id === id);
  return path ? { kind: "RELATIONSHIP" as const, role: path.kind, from: path.from, to: path.to } : undefined;
}

/**
 * Engine-specific spatial proof is meaningful only after ownership and
 * provenance are exact. This gate deliberately derives binding cardinality
 * from the final bijection rather than trusting mutable diagnostics.
 */
function validateNativeProofContext(
  map: Civ5Map,
  program: NarrativeConstraintProgram,
  adapter: NarrativeAdapterEvidence,
): NativeProofContextValidation {
  const errors: string[] = [];
  const structure = map.structure;
  const plan = structure?.narrativeNativePlan;
  const retainedAdapter = structure?.narrativeAdapter;
  const retainedProgram = structure?.narrativeProgram;
  if (!structure) return { errors: ["Map has no retained generation structure."], boundObjectCount: 0 };
  if (!plan) errors.push("Map has no retained native plan.");
  if (!retainedAdapter) errors.push("Map has no retained native adapter.");
  if (!retainedProgram) errors.push("Map has no retained narrative program.");
  if (structure.evidenceState === "STALE") errors.push("Map narrative evidence is stale.");
  if (structure.engine !== program.engine || map.generation?.engine !== program.engine) errors.push("Map engine does not match the narrative program.");
  if (map.generation?.preset !== program.profileId) errors.push("Map profile does not match the narrative program.");
  if (adapter.schemaVersion !== 1 || adapter.engine !== program.engine || adapter.profileId !== program.profileId
    || adapter.programHash !== program.inputHash || adapter.adapter !== EXPECTED_ADAPTER[program.engine]) {
    errors.push("Adapter ownership, profile, hash, or adapter kind does not match the narrative program.");
  }
  if (retainedProgram && (retainedProgram.schemaVersion !== 1 || retainedProgram.inputHash !== program.inputHash
    || retainedProgram.profileId !== program.profileId || retainedProgram.engine !== program.engine)) {
    errors.push("Retained map program does not match the evaluated narrative program.");
  }
  if (plan && (plan.schemaVersion !== 1 || plan.engine !== program.engine || plan.profileId !== program.profileId
    || plan.grammarFamily !== adapter.grammarFamily)) {
    errors.push("Native plan ownership, profile, or grammar does not match the adapter.");
  }
  if (retainedAdapter && (retainedAdapter.schemaVersion !== 1 || retainedAdapter.engine !== adapter.engine
    || retainedAdapter.profileId !== adapter.profileId || retainedAdapter.programHash !== adapter.programHash
    || retainedAdapter.adapter !== adapter.adapter || retainedAdapter.grammarFamily !== adapter.grammarFamily
    || JSON.stringify(retainedAdapter.causalObjects) !== JSON.stringify(adapter.causalObjects))) {
    errors.push("Evaluated adapter does not match the adapter retained by the map.");
  }
  if (!plan) return { errors: [...new Set(errors)], boundObjectCount: 0 };

  const plannedCount = plan.regions.length + plan.paths.length;
  if (adapter.causalObjects.length !== plannedCount) errors.push(`Adapter exposes ${adapter.causalObjects.length}/${plannedCount} native-plan causes.`);
  const duplicateCauseIds = duplicateValues(adapter.causalObjects.map((cause) => cause.id));
  const duplicateNativeIds = duplicateValues(adapter.causalObjects.filter((cause) => cause.retained).map((cause) => cause.nativeObjectId));
  if (duplicateCauseIds.length) errors.push(`Cause ids are duplicated: ${duplicateCauseIds.join(", ")}.`);
  if (duplicateNativeIds.length) errors.push(`Cause native-object ids are duplicated: ${duplicateNativeIds.join(", ")}.`);

  const nativeObjects = structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
  const duplicateObjectIds = duplicateValues(nativeObjects.map((object) => object.id));
  const semanticIds = nativeObjects.map((object) => object.semanticId ?? "");
  const duplicateSemanticIds = duplicateValues(semanticIds);
  if (duplicateObjectIds.length) errors.push(`Final native object ids are duplicated: ${duplicateObjectIds.join(", ")}.`);
  if (semanticIds.some((id) => !id) || duplicateSemanticIds.length) errors.push("Final native semantic ids are absent or duplicated.");
  const retainedCauses = adapter.causalObjects.filter((cause) => cause.retained);
  if (!retainedCauses.length) errors.push("Adapter retains no native causes.");
  if (nativeObjects.length !== retainedCauses.length) errors.push(`Final native object count ${nativeObjects.length} does not equal retained cause count ${retainedCauses.length}.`);

  const causesById = new Map(adapter.causalObjects.map((cause) => [cause.id, cause]));
  for (const cause of adapter.causalObjects) {
    const planned = planEntry(plan, cause.id);
    if (!planned || planned.kind !== cause.kind || planned.role !== cause.role) {
      errors.push(`Cause ${cause.id} does not match one exact native-plan entry.`);
      continue;
    }
    const matches = nativeObjects.filter((object) => object.id === cause.nativeObjectId);
    if (!cause.retained) {
      if (matches.length) errors.push(`Unretained cause ${cause.id} still has a final native object.`);
      continue;
    }
    if (cause.nativeObjectId !== `narrative-${cause.id}`) errors.push(`Retained cause ${cause.id} has noncanonical native object id ${cause.nativeObjectId}.`);
    if (matches.length !== 1) {
      errors.push(`Retained cause ${cause.id} resolves to ${matches.length} final native objects.`);
      continue;
    }
    const object = matches[0];
    if (object.semanticId !== `narrative:${cause.id}` || object.attributes?.grammarFamily !== adapter.grammarFamily
      || String(object.attributes?.role ?? object.attributes?.relationship ?? "") !== cause.role) {
      errors.push(`Final native object ${object.id} has stale semantic, grammar, or role provenance.`);
    }
    if (!object.tileIndices.length || object.tileIndices.length !== new Set(object.tileIndices).size
      || object.tileIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= map.tiles.length)) {
      errors.push(`Final native object ${object.id} has empty, duplicate, or out-of-bounds tiles.`);
    }
    if (cause.kind === "REGION") {
      if (object.kind !== "NARRATIVE_REGION" || object.attributes?.relationship !== undefined) errors.push(`Region cause ${cause.id} is not a native narrative region.`);
      continue;
    }
    const lawfulLinearKind = object.kind === "NARRATIVE_PATH"
      || program.engine === "ECCENTRIC" && cause.role === "NARROW_STRAIT" && object.kind === "STRAIT";
    const from = String(object.attributes?.from ?? "");
    const to = String(object.attributes?.to ?? "");
    if (!lawfulLinearKind || object.attributes?.relationship !== cause.role || from !== planned.from || to !== planned.to
      || !from || from === to || !causesById.get(from)?.retained || !causesById.get(to)?.retained) {
      errors.push(`Relationship cause ${cause.id} lacks exact linear provenance or two distinct retained endpoints (${object.kind}; ${from}:${causesById.get(from)?.retained ?? "missing"} → ${to}:${causesById.get(to)?.retained ?? "missing"}; planned ${planned.from} → ${planned.to}).`);
    }
  }
  for (const object of nativeObjects) {
    const reverse = retainedCauses.filter((cause) => cause.nativeObjectId === object.id && object.semanticId === `narrative:${cause.id}`);
    if (reverse.length !== 1) errors.push(`Final native object ${object.id} has ${reverse.length} retained reverse bindings.`);
  }
  const uniqueErrors = [...new Set(errors)];
  return { errors: uniqueErrors, boundObjectCount: uniqueErrors.length ? 0 : retainedCauses.length };
}

const NARRATIVE_NATIVE_INVARIANT_VERIFIERS = {
  "viable-crooked-interiors": registered("CONTINENTS", excogitareSpatialProof),
  "robust-dominant-continent": registered("PANGAEA", excogitareSpatialProof),
  "viable-shelf-anchors": registered("ARCHIPELAGO", excogitareSpatialProof),
  "bounded-terrestrial-kingdoms": registered("INLAND_SEAS", excogitareSpatialProof),
  "viable-island-homelands": registered("EARTHSEA", excogitareSpatialProof),
  "technology-gated-divide": registered("RIFT_REALMS", excogitareSpatialProof),
  "accessible-dual-maze": registered("LABYRINTH", excogitareSpatialProof),
  "coherent-contrasting-provinces": registered("WILD_REGIONS", excogitareSpatialProof),

  "one-causal-transect": registered("LIVING_WORLD", eccentricSpatialProof),
  "distinct-continental-histories": registered("TECTONIC_CONTINENTS", eccentricSpatialProof),
  "legal-directed-drainage": registered("GREAT_WATERSHEDS", eccentricSpatialProof),
  "sea-dominated-crossroads": registered("SHATTERED_BASINS", eccentricSpatialProof),
  "heart-march-contrast": registered("MYTHIC_REGIONS", eccentricSpatialProof),
  "resilient-outer-circuit": registered("ENCIRCLING_LANDS", eccentricSpatialProof),
  "scarred-surviving-pangaea": registered("ASTRAL_PANGAEA", eccentricSpatialProof),
  "authoritative-primary-rifts": registered("RIFTWORLD", eccentricSpatialProof),
  "one-major-per-isolated-realm": registered("LONELY_OCEANS", eccentricSpatialProof),
  "attached-peninsula-provinces": registered("PENINSULA_REALM", eccentricSpatialProof),
  "parent-arc-ancestry": registered("SHATTERED_ARCHIPELAGO", eccentricSpatialProof),

  "multiple-retained-epochs": registered("DYNAMIC_EARTH", physicalPolisSpatialProof),
  "convergent-accessible-belts": registered("COLLIDING_PLATES", physicalPolisSpatialProof),
  "deep-time-causal-landscape": registered("ANCIENT_CRATONS", physicalPolisSpatialProof),
  "subduction-arc-cross-section": registered("ISLAND_ARC_EARTH", physicalPolisSpatialProof),
  "inward-draining-enclosure": registered("SUPERCONTINENT_INTERIOR", physicalPolisSpatialProof),
  "circulation-relief-drainage-chain": registered("MONSOON_CONTINENTS", physicalPolisSpatialProof),
  "valuable-accessible-cold-frontier": registered("ICEHOUSE_EARTH", physicalPolisSpatialProof),

  "shared-axle-with-lateral-routes": registered("IMPERIAL_RING", physicalPolisSpatialProof),
  "two-sides-plural-theatres": registered("OPPOSING_FRONTS", physicalPolisSpatialProof),
  "many-to-many-heartland-access": registered("CONTESTED_HEARTLAND", physicalPolisSpatialProof),
  "costly-accessible-hinges": registered("RIVAL_CONTINENTS", physicalPolisSpatialProof),
  "complete-three-realm-contact": registered("THREE_REALMS", physicalPolisSpatialProof),
  "redundant-maritime-network": registered("THALASSIC_LEAGUE", physicalPolisSpatialProof),
  "distinct-viable-role-contracts": registered("UNEQUAL_REALMS", physicalPolisSpatialProof),
} as const;

export const NARRATIVE_NATIVE_INVARIANT_VERIFIER_IDS = Object.freeze(Object.keys(NARRATIVE_NATIVE_INVARIANT_VERIFIERS));

export function evaluateNarrativeNativeEvidence(
  map: Civ5Map,
  program: NarrativeConstraintProgram,
  adapter: NarrativeAdapterEvidence,
): NarrativeNativeEvidence {
  const invariants = program.generative?.invariants ?? [];
  const context = validateNativeProofContext(map, program, adapter);
  const findings = invariants.map((invariant) => {
    if (context.errors.length) return evidenceResult(
      invariant,
      false,
      [`Native proof context rejected: ${context.errors.join(" ")}`],
      [],
    );
    const registration = NARRATIVE_NATIVE_INVARIANT_VERIFIERS[invariant.id as keyof typeof NARRATIVE_NATIVE_INVARIANT_VERIFIERS] as RegisteredVerifier | undefined;
    if (!registration) throw new Error(`Native invariant ${invariant.id} has no explicit verifier.`);
    if (registration.profileId !== program.profileId) throw new Error(`Native invariant ${invariant.id} belongs to ${registration.profileId}, not ${program.profileId}.`);
    return registration.verify({ map, program, adapter, invariant });
  });
  const rank = { PROVEN: 0, WEAK: 1, FAILED: 2, UNAVAILABLE: 3 } as const;
  const status = findings.length
    ? findings.reduce<NarrativeNativeEvidence["status"]>((worst, finding) => rank[finding.status] > rank[worst] ? finding.status : worst, "PROVEN")
    : "UNAVAILABLE";
  return {
    schemaVersion: 1,
    profileId: program.profileId,
    programHash: program.inputHash,
    grammarFamily: adapter.grammarFamily,
    status,
    score: findings.length ? Number((findings.reduce((sum, finding) => sum + finding.score, 0) / findings.length).toFixed(2)) : 0,
    findings,
    retainedCauseCount: adapter.causalObjects.filter((cause) => cause.retained).length,
    boundObjectCount: context.boundObjectCount,
  };
}
