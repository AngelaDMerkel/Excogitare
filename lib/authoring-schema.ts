import type { Civ5Map } from "./civ5-map.ts";
import type { GeographicObjectKind, GenerationStructure } from "./generation-structure.ts";
import type { GenerationRecipe } from "./generation-recipe.ts";
import type { PassProvenance } from "./generation-pass-graph.ts";

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
};

export type ProtectionState = {
  schemaVersion: 1;
  tileMask?: TileProtectionMask;
  semantic: SemanticProtection[];
};

export type ScenarioDraft = {
  schemaVersion: 1;
  name: string;
  description: string;
  factions: Array<{ id: string; civilization: string; leader: string; team: number; control: "HUMAN" | "AI" | "FLEXIBLE"; cityState: boolean; playable: boolean; teamColor?: string; start?: { x: number; y: number } }>;
  objectives: Array<{ id: string; label: string; semanticId?: string; projectOnly: boolean }>;
  projectOnly: Record<string, unknown>;
};

export type { PassProvenance } from "./generation-pass-graph.ts";

export type ProjectHistoryEntry = {
  id: string;
  parentId?: string;
  operation: string;
  recipe: GenerationRecipe;
  map: Civ5Map;
  provenance: PassProvenance[];
};

export type ProjectHistory = {
  schemaVersion: 1;
  activeEntryId?: string;
  entries: ProjectHistoryEntry[];
};

export type ProjectEditorState = {
  schemaVersion: 1;
  workspace: "VIEW" | "CREATE" | "REPAIR" | "LAB" | "SCRIPT" | "SCENARIO";
  stage?: string;
  view: { zoom: number; x: number; y: number };
  expandedSections: string[];
};

export type NarrativeAssessment = { schemaVersion: 1; inputHash: string; findings: Array<{ id: string; passed: boolean; message: string }> };
export type MatchFeasibilityReport = { schemaVersion: 1; inputHash: string; findings: Array<{ victory: string; feasible: boolean; message: string }> };
export type ValidationReport = { schemaVersion: 1; inputHash: string; findings: Array<{ severity: string; message: string }> };
export type ScenarioCompatibilityReport = { schemaVersion: 1; inputHash: string; capabilities: Record<string, "READ" | "EDIT" | "WRITE" | "GAME_VERIFIED"> };

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
};

export function derivedEvidenceIsCurrent(evidence: DerivedEvidence | undefined, inputHash: string, generatorVersion: string, passVersions: Record<string, number>) {
  if (!evidence || evidence.inputHash !== inputHash || evidence.generatorVersion !== generatorVersion) return false;
  const expected = Object.entries(passVersions);
  return expected.length === Object.keys(evidence.passVersions).length && expected.every(([id, version]) => evidence.passVersions[id] === version);
}
