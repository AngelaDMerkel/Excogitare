import assert from "node:assert/strict";
import test from "node:test";
import { inspectCiv5MapStructure, serializeCiv5Map, type Civ5Map, type Civ5StartLocation, type Civ5Tile } from "../lib/civ5-map.ts";
import type { GenerationStructure } from "../lib/generation-structure.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, type MapGenerationOptions } from "../lib/map-generator.ts";
import {
  applyNarrativeCityStateContestability,
  applyNarrativeBrutalFrontierContent,
  applyNarrativeContent,
  applyNarrativeRiverValleyContent,
  compileNarrativeSkeleton,
  narrativeProfile,
} from "../lib/narrative-map-types.ts";
import { evaluateNarrativeContentEvidence } from "../lib/narrative-content-evidence.ts";
import { compileNarrativeAdapterPlan } from "../lib/narrative-engine-adapters.ts";
import { narrativeNativeContract, validateNarrativeNativeContract, type NarrativeContentPattern, type NarrativeGenerativeContract } from "../lib/narrative-native-contracts.ts";
import { provePhysicalPolisNativeFacts } from "../lib/narrative-native-physical-polis-proof.ts";
import { compileCatalogueNarrativeProgram, NARRATIVE_CATALOGUE_IDS } from "../lib/narrative-program-catalogue.ts";
import { extractNarrativeSemantics } from "../lib/narrative-semantics.ts";
import { reconstructCiv5RiverEdgeSystems } from "../lib/rivers.ts";
import type { NarrativeSkeleton } from "../lib/narrative-types.ts";

const TERRAINS = ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW"];
const FEATURES = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FALLOUT"];
const WONDERS = ["FEATURE_MT_FUJI", "FEATURE_KRAKATOA"];
const RESOURCES = [
  "RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_SHEEP", "RESOURCE_DEER", "RESOURCE_FISH",
  "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_COAL", "RESOURCE_OIL", "RESOURCE_ALUMINUM", "RESOURCE_URANIUM",
  "RESOURCE_GOLD", "RESOURCE_GEMS", "RESOURCE_SPICES", "RESOURCE_SILVER", "RESOURCE_FURS", "RESOURCE_DYES",
  "RESOURCE_SUGAR", "RESOURCE_COTTON", "RESOURCE_WINE", "RESOURCE_INCENSE", "RESOURCE_IVORY", "RESOURCE_PEARLS",
  "RESOURCE_WHALE", "RESOURCE_SALT", "RESOURCE_TRUFFLES",
];

function tile(overrides: Partial<Civ5Tile> = {}): Civ5Tile {
  return { terrain: 2, resource: 255, feature: 255, river: 0, elevation: 0, continent: 1, wonder: 255, resourceAmount: 0, ...overrides };
}

function structure(objects: GenerationStructure["objects"] = [], engine: GenerationStructure["engine"] = "EXCOGITARE"): GenerationStructure {
  return { engine, objects, mountainRanges: [], riverSystems: [], diagnostics: {} };
}

function fixtureMap(width: number, height: number, tiles: Civ5Tile[], startLocations: Civ5StartLocation[] = [], mapStructure = structure()): Civ5Map {
  return {
    name: "Narrative content fixture",
    description: "Focused content evidence fixture.",
    worldSize: "WORLDSIZE_DUEL",
    version: 12,
    width,
    height,
    players: startLocations.filter((start) => !start.cityState).length,
    wraps: false,
    terrains: [...TERRAINS],
    features: [...FEATURES],
    wonders: [...WONDERS],
    resources: [...RESOURCES],
    tiles,
    startLocations,
    source: "generated",
    structure: mapStructure,
  };
}

function optionsFor(profileId: (typeof NARRATIVE_CATALOGUE_IDS)[number], overrides: Partial<MapGenerationOptions> = {}): MapGenerationOptions {
  const profile = narrativeProfile(profileId);
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: profile.engine,
    preset: profileId,
    size: "DUEL",
    players: profile.engine === "POLIS" ? 4 : 2,
    cityStates: 1,
    seed: `content-${profileId.toLowerCase()}`,
    ...overrides,
  };
}

function programmeFor(profileId: (typeof NARRATIVE_CATALOGUE_IDS)[number], width: number, height: number, overrides: Partial<MapGenerationOptions> = {}) {
  const options = optionsFor(profileId, overrides);
  const recipe = generationRecipeFromOptions(options);
  return { options, recipe, program: compileCatalogueNarrativeProgram(recipe, { width, height, wraps: false }) };
}

function skeletonFor(profileId: (typeof NARRATIVE_CATALOGUE_IDS)[number], width: number, height: number): NarrativeSkeleton {
  const { options, recipe } = programmeFor(profileId, width, height);
  return compileNarrativeSkeleton(options, recipe, width, height, false);
}

function contentMultiset(tiles: Civ5Tile[]) {
  return tiles.filter((item) => item.resource !== 255).map((item) => `${item.resource}:${item.resourceAmount}`).sort();
}

function countResources(tiles: Civ5Tile[], indices: Iterable<number>) {
  return [...indices].filter((index) => tiles[index].resource !== 255).length;
}

const FINDINGS: Record<NarrativeContentPattern, string[]> = {
  DISTRIBUTED: ["distributed-content"],
  SHELF_ANCHORS: ["maritime-value", "shelf-anchor-supplies"],
  INLAND_WATER_ECONOMY: ["maritime-value", "inland-water-economy"],
  MARITIME_REALMS: ["maritime-value", "maritime-realm-supplies"],
  RIVER_VALLEYS: ["river-valley-value", "river-valley-surface"],
  MYTHIC_HEARTS: ["mythic-heart-value", "heart-march-gradient", "mythic-wonder-bias"],
  ISOLATED_SCARCITY: ["isolated-realm-supplies", "isolated-city-state-spacing"],
  COLD_FRONTIER: ["cold-frontier-value", "cold-settlement-value"],
  CONTESTED_CENTRE: ["contested-value", "contested-value-gradient", "contested-city-states"],
  NAVAL_NETWORK: ["maritime-value", "naval-network-content", "naval-city-state-ports"],
  ROLE_ASYMMETRY: ["role-economies"],
};

test("all thirty-three content contracts dispatch exhaustively without generic fallback evidence", () => {
  const blank = fixtureMap(12, 8, Array.from({ length: 96 }, () => tile()));
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const { program } = programmeFor(profileId, blank.width, blank.height);
    const evidence = evaluateNarrativeContentEvidence(blank, program);
    assert.equal(evidence.pattern, program.generative!.content.pattern, profileId);
    const expectedFindings = [...FINDINGS[evidence.pattern], ...(profileId === "OPPOSING_FRONTS" ? [
      "brutal-frontier-barbarians", "brutal-frontier-ruins", "brutal-frontier-fallout",
    ] : [])];
    assert.deepEqual(evidence.findings.map((finding) => finding.id), expectedFindings, profileId);
    assert.equal(evidence.findings.some((finding) => finding.id === "legal-content"), false, profileId);
    if (evidence.pattern === "DISTRIBUTED") {
      assert.equal(evidence.status, "NOT_APPLICABLE", profileId);
      assert.equal(evidence.score, 0, profileId);
    } else {
      assert.notEqual(evidence.status, "NOT_APPLICABLE", `${profileId} silently lost its applicable content obligation`);
    }
  }
});

test("illegal or overlapping placements cannot satisfy narrative content evidence", () => {
  const width = 6;
  const height = 6;
  const tiles = Array.from({ length: width * height }, (_value, index) => tile({ terrain: Math.floor(index / width) < 3 ? 1 : 2, continent: Math.floor(index / width) < 3 ? 0 : 1 }));
  const invalidGold = 2 * width + 1;
  const validFish = 2 * width + 3;
  const overlappingFish = 2 * width + 4;
  tiles[invalidGold] = tile({ terrain: 1, continent: 0, resource: 11, resourceAmount: 1 });
  tiles[validFish] = tile({ terrain: 1, continent: 0, resource: 4, resourceAmount: 1 });
  tiles[overlappingFish] = tile({ terrain: 1, continent: 0, resource: 4, resourceAmount: 1, wonder: 1 });
  const map = fixtureMap(width, height, tiles, [], structure([{ id: "shelf", name: "Shelf", kind: "NARRATIVE_REGION", tileIndices: [3 * width + 3], attributes: { role: "PARENT_ANCHOR" } }]));
  const { program } = programmeFor("ARCHIPELAGO", width, height);
  const maritime = evaluateNarrativeContentEvidence(map, program).findings.find((finding) => finding.id === "maritime-value")!;
  assert.deepEqual(maritime.tileIndices, [validFish]);
  assert.equal(maritime.tileIndices.includes(invalidGold), false);
  assert.equal(maritime.tileIndices.includes(overlappingFish), false);
});

test("maritime content follows a retained inland-basin seed to the complete enclosed coast without changing abundance", () => {
  const width = 12;
  const height = 8;
  const tiles = Array.from({ length: width * height }, () => tile());
  const water = new Set<number>();
  for (let y = 2; y <= 5; y += 1) for (let x = 4; x <= 7; x += 1) {
    const index = y * width + x;
    water.add(index);
    tiles[index] = tile({ terrain: 1, continent: 0 });
  }
  const deepCore = 3 * width + 5;
  tiles[deepCore].resource = 4;
  tiles[deepCore].resourceAmount = 1;
  const mapStructure = structure([{ id: "basin-core", name: "Interior Basin", kind: "NARRATIVE_REGION", tileIndices: [deepCore], attributes: { role: "INTERIOR_BASIN" } }], "PHYSICAL");
  const before = contentMultiset(tiles);
  const { program } = programmeFor("SUPERCONTINENT_INTERIOR", width, height);
  applyNarrativeContent(tiles, RESOURCES, skeletonFor("SUPERCONTINENT_INTERIOR", width, height), width, height, false, program.generative, mapStructure);
  assert.deepEqual(contentMultiset(tiles), before);
  assert.equal(tiles[deepCore].resource, 255, "the deep bound seed was mistaken for the complete inland economy");
  const coastalFish = [...water].filter((index) => tiles[index].resource === 4 && [index - 1, index + 1, index - width, index + width].some((neighbor) => !water.has(neighbor)));
  assert.equal(coastalFish.length, 1);
});

test("mythic content relocates existing value and wonders into retained hearts before filling resources", () => {
  const width = 10;
  const height = 8;
  const tiles = Array.from({ length: width * height }, () => tile());
  const hearts = new Set<number>();
  const marches = new Set<number>();
  for (let y = 1; y < height - 1; y += 1) for (let x = 0; x < width; x += 1) (x < 3 ? hearts : marches).add(y * width + x);
  const sources = [...marches].slice(0, 18);
  for (const index of sources) { tiles[index].resource = 0; tiles[index].resourceAmount = 1; }
  tiles[sources[0]].resource = 255;
  tiles[sources[0]].resourceAmount = 0;
  tiles[sources[0]].wonder = 0;
  const mapStructure = structure([
    { id: "heart", name: "Mythic Heart", kind: "NARRATIVE_REGION", tileIndices: [...hearts], attributes: { role: "MYTHIC_HEART", effect: "VALUE" } },
    { id: "march", name: "Barren March", kind: "NARRATIVE_REGION", tileIndices: [...marches], attributes: { role: "BARREN_MARCH", effect: "BARREN" } },
  ], "ECCENTRIC");
  const beforeResources = contentMultiset(tiles);
  const beforeWonders = tiles.filter((item) => item.wonder !== 255).length;
  const { program } = programmeFor("MYTHIC_REGIONS", width, height);
  applyNarrativeContent(tiles, RESOURCES, skeletonFor("MYTHIC_REGIONS", width, height), width, height, false, program.generative, mapStructure);
  assert.deepEqual(contentMultiset(tiles), beforeResources);
  assert.equal(tiles.filter((item) => item.wonder !== 255).length, beforeWonders);
  assert.ok(countResources(tiles, hearts) > 0);
  assert.ok([...hearts].some((index) => tiles[index].wonder !== 255), "resource relocation starved the natural-wonder destination");
  const evidence = evaluateNarrativeContentEvidence(fixtureMap(width, height, tiles, [], mapStructure), program);
  assert.notEqual(evidence.status, "FAILED", evidence.findings.map((finding) => finding.evidence).join("\n"));
});

test("SOFTEN_CONTENT_CONTRAST changes both effective cold-frontier placement and its evidence target", () => {
  const width = 12;
  const height = 8;
  const createTiles = () => Array.from({ length: width * height }, (_value, index) => {
    const cold = index % width < 6;
    const item = tile({ terrain: cold ? 5 : 2 });
    if (!cold && Math.floor(index / width) < 7) { item.resource = 0; item.resourceAmount = 1; }
    return item;
  });
  const { options, recipe, program } = programmeFor("ICEHOUSE_EARTH", width, height);
  const skeleton = compileNarrativeSkeleton(options, recipe, width, height, false);
  const relaxation = program.generative!.relaxationPolicy.find((step) => step.operations.some((operation) => operation.kind === "SOFTEN_CONTENT_CONTRAST"))!;
  const effective = compileNarrativeAdapterPlan(program, skeleton, [relaxation.id]).native.contract;
  assert.ok(effective.content.valueContrast < program.generative!.content.valueContrast);
  const originalTiles = createTiles();
  const softenedTiles = createTiles();
  applyNarrativeContent(originalTiles, RESOURCES, skeleton, width, height, false, program.generative, structure([], "PHYSICAL"));
  applyNarrativeContent(softenedTiles, RESOURCES, skeleton, width, height, false, effective, structure([], "PHYSICAL"));
  const coldIndices = originalTiles.flatMap((_item, index) => index % width < 6 ? [index] : []);
  assert.ok(countResources(originalTiles, coldIndices) > countResources(softenedTiles, coldIndices));
  assert.deepEqual(contentMultiset(originalTiles), contentMultiset(softenedTiles));

  const evidenceTiles = createTiles();
  for (const index of evidenceTiles.flatMap((_item, index) => index % width < 6 ? [index] : []).slice(0, 14)) { evidenceTiles[index].resource = 0; evidenceTiles[index].resourceAmount = 1; }
  const evidenceMap = fixtureMap(width, height, evidenceTiles, [], structure([], "PHYSICAL"));
  const authoredEvidence = evaluateNarrativeContentEvidence(evidenceMap, program, program.generative);
  const effectiveEvidence = evaluateNarrativeContentEvidence(evidenceMap, program, effective);
  assert.ok(effectiveEvidence.score > authoredEvidence.score);
  assert.match(effectiveEvidence.findings[0].evidence, new RegExp(`${Math.round(effective.content.valueContrast * 100)}% contrast`));
});

test("final-river enrichment is deterministic, preserves start supplies, and increases actual valley value", () => {
  const width = 14;
  const height = 10;
  const createTiles = () => Array.from({ length: width * height }, (_value, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const item = tile({ river: x === 10 && y >= 2 && y <= 7 ? 1 : 0 });
    if ((x <= 4 && y >= 1 && y <= 8) || index === width + 2) { item.resource = 0; item.resourceAmount = 1; }
    return item;
  });
  const starts: Civ5StartLocation[] = [{ x: 1, y: 1, player: 0, civilization: "", leader: "", team: 0, playable: true, cityState: false }];
  const { program } = programmeFor("LIVING_WORLD", width, height);
  const first = createTiles();
  const second = createTiles();
  const before = contentMultiset(first);
  const protectedSupply = width + 2;
  const valley = new Set<number>();
  for (let y = 0; y < height; y += 1) for (let x = 7; x <= 13; x += 1) valley.add(y * width + x);
  const beforeValley = countResources(first, valley);
  applyNarrativeRiverValleyContent(first, RESOURCES, starts, width, height, false, program.generative);
  applyNarrativeRiverValleyContent(second, RESOURCES, starts, width, height, false, program.generative);
  assert.deepEqual(first, second);
  assert.deepEqual(contentMultiset(first), before);
  assert.equal(first[protectedSupply].resource, 0, "the major start's protected supply was taken for narrative concentration");
  assert.ok(countResources(first, valley) > beforeValley);
});

test("contested city-state placement preserves population and global spacing while moving the authored fraction", () => {
  const width = 30;
  const height = 18;
  const tiles = Array.from({ length: width * height }, () => tile());
  const starts: Civ5StartLocation[] = [
    [3, 3], [26, 3], [3, 14], [26, 14],
  ].map(([x, y], player) => ({ x, y, player, civilization: "", leader: "", team: player, playable: true, cityState: false }));
  starts.push(
    { x: 10, y: 1, player: 4, civilization: "", leader: "", team: 255, playable: false, cityState: true },
    { x: 19, y: 16, player: 5, civilization: "", leader: "", team: 255, playable: false, cityState: true },
  );
  const contested: number[] = [];
  for (let y = 7; y <= 10; y += 1) for (let x = 11; x <= 18; x += 1) contested.push(y * width + x);
  const mapStructure = structure([{ id: "objective", name: "Shared Objective", kind: "STRATEGIC_REGION", tileIndices: contested, attributes: { role: "OBJECTIVE" } }], "POLIS");
  mapStructure.strategicGraph = {
    version: 2,
    mapType: "IMPERIAL_RING",
    pattern: "RADIAL",
    symmetry: "EQUIVALENT",
    nodes: starts.map((start) => ({ id: start.cityState ? `city-state-${start.player}` : `major-${start.player}`, kind: start.cityState ? "CITY_STATE" : "MAJOR_START", x: start.x, y: start.y, owner: start.player })),
    edges: [],
    protectedTileIndices: [],
    relaxations: [],
    metrics: {},
    matchIntent: { humanPlayers: 0, aiPlayers: 0, flexiblePlayers: 4, teamIntent: "NONE", competitiveStrictness: "STANDARD", aiAccommodation: "STANDARD", enabledVictories: [], emphasizedVictories: [] },
    realmRoles: [],
    victoryFeasibility: [],
  };
  const { program } = programmeFor("IMPERIAL_RING", width, height);
  const beforePlayers = starts.map((start) => start.player);
  const moved = applyNarrativeCityStateContestability(starts, tiles, width, height, false, program.generative, mapStructure, 5);
  assert.equal(moved, 2);
  assert.deepEqual(starts.map((start) => start.player), beforePlayers);
  for (let one = 0; one < starts.length; one += 1) for (let two = one + 1; two < starts.length; two += 1) {
    const a = starts[one]; const b = starts[two];
    const aq = a.x - (a.y - (a.y & 1)) / 2; const bq = b.x - (b.y - (b.y & 1)) / 2;
    const distance = (Math.abs(aq - bq) + Math.abs(aq + a.y - bq - b.y) + Math.abs(a.y - b.y)) / 2;
    assert.ok(distance >= 5, `${a.player}/${b.player} ended ${distance} tiles apart`);
  }
  const map = fixtureMap(width, height, tiles, starts, mapStructure);
  const cityStateFinding = evaluateNarrativeContentEvidence(map, program).findings.find((finding) => finding.id === "contested-city-states")!;
  assert.equal(cityStateFinding.status, "MET", cityStateFinding.evidence);
  for (const start of starts.filter((candidate) => candidate.cityState)) {
    const graphNode: NonNullable<GenerationStructure["strategicGraph"]>["nodes"][number] = mapStructure.strategicGraph!.nodes
      .find((candidate) => candidate.kind === "CITY_STATE" && candidate.owner === start.player)!;
    assert.deepEqual([graphNode.x, graphNode.y], [start.x, start.y]);
  }
});

test("Brutal Opposing Fronts relocates existing camps and ruins into the DMZ and adds only sparse legal fallout", () => {
  const width = 30;
  const height = 18;
  const createTiles = () => Array.from({ length: width * height }, () => tile());
  const starts: Civ5StartLocation[] = [[3, 3], [26, 3], [3, 14], [26, 14]].map(([x, y], player) => ({
    x, y, player, civilization: "", leader: "", team: Math.floor(player / 2), playable: true, cityState: false,
  }));
  const contested: number[] = [];
  for (let y = 5; y <= 12; y += 1) for (let x = 11; x <= 18; x += 1) contested.push(y * width + x);
  const createStructure = () => structure([{ id: "dmz", name: "Demilitarized Frontier", kind: "STRATEGIC_REGION", tileIndices: contested, attributes: { role: "OBJECTIVE" } }], "POLIS");
  const seedSites = (tiles: Civ5Tile[]) => {
    for (const [x, y] of [[8, 5], [22, 5], [8, 12], [22, 12]]) tiles[y * width + x].improvement = "IMPROVEMENT_BARBARIAN_CAMP";
    for (const [x, y] of [[9, 8], [21, 8]]) tiles[y * width + x].improvement = "IMPROVEMENT_GOODY_HUT";
    tiles[8 * width + 14].resource = 11;
    tiles[8 * width + 14].resourceAmount = 1;
    tiles[9 * width + 15].wonder = 0;
  };
  const first = createTiles();
  const second = createTiles();
  seedSites(first);
  seedSites(second);
  const options = optionsFor("OPPOSING_FRONTS", { style: "BRUTAL", players: 4, cityStates: 0, barbarianAbundance: "STANDARD", ruinAbundance: "STANDARD" });
  const recipe = generationRecipeFromOptions(options);
  const program = compileCatalogueNarrativeProgram(recipe, { width, height, wraps: false });
  const firstStructure = createStructure();
  const firstResult = applyNarrativeBrutalFrontierContent(first, FEATURES, starts, width, height, false, program.generative, firstStructure, options);
  const secondResult = applyNarrativeBrutalFrontierContent(second, FEATURES, structuredClone(starts), width, height, false, program.generative, createStructure(), options);
  assert.deepEqual(firstResult, secondResult);
  assert.deepEqual(first, second);
  assert.ok(firstResult.movedBarbarians >= 2);
  const retainedDmz = new Set(firstStructure.objects.filter((object) => object.kind === "STRATEGIC_REGION"
    && ["OBJECTIVE", "BRUTAL_DMZ"].includes(String(object.attributes?.role))).flatMap((object) => object.tileIndices));
  assert.ok(first.flatMap((item, index) => item.improvement === "IMPROVEMENT_GOODY_HUT" && retainedDmz.has(index) ? [index] : []).length >= 1);
  assert.ok(firstResult.addedFallout >= 1 && firstResult.addedFallout <= program.generative!.content.sitePolicy!.falloutMaximum);
  assert.equal(first.filter((item) => item.improvement === "IMPROVEMENT_BARBARIAN_CAMP").length, 4);
  assert.equal(first.filter((item) => item.improvement === "IMPROVEMENT_GOODY_HUT").length, 2);
  const falloutIndex = FEATURES.indexOf("FEATURE_FALLOUT");
  for (const index of first.flatMap((item, index) => item.feature === falloutIndex ? [index] : [])) {
    assert.ok(retainedDmz.has(index));
    assert.equal(first[index].resource, 255);
    assert.equal(first[index].wonder, 255);
    assert.equal(first[index].improvement, undefined);
  }
  const map = fixtureMap(width, height, first, starts, firstStructure);
  map.generation = options;
  const siteFindings = evaluateNarrativeContentEvidence(map, program).findings.filter((finding) => finding.id.startsWith("brutal-frontier-"));
  assert.deepEqual(siteFindings.map((finding) => finding.status), ["MET", "MET", "MET"], siteFindings.map((finding) => finding.evidence).join("\n"));

  const noneMap = fixtureMap(width, height, createTiles(), starts, createStructure());
  noneMap.generation = { ...options, barbarianAbundance: "NONE", ruinAbundance: "NONE" };
  applyNarrativeBrutalFrontierContent(noneMap.tiles, FEATURES, noneMap.startLocations, width, height, false, program.generative, noneMap.structure, noneMap.generation);
  const noneFindings = evaluateNarrativeContentEvidence(noneMap, program).findings.filter((finding) => finding.id.startsWith("brutal-frontier-"));
  assert.deepEqual(noneFindings.map((finding) => finding.status), ["NOT_APPLICABLE", "NOT_APPLICABLE", "MET"]);
  const missingSitesMap = fixtureMap(width, height, createTiles(), starts, createStructure());
  missingSitesMap.generation = options;
  applyNarrativeBrutalFrontierContent(missingSitesMap.tiles, FEATURES, missingSitesMap.startLocations, width, height, false, program.generative, missingSitesMap.structure, options);
  const missingSiteFindings = evaluateNarrativeContentEvidence(missingSitesMap, program).findings.filter((finding) => finding.id === "brutal-frontier-barbarians" || finding.id === "brutal-frontier-ruins");
  assert.deepEqual(missingSiteFindings.map((finding) => finding.status), ["FAILED", "FAILED"]);
  assert.ok(missingSiteFindings.every((finding) => finding.evidence.includes("relocation-only narrative policy cannot invent")));
  const nonBrutal = { ...noneMap, generation: { ...noneMap.generation, style: "REALISTIC" as const } };
  assert.deepEqual(evaluateNarrativeContentEvidence(nonBrutal, program).findings.filter((finding) => finding.id.startsWith("brutal-frontier-")).map((finding) => finding.status), ["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"]);
});

test("site-policy schema fails closed and generated Brutal Opposing Fronts is legal and satisfied", () => {
  const original = narrativeNativeContract("OPPOSING_FRONTS");
  const wrongCharacter = structuredClone(original) as NarrativeGenerativeContract;
  (wrongCharacter.content.sitePolicy as unknown as { activationCharacter: string }).activationCharacter = "FANTASTICAL";
  assert.throws(() => validateNarrativeNativeContract(wrongCharacter, "OPPOSING_FRONTS", "POLIS"), /activationCharacter must be BRUTAL/);
  const wrongTheatre = structuredClone(original) as NarrativeGenerativeContract;
  (wrongTheatre.content.sitePolicy as unknown as { theatre: string }).theatre = "SAFE_REALM";
  assert.throws(() => validateNarrativeNativeContract(wrongTheatre, "OPPOSING_FRONTS", "POLIS"), /theatre must be CONTESTED_DMZ/);

  const map = generateMap(optionsFor("OPPOSING_FRONTS", {
    players: 4,
    cityStates: 2,
    style: "BRUTAL",
    barbarianAbundance: "STANDARD",
    ruinAbundance: "STANDARD",
    seed: "brutal-frontier-generated",
  }));
  const siteFindings = map.structure!.narrativeContentEvidence!.findings.filter((finding) => finding.id.startsWith("brutal-frontier-"));
  assert.equal(siteFindings.some((finding) => finding.status === "FAILED"), false, siteFindings.map((finding) => finding.evidence).join("\n"));
  assert.notEqual(map.structure!.narrativeContentEvidence!.status, "FAILED");
  assert.equal(map.tiles.filter((item) => item.improvement === "IMPROVEMENT_BARBARIAN_CAMP").length, 5);
  assert.equal(map.tiles.filter((item) => item.improvement === "IMPROVEMENT_GOODY_HUT").length, 5);
  const distance = (one: [number, number], two: [number, number]) => {
    const aq = one[0] - (one[1] - (one[1] & 1)) / 2;
    const bq = two[0] - (two[1] - (two[1] & 1)) / 2;
    const direct = (a: number) => (Math.abs(a - bq) + Math.abs(a + one[1] - bq - two[1]) + Math.abs(one[1] - two[1])) / 2;
    return map.wraps ? Math.min(direct(aq), direct(aq - map.width), direct(aq + map.width)) : direct(aq);
  };
  for (let one = 0; one < map.startLocations.length; one += 1) for (let two = one + 1; two < map.startLocations.length; two += 1) {
    assert.ok(distance([map.startLocations[one].x, map.startLocations[one].y], [map.startLocations[two].x, map.startLocations[two].y]) >= 5);
  }
  const falloutIndex = map.features.indexOf("FEATURE_FALLOUT");
  const fallout = map.tiles.flatMap((item, index) => item.feature === falloutIndex ? [index] : []);
  assert.ok(fallout.length > 0 && fallout.length <= original.content.sitePolicy!.falloutMaximum);
  for (const index of fallout) {
    const item = map.tiles[index];
    assert.ok(item.terrain >= 2 && item.elevation < 2);
    assert.equal(item.resource, 255);
    assert.equal(item.wonder, 255);
    assert.equal(item.improvement, undefined);
    assert.ok(map.startLocations.every((start) => distance([index % map.width, Math.floor(index / map.width)], [start.x, start.y]) >= original.content.sitePolicy!.falloutStartBuffer));
  }
  assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
});

test("distributed Review excludes inapplicable content while applicable content contributes and perceptual remains unassessed", () => {
  const distributed = generateMap(optionsFor("CONTINENTS", { players: 2, cityStates: 0, seed: "review-distributed" }));
  const distributedStructure = distributed.structure!;
  assert.equal(distributedStructure.narrativeContentEvidence!.status, "NOT_APPLICABLE");
  assert.equal(distributedStructure.reviewEvidence!.narrative.score, Math.round(distributedStructure.narrativeEvaluation!.score));
  assert.equal(distributedStructure.reviewEvidence!.perceptual.status, "UNASSESSED");
  assert.equal(distributedStructure.reviewEvidence!.perceptual.score, 0);

  const applicable = generateMap(optionsFor("LIVING_WORLD", { players: 2, cityStates: 0, seed: "review-applicable" }));
  const applicableStructure = applicable.structure!;
  const semantic = applicableStructure.narrativeEvaluation!.score;
  const content = applicableStructure.narrativeContentEvidence!.score;
  assert.notEqual(applicableStructure.narrativeContentEvidence!.status, "NOT_APPLICABLE");
  assert.equal(applicableStructure.reviewEvidence!.narrative.score, Math.round(semantic * 0.78 + content * 0.22));
  assert.equal(applicableStructure.reviewEvidence!.perceptual.status, "UNASSESSED");
});

test("representative applicable patterns remain truthful under sparse settings and generated output is Repair-clean", () => {
  const representatives = [
    "ARCHIPELAGO", "INLAND_SEAS", "EARTHSEA", "LIVING_WORLD", "MYTHIC_REGIONS",
    "LONELY_OCEANS", "ICEHOUSE_EARTH", "IMPERIAL_RING", "THALASSIC_LEAGUE", "UNEQUAL_REALMS",
  ] as const;
  for (const profileId of representatives) {
    const map = generateMap(optionsFor(profileId, {
      players: profileId === "THALASSIC_LEAGUE" || profileId === "UNEQUAL_REALMS" || profileId === "IMPERIAL_RING" ? 4 : 2,
      cityStates: profileId === "IMPERIAL_RING" || profileId === "THALASSIC_LEAGUE" ? 2 : 1,
      bonusAbundance: "SCARCE",
      luxuryAbundance: "SCARCE",
      strategicAbundance: "SCARCE",
      wonderCount: 0,
      seed: `content-sparse-${profileId.toLowerCase()}`,
    }));
    assert.notEqual(map.structure!.narrativeContentEvidence!.status, "FAILED", `${profileId}: ${map.structure!.narrativeContentEvidence!.findings.map((finding) => finding.evidence).join(" ")}`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], profileId);
  }
});

test("Colossal local content obligations remain capacity-aware and Repair-clean", () => {
  for (const [profileId, players, cityStates] of [["SUPERCONTINENT_INTERIOR", 6, 4], ["IMPERIAL_RING", 8, 6]] as const) {
    const map = generateMap(optionsFor(profileId, { size: "COLOSSAL", players, cityStates, seed: `content-colossal-${profileId.toLowerCase()}` }));
    assert.notEqual(map.structure!.narrativeContentEvidence!.status, "FAILED", `${profileId}: ${map.structure!.narrativeContentEvidence!.findings.map((finding) => finding.evidence).join(" ")}`);
    assert.equal(map.structure!.narrativeNativeEvidence!.status, "PROVEN", `${profileId} did not retain its native Colossal invariant`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], profileId);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${profileId} exports an invalid Colossal Civ5Map`);
    if (profileId === "SUPERCONTINENT_INTERIOR") {
      const colossalProof = provePhysicalPolisNativeFacts(profileId, map, map.structure!.narrativeAdapter!);
      const directedSystems = reconstructCiv5RiverEdgeSystems(map)
        .filter((system) => system.edgeCount >= 2 && system.acyclic && system.directedToOutlet);
      const semantics = extractNarrativeSemantics(map);
      assert.equal(colossalProof.ok, true, colossalProof.evidence.join(" "));
      assert.ok(Number(colossalProof.measurements.provenCatchments) >= 3);
      assert.ok(directedSystems.length >= 3, "the retained catchments are not three distinct final Civ V edge systems");
      assert.ok((semantics.metrics["endorheic-watershed-count"]?.value ?? 0) >= 3, "the semantic model does not agree that three systems drain into the enclosed basin");
    }
    if (profileId === "IMPERIAL_RING") {
      const colossalProof = provePhysicalPolisNativeFacts("IMPERIAL_RING", map, map.structure!.narrativeAdapter!);
      assert.equal(map.startLocations.filter((start) => !start.cityState).length, 8);
      assert.equal(colossalProof.ok, true, colossalProof.evidence.join(" "));
      assert.ok(Number(colossalProof.measurements.ringNodes) >= 8);
      assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * map.generation!.waterPercent / 100));
      const objects = new Map(map.structure!.objects.map((object) => [object.id, object]));
      const causalEdges = new Set(map.structure!.narrativeAdapter!.causalObjects
        .filter((cause) => cause.retained && cause.role === "LATERAL_RING")
        .flatMap((cause) => String(objects.get(cause.nativeObjectId)?.attributes?.strategicSources ?? "").split(",").filter(Boolean)));
      const graph = map.structure!.strategicGraph!;
      const majorCount = map.startLocations.filter((start) => !start.cityState).length;
      const ringEdges = Array.from({ length: majorCount }, (_value, owner) => {
        const next = (owner + 1) % majorCount;
        return graph.edges.find((edge) => {
          const endpoints = new Set([edge.from, edge.to]);
          return endpoints.has(`major-${owner + 1}`) && endpoints.has(`major-${next + 1}`);
        });
      });
      assert.ok(ringEdges.every((edge) => edge && causalEdges.has(edge.id)), "Imperial Ring's exact causal bindings do not cover the complete eight-seat circuit");
      for (const roster of [2, 4] as const) {
        const rosterMap = generateMap(optionsFor("IMPERIAL_RING", { size: "DUEL", players: roster, cityStates: 1, seed: `content-imperial-ring-${roster}-major` }));
        const proof = provePhysicalPolisNativeFacts("IMPERIAL_RING", rosterMap, rosterMap.structure!.narrativeAdapter!);
        assert.equal(rosterMap.startLocations.filter((start) => !start.cityState).length, roster);
        assert.equal(proof.ok, true, `${roster}-major Imperial Ring: ${proof.evidence.join(" ")}`);
        assert.ok(Number(proof.measurements.ringNodes) >= Math.max(4, roster), `${roster}-major Imperial Ring lost its four-seat-or-larger geographic circuit`);
        assert.equal(rosterMap.tiles.filter((tile) => tile.terrain < 2).length, Math.round(rosterMap.tiles.length * rosterMap.generation!.waterPercent / 100));
        assert.deepEqual(buildRepairIssues(rosterMap).filter((issue) => issue.id !== "clean"), [], `${roster}-major Imperial Ring`);
        assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(rosterMap)).filter((issue) => issue.severity === "ERROR"), [], `${roster}-major Imperial Ring exports an invalid Civ5Map`);
        const adversarial = structuredClone(rosterMap);
        const lateralObject = adversarial.structure!.objects.find((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "LATERAL_RING" && object.attributes?.strategicSources);
        const removedEdgeId = String(lateralObject?.attributes?.strategicSources ?? "").split(",")[0];
        adversarial.structure!.strategicGraph!.edges = adversarial.structure!.strategicGraph!.edges.filter((edge) => edge.id !== removedEdgeId);
        assert.equal(provePhysicalPolisNativeFacts("IMPERIAL_RING", adversarial, adversarial.structure!.narrativeAdapter!).ok, false, `${roster}-major Imperial Ring accepted a broken causal circuit`);
      }
    }
  }
});
