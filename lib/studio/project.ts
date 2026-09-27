import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../excogitare-project.ts";
import { generationRecipeFromOptions } from "../generation-recipe.ts";
import type { ExcogitareProject } from "../authoring-schema.ts";
import { defaultRecipe, migrateRecipe, validateRecipe, type Session, type World } from "./model.ts";
import { mapOptions, migrateWorld, worldFromMap } from "./operations.ts";
import { assessWorld } from "./development.ts";

const PAYLOAD = "extensions/studio-v2.json";
export function validateWorldRecord(value: unknown): asserts value is World {
  const world = value as World;
  if (!world || world.version !== 4 || !world.map || !world.fields || !world.substrate || !world.development || !Array.isArray(world.base)) throw new Error("The project has an invalid retained world record.");
  validateRecipe(world.recipe);
  const n = world.map.width * world.map.height;
  if (!Number.isInteger(world.map.width) || !Number.isInteger(world.map.height) || world.map.width < 1 || world.map.height < 1) throw new Error("Invalid map dimensions.");
  for (const values of [world.map.terrains, world.map.features, world.map.resources, world.map.wonders]) if (!Array.isArray(values) || values.length > 255 || values.some(v => typeof v !== "string" || v.length > 1024)) throw new Error("Invalid map type definitions.");
  if (!Array.isArray(world.map.startLocations) || world.map.startLocations.length > 128 || world.map.startLocations.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.y))) throw new Error("Invalid modeled settlement records.");
  if (!Array.isArray(world.baseRivers) || world.baseRivers.length !== n || world.baseRivers.some(b => !Number.isInteger(b) || b < 0 || b > 63)) throw new Error("Invalid retained river guidance.");
  if (!Number.isInteger(n) || n < 1 || n > 20000 || !Array.isArray(world.map.tiles) || world.map.tiles.length !== n) throw new Error("The world has an invalid grid or exceeds the 20,000-tile development budget.");
  for (const values of [world.base, world.fields.elevation, world.fields.moisture, world.fields.temperature]) if (!Array.isArray(values) || values.length !== n || values.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("The retained geographic fields are incomplete or invalid.");
  if (!Array.isArray(world.fields.drainage) || world.fields.drainage.length !== n || world.fields.drainage.some(i => !Number.isInteger(i) || i < -1 || i >= n)) throw new Error("Invalid retained drainage.");
  for (const tile of world.map.tiles) if (!tile || ["terrain", "elevation", "feature", "resource", "river", "continent", "wonder", "resourceAmount"].some(key => !Number.isInteger(tile[key as keyof typeof tile]) || Number(tile[key as keyof typeof tile]) < 0 || Number(tile[key as keyof typeof tile]) > 255)) throw new Error("Invalid physical tile record.");
  const indices = (items: number[]) => Array.isArray(items) && items.length <= n && items.every(i => Number.isInteger(i) && i >= 0 && i < n);
  if (!indices(world.locked) || !Array.isArray(world.strokes) || world.strokes.length > 1000 || world.strokes.some(s => !indices(s.tiles) || !["RIDGE", "BASIN", "LAND", "PASS", "WET", "DRY", "WARM", "COOL", "PAINT"].includes(s.kind) || !Number.isFinite(s.strength))) throw new Error("Invalid geographic edits or protected tiles.");
  if (!Array.isArray(world.features) || world.features.some(f => typeof f.id !== "string" || typeof f.name !== "string" || !indices(f.tiles))) throw new Error("Invalid retained feature selection.");
  const basis = world.substrate;
  validateRecipe(basis.recipe);
  if (typeof basis.id !== "string" || typeof basis.seed !== "string" || !["NATIVE", "INFERRED", "RETAINED"].includes(basis.confidence) || !Array.isArray(basis.tiles) || basis.tiles.length !== n || !basis.fields || !Array.isArray(basis.places)) throw new Error("Invalid retained foundation.");
  for (const values of [basis.fields.elevation, basis.fields.moisture, basis.fields.temperature]) if (!Array.isArray(values) || values.length !== n || values.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("Invalid foundation fields.");
  if (!Array.isArray(basis.fields.drainage) || basis.fields.drainage.length !== n || basis.fields.drainage.some(i => !Number.isInteger(i) || i < -1 || i >= n)) throw new Error("Invalid foundation drainage.");
  if (basis.nativeFields) for (const values of [basis.nativeFields.relief, basis.nativeFields.moisture, basis.nativeFields.temperature]) if (values && (!Array.isArray(values) || values.length !== n || values.some(v => !Number.isFinite(v)))) throw new Error("Invalid native process fields.");
  if (basis.confidence === "NATIVE" && !Array.isArray(basis.nativeFields?.relief)) throw new Error("Native field provenance requires retained process data.");
  if (!Array.isArray(world.protections) || world.protections.some(p => typeof p.id !== "string" || !["SHAPE", "FUNCTION"].includes(p.policy) || !indices(p.tiles))) throw new Error("Invalid place protection.");
  if (!Array.isArray(world.development.operations) || !world.development.operations.length || world.development.operations.length > 1010 || world.development.operations.some(c => typeof c.id !== "string" || typeof c.label !== "string" || !indices(c.tiles) || !Array.isArray(c.parentIds))) throw new Error("Invalid map operations.");
  if (!Array.isArray(world.development.proposals) || world.development.proposals.length > 10 || world.development.proposals.some(p => !p.stroke || !indices(p.stroke.tiles) || !Number.isFinite(p.stroke.strength))) throw new Error("Invalid development proposals.");
  if (!world.development.changes || !indices(world.development.changes.direct) || !indices(world.development.changes.dependent) || !Number.isInteger(world.development.changes.retained) || world.development.changes.retained < 0 || world.development.changes.retained > n) throw new Error("Invalid development footprint.");
  if (!Array.isArray(world.development.candidates) || world.development.candidates.length > 12) throw new Error("Invalid retained candidate search.");
  for (const candidate of world.development.candidates) {
    if (typeof candidate.seed !== "string" || candidate.seed.length > 256 || !Array.isArray(candidate.improvements)) throw new Error("Invalid candidate identity.");
    if (candidate.recipe) validateRecipe(candidate.recipe);
    if (candidate.strokes && (candidate.strokes.length > 1000 || candidate.strokes.some(stroke => !indices(stroke.tiles) || !Number.isFinite(stroke.strength) || stroke.strength < 0 || stroke.strength > 1))) throw new Error("Invalid candidate development.");
  }
  if (world.source && (!Array.isArray(world.source.bytes) || world.source.bytes.length > 64 * 1024 * 1024 || world.source.bytes.some(b => !Number.isInteger(b) || b < 0 || b > 255))) throw new Error("Invalid original map bytes.");
}
export function serializeSession(input: Session, name: string, legacy?: ExcogitareProject) {
  const session: Session = { ...input, current: migrateWorld(input.current), past: input.past.map(entry => ({ ...entry, world: migrateWorld(entry.world) })), future: input.future.map(entry => ({ ...entry, world: migrateWorld(entry.world) })) };
  if (session.past.length + session.future.length > 128) throw new Error("Keep at most 128 revisions or checkpoints in a project. Save the current world with checkpoints only, or remove older checkpoints.");
  validateWorldRecord(session.current);
  if (session.draft) validateRecipe(session.draft);
  if (session.developmentDraft) validateRecipe(session.developmentDraft);
  const world = session.current;
  const recipe = world.map.recipe ?? generationRecipeFromOptions(mapOptions(world.recipe));
  const project = createExcogitareProject({ projectName: name, map: world.map, recipe, excogitareVersion: "2.0.0", scenario: legacy?.scenario, history: { schemaVersion: 1, entries: [], checkpoints: [] } });
  for (const entry of [...session.past, ...session.future]) validateWorldRecord(entry.world);
  project.extensions = { ...legacy?.extensions, bundleEntries: { ...(legacy?.extensions?.bundleEntries as Record<string, unknown> ?? {}), [PAYLOAD]: { version: 4, session, ...(legacy ? { legacy } : {}) } } };
  return serializeExcogitareProject(project, { historyPolicy: "FULL" });
}
export function parseSession(bytes: ArrayBuffer): { session: Session; name: string; legacy?: ExcogitareProject } {
  const project = parseExcogitareProject(bytes);
  const payload = (project.extensions?.bundleEntries as Record<string, unknown> | undefined)?.[PAYLOAD] as { version: number; session: Session; legacy?: ExcogitareProject } | undefined;
  if (payload) {
    if (![2, 3, 4].includes(payload.version) || !payload.session || !Array.isArray(payload.session.past) || !Array.isArray(payload.session.future) || payload.session.past.length + payload.session.future.length > 128) throw new Error("Unsupported or oversized V2 authoring history.");
    const session = payload.session;
    session.current = migrateWorld(session.current);
    for (const entry of [...session.past, ...session.future]) entry.world = migrateWorld(entry.world);
    if (payload.version < 4) {
      session.legacyDrafts = { draft: structuredClone(session.draft), developmentDraft: structuredClone(session.developmentDraft) };
      if (session.draft) session.draft = migrateRecipe(session.draft);
      if (session.developmentDraft) session.developmentDraft = migrateRecipe(session.developmentDraft);
    }
    if (session.draft) validateRecipe(session.draft);
    if (session.developmentDraft) validateRecipe(session.developmentDraft);
    for (const world of [session.current, ...session.past.map(e => e.world), ...session.future.map(e => e.world)]) validateWorldRecord(world);
    session.current.assessment = assessWorld(session.current);
    if (JSON.stringify(session.current.map.tiles) !== JSON.stringify(project.map.tiles) || session.current.map.width !== project.map.width || session.current.map.height !== project.map.height) throw new Error("The V2 authoring state differs from the project's map. Open the map separately to recover its edited geography.");
    return { session, name: project.manifest.projectName, legacy: payload.legacy };
  }
  const recipe = defaultRecipe();
  if (project.recipe) { recipe.seed = project.recipe.settings.seed; recipe.size = project.recipe.settings.size; recipe.geometry = project.recipe.settings.geometry; recipe.players = project.map.players || 4; }
  const current = worldFromMap(project.map, recipe, project.map.source === "generated" ? "GENERATED" : "IMPORTED");
  current.messages.push("Legacy project opened. Its original authoring data is retained in the saved V2 bundle; V2 geographic fields are reconstructed from the current tiles.");
  return { session: { current, past: [], future: [] }, name: project.manifest.projectName, legacy: project };
}
