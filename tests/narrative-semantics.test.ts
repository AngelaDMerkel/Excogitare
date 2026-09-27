import assert from "node:assert/strict";
import test from "node:test";
import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "../lib/civ5-map.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";
import { compileNarrativeConstraintProgram, type NarrativeProgramDefinition } from "../lib/narrative-constraints.ts";
import { narrativeProfile } from "../lib/narrative-map-types.ts";
import { compareNarrativeConfusions, evaluateNarrativeConstraintProgram, extractNarrativeSemantics, extractNarrativeSemanticsReference } from "../lib/narrative-semantics.ts";
import { riverEdgeDefinitions, setRiverEdge, type RiverEdgeBit } from "../lib/rivers.ts";

function fixtureMap(rows: string[], wraps = false): Civ5Map {
  const width = rows[0].length;
  assert.ok(rows.every((row) => row.length === width), "fixture rows must have equal width");
  const starts: Civ5StartLocation[] = [];
  const tiles: Civ5Tile[] = rows.join("").split("").map((character, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const base: Civ5Tile = { terrain: 2, elevation: 0, feature: 255, resource: 255, river: 0, continent: 0, wonder: 255, resourceAmount: 0 };
    if (character === "~") base.terrain = 0;
    if (character === "c") base.terrain = 1;
    if (character === "p") base.terrain = 3;
    if (character === "d") base.terrain = 4;
    if (character === "t") base.terrain = 5;
    if (character === "s") base.terrain = 6;
    if (character === "M") base.elevation = 2;
    if (character === "h") base.elevation = 1;
    if (character === "r") base.river = 1;
    if (character === "j") base.feature = 1;
    if (character === "m") base.feature = 2;
    if (character === "i") { base.terrain = 1; base.feature = 3; }
    if (character === "v") { base.resource = 0; base.resourceAmount = 1; }
    if (character === "W") base.wonder = 0;
    if (character === "A" || character === "B" || character === "C" || character === "x") starts.push({
      x,
      y,
      player: starts.length,
      civilization: character === "x" ? "City State" : `Civilization ${character}`,
      leader: character === "x" ? "Minor" : `Leader ${character}`,
      team: starts.length,
      playable: character !== "x",
      cityState: character === "x",
    });
    return base;
  });
  return {
    name: "Semantic fixture",
    description: "Hand-built Contract 2B fixture.",
    worldSize: "DUEL",
    version: 12,
    width,
    height: rows.length,
    players: starts.filter((start) => !start.cityState).length,
    wraps,
    terrains: ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW"],
    features: ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FALLOUT"],
    wonders: ["FEATURE_CRATER"],
    resources: ["RESOURCE_GOLD"],
    tiles,
    startLocations: starts,
    source: "generated",
  };
}

type FixtureRiverEdge = { owner: number; neighbor: number; bit: RiverEdgeBit; a: string; b: string };

/** Build a real Civ V edge path from a mountain vertex to a water vertex. */
function encodeFixtureRiver(map: Civ5Map) {
  const edges: FixtureRiverEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const vertexTiles = new Map<string, Set<number>>();
  const addVertexTile = (vertex: string, index: number) => {
    const values = vertexTiles.get(vertex) ?? new Set<number>();
    values.add(index);
    vertexTiles.set(vertex, values);
  };
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
    const owner = y * map.width + x;
    for (const definition of riverEdgeDefinitions(x, y)) {
      const nextX = x + definition.dx;
      const nextY = y + definition.dy;
      if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height) continue;
      const neighbor = nextY * map.width + nextX;
      for (const vertex of [definition.a, definition.b]) {
        addVertexTile(vertex, owner);
        addVertexTile(vertex, neighbor);
      }
      if (map.tiles[owner].terrain < 2 || map.tiles[neighbor].terrain < 2) continue;
      const edgeIndex = edges.length;
      edges.push({ owner, neighbor, bit: definition.bit, a: definition.a, b: definition.b });
      adjacency.set(definition.a, [...(adjacency.get(definition.a) ?? []), edgeIndex]);
      adjacency.set(definition.b, [...(adjacency.get(definition.b) ?? []), edgeIndex]);
    }
  }
  const touchesMountain = (vertex: string) => [...(vertexTiles.get(vertex) ?? [])]
    .some((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation === 2);
  const touchesWater = (vertex: string) => [...(vertexTiles.get(vertex) ?? [])]
    .some((index) => map.tiles[index].terrain < 2);
  for (const source of [...adjacency.keys()].filter(touchesMountain).sort()) {
    const queue = [source];
    const prior = new Map<string, { vertex: string; edgeIndex: number }>();
    const distance = new Map([[source, 0]]);
    let outlet: string | undefined;
    for (let cursor = 0; cursor < queue.length && !outlet; cursor += 1) {
      const vertex = queue[cursor];
      if ((distance.get(vertex) ?? 0) >= 2 && touchesWater(vertex)) {
        outlet = vertex;
        break;
      }
      for (const edgeIndex of adjacency.get(vertex) ?? []) {
        const edge = edges[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (distance.has(next)) continue;
        distance.set(next, (distance.get(vertex) ?? 0) + 1);
        prior.set(next, { vertex, edgeIndex });
        queue.push(next);
      }
    }
    if (!outlet) continue;
    const steps: Array<{ from: string; to: string; edgeIndex: number }> = [];
    for (let cursor = outlet; cursor !== source;) {
      const entry = prior.get(cursor);
      assert.ok(entry);
      steps.push({ from: entry.vertex, to: cursor, edgeIndex: entry.edgeIndex });
      cursor = entry.vertex;
    }
    for (const step of steps.reverse()) {
      const edge = edges[step.edgeIndex];
      map.tiles[edge.owner].river = setRiverEdge(map.tiles[edge.owner].river, edge.bit, edge.a === step.from && edge.b === step.to);
    }
    return;
  }
  assert.fail("fixture could not route a mountain-to-water Civ V river edge path");
}

test("cached semantic extraction is deeply identical to the uncached reference on exhaustive small masks and representative evidence", () => {
  for (const wraps of [false, true]) for (let mask = 0; mask < 2 ** 6; mask += 1) {
    const rows = Array.from({ length: 2 }, (_row, y) => Array.from({ length: 3 }, (_column, x) => mask & (1 << (y * 3 + x)) ? "g" : "~").join(""));
    const map = fixtureMap(rows, wraps);
    assert.deepEqual(extractNarrativeSemantics(map), extractNarrativeSemanticsReference(map), `3×2 mask ${mask} differed with wraps=${wraps}`);
  }

  const representative = fixtureMap([
    "~~Mgggg~~",
    "~ggggggg~",
    "gggAmmggg",
    "ggggggggg",
    "dddgggttt",
    "~ggggggg~",
    "~~gg~gg~~",
  ], true);
  encodeFixtureRiver(representative);
  assert.deepEqual(extractNarrativeSemantics(representative), extractNarrativeSemanticsReference(representative));
});

test("Contract 2B distinguishes enclosed water, edge oceans, true straits, and false notches", () => {
  const enclosed = extractNarrativeSemantics(fixtureMap([
    "ggggggg",
    "gg~~~gg",
    "gg~~~gg",
    "ggggggg",
    "ggggggg",
  ]));
  assert.equal(enclosed.metrics["enclosed-sea-count"]?.value, 1);
  assert.equal(enclosed.metrics["edge-ocean-share"]?.value, 0);

  const edgeOcean = extractNarrativeSemantics(fixtureMap([
    "~~~gggg",
    "~~~gggg",
    "ggggggg",
    "ggggggg",
    "ggggggg",
  ]));
  assert.equal(edgeOcean.metrics["enclosed-sea-count"]?.value, 0);
  assert.equal(edgeOcean.metrics["edge-ocean-share"]?.value, 1);

  const strait = extractNarrativeSemantics(fixtureMap([
    "~~~~~~~~~",
    "~~~~~~~~~",
    "gggg~gggg",
    "~~~~~~~~~",
    "~~~~~~~~~",
  ]));
  const notch = extractNarrativeSemantics(fixtureMap([
    "~~~~~~~~~",
    "~~~~~~~~~",
    "gggg~gggg",
    "ggggggggg",
    "ggggggggg",
  ]));
  assert.ok((strait.metrics["strait-count"]?.value ?? 0) >= 1);
  assert.equal(notch.metrics["strait-count"]?.value, 0);
  assert.ok(strait.objects.some((object) => object.kind === "STRAIT" && object.tileIndices.length <= 2));
});

test("Contract 2B recognizes canal isthmuses, peninsulas, mountain passes, and broken ranges", () => {
  const isthmus = extractNarrativeSemantics(fixtureMap([
    "gggg~gggg",
    "gggg~gggg",
    "~~~~g~~~~",
    "gggg~gggg",
    "gggg~gggg",
  ]));
  assert.ok((isthmus.metrics["canal-isthmus-count"]?.value ?? 0) >= 1);
  assert.ok((isthmus.metrics["strategic-corridor-count"]?.value ?? 0) >= 1);

  const peninsula = extractNarrativeSemantics(fixtureMap([
    "~~ggg~~~~",
    "~~ggg~~~~",
    "~~~~g~~~~",
    "ggggggggg",
    "ggggggggg",
  ]));
  assert.ok((peninsula.metrics["peninsula-count"]?.value ?? 0) >= 1);

  const relief = extractNarrativeSemantics(fixtureMap([
    "gggMggg",
    "gggMggg",
    "ggggggg",
    "gggMggg",
    "gggMggg",
  ]));
  assert.equal(relief.metrics["mountain-range-count"]?.value, 2);
  assert.ok((relief.metrics["mountain-pass-count"]?.value ?? 0) >= 1);
  assert.ok((relief.metrics["broken-range-count"]?.value ?? 0) >= 1);
});

test("Contract 2B separates valid open and endorheic watersheds from invalid drainage", () => {
  const openMap = fixtureMap([
    "ggMgg",
    "ggggg",
    "ggggg",
    "ggggg",
    "gg~gg",
  ]);
  encodeFixtureRiver(openMap);
  const open = extractNarrativeSemantics(openMap);
  assert.equal(open.metrics["watershed-count"]?.value, 1);
  assert.equal(open.metrics["valid-watershed-share"]?.value, 1);
  assert.equal(open.metrics["endorheic-watershed-count"]?.value, 0);

  const endorheicMap = fixtureMap([
    "ggMgg",
    "ggggg",
    "ggggg",
    "gg~gg",
    "ggggg",
  ]);
  encodeFixtureRiver(endorheicMap);
  const endorheic = extractNarrativeSemantics(endorheicMap);
  assert.equal(endorheic.metrics["valid-watershed-share"]?.value, 1);
  assert.equal(endorheic.metrics["endorheic-watershed-count"]?.value, 1);

  const invalidMap = fixtureMap([
    "ggggg",
    "ggggg",
    "ggggg",
    "ggggg",
    "ggggg",
  ]);
  const invalidOwner = 2 * invalidMap.width + 2;
  invalidMap.tiles[invalidOwner].river = setRiverEdge(setRiverEdge(0, 1, true), 2, true);
  const invalid = extractNarrativeSemantics(invalidMap);
  assert.equal(invalid.metrics["watershed-count"]?.value, 1);
  assert.equal(invalid.metrics["valid-watershed-share"]?.value, 0);
});

test("Contract 2B keeps adjacent river-owning plots separate when their encoded edges do not join", () => {
  const map = fixtureMap([
    "ggggggg",
    "ggggggg",
    "ggggggg",
    "ggggggg",
    "ggggggg",
  ]);
  for (const x of [2, 3, 4]) {
    const owner = 3 * map.width + x;
    map.tiles[owner].river = setRiverEdge(setRiverEdge(0, 1, true), 2, true);
  }
  const semantics = extractNarrativeSemantics(map);
  assert.equal(semantics.metrics["watershed-count"]?.value, 3);
  assert.equal(semantics.metrics["valid-watershed-share"]?.value, 0);
});

test("Contract 2B measures rain shadows, hostile refuges, value gradients, and start realms without mutation", () => {
  const map = fixtureMap([
    "jjjMdddgg",
    "AjjMdddgB",
    "jjjMdddvg",
    "gggggggxg",
  ]);
  const before = structuredClone(map);
  const first = extractNarrativeSemantics(map);
  const second = extractNarrativeSemantics(map);
  assert.deepEqual(map, before);
  assert.deepEqual(first, second);
  assert.equal(first.inputHash, second.inputHash);
  assert.ok((first.metrics["rain-shadow-count"]?.value ?? 0) >= 1);
  assert.ok((first.metrics["hostile-frontier-share"]?.value ?? 0) > 0);
  assert.ok((first.metrics["refuge-count"]?.value ?? 0) >= 1);
  assert.ok((first.metrics["value-gradient"]?.value ?? 0) > 0);
  assert.equal(first.metrics["start-realm-count"]?.value, 1);
  assert.equal(first.metrics["city-state-region-count"]?.value, 1);
  assert.ok((first.metrics["minimum-start-distance"]?.value ?? 0) >= 5);
});

test("Contract 2B applies the selected wrap model at the map boundary", () => {
  const rows = [
    "~ggggg~",
    "~ggggg~",
    "~ggggg~",
    "~ggggg~",
  ];
  const flat = extractNarrativeSemantics(fixtureMap(rows, false));
  const wrapped = extractNarrativeSemantics(fixtureMap(rows, true));
  assert.equal(flat.metrics["water-body-count"]?.value, 2);
  assert.equal(wrapped.metrics["water-body-count"]?.value, 1);
  assert.notEqual(flat.inputHash, wrapped.inputHash);
});

function evaluationDefinition(profileId: "INLAND_SEAS" | "CONTINENTS", engine: "EXCOGITARE", openOcean: boolean): NarrativeProgramDefinition {
  const constraintId = openOcean ? "open-ocean" : "enclosed-water";
  return {
    schemaVersion: 1,
    profileId,
    engine,
    essential: [{
      id: constraintId,
      label: openOcean ? "Open ocean" : "Enclosed water",
      semanticKey: openOcean ? "open-ocean" : "enclosed-water",
      scope: "MAP",
      roles: [openOcean ? "edge-ocean" : "enclosed-sea"],
      weight: 1,
      tolerance: 0.1,
      scaleLaw: "AREA",
      relaxable: true,
    }],
    preferred: [],
    prohibited: [],
    relaxationOrder: [{ id: "weaken-water-identity", label: "Weaken water identity", constraintIds: [constraintId], consequence: "The principal water relationship becomes less legible." }],
    requiredEvidence: [{
      id: `${constraintId}-evidence`,
      constraintId,
      measureKey: openOcean ? "edge-ocean-share" : "enclosed-sea-count",
      operator: "AT_LEAST",
      target: openOcean ? 0.5 : 1,
      minimumConfidence: 0.9,
    }],
  };
}

test("Contract 2B enforces the essential floor and compares nearest confusions on one model", () => {
  const map = fixtureMap([
    "ggggggg",
    "gg~~~gg",
    "gg~~~gg",
    "ggggggg",
    "ggggggg",
  ]);
  const model = extractNarrativeSemantics(map);
  const inlandRecipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine: "EXCOGITARE", preset: "INLAND_SEAS", size: "DUEL", players: 2, cityStates: 0, waterPercent: 24, mountainPercent: 13, seed: "semantic-evaluation" });
  const continentsRecipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine: "EXCOGITARE", preset: "CONTINENTS", size: "DUEL", players: 2, cityStates: 0, waterPercent: 58, mountainPercent: 12, seed: "semantic-evaluation" });
  const inland = compileNarrativeConstraintProgram(evaluationDefinition("INLAND_SEAS", "EXCOGITARE", false), narrativeProfile("INLAND_SEAS"), inlandRecipe, { width: map.width, height: map.height, wraps: false });
  const ocean = compileNarrativeConstraintProgram(evaluationDefinition("CONTINENTS", "EXCOGITARE", true), narrativeProfile("CONTINENTS"), continentsRecipe, { width: map.width, height: map.height, wraps: false });
  const intended = evaluateNarrativeConstraintProgram(inland, model);
  const wrong = evaluateNarrativeConstraintProgram(ocean, model);
  const comparison = compareNarrativeConfusions(inland, [ocean], model);

  assert.equal(intended.status, "SATISFIED");
  assert.equal(intended.essentialFloorMet, true);
  assert.equal(wrong.status, "FAILED");
  assert.equal(wrong.essentialFloorMet, false);
  assert.equal(comparison.risk, "LOW");
  assert.ok(comparison.scoreMargin >= 50);

  const relaxed = evaluateNarrativeConstraintProgram(ocean, model, ["weaken-water-identity"]);
  assert.equal(relaxed.status, "WEAKENED");
  assert.equal(relaxed.findings[0].status, "WEAK");
  assert.equal(relaxed.appliedRelaxations[0], "weaken-water-identity");
});

test("Contract 2B extracts deterministic legal-normalized semantics from every engine", () => {
  for (const [engine, preset] of [["EXCOGITARE", "CONTINENTS"], ["ECCENTRIC", "GREAT_WATERSHEDS"], ["PHYSICAL", "DYNAMIC_EARTH"], ["POLIS", "IMPERIAL_RING"]] as const) {
    const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine, preset, size: "DUEL", players: 2, cityStates: 1, seed: `contract-two-b-${engine.toLowerCase()}` });
    const before = structuredClone(map);
    const first = extractNarrativeSemantics(map);
    const second = extractNarrativeSemantics(map);
    assert.deepEqual(map, before);
    assert.deepEqual(first, second);
    assert.equal(first.stage, "LEGAL_NORMALIZED");
    assert.ok(first.objects.length > 0);
    assert.ok(Object.keys(first.metrics).length >= 30);
  }
});
