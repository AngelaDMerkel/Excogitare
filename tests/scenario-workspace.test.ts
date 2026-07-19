import assert from "node:assert/strict";
import test from "node:test";
import { parseCiv5Map, serializeCiv5Map } from "../lib/civ5-map.ts";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../lib/excogitare-project.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";
import { applyScenarioDraft, applyScenarioTileBrush, scenarioCompatibility, scenarioDraftFromMap, scenarioExportSummary, validateScenarioDraft } from "../lib/scenario-authoring.ts";

function scenarioMap(seed = "scenario-authoring") {
  return generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed });
}

test("Scenario drafts initialize complete authored state from current map records", () => {
  const map = scenarioMap();
  const draft = scenarioDraftFromMap(map);
  assert.equal(draft.setup?.majorSlotCapacity, 2);
  assert.equal(draft.setup?.cityStateSlotCapacity, 1);
  assert.equal(draft.factions.length, 3);
  assert.ok(draft.factions.every((faction, index) => faction.slot === index && faction.status === "ACTIVE" && faction.start));
  assert.deepEqual(draft.cities, map.cities ?? []);
  assert.equal(draft.projectOnly.briefing, "");
});

test("new Scenario faction, start, ownership, improvement and route edits remain project-side while ordinary export stays geography-only", () => {
  const map = scenarioMap("scenario-write");
  const draft = scenarioDraftFromMap(map);
  draft.name = "The Violet Compact";
  draft.description = "A fixed scenario export.";
  draft.factions[0].civilization = "CIVILIZATION_ROME";
  draft.factions[0].leader = "LEADER_AUGUSTUS";
  draft.factions[0].teamColor = "PLAYERCOLOR_ROMAN";
  draft.factions[0].team = 1;
  const target = map.tiles.findIndex((tile, index) => tile.terrain >= 2 && !draft.factions.some((faction) => faction.start && faction.start.x === index % map.width && faction.start.y === Math.floor(index / map.width)));
  assert.ok(target >= 0);
  draft.tileAssignments?.push({ x: target % map.width, y: Math.floor(target / map.width), ownerFactionId: draft.factions[0].id, improvement: "IMPROVEMENT_BARBARIAN_CAMP", route: "ROUTE_ROAD" });
  const authored = applyScenarioDraft(map, draft);
  const restored = parseCiv5Map(serializeCiv5Map(authored), "scenario.Civ5Map");
  assert.equal(restored.name, "The Violet Compact");
  assert.equal(restored.description, "A fixed scenario export.");
  assert.equal(authored.startLocations[0].civilization, "CIVILIZATION_ROME");
  assert.equal(authored.startLocations[0].leader, "LEADER_AUGUSTUS");
  assert.equal(authored.startLocations[0].teamColor, "PLAYERCOLOR_ROMAN");
  assert.equal(authored.startLocations[0].team, 1);
  assert.equal(authored.tiles[target].owner, 0);
  assert.equal(authored.tiles[target].improvement, "IMPROVEMENT_BARBARIAN_CAMP");
  assert.equal(authored.tiles[target].route, "ROUTE_ROAD");
  assert.equal(restored.scenarioDataPresent, false);
  assert.equal(restored.startLocations.length, 0);
  assert.equal(restored.tiles[target].owner, undefined);
  assert.equal(restored.tiles[target].improvement, undefined);
  assert.equal(restored.tiles[target].route, undefined);
  assert.equal(scenarioExportSummary(map, draft).ready, false);
  assert.ok(scenarioExportSummary(map, draft).errors.some((finding) => /construction is disabled/i.test(finding.message)));
});

test("Scenario layer brush applies and clears only selected record families across a hex region", () => {
  const map = scenarioMap("scenario-layer-brush");
  const draft = scenarioDraftFromMap(map);
  const anchor = { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  const painted = applyScenarioTileBrush(map, draft, anchor, 1, { ownerFactionId: draft.factions[0].id, improvement: "IMPROVEMENT_CITY_RUINS", route: "ROUTE_ROAD" });
  assert.equal(painted.tileAssignments?.filter((assignment) => assignment.ownerFactionId === draft.factions[0].id && assignment.improvement === "IMPROVEMENT_CITY_RUINS" && assignment.route === "ROUTE_ROAD").length, 7);
  const clearedOwnership = applyScenarioTileBrush(map, painted, anchor, 1, { ownerFactionId: null });
  assert.equal(clearedOwnership.tileAssignments?.filter((assignment) => assignment.ownerFactionId === undefined && assignment.improvement === "IMPROVEMENT_CITY_RUINS" && assignment.route === "ROUTE_ROAD").length, 7);
});

test("Scenario validation covers slots, starts, cities, references and Project-only objectives", () => {
  const map = scenarioMap("scenario-validation");
  const draft = scenarioDraftFromMap(map);
  draft.setup!.majorSlotCapacity += 1;
  draft.factions[0].start = { ...draft.factions[1].start! };
  draft.cities = [{ id: 1, name: "", owner: 99, population: 0, x: -1, y: -1, recordValid: false, duplicate: false }];
  draft.objectives.push({ id: "hold-the-strait", label: "Hold the strait", kind: "CONTROL", semanticId: "absent-strait", factionId: "absent-faction", projectOnly: true });
  draft.projectOnly.briefing = "A briefing retained only in the project.";
  const findings = validateScenarioDraft(map, draft);
  assert.ok(findings.some((finding) => finding.stage === "SETUP" && finding.severity === "ERROR"));
  assert.ok(findings.some((finding) => finding.stage === "FACTIONS" && /at least 5/.test(finding.message)));
  assert.ok(findings.some((finding) => finding.stage === "WORLD" && /absent faction slot/.test(finding.message)));
  assert.ok(findings.some((finding) => finding.stage === "OBJECTIVES" && finding.projectOnly));
  assert.ok(findings.some((finding) => finding.stage === "VALIDATE" && /briefing is Project only/.test(finding.message)));
  assert.equal(scenarioExportSummary(map, draft).ready, false);
});

test("Imported fixed improvement tables reject unsafe type-table expansion", () => {
  const map = scenarioMap("scenario-import-boundary");
  const draft = scenarioDraftFromMap(map);
  const tile = map.tiles.findIndex((item) => item.terrain >= 2);
  draft.tileAssignments = [{ x: tile % map.width, y: Math.floor(tile / map.width), improvement: "IMPROVEMENT_BARBARIAN_CAMP" }];
  const imported = { ...applyScenarioDraft(map, draft), source: "file" as const, scenarioDataPresent: true, scenarioPlayerSlots: 2, scenarioCityStateSlots: 1, scenarioImprovementTypes: ["IMPROVEMENT_BARBARIAN_CAMP"] };
  const importedDraft = scenarioDraftFromMap(imported);
  importedDraft.tileAssignments![0].improvement = "IMPROVEMENT_GOODY_HUT";
  assert.ok(validateScenarioDraft(imported, importedDraft).some((finding) => /fixed improvement table/.test(finding.message)));
});

test("Imported fixed Scenario records update in the authored model without mutating the imported map", () => {
  const generated = scenarioMap("scenario-imported-write");
  const generatedDraft = scenarioDraftFromMap(generated);
  const target = generated.tiles.findIndex((tile) => tile.terrain >= 2);
  generatedDraft.tileAssignments = [{ x: target % generated.width, y: Math.floor(target / generated.width), ownerFactionId: generatedDraft.factions[0].id, improvement: "IMPROVEMENT_CITY_RUINS", route: "ROUTE_RAILROAD" }];
  const imported = { ...applyScenarioDraft(generated, generatedDraft), source: "file" as const, scenarioDataPresent: true, scenarioPlayerSlots: 2, scenarioCityStateSlots: 1, scenarioImprovementTypes: ["IMPROVEMENT_CITY_RUINS"] };
  const sourceSnapshot = structuredClone(imported);
  const draft = scenarioDraftFromMap(imported);
  draft.factions[0].civilization = "CIVILIZATION_CARTHAGE";
  draft.factions[0].leader = "LEADER_DIDO";
  draft.factions[0].teamColor = "PLAYERCOLOR_CARTHAGE";
  draft.tileAssignments![0].ownerFactionId = draft.factions[1].id;
  draft.tileAssignments![0].route = "ROUTE_ROAD";
  const restored = applyScenarioDraft(imported, draft);
  assert.deepEqual(imported, sourceSnapshot);
  assert.equal(restored.startLocations[0].civilization, "CIVILIZATION_CARTHAGE");
  assert.equal(restored.startLocations[0].leader, "LEADER_DIDO");
  assert.equal(restored.startLocations[0].teamColor, "PLAYERCOLOR_CARTHAGE");
  assert.equal(restored.tiles[target].owner, 1);
  assert.equal(restored.tiles[target].improvement, "IMPROVEMENT_CITY_RUINS");
  assert.equal(restored.tiles[target].route, "ROUTE_ROAD");
});

test("Scenario compatibility labels Write separately from Game verified and discloses Project-only families", () => {
  const map = scenarioMap("scenario-capabilities");
  const draft = scenarioDraftFromMap(map);
  const report = scenarioCompatibility(map, draft);
  assert.equal(report.capabilities.METADATA, "GAME_VERIFIED");
  assert.equal(report.capabilities.FACTIONS, "EDIT");
  assert.equal(report.capabilities.STARTS, "EDIT");
  assert.equal(report.details?.FACTIONS.projectOnly, true);
  assert.equal(report.capabilities.OBJECTIVES, "EDIT");
  assert.equal(report.details?.OBJECTIVES.projectOnly, true);
  assert.match(report.details?.FACTIONS.explanation ?? "", /retained in the project/);

  const imported = { ...map, source: "file" as const, scenarioDataPresent: true };
  const importedReport = scenarioCompatibility(imported, scenarioDraftFromMap(imported));
  assert.equal(importedReport.capabilities.FACTIONS, "WRITE");
  assert.equal(importedReport.capabilities.STARTS, "WRITE");
  assert.equal(importedReport.details?.FACTIONS.projectOnly, false);
});

test("Scenario drafts and semantic objectives round-trip through durable projects", () => {
  const map = scenarioMap("scenario-project");
  const draft = scenarioDraftFromMap(map);
  draft.setup!.intent = "FIXED_SCENARIO";
  draft.setup!.intendedEra = "ERA_RENAISSANCE";
  draft.projectOnly.briefing = "Secure the watershed before the final age.";
  draft.objectives.push({ id: "protect-watershed", label: "Protect the watershed", kind: "PROTECT", semanticId: map.structure?.objects[0]?.semanticId, factionId: draft.factions[0].id, projectOnly: true });
  const project = createExcogitareProject({ projectName: "Scenario project", map, recipe: map.recipe!, scenario: draft, excogitareVersion: "test", now: "2026-07-18T00:00:00.000Z" });
  const restored = parseExcogitareProject(serializeExcogitareProject(project, { now: "2026-07-18T00:01:00.000Z" }));
  assert.equal(restored.scenario.setup?.intent, "FIXED_SCENARIO");
  assert.equal(restored.scenario.setup?.intendedEra, "ERA_RENAISSANCE");
  assert.equal(restored.scenario.projectOnly.briefing, "Secure the watershed before the final age.");
  assert.equal(restored.scenario.objectives[0].semanticId, map.structure?.objects[0]?.semanticId);
});
