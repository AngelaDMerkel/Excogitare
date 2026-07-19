import type { Civ5Map, Civ5StartLocation } from "./civ5-map.ts";
import type { GenerationRecipe, VictoryCondition } from "./generation-recipe.ts";
import type { MatchFeasibilityAssessment, VictoryFeasibilityFinding } from "./generation-structure.ts";

const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

function hexDistance(one: Civ5StartLocation, two: Civ5StartLocation, width: number, wraps: boolean) {
  const cube = (point: { x: number; y: number }) => { const q = point.x - (point.y - (point.y & 1)) / 2; return [q, -q - point.y, point.y]; };
  const direct = (a: { x: number; y: number }, b: { x: number; y: number }) => { const ac = cube(a); const bc = cube(b); return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2])); };
  if (!wraps) return direct(one, two);
  return Math.min(direct(one, two), direct({ x: one.x - width, y: one.y }, two), direct({ x: one.x + width, y: one.y }, two));
}

function neighbors(index: number, map: Civ5Map) {
  const x = index % map.width; const y = Math.floor(index / map.width);
  const offsets = y % 2 === 0 ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => { let nextX = x + dx; const nextY = y + dy; if (map.wraps) nextX = (nextX + map.width) % map.width; return nextX >= 0 && nextX < map.width && nextY >= 0 && nextY < map.height ? [nextY * map.width + nextX] : []; });
}

function within(start: Civ5StartLocation, map: Civ5Map, radius: number) {
  const visited = new Set([start.y * map.width + start.x]); let frontier = [...visited];
  for (let step = 0; step < radius; step += 1) frontier = frontier.flatMap((index) => neighbors(index, map).filter((next) => { if (visited.has(next)) return false; visited.add(next); return true; }));
  return [...visited];
}

function genericMetrics(map: Civ5Map) {
  const majors = map.startLocations.filter((start) => !start.cityState);
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const local = majors.map((start) => within(start, map, 5));
  const nearestOpponent = majors.map((start) => Math.min(...majors.filter((other) => other.player !== start.player).map((other) => hexDistance(start, other, map.width, map.wraps))));
  const strategicAccess = local.filter((indices) => indices.some((index) => map.tiles[index].resource >= 5 && map.tiles[index].resource <= 10)).length / Math.max(1, majors.length);
  const luxuryAccess = local.filter((indices) => indices.some((index) => map.tiles[index].resource >= 11 && map.tiles[index].resource !== 255)).length / Math.max(1, majors.length);
  const productiveTiles = local.reduce((sum, indices) => sum + indices.filter((index) => map.tiles[index].terrain >= 2 && (map.tiles[index].elevation === 1 || map.tiles[index].terrain === 2)).length, 0) / Math.max(1, majors.length);
  const contestability = cityStates.length && majors.length > 1 ? cityStates.reduce((sum, cityState) => { const distances = majors.map((major) => hexDistance(cityState, major, map.width, map.wraps)).sort((one, two) => one - two); return sum + clamp(1 - Math.abs(distances[1] - distances[0]) / Math.max(4, distances[1])); }, 0) / cityStates.length : 0;
  return {
    majors: majors.length,
    cityStates: cityStates.length,
    averageCapitalDistance: nearestOpponent.length ? nearestOpponent.reduce((sum, value) => sum + value, 0) / nearestOpponent.length : 0,
    strategicAccess,
    luxuryAccess,
    productiveTiles,
    cityStateContestability: contestability,
    landTilesPerPlayer: map.tiles.filter((tile) => tile.terrain >= 2).length / Math.max(1, majors.length),
    coastalStarts: majors.filter((start) => neighbors(start.y * map.width + start.x, map).some((index) => map.tiles[index].terrain < 2)).length,
  };
}

export function assessMatchIntent(map: Civ5Map, recipe: GenerationRecipe): MatchFeasibilityAssessment {
  const graph = map.structure?.strategicGraph;
  if (graph) return { schemaVersion: 1, engine: "POLIS", summary: `${graph.mapType.replaceAll("_", " ").toLowerCase()} was compiled against the retained Match Intent; each victory remains a separate structural finding.`, victories: graph.victoryFeasibility.map((finding) => ({ ...finding, evidence: [...finding.evidence], metrics: { ...finding.metrics } })), metrics: { ...graph.metrics }, limitations: ["Geography can support a victory path but cannot alter Civ V victory rules or guarantee AI decisions."] };
  const metrics = genericMetrics(map);
  const intent = recipe.matchIntent;
  const state = (victory: VictoryCondition) => !intent.enabledVictories.includes(victory) ? "DISABLED" as const : intent.emphasizedVictories.includes(victory) ? "EMPHASIZED" as const : "ENABLED" as const;
  const raw: Record<VictoryCondition, { score: number; evidence: string[] }> = {
    DOMINATION: { score: clamp(0.45 + metrics.averageCapitalDistance / 45 + metrics.strategicAccess * 0.22), evidence: [`Nearest rival capitals average ${metrics.averageCapitalDistance.toFixed(1)} hexes apart.`, `${Math.round(metrics.strategicAccess * 100)}% of starts can reach a strategic resource within five hexes.`] },
    SCIENCE: { score: clamp(0.35 + metrics.productiveTiles / 42 + metrics.strategicAccess * 0.28), evidence: [`Starts average ${metrics.productiveTiles.toFixed(1)} productive grassland or hill tiles within five hexes.`, `${Math.round(metrics.strategicAccess * 100)}% have local strategic access.`] },
    CULTURE: { score: clamp(0.38 + metrics.luxuryAccess * 0.28 + Math.min(0.25, metrics.averageCapitalDistance / 50)), evidence: [`${Math.round(metrics.luxuryAccess * 100)}% of starts have a local luxury.`, `Capital spacing provides ${metrics.averageCapitalDistance.toFixed(1)} hexes of average defensive and trade context.`] },
    DIPLOMACY: { score: clamp(0.28 + metrics.cityStateContestability * 0.42 + Math.min(0.25, metrics.cityStates / Math.max(1, metrics.majors) * 0.2)), evidence: [`${Math.round(metrics.cityStateContestability * 100)}% mean city-state contestability measures whether minor powers are shared rather than private.`, `${metrics.cityStates} city states serve ${metrics.majors} major civilizations.`] },
    TIME: { score: clamp(0.38 + metrics.landTilesPerPlayer / 260 + metrics.productiveTiles / 80), evidence: [`Each major has roughly ${Math.round(metrics.landTilesPerPlayer)} land tiles of world capacity.`, `Starts average ${metrics.productiveTiles.toFixed(1)} productive nearby tiles.`] },
  };
  const strictnessShift = intent.competitiveStrictness === "CASUAL" ? 5 : intent.competitiveStrictness === "TOURNAMENT" ? -5 : 0;
  const victories = (Object.keys(raw) as VictoryCondition[]).map<VictoryFeasibilityFinding>((victory) => { const score = Math.max(0, Math.min(100, Math.round(raw[victory].score * 100) + strictnessShift)); return { victory, state: state(victory), status: score >= 65 ? "SUPPORTED" : score >= 45 ? "WEAK" : "BLOCKED", score, evidence: raw[victory].evidence, metrics: { score } }; });
  return { schemaVersion: 1, engine: map.structure?.engine ?? recipe.engine, summary: "This non-Polis report measures final starts, resources, city-state access, production and territorial capacity; it does not pretend the world was constructed as a strategic graph.", victories, metrics, limitations: ["Capital route redundancy and front width are available only when Polis retains a strategic graph.", "Human and AI counts describe lobby composition; fixed civilization seats require Scenario authoring."] };
}

export function attachMatchIntentAssessment(map: Civ5Map, recipe: GenerationRecipe) {
  if (!map.structure) return map;
  return { ...map, structure: { ...map.structure, matchAssessment: assessMatchIntent(map, recipe) } };
}
