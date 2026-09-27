import assert from "node:assert/strict";
import test from "node:test";
import { inspectCiv5MapStructure, serializeCiv5Map, type Civ5Map } from "../lib/civ5-map.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS, generateMap, type MapPresetId } from "../lib/map-generator.ts";
import { evaluateNarrativeNaturalism } from "../lib/narrative-naturalism.ts";

function options(id: MapPresetId, seed: string, size: "TINY" | "STANDARD" = "TINY") {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === id)!;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: id,
    size,
    seed,
    players: size === "STANDARD" ? 8 : 4,
    cityStates: size === "STANDARD" ? 8 : 4,
    style: preset.engine === "ECCENTRIC" ? "FANTASTICAL" as const : preset.engine === "PHYSICAL" ? "REALISTIC" as const : "MUNDANE" as const,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    climateRealism: preset.climateRealism ?? DEFAULT_GENERATION_OPTIONS.climateRealism,
    riverDensity: preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
  };
}

function recompute(map: Civ5Map) {
  return evaluateNarrativeNaturalism(map, map.structure!.narrativeProgram!);
}

test("all thirty-three owner maps retain fail-closed naturalism evidence and legal output", () => {
  for (const preset of MAP_PRESETS) {
    const map = generateMap(options(preset.id, `naturalism-owner-${preset.id.toLowerCase()}`));
    assert.ok(map.structure?.narrativeNaturalismEvidence, `${preset.id} omitted naturalism evidence`);
    assert.notEqual(map.structure!.narrativeNaturalismEvidence!.status, "FAILED", `${preset.id}: ${map.structure!.narrativeNaturalismEvidence!.findings.filter((finding) => finding.status === "FAILED").map((finding) => finding.evidence).join(" | ")}`);
    assert.deepEqual(recompute(map), map.structure!.narrativeNaturalismEvidence, `${preset.id} retained stale naturalism evidence`);
    assert.ok(map.structure!.reviewEvidence?.naturalism, `${preset.id} omitted the Review naturalism axis`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} requires Repair`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} exports an invalid Civ5Map`);
  }
});

test("critical Standard identities retain scale-aware morphology and causality", () => {
  for (const id of ["EARTHSEA", "RIFT_REALMS", "SHATTERED_BASINS", "RIFTWORLD", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO", "COLLIDING_PLATES", "ISLAND_ARC_EARTH", "SUPERCONTINENT_INTERIOR", "ICEHOUSE_EARTH", "RIVAL_CONTINENTS", "THREE_REALMS", "THALASSIC_LEAGUE"] as const) {
    const map = generateMap(options(id, `naturalism-standard-${id.toLowerCase()}`, "STANDARD"));
    assert.notEqual(map.structure!.narrativeNaturalismEvidence!.status, "FAILED", `${id} failed its Standard naturalism floor`);
    assert.equal(map.startLocations.filter((start) => !start.cityState).length, id === "THREE_REALMS" ? 6 : 8, `${id} lost its supported major population`);
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.severity === "ERROR"), [], `${id} Standard output requires Repair`);
  }
});

test("naturalism rejects literal construction graphs and causal-surface impostors", () => {
  const crossroads = generateMap(options("SHATTERED_BASINS", "naturalism-adversary-crossroads"));
  const framed = structuredClone(crossroads);
  const row = Math.floor(framed.height / 2);
  for (let x = 0; x < framed.width; x += 1) framed.tiles[row * framed.width + x] = { ...framed.tiles[row * framed.width + x], terrain: 3, elevation: 0 };
  assert.equal(recompute(framed).findings.find((finding) => finding.id === "local-basin-rims")?.status, "FAILED");

  const chains = generateMap(options("SHATTERED_ARCHIPELAGO", "naturalism-adversary-chains"));
  const wired = structuredClone(chains);
  const arc = wired.structure!.objects.find((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "FOLLOWS_ARC")!;
  for (const index of arc.tileIndices) wired.tiles[index] = { ...wired.tiles[index], terrain: 3, elevation: 0 };
  assert.equal(recompute(wired).findings.find((finding) => finding.id === "latent-parent-arcs")?.status, "FAILED");

  const ice = generateMap(options("ICEHOUSE_EARTH", "naturalism-adversary-ice"));
  const stamped = structuredClone(ice);
  for (const refuge of stamped.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "REFUGE")) refuge.attributes = { ...refuge.attributes, meanTemperature: 0.08, meanMoisture: 0.12 };
  assert.equal(recompute(stamped).findings.find((finding) => finding.id === "climate-caused-refuges")?.status, "FAILED");

  const collision = generateMap(options("COLLIDING_PLATES", "naturalism-adversary-collision"));
  const decorative = structuredClone(collision);
  const belt = decorative.structure!.objects.find((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "COLLISION_BELT")!;
  const affected = new Set(belt.tileIndices);
  for (const index of belt.tileIndices) {
    const x = index % decorative.width;
    const y = Math.floor(index / decorative.width);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nextX = (x + dx + decorative.width) % decorative.width;
      const nextY = y + dy;
      if (nextY >= 0 && nextY < decorative.height) affected.add(nextY * decorative.width + nextX);
    }
  }
  for (const index of affected) if (decorative.tiles[index].terrain >= 2) decorative.tiles[index] = { ...decorative.tiles[index], elevation: 0 };
  assert.equal(recompute(decorative).findings.find((finding) => finding.id === "material-collision-belts")?.status, "FAILED");

  const rival = generateMap(options("RIVAL_CONTINENTS", "naturalism-adversary-rival"));
  const board = structuredClone(rival);
  const hinge = board.structure!.objects.find((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "PRIMARY_HINGE")!;
  const y = Math.floor(board.height / 2);
  hinge.tileIndices = Array.from({ length: board.width - 8 }, (_value, x) => y * board.width + x + 4);
  assert.equal(recompute(board).findings.find((finding) => finding.id === "geographic-strategic-disguise")?.status, "FAILED");
});
