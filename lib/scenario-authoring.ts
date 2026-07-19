import type {
  ScenarioCapabilityLevel,
  ScenarioCompatibilityReport,
  ScenarioDraft,
  ScenarioFaction,
  ScenarioObjective,
  ScenarioTileAssignment,
} from "./authoring-schema.ts";
import { inspectCiv5MapStructure, serializeCiv5Map, type Civ5City, type Civ5Map } from "./civ5-map.ts";
import { isPassableLand } from "./civ5-rules.ts";
import { validateCiv5Map } from "./map-analysis.ts";
import { MINIMUM_START_DISTANCE } from "./start-locations.ts";

export const SCENARIO_RECORD_FAMILIES = [
  "METADATA", "FACTIONS", "STARTS", "CITIES", "OWNERSHIP", "IMPROVEMENTS", "ROUTES", "OBJECTIVES", "RULES", "BRIEFINGS", "UNITS", "DIPLOMACY", "EVENTS",
] as const;
export type ScenarioRecordFamily = typeof SCENARIO_RECORD_FAMILIES[number];

export type ScenarioValidationFinding = {
  id: string;
  severity: "ERROR" | "WARNING" | "INFO";
  stage: "SETUP" | "FACTIONS" | "WORLD" | "OBJECTIVES" | "VALIDATE";
  message: string;
  x?: number;
  y?: number;
  fixable: boolean;
  projectOnly?: boolean;
};

function cloneCity(city: Civ5City): Civ5City { return { ...city }; }
function cloneAssignment(assignment: ScenarioTileAssignment): ScenarioTileAssignment { return { ...assignment }; }
function cloneObjective(objective: ScenarioObjective): ScenarioObjective { return { ...objective }; }
function cloneFaction(faction: ScenarioFaction): ScenarioFaction { return { ...faction, start: faction.start ? { ...faction.start } : undefined }; }

export function cloneScenarioDraft(draft: ScenarioDraft): ScenarioDraft {
  return {
    ...draft,
    setup: draft.setup ? { ...draft.setup } : undefined,
    factions: draft.factions.map(cloneFaction),
    cities: draft.cities?.map(cloneCity),
    tileAssignments: draft.tileAssignments?.map(cloneAssignment),
    objectives: draft.objectives.map(cloneObjective),
    projectOnly: structuredClone(draft.projectOnly),
  };
}

export function applyScenarioTileBrush(
  map: Civ5Map,
  source: ScenarioDraft,
  anchor: { x: number; y: number },
  radius: number,
  patch: { ownerFactionId?: string | null; improvement?: string | null; route?: ScenarioTileAssignment["route"] | null },
) {
  const draft = cloneScenarioDraft(source);
  const assignments = draft.tileAssignments ??= [];
  const points: Array<[number, number]> = [[anchor.x, anchor.y]];
  const seen = new Set([`${anchor.x},${anchor.y}`]);
  let frontier: Array<[number, number]> = [[anchor.x, anchor.y]];
  for (let distance = 0; distance < Math.max(0, Math.min(4, Math.round(radius))); distance += 1) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      const offsets = y % 2 === 0 ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
      for (const [dx, dy] of offsets) {
        let nx = x + dx;
        const ny = y + dy;
        if (map.wraps) nx = (nx + map.width) % map.width;
        const key = `${nx},${ny}`;
        if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height || seen.has(key)) continue;
        seen.add(key);
        points.push([nx, ny]);
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  for (const [x, y] of points) {
    let assignment = assignments.find((candidate) => candidate.x === x && candidate.y === y);
    if (!assignment) { assignment = { x, y }; assignments.push(assignment); }
    if (Object.hasOwn(patch, "ownerFactionId")) assignment.ownerFactionId = patch.ownerFactionId ?? undefined;
    if (Object.hasOwn(patch, "improvement")) assignment.improvement = patch.improvement ?? undefined;
    if (Object.hasOwn(patch, "route")) assignment.route = patch.route ?? undefined;
  }
  draft.tileAssignments = assignments.filter((assignment) => assignment.ownerFactionId || assignment.improvement || assignment.route);
  return draft;
}

function defaultSetup(map: Civ5Map) {
  const majorSlots = map.scenarioPlayerSlots ?? map.startLocations.filter((start) => !start.cityState).length;
  const cityStateSlots = map.scenarioCityStateSlots ?? map.startLocations.filter((start) => start.cityState).length;
  return {
    intent: "FLEXIBLE_LOBBY" as const,
    ruleset: "Civilization V",
    modProfile: "",
    majorSlotCapacity: majorSlots,
    cityStateSlotCapacity: cityStateSlots,
  };
}

function factionsFromMap(map: Civ5Map): ScenarioFaction[] {
  return [...map.startLocations]
    .sort((one, two) => one.player - two.player)
    .map((start, index) => ({
      id: `faction-${start.player + 1}`,
      slot: start.player,
      civilization: start.civilization || (start.cityState ? `CITYSTATE_${index + 1}` : `CIVILIZATION_PLAYER_${index + 1}`),
      leader: start.leader || (start.cityState ? `MINOR_${index + 1}` : `LEADER_PLAYER_${index + 1}`),
      team: start.team,
      control: start.playable ? "FLEXIBLE" : "AI",
      cityState: start.cityState,
      playable: start.playable,
      status: "ACTIVE",
      teamColor: start.teamColor,
      start: { x: start.x, y: start.y },
    }));
}

function tileAssignmentsFromMap(map: Civ5Map, factions: ScenarioFaction[]): ScenarioTileAssignment[] {
  return map.tiles.flatMap((tile, index) => {
    if (tile.owner === undefined && !tile.improvement && !tile.route) return [];
    return [{
      x: index % map.width,
      y: Math.floor(index / map.width),
      ownerFactionId: tile.owner === undefined ? undefined : factions.find((faction) => faction.slot === tile.owner)?.id,
      improvement: tile.improvement,
      route: tile.route,
    }];
  });
}

export function scenarioDraftFromMap(map: Civ5Map, source?: ScenarioDraft | null): ScenarioDraft {
  const fallbackFactions = factionsFromMap(map);
  if (!source) return {
    schemaVersion: 1,
    name: map.name,
    description: map.description,
    setup: defaultSetup(map),
    factions: fallbackFactions,
    cities: map.cities?.map(cloneCity) ?? [],
    tileAssignments: tileAssignmentsFromMap(map, fallbackFactions),
    objectives: [],
    projectOnly: { briefing: "", factionNotes: {}, enabledVictories: [], emphasizedVictories: [] },
  };
  if (source.schemaVersion !== 1) throw new Error(`Unsupported Scenario draft schema version: ${String(source.schemaVersion)}.`);
  const setup = { ...defaultSetup(map), ...(source.setup ?? {}) };
  const factions = source.factions.map((faction, index): ScenarioFaction => ({
    ...faction,
    slot: Number.isInteger(faction.slot) ? faction.slot : index,
    status: faction.status ?? "ACTIVE",
    control: faction.control ?? "FLEXIBLE",
    start: faction.start ? { ...faction.start } : undefined,
  }));
  return {
    ...source,
    name: source.name || map.name,
    description: source.description ?? map.description,
    setup,
    factions,
    cities: (source.cities ?? map.cities ?? []).map(cloneCity),
    tileAssignments: (source.tileAssignments ?? tileAssignmentsFromMap(map, factions)).map(cloneAssignment),
    objectives: source.objectives.map((objective) => ({ kind: "CUSTOM", ...cloneObjective(objective) })),
    projectOnly: structuredClone(source.projectOnly ?? {}),
  };
}

export function applyScenarioDraft(map: Civ5Map, source: ScenarioDraft): Civ5Map {
  const draft = scenarioDraftFromMap(map, source);
  const included = draft.factions.filter((faction) => faction.status !== "DISABLED");
  const ordered = [...included].sort((one, two) => Number(one.cityState) - Number(two.cityState) || one.slot - two.slot);
  const exportedIndex = new Map(ordered.map((faction, index) => [faction.id, index]));
  const slotToFaction = new Map(draft.factions.map((faction) => [faction.slot, faction]));
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  for (const tile of tiles) { delete tile.owner; delete tile.improvement; delete tile.route; }
  for (const assignment of draft.tileAssignments ?? []) {
    if (!Number.isInteger(assignment.x) || !Number.isInteger(assignment.y) || assignment.x < 0 || assignment.y < 0 || assignment.x >= map.width || assignment.y >= map.height) continue;
    const tile = tiles[assignment.y * map.width + assignment.x];
    const owner = assignment.ownerFactionId ? exportedIndex.get(assignment.ownerFactionId) : undefined;
    if (owner !== undefined) tile.owner = owner;
    if (assignment.improvement) tile.improvement = assignment.improvement;
    if (assignment.route) tile.route = assignment.route;
  }
  const cities = (draft.cities ?? []).map((city) => {
    const faction = slotToFaction.get(city.owner);
    return { ...city, owner: faction ? exportedIndex.get(faction.id) ?? city.owner : city.owner };
  });
  const majorSlots = ordered.filter((faction) => !faction.cityState).length;
  const cityStateSlots = ordered.length - majorSlots;
  return {
    ...map,
    name: draft.name.trim() || map.name,
    description: draft.description,
    players: majorSlots,
    scenarioPlayerSlots: majorSlots,
    scenarioCityStateSlots: cityStateSlots,
    scenarioDataPresent: ordered.length > 0 || map.scenarioDataPresent,
    scenarioMarker: ordered.length > 0 || map.scenarioDataPresent ? 8 : 0,
    tiles,
    cities,
    startLocations: ordered.flatMap((faction, player) => faction.start ? [{
      ...faction.start,
      player,
      civilization: faction.civilization,
      leader: faction.leader,
      team: faction.team,
      playable: faction.playable && faction.status === "ACTIVE",
      cityState: faction.cityState,
      teamColor: faction.teamColor,
    }] : []),
  };
}

function scenarioHash(map: Civ5Map, draft: ScenarioDraft) {
  const text = JSON.stringify({ width: map.width, height: map.height, name: draft.name, setup: draft.setup, factions: draft.factions, cities: draft.cities, assignments: draft.tileAssignments, objectives: draft.objectives, projectOnly: draft.projectOnly });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function scenarioCompatibility(map: Civ5Map, draft: ScenarioDraft): ScenarioCompatibilityReport {
  const imported = map.source === "file" && map.scenarioDataPresent === true;
  const scenarioLevel: ScenarioCapabilityLevel = imported ? "WRITE" : "EDIT";
  const hasWritableCities = imported && Boolean(map.cities?.length);
  const capabilities: Record<ScenarioRecordFamily, ScenarioCapabilityLevel> = {
    METADATA: "GAME_VERIFIED",
    FACTIONS: scenarioLevel,
    STARTS: scenarioLevel,
    CITIES: hasWritableCities ? "WRITE" : "EDIT",
    OWNERSHIP: scenarioLevel,
    IMPROVEMENTS: scenarioLevel,
    ROUTES: scenarioLevel,
    OBJECTIVES: "EDIT",
    RULES: "EDIT",
    BRIEFINGS: "EDIT",
    UNITS: "EDIT",
    DIPLOMACY: "EDIT",
    EVENTS: "EDIT",
  };
  const details: ScenarioCompatibilityReport["details"] = {
    METADATA: { projectOnly: false, explanation: "Map name and description are written as separate Civ V metadata strings." },
    FACTIONS: { projectOnly: !imported, explanation: imported ? "Civilization, leader, team color, team and playable state can update existing fixed player-record fields. Representative Civ V confirmation remains required." : "Faction authoring is retained in the project. Excogitare does not construct new scenario player records for ordinary map exports." },
    STARTS: { projectOnly: !imported, explanation: imported ? "Start coordinates can update existing player records after the shared five-hex legality checks." : "Designed starts remain in the project; ordinary map export lets Civ V assign starting plots at game creation." },
    CITIES: { projectOnly: !hasWritableCities, explanation: hasWritableCities ? "Existing fixed-size city records and tile links can be edited without resizing the scenario section." : "No writable city records exist; creating new city records remains Project only." },
    OWNERSHIP: { projectOnly: !imported, explanation: imported ? "Tile owner bytes can update the existing scenario improvement grid." : "Political ownership remains in the project because an ordinary map has no scenario improvement grid." },
    IMPROVEMENTS: { projectOnly: !imported, explanation: imported ? "Existing declared improvement types can be assigned or removed; adding a new type table entry is blocked." : "Scenario improvements remain in the project because ordinary map export contains geography only." },
    ROUTES: { projectOnly: !imported, explanation: imported ? "Road and railroad bytes can update the existing scenario tile grid." : "Authored routes remain in the project because ordinary map export contains geography only." },
    OBJECTIVES: { projectOnly: true, explanation: "Semantic and faction objectives remain in the project; Civ5Map does not carry Excogitare objectives." },
    RULES: { projectOnly: true, explanation: "Era, speed, turn, calendar and custom victory mutation are retained as intent only." },
    BRIEFINGS: { projectOnly: true, explanation: "Narrative briefing and faction notes remain in the `.excogitare` project." },
    UNITS: { projectOnly: true, explanation: imported ? "Unknown unit bytes are preserved, but not interpreted or edited." : "Unit authoring is not implemented." },
    DIPLOMACY: { projectOnly: true, explanation: imported ? "Unknown diplomacy bytes are preserved, but not interpreted or edited." : "Diplomacy authoring is not implemented." },
    EVENTS: { projectOnly: true, explanation: imported ? "Unknown event bytes are preserved, but not interpreted or edited." : "Scripted event authoring is not implemented." },
  };
  return { schemaVersion: 1, inputHash: scenarioHash(map, draft), capabilities, details };
}

function hexDistance(one: { x: number; y: number }, two: { x: number; y: number }, width: number, wraps: boolean) {
  const cube = (point: { x: number; y: number }) => { const q = point.x - (point.y - (point.y & 1)) / 2; return [q, -q - point.y, point.y]; };
  const direct = (a: { x: number; y: number }, b: { x: number; y: number }) => { const ac = cube(a); const bc = cube(b); return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2])); };
  return wraps ? Math.min(direct(one, two), direct({ x: one.x - width, y: one.y }, two), direct({ x: one.x + width, y: one.y }, two)) : direct(one, two);
}

export function validateScenarioDraft(map: Civ5Map, source: ScenarioDraft): ScenarioValidationFinding[] {
  const draft = scenarioDraftFromMap(map, source);
  const findings: ScenarioValidationFinding[] = [];
  const add = (finding: Omit<ScenarioValidationFinding, "id"> & { id?: string }) => findings.push({ id: finding.id ?? `scenario-${findings.length + 1}`, ...finding });
  if (!draft.name.trim()) add({ severity: "ERROR", stage: "SETUP", message: "Scenario name is required.", fixable: false });
  const active = draft.factions.filter((faction) => faction.status !== "DISABLED");
  const majorCount = active.filter((faction) => !faction.cityState).length;
  const cityStateCount = active.length - majorCount;
  if (!(map.source === "file" && map.scenarioDataPresent === true)) add({ severity: "ERROR", stage: "VALIDATE", message: "New scenario Civ5Map construction is disabled. Download the Excogitare project to retain this draft, or export the geography as an ordinary map from Create or Explore.", fixable: false, projectOnly: true });
  if (map.source === "file" && map.scenarioDataPresent) {
    const fixedFactionRecords = (map.scenarioPlayerSlots ?? 0) + (map.scenarioCityStateSlots ?? 0);
    if (active.length !== fixedFactionRecords) add({ severity: "ERROR", stage: "FACTIONS", message: `This imported file has ${fixedFactionRecords} fixed player records. Enabling or disabling factions would resize unknown scenario blocks, so exactly ${fixedFactionRecords} factions must remain enabled.`, fixable: false });
    if ((draft.cities?.length ?? 0) !== (map.cities?.length ?? 0)) add({ severity: "ERROR", stage: "WORLD", message: "Existing city records may be edited and relocated, but this imported file's fixed city-record count cannot be changed safely.", fixable: false });
  }
  if (draft.setup && (draft.setup.majorSlotCapacity !== majorCount || draft.setup.cityStateSlotCapacity !== cityStateCount)) add({ severity: "ERROR", stage: "SETUP", message: `Slot capacity declares ${draft.setup.majorSlotCapacity} major and ${draft.setup.cityStateSlotCapacity} city-state slots, but ${majorCount} major and ${cityStateCount} city-state factions are enabled.`, fixable: true });
  const ids = new Set<string>();
  const slots = new Set<number>();
  for (const faction of draft.factions) {
    if (!faction.id || ids.has(faction.id)) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction identifier ${faction.id || "(empty)"} is missing or duplicated.`, fixable: false });
    ids.add(faction.id);
    if (!Number.isInteger(faction.slot) || faction.slot < 0 || faction.slot > 127 || slots.has(faction.slot)) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.id || "(unnamed)"} has an invalid or duplicate slot ${faction.slot}.`, fixable: false });
    slots.add(faction.slot);
    if (faction.status === "DISABLED") continue;
    if (!faction.civilization.trim() || !faction.leader.trim()) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.slot + 1} needs civilization and leader identifiers.`, fixable: false });
    if (!Number.isInteger(faction.team) || faction.team < 0 || faction.team > 127) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.slot + 1} has an invalid team.`, fixable: false });
    if (!faction.start) { add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.slot + 1} has no start location.`, fixable: true }); continue; }
    const { x, y } = faction.start;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.slot + 1} starts outside the map at ${x}, ${y}.`, x, y, fixable: true });
    else if (!isPassableLand(map, map.tiles[y * map.width + x]) || map.tiles[y * map.width + x].wonder !== 255) add({ severity: "ERROR", stage: "FACTIONS", message: `Faction ${faction.slot + 1} starts on water, a mountain or a natural wonder at ${x}, ${y}.`, x, y, fixable: true });
  }
  for (let one = 0; one < active.length; one += 1) for (let two = one + 1; two < active.length; two += 1) {
    if (!active[one].start || !active[two].start) continue;
    const distance = hexDistance(active[one].start!, active[two].start!, map.width, map.wraps);
    if (distance < MINIMUM_START_DISTANCE) add({ severity: "ERROR", stage: "FACTIONS", message: `Factions ${active[one].slot + 1} and ${active[two].slot + 1} are ${distance} hexes apart; Scenario starts require at least ${MINIMUM_START_DISTANCE}.`, x: active[two].start!.x, y: active[two].start!.y, fixable: true });
  }
  const cityIds = new Set<number>();
  for (const city of draft.cities ?? []) {
    if (!Number.isInteger(city.id) || city.id < 0 || cityIds.has(city.id)) add({ severity: "ERROR", stage: "WORLD", message: `City ${city.name || city.id} has an invalid or duplicate record id.`, fixable: false });
    cityIds.add(city.id);
    if (!city.name.trim() || city.population < 1) add({ severity: "ERROR", stage: "WORLD", message: `City record ${city.id} needs a name and positive population.`, fixable: false });
    if (!draft.factions.some((faction) => faction.slot === city.owner && faction.status !== "DISABLED")) add({ severity: "ERROR", stage: "WORLD", message: `City ${city.name || city.id} refers to absent faction slot ${city.owner}.`, fixable: false });
    if (city.x < 0 || city.y < 0 || city.x >= map.width || city.y >= map.height) add({ severity: "ERROR", stage: "WORLD", message: `City ${city.name || city.id} has no valid tile link.`, fixable: true });
    else if (!isPassableLand(map, map.tiles[city.y * map.width + city.x]) || map.tiles[city.y * map.width + city.x].wonder !== 255) add({ severity: "ERROR", stage: "WORLD", message: `City ${city.name || city.id} is placed on illegal terrain at ${city.x}, ${city.y}.`, x: city.x, y: city.y, fixable: true });
  }
  const assignmentKeys = new Set<string>();
  for (const assignment of draft.tileAssignments ?? []) {
    const key = `${assignment.x},${assignment.y}`;
    if (!Number.isInteger(assignment.x) || !Number.isInteger(assignment.y) || assignment.x < 0 || assignment.y < 0 || assignment.x >= map.width || assignment.y >= map.height || assignmentKeys.has(key)) add({ severity: "ERROR", stage: "WORLD", message: `Scenario tile assignment ${key} is invalid or duplicated.`, fixable: false });
    assignmentKeys.add(key);
    if (assignment.ownerFactionId && !ids.has(assignment.ownerFactionId)) add({ severity: "ERROR", stage: "WORLD", message: `Tile ${key} refers to unknown owner ${assignment.ownerFactionId}.`, x: assignment.x, y: assignment.y, fixable: false });
    if (assignment.improvement && map.source === "file" && map.scenarioDataPresent && !map.scenarioImprovementTypes?.includes(assignment.improvement)) add({ severity: "ERROR", stage: "WORLD", message: `${assignment.improvement} is not declared in this imported file's fixed improvement table and cannot be added without resizing unknown scenario records.`, x: assignment.x, y: assignment.y, fixable: false });
    if (assignment.route && !assignment.ownerFactionId) add({ severity: "WARNING", stage: "WORLD", message: `Route at ${key} has no assigned owner.`, x: assignment.x, y: assignment.y, fixable: true });
  }
  const semanticIds = new Set(map.structure?.objects.map((object) => object.semanticId) ?? []);
  const objectiveIds = new Set<string>();
  for (const objective of draft.objectives) {
    if (!objective.id || objectiveIds.has(objective.id) || !objective.label.trim()) add({ severity: "ERROR", stage: "OBJECTIVES", message: "Every objective needs a unique identifier and label.", fixable: false });
    objectiveIds.add(objective.id);
    if (objective.factionId && !ids.has(objective.factionId)) add({ severity: "ERROR", stage: "OBJECTIVES", message: `Objective ${objective.label} refers to unknown faction ${objective.factionId}.`, fixable: false });
    if (objective.semanticId && !semanticIds.has(objective.semanticId)) add({ severity: "WARNING", stage: "OBJECTIVES", message: `Objective ${objective.label} refers to a semantic geography object that is absent or stale.`, fixable: false, projectOnly: true });
    if (objective.projectOnly) add({ severity: "INFO", stage: "OBJECTIVES", message: `Objective ${objective.label} is retained in the project and omitted from Civ5Map.`, fixable: false, projectOnly: true });
  }
  const briefing = String(draft.projectOnly.briefing ?? "").trim();
  if (briefing) add({ severity: "INFO", stage: "VALIDATE", message: "Scenario briefing is Project only and will not be written to Civ5Map.", fixable: false, projectOnly: true });
  for (const issue of validateCiv5Map(applyScenarioDraft(map, draft))) add({ severity: issue.severity, stage: issue.category === "STARTS" ? "FACTIONS" : issue.category === "CITIES" || issue.category === "SCENARIO" ? "WORLD" : "VALIDATE", message: issue.message, x: issue.x, y: issue.y, fixable: issue.category === "STARTS" || issue.category === "CITIES" });
  try {
    const encoded = serializeCiv5Map(applyScenarioDraft(map, draft));
    for (const issue of inspectCiv5MapStructure(encoded)) add({ severity: issue.severity, stage: "VALIDATE", message: `Encoded map: ${issue.message}`, fixable: false });
  } catch (error) { add({ severity: "ERROR", stage: "VALIDATE", message: error instanceof Error ? `Encoded map: ${error.message}` : "Encoded map validation failed.", fixable: false }); }
  return findings.filter((finding, index, all) => all.findIndex((candidate) => candidate.severity === finding.severity && candidate.stage === finding.stage && candidate.message === finding.message) === index);
}

export function scenarioExportSummary(map: Civ5Map, draft: ScenarioDraft) {
  const findings = validateScenarioDraft(map, draft);
  const projectOnly = findings.filter((finding) => finding.projectOnly);
  const errors = findings.filter((finding) => finding.severity === "ERROR");
  const warnings = findings.filter((finding) => finding.severity === "WARNING");
  return { findings, errors, warnings, projectOnly, ready: errors.length === 0 };
}
