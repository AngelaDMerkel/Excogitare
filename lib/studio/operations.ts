import { parseCiv5Map, parseCiv5MapForRepair } from "../civ5-map.ts";
import { isWaterTerrain } from "../civ5-rules.ts";
import { MAP_SIZES, resolveMapDimensions } from "../map-generator.ts";
import { buildRepairIssues, applyRepairIssues } from "../map-repair.ts";
import { markGenerationStructureStale } from "../generation-structure.ts";
import { inferFields, identifyFeatures } from "./geography.ts";
import { assess } from "./assessment.ts";
import { defaultRecipe, hash, random, randomRecipe, validateRecipe, type CandidateSummary, type Job, type Progress, type Stroke, type StudioRecipe, type World } from "./model.ts";
import { migrateWorld, nativeFoundation, worldFromMap } from "./foundations.ts";
import { applyDevelopment, developWorld, findProposals, finishWorld } from "./development.ts";
import { symmetry } from "./arena.ts";
export { assess } from "./assessment.ts";
export { mapOptions, migrateWorld, sampleWorld, worldFromMap } from "./foundations.ts";
export { validateWorld } from "./validation.ts";
export { exportMap } from "./export.ts";

export function importMap(bytes: ArrayBuffer, name: string) {
  let map, salvaged = false;
  try { map = parseCiv5Map(bytes, name); } catch { map = parseCiv5MapForRepair(bytes, name).map; salvaged = true; }
  if (map.tiles.length > 20000) throw new Error("This map exceeds the studio's 20,000-tile development budget.");
  const recipe = defaultRecipe(), size = MAP_SIZES.find(s => s.width === map.width && s.height === map.height);
  if (size) recipe.size = size.id;
  recipe.wraps = map.wraps; recipe.players = Math.max(2, Math.min(22, map.players || 4)); recipe.development = 0;
  const assessment = assess(map, recipe);
  recipe.water = [Math.floor(assessment.water), Math.min(90, Math.ceil(assessment.water))];
  recipe.mountains = [Math.min(38, Math.floor(assessment.mountains)), Math.min(38, Math.ceil(assessment.mountains))];
  const world = worldFromMap(map, recipe); world.source = { name, bytes: [...new Uint8Array(bytes)], salvaged };
  if (salvaged) world.messages.push("The damaged file required structural recovery; review the recovered geography before export.");
  return world;
}
function compositionFits(world: World) {
  const { assessment: a, recipe: r, map } = world, waterTolerance = 100 / map.tiles.length + 1e-6, mountainTolerance = 100 / Math.max(1, map.tiles.filter(t => !isWaterTerrain(map, t)).length) + 1e-6;
  return a.water >= r.water[0] - waterTolerance && a.water <= r.water[1] + waterTolerance && a.mountains >= r.mountains[0] - mountainTolerance && a.mountains <= r.mountains[1] + mountainTolerance;
}
function candidateRank(world: World) {
  const q = world.assessment.quality, gameplay = world.recipe.foundation === "GAMEPLAY" || world.recipe.balance !== "OPEN";
  return (gameplay ? q.opportunity * 2 : q.identity * 1.5 + q.variety * .35) + q.coherence + q.opportunity * .3;
}
function dominates(a: World, b: World) {
  const keys = ["coherence", "identity", "opportunity", "variety"] as const;
  return keys.every(k => a.assessment.quality[k] >= b.assessment.quality[k]) && keys.some(k => a.assessment.quality[k] > b.assessment.quality[k]);
}
export function generateWorld(input: StudioRecipe, progress: Progress = () => {}): World {
  validateRecipe(input);
  const recipe = structuredClone(input);
  const dimensions = resolveMapDimensions(recipe.size, recipe.geometry);
  if (dimensions.width * dimensions.height > 20000) throw new Error("This recipe exceeds the supported 20,000-tile work budget.");
  const candidates: World[] = [], summaries: CandidateSummary[] = [], failures: string[] = [];
  for (let i = 0; i < recipe.candidates; i++) {
    const seed = i ? `${recipe.seed.slice(0, 230)}:candidate-${i + 1}` : recipe.seed;
    progress(`Building foundation ${i + 1} of ${recipe.candidates}`, i, recipe.candidates);
    try {
      let world = nativeFoundation(recipe, seed, label => progress(`Foundation ${i + 1}: ${label}`, i, recipe.candidates));
      world.recipe.seed = recipe.seed;
      world.substrate.recipe.seed = recipe.seed;
      if (recipe.balance === "SYMMETRIC") { symmetry(world); world = finishWorld(world); }
      if (!compositionFits(world)) throw new Error("The resulting world exceeds the requested water or mountain ranges. Widen the range or reduce the intervention.");
      const improvements: string[] = [];
      for (let round = 0; round < recipe.development; round++) {
        const options = findProposals(world, [], label => progress(`Developing foundation ${i + 1}: ${label}`, i, recipe.candidates));
        if (!options.length) break;
        const developed = applyDevelopment(world, options[0]);
        if (!compositionFits(developed) || candidateRank(developed) <= candidateRank(world)) break;
        world = developed; improvements.push(options[0].title);
      }
      world.assessment.candidate = i + 1; world.assessment.attempts = recipe.candidates;
      candidates.push(world); summaries.push({ seed, selected: false, water: world.assessment.water, mountains: world.assessment.mountains, quality: { ...world.assessment.quality }, improvements, recipe: structuredClone(world.recipe), strokes: structuredClone(world.strokes), fingerprint: hash(JSON.stringify(world.map.tiles)).toString(36) });
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }
  if (!candidates.length) throw new Error(`No foundation met the requested constraints. ${failures.at(-1) ?? "Try wider ranges."}`);
  const frontier = candidates.filter(candidate => !candidates.some(other => other !== candidate && dominates(other, candidate)));
  frontier.sort((a, b) => candidateRank(b) - candidateRank(a) || a.substrate.seed.localeCompare(b.substrate.seed));
  const selected = frontier[0];
  selected.development.candidates = summaries.map(summary => ({ ...summary, selected: summary.seed === selected.substrate.seed }));
  selected.development.proposals = findProposals(selected, [], label => progress(label, recipe.candidates, recipe.candidates + 1));
  if (failures.length) selected.messages.push(`${failures.length} foundation${failures.length === 1 ? " was" : "s were"} rejected. ${failures.at(-1)}`);
  selected.messages.push(`Compared ${candidates.length} legal foundations; ${frontier.length} retained distinct combinations of geographic and strategic strengths.`);
  progress("World ready", 1, 1); return selected;
}
export function runJob(job: Job, progress: Progress = () => {}): World {
  if (job.kind === "GENERATE") return generateWorld(job.recipe, progress);
  if (job.kind === "RANDOMISE") {
    const rng = random(job.seed); let error = "";
    for (let attempt = 0; attempt < 6; attempt++) { try { return generateWorld(randomRecipe(rng), (label, completed, total) => progress(`Random world ${attempt + 1}: ${label}`, completed, total)); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); } }
    throw new Error(`Six randomized foundations could not meet their constraints. ${error}`);
  }
  const world = migrateWorld(job.world);
  progress("Developing the retained world", 0, 4);
  if (job.kind === "ALTERNATIVE") {
    const candidate = world.development.candidates.find(c => c.seed === job.seed);
    if (!candidate?.recipe || !candidate.fingerprint || !candidate.strokes) throw new Error("This earlier search did not retain a replayable foundation. Generate a new search to compare alternatives.");
    let result = nativeFoundation(candidate.recipe, candidate.seed, label => progress(label, 1, 4));
    result.recipe.seed = candidate.recipe.seed; result.substrate.recipe.seed = candidate.recipe.seed;
    if (candidate.recipe.balance === "SYMMETRIC") { symmetry(result); result = finishWorld(result); }
    for (const stroke of candidate.strokes) result = developWorld(result, result.recipe, stroke);
    if (hash(JSON.stringify(result.map.tiles)).toString(36) !== candidate.fingerprint) throw new Error("The saved foundation no longer reproduces under this generator version. The accepted world is retained.");
    result.development.candidates = world.development.candidates.map(c => ({ ...c, selected: c.seed === candidate.seed }));
    result.development.proposals = findProposals(result);
    result.assessment.candidate = world.development.candidates.indexOf(candidate) + 1;
    result.assessment.attempts = world.development.candidates.length;
    const changed = result.map.tiles.flatMap((tile, i) => JSON.stringify(tile) !== JSON.stringify(world.map.tiles[i]) ? [i] : []);
    result.development.changes = { direct: changed, dependent: [], retained: result.map.tiles.length - changed.length, affectedPlaces: world.features.map(feature => feature.id), explanation: ["This is a different foundation from the saved search. Keeping it replaces the current geography and retains the current world as a snapshot."] };
    result.assessment.quality.fidelity = Math.round((result.map.tiles.length - changed.length) / result.map.tiles.length * 100);
    return result;
  }
  if (job.kind === "REFINE") {
    const result = developWorld(world, job.recipe);
    result.development.proposals = findProposals(result, [], label => progress(label, 3, 4)); return result;
  }
  if (job.kind === "STROKE") return developWorld(world, world.recipe, job.stroke);
  if (job.kind === "DEVELOP") {
    if (!job.proposalId) { world.development.proposals = findProposals(world, job.selection, label => progress(label, 2, 4)); if (!world.development.proposals.length) world.messages.push("No legal local proposal improved the measured opportunities within these constraints. Try another place or a direct edit."); return world; }
    const proposal = world.development.proposals.find(p => p.id === job.proposalId); if (!proposal) throw new Error("This development proposal is no longer available. Reconsider the current world.");
    return applyDevelopment(world, proposal);
  }
  if (job.kind === "REBALANCE") {
    if (job.balance === "SYMMETRIC") { if (world.locked.length || world.protections.length) throw new Error("Rotational symmetry conflicts with protected places. Release protection or choose another balance policy."); symmetry({ ...world, recipe: { ...world.recipe, balance: job.balance } }); world.recipe.balance = job.balance; return finishWorld(world, job.world); }
    world.recipe.balance = job.balance;
    let result = world;
    for (let round = 0; round < Math.max(2, world.recipe.development); round++) { const proposals = findProposals(result, [], label => progress(label, round, Math.max(2, world.recipe.development))); if (!proposals.length) break; const candidate = applyDevelopment(result, proposals[0]); if (candidate.assessment.quality.opportunity <= result.assessment.quality.opportunity) break; result = candidate; }
    result.messages.push("Local developments target sampled geographic opportunities; actual Civ V starts and player choices remain uncertain."); return result;
  }
  const result = structuredClone(world), issues = buildRepairIssues(result.map);
  const repaired = applyRepairIssues(result.map, issues, new Set(job.issues));
  if (world.locked.some(i => JSON.stringify(repaired.tiles[i]) !== JSON.stringify(world.map.tiles[i]))) throw new Error("A selected repair conflicts with protected tiles.");
  const inferred = inferFields(repaired), changed = repaired.tiles.flatMap((tile, i) => JSON.stringify(tile) !== JSON.stringify(world.map.tiles[i]) ? [i] : []);
  for (const i of changed) {
    const correction: Stroke = { kind: "PAINT", tiles: [i], strength: 1 };
    for (const key of ["terrain", "elevation", "feature", "resource", "river", "wonder", "resourceAmount"] as const) if (repaired.tiles[i][key] !== world.map.tiles[i][key]) correction[key] = repaired.tiles[i][key];
    result.strokes.push(correction);
    for (const key of ["elevation", "moisture", "temperature", "drainage"] as const) result.fields[key][i] = inferred[key][i];
  }
  repaired.structure = markGenerationStructureStale(repaired.structure, "Selected repairs changed observed geography.");
  result.map = repaired; result.features = identifyFeatures(repaired, world.features, world.substrate.confidence === "INFERRED"); result.assessment = assess(repaired, world.recipe);
  result.development.proposals = []; result.development.changes = { direct: changed, dependent: [], retained: repaired.tiles.length - changed.length, affectedPlaces: [], explanation: ["Only selected repair mutations were applied; other findings remain visible."] };
  return result;
}
