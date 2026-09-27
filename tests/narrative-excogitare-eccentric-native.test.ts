import assert from "node:assert/strict";
import test from "node:test";
import { inspectCiv5MapStructure, serializeCiv5Map, type Civ5Map } from "../lib/civ5-map.ts";
import type { EngineNarrativeStageSnapshot } from "../lib/engine-narrative-diagnostics.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  generateMap,
  MAP_PRESETS,
  randomGenerationOptions,
  type MapGenerationOptions,
  type MapPresetId,
} from "../lib/map-generator.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { compileGenerationConstraints, emptyProtectionState, protectSemanticObject } from "../lib/map-protection.ts";
import { evaluateNarrativeNativeEvidence } from "../lib/narrative-native-evidence.ts";

const EXCOGITARE_TYPES: MapPresetId[] = [
  "CONTINENTS", "PANGAEA", "ARCHIPELAGO", "INLAND_SEAS", "EARTHSEA", "RIFT_REALMS", "LABYRINTH", "WILD_REGIONS",
];

const ECCENTRIC_TYPES: MapPresetId[] = [
  "LIVING_WORLD", "TECTONIC_CONTINENTS", "GREAT_WATERSHEDS", "SHATTERED_BASINS", "MYTHIC_REGIONS", "ENCIRCLING_LANDS",
  "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO",
];

function ownerOptions(id: MapPresetId, seed: string, overrides: Partial<MapGenerationOptions> = {}): MapGenerationOptions {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === id);
  assert.ok(preset, `Unknown Map Type ${id}`);
  const { id: _id, label: _label, description: _description, water, mountains, engine, ...presetOptions } = preset;
  void _id; void _label; void _description;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    ...presetOptions,
    engine,
    preset: id,
    size: "DUEL",
    players: 2,
    cityStates: 1,
    waterPercent: water,
    mountainPercent: mountains,
    seed,
    ...overrides,
  };
}

function nativeObjects(map: Civ5Map) {
  return map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true) ?? [];
}

function assertObjectBoundToNativeTopology(map: Civ5Map, raw: EngineNarrativeStageSnapshot) {
  for (const object of nativeObjects(map)) {
    assert.ok(object.tileIndices.length > 0, `${map.generation?.preset} retained an empty native object ${object.id}`);
    assert.equal(object.attributes?.grammarFamily, map.structure?.narrativeAdapter?.grammarFamily);
    const effect = object.attributes?.effect;
    if (effect === "WATER" || effect === "WATER_PATH") {
      assert.ok(object.tileIndices.every((index) => !raw.landMask[index]), `${object.id} was not bound to water in the selected raw native candidate`);
      assert.ok(object.tileIndices.every((index) => map.tiles[index].terrain < 2), `${object.id} is not bound to native water output`);
    } else if (effect !== "TRANSITION") {
      assert.ok(object.tileIndices.every((index) => raw.landMask[index]), `${object.id} was not bound to land in the selected raw native candidate`);
      assert.ok(object.tileIndices.every((index) => map.tiles[index].terrain >= 2), `${object.id} is not bound to native land output`);
    }
    if (map.structure?.engine !== "EXCOGITARE") continue;
    assert.equal(object.attributes?.outputEffectMatched, true, `${object.id} lacks an effect-compatible field binding`);
    if (effect === "RIDGE" || effect === "RIDGE_PATH" || effect === "VOLCANIC") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].elevation > 0), `${object.id} claims uplift without relief output`);
    } else if (effect === "LOWLAND") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].elevation < 2), `${object.id} claims lowland on mountain output`);
    } else if (effect === "WET") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature)), `${object.id} claims a wet field without wet surface output`);
    } else if (effect === "DRY" || effect === "HOT") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].terrain === 3 || map.tiles[index].terrain === 4), `${object.id} claims a dry/hot field without the corresponding surface output`);
    } else if (effect === "COLD") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].terrain === 5 || map.tiles[index].terrain === 6), `${object.id} claims a cold field without cold surface output`);
    } else if (effect === "VALUE") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255 || map.tiles[index].terrain === 2), `${object.id} claims value without valuable output`);
    } else if (effect === "BARREN") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].feature === 255 && map.tiles[index].resource === 255 && map.tiles[index].wonder === 255), `${object.id} claims barren output over placed content`);
    } else if (effect === "RIVER_PATH") {
      assert.ok(object.tileIndices.every((index) => map.tiles[index].river > 0), `${object.id} claims a river path without encoded river output`);
    }
  }
}

test("all eight field grammars and eleven graph grammars reserve before topology and retain only real output bindings", () => {
  const fieldFamilies = new Set<string>();
  const graphFamilies = new Set<string>();
  for (const id of [...EXCOGITARE_TYPES, ...ECCENTRIC_TYPES]) {
    const snapshots: EngineNarrativeStageSnapshot[] = [];
    const map = generateMap(ownerOptions(id, `native-contract-${id.toLowerCase()}`), undefined, { onEngineNarrativeStage: (snapshot) => snapshots.push(snapshot) });
    const adapter = map.structure?.narrativeAdapter;
    assert.ok(adapter, `${id} did not retain native adapter evidence`);
    const field = map.structure?.engine === "EXCOGITARE";
    assert.ok(adapter.grammarFamily.startsWith(field ? "FIELD_" : "GRAPH_"), `${id} compiled the wrong native grammar family`);
    (field ? fieldFamilies : graphFamilies).add(adapter.grammarFamily);

    const preTopologyReservations = map.structure!.diagnostics[field ? "nativeFieldPreTopologyReservations" : "nativeGraphPreTopologyReservations"];
    assert.equal(preTopologyReservations, adapter.causalObjects.length, `${id} did not compile every explicit cause before topology`);
    const retained = adapter.causalObjects.filter((cause) => cause.retained);
    const objects = nativeObjects(map);
    assert.equal(objects.length, retained.length, `${id} retained causes that are not bound to real output objects`);
    assert.equal(map.structure!.diagnostics[field ? "nativeFieldBoundObjects" : "nativeGraphBoundObjects"], objects.length);
    assert.equal(new Set(objects.map((object) => object.id)).size, objects.length, `${id} emitted duplicate native object ids`);
    for (const cause of adapter.causalObjects) {
      assert.equal(objects.some((object) => object.id === cause.nativeObjectId), cause.retained, `${id} cause ${cause.id} has false binding evidence`);
    }
    assert.ok(map.structure!.objects.filter((object) => object.id.startsWith("narrative-")).every((object) => object.attributes?.nativeNarrative === true), `${id} backfilled a missing native cause with a synthetic narrative object`);

    assert.deepEqual(snapshots.map((snapshot) => snapshot.stage), ["RAW_NATIVE", "NARRATIVE_REALIZED", "LEGAL_NORMALIZED", "FINAL"], `${id} did not replay only its selected native candidate`);
    assertObjectBoundToNativeTopology(map, snapshots[0]);
    const nativeComparison = map.structure!.engineNarrativeEvidence!.comparisons.find((comparison) => comparison.from === "RAW_NATIVE" && comparison.to === "NARRATIVE_REALIZED");
    assert.equal(nativeComparison?.topologyChanged, 0, `${id} still relies on a post-engine topology rewrite`);
    const legalComparison = map.structure!.engineNarrativeEvidence!.comparisons.find((comparison) => comparison.from === "NARRATIVE_REALIZED" && comparison.to === "LEGAL_NORMALIZED");
    assert.equal(legalComparison?.topologyChanged, 0, `${id} only bound its cause after legality normalization`);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * map.generation!.waterPercent / 100), `${id} lost the explicit sea-level budget`);
  }
  assert.equal(fieldFamilies.size, 8, "Excogitare does not expose eight distinct field grammar families");
  assert.equal(graphFamilies.size, 11, "Eccentric does not expose eleven distinct graph grammar families");
});

test("field and graph semantic protection are consumed in the native topology stage", () => {
  for (const [engine, id] of [["EXCOGITARE", "CONTINENTS"], ["ECCENTRIC", "LIVING_WORLD"]] as const) {
    const source = generateMap(ownerOptions(id, `protection-source-${engine.toLowerCase()}`));
    const object = nativeObjects(source).find((candidate) => candidate.kind === "NARRATIVE_REGION");
    assert.ok(object?.semanticId, `${engine} did not expose a protectable native region`);
    const state = protectSemanticObject(emptyProtectionState(), source, object.semanticId, "SHAPE", true);
    const constraints = compileGenerationConstraints(source, state);
    assert.ok(constraints, `${engine} did not compile semantic protection constraints`);
    const snapshots: EngineNarrativeStageSnapshot[] = [];
    const target = generateMap(ownerOptions(id, `protection-target-${engine.toLowerCase()}`), undefined, { constraints, onEngineNarrativeStage: (snapshot) => snapshots.push(snapshot) });
    const raw = snapshots.find((snapshot) => snapshot.stage === "RAW_NATIVE");
    assert.ok(raw, `${engine} did not replay its selected constrained native candidate`);
    for (const index of object.tileIndices) {
      const sourceLand = source.tiles[index].terrain >= 2;
      assert.equal(raw.landMask[index], sourceLand, `${engine} deferred protected topology ${index} until after its native pass`);
      assert.equal(target.tiles[index].terrain >= 2, sourceLand, `${engine} lost protected topology ${index}`);
    }
    const rebound = nativeObjects(target).find((candidate) => candidate.semanticId === object.semanticId);
    assert.ok(rebound, `${engine} protection was not rebound to a native output object`);
    assert.ok(object.tileIndices.every((index) => rebound.tileIndices.includes(index)), `${engine} native object does not contain the protected semantic extent`);
    assert.ok((target.structure!.diagnostics[engine === "EXCOGITARE" ? "nativeFieldSemanticReservations" : "nativeGraphSemanticReservations"] ?? 0) >= 1);
    assert.equal(target.structure!.diagnostics.nativeSemanticConstraints, 1);
    assert.equal(target.structure!.engineNarrativeEvidence!.comparisons.find((comparison) => comparison.from === "RAW_NATIVE" && comparison.to === "NARRATIVE_REALIZED")?.topologyChanged, 0, `${engine} deferred protected topology until after its native pass`);
  }
});

test("field and graph reconstruction remain deterministic", () => {
  for (const id of ["LABYRINTH", "GREAT_WATERSHEDS"] as const) {
    const options = ownerOptions(id, `deterministic-native-${id.toLowerCase()}`);
    const first = generateMap(options);
    const second = generateMap(options);
    assert.deepEqual(first.tiles, second.tiles, `${id} tile output is not deterministic`);
    assert.deepEqual(first.startLocations, second.startLocations, `${id} start output is not deterministic`);
    assert.deepEqual(nativeObjects(first), nativeObjects(second), `${id} native object bindings are not deterministic`);
    assert.deepEqual(first.structure?.narrativeAdapter, second.structure?.narrativeAdapter, `${id} cause evidence is not deterministic`);
    assert.deepEqual(first.structure?.engineNarrativeEvidence, second.structure?.engineNarrativeEvidence, `${id} stage evidence is not deterministic`);
    assert.deepEqual(serializeCiv5Map(first), serializeCiv5Map(second), `${id} binary export is not deterministic`);
  }
});

test("native field and graph topology remains Civ V legal and hydrologically valid", () => {
  for (const id of ["INLAND_SEAS", "LABYRINTH", "GREAT_WATERSHEDS", "RIFTWORLD"] as const) {
    const map = generateMap(ownerOptions(id, `native-legality-${id.toLowerCase()}`));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${id} requires Repair after native generation`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${id} exports an invalid Civ5Map`);
    assert.ok(map.structure!.riverSystems.length > 0, `${id} did not compile any legal drainage`);
    assert.ok(map.structure!.riverSystems.every((river) => river.source !== undefined && river.outlet !== undefined), `${id} retained a river without a source or outlet`);
  }
});

test("Inland Sea Crossroads retains detector-recognized crossings inside an irregular enclosing framework", () => {
  for (const seed of ["evidence-SHATTERED_BASINS", "cut-3", "cut-4", "cut-6"]) {
    const crossroads = generateMap(ownerOptions("SHATTERED_BASINS", seed));
    const edge = new Set<number>();
    for (let x = 0; x < crossroads.width; x += 1) { edge.add(x); edge.add((crossroads.height - 1) * crossroads.width + x); }
    for (let y = 0; y < crossroads.height; y += 1) { edge.add(y * crossroads.width); edge.add(y * crossroads.width + crossroads.width - 1); }
    const semantics = crossroads.structure!.narrativeSemanticModel!;
    const principalSeas = nativeObjects(crossroads).filter((object) => object.attributes?.role === "GREAT_INLAND_SEA");
    const nativeCrossings = nativeObjects(crossroads).filter((object) => (object.attributes?.role === "NARROW_STRAIT" || object.attributes?.role === "CANAL_ISTHMUS") && object.attributes?.detectorRecognized === true);
    assert.ok(principalSeas.length >= 2 && principalSeas.every((sea) => sea.tileIndices.every((index) => !edge.has(index))), `${seed} failed to keep its principal seas topologically inland`);
    assert.equal(crossroads.tiles.filter((tile) => tile.terrain < 2).length, Math.round(crossroads.tiles.length * crossroads.generation!.waterPercent / 100), `${seed} lost its exact water budget`);
    assert.equal(semantics.metrics["land-component-count"]?.value, 1, `${seed} made part of the marginal land inaccessible`);
    assert.ok((semantics.metrics["enclosed-sea-count"]?.value ?? 0) >= 1);
    assert.ok(nativeCrossings.length >= 1, `${seed} did not retain an authoritative one- or two-tile crossing`);
    for (const crossing of nativeCrossings) {
      assert.ok(crossing.tileIndices.length >= 1 && crossing.tileIndices.length <= 2, `${seed} did not bind ${crossing.id} to its real throat`);
      if (crossing.attributes?.role === "NARROW_STRAIT") {
        assert.ok(crossing.tileIndices.every((index) => crossroads.tiles[index].terrain < 2), `${seed} bound its native strait to land`);
        assert.ok(semantics.objects.some((object) => object.kind === "STRAIT" && object.tileIndices.some((index) => crossing.tileIndices.includes(index))), `${seed} native strait path is absent from Review's measured straits`);
      } else {
        assert.ok(crossing.tileIndices.every((index) => crossroads.tiles[index].terrain >= 2 && crossroads.tiles[index].elevation < 2 && crossroads.tiles[index].wonder === 255), `${seed} bound its native canal site to an unsettleable tile`);
        assert.ok(semantics.objects.some((object) => object.kind === "CANAL_ISTHMUS" && object.tileIndices.some((index) => crossing.tileIndices.includes(index))), `${seed} native canal path is absent from Review's measured canal sites`);
      }
      assert.ok(crossroads.structure!.narrativeAdapter!.causalObjects.some((cause) => cause.nativeObjectId === crossing.id && cause.retained), `${seed} lost crossing cause binding evidence`);
    }
    assert.deepEqual(buildRepairIssues(crossroads).filter((issue) => issue.id !== "clean"), [], `${seed} requires Repair after native crossing realization`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(crossroads)).filter((issue) => issue.severity === "ERROR"), [], `${seed} exports an invalid Civ5Map`);
  }
});

test("Standard Crossroads retains the minimum disclosed crossing inventory at an explicit low sea level", () => {
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "ECCENTRIC",
    preset: "SHATTERED_BASINS",
    size: "STANDARD",
    players: 2,
    cityStates: 0,
    seed: "objects-SHATTERED_BASINS",
  });
  const straits = nativeObjects(map).filter((object) => object.attributes?.role === "NARROW_STRAIT");
  const canals = nativeObjects(map).filter((object) => object.attributes?.role === "CANAL_ISTHMUS");
  assert.ok(straits.length + canals.length >= 1);
  assert.ok(map.structure!.narrativeNativePlan!.appliedRelaxations.some((step) => step.id === "relax-marginal-land"));
  if (straits.length + canals.length < 3) assert.ok(map.structure!.narrativeNativePlan!.appliedRelaxations.some((step) => step.id === "relax-strait-isthmus"));
  assert.ok([...straits, ...canals].every((object) => object.attributes?.detectorRecognized === true));
  assert.equal(reevaluateNativeEvidence(map).status, "PROVEN");
  assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * map.generation!.waterPercent / 100));
  assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
});

test("Inland Sea Crossroads proof rejects tiny principal seas and false or duplicated cuts", () => {
  const map = generateMap(ownerOptions("SHATTERED_BASINS", "native-contract-shattered_basins", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(map).status, "PROVEN");
  const principalSeas = nativeObjects(map).filter((object) => object.attributes?.role === "GREAT_INLAND_SEA");
  const straits = nativeObjects(map).filter((object) => object.attributes?.role === "NARROW_STRAIT");
  assert.ok(principalSeas.length >= 4 && straits.length >= 2);

  const tinyPond = structuredClone(map);
  const tinySea = nativeObjects(tinyPond).find((object) => object.id === principalSeas[0].id)!;
  tinySea.tileIndices = tinySea.tileIndices.slice(0, 1);
  assert.notEqual(reevaluateNativeEvidence(tinyPond).status, "PROVEN", "A token pond must not stand in for a principal inland sea");

  const movedCut = structuredClone(map);
  const remoteWater = principalSeas[0].tileIndices[0];
  const movedStrait = nativeObjects(movedCut).find((object) => object.id === straits[1].id)!;
  movedStrait.tileIndices = [remoteWater];
  assert.notEqual(reevaluateNativeEvidence(movedCut).status, "PROVEN", "A water label remote from its two authored shores must not prove a navigable cut");

  const duplicateCut = structuredClone(map);
  const duplicatedStraits = nativeObjects(duplicateCut).filter((object) => object.attributes?.role === "NARROW_STRAIT");
  duplicatedStraits[1].tileIndices = [...duplicatedStraits[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(duplicateCut).status, "PROVEN", "Two crossing causes must not bind the same physical throat");
});

test("Lonely Oceans reserves two viable realms before satellites", () => {
  const lonely = generateMap(ownerOptions("LONELY_OCEANS", "evidence-LONELY_OCEANS", { players: 2, cityStates: 1 }));
  const majors = lonely.startLocations.filter((start) => !start.cityState);
  const viableRealms = lonely.structure!.objects.filter((object) => object.kind === "CONTINENT" && object.tileIndices.filter((index) => lonely.tiles[index].elevation < 2).length >= 6);
  assert.equal(lonely.players, 2, "Lonely Oceans degraded below the legal two-major minimum");
  assert.equal(majors.length, 2, "Lonely Oceans did not place one start in each reserved realm");
  assert.ok(viableRealms.length >= 2, "Lonely Oceans did not reserve two viable land realms before topology reconciliation");
  assert.equal(lonely.startLocations.filter((start) => start.cityState).length, 0, "Lonely Oceans should shed the city-state satellite before a major realm at Duel/89% water");
  assert.ok(nativeObjects(lonely).filter((object) => object.attributes?.role === "REALM").length >= 2);
  const isolation = nativeObjects(lonely).filter((object) => object.attributes?.role === "ISOLATED_FROM");
  assert.equal(isolation.length, 1, "Lonely Oceans lost the exact relationship between its two retained realms");
  assert.ok(isolation[0].tileIndices.every((index) => lonely.tiles[index].terrain < 2), "Lonely Oceans bound isolation to an abstract route across land");
  assert.ok(isolation[0].tileIndices.some((index) => lonely.tiles[index].terrain === 0), "Lonely Oceans isolation never traverses the deep ocean that delays contact");
  assert.equal(reevaluateNativeEvidence(lonely).status, "PROVEN");
});

test("Lonely Oceans proof rejects shallow stepping-stone contact", () => {
  const map = generateMap(ownerOptions("LONELY_OCEANS", "adversarial-lonely-coast-hop", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(map).status, "PROVEN");
  const coastHopped = structuredClone(map);
  for (const tile of coastHopped.tiles) if (tile.terrain === 0) tile.terrain = 1;
  assert.notEqual(reevaluateNativeEvidence(coastHopped).status, "PROVEN", "Coast-connected realms must not masquerade as pre-Astronomy isolation");
});

test("Great Peninsulas binds three settlement-capable coastal heads through real native necks", () => {
  const map = generateMap(ownerOptions("PENINSULA_REALM", "native-peninsula-attachments", { size: "STANDARD", players: 4, cityStates: 4 }));
  const heads = nativeObjects(map).filter((object) => object.attributes?.role === "PENINSULA_PROVINCE" && object.attributes.nativeAttachment === true);
  const necks = nativeObjects(map).filter((object) => object.attributes?.role === "PENINSULA_NECK" && object.attributes.nativeAttachment === true);
  assert.ok(heads.length >= 3, "Great Peninsulas did not retain three realized peninsula heads");
  assert.ok(necks.length >= 3, "Great Peninsulas did not retain three realized peninsula necks");
  for (const head of heads) {
    assert.ok(Number(head.attributes!.settleableTiles) >= 3, `${head.id} is not settlement-capable`);
    assert.ok(Number(head.attributes!.coastalShare) >= 0.25, `${head.id} is not materially coastal`);
    assert.ok(Number(head.attributes!.attachmentNeckCount) >= 1, `${head.id} has no authored attachment`);
    assert.ok(head.tileIndices.every((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2), `${head.id} contains impassable native head tiles`);
  }
  for (const neck of necks) {
    assert.equal(neck.attributes!.continuous, true, `${neck.id} is not a continuous native path`);
    assert.ok(Number(neck.attributes!.waterFlankedShare) >= 0.5, `${neck.id} is not a narrow water-flanked throat`);
    assert.equal(neck.attributes!.headConnected, true, `${neck.id} does not touch its target head`);
    assert.equal(neck.attributes!.backboneConnected, true, `${neck.id} does not reach its source backbone`);
    assert.ok(Number(neck.attributes!.supportTileCount) >= 1, `${neck.id} has no land support route`);
    assert.ok(neck.tileIndices.every((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2), `${neck.id} is not a passable final land attachment`);
  }
  assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * map.generation!.waterPercent / 100), "Great Peninsulas lost its exact sea-level budget");
  assert.ok((map.structure!.narrativeSemanticModel!.metrics["largest-land-share"]?.value ?? 0) >= 0.65, "Great Peninsulas lost its shared parent continent");
  assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], "Great Peninsulas requires Repair after native attachment realization");
});

test("Excogitare edge cases retain bounded seas, viable shelves, and a robust dominant continent", () => {
  const inland = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "INLAND_SEAS", size: "DUEL", wrapType: "EAST_WEST" });
  const inlandMetrics = inland.structure!.narrativeSemanticModel!.metrics;
  assert.ok(Array.from({ length: inland.width }, (_value, x) => x).every((x) => inland.tiles[x].terrain >= 2 && inland.tiles[(inland.height - 1) * inland.width + x].terrain >= 2), "wrapped Lake Kingdoms exposes water at a real north/south edge");
  assert.ok((inlandMetrics["largest-land-share"]?.value ?? 0) >= 0.75);
  assert.ok((inlandMetrics["enclosed-sea-count"]?.value ?? 0) >= 1);
  assert.ok((inlandMetrics["edge-ocean-share"]?.value ?? 1) <= 0.2);

  const shelves = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "DUEL",
    players: 2,
    cityStates: 4,
    style: "REALISTIC",
    preset: "ARCHIPELAGO",
    geometry: "STANDARD",
    wonderCount: 10,
    seed: "create-correctness-4",
  });
  const shelfAnchors = nativeObjects(shelves).filter((object) => object.attributes?.role === "DROWNED_SHELF" && object.tileIndices.filter((index) => {
    const tile = shelves.tiles[index];
    return tile.terrain >= 2 && tile.elevation < 2 && tile.wonder === 255;
  }).length >= 4);
  assert.ok(shelfAnchors.length >= 2, "Drowned Shelves lost both viable native parent countries");
  assert.ok((shelves.structure!.narrativeSemanticModel!.metrics["land-component-count"]?.value ?? 0) >= 4, "Drowned Shelves collapsed into ordinary connected continents");
  assert.deepEqual(buildRepairIssues(shelves).filter((issue) => issue.id !== "clean"), []);

  const pangaea = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    size: "STANDARD",
    preset: "PANGAEA",
    style: "REALISTIC",
    waterPercent: 25,
    mountainPercent: 28,
    seed: "rain-shadow-audit",
  });
  const pangaeaMetrics = pangaea.structure!.narrativeSemanticModel!.metrics;
  assert.ok((pangaeaMetrics["largest-land-share"]?.value ?? 0) >= 0.72);
  assert.ok((pangaeaMetrics["land-component-count"]?.value ?? Number.POSITIVE_INFINITY) <= 3);
  assert.equal(pangaea.tiles.filter((tile) => tile.terrain < 2).length, Math.round(pangaea.tiles.length * 0.25));
});

test("Ecological Transect binds a deterministic climate, relief, and river cause chain to final output", () => {
  const options = { ...randomGenerationOptions(() => 0.25), size: "DUEL" as const, players: 2, cityStates: 0, seed: "random-recipe" };
  const first = generateMap(options);
  const second = generateMap(options);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(nativeObjects(first), nativeObjects(second));
  const metrics = first.structure!.narrativeSemanticModel!.metrics;
  assert.ok((metrics["climate-transition-count"]?.value ?? 0) >= 4);
  assert.ok((metrics["rain-shadow-count"]?.value ?? 0) >= 1);
  assert.ok((metrics["valid-watershed-share"]?.value ?? 0) >= 0.9);
  const roles = new Map(nativeObjects(first).map((object) => [String(object.attributes?.role), object]));
  for (const role of ["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW", "LIVING_RIVER"]) {
    const object = roles.get(role);
    assert.ok(object, `${role} lacks a retained native output binding`);
    assert.equal(object.attributes?.outputEffectMatched, true, `${role} was retained without matching its final effect`);
  }
  assert.ok(roles.get("MOUNTAIN_WALL")!.tileIndices.every((index) => first.tiles[index].terrain >= 2 && first.tiles[index].elevation > 0));
  assert.ok(roles.get("LIVING_PLAIN")!.tileIndices.every((index) => first.tiles[index].terrain >= 2 && first.tiles[index].elevation < 2));
  assert.ok(roles.get("RAIN_SHADOW")!.tileIndices.every((index) => first.tiles[index].terrain === 3 || first.tiles[index].terrain === 4));
  assert.ok(roles.get("LIVING_RIVER")!.tileIndices.every((index) => first.tiles[index].terrain >= 2 && first.tiles[index].river > 0));
  assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);
});

function reevaluateNativeEvidence(map: Civ5Map) {
  assert.ok(map.structure?.narrativeProgram && map.structure.narrativeAdapter);
  return evaluateNarrativeNativeEvidence(map, map.structure.narrativeProgram, map.structure.narrativeAdapter);
}

test("native proof rejects redirected cause ids even when labels and cached metrics remain unchanged", () => {
  const map = generateMap(ownerOptions("CONTINENTS", "adversarial-native-object-id"));
  const adversarial = structuredClone(map);
  const retained = adversarial.structure!.narrativeAdapter!.causalObjects.find((cause) => cause.retained);
  assert.ok(retained);
  retained.nativeObjectId = "narrative-missing-but-correctly-labelled";
  assert.notEqual(reevaluateNativeEvidence(adversarial).status, "PROVEN");
});

test("native proof context rejects stale ownership and every broken cause-object bijection", () => {
  const source = generateMap(ownerOptions("LIVING_WORLD", "adversarial-native-proof-context", { cityStates: 0 }));
  const positive = reevaluateNativeEvidence(source);
  assert.equal(positive.status, "PROVEN");
  assert.equal(positive.boundObjectCount, source.structure!.narrativeAdapter!.causalObjects.filter((cause) => cause.retained).length);
  const cases: Array<readonly [string, (map: Civ5Map) => void]> = [
    ["stale evidence state", (map) => { map.structure!.evidenceState = "STALE"; }],
    ["stale program hash", (map) => { map.structure!.narrativeAdapter!.programHash = "stale-program-hash"; }],
    ["cross-owner adapter", (map) => { map.structure!.narrativeAdapter!.engine = "PHYSICAL"; }],
    ["cross-profile adapter", (map) => { map.structure!.narrativeAdapter!.profileId = "TECTONIC_CONTINENTS"; }],
    ["cross-engine map", (map) => { map.structure!.engine = "PHYSICAL"; }],
    ["native-plan grammar mismatch", (map) => { map.structure!.narrativeNativePlan!.grammarFamily = "PHYSICAL_DYNAMIC_EARTH"; }],
    ["empty cause inventory", (map) => { map.structure!.narrativeAdapter!.causalObjects = []; }],
    ["duplicate cause id", (map) => {
      const causes = map.structure!.narrativeAdapter!.causalObjects;
      causes[1].id = causes[0].id;
    }],
    ["duplicate cause native-object id", (map) => {
      const causes = map.structure!.narrativeAdapter!.causalObjects;
      causes[1].nativeObjectId = causes[0].nativeObjectId;
    }],
    ["deleted final binding", (map) => {
      const cause = map.structure!.narrativeAdapter!.causalObjects.find((candidate) => candidate.retained)!;
      map.structure!.objects = map.structure!.objects.filter((object) => object.id !== cause.nativeObjectId);
    }],
    ["duplicate final binding", (map) => {
      const object = map.structure!.objects.find((candidate) => candidate.attributes?.nativeNarrative === true)!;
      map.structure!.objects.push(structuredClone(object));
    }],
    ["wrong causal object kind", (map) => {
      const cause = map.structure!.narrativeAdapter!.causalObjects.find((candidate) => candidate.retained && candidate.kind === "REGION")!;
      map.structure!.objects.find((object) => object.id === cause.nativeObjectId)!.kind = "NARRATIVE_PATH";
    }],
    ["unowned reverse binding", (map) => {
      const object = structuredClone(map.structure!.objects.find((candidate) => candidate.attributes?.nativeNarrative === true)!);
      map.structure!.objects.push({ ...object, id: "narrative-unowned", semanticId: "narrative:unowned" });
    }],
    ["collapsed relationship endpoints", (map) => {
      const cause = map.structure!.narrativeAdapter!.causalObjects.find((candidate) => candidate.retained && candidate.kind === "RELATIONSHIP")!;
      const object = map.structure!.objects.find((candidate) => candidate.id === cause.nativeObjectId)!;
      object.attributes = { ...object.attributes, to: String(object.attributes?.from ?? "") };
    }],
  ];
  for (const [label, mutate] of cases) {
    const adversarial = structuredClone(source);
    mutate(adversarial);
    const evidence = reevaluateNativeEvidence(adversarial);
    assert.notEqual(evidence.status, "PROVEN", `${label} reached an engine-specific proof dispatcher`);
    assert.equal(evidence.boundObjectCount, 0, `${label} trusted a diagnostic binding count`);
  }
});

test("Ecological Transect proof rejects collapsed or spatially scrambled causal stages", () => {
  const map = generateMap(ownerOptions("LIVING_WORLD", "adversarial-causal-transect", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(map).status, "PROVEN");

  const collapsed = structuredClone(map);
  const collapsedTransitions = nativeObjects(collapsed).filter((object) => object.attributes?.role === "CAUSAL_TRANSITION");
  assert.equal(collapsedTransitions.length, 4);
  const firstTransitionTiles = [...collapsedTransitions[0].tileIndices];
  for (const transition of collapsedTransitions) transition.tileIndices = [...firstTransitionTiles];
  assert.notEqual(reevaluateNativeEvidence(collapsed).status, "PROVEN", "Four labels on one path must not prove a causal transect");

  const scrambled = structuredClone(map);
  const orderedRoles = ["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW"];
  const stages = orderedRoles.map((role) => nativeObjects(scrambled).find((object) => object.attributes?.role === role));
  assert.ok(stages.every(Boolean));
  const extents = stages.map((object) => [...object!.tileIndices]).reverse();
  stages.forEach((object, index) => { object!.tileIndices = extents[index]; });
  assert.notEqual(reevaluateNativeEvidence(scrambled).status, "PROVEN", "Reversed role labels must not prove the authored coast-to-shadow order");

  const wrongSource = structuredClone(map);
  const sourceRiver = nativeObjects(wrongSource).find((object) => object.attributes?.role === "LIVING_RIVER");
  assert.ok(sourceRiver && sourceRiver.tileIndices.length > 8);
  sourceRiver.tileIndices = sourceRiver.tileIndices.slice(3);
  assert.notEqual(reevaluateNativeEvidence(wrongSource).status, "PROVEN", "A real nearby channel whose source begins below the authored mountain wall must not prove the transect");

  const wrongOutlet = structuredClone(map);
  const outletRiver = nativeObjects(wrongOutlet).find((object) => object.attributes?.role === "LIVING_RIVER");
  assert.ok(outletRiver && outletRiver.tileIndices.length > 8);
  outletRiver.tileIndices = outletRiver.tileIndices.slice(0, -3);
  assert.notEqual(reevaluateNativeEvidence(wrongOutlet).status, "PROVEN", "A real nearby channel terminating inland before the authored coast must not prove the transect");
});

test("Broken Island Chains proof rejects collapsed arcs and false parent membership", () => {
  const map = generateMap(ownerOptions("SHATTERED_ARCHIPELAGO", "adversarial-parent-arcs", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(map).status, "PROVEN");

  const collapsed = structuredClone(map);
  const arcs = nativeObjects(collapsed).filter((object) => object.attributes?.role === "FOLLOWS_ARC");
  assert.ok(arcs.length >= 3);
  const firstArcTiles = [...arcs[0].tileIndices];
  for (const arc of arcs) arc.tileIndices = [...firstArcTiles];
  assert.notEqual(reevaluateNativeEvidence(collapsed).status, "PROVEN", "Several arc labels on one geographic path must not prove distinct ancestry");

  const scrambled = structuredClone(map);
  const chains = nativeObjects(scrambled).filter((object) => object.attributes?.role === "CHAIN");
  const children = nativeObjects(scrambled).filter((object) => ["ANCHOR", "GENERIC"].includes(String(object.attributes?.role)));
  assert.ok(chains.length >= 3 && children.length >= 3);
  const wrongParent = chains[0].id.replace(/^narrative-/, "");
  for (const child of children) child.attributes!.parent = wrongParent;
  assert.notEqual(reevaluateNativeEvidence(scrambled).status, "PROVEN", "Scrambled child parentage must not satisfy directional parent systems");
});

test("every Eccentric graph proof rejects a collapsed or effectless spatial relationship", () => {
  const cases: Array<{
    id: MapPresetId;
    mutate: (map: Civ5Map) => void;
  }> = [
    {
      id: "TECTONIC_CONTINENTS",
      mutate: (map) => {
        const histories = nativeObjects(map).filter((object) => object.attributes?.role === "GEOLOGIC_HISTORY");
        assert.ok(histories.length >= 3);
        for (const history of histories.slice(1)) history.tileIndices = [...histories[0].tileIndices];
      },
    },
    {
      id: "GREAT_WATERSHEDS",
      mutate: (map) => {
        const trunk = nativeObjects(map).find((object) => object.attributes?.role === "FLOWS_TO");
        const dryLand = map.tiles.findIndex((tile) => tile.terrain >= 2 && tile.river === 0);
        assert.ok(trunk && dryLand >= 0);
        trunk.tileIndices = [dryLand];
      },
    },
    {
      id: "SHATTERED_BASINS",
      mutate: (map) => {
        const seas = nativeObjects(map).filter((object) => object.attributes?.role === "GREAT_INLAND_SEA");
        assert.ok(seas.length >= 2);
        seas[1].tileIndices = [...seas[0].tileIndices];
      },
    },
    {
      id: "MYTHIC_REGIONS",
      mutate: (map) => {
        const hearts = nativeObjects(map).filter((object) => object.attributes?.role === "MYTHIC_HEART");
        const march = nativeObjects(map).find((object) => object.attributes?.role === "BARREN_MARCH");
        assert.ok(hearts.length > 0 && march);
        for (const heart of hearts) heart.tileIndices = [...march.tileIndices];
      },
    },
    {
      id: "ENCIRCLING_LANDS",
      mutate: (map) => {
        const paths = nativeObjects(map).filter((object) => object.attributes?.role === "OUTER_CIRCUIT");
        assert.ok(paths.length >= 4);
        for (const path of paths.slice(1)) path.tileIndices = [...paths[0].tileIndices];
      },
    },
    {
      id: "ASTRAL_PANGAEA",
      mutate: (map) => {
        const scars = nativeObjects(map).filter((object) => object.attributes?.role === "ALIEN_SCAR");
        assert.ok(scars.length >= 2);
        for (const scar of scars.slice(1)) scar.tileIndices = [...scars[0].tileIndices];
      },
    },
    {
      id: "RIFTWORLD",
      mutate: (map) => {
        const cells = nativeObjects(map).filter((object) => object.attributes?.role === "VIABLE_RIFT_CELL");
        assert.ok(cells.length >= 4);
        for (const cell of cells.slice(1)) cell.tileIndices = [...cells[0].tileIndices];
      },
    },
    {
      id: "LONELY_OCEANS",
      mutate: (map) => {
        const realms = nativeObjects(map).filter((object) => object.attributes?.role === "REALM");
        assert.ok(realms.length >= 2);
        realms[1].tileIndices = [...realms[0].tileIndices];
      },
    },
    {
      id: "PENINSULA_REALM",
      mutate: (map) => {
        const necks = nativeObjects(map).filter((object) => object.attributes?.role === "PENINSULA_NECK");
        const inland = map.tiles.findIndex((tile) => tile.terrain >= 2 && tile.elevation < 2);
        assert.ok(necks.length >= 3 && inland >= 0);
        for (const neck of necks) neck.tileIndices = [inland];
      },
    },
  ];
  for (const entry of cases) {
    const map = generateMap(ownerOptions(entry.id, `native-contract-${entry.id.toLowerCase()}`, { cityStates: 0 }));
    assert.equal(reevaluateNativeEvidence(map).status, "PROVEN", `${entry.id} positive proof fixture is not authoritative`);
    const adversarial = structuredClone(map);
    entry.mutate(adversarial);
    assert.notEqual(reevaluateNativeEvidence(adversarial).status, "PROVEN", `${entry.id} accepted collapsed or effectless spatial evidence`);
  }
});

test("Eccentric proofs reject one corrupt retained sibling instead of accepting a valid subset", () => {
  const living = generateMap(ownerOptions("LIVING_WORLD", "adversarial-one-bad-living", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(living).status, "PROVEN");
  const badTransition = structuredClone(living);
  const transitions = nativeObjects(badTransition).filter((object) => object.attributes?.role === "CAUSAL_TRANSITION");
  assert.equal(transitions.length, 4);
  transitions.at(-1)!.tileIndices = [...transitions[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badTransition).status, "PROVEN", "Three valid transitions must not hide one false retained causal stage");

  const tectonic = generateMap(ownerOptions("TECTONIC_CONTINENTS", "adversarial-one-bad-tectonic", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(tectonic).status, "PROVEN");
  const badHistory = structuredClone(tectonic);
  const histories = nativeObjects(badHistory).filter((object) => object.attributes?.role === "GEOLOGIC_HISTORY");
  assert.ok(histories.length >= 3);
  histories.at(-1)!.tileIndices = [...histories[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badHistory).status, "PROVEN", "Distinct histories cannot be inferred from the remaining valid continents");
  const badMargin = structuredClone(tectonic);
  const margins = nativeObjects(badMargin).filter((object) => object.attributes?.role === "ACTIVE_MARGIN" || object.attributes?.role === "RIFT_MARGIN");
  assert.ok(margins.length >= 3);
  margins.at(-1)!.tileIndices = [...margins[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badMargin).status, "PROVEN", "One false retained plate margin must invalidate the exact continental-history graph");

  const mythic = generateMap(ownerOptions("MYTHIC_REGIONS", "adversarial-one-bad-mythic", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(mythic).status, "PROVEN");
  const remoteMarch = structuredClone(mythic);
  const marches = nativeObjects(remoteMarch).filter((object) => object.attributes?.role === "BARREN_MARCH");
  assert.ok(marches.length >= 3);
  marches.at(-1)!.tileIndices = [...marches[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(remoteMarch).status, "PROVEN", "One remote march must invalidate its own retained heart–march cause");
  const badMythicPath = structuredClone(mythic);
  const mythicPaths = nativeObjects(badMythicPath).filter((object) => object.attributes?.role === "ENSCONCED_BY");
  mythicPaths.at(-1)!.tileIndices = [...mythicPaths[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badMythicPath).status, "PROVEN", "Four valid enclosures must not hide one false fifth relationship");

  const encircling = generateMap(ownerOptions("ENCIRCLING_LANDS", "adversarial-one-bad-circuit", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(encircling).status, "PROVEN");
  const sharedChoke = structuredClone(encircling);
  const circuit = nativeObjects(sharedChoke).filter((object) => object.attributes?.role === "OUTER_CIRCUIT");
  assert.ok(circuit.length >= 4);
  circuit.at(-1)!.tileIndices = [...circuit[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(sharedChoke).status, "PROVEN", "A labelled cycle with two edges on one physical throat is not resilient");

  const astral = generateMap(ownerOptions("ASTRAL_PANGAEA", "adversarial-one-bad-astral", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(astral).status, "PROVEN");
  const badBond = structuredClone(astral);
  const bonds = nativeObjects(badBond).filter((object) => object.attributes?.role === "CONTINENT_BOND");
  assert.ok(bonds.length >= 4);
  bonds.at(-1)!.tileIndices = [...bonds[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badBond).status, "PROVEN", "Six valid bonds must not hide one false retained lobe bond");
  const badScar = structuredClone(astral);
  const scars = nativeObjects(badScar).filter((object) => object.attributes?.role === "ALIEN_SCAR");
  assert.ok(scars.length >= 3);
  scars.at(-1)!.tileIndices = [...scars[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badScar).status, "PROVEN", "Three valid scars must not hide one false retained scar");

  const rift = generateMap(ownerOptions("RIFTWORLD", "adversarial-one-bad-rift", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(rift).status, "PROVEN");
  const badRift = structuredClone(rift);
  const riftPaths = nativeObjects(badRift).filter((object) => object.attributes?.role === "PRIMARY_RIFT" || object.attributes?.role === "SECONDARY_RIFT");
  assert.ok(riftPaths.length >= 3);
  riftPaths.at(-1)!.tileIndices = [...riftPaths[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(badRift).status, "PROVEN", "Valid primary cuts must not hide one false retained secondary rift");
  const duplicateCell = structuredClone(rift);
  const cells = nativeObjects(duplicateCell).filter((object) => object.attributes?.role === "VIABLE_RIFT_CELL");
  assert.ok(cells.length >= 4);
  cells.at(-1)!.tileIndices = [...cells[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(duplicateCell).status, "PROVEN", "One duplicated terminal cell must invalidate the retained rift lattice");

  const peninsula = generateMap(ownerOptions("PENINSULA_REALM", "adversarial-one-bad-peninsula", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(peninsula).status, "PROVEN");
  const duplicateHead = structuredClone(peninsula);
  const heads = nativeObjects(duplicateHead).filter((object) => object.attributes?.role === "PENINSULA_PROVINCE");
  assert.ok(heads.length >= 4);
  heads[3].tileIndices = [...heads[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(duplicateHead).status, "PROVEN", "Three good heads must not hide a duplicated fourth peninsula");
  const duplicateNeck = structuredClone(peninsula);
  const necks = nativeObjects(duplicateNeck).filter((object) => object.attributes?.role === "PENINSULA_NECK");
  assert.ok(necks.length >= 4);
  necks[3].tileIndices = [...necks[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(duplicateNeck).status, "PROVEN", "Three good necks must not hide a duplicated fourth articulation");
  const falseBackbone = structuredClone(peninsula);
  const shared = nativeObjects(falseBackbone).find((object) => object.attributes?.role === "SHARED_BACKBONE");
  assert.ok(shared);
  shared.tileIndices = [...necks[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(falseBackbone).status, "PROVEN", "Real peninsula necks cannot compensate for a false shared-backbone route");

  const chains = generateMap(ownerOptions("SHATTERED_ARCHIPELAGO", "adversarial-incomplete-fourth-parent", { cityStates: 0 }));
  assert.equal(reevaluateNativeEvidence(chains).status, "PROVEN");
  const incompleteParent = structuredClone(chains);
  const arcs = nativeObjects(incompleteParent).filter((object) => object.attributes?.role === "FOLLOWS_ARC");
  assert.ok(arcs.length >= 4);
  arcs[3].tileIndices = [...arcs[0].tileIndices];
  assert.notEqual(reevaluateNativeEvidence(incompleteParent).status, "PROVEN", "Three complete parent systems must not hide an incomplete fourth system");
});

test("directed watershed proof rejects stale cached drainage after encoded Civ V edges break", () => {
  const map = generateMap(ownerOptions("GREAT_WATERSHEDS", "adversarial-stale-directed-watershed"));
  const adversarial = structuredClone(map);
  const trunk = nativeObjects(adversarial).find((object) => object.attributes?.role === "FLOWS_TO" && object.tileIndices.length >= 2);
  assert.ok(trunk);
  assert.ok(adversarial.structure!.riverSystems.length > 0, "fixture needs cached drainage metadata to remain favorable");
  const owner = trunk.tileIndices[Math.floor(trunk.tileIndices.length / 2)];
  adversarial.tiles[owner].river = 0;
  assert.notEqual(
    reevaluateNativeEvidence(adversarial).status,
    "PROVEN",
    "cached riverSystems must not conceal a broken canonical Civ V edge chain",
  );
});

test("all eleven Eccentric owners remain strict, exact, and Repair-clean across five deterministic seeds", () => {
  for (const id of ECCENTRIC_TYPES) for (let sample = 0; sample < 5; sample += 1) {
    const seed = `eccentric-owner-sweep-${id.toLowerCase()}-${sample + 1}`;
    const map = generateMap(ownerOptions(id, seed, { cityStates: 0 }));
    assert.equal(reevaluateNativeEvidence(map).status, "PROVEN", `${id} ${seed} lost strict native proof`);
    assert.equal(
      map.tiles.filter((tile) => tile.terrain < 2).length,
      Math.round(map.tiles.length * map.generation!.waterPercent / 100),
      `${id} ${seed} lost its exact water budget`,
    );
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${id} ${seed} requires Repair`);
    assert.deepEqual(
      inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"),
      [],
      `${id} ${seed} exports an invalid Civ5Map`,
    );
  }
});
