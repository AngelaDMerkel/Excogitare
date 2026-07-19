import type { Civ5Map } from "./civ5-map.ts";
import type { GeographicObjectKind, GenerationStructure } from "./generation-structure.ts";
import type { GenerationRecipe } from "./generation-recipe.ts";
import type { PassProvenance } from "./generation-pass-graph.ts";
import type { NarrativeAssessment } from "./narrative-types.ts";

export type ProtectionChannel = "TOPOLOGY" | "ELEVATION" | "CLIMATE" | "FEATURES" | "HYDROLOGY" | "CONTENT" | "STARTS" | "SCENARIO";
export type SemanticProtectionPolicy = "EXACT" | "SHAPE" | "FUNCTION" | "RELATIONSHIP";

export type TileProtectionMask = {
  schemaVersion: 1;
  width: number;
  height: number;
  channels: Record<ProtectionChannel, Uint8Array>;
  namedRegions: Array<{ id: string; name: string; tileIndices: number[]; channels: ProtectionChannel[] }>;
};

export type SemanticProtection = {
  schemaVersion: 1;
  id: string;
  label: string;
  objectKind: GeographicObjectKind | "MOUNTAIN_RANGE" | "RIVER_SYSTEM" | "COASTLINE" | "START_REGION";
  sourceSemanticId: string;
  policy: SemanticProtectionPolicy;
  channels: ProtectionChannel[];
  hard: boolean;
  tolerance: { minimumTileOverlap?: number; maximumCentroidShift?: number; minimumShapeSimilarity?: number };
  invariants: Array<{ id: string; kind: string; parameters: Record<string, string | number | boolean> }>;
  anchor: { x: number; y: number; relatedSemanticIds?: string[] };
  sourceTileIndices?: number[];
  sourceRelations?: Array<{ semanticId: string; kind: string }>;
  inference?: { source: "GENERATED" | "IMPORTED"; confidence: number; explanation: string };
};

export type ProtectionState = {
  schemaVersion: 1;
  tileMask?: TileProtectionMask;
  semantic: SemanticProtection[];
  lastReport?: ProtectionFidelityReport;
};

export type ProtectionFidelityFinding = {
  protectionId: string;
  label: string;
  policy: SemanticProtectionPolicy;
  status: "SATISFIED" | "DEGRADED" | "BLOCKED";
  score: number;
  lineageConfidence: number;
  tileOverlap: number;
  centroidShift: number;
  invariants: Array<{ id: string; satisfied: boolean; detail: string }>;
  message: string;
};

export type ProtectionFidelityReport = {
  schemaVersion: 1;
  engineAdapter: "EXCOGITARE_FIELDS" | "ECCENTRIC_GRAPH" | "PHYSICAL_BOUNDARY" | "POLIS_STRATEGIC";
  candidateCount: number;
  seamRepairs: number;
  findings: ProtectionFidelityFinding[];
  summary: string;
};

export type ScenarioControl = "HUMAN" | "AI" | "FLEXIBLE";
export type ScenarioFactionStatus = "ACTIVE" | "RESERVED" | "DISABLED";
export type ScenarioFaction = {
  id: string;
  slot: number;
  civilization: string;
  leader: string;
  team: number;
  control: ScenarioControl;
  cityState: boolean;
  playable: boolean;
  status: ScenarioFactionStatus;
  teamColor?: string;
  start?: { x: number; y: number };
  startingCityId?: number;
};
export type ScenarioObjective = {
  id: string;
  label: string;
  kind?: "VICTORY" | "CONTROL" | "PROTECT" | "REACH" | "SURVIVE" | "CUSTOM";
  semanticId?: string;
  factionId?: string;
  team?: number;
  victory?: string;
  notes?: string;
  projectOnly: boolean;
};
export type ScenarioTileAssignment = {
  x: number;
  y: number;
  ownerFactionId?: string;
  improvement?: Civ5Map["tiles"][number]["improvement"];
  route?: Civ5Map["tiles"][number]["route"];
};
export type ScenarioDraft = {
  schemaVersion: 1;
  name: string;
  description: string;
  setup?: {
    intent: "FIXED_SCENARIO" | "FLEXIBLE_LOBBY";
    ruleset: string;
    modProfile: string;
    majorSlotCapacity: number;
    cityStateSlotCapacity: number;
    intendedEra?: string;
    gameSpeed?: string;
    startingTurn?: number;
    calendar?: string;
    mapScript?: string;
  };
  factions: ScenarioFaction[];
  cities?: Civ5Map["cities"];
  tileAssignments?: ScenarioTileAssignment[];
  objectives: ScenarioObjective[];
  projectOnly: Record<string, unknown>;
};

export type { PassProvenance } from "./generation-pass-graph.ts";

export type ProjectHistoryEntry = {
  id: string;
  parentId?: string;
  operation: string;
  createdAt?: string;
  recipe: GenerationRecipe;
  map: Civ5Map;
  provenance: PassProvenance[];
};

export type ProjectCheckpoint = {
  id: string;
  name: string;
  createdAt: number;
  recipe: GenerationRecipe;
  map: Civ5Map;
  provenance: PassProvenance[];
};

export type ProjectHistory = {
  schemaVersion: 1;
  activeEntryId?: string;
  entries: ProjectHistoryEntry[];
  checkpoints?: ProjectCheckpoint[];
};

export type ProjectEditorState = {
  schemaVersion: 1;
  workspace: "VIEW" | "CREATE" | "REPAIR" | "LAB" | "SCRIPT" | "SCENARIO";
  stage?: string;
  view: { zoom: number; x: number; y: number };
  expandedSections: string[];
  stageScrollPositions?: Record<string, number>;
};

export type MatchFeasibilityReport = { schemaVersion: 1; inputHash: string; findings: Array<{ victory: string; feasible: boolean; message: string }> };
export type ValidationReport = { schemaVersion: 1; inputHash: string; findings: Array<{ severity: string; message: string }> };
export type ScenarioCapabilityLevel = "READ" | "EDIT" | "WRITE" | "GAME_VERIFIED";
export type ScenarioCompatibilityReport = {
  schemaVersion: 1;
  inputHash: string;
  capabilities: Record<string, ScenarioCapabilityLevel>;
  details?: Record<string, { projectOnly: boolean; explanation: string }>;
};

export type DerivedEvidence = {
  inputHash: string;
  generatorVersion: string;
  passVersions: Record<string, number>;
  structure?: GenerationStructure;
  narrative?: NarrativeAssessment;
  match?: MatchFeasibilityReport;
  validation?: ValidationReport;
  scenarioCompatibility?: ScenarioCompatibilityReport;
};

export type ProjectManifest = {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  excogitareVersion: string;
  payloadHashes: Record<string, string>;
  requiredCapabilities: string[];
  bundleVersion?: 2;
  compression?: "DEFLATE";
  hashAlgorithm?: "SHA-256";
  historyPolicy?: "FULL" | "CURRENT_AND_CHECKPOINTS";
  payloads?: Record<string, { sha256: string; bytes: number; required: boolean }>;
};

export type ExcogitareProject = {
  schemaVersion: 1;
  manifest: ProjectManifest;
  map: Civ5Map;
  recipe: GenerationRecipe;
  protection: ProtectionState;
  scenario: ScenarioDraft;
  history: ProjectHistory;
  editorState?: ProjectEditorState;
  derived?: DerivedEvidence;
  extensions?: Record<string, unknown>;
};

export function derivedEvidenceIsCurrent(evidence: DerivedEvidence | undefined, inputHash: string, generatorVersion: string, passVersions: Record<string, number>) {
  if (!evidence || evidence.inputHash !== inputHash || evidence.generatorVersion !== generatorVersion) return false;
  const expected = Object.entries(passVersions);
  return expected.length === Object.keys(evidence.passVersions).length && expected.every(([id, version]) => evidence.passVersions[id] === version);
}
