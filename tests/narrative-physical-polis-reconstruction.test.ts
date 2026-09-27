import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, generateMapFromRecipe, MAP_PRESETS, rebindNarrativeAdapterToFinalNativeObjects, type MapGenerationOptions } from "../lib/map-generator.ts";
import { generatePhysicalGeography } from "../lib/physical-generator.ts";
import { generatePolisGeography } from "../lib/polis-generator.ts";
import type { GenerationConstraintAdapter, GenerationConstraintPayload, NativeSemanticConstraint } from "../lib/generation-constraints.ts";
import type { Civ5Tile } from "../lib/civ5-map.ts";
import { generationRecipeFromOptions, type WorldScale } from "../lib/generation-recipe.ts";
import { provePhysicalPolisNativeFacts } from "../lib/narrative-native-physical-polis-proof.ts";
import { inspectCiv5MapStructure, serializeCiv5Map } from "../lib/civ5-map.ts";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function constraintPayload(width: number, height: number, adapter: GenerationConstraintAdapter, semantics: NativeSemanticConstraint[]): GenerationConstraintPayload {
  const area = width * height;
  return {
    schemaVersion: 1,
    width,
    height,
    adapter,
    topology: new Int8Array(area).fill(-1),
    elevation: new Int8Array(area).fill(-1),
    terrain: new Int16Array(area).fill(-1),
    feature: new Int16Array(area).fill(-1),
    hydrologyMask: new Uint8Array(area),
    rivers: new Uint8Array(area),
    contentMask: new Uint8Array(area),
    startsMask: new Uint8Array(area),
    scenarioMask: new Uint8Array(area),
    semantics,
    sourceStarts: [],
    constrainedChannels: [],
  };
}

function adjacentIndices(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width;
  const y = Math.floor(index / width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    return nextX >= 0 && nextX < width && nextY >= 0 && nextY < height ? [nextY * width + nextX] : [];
  });
}

function passableComponentSize(tiles: Civ5Tile[], origin: number, width: number, height: number, wraps: boolean) {
  if (tiles[origin].terrain < 2 || tiles[origin].elevation >= 2) return 0;
  const reached = new Set([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of adjacentIndices(queue[cursor], width, height, wraps)) {
      if (reached.has(next) || tiles[next].terrain < 2 || tiles[next].elevation >= 2) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached.size;
}

function assertRetainedAdapterBindingsExist(map: ReturnType<typeof generateMap>, label: string) {
  const objects = new Map(map.structure!.objects.map((object) => [object.id, object]));
  const retained = map.structure!.narrativeAdapter!.causalObjects.filter((cause) => cause.retained);
  assert.ok(retained.length > 0, `${label} retained no causal bindings`);
  for (const cause of retained) {
    const object = objects.get(cause.nativeObjectId);
    assert.ok(object, `${label} cause ${cause.id} points to missing object ${cause.nativeObjectId}`);
    assert.equal(object!.attributes?.nativeNarrative, true, `${label} cause ${cause.id} points to a non-native object`);
    assert.equal(object!.semanticId, `narrative:${cause.id}`, `${label} cause ${cause.id} points to unrelated semantic provenance`);
    assert.equal(String(object!.attributes?.role ?? object!.attributes?.relationship ?? ""), cause.role, `${label} cause ${cause.id} points to the wrong native role`);
  }
}

test("all seven Physical grammars retain their initial causes and remain deterministic", () => {
  const expectedCause: Record<string, string> = {
    DYNAMIC_EARTH: "ANCIENT_CRATON",
    COLLIDING_PLATES: "COLLISION_CORE",
    ANCIENT_CRATONS: "ANCIENT_CRATON",
    ISLAND_ARC_EARTH: "SUBDUCTING_OCEAN",
    SUPERCONTINENT_INTERIOR: "INTERIOR_BASIN",
    MONSOON_CONTINENTS: "MOISTURE_SOURCE",
    ICEHOUSE_EARTH: "ICE_ACCUMULATION",
  };
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL");
  assert.equal(presets.length, 7);
  for (const preset of presets) {
    const options: MapGenerationOptions = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: "PHYSICAL",
      preset: preset.id,
      size: "DUEL",
      players: 2,
      cityStates: 0,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `physical-native-causes-${preset.id.toLowerCase()}`,
    };
    const first = generateMap(options);
    const second = generateMap(options);
    assert.deepEqual(first.tiles, second.tiles, `${preset.id} tiles are not deterministic`);
    assert.deepEqual(first.structure, second.structure, `${preset.id} evidence is not deterministic`);
    const plates = first.structure!.objects.filter((object) => object.kind === "TECTONIC_PLATE");
    assert.ok(plates.length >= 3, `${preset.id} lost its plate systems`);
    assert.ok(plates.every((plate) => plate.attributes?.nativeCause === true), `${preset.id} plates are not retained as causes`);
    assert.ok(plates.some((plate) => plate.attributes?.initialCondition === expectedCause[preset.id]), `${preset.id} lost its defining initial condition`);
    assert.ok(plates.every((plate) => typeof plate.attributes?.crustAge === "number" && typeof plate.attributes?.stability === "number"));
    assert.ok((first.structure!.diagnostics.nativeCauseObjects ?? 0) >= plates.length);
    assertRetainedAdapterBindingsExist(first, preset.id);
    assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * preset.water / 100));
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} failed final topology legality`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(first)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} exports an invalid Civ5Map binary`);
  }
});

test("Dynamic Earth retains three physical cause families at every world scale", () => {
  for (const scale of ["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"] as WorldScale[]) {
    const recipe = generationRecipeFromOptions({
      ...DEFAULT_GENERATION_OPTIONS,
      engine: "PHYSICAL",
      preset: "DYNAMIC_EARTH",
      size: "DUEL",
      players: 2,
      cityStates: 0,
      seed: `dynamic-earth-scale-causes-${scale.toLowerCase()}`,
    });
    recipe.scale = scale;
    const map = generateMapFromRecipe(recipe);
    const processEffects = new Set(map.structure!.objects
      .filter((object) => object.attributes?.role === "PROCESS_PROVINCE")
      .map((object) => object.attributes?.effect));
    const causeFamilies = new Set(map.structure!.narrativeAdapter!.causalObjects
      .filter((cause) => cause.retained && ["PROCESS_PROVINCE", "ACTIVE_MARGIN", "RIFT_MARGIN"].includes(cause.role))
      .map((cause) => cause.cause));
    assert.ok(processEffects.size >= 3, `${scale} collapsed Dynamic Earth to ${processEffects.size} physical effects`);
    assert.ok(causeFamilies.size >= 3, `${scale} collapsed Dynamic Earth to ${causeFamilies.size} physical cause families`);
    assert.equal(map.structure!.narrativeNativeEvidence?.findings.find((finding) => finding.invariantId === "multiple-retained-epochs")?.status, "PROVEN");
    assert.equal(provePhysicalPolisNativeFacts("DYNAMIC_EARTH", map, map.structure!.narrativeAdapter!).ok, true);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * map.generation!.waterPercent / 100));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${scale} Dynamic Earth requires Repair`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${scale} Dynamic Earth exports an invalid Civ5Map`);
  }
});

test("Physical owner grammars remain strict, exact, Repair-clean, and binary-legal across five bounded seeds", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL");
  for (const preset of presets) for (let sample = 0; sample < 5; sample += 1) {
    const options: MapGenerationOptions = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: "PHYSICAL",
      preset: preset.id,
      size: "DUEL",
      players: 2,
      cityStates: 0,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `physical-strict-sweep-${preset.id.toLowerCase()}-${sample + 1}`,
    };
    let map: ReturnType<typeof generateMap>;
    try {
      map = generateMap(options);
    } catch (error) {
      throw new Error(`${preset.id}/${sample + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const proof = provePhysicalPolisNativeFacts(preset.id, map, map.structure!.narrativeAdapter!);
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    const mountainShare = land.filter((tile) => tile.elevation === 2).length / Math.max(1, land.length) * 100;
    assert.equal(proof.ok, true, `${preset.id}/${sample + 1}: ${proof.evidence.join(" ")}`);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * preset.water / 100));
    assert.ok(Math.abs(mountainShare - preset.mountains) < 1.5, `${preset.id}/${sample + 1} changed ${preset.mountains}% mountains to ${mountainShare.toFixed(2)}%`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${preset.id}/${sample + 1} requires Repair`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id}/${sample + 1} exports an invalid Civ5Map`);
    if (sample === 0) {
      const repeated = generateMap(options);
      assert.deepEqual(repeated.tiles, map.tiles, `${preset.id} changed tiles on a same-seed repeat`);
      assert.deepEqual(repeated.structure, map.structure, `${preset.id} changed retained evidence on a same-seed repeat`);
    }
  }
});

test("Dynamic Earth retains truthful epochs and exact controls on extreme Pin and String strips", () => {
  for (const geometry of ["PIN", "STRING"] as const) {
    const options: MapGenerationOptions = {
      ...DEFAULT_GENERATION_OPTIONS,
      engine: "PHYSICAL",
      preset: "DYNAMIC_EARTH",
      size: "DUEL",
      geometry,
      players: 2,
      cityStates: 0,
      waterPercent: 44,
      seed: `physical-${geometry.toLowerCase()}`,
    };
    const map = generateMap(options);
    const proof = provePhysicalPolisNativeFacts("DYNAMIC_EARTH", map, map.structure!.narrativeAdapter!);
    assert.equal(proof.ok, true, `${geometry}: ${proof.evidence.join(" ")}`);
    assert.ok(Number(proof.measurements.ageBands) >= 3);
    assert.ok(Number(proof.measurements.activeBoundaries) >= 1);
    assert.ok(Number(proof.measurements.riftBoundaries) >= 1);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.44));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${geometry} Dynamic Earth requires Repair`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${geometry} Dynamic Earth exports an invalid Civ5Map`);
  }
});

test("Physical consumes a protected semantic cause before plate ownership and climate are solved", () => {
  const width = 40;
  const height = 24;
  const anchor = 11 * width + 12;
  const semantic: NativeSemanticConstraint = {
    id: "protected-range",
    sourceSemanticId: "source:range:1",
    objectKind: "MOUNTAIN_RANGE",
    policy: "RELATIONSHIP",
    hard: false,
    tileIndices: [anchor, anchor + 1, anchor + width],
    anchorIndex: anchor,
    relatedAnchors: [{ semanticId: "source:basin:1", index: 11 * width + 29 }],
  };
  const constraints = constraintPayload(width, height, "PHYSICAL_BOUNDARY", [semantic]);
  const options = { ...DEFAULT_GENERATION_OPTIONS, engine: "PHYSICAL" as const, preset: "COLLIDING_PLATES" as const, players: 2, cityStates: 0, waterPercent: 52, mountainPercent: 24 };
  const first = generatePhysicalGeography(options, width, height, true, 9173, seededRandom(4107), "GLOBAL", constraints);
  const second = generatePhysicalGeography(options, width, height, true, 9173, seededRandom(4107), "GLOBAL", constraints);
  assert.deepEqual(first, second);
  const boundPlate = first.structure.objects.find((object) => object.kind === "TECTONIC_PLATE" && object.attributes?.protectedSemanticId === semantic.sourceSemanticId);
  assert.ok(boundPlate, "the semantic cause was reduced to an anonymous raster");
  assert.ok(boundPlate!.tileIndices.includes(anchor), "the protected cause no longer owns its anchor");
  assert.equal(boundPlate!.attributes?.protectedSemanticPolicy, "RELATIONSHIP");
  assert.ok(first.structure.diagnostics.nativeProtectedSemanticPlates >= 1);
  assert.ok(first.structure.diagnostics.nativeSemanticInfluencedTiles >= semantic.tileIndices.length);
  assert.ok(first.structure.diagnostics.convergentTiles > 0);
});

test("all seven Polis grammars preserve distinct reservations, objective connectivity, route media, starts, and determinism", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "POLIS");
  assert.equal(presets.length, 7);
  for (const preset of presets) {
    const players = preset.id === "THREE_REALMS" ? 6 : preset.id === "UNEQUAL_REALMS" ? 8 : 6;
    const options: MapGenerationOptions = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: "POLIS",
      preset: preset.id,
      size: "SMALL",
      players,
      cityStates: 3,
      waterPercent: preset.water,
      seed: `polis-native-contract-${preset.id.toLowerCase()}`,
    };
    const first = generateMap(options);
    const second = generateMap(options);
    const graph = first.structure!.strategicGraph!;
    assert.deepEqual(first.tiles, second.tiles, `${preset.id} tiles are not deterministic`);
    assert.deepEqual(graph, second.structure!.strategicGraph, `${preset.id} graph is not deterministic`);

    const starts = new Set(graph.startSafetyTileIndices ?? []);
    const homes = new Set(graph.homeCapacityTileIndices ?? []);
    const routes = new Set(graph.routeTileIndices ?? []);
    assert.ok(starts.size > 0 && homes.size > 0 && routes.size > 0, `${preset.id} collapsed a reservation class`);
    assert.ok([...starts].every((index) => !homes.has(index) && !routes.has(index)), `${preset.id} conflates start safety with home or route capacity`);
    assert.ok([...homes].every((index) => !routes.has(index)), `${preset.id} conflates home capacity with route capacity`);

    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), `${preset.id} has an edge with a missing endpoint`);
      for (let index = 1; index < edge.tileIndices.length; index += 1) assert.ok(adjacentIndices(edge.tileIndices[index - 1], first.width, first.height, first.wraps).includes(edge.tileIndices[index]), `${preset.id} has a discontinuous ${edge.kind} route`);
      const interior = edge.kind === "NAVAL" ? edge.tileIndices.slice(1, -1) : edge.tileIndices;
      assert.ok(interior.every((index) => edge.kind === "NAVAL" ? first.tiles[index].terrain < 2 : first.tiles[index].terrain >= 2 && first.tiles[index].elevation < 2), `${preset.id} ${edge.kind} route does not exist in its declared medium`);
    }

    const connected = new Map<string, Set<string>>();
    for (const node of graph.nodes.filter((node) => node.kind === "MAJOR_START" || node.kind === "OBJECTIVE")) connected.set(node.id, new Set());
    for (const edge of graph.edges) if (connected.has(edge.from) && connected.has(edge.to)) {
      connected.get(edge.from)!.add(edge.to);
      connected.get(edge.to)!.add(edge.from);
    }
    for (const objective of graph.nodes.filter((node) => node.kind === "OBJECTIVE")) assert.ok((connected.get(objective.id)?.size ?? 0) >= 2, `${preset.id} objective is not contestable`);
    const firstMajor = graph.nodes.find((node) => node.kind === "MAJOR_START")!;
    const reached = new Set([firstMajor.id]);
    const queue = [firstMajor.id];
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of connected.get(queue[cursor]) ?? []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
    assert.ok([...connected].every(([id]) => reached.has(id)), `${preset.id} strategic graph is disconnected`);

    for (const start of first.startLocations) {
      const index = start.y * first.width + start.x;
      assert.ok(first.tiles[index].terrain >= 2 && first.tiles[index].elevation < 2, `${preset.id} has an illegal start`);
      assert.ok(passableComponentSize(first.tiles, index, first.width, first.height, first.wraps) >= 12, `${preset.id} has a start in a sub-twelve-tile pocket`);
    }
    assertRetainedAdapterBindingsExist(first, preset.id);
    assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * preset.water / 100));
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} is not Repair-clean`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(first)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} exports an invalid Civ5Map binary`);
  }
});

test("Polis owner grammars remain strict, exact, Repair-clean, and binary-legal across five bounded seeds", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "POLIS");
  for (const preset of presets) for (let sample = 0; sample < 5; sample += 1) {
    const players = preset.id === "THREE_REALMS" ? 6 : preset.id === "UNEQUAL_REALMS" ? 8 : 6;
    const options: MapGenerationOptions = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: "POLIS",
      preset: preset.id,
      size: "SMALL",
      players,
      cityStates: 3,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `polis-strict-sweep-${preset.id.toLowerCase()}-${sample + 1}`,
    };
    let map: ReturnType<typeof generateMap>;
    try {
      map = generateMap(options);
    } catch (error) {
      throw new Error(`${preset.id}/${sample + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const proof = provePhysicalPolisNativeFacts(preset.id, map, map.structure!.narrativeAdapter!);
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    const mountainShare = land.filter((tile) => tile.elevation === 2).length / Math.max(1, land.length) * 100;
    assert.equal(proof.ok, true, `${preset.id}/${sample + 1}: ${proof.evidence.join(" ")}`);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * preset.water / 100));
    assert.ok(Math.abs(mountainShare - preset.mountains) < 1.5, `${preset.id}/${sample + 1} changed ${preset.mountains}% mountains to ${mountainShare.toFixed(2)}%`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${preset.id}/${sample + 1} requires Repair`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id}/${sample + 1} exports an invalid Civ5Map`);
    if (sample === 0) {
      const repeated = generateMap(options);
      assert.deepEqual(repeated.tiles, map.tiles, `${preset.id} changed tiles on a same-seed repeat`);
      assert.deepEqual(repeated.structure, map.structure, `${preset.id} changed retained evidence on a same-seed repeat`);
    }
  }
});

test("final native adapter rebinding fails closed when an emitted object is missing", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "PHYSICAL",
    preset: "DYNAMIC_EARTH",
    size: "DUEL",
    players: 2,
    cityStates: 0,
    seed: "physical-adapter-missing-object",
  });
  const source = map.structure!.narrativeAdapter!;
  const removedCause = source.causalObjects.find((cause) => cause.retained)!;
  const removedObject = map.structure!.objects.find((object) => object.id === removedCause.nativeObjectId)!;
  const remainingObjects = map.structure!.objects.filter((object) => object.id !== removedCause.nativeObjectId);
  const deceptivePaintedObject = {
    ...removedObject,
    id: `painted-${removedObject.id}`,
    attributes: { ...removedObject.attributes, nativeNarrative: false },
  };
  const rebound = rebindNarrativeAdapterToFinalNativeObjects(source, [...remainingObjects, deceptivePaintedObject]);
  const failedClosed = rebound.causalObjects.find((cause) => cause.id === removedCause.id)!;
  assert.equal(failedClosed.retained, false);
  const emittedIds = new Set([...remainingObjects, deceptivePaintedObject].map((object) => object.id));
  assert.ok(rebound.causalObjects.filter((cause) => cause.retained).every((cause) => emittedIds.has(cause.nativeObjectId)));
});

test("Polis binds a protected relationship to an actual strategic edge and negotiates a water route", () => {
  const width = 40;
  const height = 24;
  const semantic: NativeSemanticConstraint = {
    id: "protected-strait",
    sourceSemanticId: "source:strait:1",
    objectKind: "STRAIT",
    policy: "RELATIONSHIP",
    hard: false,
    tileIndices: [],
    anchorIndex: 7 * width + 8,
    relatedAnchors: [{ semanticId: "source:port:2", index: 17 * width + 31 }],
  };
  const constraints = constraintPayload(width, height, "POLIS_STRATEGIC", [semantic]);
  const options = { ...DEFAULT_GENERATION_OPTIONS, engine: "POLIS" as const, preset: "IMPERIAL_RING" as const, players: 4, cityStates: 0, waterPercent: 42 };
  const result = generatePolisGeography(options, width, height, true, 7711, seededRandom(7819), "GLOBAL", undefined, constraints);
  const object = result.structure.objects.find((candidate) => candidate.semanticId === semantic.sourceSemanticId && candidate.attributes?.nativeProtectedSemantic === true);
  assert.ok(object, "the protected relationship was not retained as a native strategic object");
  assert.equal(object!.attributes?.relationshipKind, "NAVAL");
  const edge = result.structure.strategicGraph!.edges.find((candidate) => candidate.id === object!.attributes?.strategicEdge);
  assert.ok(edge && edge.kind === "NAVAL");
  assert.ok(edge!.tileIndices.slice(1, -1).every((index) => result.tiles[index].terrain < 2), "the protected strait is only a label, not a water route");
  assert.ok(result.structure.diagnostics.nativeProtectedSemanticRoutes >= 1);
});

test("Unequal Realms produces materially different Tall, Wide, War, and Turtle homes", () => {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === "UNEQUAL_REALMS")!;
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, ...preset, engine: "POLIS", preset: "UNEQUAL_REALMS", size: "SMALL", players: 8, cityStates: 3, waterPercent: preset.water, seed: "polis-role-differentiation" });
  const regions = map.structure!.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE");
  const byRole = new Map<string, typeof regions>();
  for (const region of regions) {
    const role = String(region.attributes?.contractRole);
    byRole.set(role, [...(byRole.get(role) ?? []), region]);
  }
  assert.deepEqual(new Set(byRole.keys()), new Set(["TALL", "WIDE", "WAR", "TURTLE"]));
  const meanSize = (role: string) => byRole.get(role)!.reduce((sum, region) => sum + region.tileIndices.length, 0) / byRole.get(role)!.length;
  const terrainShare = (role: string, terrain: number) => {
    const indices = byRole.get(role)!.flatMap((region) => region.tileIndices);
    return indices.filter((index) => map.tiles[index].terrain === terrain).length / indices.length;
  };
  const resourceDensity = (role: string) => {
    const indices = byRole.get(role)!.flatMap((region) => region.tileIndices);
    return indices.filter((index) => map.tiles[index].resource !== 255).length / indices.length;
  };
  assert.ok(meanSize("WIDE") > meanSize("TURTLE") && meanSize("TURTLE") > meanSize("TALL"));
  assert.ok(terrainShare("TALL", 2) > terrainShare("WAR", 2), "Tall and War homes have the same surface contract");
  assert.ok(terrainShare("WAR", 3) > terrainShare("TALL", 3), "War homes do not retain their harsher plains contract");
  assert.ok(resourceDensity("TALL") > resourceDensity("WIDE"), "Tall and Wide homes have no content-placement distinction");
});

function exactNativeRoleObjects(map: ReturnType<typeof generateMap>, role: string) {
  const adapter = map.structure!.narrativeAdapter!;
  const ids = new Set(adapter.causalObjects.filter((cause) => cause.retained && cause.role === role).map((cause) => cause.nativeObjectId));
  return map.structure!.objects.filter((object) => ids.has(object.id) && object.attributes?.nativeNarrative === true);
}

function generatedOwnerMap(engine: "PHYSICAL" | "POLIS", presetId: string) {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === presetId)!;
  const players = presetId === "THREE_REALMS" ? 6 : presetId === "UNEQUAL_REALMS" ? 8 : engine === "POLIS" ? 6 : 2;
  return generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine,
    preset: preset.id,
    size: engine === "POLIS" ? "SMALL" : "DUEL",
    players,
    cityStates: engine === "POLIS" ? 3 : 0,
    waterPercent: preset.water,
    seed: `native-spatial-proof-${preset.id.toLowerCase()}`,
  });
}

const polisRosterFixtures = new Map<string, ReturnType<typeof generateMap>>();

function generatedPolisRosterMap(presetId: string, players: number) {
  const key = `${presetId}:${players}`;
  const cached = polisRosterFixtures.get(key);
  if (cached) return structuredClone(cached);
  const preset = MAP_PRESETS.find((candidate) => candidate.id === presetId)!;
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine: "POLIS",
    preset: preset.id,
    size: "SMALL",
    players,
    cityStates: presetId === "THALASSIC_LEAGUE" ? 3 : 0,
    waterPercent: preset.water,
    seed: `polis-roster-${presetId.toLowerCase()}-${players}`,
  });
  polisRosterFixtures.set(key, map);
  return structuredClone(map);
}

function assertPolisProofRejects(presetId: string, map: ReturnType<typeof generateMap>, message: string) {
  const proof = provePhysicalPolisNativeFacts(presetId, map, map.structure!.narrativeAdapter!);
  assert.equal(proof.ok, false, `${presetId} ${message}: ${proof.evidence.join(" ")}`);
}

function nativeStrategicSources(object: NonNullable<ReturnType<typeof generateMap>["structure"]>["objects"][number]) {
  return String(object.attributes?.strategicSources ?? object.attributes?.strategicSource ?? "")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function refreshNativePathTiles(map: ReturnType<typeof generateMap>) {
  const graph = map.structure!.strategicGraph!;
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const object of map.structure!.objects.filter((candidate) => candidate.kind === "NARRATIVE_PATH" && candidate.attributes?.nativeNarrative === true)) {
    object.tileIndices = [...new Set(nativeStrategicSources(object).flatMap((source) => edges.get(source)?.tileIndices ?? []))];
  }
}

function shortestHexPath(
  map: ReturnType<typeof generateMap>,
  start: number,
  targets: ReadonlySet<number>,
  allowed: (index: number) => boolean,
) {
  const queue = [start];
  const parent = new Map<number, number>();
  const reached = new Set([start]);
  let found = targets.has(start) ? start : undefined;
  for (let cursor = 0; cursor < queue.length && found === undefined; cursor += 1) {
    for (const next of adjacentIndices(queue[cursor], map.width, map.height, map.wraps)) {
      if (reached.has(next) || !allowed(next)) continue;
      reached.add(next);
      parent.set(next, queue[cursor]);
      queue.push(next);
      if (targets.has(next)) { found = next; break; }
    }
  }
  if (found === undefined) return [];
  const path = [found];
  while (path.at(-1) !== start) path.push(parent.get(path.at(-1)!)!);
  return path.reverse();
}

test("all seven Physical invariant proofs recompute final spatial fields and reject nearby label-only impostors", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL");
  assert.equal(presets.length, 7);
  for (const preset of presets) {
    const map = generatedOwnerMap("PHYSICAL", preset.id);
    const positive = provePhysicalPolisNativeFacts(preset.id, map, map.structure!.narrativeAdapter!);
    assert.equal(positive.ok, true, `${preset.id}: ${positive.evidence.join(" ")}`);

    const adversarial = structuredClone(map);
    if (preset.id === "DYNAMIC_EARTH") {
      // Keep the exact bound objects in place, but put every authored active
      // margin in the wrong final medium. A role-label check would still pass.
      for (const object of exactNativeRoleObjects(adversarial, "ACTIVE_MARGIN")) for (const index of object.tileIndices) adversarial.tiles[index] = { ...adversarial.tiles[index], terrain: 0, elevation: 0 };
    } else if (preset.id === "COLLIDING_PLATES") {
      // The belt remains adjacent to its named foreland; the foreland itself
      // is now a sealed mountain field and is not an accessible province.
      const foreland = exactNativeRoleObjects(adversarial, "FORELAND")[0];
      for (const index of foreland.tileIndices) adversarial.tiles[index] = { ...adversarial.tiles[index], elevation: 2 };
    } else if (preset.id === "ANCIENT_CRATONS") {
      // Cached river-system metadata is irrelevant: delete the actual Civ V
      // edge bits while retaining every causal object and adapter binding.
      adversarial.tiles = adversarial.tiles.map((tile) => ({ ...tile, river: 0 }));
    } else if (preset.id === "ISLAND_ARC_EARTH") {
      // Preserve arc/shelf/sea labels and their proximity while falsifying the
      // sheltered sea's realized medium.
      for (const object of exactNativeRoleObjects(adversarial, "SHELTERED_ARC_SEA")) for (const index of object.tileIndices) adversarial.tiles[index] = { ...adversarial.tiles[index], terrain: 2 };
    } else if (preset.id === "SUPERCONTINENT_INTERIOR" || preset.id === "MONSOON_CONTINENTS") {
      adversarial.tiles = adversarial.tiles.map((tile) => ({ ...tile, river: 0 }));
    } else if (preset.id === "ICEHOUSE_EARTH") {
      const refuge = new Set(exactNativeRoleObjects(adversarial, "REFUGE").flatMap((object) => object.tileIndices));
      adversarial.tiles = adversarial.tiles.map((tile, index) => refuge.has(index) ? tile : { ...tile, resource: 255, wonder: 255 });
    }
    const negative = provePhysicalPolisNativeFacts(preset.id, adversarial, adversarial.structure!.narrativeAdapter!);
    assert.equal(negative.ok, false, `${preset.id} accepted a spatially nearby but materially false native relationship`);
  }
});

test("all seven Polis invariant proofs recompute routes and topology and reject intact labels over broken graphs", () => {
  const presets = MAP_PRESETS.filter((preset) => preset.engine === "POLIS");
  assert.equal(presets.length, 7);
  for (const preset of presets) {
    const map = generatedOwnerMap("POLIS", preset.id);
    const positive = provePhysicalPolisNativeFacts(preset.id, map, map.structure!.narrativeAdapter!);
    assert.equal(positive.ok, true, `${preset.id}: ${positive.evidence.join(" ")}`);

    const adversarial = structuredClone(map);
    const graph = adversarial.structure!.strategicGraph!;
    const sources = (roles: string[]) => new Set(roles.flatMap((role) => exactNativeRoleObjects(adversarial, role)).map((object) => String(object.attributes?.strategicSource ?? "")));
    if (preset.id === "IMPERIAL_RING") {
      const ring = [...sources(["LATERAL_RING"])];
      graph.edges = graph.edges.filter((edge) => edge.id !== ring[0]);
    } else if (preset.id === "OPPOSING_FRONTS" || preset.id === "RIVAL_CONTINENTS") {
      const secondary = [...sources(["SECONDARY_HINGE"])];
      graph.edges = graph.edges.filter((edge) => !secondary.includes(edge.id));
    } else if (preset.id === "CONTESTED_HEARTLAND") {
      const approaches = sources(["MANY_APPROACHES"]);
      graph.edges = graph.edges.filter((edge) => !approaches.has(edge.id));
    } else if (preset.id === "THREE_REALMS") {
      const border = [...sources(["MUTUAL_BORDER"])];
      graph.edges = graph.edges.filter((edge) => edge.id !== border[0]);
    } else if (preset.id === "THALASSIC_LEAGUE") {
      const ring = [...sources(["SEA_LANE"])];
      const redundant = sources(["REDUNDANT_SEA_LANE"]);
      graph.edges = graph.edges.filter((edge) => !redundant.has(edge.id) && edge.id !== ring[0]);
    } else if (preset.id === "UNEQUAL_REALMS") {
      const tall = adversarial.structure!.objects.find((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE" && object.attributes?.contractRole === "TALL")!;
      const wide = adversarial.structure!.objects.find((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE" && object.attributes?.contractRole === "WIDE")!;
      wide.tileIndices = [...tall.tileIndices];
    }
    const negative = provePhysicalPolisNativeFacts(preset.id, adversarial, adversarial.structure!.narrativeAdapter!);
    assert.equal(negative.ok, false, `${preset.id} accepted intact causal labels over a broken final strategic graph`);
  }
});

test("Polis rejects duplicate native objects and reused exact region or route sources", () => {
  const source = generatedPolisRosterMap("IMPERIAL_RING", 4);
  assert.equal(provePhysicalPolisNativeFacts("IMPERIAL_RING", source, source.structure!.narrativeAdapter!).ok, true);

  const duplicateBinding = structuredClone(source);
  const retained = duplicateBinding.structure!.narrativeAdapter!.causalObjects.filter((cause) => cause.retained);
  assert.ok(retained.length >= 2);
  retained[1].nativeObjectId = retained[0].nativeObjectId;
  assertPolisProofRejects("IMPERIAL_RING", duplicateBinding, "accepted two exact causes bound to one native object");

  const reusedRegion = structuredClone(source);
  const nativeRegions = reusedRegion.structure!.objects.filter((object) => object.kind === "NARRATIVE_REGION"
    && object.attributes?.nativeNarrative === true && object.attributes?.strategicSource);
  assert.ok(nativeRegions.length >= 2);
  nativeRegions[1].attributes = { ...nativeRegions[1].attributes, strategicSource: nativeRegions[0].attributes!.strategicSource! };
  nativeRegions[1].tileIndices = [...nativeRegions[0].tileIndices];
  assertPolisProofRejects("IMPERIAL_RING", reusedRegion, "accepted two exact regions reusing one strategic source");

  const reusedRoute = structuredClone(source);
  const lateralPaths = exactNativeRoleObjects(reusedRoute, "LATERAL_RING");
  assert.ok(lateralPaths.length >= 2);
  lateralPaths[1].attributes = {
    ...lateralPaths[1].attributes,
    strategicSource: lateralPaths[0].attributes!.strategicSource!,
    strategicSources: lateralPaths[0].attributes!.strategicSources ?? lateralPaths[0].attributes!.strategicSource!,
    from: lateralPaths[0].attributes!.from!,
    to: lateralPaths[0].attributes!.to!,
    effect: lateralPaths[0].attributes!.effect!,
  };
  lateralPaths[1].tileIndices = [...lateralPaths[0].tileIndices];
  assertPolisProofRejects("IMPERIAL_RING", reusedRoute, "accepted two exact paths reusing one strategic edge source");
});

test("Polis requires an exact one-to-one correspondence between playable starts and major graph nodes", () => {
  const source = generatedPolisRosterMap("IMPERIAL_RING", 4);

  const ghostStart = structuredClone(source);
  ghostStart.startLocations.push({ ...ghostStart.startLocations.find((start) => !start.cityState)!, player: 97 });
  assertPolisProofRejects("IMPERIAL_RING", ghostStart, "accepted a playable start with no major graph node");

  const missingStart = structuredClone(source);
  const firstPlayable = missingStart.startLocations.findIndex((start) => !start.cityState && start.playable !== false);
  missingStart.startLocations.splice(firstPlayable, 1);
  assertPolisProofRejects("IMPERIAL_RING", missingStart, "accepted a major graph node with no playable start");

  const mismatchedTeam = structuredClone(source);
  const start = mismatchedTeam.startLocations.find((candidate) => !candidate.cityState && candidate.playable !== false)!;
  start.team = (start.team ?? 0) + 100;
  assertPolisProofRejects("IMPERIAL_RING", mismatchedTeam, "accepted a start whose team disagrees with its exact major node");

  const duplicateMajor = structuredClone(source);
  const graph = duplicateMajor.structure!.strategicGraph!;
  graph.nodes.push({ ...graph.nodes.find((node) => node.kind === "MAJOR_START")!, id: "duplicate-major-node" });
  assertPolisProofRejects("IMPERIAL_RING", duplicateMajor, "accepted duplicate major ownership and coordinates");
});

test("Opposing Fronts rejects an unequal two-team roster even when every start and node agree", () => {
  const map = generatedPolisRosterMap("OPPOSING_FRONTS", 6);
  const graph = map.structure!.strategicGraph!;
  const majors = graph.nodes.filter((node) => node.kind === "MAJOR_START").sort((one, two) => one.owner! - two.owner!);
  const originalTeams = [...new Set(majors.map((node) => node.team))];
  assert.equal(originalTeams.length, 2);
  const destinationTeam = originalTeams[1]!;
  const moved = majors.filter((node) => node.team === originalTeams[0]).at(-1)!;
  moved.team = destinationTeam;
  const start = map.startLocations.find((candidate) => !candidate.cityState && candidate.player === moved.owner)!;
  start.team = destinationTeam;
  const teamSizes = majors.reduce((counts, node) => counts.set(node.team!, (counts.get(node.team!) ?? 0) + 1), new Map<number, number>());
  assert.deepEqual([...teamSizes.values()].sort((one, two) => one - two), [2, 4]);
  assertPolisProofRejects("OPPOSING_FRONTS", map, "accepted unequal opposing teams");
});

test("Rival Continents rejects two independent hinges rewritten into the same medium", () => {
  const map = generatedPolisRosterMap("RIVAL_CONTINENTS", 4);
  const graph = map.structure!.strategicGraph!;
  const primary = exactNativeRoleObjects(map, "PRIMARY_HINGE")[0];
  const secondary = exactNativeRoleObjects(map, "SECONDARY_HINGE")[0];
  assert.equal(primary.attributes!.effect, "WATER_PATH");
  assert.equal(secondary.attributes!.effect, "LAND_PATH");
  const primaryIds = new Set(nativeStrategicSources(primary));
  const primaryEdges = graph.edges.filter((edge) => primaryIds.has(edge.id));
  assert.ok(primaryEdges.length > 0 && primaryEdges.every((edge) => edge.kind === "NAVAL"));
  const blocked = new Set(graph.edges.filter((edge) => !primaryIds.has(edge.id)).flatMap((edge) => edge.tileIndices.slice(1, -1)));
  for (const edge of primaryEdges) {
    const from = graph.nodes.find((node) => node.id === edge.from)!;
    const to = graph.nodes.find((node) => node.id === edge.to)!;
    const fromIndex = from.y * map.width + from.x;
    const toIndex = to.y * map.width + to.x;
    const route = shortestHexPath(map, fromIndex, new Set([toIndex]), (index) => !blocked.has(index) || index === toIndex);
    assert.ok(route.length >= 2, "could not construct an independent terrestrial adversarial hinge");
    edge.kind = "PASS";
    edge.tileIndices = route;
    for (const index of route) map.tiles[index] = { ...map.tiles[index], terrain: 2, elevation: 0 };
  }
  primary.attributes = { ...primary.attributes, effect: "LAND_PATH" };
  refreshNativePathTiles(map);
  assert.equal(graph.edges.filter((edge) => primaryIds.has(edge.id)).every((edge) => edge.kind !== "NAVAL"), true);
  assertPolisProofRejects("RIVAL_CONTINENTS", map, "accepted two costly land hinges without a maritime crossing");
});

test("Three Realms requires a secondary, physically separate crossing for every realm pair", () => {
  const map = generatedPolisRosterMap("THREE_REALMS", 6);
  const secondary = exactNativeRoleObjects(map, "SECONDARY_REALM_BORDER");
  assert.equal(secondary.length, 3);
  const removedSources = new Set(nativeStrategicSources(secondary[0]));
  assert.ok(removedSources.size > 0);
  map.structure!.strategicGraph!.edges = map.structure!.strategicGraph!.edges.filter((edge) => !removedSources.has(edge.id));
  assertPolisProofRejects("THREE_REALMS", map, "accepted a realm pair after its secondary crossing disappeared");
});

test("Thalassic League rejects a physically articulated port even when its route graph remains redundant", () => {
  const map = generatedPolisRosterMap("THALASSIC_LEAGUE", 4);
  const graph = map.structure!.strategicGraph!;
  const exactLaneIds = new Set(["SEA_LANE", "REDUNDANT_SEA_LANE"].flatMap((role) => exactNativeRoleObjects(map, role).flatMap(nativeStrategicSources)));
  const port = graph.nodes.find((node) => node.kind === "MAJOR_START")!;
  const incident = graph.edges.filter((edge) => exactLaneIds.has(edge.id) && edge.kind === "NAVAL" && (edge.from === port.id || edge.to === port.id));
  assert.ok(incident.length >= 2);
  const oriented = (edge: typeof incident[number]) => edge.from === port.id ? [...edge.tileIndices] : [...edge.tileIndices].reverse();
  const sharedGateway = oriented(incident[0])[1];
  assert.ok(map.tiles[sharedGateway].terrain < 2);
  const portIndex = port.y * map.width + port.x;
  for (const edge of incident.slice(1)) {
    const otherId = edge.from === port.id ? edge.to : edge.from;
    const other = graph.nodes.find((node) => node.id === otherId)!;
    const otherIndex = other.y * map.width + other.x;
    const targets = new Set(adjacentIndices(otherIndex, map.width, map.height, map.wraps).filter((index) => map.tiles[index].terrain < 2));
    const water = shortestHexPath(map, sharedGateway, targets, (index) => map.tiles[index].terrain < 2);
    assert.ok(water.length >= 1, `could not route ${edge.id} through the shared port gateway`);
    const route = [portIndex, ...water, otherIndex];
    edge.tileIndices = edge.from === port.id ? route : route.reverse();
  }
  refreshNativePathTiles(map);
  const gateways = new Set(incident.map((edge) => oriented(edge)[1]));
  assert.equal(gateways.size, 1);
  assertPolisProofRejects("THALASSIC_LEAGUE", map, "accepted a single physical water gateway serving every lane at one port");
});

test("Imperial Ring rejects a nominal circuit whose lateral routes share one physical axle gate", () => {
  const map = generatedPolisRosterMap("IMPERIAL_RING", 4);
  const graph = map.structure!.strategicGraph!;
  const axle = graph.nodes.find((node) => node.kind === "OBJECTIVE")!;
  const axleIndex = axle.y * map.width + axle.x;
  const lateralIds = new Set(exactNativeRoleObjects(map, "LATERAL_RING").flatMap(nativeStrategicSources));
  const lateralEdges = graph.edges.filter((edge) => lateralIds.has(edge.id));
  assert.ok(lateralEdges.length >= 4);
  for (const edge of lateralEdges) {
    const from = graph.nodes.find((node) => node.id === edge.from)!;
    const to = graph.nodes.find((node) => node.id === edge.to)!;
    const fromIndex = from.y * map.width + from.x;
    const toIndex = to.y * map.width + to.x;
    const first = shortestHexPath(map, fromIndex, new Set([axleIndex]), (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
    const second = shortestHexPath(map, axleIndex, new Set([toIndex]), (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
    assert.ok(first.length >= 2 && second.length >= 2);
    edge.tileIndices = [...first, ...second.slice(1)];
  }
  refreshNativePathTiles(map);
  assertPolisProofRejects("IMPERIAL_RING", map, "accepted a lateral circuit collapsed through its axle");
});

test("Contested Heartland rejects a bridge-free district graph collapsed through one capital", () => {
  const map = generatedPolisRosterMap("CONTESTED_HEARTLAND", 4);
  const graph = map.structure!.strategicGraph!;
  const capital = graph.nodes.find((node) => node.kind === "MAJOR_START")!;
  const capitalIndex = capital.y * map.width + capital.x;
  const throughIds = new Set(exactNativeRoleObjects(map, "HEARTLAND_THROUGH_ROUTE").flatMap(nativeStrategicSources));
  const throughEdges = graph.edges.filter((edge) => throughIds.has(edge.id));
  assert.ok(throughEdges.length >= 3);
  for (const edge of throughEdges) {
    const from = graph.nodes.find((node) => node.id === edge.from)!;
    const to = graph.nodes.find((node) => node.id === edge.to)!;
    const fromIndex = from.y * map.width + from.x;
    const toIndex = to.y * map.width + to.x;
    const first = shortestHexPath(map, fromIndex, new Set([capitalIndex]), (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
    const second = shortestHexPath(map, capitalIndex, new Set([toIndex]), (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
    assert.ok(first.length >= 2 && second.length >= 2);
    edge.tileIndices = [...first, ...second.slice(1)];
  }
  refreshNativePathTiles(map);
  assertPolisProofRejects("CONTESTED_HEARTLAND", map, "accepted a district mesh collapsed through one capital");
});

test("aggregate Polis realms require one correctly located major per declared member home", () => {
  const map = generatedPolisRosterMap("OPPOSING_FRONTS", 4);
  const graph = map.structure!.strategicGraph!;
  const team = graph.nodes.filter((node) => node.kind === "MAJOR_START" && node.team === graph.nodes.find((candidate) => candidate.kind === "MAJOR_START")!.team);
  assert.ok(team.length >= 2);
  team[1].regionId = team[0].regionId;
  assertPolisProofRejects("OPPOSING_FRONTS", map, "accepted two major nodes aliased to one member home");
});

test("Unequal Realms requires every individual role home to remain distinct and independently viable", () => {
  const source = generatedPolisRosterMap("UNEQUAL_REALMS", 8);
  const safeHomes = source.structure!.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE");
  const tallHomes = safeHomes.filter((object) => object.attributes?.contractRole === "TALL");
  assert.equal(tallHomes.length, 2);

  const duplicatedHome = structuredClone(source);
  const duplicateTallHomes = duplicatedHome.structure!.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE" && object.attributes?.contractRole === "TALL");
  duplicateTallHomes[1].tileIndices = [...duplicateTallHomes[0].tileIndices];
  assertPolisProofRejects("UNEQUAL_REALMS", duplicatedHome, "accepted two majors assigned to the same Tall home");

  const unviableHome = structuredClone(source);
  const weakest = unviableHome.structure!.objects.find((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE")!;
  const owner = Number(weakest.attributes!.owner);
  const start = unviableHome.startLocations.find((candidate) => !candidate.cityState && candidate.player === owner)!;
  weakest.tileIndices = [start.y * unviableHome.width + start.x];
  assertPolisProofRejects("UNEQUAL_REALMS", unviableHome, "accepted an individually unviable one-tile role home");

  const missingRoleValue = structuredClone(source);
  const nonTallHomes = missingRoleValue.structure!.objects.filter((object) => object.kind === "STRATEGIC_REGION"
    && object.attributes?.role === "SAFE" && object.attributes?.contractRole !== "TALL");
  for (const index of new Set(nonTallHomes.flatMap((home) => home.tileIndices))) missingRoleValue.tiles[index] = { ...missingRoleValue.tiles[index], resource: 255 };
  assertPolisProofRejects("UNEQUAL_REALMS", missingRoleValue, "accepted Wide, War, and Turtle homes with no material resources");
});

const supportedPolisRosters: Array<{ preset: string; requested: number; realized: number }> = [
  ...["IMPERIAL_RING", "OPPOSING_FRONTS", "CONTESTED_HEARTLAND", "RIVAL_CONTINENTS"].flatMap((preset) => [2, 4, 8].map((players) => ({ preset, requested: players, realized: players }))),
  { preset: "THREE_REALMS", requested: 3, realized: 3 },
  { preset: "THREE_REALMS", requested: 4, realized: 3 },
  { preset: "THREE_REALMS", requested: 8, realized: 6 },
  { preset: "THALASSIC_LEAGUE", requested: 3, realized: 3 },
  { preset: "THALASSIC_LEAGUE", requested: 4, realized: 4 },
  { preset: "THALASSIC_LEAGUE", requested: 8, realized: 8 },
  { preset: "UNEQUAL_REALMS", requested: 4, realized: 4 },
  { preset: "UNEQUAL_REALMS", requested: 8, realized: 8 },
];

for (const fixture of supportedPolisRosters) {
  test(`Polis roster contract ${fixture.preset}/${fixture.requested} realizes ${fixture.realized}`, () => {
    let map: ReturnType<typeof generateMap>;
    try {
      map = generatedPolisRosterMap(fixture.preset, fixture.requested);
    } catch (error) {
      throw new Error(`${fixture.preset}/${fixture.requested} unexpectedly rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
    const majors = map.structure!.strategicGraph!.nodes.filter((node) => node.kind === "MAJOR_START");
    const playableStarts = map.startLocations.filter((start) => !start.cityState && start.playable !== false);
    assert.equal(majors.length, fixture.realized, `${fixture.preset}/${fixture.requested} realized the wrong graph roster`);
    assert.equal(playableStarts.length, fixture.realized, `${fixture.preset}/${fixture.requested} realized the wrong start roster`);
    const proof = provePhysicalPolisNativeFacts(fixture.preset, map, map.structure!.narrativeAdapter!);
    assert.equal(proof.ok, true, `${fixture.preset}/${fixture.requested}: ${proof.evidence.join(" ")}`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.severity === "ERROR"), [], `${fixture.preset}/${fixture.requested} is not Repair-clean`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${fixture.preset}/${fixture.requested} exports an invalid Civ5Map binary`);
  });
}

for (const presetId of ["THREE_REALMS", "THALASSIC_LEAGUE", "UNEQUAL_REALMS"]) {
  test(`Polis roster contract ${presetId}/2 rejects unsupported cardinality`, () => {
    assert.throws(() => generatedPolisRosterMap(presetId, 2), /requires at least/i, `${presetId}/2 did not reject its unsupported roster`);
  });
}
