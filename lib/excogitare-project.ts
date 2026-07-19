import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseCiv5Map, serializeCiv5Map, type Civ5Map } from "./civ5-map.ts";
import type {
  ExcogitareProject,
  ProjectCheckpoint,
  ProjectEditorState,
  ProjectHistory,
  ProjectHistoryEntry,
  ProjectManifest,
  ProtectionState,
  ScenarioDraft,
} from "./authoring-schema.ts";
import { cloneGenerationRecipe, normalizeGenerationRecipe, type GenerationRecipe } from "./generation-recipe.ts";
import { cloneGenerationStructure } from "./generation-structure.ts";
import { DEFAULT_GENERATION_OPTIONS } from "./map-generator.ts";
import { cloneProtectionState } from "./map-protection.ts";
import { scenarioDraftFromMap } from "./scenario-authoring.ts";

export const EXCOGITARE_PROJECT_SCHEMA_VERSION = 2 as const;
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
export const MAX_PROJECT_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_PROJECT_HISTORY = 30;
export const MAX_PROJECT_ENTRIES = 160;
export type ProjectHistoryPolicy = "FULL" | "CURRENT_AND_CHECKPOINTS";

type LegacyProjectFile = { format: "EXCOGITARE_PROJECT"; schemaVersion: 1; project: ExcogitareProject };
type BundleIndex = {
  schemaVersion: 1;
  activeEntryId?: string;
  entries: Array<Omit<ProjectHistoryEntry, "map" | "recipe" | "provenance"> & { snapshot: string }>;
  checkpoints: Array<Omit<ProjectCheckpoint, "map" | "recipe" | "provenance"> & { snapshot: string }>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SUPPORTED_CAPABILITIES = new Set([
  "generation-recipe-v1",
  "civ5map-snapshot-v1",
  "protection-v1",
  "scenario-draft-v1",
  "history-checkpoints-v1",
  "zip-bundle-v2",
]);
const REQUIRED_PATHS = ["project.json", "map.json", "map.civ5map", "recipe.json", "protection/state.json", "scenario/draft.json", "history/index.json"] as const;
const EXECUTABLE_EXTENSION = /\.(?:exe|dll|dylib|so|com|bat|cmd|ps1|sh|bash|zsh|js|mjs|cjs|wasm|app|jar)$/i;

function stableValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $type: "Uint8Array", data: Array.from(value) };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([one], [two]) => one.localeCompare(two)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value)) ?? "null";
}

function legacyChecksum(value: unknown) {
  const text = stableJson(value) ?? "undefined";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(input: Uint8Array) {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = paddedView.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + s1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0; state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0; state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return [...state].map((value) => value.toString(16).padStart(8, "0")).join("");
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
  return scenarioDraftFromMap(map);
}

function legacyPayloadHashes(project: Omit<ExcogitareProject, "manifest">) {
  return Object.fromEntries(Object.entries(project).filter(([, value]) => value !== undefined).map(([key, value]) => [key, legacyChecksum(value)]));
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
  const projectId = input.projectId ?? `project-${legacyChecksum(`${input.projectName}:${now}:${input.recipe.settings.seed}`)}`;
  const payload = {
    schemaVersion: 1 as const,
    map: cloneMap(input.map),
    recipe: cloneGenerationRecipe(input.recipe)!,
    protection: cloneProtectionState(input.protection ?? defaultProtection()),
    scenario: input.scenario ? scenarioDraftFromMap(input.map, input.scenario) : defaultScenario(input.map),
    history: input.history ? structuredClone(input.history) : { schemaVersion: 1 as const, entries: [], checkpoints: [] },
    editorState: input.editorState ? structuredClone(input.editorState) : undefined,
    derived: input.map.structure?.inputHash && input.map.structure.generatorVersion ? {
      inputHash: input.map.structure.inputHash,
      generatorVersion: input.map.structure.generatorVersion,
      passVersions: Object.fromEntries((input.map.structure.provenance ?? []).map((entry) => [entry.passId, entry.passVersion])),
      structure: cloneGenerationStructure(input.map.structure),
      narrative: cloneGenerationStructure(input.map.structure)?.narrativeAssessment,
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
      payloadHashes: {},
      requiredCapabilities: ["generation-recipe-v1", "civ5map-snapshot-v1", "protection-v1", "scenario-draft-v1", "history-checkpoints-v1", "zip-bundle-v2"],
      bundleVersion: 2,
      compression: "DEFLATE",
      hashAlgorithm: "SHA-256",
      historyPolicy: "FULL",
      payloads: {},
    },
  };
}

function safeEntryId(value: string) {
  const normalized = value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 100);
  if (!normalized) throw new Error("Project history contains an unusable entry identifier.");
  return normalized;
}

function jsonBytes(value: unknown) {
  return strToU8(stableJson(value));
}

function authoredMap(map: Civ5Map) {
  const result = cloneMap(map);
  delete result.recipe;
  delete result.structure;
  return result;
}

function addExtensionEntries(entries: Record<string, Uint8Array>, extensions: Record<string, unknown> | undefined) {
  const bundleEntries = extensions?.bundleEntries;
  if (!bundleEntries || typeof bundleEntries !== "object" || Array.isArray(bundleEntries)) return;
  for (const [path, value] of Object.entries(bundleEntries as Record<string, unknown>)) {
    if (!/^extensions\/[a-z0-9._/-]+\.json$/i.test(path) || path.includes("..") || path.includes("\\")) throw new Error(`Unsafe optional project extension path: ${path}.`);
    entries[path] = jsonBytes(value);
  }
}

function addHistoryEntries(entries: Record<string, Uint8Array>, history: ProjectHistory, policy: ProjectHistoryPolicy) {
  const includedEntries = policy === "FULL" ? history.entries.slice(0, MAX_PROJECT_HISTORY) : [];
  const checkpoints = (history.checkpoints ?? []).slice(0, MAX_PROJECT_HISTORY);
  const usedPaths = new Set<string>();
  const index: BundleIndex = { schemaVersion: 1, activeEntryId: policy === "FULL" ? history.activeEntryId : undefined, entries: [], checkpoints: [] };
  for (const item of includedEntries) {
    const snapshot = `history/snapshots/${safeEntryId(item.id)}.json`;
    if (usedPaths.has(snapshot)) throw new Error("Project history identifiers collide after safe filename normalization.");
    usedPaths.add(snapshot);
    entries[snapshot] = jsonBytes({ map: authoredMap(item.map), recipe: item.recipe, provenance: item.provenance, structure: cloneGenerationStructure(item.map.structure) });
    index.entries.push({ id: item.id, parentId: item.parentId, operation: item.operation, createdAt: item.createdAt, snapshot });
  }
  for (const checkpoint of checkpoints) {
    const snapshot = `history/checkpoints/${safeEntryId(checkpoint.id)}.json`;
    if (usedPaths.has(snapshot)) throw new Error("Project checkpoint identifiers collide after safe filename normalization.");
    usedPaths.add(snapshot);
    entries[snapshot] = jsonBytes({ map: authoredMap(checkpoint.map), recipe: checkpoint.recipe, provenance: checkpoint.provenance, structure: cloneGenerationStructure(checkpoint.map.structure) });
    index.checkpoints.push({ id: checkpoint.id, name: checkpoint.name, createdAt: checkpoint.createdAt, snapshot });
  }
  entries["history/index.json"] = jsonBytes(index);
}

function optionalRootFields(project: ExcogitareProject) {
  const known = new Set(["schemaVersion", "manifest", "map", "recipe", "protection", "scenario", "history", "editorState", "derived", "extensions"]);
  return Object.fromEntries(Object.entries(project as ExcogitareProject & Record<string, unknown>).filter(([key]) => !known.has(key)));
}

function extensionMetadata(extensions: Record<string, unknown> | undefined) {
  if (!extensions) return undefined;
  const metadata = { ...extensions };
  delete metadata.bundleEntries;
  return Object.keys(metadata).length ? metadata : undefined;
}

export function serializeExcogitareProject(project: ExcogitareProject, options: { historyPolicy?: ProjectHistoryPolicy; now?: string } = {}) {
  validateProject(project);
  const historyPolicy = options.historyPolicy ?? project.manifest.historyPolicy ?? "FULL";
  const entries: Record<string, Uint8Array> = {
    "project.json": jsonBytes({ schemaVersion: project.schemaVersion, extensions: extensionMetadata(project.extensions), unknown: optionalRootFields(project) }),
    "map.json": jsonBytes(authoredMap(project.map)),
    "map.civ5map": new Uint8Array(serializeCiv5Map(project.map)),
    "recipe.json": jsonBytes(project.recipe),
    "protection/state.json": jsonBytes(project.protection),
    "scenario/draft.json": jsonBytes(project.scenario),
  };
  if (project.editorState) entries["editor/state.json"] = jsonBytes(project.editorState);
  if (project.derived) entries["derived/evidence.json"] = jsonBytes(project.derived);
  addExtensionEntries(entries, project.extensions);
  addHistoryEntries(entries, project.history, historyPolicy);
  const expandedBytes = Object.values(entries).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (expandedBytes > MAX_PROJECT_UNCOMPRESSED_BYTES) throw new Error("The expanded project exceeds the 64 MB safety limit. Save current map and named checkpoints only.");
  const payloads = Object.fromEntries(Object.entries(entries).map(([path, bytes]) => [path, { sha256: sha256Hex(bytes), bytes: bytes.byteLength, required: (REQUIRED_PATHS as readonly string[]).includes(path) }]));
  const manifest: ProjectManifest = {
    ...project.manifest,
    updatedAt: options.now ?? new Date().toISOString(),
    payloadHashes: Object.fromEntries(Object.entries(payloads).map(([path, descriptor]) => [path, descriptor.sha256])),
    requiredCapabilities: [...new Set([...project.manifest.requiredCapabilities.filter((capability) => capability !== "monolithic-json-v1"), "generation-recipe-v1", "civ5map-snapshot-v1", "protection-v1", "scenario-draft-v1", "history-checkpoints-v1", "zip-bundle-v2"])],
    bundleVersion: 2,
    compression: "DEFLATE",
    hashAlgorithm: "SHA-256",
    historyPolicy,
    payloads,
  };
  entries["manifest.json"] = jsonBytes(manifest);
  const result = zipSync(entries, { level: 6 });
  if (result.byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit. Save current map and named checkpoints only.");
  return Uint8Array.from(result).buffer;
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

function parseJson(bytes: Uint8Array, label: string) {
  try { return reviveTypedArrays(JSON.parse(strFromU8(bytes))); } catch (error) { throw new Error(error instanceof Error && error.message.includes("Project") ? error.message : `${label} is not valid project JSON.`); }
}

function validateProtectionState(project: ExcogitareProject) {
  const protection = project.protection;
  if (!protection || protection.schemaVersion !== 1 || !Array.isArray(protection.semantic)) throw new Error("The project is missing its versioned protection state.");
  const tileCount = project.map.width * project.map.height;
  if (protection.tileMask) {
    if (protection.tileMask.schemaVersion !== 1 || protection.tileMask.width !== project.map.width || protection.tileMask.height !== project.map.height) throw new Error("The project protection mask dimensions do not match its map.");
    for (const channel of ["TOPOLOGY", "ELEVATION", "CLIMATE", "FEATURES", "HYDROLOGY", "CONTENT", "STARTS", "SCENARIO"] as const) {
      if (!(protection.tileMask.channels?.[channel] instanceof Uint8Array) || protection.tileMask.channels[channel].length !== tileCount) throw new Error(`The project contains an invalid ${channel.toLowerCase()} protection channel.`);
    }
    if (!Array.isArray(protection.tileMask.namedRegions) || protection.tileMask.namedRegions.some((region) => !region.id || !Array.isArray(region.tileIndices) || region.tileIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= tileCount))) throw new Error("The project contains an invalid named protection region.");
  }
  if (protection.semantic.some((semantic) => semantic.schemaVersion !== 1 || !semantic.id || !semantic.sourceSemanticId || !Array.isArray(semantic.channels) || !Array.isArray(semantic.invariants) || semantic.sourceTileIndices?.some((index) => !Number.isInteger(index) || index < 0 || index >= tileCount) || (semantic.inference && (!Number.isFinite(semantic.inference.confidence) || semantic.inference.confidence < 0 || semantic.inference.confidence > 1)))) throw new Error("The project contains an invalid semantic protection constraint.");
}

function validateProject(project: ExcogitareProject) {
  if (!project || project.schemaVersion !== 1 || project.manifest?.schemaVersion !== 1 || project.recipe?.schemaVersion !== 1) throw new Error("The project is missing required versioned authoring data.");
  if (!project.manifest.projectId || project.manifest.projectId.length > 160 || !project.manifest.projectName?.trim() || project.manifest.projectName.length > 160 || !Array.isArray(project.manifest.requiredCapabilities)) throw new Error("The project manifest identity is malformed.");
  if (!project.map || !Number.isInteger(project.map.width) || !Number.isInteger(project.map.height) || project.map.width < 1 || project.map.height < 1 || project.map.width > 512 || project.map.height > 512 || project.map.width * project.map.height !== project.map.tiles?.length) throw new Error("The project map has an incomplete or unsafe tile grid.");
  if (!project.history || project.history.schemaVersion !== 1 || !Array.isArray(project.history.entries) || project.history.entries.length > MAX_PROJECT_HISTORY || (project.history.checkpoints?.length ?? 0) > MAX_PROJECT_HISTORY) throw new Error(`Project history exceeds the ${MAX_PROJECT_HISTORY}-entry limit or is malformed.`);
  if (!project.scenario || project.scenario.schemaVersion !== 1 || !Array.isArray(project.scenario.factions) || !Array.isArray(project.scenario.objectives)) throw new Error("The project is missing its versioned Scenario draft.");
  project.scenario = scenarioDraftFromMap(project.map, project.scenario);
  if (project.editorState && (project.editorState.schemaVersion !== 1 || !Number.isFinite(project.editorState.view?.zoom) || !Number.isFinite(project.editorState.view?.x) || !Number.isFinite(project.editorState.view?.y))) throw new Error("The project contains invalid editor state.");
  for (const capability of project.manifest.requiredCapabilities) if (!SUPPORTED_CAPABILITIES.has(capability) && capability !== "monolithic-json-v1") throw new Error(`This project requires unsupported capability ${capability}.`);
  project.recipe = normalizeGenerationRecipe(project.recipe, project.map.generation ?? DEFAULT_GENERATION_OPTIONS);
  validateProtectionState(project);
  return project;
}

function migrateLegacyProject(text: string) {
  let decoded: unknown;
  try { decoded = reviveTypedArrays(JSON.parse(text)); } catch (error) { throw new Error(error instanceof Error && error.message.includes("Project") ? error.message : "This is not valid Excogitare project JSON."); }
  if (!decoded || typeof decoded !== "object") throw new Error("This is not an Excogitare project.");
  const file = decoded as Partial<LegacyProjectFile>;
  if (file.format !== "EXCOGITARE_PROJECT") throw new Error("This is not an Excogitare project.");
  if (file.schemaVersion !== 1) throw new Error(`Unsupported Excogitare project schema version: ${String(file.schemaVersion)}.`);
  const project = file.project;
  if (!project) throw new Error("The project is missing required authoring data.");
  const payload = { ...project };
  delete (payload as Partial<ExcogitareProject>).manifest;
  const hashes = legacyPayloadHashes(payload as Omit<ExcogitareProject, "manifest">);
  for (const [key, expected] of Object.entries(project.manifest?.payloadHashes ?? {})) if (hashes[key] !== expected) throw new Error(`Project checksum failed for ${key}. The active map was not replaced.`);
  const migrated: ExcogitareProject = {
    ...project,
    history: { ...project.history, checkpoints: project.history?.checkpoints ?? [] },
    manifest: {
      ...project.manifest,
      requiredCapabilities: [...new Set([...(project.manifest.requiredCapabilities ?? []), "monolithic-json-v1"])],
      historyPolicy: "FULL",
    },
  };
  return validateProject(migrated);
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65_557); offset -= 1) if (view.getUint32(offset, true) === 0x06054b50) return offset;
  throw new Error("The Excogitare ZIP directory is missing or truncated.");
}

function inspectArchive(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralBytes = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (!entryCount || entryCount > MAX_PROJECT_ENTRIES || offset + centralBytes > bytes.byteLength) throw new Error("The project archive has an unsafe entry count or directory size.");
  const names = new Set<string>();
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("The project archive directory is malformed.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if ((flags & 1) || ![0, 8].includes(method)) throw new Error("Encrypted or unsupported ZIP entries are not accepted.");
    if (!name || nameLength > 240 || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || /[\0-\x1f]/.test(name)) throw new Error(`Unsafe project archive path: ${name || "(empty)"}.`);
    if (EXECUTABLE_EXTENSION.test(name)) throw new Error(`Executable project content is not accepted: ${name}.`);
    if (names.has(name)) throw new Error(`Duplicate project archive entry: ${name}.`);
    if (uncompressed > compressed * 1000 + 1024 * 1024) throw new Error(`Project entry ${name} has an unsafe compression ratio.`);
    names.add(name);
    totalUncompressed += uncompressed;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (totalUncompressed > MAX_PROJECT_UNCOMPRESSED_BYTES) throw new Error("The expanded project exceeds the 64 MB safety limit.");
  return names;
}

function allowedPath(path: string) {
  return path === "manifest.json"
    || (REQUIRED_PATHS as readonly string[]).includes(path)
    || ["editor/state.json", "derived/evidence.json"].includes(path)
    || /^history\/(?:snapshots|checkpoints)\/[a-z0-9._-]+\.json$/i.test(path)
    || /^extensions\/[a-z0-9._/-]+\.json$/i.test(path);
}

function parseSnapshot(entries: Record<string, Uint8Array>, path: string, label: string) {
  const snapshot = parseJson(entries[path], label) as { map?: Civ5Map; recipe?: GenerationRecipe; provenance?: ProjectHistoryEntry["provenance"]; structure?: Civ5Map["structure"] };
  if (!snapshot.map || !snapshot.recipe || !Array.isArray(snapshot.provenance)) throw new Error(`${label} is incomplete.`);
  snapshot.map.recipe = normalizeGenerationRecipe(snapshot.recipe, snapshot.map.generation ?? DEFAULT_GENERATION_OPTIONS);
  snapshot.map.structure = cloneGenerationStructure(snapshot.structure);
  return snapshot as { map: Civ5Map; recipe: GenerationRecipe; provenance: ProjectHistoryEntry["provenance"] };
}

function parseBundle(bytes: Uint8Array) {
  const inspectedNames = inspectArchive(bytes);
  for (const path of inspectedNames) if (!allowedPath(path)) throw new Error(`Unknown project archive entry outside extensions/: ${path}.`);
  const entries = unzipSync(bytes);
  const actualNames = Object.keys(entries);
  if (actualNames.length !== inspectedNames.size || actualNames.some((path) => !inspectedNames.has(path) || !allowedPath(path))) throw new Error("The project archive local entries do not match its validated directory.");
  for (const required of ["manifest.json", ...REQUIRED_PATHS]) if (!entries[required]) throw new Error(`The project archive is missing ${required}.`);
  const manifest = parseJson(entries["manifest.json"], "manifest.json") as ProjectManifest;
  if (manifest.schemaVersion !== 1 || manifest.bundleVersion !== 2 || manifest.compression !== "DEFLATE" || manifest.hashAlgorithm !== "SHA-256" || !manifest.payloads) throw new Error("The project manifest uses an unsupported bundle contract.");
  for (const capability of manifest.requiredCapabilities ?? []) if (!SUPPORTED_CAPABILITIES.has(capability)) throw new Error(`This project requires unsupported capability ${capability}.`);
  const payloadPaths = Object.keys(manifest.payloads);
  for (const required of REQUIRED_PATHS) if (manifest.payloads[required]?.required !== true) throw new Error(`The project manifest does not mark ${required} as required.`);
  for (const path of Object.keys(entries).filter((path) => path !== "manifest.json")) if (!manifest.payloads[path]) throw new Error(`The manifest does not authorize project entry ${path}.`);
  for (const path of payloadPaths) {
    const descriptor = manifest.payloads[path];
    const payload = entries[path];
    if (!descriptor || !Number.isInteger(descriptor.bytes) || descriptor.bytes < 0 || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || !payload || descriptor.bytes !== payload.byteLength || descriptor.sha256 !== sha256Hex(payload)) throw new Error(`Project SHA-256 verification failed for ${path}. The active map was not replaced.`);
  }
  const projectRoot = parseJson(entries["project.json"], "project.json") as { schemaVersion?: number; extensions?: Record<string, unknown>; unknown?: Record<string, unknown> };
  if (projectRoot.schemaVersion !== 1) throw new Error("The project root schema is unsupported.");
  const recipe = normalizeGenerationRecipe(parseJson(entries["recipe.json"], "recipe.json"), DEFAULT_GENERATION_OPTIONS);
  const map = parseJson(entries["map.json"], "map.json") as Civ5Map;
  map.recipe = recipe;
  const derived = entries["derived/evidence.json"] ? parseJson(entries["derived/evidence.json"], "derived/evidence.json") as ExcogitareProject["derived"] : undefined;
  map.structure = cloneGenerationStructure(derived?.structure);
  const gameMap = parseCiv5Map(Uint8Array.from(entries["map.civ5map"]).buffer, map.name);
  if (gameMap.width !== map.width || gameMap.height !== map.height || gameMap.tiles.length !== map.tiles.length) throw new Error("map.civ5map does not match the authored map snapshot.");
  const index = parseJson(entries["history/index.json"], "history/index.json") as BundleIndex;
  if (index.schemaVersion !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.checkpoints)) throw new Error("The project history index is malformed.");
  const historyEntries = index.entries.map((item): ProjectHistoryEntry => {
    if (!item.id || !item.snapshot || !entries[item.snapshot]) throw new Error("The project history references a missing snapshot.");
    const snapshot = parseSnapshot(entries, item.snapshot, item.snapshot);
    return { id: item.id, parentId: item.parentId, operation: item.operation, createdAt: item.createdAt, ...snapshot };
  });
  const checkpoints = index.checkpoints.map((item): ProjectCheckpoint => {
    if (!item.id || !item.name || !item.snapshot || !entries[item.snapshot]) throw new Error("The project history references a missing checkpoint.");
    const snapshot = parseSnapshot(entries, item.snapshot, item.snapshot);
    return { id: item.id, name: item.name, createdAt: item.createdAt, ...snapshot };
  });
  const project: ExcogitareProject = {
    ...(projectRoot.unknown ?? {}),
    schemaVersion: 1,
    manifest,
    map,
    recipe,
    protection: parseJson(entries["protection/state.json"], "protection/state.json") as ProtectionState,
    scenario: parseJson(entries["scenario/draft.json"], "scenario/draft.json") as ScenarioDraft,
    history: { schemaVersion: 1, activeEntryId: index.activeEntryId, entries: historyEntries, checkpoints },
    editorState: entries["editor/state.json"] ? parseJson(entries["editor/state.json"], "editor/state.json") as ProjectEditorState : undefined,
    derived,
    extensions: {
      ...(projectRoot.extensions ?? {}),
      bundleEntries: Object.fromEntries(Object.entries(entries).filter(([path]) => path.startsWith("extensions/")).map(([path, payload]) => [path, parseJson(payload, path)])),
    },
  };
  return validateProject(project);
}

export function parseExcogitareProject(source: string | ArrayBuffer | Uint8Array) {
  if (typeof source === "string") {
    if (encoder.encode(source).byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit.");
    return migrateLegacyProject(source);
  }
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("This project exceeds the 64 MB project-file limit.");
  if (bytes[0] === 0x7b) return migrateLegacyProject(decoder.decode(bytes));
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is neither a current Excogitare ZIP bundle nor a legacy project JSON file.");
  return parseBundle(bytes);
}

export function serializeLegacyExcogitareProjectV1(project: ExcogitareProject) {
  const payload = { ...project };
  delete (payload as Partial<ExcogitareProject>).manifest;
  const legacyProject = { ...project, manifest: { ...project.manifest, payloadHashes: legacyPayloadHashes(payload as Omit<ExcogitareProject, "manifest">), requiredCapabilities: project.manifest.requiredCapabilities.filter((capability) => capability !== "zip-bundle-v2") } };
  return stableJson({ format: "EXCOGITARE_PROJECT", schemaVersion: 1, project: legacyProject } satisfies LegacyProjectFile);
}
