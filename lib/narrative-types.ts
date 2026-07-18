import type { GenerationEngine, MapPresetId } from "./map-generator.ts";
import type { WorldScale } from "./generation-recipe.ts";

export type FuturePolisNarrativeId = "THREE_REALMS" | "THALASSIC_LEAGUE" | "UNEQUAL_REALMS";
export type NarrativeProfileId = MapPresetId | FuturePolisNarrativeId;
export type NarrativeImplementation = "BENCHMARK" | "PROFILE_ONLY" | "FUTURE_RUNTIME";

export type NarrativeDiagnosticDefinition = {
  id: string;
  label: string;
  required: boolean;
  preferred: readonly [minimum: number, maximum: number];
  unit: "COUNT" | "PERCENT" | "TILES" | "RATIO" | "BOOLEAN";
};

export type NarrativeProfile = {
  schemaVersion: 1;
  id: NarrativeProfileId;
  label: string;
  engine: GenerationEngine;
  implementation: NarrativeImplementation;
  verb: string;
  premise: string;
  preferredScales: WorldScale[];
  allowedScales: WorldScale[];
  parameterEnvelope: {
    water: readonly [number, number];
    mountains: readonly [number, number];
    preferredWater: number;
    preferredMountains: number;
    preferredRiverDensity?: "SPARSE" | "NORMAL" | "DENSE";
  };
  requiredMotifs: Array<{ id: string; label: string }>;
  forbiddenMotifs: Array<{ id: string; label: string }>;
  topologyProgram: { kind: string; regionRange: readonly [number, number]; relationships: string[] };
  surfaceBiases: { terrain: string[]; features: string[]; resources: string[] };
  gameplayContract: { objective: string; populationRule: string };
  diagnostics: NarrativeDiagnosticDefinition[];
  nearestConfusions: NarrativeProfileId[];
  blindRecognition: string;
};

export type NarrativeSkeletonRegion = {
  id: string;
  role: "REALM" | "CHAIN" | "ANCHOR" | "BASIN" | "HEADWATER" | "OUTLET" | "ICE_SHEET" | "REFUGE" | "GENERIC";
  x: number;
  y: number;
  radius: number;
  parentId?: string;
  priority: number;
};

export type NarrativeSkeletonRelationship = {
  id: string;
  kind: "ISOLATED_FROM" | "BELONGS_TO" | "FLOWS_TO" | "FOLLOWS_ARC" | "BORDERS" | "SUPPLIES";
  from: string;
  to: string;
  points: Array<{ x: number; y: number }>;
  strength: number;
};

export type NarrativeSkeleton = {
  schemaVersion: 1;
  profileId: MapPresetId;
  implementation: NarrativeImplementation;
  scale: WorldScale;
  width: number;
  height: number;
  seed: string;
  regions: NarrativeSkeletonRegion[];
  relationships: NarrativeSkeletonRelationship[];
  targets: Record<string, number>;
  conflicts: string[];
  relaxations: string[];
};

export type NarrativeFinding = {
  id: string;
  label: string;
  status: "MET" | "WEAK" | "FAILED" | "UNAVAILABLE";
  score: number;
  evidence: string;
  measured?: number;
  target?: string;
};

export type NarrativeAssessment = {
  schemaVersion: 1;
  inputHash: string;
  profileId: MapPresetId;
  label: string;
  implementation: NarrativeImplementation;
  grade: "A" | "B" | "C" | "D" | "UNASSESSED";
  score: number;
  summary: string;
  motifs: NarrativeFinding[];
  antiMotifs: NarrativeFinding[];
  parameterDeviations: string[];
  weakened: string[];
  nearestConfusions: Array<{ profileId: NarrativeProfileId; label: string; risk: "LOW" | "MEDIUM" | "HIGH"; evidence: string }>;
  legalityRelaxations: string[];
};
