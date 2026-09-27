import { isWaterTerrain } from "../civ5-rules.ts";
import { markGenerationStructureStale } from "../generation-structure.ts";
import { assess, movementCost } from "./assessment.ts";
import { realizeSurface, identifyFeatures } from "./geography.ts";
import { updateContent } from "./content.ts";
import { symmetry } from "./arena.ts";
import { validateWorld, validateDevelopedRivers } from "./validation.ts";
import { adjacency, paths, region, tileDistance, trace } from "./spatial.ts";
import { hash, validateRecipe, type Proposal, type Stroke, type StudioRecipe, type World } from "./model.ts";

export function assessWorld(world: World) {
  const assessment = assess(world.map, world.recipe);
  const original = world.substrate.places.filter(p => ["LAND", "WATER", "RIVER", "RANGE"].includes(p.kind));
  assessment.quality.identity = original.length ? Math.round(original.filter(place => world.features.some(p => p.id === place.id)).length / original.length * 100) : 100;
  assessment.quality.fidelity = Math.round(world.development.changes.retained / world.map.tiles.length * 100);
  return assessment;
}
export function finishWorld(world: World, previous?: World) {
  const issues = validateWorld(world); if (issues.length) throw new Error(`The proposed geography is not legal: ${issues[0]}`);
  world.features = identifyFeatures(world.map, previous?.features ?? world.features, world.substrate.confidence === "INFERRED");
  if (previous) {
    const changed = world.map.tiles.flatMap((t, i) => JSON.stringify(t) !== JSON.stringify(previous.map.tiles[i]) ? [i] : []), changedSet = new Set(changed), direct = new Set(world.development.changes.direct);
    world.development.changes = { ...world.development.changes, direct: changed.filter(i => direct.has(i)), dependent: changed.filter(i => !direct.has(i)), retained: world.map.tiles.length - changed.length, affectedPlaces: previous.features.filter(f => f.tiles.some(i => changedSet.has(i))).map(f => f.id) };
    if (changed.length) world.map.structure = markGenerationStructureStale(world.map.structure, "Local development supersedes earlier native proof; original causes and plans remain available.");
  }
  world.assessment = assessWorld(world);
  world.messages = [...new Set(world.messages)].slice(-24);
  return world;
}
export function developWorld(source: World, recipe: StudioRecipe, stroke?: Stroke) {
  validateRecipe(recipe);
  if (["size", "geometry", "landscape", "wraps", "character", "seed"].some(key => recipe[key as keyof StudioRecipe] !== source.recipe[key as keyof StudioRecipe])) throw new Error("The premise, world character, seed, dimensions and wrapping define a new world. Generate a new world for these changes.");
  if (stroke && (!stroke.tiles.length || stroke.tiles.some(i => !Number.isInteger(i) || i < 0 || i >= source.map.tiles.length))) throw new Error("Select a valid region before developing it.");
  if (stroke?.tiles.some(i => source.locked.includes(i))) throw new Error("This selection touches protected tiles. Release protection or choose another region.");
  if (!stroke && JSON.stringify(recipe) === JSON.stringify(source.recipe)) return structuredClone(source);
  const result = structuredClone(source); if (stroke) result.strokes.push(structuredClone(stroke));
  result.recipe = structuredClone(recipe); result.development.proposals = [];
  const rebuilt = realizeSurface(result, recipe);
  result.map = rebuilt.map; result.fields = rebuilt.fields;
  if (!result.map.scenarioDataPresent) result.map.players = recipe.players;
  result.development.causes = [source.development.causes[0], ...rebuilt.causes];
  result.development.changes = { direct: rebuilt.direct, dependent: rebuilt.dependent, retained: result.map.tiles.length - rebuilt.direct.length - rebuilt.dependent.length, affectedPlaces: [], explanation: ["Changes were replayed from the retained foundation. Unaffected tiles and independent river systems retain their accepted state."] };
  updateContent(result, source);
  if (recipe.balance === "SYMMETRIC") {
    if (result.locked.length || result.protections.length) throw new Error("Rotational symmetry conflicts with protected places.");
    symmetry(result);
  }
  for (const i of source.locked) if (JSON.stringify(result.map.tiles[i]) !== JSON.stringify(source.map.tiles[i])) throw new Error(`A dependent change conflicts with protected tile ${i}.`);
  const oldRiverFailures = validateDevelopedRivers(source).length, riverFailures = validateDevelopedRivers(result);
  if (riverFailures.length > oldRiverFailures) throw new Error(riverFailures[0]);
  return finishWorld(result, source);
}
function candidateStrokes(world: World, selection: number[] = []): Array<Omit<Proposal, "id" | "gain" | "changed" | "effects">> {
  const { map, assessment } = world, graph = adjacency(map), locked = new Set(world.locked), options: Array<Omit<Proposal, "id" | "gain" | "changed" | "effects">> = [];
  const selected = new Set(selection);
  const location = (tiles: number[]) => {
    const x = tiles.reduce((sum, i) => sum + i % map.width, 0) / Math.max(1, tiles.length) / map.width;
    const y = tiles.reduce((sum, i) => sum + Math.floor(i / map.width), 0) / Math.max(1, tiles.length) / map.height;
    const horizontal = x < .36 ? "west" : x > .64 ? "east" : "", vertical = y < .36 ? "south" : y > .64 ? "north" : "";
    return vertical && horizontal ? `${vertical}${horizontal}ern` : vertical ? `${vertical}ern` : horizontal ? `${horizontal}ern` : "central";
  };
  const places = assessment.opportunities.filter(s => !selection.length || selected.has(s.tile)).sort((a, b) => a.value - b.value);
  for (const site of places.slice(0, 3)) {
    const tiles = region(graph, [site.tile], 2).filter(i => !locked.has(i) && !isWaterTerrain(map, map.tiles[i]) && map.tiles[i].elevation < 2 && world.fields.moisture[i] < .64 && world.fields.temperature[i] > .2);
    if (tiles.length) options.push({ title: `Develop the ${location(tiles)} valley`, reason: "This settlement area has fewer productive options than other plausible regions. Local moisture can support a broader valley economy.", tradeoff: "More productive land may become more attractive to rivals; the enclosing relief and coastline stay intact.", stroke: { kind: "WET", strength: .6, tiles } });
  }
  const sites = assessment.layouts[0]?.sites ?? [];
  const walk = movementCost(map, "LAND");
  for (let a = 0; a < Math.min(4, sites.length); a++) for (let b = a + 1; b < Math.min(4, sites.length); b++) {
    const current = paths(graph, [sites[a]], walk), route = trace(current.previous, sites[b]);
    const forbidden = new Set(route.filter(i => tileDistance(map, i, sites[a]) > 3 && tileDistance(map, i, sites[b]) > 3));
    const proposed = paths(graph, [sites[a]], (i, j) => locked.has(j) || isWaterTerrain(map, map.tiles[j]) || forbidden.has(j) ? Infinity : map.tiles[j].elevation === 2 ? 8 : Math.max(1, walk(i, j)));
    if (!Number.isFinite(proposed.distance[sites[b]])) continue;
    const tiles = trace(proposed.previous, sites[b]).filter(i => map.tiles[i].elevation === 2);
    if (tiles.length && tiles.length < Math.min(map.width, map.height) / 2 && (!selection.length || tiles.some(i => selected.has(i)))) options.push({ title: `Open a ${location(tiles)} saddle`, reason: "A second overland approach can connect settlement regions without relocating their main landforms.", tradeoff: "The new passage increases access and exposes previously sheltered land. Downstream drainage may adjust.", stroke: { kind: "PASS", strength: .65, tiles } });
    if (options.length >= 6) return options;
  }
  return options;
}
export function findProposals(world: World, selection: number[] = [], progress: (label: string) => void = () => {}): Proposal[] {
  const proposals: Proposal[] = [], baseline = world.assessment;
  for (const option of candidateStrokes(world, selection).slice(0, 5)) {
    progress(`Considering: ${option.title}`);
    try {
      const result = developWorld(world, world.recipe, option.stroke);
      const openingGain = baseline.sampleSpread - result.assessment.sampleSpread;
      const routeGain = result.assessment.stages[0].reachablePairs - baseline.stages[0].reachablePairs;
      const narrowGain = baseline.findings.filter(f => f.id.startsWith("front")).length - result.assessment.findings.filter(f => f.id.startsWith("front")).length;
      const productivityGain = result.assessment.fertileShare - baseline.fertileShare;
      const strategicGain = result.assessment.quality.opportunity - baseline.quality.opportunity;
      const gain = world.recipe.balance === "OPENING" ? openingGain : option.stroke.kind === "PASS" ? routeGain * 12 + narrowGain * 5 + strategicGain : world.recipe.balance === "STRATEGIC" || world.recipe.foundation === "GAMEPLAY" ? strategicGain + openingGain * .25 : openingGain + productivityGain * .8;
      const changed = result.development.changes.direct.length + result.development.changes.dependent.length;
      const useful = gain > .05 || productivityGain > .05 || routeGain > 0 || narrowGain > 0;
      if (changed && useful && result.assessment.quality.coherence >= baseline.quality.coherence && result.assessment.quality.identity >= baseline.quality.identity - 20) proposals.push({ ...option, id: `proposal:${hash(JSON.stringify(option.stroke)).toString(36)}`, gain: Math.round(gain * 10) / 10, changed,
        tradeoff: `${option.tradeoff}${openingGain < -.5 ? ` Opening spread would increase by ${(-openingGain).toFixed(1)} percentage points.` : ""}`,
        effects: [
          { label: "Opening spread (%)", before: Math.round(baseline.sampleSpread), after: Math.round(result.assessment.sampleSpread) },
          { label: "Productive land (%)", before: Math.round(baseline.fertileShare), after: Math.round(result.assessment.fertileShare) },
          { label: "Land connections", before: baseline.stages[0].reachablePairs, after: result.assessment.stages[0].reachablePairs },
        ],
      });
    } catch { /* A conflicting proposal is excluded; the accepted world is untouched. */ }
  }
  return proposals.sort((a, b) => b.gain - a.gain || a.changed - b.changed).slice(0, 3);
}
export function applyDevelopment(world: World, proposal: Proposal) {
  const result = developWorld(world, world.recipe, proposal.stroke);
  result.development.changes.explanation.push(proposal.reason, proposal.tradeoff);
  result.label = proposal.title; return result;
}
