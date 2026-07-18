import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, serializeCiv5Map } from "../lib/civ5-map.ts";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../lib/excogitare-project.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, generateMapFromRecipe, MAP_PRESETS, randomGenerationOptions, resolveMapDimensions, type MapGenerationOptions, type MapPresetId } from "../lib/map-generator.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { compileNarrativeSkeleton, NARRATIVE_PROFILES, narrativeProfile } from "../lib/narrative-map-types.ts";

const FUTURE_POLIS = ["THREE_REALMS", "THALASSIC_LEAGUE", "UNEQUAL_REALMS"] as const;
const BENCHMARKS = ["LONELY_OCEANS", "SHATTERED_ARCHIPELAGO", "GREAT_WATERSHEDS", "ICEHOUSE_EARTH"] as const;
const PHASE_FIVE = MAP_PRESETS.filter((preset) => preset.engine !== "POLIS").map((preset) => preset.id);

function benchmarkOptions(id: MapPresetId, seed = `narrative-${id.toLowerCase()}`): MapGenerationOptions {
  const preset = MAP_PRESETS.find((item) => item.id === id)!;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: id,
    size: "SMALL",
    seed,
    players: 6,
    cityStates: 6,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    riverDensity: preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    climateRealism: preset.climateRealism ?? DEFAULT_GENERATION_OPTIONS.climateRealism,
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
  };
}

test("the narrative catalogue is exhaustive, distinctive and honest about implementation", () => {
  assert.equal(MAP_PRESETS.length, 30);
  assert.equal(Object.keys(NARRATIVE_PROFILES).length, MAP_PRESETS.length + FUTURE_POLIS.length);
  assert.deepEqual(new Set(Object.keys(NARRATIVE_PROFILES)), new Set([...MAP_PRESETS.map((preset) => preset.id), ...FUTURE_POLIS]));
  assert.equal(new Set(Object.values(NARRATIVE_PROFILES).map((profile) => profile.verb)).size, Object.keys(NARRATIVE_PROFILES).length);
  assert.deepEqual(Object.values(NARRATIVE_PROFILES).filter((profile) => profile.implementation === "BENCHMARK").map((profile) => profile.id).sort(), [...PHASE_FIVE].sort());
  assert.deepEqual(Object.values(NARRATIVE_PROFILES).filter((profile) => profile.implementation === "PROFILE_ONLY").map((profile) => profile.id).sort(), MAP_PRESETS.filter((preset) => preset.engine === "POLIS").map((preset) => preset.id).sort());
  for (const profile of Object.values(NARRATIVE_PROFILES)) {
    assert.ok(profile.premise.length > 35, `${profile.id} lacks a concrete premise`);
    assert.ok(profile.requiredMotifs.length > 0, `${profile.id} lacks required motifs`);
    assert.ok(profile.forbiddenMotifs.length > 0, `${profile.id} lacks anti-motifs`);
    assert.ok(profile.nearestConfusions.length > 0, `${profile.id} lacks nearest-confusion boundaries`);
    assert.ok(profile.blindRecognition.length > 25, `${profile.id} lacks a blind-recognition statement`);
  }
  for (const id of FUTURE_POLIS) assert.equal(narrativeProfile(id).implementation, "FUTURE_RUNTIME");
});

test("compiled narrative skeletons are deterministic and disclose conflicting explicit controls", () => {
  for (const id of PHASE_FIVE) {
    const options = benchmarkOptions(id);
    const recipe = generationRecipeFromOptions(options);
    const dimensions = resolveMapDimensions(options.size, options.geometry);
    const first = compileNarrativeSkeleton(options, recipe, dimensions.width, dimensions.height, true);
    const second = compileNarrativeSkeleton(options, recipe, dimensions.width, dimensions.height, true);
    assert.deepEqual(first, second);
    assert.equal(first.profileId, id);
    assert.equal(first.implementation, "BENCHMARK");
    assert.ok(first.regions.length > 1);
    assert.equal(first.conflicts.length, 0);
  }
  const lonely = benchmarkOptions("LONELY_OCEANS");
  lonely.waterPercent = 30;
  lonely.mountainPercent = 30;
  const dimensions = resolveMapDimensions(lonely.size, lonely.geometry);
  const conflicted = compileNarrativeSkeleton(lonely, generationRecipeFromOptions(lonely), dimensions.width, dimensions.height, true);
  assert.equal(conflicted.conflicts.length, 2);
  assert.match(conflicted.conflicts.join(" "), /outside the 84–94% narrative envelope/);
});

test("Randomise respects each selected Map Type's ordinary narrative envelope", () => {
  let state = 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let index = 0; index < 120; index += 1) {
    const options = randomGenerationOptions(random);
    const profile = narrativeProfile(options.preset);
    assert.ok(options.waterPercent >= profile.parameterEnvelope.water[0] && options.waterPercent <= profile.parameterEnvelope.water[1]);
    assert.ok(options.mountainPercent >= profile.parameterEnvelope.mountains[0]);
    if (options.modifier === "NONE" && options.style !== "BRUTAL") assert.ok(options.mountainPercent <= profile.parameterEnvelope.mountains[1]);
    if (profile.parameterEnvelope.preferredRiverDensity) assert.equal(options.riverDensity, profile.parameterEnvelope.preferredRiverDensity);
  }
});

test("four benchmark identities survive generation, legality and retained assessment", () => {
  const generated = new Map<MapPresetId, ReturnType<typeof generateMap>>();
  for (const id of BENCHMARKS) {
    const options = benchmarkOptions(id);
    const first = generateMap(options);
    const second = generateMap(options);
    assert.deepEqual(first.tiles, second.tiles, `${id} tile realization is not deterministic`);
    assert.deepEqual(first.structure?.narrativeSkeleton, second.structure?.narrativeSkeleton, `${id} skeleton is not deterministic`);
    assert.deepEqual(first.structure?.narrativeAssessment, second.structure?.narrativeAssessment, `${id} assessment is not deterministic`);
    assert.deepEqual(structuredClone(first.structure?.narrativeAssessment), first.structure?.narrativeAssessment, `${id} assessment is not worker-cloneable`);
    assert.ok(first.structure?.narrativeSkeleton);
    assert.ok(first.structure?.narrativeAssessment);
    assert.equal(first.structure?.narrativeAssessment?.implementation, "BENCHMARK");
    assert.ok(["A", "B"].includes(first.structure?.narrativeAssessment?.grade ?? ""), `${id} fell below its retained recognition benchmark`);
    assert.equal(first.structure?.narrativeAssessment?.parameterDeviations.length, 0);
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${id} should not require Repair after Create`);
    generated.set(id, first);
  }

  const lonely = generated.get("LONELY_OCEANS")!;
  const lonelyMajors = lonely.startLocations.filter((start) => !start.cityState);
  assert.equal(lonely.tiles.filter((tile) => tile.terrain < 2).length, Math.round(lonely.tiles.length * 0.89));
  assert.equal(lonely.startLocations.filter((start) => start.cityState).length, 0);
  assert.equal(lonely.structure?.objects.filter((object) => object.kind === "CONTINENT").length, lonelyMajors.length);
  assert.equal(lonely.structure?.narrativeAssessment?.motifs.find((finding) => finding.id === "one-major-per-realm")?.status, "MET");

  const chains = generated.get("SHATTERED_ARCHIPELAGO")!;
  const chainSkeleton = chains.structure!.narrativeSkeleton!;
  assert.ok((chainSkeleton.targets.parentSystems ?? 0) >= 4 && (chainSkeleton.targets.parentSystems ?? 0) <= 7);
  assert.equal(chainSkeleton.relationships.filter((relationship) => relationship.kind === "FOLLOWS_ARC").length, chainSkeleton.targets.parentSystems);
  assert.ok(chains.structure!.objects.some((object) => object.kind === "NARRATIVE_REGION" && object.attributes?.role === "ANCHOR"));

  const watersheds = generated.get("GREAT_WATERSHEDS")!;
  assert.ok(watersheds.structure!.riverSystems.length > 0);
  assert.ok(watersheds.structure!.riverSystems.every((river) => river.outlet !== undefined));
  assert.ok(watersheds.tiles.filter((tile) => tile.feature === 2).length >= 3);
  assert.equal(watersheds.structure!.narrativeSkeleton!.targets.tributaries, watersheds.structure!.narrativeSkeleton!.targets.trunkRivers * 2);

  const glacial = generated.get("ICEHOUSE_EARTH")!;
  const glacialLand = glacial.tiles.filter((tile) => tile.terrain >= 2);
  const frozen = glacialLand.filter((tile) => tile.terrain === 5 || tile.terrain === 6);
  assert.ok(frozen.length / glacialLand.length >= 0.48);
  assert.ok(frozen.some((tile) => tile.resource !== 255));
  assert.ok(glacial.structure!.objects.some((object) => object.kind === "ICE_SHEET"));
  assert.ok(glacial.structure!.objects.some((object) => object.kind === "REFUGE"));
});

test("the twenty-two Phase 5 identities compile into recognizable legal final maps", () => {
  const phaseFiveAdditions = PHASE_FIVE.filter((id) => !BENCHMARKS.includes(id as typeof BENCHMARKS[number]));
  assert.equal(phaseFiveAdditions.length, 22);
  for (const id of phaseFiveAdditions) {
    const options = benchmarkOptions(id, `phase-five-${id.toLowerCase()}`);
    options.size = "DUEL";
    options.players = 2;
    options.cityStates = 1;
    const first = generateMap(options);
    const second = generateMap(options);
    assert.deepEqual(first.tiles, second.tiles, `${id} final tiles are not deterministic`);
    assert.deepEqual(first.structure?.narrativeSkeleton, second.structure?.narrativeSkeleton, `${id} skeleton is not deterministic`);
    assert.ok((first.structure?.narrativeSkeleton?.regions.length ?? 0) > 1, `${id} fell through to a generic region`);
    assert.ok((first.structure?.narrativeSkeleton?.relationships.length ?? 0) > 0, `${id} lacks retained geographic relationships`);
    assert.ok(["A", "B"].includes(first.structure?.narrativeAssessment?.grade ?? ""), `${id} fell below its retained recognition benchmark (${first.structure?.narrativeAssessment?.score})`);
    assert.equal(first.structure?.narrativeAssessment?.parameterDeviations.length, 0);
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${id} should not require Repair after Create`);
  }
});

test("representative Phase 5 identities survive Scale, Character, and Archetype reinterpretation", () => {
  const cases = ["CONTINENTS", "INLAND_SEAS", "LIVING_WORLD", "MYTHIC_REGIONS", "ANCIENT_CRATONS", "ISLAND_ARC_EARTH"] as const;
  for (const id of cases) {
    const options = benchmarkOptions(id, `phase-five-matrix-${id.toLowerCase()}`);
    options.size = "DUEL";
    options.players = 2;
    options.cityStates = 1;
    options.style = narrativeProfile(id).engine === "PHYSICAL" ? "REALISTIC" : "FANTASTICAL";
    const recipe = generationRecipeFromOptions(options);
    recipe.scale = "REGIONAL";
    recipe.archetype = "TEMPERATE";
    const map = generateMapFromRecipe(recipe);
    assert.ok(["A", "B"].includes(map.structure?.narrativeAssessment?.grade ?? ""), `${id} lost recognition after reinterpretation`);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * options.waterPercent / 100));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
  }
});

test("benchmark identities survive representative Scale and World Character reinterpretations", () => {
  for (const id of BENCHMARKS) {
    const preset = MAP_PRESETS.find((item) => item.id === id)!;
    for (const scale of ["GLOBAL", "REGIONAL"] as const) {
      for (const style of ["REALISTIC", "BRUTAL"] as const) {
        const options = benchmarkOptions(id, `narrative-matrix-${id.toLowerCase()}-${scale.toLowerCase()}-${style.toLowerCase()}`);
        options.size = "DUEL";
        options.players = 2;
        options.cityStates = 2;
        options.style = style;
        options.mountainPercent = style === "BRUTAL" ? Math.max(18, preset.mountains) : preset.mountains;
        const recipe = generationRecipeFromOptions(options);
        recipe.scale = scale;
        const map = generateMapFromRecipe(recipe);
        const assessment = map.structure?.narrativeAssessment;
        assert.ok(assessment);
        assert.ok(["A", "B"].includes(assessment.grade), `${id} became unrecognizable under ${scale} ${style}`);
        assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * options.waterPercent / 100));
        assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), []);
      }
    }
  }
});

test("Phase 6 Polis Map Types retain intent without claiming a completed specialized compiler", () => {
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, preset: "IMPERIAL_RING", engine: "POLIS", size: "DUEL", players: 2, cityStates: 1, seed: "profile-only-honesty" });
  assert.equal(map.structure?.narrativeSkeleton?.profileId, "IMPERIAL_RING");
  assert.equal(map.structure?.narrativeAssessment?.grade, "UNASSESSED");
  assert.equal(map.structure?.narrativeAssessment?.implementation, "PROFILE_ONLY");
  assert.ok(map.structure?.narrativeAssessment?.motifs.every((finding) => finding.status === "UNAVAILABLE"));
});

test("project files retain narrative evidence while Civ5Map exports remain game-only", () => {
  const map = generateMap(benchmarkOptions("LONELY_OCEANS", "narrative-project"));
  const project = createExcogitareProject({ projectName: "Narrative project", map, recipe: map.recipe!, excogitareVersion: "1.3.0", now: "2026-07-17T00:00:00.000Z" });
  const restored = parseExcogitareProject(serializeExcogitareProject(project));
  assert.deepEqual(restored.map.structure?.narrativeSkeleton, map.structure?.narrativeSkeleton);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.derived?.narrative)), JSON.parse(JSON.stringify(map.structure?.narrativeAssessment)));

  const civMap = parseCiv5Map(serializeCiv5Map(map), "lonely-oceans.Civ5Map");
  assert.equal(civMap.structure, undefined);
  assert.equal(civMap.recipe, undefined);
});
