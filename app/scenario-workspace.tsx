"use client";

import { useState } from "react";
import type { ScenarioCompatibilityReport, ScenarioDraft, ScenarioFaction, ScenarioObjective, ScenarioTileAssignment } from "@/lib/authoring-schema";
import type { Civ5Map } from "@/lib/civ5-map";
import { applyScenarioTileBrush, cloneScenarioDraft, SCENARIO_RECORD_FAMILIES, type ScenarioValidationFinding } from "@/lib/scenario-authoring";

export type ScenarioStage = "SETUP" | "FACTIONS" | "WORLD" | "OBJECTIVES" | "VALIDATE";

export function ScenarioStageTabs({ active, onChange }: { active: ScenarioStage; onChange: (stage: ScenarioStage) => void }) {
  const stages: Array<{ id: ScenarioStage; label: string; tooltip: string }> = [
    { id: "SETUP", label: "Setup", tooltip: "Define scenario identity, lobby intent, slot capacity, ruleset context and Project-only rule intentions." },
    { id: "FACTIONS", label: "Factions", tooltip: "Assign civilizations, leaders, teams, control intent and map-linked start plots to explicit slots." },
    { id: "WORLD", label: "World", tooltip: "Edit existing cities, political ownership, declared improvements and road or railroad records." },
    { id: "OBJECTIVES", label: "Objectives", tooltip: "Author faction, team, victory and semantic-geography goals retained in the Excogitare project." },
    { id: "VALIDATE", label: "Validate", tooltip: "Check scenario links, starts, records, Project-only omissions and Civ5Map export readiness without mutation." },
  ];
  return <div id="scenario-workspace-navigation" className="workspace-stage-tabs scenario-stage-tabs" role="tablist" aria-label="Scenario workspace">{stages.map((stage) => <button key={stage.id} type="button" role="tab" aria-controls="scenario-workspace-panel" aria-selected={active === stage.id} className={active === stage.id ? "is-active" : ""} data-tooltip={stage.tooltip} onClick={() => onChange(stage.id)}>{stage.label}</button>)}</div>;
}

function CapabilityBadge({ level, projectOnly }: { level: string; projectOnly?: boolean }) {
  return <span className={`scenario-capability level-${level.toLowerCase().replace("_", "-")}${projectOnly ? " is-project-only" : ""}`}>{projectOnly ? "Project only" : level === "GAME_VERIFIED" ? "Game verified" : level.toLowerCase()}</span>;
}

type ScenarioWorkspaceProps = {
  map: Civ5Map;
  draft: ScenarioDraft;
  stage: ScenarioStage;
  findings: ScenarioValidationFinding[];
  compatibility: ScenarioCompatibilityReport;
  selectedFactionId: string;
  placementFactionId: string;
  hoveredCoordinate?: { x: number; y: number };
  onChange: (draft: ScenarioDraft) => void;
  onSelectFaction: (factionId: string) => void;
  onPlaceFaction: (factionId: string) => void;
  onApply: () => void;
  onSendToRepair: () => void;
  onExport: () => void;
};

export function ScenarioWorkspace(props: ScenarioWorkspaceProps) {
  const { map, draft, stage, findings, compatibility } = props;
  const update = (mutator: (next: ScenarioDraft) => void) => { const next = cloneScenarioDraft(draft); mutator(next); props.onChange(next); };
  const stageFindings = findings.filter((finding) => finding.stage === stage || stage === "VALIDATE");
  const activeFactions = draft.factions.filter((faction) => faction.status !== "DISABLED");
  const selectedFaction = draft.factions.find((faction) => faction.id === props.selectedFactionId);
  const fixedImportedRecords = map.source === "file" && Boolean(map.scenarioDataPresent);
  const [brushRadius, setBrushRadius] = useState(0);
  const [brushOwnerEnabled, setBrushOwnerEnabled] = useState(true);
  const [brushImprovementEnabled, setBrushImprovementEnabled] = useState(false);
  const [brushRouteEnabled, setBrushRouteEnabled] = useState(false);
  const [brushOwner, setBrushOwner] = useState("");
  const [brushImprovement, setBrushImprovement] = useState("");
  const [brushRoute, setBrushRoute] = useState("");
  const declaredImprovements = map.source === "file" && map.scenarioDataPresent
    ? map.scenarioImprovementTypes ?? []
    : ["IMPROVEMENT_BARBARIAN_CAMP", "IMPROVEMENT_GOODY_HUT", "IMPROVEMENT_CITY_RUINS"];

  const addFaction = (cityState: boolean) => update((next) => {
    const slot = next.factions.reduce((highest, faction) => Math.max(highest, faction.slot), -1) + 1;
    next.factions.push({ id: `faction-${Date.now().toString(36)}-${slot}`, slot, civilization: cityState ? `MINOR_CIV_${slot + 1}` : `CIVILIZATION_PLAYER_${slot + 1}`, leader: cityState ? `MINOR_LEADER_${slot + 1}` : `LEADER_PLAYER_${slot + 1}`, team: slot, control: cityState ? "AI" : "FLEXIBLE", cityState, playable: !cityState, status: "ACTIVE" });
    if (next.setup) {
      if (cityState) next.setup.cityStateSlotCapacity += 1;
      else next.setup.majorSlotCapacity += 1;
    }
  });
  const updateFaction = (id: string, changes: Partial<ScenarioFaction>) => update((next) => { const index = next.factions.findIndex((faction) => faction.id === id); if (index >= 0) next.factions[index] = { ...next.factions[index], ...changes }; });
  const moveFaction = (id: string, delta: -1 | 1) => update((next) => {
    const index = next.factions.findIndex((faction) => faction.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= next.factions.length) return;
    [next.factions[index], next.factions[target]] = [next.factions[target], next.factions[index]];
    next.factions.forEach((faction, slot) => { faction.slot = slot; });
  });
  const addObjective = () => update((next) => next.objectives.push({ id: `objective-${Date.now().toString(36)}`, label: "New objective", kind: "CONTROL", projectOnly: true }));
  const updateObjective = (id: string, changes: Partial<ScenarioObjective>) => update((next) => { const index = next.objectives.findIndex((objective) => objective.id === id); if (index >= 0) next.objectives[index] = { ...next.objectives[index], ...changes }; });
  const addAssignment = () => update((next) => {
    const coordinate = props.hoveredCoordinate ?? { x: 0, y: 0 };
    const existing = next.tileAssignments?.find((assignment) => assignment.x === coordinate.x && assignment.y === coordinate.y);
    if (!existing) (next.tileAssignments ??= []).push({ ...coordinate });
  });
  const updateAssignment = (index: number, changes: Partial<ScenarioTileAssignment>) => update((next) => { if (next.tileAssignments?.[index]) next.tileAssignments[index] = { ...next.tileAssignments[index], ...changes }; });
  const applyWorldBrush = () => {
    if (!props.hoveredCoordinate || (!brushOwnerEnabled && !brushImprovementEnabled && !brushRouteEnabled)) return;
    props.onChange(applyScenarioTileBrush(map, draft, props.hoveredCoordinate, brushRadius, {
      ...(brushOwnerEnabled ? { ownerFactionId: brushOwner || null } : {}),
      ...(brushImprovementEnabled ? { improvement: brushImprovement || null } : {}),
      ...(brushRouteEnabled ? { route: brushRoute as ScenarioTileAssignment["route"] || null } : {}),
    }));
  };

  return <div id="scenario-workspace-panel" className="scenario-panel" role="tabpanel" aria-label={`${stage.toLowerCase()} scenario stage`}>
    {stage === "SETUP" && <>
      <div className="section-title"><h3>Scenario setup</h3><span>{draft.setup?.intent === "FIXED_SCENARIO" ? "fixed" : "flexible"}</span></div>
      <p className="scenario-intro">Scenario identity is independent from the authoring-project name. Game-facing fields are labelled separately from intentions retained only in `.excogitare`.</p>
      <label className="control-field"><span>Scenario name</span><input value={draft.name} maxLength={160} onChange={(event) => update((next) => { next.name = event.target.value; })} /></label>
      <label className="control-field"><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => update((next) => { next.description = event.target.value; })} /></label>
      <label className="control-field"><span>Lobby intent</span><select value={draft.setup?.intent ?? "FLEXIBLE_LOBBY"} onChange={(event) => update((next) => { if (next.setup) next.setup.intent = event.target.value as "FIXED_SCENARIO" | "FLEXIBLE_LOBBY"; })}><option value="FIXED_SCENARIO">Fixed Scenario</option><option value="FLEXIBLE_LOBBY">Flexible lobby</option></select></label>
      <div className="control-grid"><label className="control-field"><span>Ruleset</span><input value={draft.setup?.ruleset ?? ""} onChange={(event) => update((next) => { if (next.setup) next.setup.ruleset = event.target.value; })} /></label><label className="control-field"><span>Mod profile</span><input placeholder="Optional" value={draft.setup?.modProfile ?? ""} onChange={(event) => update((next) => { if (next.setup) next.setup.modProfile = event.target.value; })} /></label></div>
      <div className="control-grid"><label className="control-field"><span>Major slots</span><input type="number" min="0" max="22" value={draft.setup?.majorSlotCapacity ?? 0} onChange={(event) => update((next) => { if (next.setup) next.setup.majorSlotCapacity = Number(event.target.value); })} /></label><label className="control-field"><span>City-state slots</span><input type="number" min="0" max="41" value={draft.setup?.cityStateSlotCapacity ?? 0} onChange={(event) => update((next) => { if (next.setup) next.setup.cityStateSlotCapacity = Number(event.target.value); })} /></label></div>
      <details className="scenario-project-only" open><summary><span>Project-only rules intent</span><CapabilityBadge level="EDIT" projectOnly /></summary><div><div className="control-grid"><label className="control-field"><span>Intended era</span><input placeholder="ERA_ANCIENT" value={draft.setup?.intendedEra ?? ""} onChange={(event) => update((next) => { if (next.setup) next.setup.intendedEra = event.target.value; })} /></label><label className="control-field"><span>Game speed</span><input placeholder="GAMESPEED_STANDARD" value={draft.setup?.gameSpeed ?? ""} onChange={(event) => update((next) => { if (next.setup) next.setup.gameSpeed = event.target.value; })} /></label></div><div className="control-grid"><label className="control-field"><span>Starting turn</span><input type="number" value={draft.setup?.startingTurn ?? 0} onChange={(event) => update((next) => { if (next.setup) next.setup.startingTurn = Number(event.target.value); })} /></label><label className="control-field"><span>Calendar</span><input placeholder="Years" value={draft.setup?.calendar ?? ""} onChange={(event) => update((next) => { if (next.setup) next.setup.calendar = event.target.value; })} /></label></div><p>These values guide future Lua/mod compilation. They are not written into Civ5Map.</p></div></details>
    </>}

    {stage === "FACTIONS" && <>
      <div className="section-title"><h3>Faction slots</h3><span>{activeFactions.length} enabled</span></div>
      <p className="scenario-intro">Major slots are written before city states. Select a faction to highlight its start, or arm map placement and click a legal hex.</p>
      <div className="scenario-add-actions"><button type="button" disabled={fixedImportedRecords} title={fixedImportedRecords ? "Imported scenario player blocks have a fixed record count." : undefined} onClick={() => addFaction(false)}>Add major</button><button type="button" disabled={fixedImportedRecords} title={fixedImportedRecords ? "Imported scenario player blocks have a fixed record count." : undefined} onClick={() => addFaction(true)}>Add city state</button></div>
      {fixedImportedRecords && <p className="scenario-selection-note">This imported file has a fixed faction-record count. Existing slots can be reordered or reassigned, but adding or disabling one is blocked to preserve unknown records.</p>}
      <div className="scenario-faction-list">{draft.factions.map((faction, index) => <article key={faction.id} className={`scenario-faction-card${props.selectedFactionId === faction.id ? " is-selected" : ""}${faction.status === "DISABLED" ? " is-disabled" : ""}`}>
        <button className="scenario-faction-heading" type="button" onClick={() => props.onSelectFaction(faction.id)}><span>Slot {faction.slot + 1}</span><strong>{faction.civilization || "Unassigned faction"}</strong><small>{faction.cityState ? "City state" : "Major civilization"} · team {faction.team + 1}</small></button>
        <div className="scenario-faction-fields">
          <label><span>Civilization</span><input value={faction.civilization} onChange={(event) => updateFaction(faction.id, { civilization: event.target.value })} /></label>
          <label><span>Leader</span><input value={faction.leader} onChange={(event) => updateFaction(faction.id, { leader: event.target.value })} /></label>
          <div className="control-grid"><label><span>Kind</span><select value={faction.cityState ? "CITY_STATE" : "MAJOR"} onChange={(event) => updateFaction(faction.id, { cityState: event.target.value === "CITY_STATE", playable: event.target.value !== "CITY_STATE" && faction.playable })}><option value="MAJOR">Major</option><option value="CITY_STATE">City state</option></select></label><label><span>Control</span><select value={faction.control} onChange={(event) => updateFaction(faction.id, { control: event.target.value as ScenarioFaction["control"] })}><option value="FLEXIBLE">Flexible</option><option value="HUMAN">Human intent</option><option value="AI">AI intent</option></select></label></div>
          <div className="control-grid"><label><span>Team</span><input type="number" min="0" max="127" value={faction.team} onChange={(event) => updateFaction(faction.id, { team: Number(event.target.value) })} /></label><label><span>Status</span><select value={faction.status} onChange={(event) => updateFaction(faction.id, { status: event.target.value as ScenarioFaction["status"] })}><option value="ACTIVE">Active</option><option value="RESERVED">Reserved</option><option value="DISABLED" disabled={fixedImportedRecords}>Disabled</option></select></label></div>
          <label><span>Team color</span><input value={faction.teamColor ?? ""} onChange={(event) => updateFaction(faction.id, { teamColor: event.target.value })} /></label>
          <label className="scenario-inline-check"><input type="checkbox" checked={faction.playable} disabled={faction.cityState} onChange={(event) => updateFaction(faction.id, { playable: event.target.checked })} /><span>Playable lobby slot</span></label>
          <div className="scenario-coordinate-row"><label><span>Start X</span><input type="number" value={faction.start?.x ?? ""} onChange={(event) => updateFaction(faction.id, { start: { x: Number(event.target.value), y: faction.start?.y ?? 0 } })} /></label><label><span>Start Y</span><input type="number" value={faction.start?.y ?? ""} onChange={(event) => updateFaction(faction.id, { start: { x: faction.start?.x ?? 0, y: Number(event.target.value) } })} /></label></div>
          <div className="scenario-card-actions"><button type="button" disabled={index === 0} onClick={() => moveFaction(faction.id, -1)}>Move up</button><button type="button" disabled={index === draft.factions.length - 1} onClick={() => moveFaction(faction.id, 1)}>Move down</button><button className={props.placementFactionId === faction.id ? "is-active" : ""} type="button" onClick={() => props.onPlaceFaction(props.placementFactionId === faction.id ? "" : faction.id)}>{props.placementFactionId === faction.id ? "Click map…" : "Place start"}</button></div>
        </div>
      </article>)}</div>
      {selectedFaction && <p className="scenario-selection-note">Selected: slot {selectedFaction.slot + 1} · {selectedFaction.start ? `start ${selectedFaction.start.x}, ${selectedFaction.start.y}` : "start missing"}</p>}
    </>}

    {stage === "WORLD" && <>
      <div className="section-title"><h3>Scenario world</h3><span>{draft.cities?.length ?? 0} cities · {draft.tileAssignments?.length ?? 0} assigned tiles</span></div>
      <p className="scenario-intro">Existing city records can be edited in place. Political ownership, existing declared improvements and routes use the scenario tile grid.</p>
      <details className="scenario-world-group" open><summary><span>Cities</span><CapabilityBadge level={compatibility.capabilities.CITIES} projectOnly={compatibility.details?.CITIES.projectOnly} /></summary><div>{draft.cities?.length ? <div className="scenario-city-list">{draft.cities.map((city, index) => <article key={`${city.id}-${index}`}><strong>{city.name || `City ${city.id}`}</strong><div className="control-grid"><label><span>Name</span><input value={city.name} onChange={(event) => update((next) => { if (next.cities?.[index]) next.cities[index].name = event.target.value; })} /></label><label><span>Population</span><input type="number" min="1" value={city.population} onChange={(event) => update((next) => { if (next.cities?.[index]) next.cities[index].population = Number(event.target.value); })} /></label></div><div className="control-grid"><label><span>Owner slot</span><select value={city.owner} onChange={(event) => update((next) => { if (next.cities?.[index]) next.cities[index].owner = Number(event.target.value); })}>{draft.factions.map((faction) => <option key={faction.id} value={faction.slot}>{faction.slot + 1} · {faction.civilization}</option>)}</select></label><span className="scenario-coordinate-display">Tile {city.x}, {city.y}</span></div></article>)}</div> : <p className="workspace-empty-state">No writable city records exist. New-city record creation remains Project only because it would resize unknown scenario blocks.</p>}</div></details>
      <details className="scenario-world-group" open><summary><span>Ownership, improvements and routes</span><CapabilityBadge level="WRITE" /></summary><div>
        <div className="scenario-world-brush">
          <strong>Map-linked layer brush</strong><small>Hover the anchor hex, choose a hex radius, then apply only the checked record layers. Blank values clear that layer.</small>
          <label className="scenario-inline-check"><input type="checkbox" checked={brushOwnerEnabled} onChange={(event) => setBrushOwnerEnabled(event.target.checked)} /><span>Ownership</span></label><select disabled={!brushOwnerEnabled} value={brushOwner} onChange={(event) => setBrushOwner(event.target.value)}><option value="">Clear ownership</option>{draft.factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.slot + 1} · {faction.civilization}</option>)}</select>
          <label className="scenario-inline-check"><input type="checkbox" checked={brushImprovementEnabled} onChange={(event) => setBrushImprovementEnabled(event.target.checked)} /><span>Improvement</span></label><select disabled={!brushImprovementEnabled} value={brushImprovement} onChange={(event) => setBrushImprovement(event.target.value)}><option value="">Clear improvement</option>{declaredImprovements.map((improvement) => <option key={improvement} value={improvement}>{improvement.replace("IMPROVEMENT_", "").replaceAll("_", " ").toLowerCase()}</option>)}</select>
          <label className="scenario-inline-check"><input type="checkbox" checked={brushRouteEnabled} onChange={(event) => setBrushRouteEnabled(event.target.checked)} /><span>Route</span></label><select disabled={!brushRouteEnabled} value={brushRoute} onChange={(event) => setBrushRoute(event.target.value)}><option value="">Clear route</option><option value="ROUTE_ROAD">Road</option><option value="ROUTE_RAILROAD">Railroad</option></select>
          <label><span>Brush radius</span><input type="number" min="0" max="4" value={brushRadius} onChange={(event) => setBrushRadius(Math.max(0, Math.min(4, Number(event.target.value))))} /></label>
          <button type="button" disabled={!props.hoveredCoordinate || (!brushOwnerEnabled && !brushImprovementEnabled && !brushRouteEnabled)} onClick={applyWorldBrush}>Apply to {props.hoveredCoordinate ? `${props.hoveredCoordinate.x}, ${props.hoveredCoordinate.y}` : "hovered map tile"}</button>
        </div>
        <button className="scenario-add-tile" type="button" onClick={addAssignment}>Add {props.hoveredCoordinate ? `hovered tile ${props.hoveredCoordinate.x}, ${props.hoveredCoordinate.y}` : "tile assignment"}</button><div className="scenario-assignment-list">{(draft.tileAssignments ?? []).slice(0, 40).map((assignment, index) => <article key={`${assignment.x}-${assignment.y}-${index}`}><div className="scenario-coordinate-row"><label><span>X</span><input type="number" value={assignment.x} onChange={(event) => updateAssignment(index, { x: Number(event.target.value) })} /></label><label><span>Y</span><input type="number" value={assignment.y} onChange={(event) => updateAssignment(index, { y: Number(event.target.value) })} /></label></div><label><span>Owner</span><select value={assignment.ownerFactionId ?? ""} onChange={(event) => updateAssignment(index, { ownerFactionId: event.target.value || undefined })}><option value="">Unowned</option>{draft.factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.slot + 1} · {faction.civilization}</option>)}</select></label><div className="control-grid"><label><span>Improvement</span><select value={assignment.improvement ?? ""} onChange={(event) => updateAssignment(index, { improvement: event.target.value as ScenarioTileAssignment["improvement"] || undefined })}><option value="">None</option>{declaredImprovements.map((improvement) => <option key={improvement} value={improvement}>{improvement.replace("IMPROVEMENT_", "").replaceAll("_", " ").toLowerCase()}</option>)}</select></label><label><span>Route</span><select value={assignment.route ?? ""} onChange={(event) => updateAssignment(index, { route: event.target.value as ScenarioTileAssignment["route"] || undefined })}><option value="">None</option><option value="ROUTE_ROAD">Road</option><option value="ROUTE_RAILROAD">Railroad</option></select></label></div><button type="button" onClick={() => update((next) => { next.tileAssignments?.splice(index, 1); })}>Remove assignment</button></article>)}</div>{(draft.tileAssignments?.length ?? 0) > 40 && <p className="scenario-limit-note">Showing the first 40 of {draft.tileAssignments!.length} assigned tiles. The layer brush remains available for larger regions without rendering every record card.</p>}</div></details>
    </>}

    {stage === "OBJECTIVES" && <>
      <div className="section-title"><h3>Scenario objectives</h3><span>Project only</span></div>
      <p className="scenario-intro">Objectives can target factions, teams or stable semantic geography. They survive project export but are not silently represented as Civ V victory rules.</p>
      <label className="control-field"><span>Narrative briefing · Project only</span><textarea rows={5} value={String(draft.projectOnly.briefing ?? "")} onChange={(event) => update((next) => { next.projectOnly.briefing = event.target.value; })} /></label>
      <button className="scenario-add-objective" type="button" onClick={addObjective}>Add objective</button>
      <div className="scenario-objective-list">{draft.objectives.map((objective) => <article key={objective.id}><div><strong>{objective.label}</strong><CapabilityBadge level="EDIT" projectOnly /></div><label><span>Label</span><input value={objective.label} onChange={(event) => updateObjective(objective.id, { label: event.target.value })} /></label><div className="control-grid"><label><span>Kind</span><select value={objective.kind ?? "CUSTOM"} onChange={(event) => updateObjective(objective.id, { kind: event.target.value as ScenarioObjective["kind"] })}>{["VICTORY", "CONTROL", "PROTECT", "REACH", "SURVIVE", "CUSTOM"].map((kind) => <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}</select></label><label><span>Faction</span><select value={objective.factionId ?? ""} onChange={(event) => updateObjective(objective.id, { factionId: event.target.value || undefined })}><option value="">All / none</option>{draft.factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.slot + 1} · {faction.civilization}</option>)}</select></label></div><label><span>Semantic geography</span><select value={objective.semanticId ?? ""} onChange={(event) => updateObjective(objective.id, { semanticId: event.target.value || undefined })}><option value="">No semantic target</option>{(map.structure?.objects ?? []).map((object) => <option key={object.semanticId} value={object.semanticId}>{object.name} · {object.kind.toLowerCase()}</option>)}</select></label><label><span>Notes</span><textarea rows={3} value={objective.notes ?? ""} onChange={(event) => updateObjective(objective.id, { notes: event.target.value })} /></label><button type="button" onClick={() => update((next) => { next.objectives = next.objectives.filter((item) => item.id !== objective.id); })}>Remove objective</button></article>)}</div>
    </>}

    {stage === "VALIDATE" && <>
      <div className="section-title"><h3>Scenario validation</h3><span>{findings.filter((finding) => finding.severity === "ERROR").length ? `${findings.filter((finding) => finding.severity === "ERROR").length} blockers` : "exportable"}</span></div>
      <div className={`scenario-readiness${findings.some((finding) => finding.severity === "ERROR") ? " has-errors" : " is-ready"}`}><strong>{findings.some((finding) => finding.severity === "ERROR") ? "Scenario is not ready" : "Automated checks pass"}</strong><span>{findings.length} findings · {findings.filter((finding) => finding.projectOnly).length} Project-only disclosures</span></div>
      <div className="scenario-validation-list">{findings.length ? findings.map((finding) => <article key={finding.id} className={`severity-${finding.severity.toLowerCase()}`}><span>{finding.severity}</span><div><strong>{finding.stage.toLowerCase()}{finding.projectOnly ? " · Project only" : ""}</strong><p>{finding.message}</p></div></article>) : <p className="workspace-empty-state">No automated Scenario findings remain.</p>}</div>
      <div className="section-title"><h3>Compatibility ledger</h3><span>independent evidence</span></div>
      <div className="scenario-capability-list">{SCENARIO_RECORD_FAMILIES.map((family) => <details key={family}><summary><span>{family.toLowerCase().replaceAll("_", " ")}</span><CapabilityBadge level={compatibility.capabilities[family]} projectOnly={compatibility.details?.[family]?.projectOnly} /></summary><p>{compatibility.details?.[family]?.explanation}</p></details>)}</div>
      <p className="scenario-civv-caveat">Write applies only to fixed records already present in an imported scenario. New Scenario drafts remain in the downloaded Excogitare project; ordinary Civ5Map export contains geography only.</p>
      <div className="scenario-validation-actions"><button type="button" disabled={!findings.some((finding) => finding.fixable)} onClick={props.onSendToRepair}>Send fixable findings to Repair</button><button type="button" onClick={props.onApply}>Apply Scenario preview</button><button className="scenario-export-button" type="button" onClick={props.onExport}>Review Civ5Map export</button></div>
    </>}

    {stage !== "VALIDATE" && <div className="scenario-stage-footer"><span>{stageFindings.filter((finding) => finding.severity === "ERROR").length} blockers in this stage</span><button type="button" onClick={props.onApply}>Apply Scenario preview</button></div>}
  </div>;
}
