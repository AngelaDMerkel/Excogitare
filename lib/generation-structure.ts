import type { Civ5Map } from "./civ5-map.ts";
import { GENERATION_PASS_DEFINITIONS, invalidatePassEvidence, type GenerationPassEvidence, type PassProvenance } from "./generation-pass-graph.ts";
import type { NarrativeAssessment, NarrativeSkeleton } from "./narrative-types.ts";

export type GeographicObjectKind = "SUBREGION" | "POLYGON" | "SUPERPOLYGON" | "CONTINENT" | "OCEAN_BASIN" | "INLAND_SEA" | "LAKE" | "RIFT" | "CLIMATE_REGION" | "BIOME_COLLECTION" | "TECTONIC_PLATE" | "ATMOSPHERIC_CELL" | "RAIN_SHADOW" | "GLACIAL_REGION" | "WATERSHED" | "STRATEGIC_REGION" | "BAY" | "CAPE" | "STRAIT" | "ARCHIPELAGO" | "FOREST_REALM" | "WASTE" | "RIVER_BASIN" | "NARRATIVE_REGION" | "NARRATIVE_PATH" | "ICE_SHEET" | "REFUGE";

export type GeographicObject = {
  id: string;
  semanticId?: string;
  name: string;
  kind: GeographicObjectKind;
  tileIndices: number[];
  neighbors?: string[];
  attributes?: Record<string, string | number | boolean>;
};

export type SemanticObject = GeographicObject & { semanticId: string };

export type SemanticLineage = {
  semanticId: string;
  previousObjectId?: string;
  currentObjectId: string;
  confidence: number;
  status: "CREATED" | "MATCHED" | "AMBIGUOUS";
};

export type LinearGeography = {
  id: string;
  name: string;
  tileIndices: number[];
  source?: number;
  outlet?: number;
};

export type StrategicNode = {
  id: string;
  kind: "MAJOR_START" | "CITY_STATE" | "CONTESTED" | "OBJECTIVE";
  x: number;
  y: number;
  owner?: number;
  team?: number;
  regionId?: string;
  role?: string;
  control?: "HUMAN" | "AI" | "FLEXIBLE";
};

export type StrategicEdge = {
  id: string;
  from: string;
  to: string;
  kind: "OPEN" | "PASS" | "RIVER_CROSSING" | "LAND_BRIDGE" | "NAVAL";
  tileIndices: number[];
  width: number;
};

export type VictoryFeasibilityFinding = {
  victory: "DOMINATION" | "SCIENCE" | "CULTURE" | "DIPLOMACY" | "TIME";
  state: "DISABLED" | "ENABLED" | "EMPHASIZED";
  status: "SUPPORTED" | "WEAK" | "BLOCKED";
  score: number;
  evidence: string[];
  metrics: Record<string, number>;
};

export type MatchFeasibilityAssessment = {
  schemaVersion: 1;
  engine: GenerationStructure["engine"];
  summary: string;
  victories: VictoryFeasibilityFinding[];
  metrics: Record<string, number>;
  limitations: string[];
};

export type StrategicGraph = {
  version: 2;
  mapType: string;
  pattern: string;
  symmetry: string;
  nodes: StrategicNode[];
  edges: StrategicEdge[];
  protectedTileIndices: number[];
  relaxations: string[];
  metrics: Record<string, number>;
  matchIntent: {
    humanPlayers: number;
    aiPlayers: number;
    flexiblePlayers: number;
    teamIntent: string;
    competitiveStrictness: string;
    aiAccommodation: string;
    enabledVictories: string[];
    emphasizedVictories: string[];
  };
  realmRoles: Array<{ team: number; role: string; playerIds: number[] }>;
  victoryFeasibility: VictoryFeasibilityFinding[];
};

export type GenerationStructure = {
  schemaVersion?: 1;
  engine: "EXCOGITARE" | "ECCENTRIC" | "PHYSICAL" | "POLIS";
  objects: GeographicObject[];
  mountainRanges: LinearGeography[];
  riverSystems: LinearGeography[];
  diagnostics: Record<string, number>;
  strategicGraph?: StrategicGraph;
  matchAssessment?: MatchFeasibilityAssessment;
  narrativeSkeleton?: NarrativeSkeleton;
  narrativeAssessment?: NarrativeAssessment;
  semanticLineage?: SemanticLineage[];
  inputHash?: string;
  generatorVersion?: string;
  provenance?: PassProvenance[];
  passEvidence?: GenerationPassEvidence[];
  evidenceState?: "CURRENT" | "STALE";
  staleReason?: string;
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function objectSignature(object: GeographicObject, width: number, height: number) {
  const count = Math.max(1, object.tileIndices.length);
  const centroid = object.tileIndices.reduce((point, index) => ({ x: point.x + index % width, y: point.y + Math.floor(index / width) }), { x: 0, y: 0 });
  const role = String(object.attributes?.role ?? object.attributes?.grammar ?? object.attributes?.plateType ?? "");
  return {
    x: centroid.x / count / Math.max(1, width - 1),
    y: centroid.y / count / Math.max(1, height - 1),
    area: object.tileIndices.length / Math.max(1, width * height),
    role,
  };
}

function initialSemanticId(engine: GenerationStructure["engine"], object: GeographicObject, width: number, height: number) {
  const signature = objectSignature(object, width, height);
  const tileFingerprint = hashText([...object.tileIndices].sort((one, two) => one - two).join(","));
  return `${engine.toLowerCase()}:${object.kind.toLowerCase()}:${hashText(`${signature.role}:${signature.x.toFixed(4)}:${signature.y.toFixed(4)}:${signature.area.toFixed(5)}:${tileFingerprint}:${object.id}`)}`;
}

function similarity(previous: GeographicObject, current: GeographicObject, width: number, height: number) {
  if (previous.kind !== current.kind) return 0;
  const one = objectSignature(previous, width, height);
  const two = objectSignature(current, width, height);
  const distance = Math.hypot(one.x - two.x, one.y - two.y);
  const centroid = Math.max(0, 1 - distance / 0.5);
  const area = Math.min(one.area, two.area) / Math.max(0.000001, Math.max(one.area, two.area));
  const role = one.role && two.role ? Number(one.role === two.role) : 0.5;
  const previousTiles = new Set(previous.tileIndices);
  const overlap = current.tileIndices.filter((index) => previousTiles.has(index)).length;
  const union = previous.tileIndices.length + current.tileIndices.length - overlap;
  const tileSimilarity = overlap / Math.max(1, union);
  return tileSimilarity * 0.55 + centroid * 0.25 + area * 0.12 + role * 0.08;
}

export function attachSemanticIdentities(structure: GenerationStructure, width: number, height: number, previous?: GenerationStructure) {
  const available = new Set(previous?.objects.map((object) => object.id) ?? []);
  const lineages: SemanticLineage[] = [];
  const objects = structure.objects.map((object) => {
    if (object.semanticId) {
      lineages.push({ semanticId: object.semanticId, currentObjectId: object.id, confidence: 1, status: "MATCHED" });
      return { ...object, tileIndices: [...object.tileIndices] };
    }
    const candidates = (previous?.objects ?? [])
      .filter((candidate) => available.has(candidate.id) && candidate.kind === object.kind)
      .map((candidate) => ({ candidate, score: similarity(candidate, object, width, height) }))
      .sort((one, two) => two.score - one.score);
    const best = candidates[0];
    const ambiguous = Boolean(best && candidates[1] && best.score - candidates[1].score < 0.06);
    if (best && best.score >= 0.42 && !ambiguous) {
      available.delete(best.candidate.id);
      const semanticId = best.candidate.semanticId ?? initialSemanticId(previous!.engine, best.candidate, width, height);
      lineages.push({ semanticId, previousObjectId: best.candidate.id, currentObjectId: object.id, confidence: Number(best.score.toFixed(4)), status: "MATCHED" });
      return { ...object, semanticId, tileIndices: [...object.tileIndices] };
    }
    const semanticId = initialSemanticId(structure.engine, object, width, height);
    lineages.push({ semanticId, currentObjectId: object.id, confidence: best ? Number(best.score.toFixed(4)) : 1, status: ambiguous ? "AMBIGUOUS" : "CREATED" });
    return { ...object, semanticId, tileIndices: [...object.tileIndices] };
  });
  return { ...structure, schemaVersion: 1 as const, objects, semanticLineage: lineages, evidenceState: "CURRENT" as const, staleReason: undefined };
}

export function markGenerationStructureStale(structure: GenerationStructure | undefined, reason: string, changedPassIds?: Iterable<string>) {
  const cloned = cloneGenerationStructure(structure);
  if (!cloned) return undefined;
  const invalidated = invalidatePassEvidence(
    cloned.passEvidence,
    changedPassIds ?? GENERATION_PASS_DEFINITIONS.map((definition) => definition.id),
    reason,
  );
  const stalePasses = invalidated.filter((entry) => entry.state === "STALE");
  return {
    ...cloned,
    passEvidence: invalidated,
    evidenceState: stalePasses.length ? "STALE" as const : "CURRENT" as const,
    staleReason: stalePasses.length ? reason : undefined,
  };
}

export function generationPassChangesBetweenMaps(previous: Civ5Map, current: Civ5Map) {
  const changed = new Set<string>();
  if (previous.width !== current.width || previous.height !== current.height || previous.wraps !== current.wraps || previous.tiles.length !== current.tiles.length) {
    changed.add("TOPOLOGY");
    return changed;
  }
  for (let index = 0; index < previous.tiles.length; index += 1) {
    const before = previous.tiles[index];
    const after = current.tiles[index];
    if ((before.terrain < 2) !== (after.terrain < 2)) changed.add("TOPOLOGY");
    else if (before.terrain !== after.terrain || before.feature !== after.feature) changed.add("CLIMATE");
    if (before.elevation !== after.elevation) changed.add("RELIEF");
    if (before.river !== after.river) changed.add("HYDROLOGY");
    if (before.resource !== after.resource
      || before.resourceAmount !== after.resourceAmount
      || before.wonder !== after.wonder
      || before.improvement !== after.improvement
      || before.route !== after.route
      || before.owner !== after.owner) changed.add("CONTENT");
  }
  if (JSON.stringify(previous.startLocations) !== JSON.stringify(current.startLocations)) changed.add("STARTS");
  if (previous.players !== current.players || JSON.stringify(previous.cities ?? []) !== JSON.stringify(current.cities ?? [])) changed.add("STARTS");
  if (!changed.size && previous !== current) changed.add("LEGALITY");
  return changed;
}

function neighbors(index: number, width: number, height: number, wraps: boolean) {
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

export function objectsFromAssignments(kind: GeographicObjectKind, assignments: ArrayLike<number>, count: number, prefix: string) {
  const tiles = Array.from({ length: count }, () => [] as number[]);
  for (let index = 0; index < assignments.length; index += 1) {
    const owner = assignments[index];
    if (owner >= 0 && owner < count) tiles[owner].push(index);
  }
  return tiles.flatMap((tileIndices, index) => tileIndices.length ? [{ id: `${kind.toLowerCase()}-${index + 1}`, name: `${prefix} ${index + 1}`, kind, tileIndices }] : []);
}

export function connectedTileObjects(kind: GeographicObjectKind, mask: boolean[], width: number, height: number, wraps: boolean, prefix: string) {
  const assigned = new Set<number>();
  const result: GeographicObject[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || assigned.has(origin)) continue;
    const tileIndices = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < tileIndices.length; cursor += 1) {
      for (const next of neighbors(tileIndices[cursor], width, height, wraps)) {
        if (!mask[next] || assigned.has(next)) continue;
        assigned.add(next);
        tileIndices.push(next);
      }
    }
    const number = result.length + 1;
    result.push({ id: `${kind.toLowerCase()}-${number}`, name: `${prefix} ${number}`, kind, tileIndices });
  }
  return result;
}

export function connectedLinearFeatures(mask: boolean[], width: number, height: number, wraps: boolean, prefix: string): LinearGeography[] {
  const assigned = new Set<number>();
  const result: LinearGeography[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || assigned.has(origin)) continue;
    const tileIndices = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < tileIndices.length; cursor += 1) {
      for (const next of neighbors(tileIndices[cursor], width, height, wraps)) {
        if (!mask[next] || assigned.has(next)) continue;
        assigned.add(next);
        tileIndices.push(next);
      }
    }
    if (tileIndices.length < 2) continue;
    const number = result.length + 1;
    result.push({ id: `${prefix.toLowerCase().replaceAll(" ", "-")}-${number}`, name: `${prefix} ${number}`, tileIndices });
  }
  return result;
}

export function attachRiverSystems(map: Civ5Map, structure: GenerationStructure) {
  const riverTiles = map.tiles.map((tile) => tile.river > 0);
  const systems = connectedLinearFeatures(riverTiles, map.width, map.height, map.wraps, "River System");
  for (const system of systems) {
    system.source = system.tileIndices.reduce((best, index) => map.tiles[index].elevation > map.tiles[best].elevation ? index : best, system.tileIndices[0]);
    system.outlet = system.tileIndices.find((index) => neighbors(index, map.width, map.height, map.wraps).some((next) => map.tiles[next].terrain < 2));
  }
  const retainedObjects = structure.engine === "ECCENTRIC"
    ? [...structure.objects.filter((object) => object.kind !== "RIVER_BASIN"), ...systems.map((system, index) => ({ id: `river-basin-${index + 1}`, name: `River Basin ${index + 1}`, kind: "RIVER_BASIN" as const, tileIndices: [...system.tileIndices], attributes: { source: system.source ?? -1, outlet: system.outlet ?? -1 } }))]
    : structure.objects;
  return { ...structure, objects: retainedObjects, riverSystems: systems, diagnostics: { ...structure.diagnostics, riverSystems: systems.length, riverBasins: structure.engine === "ECCENTRIC" ? systems.length : structure.diagnostics.riverBasins ?? 0 } };
}

export function cloneGenerationStructure(structure: GenerationStructure | undefined) {
  if (!structure) return undefined;
  return {
    ...structure,
    objects: structure.objects.map((object) => ({ ...object, tileIndices: [...object.tileIndices], neighbors: object.neighbors ? [...object.neighbors] : undefined, attributes: object.attributes ? { ...object.attributes } : undefined })),
    mountainRanges: structure.mountainRanges.map((range) => ({ ...range, tileIndices: [...range.tileIndices] })),
    riverSystems: structure.riverSystems.map((river) => ({ ...river, tileIndices: [...river.tileIndices] })),
    diagnostics: { ...structure.diagnostics },
    semanticLineage: structure.semanticLineage?.map((lineage) => ({ ...lineage })),
    provenance: structure.provenance?.map((entry) => ({ ...entry, dependencies: [...entry.dependencies], ownedOutputs: [...entry.ownedOutputs], relaxations: [...entry.relaxations] })),
    passEvidence: structure.passEvidence?.map((entry) => ({ ...entry })),
    strategicGraph: structure.strategicGraph ? {
      ...structure.strategicGraph,
      nodes: structure.strategicGraph.nodes.map((node) => ({ ...node })),
      edges: structure.strategicGraph.edges.map((edge) => ({ ...edge, tileIndices: [...edge.tileIndices] })),
      protectedTileIndices: [...structure.strategicGraph.protectedTileIndices],
      relaxations: [...structure.strategicGraph.relaxations],
      metrics: { ...structure.strategicGraph.metrics },
      version: 2,
      mapType: structure.strategicGraph.mapType ?? structure.narrativeSkeleton?.profileId ?? structure.strategicGraph.pattern,
      matchIntent: structure.strategicGraph.matchIntent ? { ...structure.strategicGraph.matchIntent, enabledVictories: [...structure.strategicGraph.matchIntent.enabledVictories], emphasizedVictories: [...structure.strategicGraph.matchIntent.emphasizedVictories] } : { humanPlayers: 0, aiPlayers: 0, flexiblePlayers: structure.strategicGraph.nodes.filter((node) => node.kind === "MAJOR_START").length, teamIntent: "FLEXIBLE", competitiveStrictness: "BALANCED", aiAccommodation: "NORMAL", enabledVictories: ["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"], emphasizedVictories: [] },
      realmRoles: (structure.strategicGraph.realmRoles ?? []).map((role) => ({ ...role, playerIds: [...role.playerIds] })),
      victoryFeasibility: (structure.strategicGraph.victoryFeasibility ?? []).map((finding) => ({ ...finding, evidence: [...finding.evidence], metrics: { ...finding.metrics } })),
    } : undefined,
    matchAssessment: structure.matchAssessment ? { ...structure.matchAssessment, victories: structure.matchAssessment.victories.map((finding) => ({ ...finding, evidence: [...finding.evidence], metrics: { ...finding.metrics } })), metrics: { ...structure.matchAssessment.metrics }, limitations: [...structure.matchAssessment.limitations] } : undefined,
    narrativeSkeleton: structure.narrativeSkeleton ? {
      ...structure.narrativeSkeleton,
      regions: structure.narrativeSkeleton.regions.map((region) => ({ ...region })),
      relationships: structure.narrativeSkeleton.relationships.map((relationship) => ({ ...relationship, points: relationship.points.map((point) => ({ ...point })) })),
      targets: { ...structure.narrativeSkeleton.targets },
      conflicts: [...structure.narrativeSkeleton.conflicts],
      relaxations: [...structure.narrativeSkeleton.relaxations],
    } : undefined,
    narrativeAssessment: structure.narrativeAssessment ? {
      ...structure.narrativeAssessment,
      motifs: structure.narrativeAssessment.motifs.map((finding) => ({ ...finding })),
      antiMotifs: structure.narrativeAssessment.antiMotifs.map((finding) => ({ ...finding })),
      parameterDeviations: [...structure.narrativeAssessment.parameterDeviations],
      weakened: [...structure.narrativeAssessment.weakened],
      nearestConfusions: structure.narrativeAssessment.nearestConfusions.map((confusion) => ({ ...confusion })),
      legalityRelaxations: [...structure.narrativeAssessment.legalityRelaxations],
    } : undefined,
  } satisfies GenerationStructure;
}
