import assert from "node:assert/strict";
import test from "node:test";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../lib/excogitare-project.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMapFromRecipe, randomGenerationRecipe } from "../lib/map-generator.ts";

function recipeFor(mapType: "IMPERIAL_RING" | "OPPOSING_FRONTS" | "CONTESTED_HEARTLAND" | "RIVAL_CONTINENTS" | "THREE_REALMS" | "THALASSIC_LEAGUE" | "UNEQUAL_REALMS") {
  const players = mapType === "THREE_REALMS" ? 6 : mapType === "UNEQUAL_REALMS" ? 8 : 6;
  const recipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS", preset: mapType, size: "SMALL", players, cityStates: 5, waterPercent: mapType === "THALASSIC_LEAGUE" ? 62 : mapType === "RIVAL_CONTINENTS" ? 54 : 32, seed: `match-intent-${mapType.toLowerCase()}` });
  recipe.matchIntent.humanPlayers = 2;
  recipe.matchIntent.aiPlayers = 2;
  recipe.matchIntent.flexiblePlayers = players - 4;
  return recipe;
}

test("Three Realms exposes exactly three mutually connected realms and discloses count normalization", () => {
  const compatible = generateMapFromRecipe(recipeFor("THREE_REALMS"));
  const graph = compatible.structure!.strategicGraph!;
  assert.equal(new Set(graph.nodes.filter((node) => node.kind === "MAJOR_START").map((node) => node.team)).size, 3);
  assert.equal(graph.metrics.realmContactPairs, 3);

  const odd = recipeFor("THREE_REALMS");
  odd.matchIntent.flexiblePlayers = 3;
  const normalized = generateMapFromRecipe(odd);
  assert.equal(normalized.startLocations.filter((start) => !start.cityState).length, 6);
  assert.match(normalized.structure!.strategicGraph!.relaxations.join(" "), /normalized 7 major civilizations to 6/);
});

test("Strong AI accommodation widens routes and never removes redundancy", () => {
  const normal = recipeFor("OPPOSING_FRONTS");
  normal.matchIntent.aiPlayers = 4;
  normal.matchIntent.humanPlayers = 2;
  normal.matchIntent.flexiblePlayers = 0;
  normal.matchIntent.aiAccommodation = "NORMAL";
  const strong = structuredClone(normal);
  strong.matchIntent.aiAccommodation = "STRONG";
  const normalGraph = generateMapFromRecipe(normal).structure!.strategicGraph!;
  const strongGraph = generateMapFromRecipe(strong).structure!.strategicGraph!;
  assert.ok(strongGraph.metrics.averageRouteWidth > normalGraph.metrics.averageRouteWidth);
  assert.ok(strongGraph.metrics.routeRedundancy >= normalGraph.metrics.routeRedundancy);
});

test("an explicit advanced seat plan controls retained start ownership and teams", () => {
  const recipe = recipeFor("IMPERIAL_RING");
  recipe.matchIntent.seats = [
    { control: "HUMAN", team: 0 }, { control: "AI", team: 1 }, { control: "AI", team: 1 },
    { control: "HUMAN", team: 0 }, { control: "FLEXIBLE", team: 2 }, { control: "FLEXIBLE", team: 2 },
  ];
  const majors = generateMapFromRecipe(recipe).structure!.strategicGraph!.nodes.filter((node) => node.kind === "MAJOR_START");
  assert.deepEqual(majors.map((node) => node.control), recipe.matchIntent.seats.map((seat) => seat.control));
  assert.deepEqual(majors.map((node) => node.team), recipe.matchIntent.seats.map((seat) => seat.team));
});

test("victory emphasis changes Polis geography and is retained as separate feasibility evidence", () => {
  const ordinary = recipeFor("CONTESTED_HEARTLAND");
  const emphasized = structuredClone(ordinary);
  emphasized.matchIntent.emphasizedVictories = ["SCIENCE", "DOMINATION"];
  const ordinaryMap = generateMapFromRecipe(ordinary);
  const emphasizedMap = generateMapFromRecipe(emphasized);
  const ordinaryGraph = ordinaryMap.structure!.strategicGraph!;
  const emphasizedGraph = emphasizedMap.structure!.strategicGraph!;
  assert.ok(emphasizedGraph.metrics.safeTilesPerPlayer > ordinaryGraph.metrics.safeTilesPerPlayer);
  assert.ok(emphasizedGraph.edges.length >= ordinaryGraph.edges.length);
  assert.equal(emphasizedGraph.victoryFeasibility.find((item) => item.victory === "SCIENCE")?.state, "EMPHASIZED");
  assert.equal(emphasizedGraph.victoryFeasibility.find((item) => item.victory === "DOMINATION")?.state, "EMPHASIZED");
  assert.equal(emphasizedGraph.victoryFeasibility.length, 5);
});

test("Thalassic League creates coastal starts and a redundant naval network", () => {
  const map = generateMapFromRecipe(recipeFor("THALASSIC_LEAGUE"));
  const graph = map.structure!.strategicGraph!;
  assert.ok(graph.metrics.navalRoutes >= map.players);
  assert.ok(graph.metrics.routeRedundancy >= Math.floor(map.players / 2));
  for (const start of map.startLocations.filter((item) => !item.cityState)) {
    const adjacent = [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]].some(([dx, dy]) => {
      const x = start.x + dx; const y = start.y + dy;
      return x >= 0 && x < map.width && y >= 0 && y < map.height && map.tiles[y * map.width + x].terrain < 2;
    });
    assert.ok(adjacent, `Player ${start.player + 1} lacks a port coast`);
  }
});

test("Unequal Realms has four disclosed roles and never appears in ordinary Randomise", () => {
  const recipe = recipeFor("UNEQUAL_REALMS");
  recipe.matchIntent.competitiveStrictness = "ASYMMETRIC";
  const graph = generateMapFromRecipe(recipe).structure!.strategicGraph!;
  assert.deepEqual(new Set(graph.realmRoles.map((role) => role.role)), new Set(["TALL", "WIDE", "WAR", "TURTLE"]));
  let state = 91;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let index = 0; index < 500; index += 1) assert.notEqual(randomGenerationRecipe(random, true).mapType, "UNEQUAL_REALMS");
});

test("project round trips retain Match Intent, roles, and victory feasibility", () => {
  const recipe = recipeFor("THALASSIC_LEAGUE");
  recipe.matchIntent.emphasizedVictories = ["DIPLOMACY"];
  recipe.matchIntent.aiAccommodation = "STRONG";
  const map = generateMapFromRecipe(recipe);
  const project = createExcogitareProject({ projectName: "Polis evidence", map, recipe, excogitareVersion: "1.3.0", now: "2026-07-18T00:00:00.000Z" });
  const restored = parseExcogitareProject(serializeExcogitareProject(project));
  assert.deepEqual(restored.recipe.matchIntent, recipe.matchIntent);
  assert.deepEqual(restored.map.structure?.strategicGraph?.realmRoles, map.structure?.strategicGraph?.realmRoles);
  assert.deepEqual(restored.map.structure?.strategicGraph?.victoryFeasibility, map.structure?.strategicGraph?.victoryFeasibility);
});
