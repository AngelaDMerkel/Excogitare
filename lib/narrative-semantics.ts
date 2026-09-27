import type { Civ5Map } from "./civ5-map.ts";
import type {
  NarrativeConstraint,
  NarrativeConstraintProgram,
  NarrativeEvidenceDefinition,
  NarrativeMeasureKey,
} from "./narrative-constraints.ts";
import { reconstructCiv5RiverEdgeSystems } from "./rivers.ts";

export const NARRATIVE_SEMANTIC_MODEL_SCHEMA_VERSION = 1 as const;
export const NARRATIVE_EVALUATION_SCHEMA_VERSION = 1 as const;

export type NarrativeSemanticKind =
  | "LANDMASS"
  | "EDGE_OCEAN"
  | "ENCLOSED_SEA"
  | "LAKE"
  | "NAVIGATION_BASIN"
  | "STRAIT"
  | "CANAL_ISTHMUS"
  | "PENINSULA"
  | "STRATEGIC_CORRIDOR"
  | "MOUNTAIN_RANGE"
  | "BROKEN_RANGE"
  | "MOUNTAIN_PASS"
  | "WATERSHED"
  | "ENDORHEIC_WATERSHED"
  | "CLIMATE_REGION"
  | "RAIN_SHADOW"
  | "REFUGE"
  | "START_REALM"
  | "CITY_STATE_REGION"
  | "RESOURCE_CONCENTRATION"
  | "BARREN_MARCH"
  | "CONTESTED_OBJECTIVE";

export type NarrativeSemanticObject = {
  id: string;
  kind: NarrativeSemanticKind;
  tileIndices: number[];
  relatedObjectIds: string[];
  confidence: number;
  source: "MEASURED" | "INFERRED" | "CORROBORATED";
  explanation: string;
  metrics: Record<string, number>;
};

export type NarrativeSemanticMetric = {
  key: NarrativeMeasureKey;
  value: number;
  confidence: number;
  source: "MEASURED" | "INFERRED" | "CORROBORATED";
  objectIds: string[];
  explanation: string;
};

export type NarrativeSemanticModel = {
  schemaVersion: 1;
  inputHash: string;
  stage: "LEGAL_NORMALIZED";
  width: number;
  height: number;
  wraps: boolean;
  objects: NarrativeSemanticObject[];
  metrics: Partial<Record<NarrativeMeasureKey, NarrativeSemanticMetric>>;
  limitations: string[];
};

export type NarrativeConstraintFinding = {
  constraintId: string;
  label: string;
  strength: NarrativeConstraint["strength"];
  status: "MET" | "WEAK" | "FAILED" | "UNAVAILABLE";
  score: number;
  confidence: number;
  evidence: string[];
  measured: Array<{ measureKey: NarrativeMeasureKey; value?: number; target: string }>;
  objectIds: string[];
  relaxationId?: string;
};

export type NarrativeProgramEvaluation = {
  schemaVersion: 1;
  inputHash: string;
  programHash: string;
  modelHash: string;
  profileId: NarrativeConstraintProgram["profileId"];
  status: "SATISFIED" | "WEAKENED" | "FAILED" | "UNEVALUABLE";
  score: number;
  essentialFloorMet: boolean;
  findings: NarrativeConstraintFinding[];
  appliedRelaxations: string[];
  limitations: string[];
};

export type NarrativeConfusionComparison = {
  intended: NarrativeProgramEvaluation;
  alternatives: NarrativeProgramEvaluation[];
  scoreMargin: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
};

type Component = {
  indices: number[];
  edgeConnected: boolean;
};

type NarrowCut = {
  throat: number[];
  sides: number[][];
};

const NARRATIVE_ADJACENCY: unique symbol = Symbol("narrative-adjacency");
type NarrativeGrid = Pick<Civ5Map, "width" | "height" | "wraps"> & {
  [NARRATIVE_ADJACENCY]?: ReadonlyArray<ReadonlyArray<number>>;
};

const CLIMATE_NAMES = ["TEMPERATE", "ARID", "COLD", "WET"] as const;
type ClimateName = (typeof CLIMATE_NAMES)[number];

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function narrativeEvaluationInputHash(programHash: string, modelHash: string, appliedRelaxationIds: readonly string[]) {
  return hashText(JSON.stringify(stableValue({ programHash, modelHash, appliedRelaxationIds: [...appliedRelaxationIds] })));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([one], [two]) => one.localeCompare(two)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function uncachedNeighbors(index: number, map: Pick<Civ5Map, "width" | "height" | "wraps">) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (map.wraps) nextX = (nextX + map.width) % map.width;
    return nextX >= 0 && nextX < map.width && nextY >= 0 && nextY < map.height ? [nextY * map.width + nextX] : [];
  });
}

function neighbors(index: number, map: NarrativeGrid) {
  return map[NARRATIVE_ADJACENCY]?.[index] ?? uncachedNeighbors(index, map);
}

function withNarrativeAdjacency(map: Civ5Map): Civ5Map & NarrativeGrid {
  const adjacency = Array.from({ length: map.tiles.length }, (_value, index) => uncachedNeighbors(index, map));
  return Object.assign({ ...map }, { [NARRATIVE_ADJACENCY]: adjacency });
}

function touchesExternalEdge(index: number, map: Pick<Civ5Map, "width" | "height" | "wraps">) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  return y === 0 || y === map.height - 1 || (!map.wraps && (x === 0 || x === map.width - 1));
}

function components(mask: ReadonlyArray<boolean>, map: NarrativeGrid, removed = new Set<number>()) {
  const visited = new Uint8Array(mask.length);
  const result: Component[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || removed.has(origin) || visited[origin]) continue;
    const indices = [origin];
    visited[origin] = 1;
    let edgeConnected = false;
    for (let cursor = 0; cursor < indices.length; cursor += 1) {
      const index = indices[cursor];
      edgeConnected ||= touchesExternalEdge(index, map);
      for (const next of neighbors(index, map)) {
        if (!mask[next] || removed.has(next) || visited[next]) continue;
        visited[next] = 1;
        indices.push(next);
      }
    }
    result.push({ indices, edgeConnected });
  }
  return result.sort((one, two) => two.indices.length - one.indices.length || one.indices[0] - two.indices[0]);
}

function objectId(kind: NarrativeSemanticKind, indices: ReadonlyArray<number>, suffix = "") {
  return `${kind.toLowerCase().replaceAll("_", "-")}:${hashText(`${[...indices].sort((one, two) => one - two).join(",")}:${suffix}`)}`;
}

function semanticObject(
  kind: NarrativeSemanticKind,
  indices: number[],
  explanation: string,
  options: Partial<Pick<NarrativeSemanticObject, "relatedObjectIds" | "confidence" | "source" | "metrics">> = {},
): NarrativeSemanticObject {
  return {
    id: objectId(kind, indices, explanation),
    kind,
    tileIndices: [...indices].sort((one, two) => one - two),
    relatedObjectIds: [...(options.relatedObjectIds ?? [])],
    confidence: options.confidence ?? 1,
    source: options.source ?? "MEASURED",
    explanation,
    metrics: { ...(options.metrics ?? {}) },
  };
}

function findNarrowCuts(mask: ReadonlyArray<boolean>, opposite: ReadonlyArray<boolean>, map: NarrativeGrid) {
  const minimumSide = Math.max(3, Math.floor(mask.length * 0.002));
  const allNarrow = mask.flatMap((included, index) => {
    if (!included) return [];
    const adjacent = neighbors(index, map);
    return adjacent.filter((next) => opposite[next]).length >= 2 && adjacent.filter((next) => mask[next]).length >= 2 ? [index] : [];
  });
  // Removing a possible throat and recomputing components is intentionally
  // exact, but inspecting every coastal tile makes large-map Review evidence
  // quadratic. Keep every candidate on fixture-sized maps and use an evenly
  // spaced, deterministic audit sample on larger worlds.
  const inspectionBudget = mask.length <= 4_500 ? allNarrow.length : 144;
  const narrow = allNarrow.length <= inspectionBudget
    ? allNarrow
    : Array.from({ length: inspectionBudget }, (_value, sample) => allNarrow[Math.floor(sample * allNarrow.length / inspectionBudget)]);
  const narrowSet = new Set(narrow);
  const cuts: NarrowCut[] = [];
  const signatures = new Set<string>();
  const inspect = (throat: number[]) => {
    const split = components(mask, map, new Set(throat)).filter((component) => component.indices.length >= minimumSide);
    if (split.length < 2) return;
    const adjacentSides = split.filter((component) => component.indices.some((index) => neighbors(index, map).some((next) => throat.includes(next))));
    if (adjacentSides.length < 2) return;
    const signature = throat.slice().sort((one, two) => one - two).join(",");
    if (signatures.has(signature)) return;
    signatures.add(signature);
    cuts.push({ throat: [...throat], sides: adjacentSides.slice(0, 2).map((component) => component.indices) });
  };
  for (const index of narrow) inspect([index]);
  for (const one of narrow) {
    for (const two of neighbors(one, map)) {
      if (two <= one || !narrowSet.has(two)) continue;
      inspect([one, two]);
    }
  }
  return cuts.sort((one, two) => one.throat[0] - two.throat[0] || one.throat.length - two.throat.length);
}

function centroid(indices: ReadonlyArray<number>, width: number) {
  return indices.reduce((point, index) => ({ x: point.x + index % width / indices.length, y: point.y + Math.floor(index / width) / indices.length }), { x: 0, y: 0 });
}

function minimumTileDistance(one: ReadonlyArray<number>, two: ReadonlyArray<number>, width: number) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const first of one) for (const second of two) {
    minimum = Math.min(minimum, Math.hypot(first % width - second % width, Math.floor(first / width) - Math.floor(second / width)));
  }
  return minimum;
}

function climateName(map: Civ5Map, index: number): ClimateName {
  const tile = map.tiles[index];
  if (tile.terrain === 6 || tile.terrain === 5 || tile.feature === 3) return "COLD";
  if (tile.terrain === 4) return "ARID";
  if (tile.feature === 1 || tile.feature === 2) return "WET";
  return "TEMPERATE";
}

function moistureScore(map: Civ5Map, index: number) {
  const tile = map.tiles[index];
  if (tile.terrain < 2) return 0.65;
  if (tile.feature === 1 || tile.feature === 2) return 1;
  if (tile.terrain === 2) return 0.78;
  if (tile.terrain === 3) return 0.55;
  if (tile.terrain === 4) return tile.feature === 4 ? 0.5 : 0.08;
  return 0.3;
}

function hexDistance(one: { x: number; y: number }, two: { x: number; y: number }, width: number, wraps: boolean) {
  const distance = (dx: number) => {
    const oneQ = one.x - (one.y - (one.y & 1)) / 2;
    const twoQ = two.x + dx - (two.y - (two.y & 1)) / 2;
    const dq = twoQ - oneQ;
    const dr = two.y - one.y;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  };
  if (!wraps) return distance(0);
  return Math.min(distance(0), distance(width), distance(-width));
}

function measure(
  metrics: NarrativeSemanticModel["metrics"],
  key: NarrativeMeasureKey,
  value: number,
  explanation: string,
  objectIds: string[] = [],
  confidence = 1,
  source: NarrativeSemanticMetric["source"] = "MEASURED",
) {
  metrics[key] = { key, value: Number(value.toFixed(6)), confidence, source, objectIds: [...objectIds], explanation };
}

function extractTopology(map: Civ5Map, objects: NarrativeSemanticObject[], metrics: NarrativeSemanticModel["metrics"], reuseSettleableCuts: boolean) {
  const landMask = map.tiles.map((tile) => tile.terrain >= 2);
  const waterMask = landMask.map((land) => !land);
  const land = components(landMask, map);
  const water = components(waterMask, map);
  const landObjects = land.map((component) => semanticObject("LANDMASS", component.indices, `${component.indices.length} connected land tiles.`));
  const minimumSea = Math.max(6, Math.floor(map.tiles.length * 0.01));
  const waterObjects = water.map((component) => semanticObject(
    component.edgeConnected ? "EDGE_OCEAN" : component.indices.length >= minimumSea ? "ENCLOSED_SEA" : "LAKE",
    component.indices,
    component.edgeConnected
      ? `${component.indices.length} connected water tiles reach an external edge under the selected wrap model.`
      : `${component.indices.length} connected water tiles are enclosed by land.`,
  ));
  const deepMask = map.tiles.map((tile) => tile.terrain === 0);
  const basins = components(deepMask, map).filter((component) => component.indices.length >= Math.max(4, minimumSea / 2))
    .map((component) => semanticObject("NAVIGATION_BASIN", component.indices, `${component.indices.length} connected deep-water tiles form a distinct navigation basin.`));
  objects.push(...landObjects, ...waterObjects, ...basins);

  const straits = findNarrowCuts(waterMask, landMask, map).map((cut) => semanticObject(
    "STRAIT",
    cut.throat,
    `A ${cut.throat.length}-tile navigable throat joins water regions of ${cut.sides[0].length} and ${cut.sides[1].length} tiles.`,
    { metrics: { width: cut.throat.length, smallerSide: Math.min(cut.sides[0].length, cut.sides[1].length) } },
  ));
  const settleable = map.tiles.map((tile) => tile.terrain >= 2 && tile.elevation < 2 && tile.wonder === 255);
  const settleableCuts = findNarrowCuts(settleable, waterMask, map);
  const isthmuses = settleableCuts.map((cut) => semanticObject(
    "CANAL_ISTHMUS",
    cut.throat,
    `A ${cut.throat.length}-tile settleable land throat separates land regions of ${cut.sides[0].length} and ${cut.sides[1].length} tiles with water along its flanks.`,
    { metrics: { width: cut.throat.length, smallerSide: Math.min(cut.sides[0].length, cut.sides[1].length) } },
  ));
  const peninsulaCuts = reuseSettleableCuts ? settleableCuts : findNarrowCuts(settleable, waterMask, map);
  const peninsulas = peninsulaCuts.flatMap((cut) => {
    const [smaller, larger] = [...cut.sides].sort((one, two) => one.length - two.length);
    if (smaller.length < 3 || smaller.length / Math.max(1, smaller.length + larger.length) > 0.45) return [];
    const coastal = smaller.filter((index) => neighbors(index, map).some((next) => waterMask[next])).length / smaller.length;
    if (coastal < 0.35) return [];
    return [semanticObject("PENINSULA", [...smaller, ...cut.throat], `A ${smaller.length}-tile province joins a larger parent through a ${cut.throat.length}-tile neck and has coastline on ${Math.round(coastal * 100)}% of its tiles.`, { metrics: { neckWidth: cut.throat.length, coastalShare: coastal } })];
  });
  objects.push(...straits, ...isthmuses, ...peninsulas);

  const totalLand = land.reduce((sum, component) => sum + component.indices.length, 0);
  const totalWater = water.reduce((sum, component) => sum + component.indices.length, 0);
  const edgeOcean = water.filter((component) => component.edgeConnected).reduce((sum, component) => sum + component.indices.length, 0);
  measure(metrics, "land-share", totalLand / Math.max(1, map.tiles.length), "Share of tiles belonging to connected land.");
  measure(metrics, "largest-land-share", (land[0]?.indices.length ?? 0) / Math.max(1, totalLand), "Share of all land contained in the largest landmass.", landObjects[0] ? [landObjects[0].id] : []);
  measure(metrics, "land-component-count", land.length, "Number of connected landmasses.", landObjects.map((object) => object.id));
  measure(metrics, "water-body-count", water.length, "Number of connected water bodies.", waterObjects.map((object) => object.id));
  measure(metrics, "edge-ocean-share", edgeOcean / Math.max(1, totalWater), "Share of water connected to an external map edge.", waterObjects.filter((object) => object.kind === "EDGE_OCEAN").map((object) => object.id));
  measure(metrics, "enclosed-sea-count", waterObjects.filter((object) => object.kind === "ENCLOSED_SEA").length, "Number of materially large enclosed water bodies.", waterObjects.filter((object) => object.kind === "ENCLOSED_SEA").map((object) => object.id));
  measure(metrics, "lake-count", waterObjects.filter((object) => object.kind === "LAKE").length, "Number of small enclosed water bodies.", waterObjects.filter((object) => object.kind === "LAKE").map((object) => object.id));
  measure(metrics, "navigation-basin-count", basins.length, "Number of coherent deep-water navigation basins.", basins.map((object) => object.id), 0.9, "INFERRED");
  measure(metrics, "strait-count", straits.length, "Number of one- or two-tile water cuts whose removal separates materially larger water regions.", straits.map((object) => object.id));
  measure(metrics, "canal-isthmus-count", isthmuses.length, "Number of settleable one- or two-tile land cuts separating materially larger land regions.", isthmuses.map((object) => object.id));
  measure(metrics, "peninsula-count", peninsulas.length, "Number of coastal provinces attached through narrow necks.", peninsulas.map((object) => object.id), 0.85, "INFERRED");
  return { landMask, waterMask, settleable, land, water };
}

function extractRelief(
  map: Civ5Map,
  landMask: boolean[],
  settleable: boolean[],
  objects: NarrativeSemanticObject[],
  metrics: NarrativeSemanticModel["metrics"],
) {
  const mountainMask = map.tiles.map((tile, index) => landMask[index] && tile.elevation === 2);
  const ranges = components(mountainMask, map).filter((component) => component.indices.length >= 2)
    .map((component) => semanticObject("MOUNTAIN_RANGE", component.indices, `${component.indices.length} connected mountain tiles form a retained range.`));
  const passTiles = settleable.flatMap((passable, index) => {
    if (!passable) return [];
    const mountains = neighbors(index, map).filter((next) => mountainMask[next]);
    return mountains.length >= 2 ? [index] : [];
  });
  const passTileSet = new Set(passTiles);
  const passes = components(map.tiles.map((_tile, index) => passTileSet.has(index)), map)
    .map((component) => semanticObject("MOUNTAIN_PASS", component.indices, `${component.indices.length} passable tiles cross or interrupt neighboring mountain relief.`, { confidence: 0.85, source: "INFERRED" }));
  const broken: NarrativeSemanticObject[] = [];
  for (let one = 0; one < ranges.length; one += 1) for (let two = one + 1; two < ranges.length; two += 1) {
    if (minimumTileDistance(ranges[one].tileIndices, ranges[two].tileIndices, map.width) > 3.1) continue;
    const first = centroid(ranges[one].tileIndices, map.width);
    const second = centroid(ranges[two].tileIndices, map.width);
    const axis = Math.abs(first.x - second.x) >= Math.abs(first.y - second.y) ? "east–west" : "north–south";
    const indices = [...ranges[one].tileIndices, ...ranges[two].tileIndices];
    broken.push(semanticObject("BROKEN_RANGE", indices, `Two aligned mountain sections form a broken ${axis} system with a deliberate discontinuity.`, { relatedObjectIds: [ranges[one].id, ranges[two].id], confidence: 0.78, source: "INFERRED" }));
  }
  const corridors = [...passes, ...objects.filter((object) => object.kind === "CANAL_ISTHMUS")].map((object) => semanticObject(
    "STRATEGIC_CORRIDOR",
    object.tileIndices,
    `${object.kind === "MOUNTAIN_PASS" ? "A mountain pass" : "A narrow land throat"} creates a route-controlling corridor.`,
    { relatedObjectIds: [object.id], confidence: object.confidence, source: "INFERRED", metrics: { width: object.tileIndices.length } },
  ));
  objects.push(...ranges, ...passes, ...broken, ...corridors);
  measure(metrics, "mountain-range-count", ranges.length, "Number of connected mountain systems.", ranges.map((object) => object.id));
  measure(metrics, "broken-range-count", broken.length, "Number of nearby aligned range sections separated by passes or lowland gaps.", broken.map((object) => object.id), 0.78, "INFERRED");
  measure(metrics, "mountain-pass-count", passes.length, "Number of passable interruptions through mountain relief.", passes.map((object) => object.id), 0.85, "INFERRED");
  measure(metrics, "strategic-corridor-count", corridors.length, "Number of inferred land throats and mountain passes that constrain travel.", corridors.map((object) => object.id), 0.8, "INFERRED");
}

function extractHydrology(
  map: Civ5Map,
  waterComponents: Component[],
  objects: NarrativeSemanticObject[],
  metrics: NarrativeSemanticModel["metrics"],
) {
  const riverSystems = reconstructCiv5RiverEdgeSystems(map).filter((system) => system.edgeCount >= 2);
  const watersheds: NarrativeSemanticObject[] = [];
  let valid = 0;
  let endorheic = 0;
  let junctions = 0;
  for (const system of riverSystems) {
    const source = system.sourceVertices.length > 0;
    const outlet = system.outletVertices.length > 0;
    const localJunctions = system.junctionVertices.length;
    junctions += localJunctions;
    const outletTiles = new Set(system.outletTileIndices);
    const outletBodies = waterComponents.filter((body) => body.indices.some((index) => outletTiles.has(index)));
    const enclosedOutlet = outletBodies.some((body) => !body.edgeConnected);
    if (source && outlet) valid += 1;
    if (source && outlet && enclosedOutlet) endorheic += 1;
    const kind = source && outlet && enclosedOutlet ? "ENDORHEIC_WATERSHED" : "WATERSHED";
    watersheds.push(semanticObject(kind, system.ownerIndices, `${system.edgeCount} vertex-connected river edges have ${source ? "a mountain source" : "no verified mountain source"}, ${outlet ? enclosedOutlet ? "an enclosed-basin outlet" : "an open-water outlet" : "no verified outlet"}, and ${localJunctions} tributary junctions.`, {
      confidence: source && outlet && system.acyclic && system.directedToOutlet ? 0.9 : 0.72,
      source: "INFERRED",
      metrics: {
        source: Number(source),
        outlet: Number(outlet),
        endorheic: Number(enclosedOutlet),
        tributaryJunctions: localJunctions,
        directedToOutlet: Number(system.directedToOutlet),
        acyclic: Number(system.acyclic),
      },
    }));
  }
  objects.push(...watersheds);
  measure(metrics, "watershed-count", watersheds.length, "Number of connected multi-tile river systems.", watersheds.map((object) => object.id), 0.86, "INFERRED");
  measure(metrics, "valid-watershed-share", valid / Math.max(1, watersheds.length), "Share of detected watersheds with both a mountain source and legal water outlet.", watersheds.map((object) => object.id), 0.86, "INFERRED");
  measure(metrics, "endorheic-watershed-count", endorheic, "Number of valid watersheds draining into enclosed water.", watersheds.filter((object) => object.kind === "ENDORHEIC_WATERSHED").map((object) => object.id), 0.84, "INFERRED");
  measure(metrics, "tributary-junction-count", junctions, "Number of river tiles with at least three neighboring river tiles.", watersheds.map((object) => object.id), 0.75, "INFERRED");
}

function extractClimate(
  map: Civ5Map,
  landMask: boolean[],
  objects: NarrativeSemanticObject[],
  metrics: NarrativeSemanticModel["metrics"],
) {
  const climateByTile = map.tiles.map((_tile, index) => landMask[index] ? climateName(map, index) : undefined);
  const climateObjects: NarrativeSemanticObject[] = [];
  for (const climate of CLIMATE_NAMES) {
    const mask = climateByTile.map((value) => value === climate);
    for (const component of components(mask, map).filter((candidate) => candidate.indices.length >= 2)) {
      climateObjects.push(semanticObject("CLIMATE_REGION", component.indices, `${component.indices.length} connected land tiles form a ${climate.toLowerCase()} climate region.`, { metrics: { climate: CLIMATE_NAMES.indexOf(climate) } }));
    }
  }
  const transitions = new Set<string>();
  for (let index = 0; index < map.tiles.length; index += 1) {
    const climate = climateByTile[index];
    if (!climate) continue;
    for (const next of neighbors(index, map)) {
      const other = climateByTile[next];
      if (!other || other === climate) continue;
      transitions.add([climate, other].sort().join(":"));
    }
  }
  const shadowMask = new Array<boolean>(map.tiles.length).fill(false);
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
    const index = y * map.width + x;
    if (!landMask[index] || map.tiles[index].elevation !== 2 || x < 2 || x > map.width - 4) continue;
    const west = [x - 2, x - 1].map((sampleX) => moistureScore(map, y * map.width + sampleX)).reduce((sum, value) => sum + value, 0) / 2;
    const eastIndices = [x + 1, x + 2, x + 3].map((sampleX) => y * map.width + sampleX).filter((sample) => landMask[sample]);
    if (!eastIndices.length) continue;
    const east = eastIndices.map((sample) => moistureScore(map, sample)).reduce((sum, value) => sum + value, 0) / eastIndices.length;
    if (west - east >= 0.28) for (const sample of eastIndices) shadowMask[sample] = true;
  }
  const shadows = components(shadowMask, map).filter((component) => component.indices.length >= 2)
    .map((component) => semanticObject("RAIN_SHADOW", component.indices, `${component.indices.length} dry leeward tiles sit east of wetter terrain and mountain relief.`, { confidence: 0.76, source: "INFERRED" }));
  const hostileMask = map.tiles.map((tile, index) => landMask[index] && (tile.terrain === 4 || tile.terrain === 5 || tile.terrain === 6 || tile.feature === 3));
  const hostile = hostileMask.filter(Boolean).length;
  const refugeObjects = climateObjects.filter((object) => {
    const climateCode = object.metrics.climate;
    if (climateCode !== CLIMATE_NAMES.indexOf("TEMPERATE") && climateCode !== CLIMATE_NAMES.indexOf("WET")) return false;
    return object.tileIndices.some((index) => neighbors(index, map).some((next) => hostileMask[next]));
  }).map((object) => semanticObject("REFUGE", object.tileIndices, `A productive ${object.tileIndices.length}-tile climate region borders hostile terrain.`, { relatedObjectIds: [object.id], confidence: 0.82, source: "INFERRED" }));
  objects.push(...climateObjects, ...shadows, ...refugeObjects);
  measure(metrics, "climate-region-count", climateObjects.length, "Number of connected terrain-and-feature climate regions.", climateObjects.map((object) => object.id), 0.8, "INFERRED");
  measure(metrics, "climate-transition-count", transitions.size, "Number of distinct neighboring climate-category transitions.", [], 0.78, "INFERRED");
  measure(metrics, "rain-shadow-count", shadows.length, "Number of dry leeward regions east of wetter mountain approaches.", shadows.map((object) => object.id), 0.76, "INFERRED");
  measure(metrics, "refuge-count", refugeObjects.length, "Number of productive climate regions directly bordering hostile terrain.", refugeObjects.map((object) => object.id), 0.82, "INFERRED");
  measure(metrics, "hostile-frontier-share", hostile / Math.max(1, landMask.filter(Boolean).length), "Share of land covered by desert, tundra, snow, or ice.", [], 0.9, "INFERRED");
}

function extractGameplayAndValue(
  map: Civ5Map,
  landMask: boolean[],
  landComponents: Component[],
  objects: NarrativeSemanticObject[],
  metrics: NarrativeSemanticModel["metrics"],
) {
  const componentByTile = new Int32Array(map.tiles.length).fill(-1);
  landComponents.forEach((component, componentIndex) => component.indices.forEach((index) => { componentByTile[index] = componentIndex; }));
  const majors = map.startLocations.filter((start) => !start.cityState);
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const startsByComponent = new Map<number, typeof majors>();
  for (const start of majors) {
    const component = componentByTile[start.y * map.width + start.x];
    const starts = startsByComponent.get(component) ?? [];
    starts.push(start);
    startsByComponent.set(component, starts);
  }
  const startRealms = [...startsByComponent].filter(([component]) => component >= 0).map(([component, starts]) => semanticObject(
    "START_REALM",
    landComponents[component].indices,
    `${landComponents[component].indices.length} connected land tiles contain ${starts.length} major start${starts.length === 1 ? "" : "s"}.`,
    { metrics: { majorStarts: starts.length } },
  ));
  const cityStateComponents = new Set(cityStates.map((start) => componentByTile[start.y * map.width + start.x]).filter((component) => component >= 0));
  const cityStateRegions = [...cityStateComponents].map((component) => semanticObject("CITY_STATE_REGION", landComponents[component].indices, `A connected land region contains one or more city-state starts.`));
  objects.push(...startRealms, ...cityStateRegions);

  const pairDistances: number[] = [];
  for (let one = 0; one < majors.length; one += 1) for (let two = one + 1; two < majors.length; two += 1) pairDistances.push(hexDistance(majors[one], majors[two], map.width, map.wraps));
  const landIsolated = majors.filter((start) => (startsByComponent.get(componentByTile[start.y * map.width + start.x])?.length ?? 0) === 1).length;
  const strategicMajors = map.structure?.strategicGraph?.nodes.filter((node) => node.kind === "MAJOR_START") ?? [];
  const strategicMajorIds = new Set(strategicMajors.map((node) => node.id));
  const strategicallyIsolated = strategicMajors.filter((node) => !map.structure?.strategicGraph?.edges.some((edge) =>
    (edge.from === node.id && strategicMajorIds.has(edge.to)) || (edge.to === node.id && strategicMajorIds.has(edge.from)),
  )).length;
  // Polis defines isolation in its retained strategic graph. A capital on its
  // own landmass is not isolated when a legal naval lane, pass, or land bridge
  // links it to another realm. Field and graph geography without a strategic
  // graph continues to use literal land-component isolation.
  const isolatedShare = strategicMajors.length
    ? strategicallyIsolated / strategicMajors.length
    : landIsolated / Math.max(1, majors.length);
  const geographicRealmSeparation = pairDistances.length ? pairDistances.reduce((sum, value) => sum + value, 0) / pairDistances.length / Math.max(map.width, map.height) : majors.length === 1 ? 1 : 0;
  const sameRealmPairs = pairDistances.length ? majors.flatMap((start, one) => majors.slice(one + 1).map((other) => componentByTile[start.y * map.width + start.x] === componentByTile[other.y * map.width + other.x])).filter(Boolean).length / pairDistances.length : 0;
  const strategicGraph = map.structure?.strategicGraph;
  const majorNodeByOwner = new Map((strategicGraph?.nodes ?? []).filter((node) => node.kind === "MAJOR_START" && node.owner !== undefined).map((node) => [node.owner!, node]));
  const strategicRealms = (strategicGraph?.realmRoles ?? []).map((realm) => ({
    team: realm.team,
    nodes: realm.playerIds.flatMap((player) => {
      const node = majorNodeByOwner.get(player);
      return node ? [node] : [];
    }),
  })).filter((realm) => realm.nodes.length);
  const strategicRealmCentroids = strategicRealms.map((realm) => ({
    team: realm.team,
    x: realm.nodes.reduce((sum, node) => sum + node.x, 0) / realm.nodes.length,
    y: realm.nodes.reduce((sum, node) => sum + node.y, 0) / realm.nodes.length,
  }));
  const strategicRealmDistances = strategicRealmCentroids.flatMap((realm, index) => strategicRealmCentroids.slice(index + 1).map((other) => Math.hypot(realm.x - other.x, realm.y - other.y)));
  const realmSeparation = strategicRealmDistances.length
    ? strategicRealmDistances.reduce((sum, value) => sum + value, 0) / strategicRealmDistances.length / Math.max(map.width, map.height)
    : geographicRealmSeparation;
  const strategicTeamByNode = new Map((strategicGraph?.nodes ?? []).filter((node) => node.kind === "MAJOR_START").map((node) => [node.id, node.team ?? node.owner ?? 0]));
  const crossRealmMajorRoutes = (strategicGraph?.edges ?? []).filter((edge) => {
    const one = strategicTeamByNode.get(edge.from);
    const two = strategicTeamByNode.get(edge.to);
    return one !== undefined && two !== undefined && one !== two;
  }).length;
  const possibleCrossRealmPairs = strategicRealms.flatMap((realm, index) => strategicRealms.slice(index + 1).map((other) => realm.nodes.length * other.nodes.length)).reduce((sum, count) => sum + count, 0);
  const crossingDensity = strategicRealms.length >= 2
    ? crossRealmMajorRoutes / Math.max(1, possibleCrossRealmPairs)
    : sameRealmPairs;
  measure(metrics, "start-realm-count", startRealms.length, "Number of connected land regions occupied by major starts.", startRealms.map((object) => object.id));
  measure(
    metrics,
    "isolated-major-share",
    isolatedShare,
    strategicMajors.length
      ? "Share of major starts with no retained strategic route to another major civilization."
      : "Share of major starts that are the sole major civilization on their landmass.",
    strategicMajors.length ? [] : startRealms.map((object) => object.id),
    strategicMajors.length ? 0.95 : 1,
    strategicMajors.length ? "CORROBORATED" : "MEASURED",
  );
  measure(metrics, "city-state-region-count", cityStateRegions.length, "Number of connected land regions occupied by city states.", cityStateRegions.map((object) => object.id));
  measure(metrics, "minimum-start-distance", pairDistances.length ? Math.min(...pairDistances) : 0, "Minimum hex distance between major starts.");
  measure(
    metrics,
    "realm-separation",
    realmSeparation,
    strategicRealmDistances.length
      ? "Mean separation between retained strategic-realm centroids, normalized by the larger map dimension."
      : "Mean major-start separation normalized by the larger map dimension.",
    strategicRealmDistances.length ? [] : startRealms.map((object) => object.id),
    strategicRealmDistances.length ? 0.95 : 0.9,
    strategicRealmDistances.length ? "CORROBORATED" : "INFERRED",
  );
  measure(
    metrics,
    "crossing-density",
    crossingDensity,
    strategicRealms.length >= 2
      ? "Share of possible cross-realm major pairs with a retained direct strategic route."
      : "Share of major-start pairs connected within the same land realm.",
    strategicRealms.length >= 2 ? [] : startRealms.map((object) => object.id),
    strategicRealms.length >= 2 ? 0.95 : 0.8,
    strategicRealms.length >= 2 ? "CORROBORATED" : "INFERRED",
  );
  measure(metrics, "coastal-hopping", 1 - landIsolated / Math.max(1, majors.length), "Share of major starts that share a land realm with another major civilization.", startRealms.map((object) => object.id), 0.65, "INFERRED");
  measure(metrics, "oceanic-negative-space", map.tiles.filter((tile) => tile.terrain === 0).length / Math.max(1, map.tiles.length), "Share of the map occupied by deep ocean.");

  const routeRedundancy = map.structure?.strategicGraph
    ? Number(map.structure.strategicGraph.metrics.routeRedundancy ?? map.structure.strategicGraph.metrics.redundancy ?? 0)
    : sameRealmPairs;
  measure(metrics, "route-redundancy", routeRedundancy, map.structure?.strategicGraph ? "Retained strategic graph route redundancy." : "Inferred share of major pairs sharing a connected land realm.", [], map.structure?.strategicGraph ? 0.95 : 0.55, map.structure?.strategicGraph ? "CORROBORATED" : "INFERRED");

  const resourcesByComponent = landComponents.map((component) => component.indices.filter((index) => map.tiles[index].resource !== 255).length);
  const totalResources = resourcesByComponent.reduce((sum, value) => sum + value, 0);
  const concentration = totalResources ? Math.max(...resourcesByComponent, 0) / totalResources : 0;
  const valueByTile = map.tiles.map((tile) => tile.terrain < 2 ? 0 : (tile.resource !== 255 ? 2 : 0) + (tile.wonder !== 255 ? 4 : 0) + (tile.terrain === 2 ? 1 : tile.terrain === 3 ? 0.7 : 0.25));
  const landValues = valueByTile.filter((_value, index) => landMask[index]);
  const mean = landValues.reduce((sum, value) => sum + value, 0) / Math.max(1, landValues.length);
  const deviation = Math.sqrt(landValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, landValues.length));
  const gradient = mean ? clamp(deviation / mean / 2) : 0;
  const barrenMask = map.tiles.map((tile, index) => landMask[index] && tile.resource === 255 && tile.wonder === 255 && (tile.terrain === 4 || tile.terrain === 5 || tile.terrain === 6));
  const barrenComponents = components(barrenMask, map).filter((component) => component.indices.length >= 3)
    .map((component) => semanticObject("BARREN_MARCH", component.indices, `${component.indices.length} connected hostile land tiles lack resources and wonders.`, { confidence: 0.9, source: "INFERRED" }));
  const richComponent = resourcesByComponent.indexOf(Math.max(...resourcesByComponent, 0));
  const concentrationObjects = richComponent >= 0 && totalResources > 0
    ? [semanticObject("RESOURCE_CONCENTRATION", landComponents[richComponent].indices, `${resourcesByComponent[richComponent]} of ${totalResources} land resources occur in one connected realm.`, { metrics: { share: concentration } })]
    : [];
  objects.push(...barrenComponents, ...concentrationObjects);
  measure(metrics, "resource-concentration", concentration, "Largest connected land realm's share of all land resources.", concentrationObjects.map((object) => object.id), 0.9, "INFERRED");
  measure(metrics, "value-gradient", gradient, "Normalized variation in tile value across land.", concentrationObjects.map((object) => object.id), 0.72, "INFERRED");
  measure(metrics, "barren-march-share", barrenMask.filter(Boolean).length / Math.max(1, landMask.filter(Boolean).length), "Share of land in contiguous hostile, resource-poor marches.", barrenComponents.map((object) => object.id), 0.9, "INFERRED");

  const contested = map.structure?.strategicGraph?.nodes.filter((node) => node.kind === "CONTESTED" || node.kind === "OBJECTIVE") ?? [];
  if (contested.length) {
    const contestedObjects = contested.map((node) => semanticObject("CONTESTED_OBJECTIVE", [node.y * map.width + node.x], `Strategic graph node ${node.id} is retained as a contested objective.`, { confidence: 0.95, source: "CORROBORATED" }));
    objects.push(...contestedObjects);
    measure(metrics, "contested-objective-count", contested.length, "Number of corroborated contested or objective nodes.", contestedObjects.map((object) => object.id), 0.95, "CORROBORATED");
  }
}

function extractNarrativeSemanticsWithMode(
  source: Civ5Map,
  mode: Readonly<{ cacheAdjacency: boolean; reuseSettleableCuts: boolean }>,
): NarrativeSemanticModel {
  const map = mode.cacheAdjacency ? withNarrativeAdjacency(source) : source;
  if (!Number.isInteger(map.width) || map.width < 1 || !Number.isInteger(map.height) || map.height < 1 || map.tiles.length !== map.width * map.height) throw new Error("Narrative semantic extraction requires a complete rectangular Civ5Map grid.");
  const objects: NarrativeSemanticObject[] = [];
  const metrics: NarrativeSemanticModel["metrics"] = {};
  const topology = extractTopology(map, objects, metrics, mode.reuseSettleableCuts);
  extractRelief(map, topology.landMask, topology.settleable, objects, metrics);
  extractHydrology(map, topology.water, objects, metrics);
  extractClimate(map, topology.landMask, objects, metrics);
  extractGameplayAndValue(map, topology.landMask, topology.land, objects, metrics);
  const orderedObjects = [...new Map(
    objects
      .sort((one, two) => one.kind.localeCompare(two.kind) || one.tileIndices[0] - two.tileIndices[0] || one.id.localeCompare(two.id))
      .map((object) => [object.id, object]),
  ).values()];
  const input = {
    width: map.width,
    height: map.height,
    wraps: map.wraps,
    tiles: map.tiles.map((tile) => [tile.terrain, tile.elevation, tile.feature, tile.river, tile.resource, tile.wonder]),
    starts: map.startLocations.map((start) => [start.x, start.y, start.player, start.team, start.cityState]),
    objects: orderedObjects,
    metrics,
  };
  return {
    schemaVersion: NARRATIVE_SEMANTIC_MODEL_SCHEMA_VERSION,
    inputHash: hashText(JSON.stringify(stableValue(input))),
    stage: "LEGAL_NORMALIZED",
    width: map.width,
    height: map.height,
    wraps: map.wraps,
    objects: orderedObjects.map((object) => ({ ...object, tileIndices: [...object.tileIndices], relatedObjectIds: [...object.relatedObjectIds], metrics: { ...object.metrics } })),
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, metric ? { ...metric, objectIds: [...metric.objectIds] } : metric])),
    limitations: [
      "Climate semantics are inferred from final Civ5 terrain and features rather than a retained atmospheric simulation.",
      "River semantics use final river-bearing tiles; edge-level tributary geometry may reduce confidence.",
      ...(map.structure?.strategicGraph ? [] : ["Route redundancy lacks a retained strategic graph and is inferred from land-realm connectivity."]),
    ],
  };
}

/** Exact pre-cache extraction path retained as a test oracle. */
export function extractNarrativeSemanticsReference(map: Civ5Map): NarrativeSemanticModel {
  return extractNarrativeSemanticsWithMode(map, { cacheAdjacency: false, reuseSettleableCuts: false });
}

export function extractNarrativeSemantics(map: Civ5Map): NarrativeSemanticModel {
  return extractNarrativeSemanticsWithMode(map, { cacheAdjacency: true, reuseSettleableCuts: true });
}

function targetLabel(evidence: NarrativeEvidenceDefinition) {
  return Array.isArray(evidence.target) ? `${evidence.target[0]}–${evidence.target[1]}` : `${evidence.operator} ${evidence.target}`;
}

function evidenceStatus(value: number, evidence: NarrativeEvidenceDefinition, tolerance: number) {
  if (evidence.operator === "AT_LEAST") {
    if (value >= Number(evidence.target)) return "MET" as const;
    return value >= Number(evidence.target) * (1 - tolerance) ? "WEAK" as const : "FAILED" as const;
  }
  if (evidence.operator === "AT_MOST") {
    if (value <= Number(evidence.target)) return "MET" as const;
    const slack = Number(evidence.target) === 0 ? tolerance : Math.abs(Number(evidence.target)) * tolerance;
    return value <= Number(evidence.target) + slack ? "WEAK" as const : "FAILED" as const;
  }
  if (evidence.operator === "EQUALS") {
    if (value === Number(evidence.target)) return "MET" as const;
    return Math.abs(value - Number(evidence.target)) <= Math.max(1, Math.abs(Number(evidence.target))) * tolerance ? "WEAK" as const : "FAILED" as const;
  }
  const [minimum, maximum] = evidence.target as readonly [number, number];
  if (value >= minimum && value <= maximum) return "MET" as const;
  const slack = Math.max(1, maximum - minimum) * tolerance;
  return value >= minimum - slack && value <= maximum + slack ? "WEAK" as const : "FAILED" as const;
}

function evaluateConstraint(
  constraint: NarrativeConstraint,
  evidenceDefinitions: readonly NarrativeEvidenceDefinition[],
  model: NarrativeSemanticModel,
  relaxationId?: string,
): NarrativeConstraintFinding {
  const definitions = evidenceDefinitions.filter((evidence) => evidence.constraintId === constraint.id);
  if (!definitions.length) return {
    constraintId: constraint.id,
    label: constraint.label,
    strength: constraint.strength,
    status: "UNAVAILABLE",
    score: 0,
    confidence: 0,
    evidence: ["No approved evidence definition is linked to this constraint."],
    measured: [],
    objectIds: [],
    ...(relaxationId ? { relaxationId } : {}),
  };
  const evidenceFindings = definitions.map((evidence) => {
    const metric = model.metrics[evidence.measureKey];
    if (!metric || metric.confidence < evidence.minimumConfidence) return {
      status: "UNAVAILABLE" as const,
      score: 0,
      confidence: metric?.confidence ?? 0,
      explanation: metric
        ? `${metric.explanation} Confidence ${metric.confidence.toFixed(2)} is below the required ${evidence.minimumConfidence.toFixed(2)}.`
        : `Measure ${evidence.measureKey} is unavailable.`,
      measured: { measureKey: evidence.measureKey, value: metric?.value, target: targetLabel(evidence) },
      objectIds: metric?.objectIds ?? [],
    };
    const status = evidenceStatus(metric.value, evidence, constraint.tolerance);
    return {
      status,
      score: status === "MET" ? 1 : status === "WEAK" ? 0.55 : 0,
      confidence: metric.confidence,
      explanation: `${metric.explanation} Measured ${metric.value}; target ${targetLabel(evidence)}.`,
      measured: { measureKey: evidence.measureKey, value: metric.value, target: targetLabel(evidence) },
      objectIds: metric.objectIds,
    };
  });
  const statusRank = { MET: 0, WEAK: 1, FAILED: 2, UNAVAILABLE: 3 } as const;
  let status = evidenceFindings.reduce<NarrativeConstraintFinding["status"]>((worst, finding) => statusRank[finding.status] > statusRank[worst] ? finding.status : worst, "MET");
  if (relaxationId && (status === "FAILED" || status === "UNAVAILABLE")) status = "WEAK";
  return {
    constraintId: constraint.id,
    label: constraint.label,
    strength: constraint.strength,
    status,
    score: evidenceFindings.reduce((sum, finding) => sum + finding.score, 0) / evidenceFindings.length,
    confidence: Math.min(...evidenceFindings.map((finding) => finding.confidence)),
    evidence: evidenceFindings.map((finding) => finding.explanation),
    measured: evidenceFindings.map((finding) => finding.measured),
    objectIds: [...new Set(evidenceFindings.flatMap((finding) => finding.objectIds))],
    ...(relaxationId ? { relaxationId } : {}),
  };
}

export function evaluateNarrativeConstraintProgram(
  program: NarrativeConstraintProgram,
  model: NarrativeSemanticModel,
  appliedRelaxationIds: readonly string[] = [],
): NarrativeProgramEvaluation {
  if (program.schemaVersion !== 1 || model.schemaVersion !== 1) throw new Error("Narrative evaluation received an unsupported program or semantic model.");
  const relaxationByConstraint = new Map<string, string>();
  for (const relaxationId of appliedRelaxationIds) {
    const relaxation = program.relaxationOrder.find((candidate) => candidate.id === relaxationId);
    if (!relaxation) throw new Error(`Narrative evaluation received unknown relaxation ${relaxationId}.`);
    for (const constraintId of relaxation.constraintIds) relaxationByConstraint.set(constraintId, relaxationId);
  }
  const constraints = [...program.constraints.essential, ...program.constraints.preferred, ...program.constraints.prohibited];
  const findings = constraints.map((constraint) => evaluateConstraint(constraint, program.requiredEvidence, model, relaxationByConstraint.get(constraint.id)));
  const floor = findings.filter((finding) => finding.strength === "ESSENTIAL" || finding.strength === "PROHIBITED");
  const failed = floor.some((finding) => finding.status === "FAILED");
  const unavailable = floor.some((finding) => finding.status === "UNAVAILABLE");
  const weakened = floor.some((finding) => finding.status === "WEAK") || appliedRelaxationIds.length > 0;
  const status = failed ? "FAILED" : unavailable ? "UNEVALUABLE" : weakened ? "WEAKENED" : "SATISFIED";
  const weightedTotal = constraints.reduce((sum, constraint) => sum + constraint.weight, 0);
  const score = constraints.reduce((sum, constraint, index) => sum + constraint.weight * findings[index].score, 0) / Math.max(Number.EPSILON, weightedTotal) * 100;
  const inputHash = narrativeEvaluationInputHash(program.inputHash, model.inputHash, appliedRelaxationIds);
  return {
    schemaVersion: NARRATIVE_EVALUATION_SCHEMA_VERSION,
    inputHash,
    programHash: program.inputHash,
    modelHash: model.inputHash,
    profileId: program.profileId,
    status,
    score: Number(score.toFixed(2)),
    essentialFloorMet: !failed && !unavailable,
    findings,
    appliedRelaxations: [...appliedRelaxationIds],
    limitations: [...model.limitations],
  };
}

export function compareNarrativeConfusions(
  intended: NarrativeConstraintProgram,
  alternatives: readonly NarrativeConstraintProgram[],
  model: NarrativeSemanticModel,
): NarrativeConfusionComparison {
  const intendedEvaluation = evaluateNarrativeConstraintProgram(intended, model);
  const alternativeEvaluations = alternatives.map((program) => evaluateNarrativeConstraintProgram(program, model)).sort((one, two) => two.score - one.score || String(one.profileId).localeCompare(String(two.profileId)));
  const nearest = alternativeEvaluations[0];
  const margin = intendedEvaluation.score - (nearest?.score ?? 0);
  const risk = margin < 5 ? "HIGH" : margin < 15 ? "MEDIUM" : "LOW";
  return {
    intended: intendedEvaluation,
    alternatives: alternativeEvaluations,
    scoreMargin: Number(margin.toFixed(2)),
    risk,
    explanation: nearest
      ? `The intended program leads ${nearest.profileId} by ${margin.toFixed(2)} points on the same semantic model.`
      : "No nearest-confusion programs were supplied.",
  };
}
