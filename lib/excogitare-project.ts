import type { Civ5Map } from "./civ5-map.ts";
import type { ExcogitareProject, ProjectEditorState, ProjectHistory, ProtectionState, ScenarioDraft } from "./authoring-schema.ts";
import type { GenerationRecipe } from "./generation-recipe.ts";
import { cloneGenerationRecipe } from "./generation-recipe.ts";
import { cloneGenerationStructure } from "./generation-structure.ts";

export const EXCOGITARE_PROJECT_SCHEMA_VERSION = 1 as const;
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
export const MAX_PROJECT_HISTORY = 30;

type ProjectFile = { format: "EXCOGITARE_PROJECT"; schemaVersion: 1; project: ExcogitareProject };

function stableValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $type: "Uint8Array", data: Array.from(value) };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([one], [two]) => one.localeCompare(two)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function checksum(value: unknown) {
  const text = JSON.stringify(stableValue(value)) ?? "undefined";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneMap(map: Civ5Map): Civ5Map {
  return {
    ...map,
    tiles: map.tiles.map((tile) => ({ ...tile })),
    startLocations: map.startLocations.map((start) => ({ ...start })),
    cities: map.cities?.map((city) => ({ ...city })),
    terrains: [...map.terrains], features: [...map.features], wonders: [...map.wonders], resources: [...map.resources],
    generation: map.generation ? { ...map.generation, dominantTerrains: [...map.generation.dominantTerrains] } : undefined,
    recipe: cloneGenerationRecipe(map.recipe), structure: cloneGenerationStructure(map.structure),
  };
}

function defaultProtection(): ProtectionState {
  return { schemaVersion: 1, semantic: [] };
}

function defaultScenario(map: Civ5Map): ScenarioDraft {
  return {
    schemaVersion: 1,
    name: map.name,
    description: map.description,
    factions: map.startLocations.map((start, index) => ({ id: `faction-${index + 1}`, civilization: start.civilization, leader: start.leader, team: start.team, control: "FLEXIBLE", cityState: start.cityState, playable: start.playable, start: { x: start.x, y: start.y } })),
    objectives: [],
    projectOnly: {},
  };
}

function payloadHashes(project: Omit<ExcogitareProject, "manifest">) {
  return Object.fromEntries(Object.entries(project).filter(([, value]) => value !== undefined).map(([key, value]) => [key, checksum(value)]));
}

export function createExcogitareProject(input: {
  projectName: string;
  map: Civ5Map;
  recipe: GenerationRecipe;
  history?: ProjectHistory;
  protection?: ProtectionState;
  scenario?: ScenarioDraft;
  editorState?: ProjectEditorState;
  excogitareVersion: string;
  now?: string;
  projectId?: string;
}): ExcogitareProject {
  const now = input.now ?? new Date().toISOString();
  const projectId = input.projectId ?? `project-${checksum(`${input.projectName}:${now}:${input.recipe.settings.seed}`)}`;
  const payload = {
    schemaVersion: 1 as const,
    map: cloneMap(input.map),
    recipe: cloneGenerationRecipe(input.recipe)!,
    protection: input.protection ?? defaultProtection(),
    scenario: input.scenario ?? defaultScenario(input.map),
    history: input.history ?? { schemaVersion: 1, entries: [] },
    editorState: input.editorState,
    derived: input.map.structure?.inputHash && input.map.structure.generatorVersion ? {
      inputHash: input.map.structure.inputHash,
      generatorVersion: input.map.structure.generatorVersion,
      passVersions: Object.fromEntries((input.map.structure.provenance ?? []).map((entry) => [entry.passId, entry.passVersion])),
      structure: cloneGenerationStructure(input.map.structure),
    } : undefined,
  } satisfies Omit<ExcogitareProject, "manifest">;
  return {
    ...payload,
    manifest: {
      schemaVersion: 1,
      projectId,
      projectName: input.projectName.trim() || input.map.name,
      createdAt: now,
      updatedAt: now,
      excogitareVersion: input.excogitareVersion,
      payloadHashes: payloadHashes(payload),
      requiredCapabilities: ["generation-recipe-v1", "civ5map-snapshot-v1"],
    },
  };
}

export function serializeExcogitareProject(project: ExcogitareProject) {
  const payload = { ...project };
  delete (payload as Partial<ExcogitareProject>).manifest;
  const normalized = { ...project, manifest: { ...project.manifest, updatedAt: new Date().toISOString(), payloadHashes: payloadHashes(payload as Omit<ExcogitareProject, "manifest">) } };
  const text = JSON.stringify(stableValue({ format: "EXCOGITARE_PROJECT", schemaVersion: EXCOGITARE_PROJECT_SCHEMA_VERSION, project: normalized } satisfies ProjectFile));
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit. Save without generation history.");
  return text;
}

function reviveTypedArrays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveTypedArrays);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.$type === "Uint8Array") {
      if (!Array.isArray(record.data) || record.data.some((item) => !Number.isInteger(item) || Number(item) < 0 || Number(item) > 255)) throw new Error("Project contains an invalid protection mask.");
      return Uint8Array.from(record.data as number[]);
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, reviveTypedArrays(item)]));
  }
  return value;
}

export function parseExcogitareProject(text: string): ExcogitareProject {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit.");
  let decoded: unknown;
  try { decoded = reviveTypedArrays(JSON.parse(text)); } catch (error) { throw new Error(error instanceof Error && error.message.includes("Project") ? error.message : "This is not valid Excogitare project JSON."); }
  if (!decoded || typeof decoded !== "object") throw new Error("This is not an Excogitare project.");
  const file = decoded as Partial<ProjectFile>;
  if (file.format !== "EXCOGITARE_PROJECT") throw new Error("This is not an Excogitare project.");
  if (file.schemaVersion !== EXCOGITARE_PROJECT_SCHEMA_VERSION) throw new Error(`Unsupported Excogitare project schema version: ${String(file.schemaVersion)}.`);
  const project = file.project;
  if (!project || project.schemaVersion !== 1 || project.manifest?.schemaVersion !== 1 || project.recipe?.schemaVersion !== 1) throw new Error("The project is missing required versioned authoring data.");
  if (!project.map || project.map.width * project.map.height !== project.map.tiles?.length) throw new Error("The project map has an incomplete tile grid.");
  if (project.history?.entries?.length > MAX_PROJECT_HISTORY) throw new Error(`Project history exceeds the ${MAX_PROJECT_HISTORY}-entry limit.`);
  const payload = { ...project };
  delete (payload as Partial<ExcogitareProject>).manifest;
  const hashes = payloadHashes(payload as Omit<ExcogitareProject, "manifest">);
  for (const [key, expected] of Object.entries(project.manifest.payloadHashes)) if (hashes[key] !== expected) throw new Error(`Project checksum failed for ${key}. The active map was not replaced.`);
  return project;
}
