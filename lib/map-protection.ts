import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import type {
  ProtectionChannel,
  ProtectionFidelityFinding,
  ProtectionFidelityReport,
  ProtectionState,
  SemanticProtection,
  SemanticProtectionPolicy,
  TileProtectionMask,
} from "./authoring-schema.ts";
import { adjacentCoordinates, featurePlacementVerdict, isPassableLand, resourcePlacementVerdict, wonderPlacementVerdict } from "./civ5-rules.ts";
import { attachSemanticIdentities, markGenerationStructureStale, type GeographicObjectKind } from "./generation-structure.ts";
import { balanceMapStarts, DEFAULT_GENERATION_OPTIONS } from "./map-generator.ts";
import { RIVER_DATA_MASK, riverEdgeDefinitions } from "./rivers.ts";
import type { GenerationConstraintPayload } from "./generation-constraints.ts";

export const PROTECTION_CHANNELS: ProtectionChannel[] = ["TOPOLOGY", "ELEVATION", "CLIMATE", "FEATURES", "HYDROLOGY", "CONTENT", "STARTS", "SCENARIO"];

export type ProtectableSemantic = {
  semanticId: string;
  label: string;
  objectKind: SemanticProtection["objectKind"];
  tileIndices: number[];
  relatedSemanticIds: string[];
  inference: NonNullable<SemanticProtection["inference"]>;
  source?: number;
  outlet?: number;
};

export type CompiledProtectionConstraints = {
  engineAdapter: ProtectionFidelityReport["engineAdapter"];
  fixedTileCount: number;
  semanticCount: number;
  hardCount: number;
  candidateCount: number;
  sourceSemanticIds: string[];
};

export function emptyProtectionState(): ProtectionState {
  return { schemaVersion: 1, semantic: [] };
}

function emptyMask(width: number, height: number): TileProtectionMask {
  return { schemaVersion: 1, width, height, channels: Object.fromEntries(PROTECTION_CHANNELS.map((channel) => [channel, new Uint8Array(width * height)])) as Record<ProtectionChannel, Uint8Array>, namedRegions: [] };
}

function cloneMask(mask: TileProtectionMask) {
  return { ...mask, channels: Object.fromEntries(PROTECTION_CHANNELS.map((channel) => [channel, new Uint8Array(mask.channels[channel])])) as Record<ProtectionChannel, Uint8Array>, namedRegions: mask.namedRegions.map((region) => ({ ...region, tileIndices: [...region.tileIndices], channels: [...region.channels] })) };
}

function nextProtectionId(prefix: string, ids: string[]) {
  let number = 1;
  while (ids.includes(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

export function cloneProtectionState(state: ProtectionState): ProtectionState {
  return {
    schemaVersion: 1,
    tileMask: state.tileMask ? cloneMask(state.tileMask) : undefined,
    semantic: state.semantic.map((item) => ({
      ...item,
      channels: [...item.channels],
      tolerance: { ...item.tolerance },
      invariants: item.invariants.map((invariant) => ({ ...invariant, parameters: { ...invariant.parameters } })),
      anchor: { ...item.anchor, relatedSemanticIds: item.anchor.relatedSemanticIds ? [...item.anchor.relatedSemanticIds] : undefined },
      sourceTileIndices: item.sourceTileIndices ? [...item.sourceTileIndices] : undefined,
      sourceRelations: item.sourceRelations?.map((relation) => ({ ...relation })),
      inference: item.inference ? { ...item.inference } : undefined,
    })),
    lastReport: state.lastReport ? {
      ...state.lastReport,
      findings: state.lastReport.findings.map((finding) => ({ ...finding, invariants: finding.invariants.map((invariant) => ({ ...invariant })) })),
    } : undefined,
  };
}

export function protectTiles(state: ProtectionState, width: number, height: number, tileIndices: number[], channels: ProtectionChannel[], name = "Protected region") {
  const mask = state.tileMask && state.tileMask.width === width && state.tileMask.height === height ? cloneMask(state.tileMask) : emptyMask(width, height);
  const legal = [...new Set(tileIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < width * height))];
  for (const channel of channels) for (const index of legal) mask.channels[channel][index] = 1;
  const id = nextProtectionId("region", [...mask.namedRegions.map((region) => region.id), ...state.semantic.map((semantic) => semantic.id)]);
  mask.namedRegions.push({ id, name, tileIndices: legal, channels: [...channels] });
  return { ...cloneProtectionState(state), tileMask: mask, lastReport: undefined };
}

export function eraseProtectedTiles(state: ProtectionState, tileIndices: number[], channels: ProtectionChannel[]) {
  if (!state.tileMask) return state;
  const mask = cloneMask(state.tileMask);
  const erased = new Set(tileIndices);
  const erasedChannels = new Set(channels);
  for (const channel of channels) for (const index of erased) if (index >= 0 && index < mask.channels[channel].length) mask.channels[channel][index] = 0;
  mask.namedRegions = mask.namedRegions.map((region) => region.channels.every((channel) => erasedChannels.has(channel)) ? { ...region, tileIndices: region.tileIndices.filter((index) => !erased.has(index)) } : region).filter((region) => region.tileIndices.length);
  return { ...cloneProtectionState(state), tileMask: mask, lastReport: undefined };
}

export function removeProtection(state: ProtectionState, id: string) {
  const next = cloneProtectionState(state);
  if (next.tileMask && next.tileMask.namedRegions.some((region) => region.id === id)) {
    next.tileMask.namedRegions = next.tileMask.namedRegions.filter((region) => region.id !== id);
    for (const channel of PROTECTION_CHANNELS) next.tileMask.channels[channel].fill(0);
    for (const region of next.tileMask.namedRegions) for (const channel of region.channels) for (const index of region.tileIndices) next.tileMask.channels[channel][index] = 1;
  }
  next.semantic = next.semantic.filter((semantic) => semantic.id !== id);
  next.lastReport = undefined;
  return next;
}

function connectedComponents(mask: Uint8Array, map: Civ5Map) {
  const assigned = new Uint8Array(mask.length);
  const components: number[][] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || assigned[origin]) continue;
    const component = [origin];
    assigned[origin] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor];
      for (const [x, y] of adjacentCoordinates(index % map.width, Math.floor(index / map.width), map.width, map.height, map.wraps)) {
        const next = y * map.width + x;
        if (!mask[next] || assigned[next]) continue;
        assigned[next] = 1;
        component.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function inferredId(kind: string, indices: number[]) {
  let hash = 2166136261;
  for (const index of [...indices].sort((one, two) => one - two)) hash = Math.imul(hash ^ index, 16777619);
  return `inferred:${kind.toLowerCase()}:${(hash >>> 0).toString(36)}`;
}

function riverInference(map: Civ5Map): ProtectableSemantic[] {
  type RiverEdge = { a: string; b: string; owner: number; neighbor: number };
  const edges: RiverEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const vertexTiles = new Map<string, Set<number>>();
  const addVertexEdge = (vertex: string, edge: number) => adjacency.set(vertex, [...(adjacency.get(vertex) ?? []), edge]);
  const addVertexTiles = (vertex: string, tiles: [number, number]) => {
    const values = vertexTiles.get(vertex) ?? new Set<number>();
    for (const tile of tiles) values.add(tile);
    vertexTiles.set(vertex, values);
  };
  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
    const owner = y * map.width + x;
    for (const definition of riverEdgeDefinitions(x, y)) {
      let nextX = x + definition.dx;
      const nextY = y + definition.dy;
      if (map.wraps) nextX = (nextX + map.width) % map.width;
      if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height || Math.abs(nextX - x) > 1) continue;
      const neighbor = nextY * map.width + nextX;
      addVertexTiles(definition.a, [owner, neighbor]);
      addVertexTiles(definition.b, [owner, neighbor]);
      if (!(map.tiles[owner].river & definition.bit)) continue;
      const edgeIndex = edges.length;
      edges.push({ a: definition.a, b: definition.b, owner, neighbor });
      addVertexEdge(definition.a, edgeIndex);
      addVertexEdge(definition.b, edgeIndex);
    }
  }
  const systems: Array<{ tiles: number[]; vertices: string[] }> = [];
  const visited = new Set<string>();
  for (const origin of adjacency.keys()) {
    if (visited.has(origin)) continue;
    const queue = [origin];
    const vertices: string[] = [];
    const componentEdges = new Set<number>();
    visited.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      vertices.push(vertex);
      for (const edgeIndex of adjacency.get(vertex) ?? []) {
        componentEdges.add(edgeIndex);
        const edge = edges[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    const tiles = [...new Set([...componentEdges].flatMap((edgeIndex) => [edges[edgeIndex].owner, edges[edgeIndex].neighbor]))];
    if (componentEdges.size >= 3) systems.push({ tiles, vertices });
  }
  return systems.map(({ tiles: tileIndices, vertices }, index) => {
    const endpoints = vertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) === 1);
    const endpointTiles = (vertex: string) => [...(vertexTiles.get(vertex) ?? [])];
    const source = endpoints.flatMap(endpointTiles).filter((tile) => map.tiles[tile].terrain >= 2).reduce<number | undefined>((best, tile) => best === undefined || map.tiles[tile].elevation > map.tiles[best].elevation ? tile : best, undefined);
    const outlet = endpoints.flatMap(endpointTiles).find((tile) => map.tiles[tile].terrain < 2);
    const owners = tileIndices.filter((tile) => Boolean(map.tiles[tile].river & RIVER_DATA_MASK));
    const confidence = Math.min(0.98, 0.52 + Number(source !== undefined && map.tiles[source].elevation === 2) * 0.2 + Number(outlet !== undefined) * 0.22 + Math.min(0.04, owners.length / 200));
    return { semanticId: inferredId("watershed", owners), label: `Inferred watershed ${index + 1}`, objectKind: "RIVER_SYSTEM" as const, tileIndices, relatedSemanticIds: [], source, outlet, inference: { source: map.source === "file" ? "IMPORTED" : "GENERATED", confidence, explanation: `${owners.length} river edges reconstructed as one connected network; ${source === undefined ? "headwater uncertain" : "mountain headwater detected"}; ${outlet === undefined ? "outlet uncertain" : "water outlet detected"}.` } };
  });
}

export function protectableSemantics(map: Civ5Map): ProtectableSemantic[] {
  const authoringKinds = new Set<GeographicObjectKind>(["CONTINENT", "OCEAN_BASIN", "INLAND_SEA", "LAKE", "RIFT", "CLIMATE_REGION", "TECTONIC_PLATE", "RAIN_SHADOW", "GLACIAL_REGION", "WATERSHED", "STRATEGIC_REGION", "BAY", "CAPE", "STRAIT", "ARCHIPELAGO", "FOREST_REALM", "WASTE", "RIVER_BASIN", "NARRATIVE_REGION", "ICE_SHEET", "REFUGE"]);
  const generated: ProtectableSemantic[] = (map.structure?.objects ?? []).filter((object) => object.semanticId && object.tileIndices.length && authoringKinds.has(object.kind)).map((object) => ({
    semanticId: object.semanticId!,
    label: object.name,
    objectKind: object.kind,
    tileIndices: [...object.tileIndices],
    relatedSemanticIds: (object.neighbors ?? []).flatMap((id) => map.structure?.objects.find((candidate) => candidate.id === id)?.semanticId ?? []),
    source: typeof object.attributes?.source === "number" ? object.attributes.source : undefined,
    outlet: typeof object.attributes?.outlet === "number" ? object.attributes.outlet : undefined,
    inference: { source: "GENERATED", confidence: map.structure?.semanticLineage?.find((lineage) => lineage.semanticId === object.semanticId)?.confidence ?? 1, explanation: "Retained by the generation engine with stable semantic lineage." },
  }));
  const rivers = riverInference(map).filter((river) => !generated.some((object) => (object.objectKind === "WATERSHED" || object.objectKind === "RIVER_BASIN") && overlapRatio(object.tileIndices, river.tileIndices) > 0.65));
  if (generated.length) return [...generated, ...rivers];
  const mountains = connectedComponents(Uint8Array.from(map.tiles, (tile) => Number(tile.terrain >= 2 && tile.elevation === 2)), map).filter((indices) => indices.length >= 3).map((tileIndices, index) => ({ semanticId: inferredId("mountain-range", tileIndices), label: `Inferred mountain range ${index + 1}`, objectKind: "MOUNTAIN_RANGE" as const, tileIndices, relatedSemanticIds: [], inference: { source: "IMPORTED" as const, confidence: Math.min(0.9, 0.55 + tileIndices.length / 100), explanation: `${tileIndices.length} contiguous mountain tiles.` } }));
  const land = connectedComponents(Uint8Array.from(map.tiles, (tile) => Number(isPassableLand(map, tile))), map).filter((indices) => indices.length >= 4).map((tileIndices, index) => ({ semanticId: inferredId("land-region", tileIndices), label: `Inferred land region ${index + 1}`, objectKind: "CONTINENT" as const, tileIndices, relatedSemanticIds: [], inference: { source: "IMPORTED" as const, confidence: Math.min(0.88, 0.58 + tileIndices.length / Math.max(100, map.tiles.length)), explanation: `${tileIndices.length} connected passable land tiles.` } }));
  return [...rivers, ...mountains, ...land];
}

function defaultInvariants(object: ProtectableSemantic): SemanticProtection["invariants"] {
  if (object.objectKind === "WATERSHED" || object.objectKind === "RIVER_BASIN" || object.objectKind === "RIVER_SYSTEM") return [
    { id: "continuous-drainage", kind: "CONTINUOUS", parameters: {} as Record<string, string | number | boolean> },
    { id: "lawful-source", kind: "SOURCE_CLASS", parameters: { source: object.source ?? -1 } },
    { id: "water-outlet", kind: "OUTLET", parameters: { outlet: object.outlet ?? -1 } },
  ];
  return [{ id: "retained-function", kind: "CONNECTED", parameters: {} as Record<string, string | number | boolean> }];
}

export function protectSemanticObject(state: ProtectionState, map: Civ5Map, semanticId: string, policy: SemanticProtectionPolicy = "FUNCTION", hard = true) {
  const retainedObject = protectableSemantics(map).find((candidate) => candidate.semanticId === semanticId);
  if (!retainedObject) throw new Error("The selected semantic object is no longer present in this map.");
  const watershed = retainedObject.objectKind === "WATERSHED" || retainedObject.objectKind === "RIVER_BASIN" || retainedObject.objectKind === "RIVER_SYSTEM";
  const inferredNetwork = watershed && retainedObject.objectKind !== "RIVER_SYSTEM"
    ? riverInference(map).map((network) => ({ network, overlap: overlapRatio(retainedObject.tileIndices, network.tileIndices) })).sort((one, two) => two.overlap - one.overlap)[0]
    : undefined;
  const object = inferredNetwork?.overlap ? { ...retainedObject, tileIndices: inferredNetwork.network.tileIndices, source: inferredNetwork.network.source, outlet: inferredNetwork.network.outlet, inference: { ...retainedObject.inference, explanation: `${retainedObject.inference.explanation} Its protected drainage extent was reconstructed from ${inferredNetwork.network.inference.explanation.toLowerCase()}` } } : retainedObject;
  const channels: ProtectionChannel[] = policy === "EXACT"
    ? ["TOPOLOGY", "ELEVATION", "CLIMATE", "FEATURES", "HYDROLOGY", "CONTENT"]
    : watershed ? ["TOPOLOGY", "ELEVATION", "HYDROLOGY"] : ["TOPOLOGY", "ELEVATION"];
  const protection: SemanticProtection = {
    schemaVersion: 1,
    id: nextProtectionId("semantic", [...state.semantic.map((semantic) => semantic.id), ...(state.tileMask?.namedRegions.map((region) => region.id) ?? [])]),
    label: watershed ? `Preserve watershed: ${object.label}` : `Preserve ${object.label}`,
    objectKind: object.objectKind,
    sourceSemanticId: semanticId,
    policy,
    channels,
    hard,
    tolerance: { minimumTileOverlap: policy === "EXACT" ? 1 : policy === "SHAPE" ? 0.78 : policy === "RELATIONSHIP" ? 0.45 : 0.55, maximumCentroidShift: policy === "FUNCTION" ? 0.25 : policy === "RELATIONSHIP" ? 0.3 : 0.12, minimumShapeSimilarity: policy === "SHAPE" ? 0.78 : 0.5 },
    invariants: defaultInvariants(object),
    anchor: { x: object.tileIndices[0] % map.width, y: Math.floor(object.tileIndices[0] / map.width), relatedSemanticIds: [...object.relatedSemanticIds] },
    sourceTileIndices: [...object.tileIndices],
    sourceRelations: object.relatedSemanticIds.map((relatedSemanticId) => ({ semanticId: relatedSemanticId, kind: "NEIGHBOR" })),
    inference: { ...object.inference },
  };
  return { ...cloneProtectionState(state), semantic: [...state.semantic.map((item) => ({ ...item })), protection], lastReport: undefined };
}

function protectedSourceObject(objects: ProtectableSemantic[], semantic: SemanticProtection): ProtectableSemantic | undefined {
  const retained = objects.find((object) => object.semanticId === semantic.sourceSemanticId);
  if (!semantic.sourceTileIndices) return retained;
  return {
    semanticId: semantic.sourceSemanticId,
    label: retained?.label ?? semantic.label,
    objectKind: semantic.objectKind,
    tileIndices: semantic.sourceTileIndices,
    relatedSemanticIds: semantic.anchor.relatedSemanticIds ?? retained?.relatedSemanticIds ?? [],
    inference: semantic.inference ?? retained?.inference ?? { source: "GENERATED", confidence: 1, explanation: "Stored protection extent." },
    source: Number(semantic.invariants.find((invariant) => invariant.kind === "SOURCE_CLASS")?.parameters.source ?? retained?.source ?? -1),
    outlet: Number(semantic.invariants.find((invariant) => invariant.kind === "OUTLET")?.parameters.outlet ?? retained?.outlet ?? -1),
  };
}

export function compileProtectionConstraints(source: Civ5Map, state: ProtectionState): CompiledProtectionConstraints {
  const adapter: Record<NonNullable<Civ5Map["structure"]>["engine"], ProtectionFidelityReport["engineAdapter"]> = { EXCOGITARE: "EXCOGITARE_FIELDS", ECCENTRIC: "ECCENTRIC_GRAPH", PHYSICAL: "PHYSICAL_BOUNDARY", POLIS: "POLIS_STRATEGIC" };
  const fixed = new Set<number>();
  if (state.tileMask?.width === source.width && state.tileMask.height === source.height) for (const channel of PROTECTION_CHANNELS) for (let index = 0; index < source.tiles.length; index += 1) if (state.tileMask.channels[channel]?.[index]) fixed.add(index);
  for (const semantic of state.semantic) for (const index of semantic.sourceTileIndices ?? []) fixed.add(index);
  return { engineAdapter: adapter[source.structure?.engine ?? "EXCOGITARE"], fixedTileCount: fixed.size, semanticCount: state.semantic.length, hardCount: state.semantic.filter((semantic) => semantic.hard).length, candidateCount: state.semantic.length || fixed.size ? 4 : 1, sourceSemanticIds: state.semantic.map((semantic) => semantic.sourceSemanticId) };
}

function protectionChannelSets(source: Civ5Map, state: ProtectionState, sourceObjects = protectableSemantics(source)) {
  const channelSets = Array.from({ length: source.tiles.length }, () => new Set<ProtectionChannel>());
  if (state.tileMask?.width === source.width && state.tileMask.height === source.height) {
    for (const channel of PROTECTION_CHANNELS) for (let index = 0; index < source.tiles.length; index += 1) if (state.tileMask.channels[channel]?.[index]) channelSets[index].add(channel);
  }
  for (const semantic of state.semantic) {
    const object = protectedSourceObject(sourceObjects, semantic);
    if (!object) continue;
    const watershed = semantic.objectKind === "WATERSHED" || semantic.objectKind === "RIVER_BASIN" || semantic.objectKind === "RIVER_SYSTEM";
    const selected = semantic.policy === "RELATIONSHIP" ? relationshipSupportTiles(source, semantic, object, sourceObjects)
      : semantic.policy === "FUNCTION" && !watershed
        ? object.tileIndices.filter((_index, index) => index === 0 || index % Math.max(1, Math.floor(object.tileIndices.length / 12)) === 0)
        : object.tileIndices;
    const channels: ProtectionChannel[] = semantic.policy === "EXACT" ? semantic.channels
      : semantic.policy === "SHAPE" ? ["TOPOLOGY", "ELEVATION"]
        : semantic.policy === "FUNCTION" && watershed ? ["TOPOLOGY", "ELEVATION", "HYDROLOGY"]
          : ["TOPOLOGY", "ELEVATION"];
    for (const index of selected) for (const channel of channels) channelSets[index]?.add(channel);
  }
  return channelSets;
}

export function compileGenerationConstraints(source: Civ5Map, state: ProtectionState): GenerationConstraintPayload | undefined {
  const summary = compileProtectionConstraints(source, state);
  if (summary.candidateCount === 1) return undefined;
  const sourceObjects = protectableSemantics(source);
  const channelSets = protectionChannelSets(source, state, sourceObjects);
  const topology = new Int8Array(source.tiles.length).fill(-1);
  const elevation = new Int8Array(source.tiles.length).fill(-1);
  const terrain = new Int16Array(source.tiles.length).fill(-1);
  const feature = new Int16Array(source.tiles.length).fill(-1);
  const hydrologyMask = new Uint8Array(source.tiles.length);
  const rivers = new Uint8Array(source.tiles.length);
  const contentMask = new Uint8Array(source.tiles.length);
  const startsMask = new Uint8Array(source.tiles.length);
  const scenarioMask = new Uint8Array(source.tiles.length);
  const constrainedChannels = new Set<ProtectionChannel>();
  for (let index = 0; index < source.tiles.length; index += 1) {
    const channels = channelSets[index];
    for (const channel of channels) constrainedChannels.add(channel);
    if (channels.has("TOPOLOGY")) topology[index] = source.tiles[index].terrain < 2 ? 0 : 1;
    if (channels.has("ELEVATION")) elevation[index] = source.tiles[index].elevation;
    if (channels.has("CLIMATE")) terrain[index] = source.tiles[index].terrain;
    if (channels.has("FEATURES")) feature[index] = source.tiles[index].feature;
    if (channels.has("HYDROLOGY")) { hydrologyMask[index] = 1; rivers[index] = source.tiles[index].river & RIVER_DATA_MASK; }
    if (channels.has("CONTENT")) contentMask[index] = 1;
    if (channels.has("STARTS")) startsMask[index] = 1;
    if (channels.has("SCENARIO")) scenarioMask[index] = 1;
  }
  const semantics = state.semantic.flatMap((semantic) => {
    const object = protectedSourceObject(sourceObjects, semantic);
    if (!object) return [];
    const relatedAnchors = (semantic.anchor.relatedSemanticIds ?? []).flatMap((semanticId) => {
      const related = sourceObjects.find((candidate) => candidate.semanticId === semanticId);
      if (!related?.tileIndices.length) return [];
      const center = centroid(related.tileIndices, source.width, source.height);
      return [{ semanticId, index: Math.max(0, Math.min(source.tiles.length - 1, Math.round(center.y * (source.height - 1)) * source.width + Math.round(center.x * (source.width - 1)))) }];
    });
    const anchorIndex = Math.max(0, Math.min(source.tiles.length - 1, semantic.anchor.y * source.width + semantic.anchor.x));
    return [{ id: semantic.id, sourceSemanticId: semantic.sourceSemanticId, objectKind: semantic.objectKind, policy: semantic.policy, hard: semantic.hard, tileIndices: [...object.tileIndices], anchorIndex, relatedAnchors }];
  });
  return {
    schemaVersion: 1,
    width: source.width,
    height: source.height,
    adapter: summary.engineAdapter,
    topology,
    elevation,
    terrain,
    feature,
    hydrologyMask,
    rivers,
    contentMask,
    startsMask,
    scenarioMask,
    semantics,
    sourceStarts: source.startLocations.map((start) => ({ ...start })),
    constrainedChannels: [...constrainedChannels],
  };
}

function centroid(indices: number[], width: number, height: number) {
  if (!indices.length) return { x: 0, y: 0 };
  const sum = indices.reduce((point, index) => ({ x: point.x + index % width, y: point.y + Math.floor(index / width) }), { x: 0, y: 0 });
  return { x: sum.x / indices.length / Math.max(1, width - 1), y: sum.y / indices.length / Math.max(1, height - 1) };
}

function overlapRatio(one: number[], two: number[]) {
  const set = new Set(one);
  const overlap = two.filter((index) => set.has(index)).length;
  return overlap / Math.max(1, one.length + two.length - overlap);
}

function semanticSimilarity(source: ProtectableSemantic, candidate: ProtectableSemantic, map: Civ5Map) {
  if (source.objectKind !== candidate.objectKind) return 0;
  const one = centroid(source.tileIndices, map.width, map.height);
  const two = centroid(candidate.tileIndices, map.width, map.height);
  const shift = Math.hypot(one.x - two.x, one.y - two.y);
  const overlap = overlapRatio(source.tileIndices, candidate.tileIndices);
  const area = Math.min(source.tileIndices.length, candidate.tileIndices.length) / Math.max(1, Math.max(source.tileIndices.length, candidate.tileIndices.length));
  return overlap * 0.55 + Math.max(0, 1 - shift / 0.5) * 0.3 + area * 0.15;
}

export function scoreProtectionCandidate(source: Civ5Map, candidate: Civ5Map, state: ProtectionState) {
  if (source.width !== candidate.width || source.height !== candidate.height) return { score: -1, findings: [] as ProtectionFidelityFinding[] };
  const sourceObjects = protectableSemantics(source);
  const candidateObjects = protectableSemantics(candidate);
  const findings = state.semantic.map((semantic) => {
    const desired = protectedSourceObject(sourceObjects, semantic);
    const candidates = desired ? candidateObjects.filter((object) => object.objectKind === desired.objectKind).map((object) => ({ object, score: semanticSimilarity(desired, object, source) })).sort((one, two) => two.score - one.score) : [];
    const best = candidates[0];
    const one = centroid(desired?.tileIndices ?? [], source.width, source.height);
    const two = centroid(best?.object.tileIndices ?? [], source.width, source.height);
    const shift = best ? Math.hypot(one.x - two.x, one.y - two.y) : 1;
    const overlap = desired && best ? overlapRatio(desired.tileIndices, best.object.tileIndices) : 0;
    const score = best?.score ?? 0;
    return { protectionId: semantic.id, label: semantic.label, policy: semantic.policy, status: score >= (semantic.tolerance.minimumTileOverlap ?? 0.5) ? "SATISFIED" as const : semantic.hard ? "BLOCKED" as const : "DEGRADED" as const, score, lineageConfidence: best?.object.inference.confidence ?? 0, tileOverlap: overlap, centroidShift: shift, invariants: [], message: best ? `Best ${semantic.objectKind.toLowerCase().replaceAll("_", " ")} candidate scored ${Math.round(score * 100)}%.` : "No matching semantic candidate was retained." };
  });
  const maskMatches = state.tileMask ? PROTECTION_CHANNELS.reduce((sum, channel) => sum + state.tileMask!.channels[channel].reduce((count, enabled, index) => count + Number(!enabled || channelValueEqual(source.tiles[index], candidate.tiles[index], channel)), 0), 0) : 0;
  const maskTotal = state.tileMask ? PROTECTION_CHANNELS.length * source.tiles.length : 0;
  const semanticScore = findings.length ? findings.reduce((sum, finding) => sum + finding.score, 0) / findings.length : 1;
  return { score: semanticScore * 0.8 + (maskTotal ? maskMatches / maskTotal : 1) * 0.2, findings };
}

function channelValueEqual(source: Civ5Tile, target: Civ5Tile, channel: ProtectionChannel) {
  if (channel === "TOPOLOGY") return source.terrain === target.terrain;
  if (channel === "ELEVATION") return source.elevation === target.elevation;
  if (channel === "CLIMATE") return source.terrain < 2 || source.terrain === target.terrain;
  if (channel === "FEATURES") return source.feature === target.feature;
  if (channel === "HYDROLOGY") return source.river === target.river;
  if (channel === "CONTENT") return source.resource === target.resource && source.resourceAmount === target.resourceAmount && source.wonder === target.wonder && source.improvement === target.improvement && source.route === target.route;
  if (channel === "SCENARIO") return source.owner === target.owner;
  return true;
}

function copyChannels(source: Civ5Tile, target: Civ5Tile, channels: Set<ProtectionChannel>) {
  const tile = { ...target };
  if (channels.has("TOPOLOGY")) tile.terrain = source.terrain;
  if (channels.has("ELEVATION")) tile.elevation = source.elevation;
  if (channels.has("CLIMATE") && source.terrain >= 2) tile.terrain = source.terrain;
  if (channels.has("FEATURES")) tile.feature = source.feature;
  if (channels.has("HYDROLOGY")) tile.river = source.river;
  if (channels.has("CONTENT")) Object.assign(tile, { resource: source.resource, resourceAmount: source.resourceAmount, wonder: source.wonder, improvement: source.improvement, route: source.route });
  if (channels.has("SCENARIO")) tile.owner = source.owner;
  return tile;
}

function relationshipSupportTiles(source: Civ5Map, semantic: SemanticProtection, object: ProtectableSemantic, objects: ProtectableSemantic[]) {
  const result = new Set<number>([object.tileIndices[0]]);
  const origin = centroid(object.tileIndices, source.width, source.height);
  for (const relatedId of semantic.anchor.relatedSemanticIds ?? []) {
    const related = objects.find((candidate) => candidate.semanticId === relatedId);
    if (!related) continue;
    const target = centroid(related.tileIndices, source.width, source.height);
    const steps = Math.max(2, Math.ceil(Math.hypot(target.x - origin.x, target.y - origin.y) * Math.max(source.width, source.height)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = Math.max(0, Math.min(source.width - 1, Math.round((origin.x * (1 - t) + target.x * t) * (source.width - 1))));
      const y = Math.max(0, Math.min(source.height - 1, Math.round((origin.y * (1 - t) + target.y * t) * (source.height - 1))));
      result.add(y * source.width + x);
    }
  }
  return [...result];
}

function connectedRiver(indices: number[], map: Civ5Map) {
  const enabled = new Set(indices.filter((index) => map.tiles[index]?.river > 0));
  if (!enabled.size) return false;
  const reached = new Set<number>();
  const queue = [enabled.values().next().value as number];
  reached.add(queue[0]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const [x, y] of adjacentCoordinates(queue[cursor] % map.width, Math.floor(queue[cursor] / map.width), map.width, map.height, map.wraps)) {
    const next = y * map.width + x;
    if (enabled.has(next) && !reached.has(next)) { reached.add(next); queue.push(next); }
  }
  return reached.size === enabled.size;
}

function actualFinding(source: Civ5Map, merged: Civ5Map, semantic: SemanticProtection, object: ProtectableSemantic, lineageConfidence: number): ProtectionFidelityFinding {
  const indices = object.tileIndices;
  const exact = indices.filter((index) => semantic.channels.every((channel) => channelValueEqual(source.tiles[index], merged.tiles[index], channel))).length / Math.max(1, indices.length);
  const sourceCenter = centroid(indices, source.width, source.height);
  const mergedCenter = centroid(indices.filter((index) => merged.tiles[index].terrain >= 2), merged.width, merged.height);
  const shift = Math.hypot(sourceCenter.x - mergedCenter.x, sourceCenter.y - mergedCenter.y);
  const watershed = semantic.objectKind === "WATERSHED" || semantic.objectKind === "RIVER_BASIN" || semantic.objectKind === "RIVER_SYSTEM";
  const continuity = !watershed || connectedRiver(indices, merged);
  const outlet = !watershed || indices.some((index) => merged.tiles[index].river > 0 && adjacentCoordinates(index % merged.width, Math.floor(index / merged.width), merged.width, merged.height, merged.wraps).some(([x, y]) => merged.tiles[y * merged.width + x].terrain < 2));
  const sourceClass = !watershed || indices.some((index) => merged.tiles[index].river > 0 && merged.tiles[index].elevation > 0);
  const invariants = semantic.invariants.map((invariant) => {
    const satisfied = invariant.kind === "CONTINUOUS" ? continuity : invariant.kind === "OUTLET" ? outlet : invariant.kind === "SOURCE_CLASS" ? sourceClass : indices.some((index) => merged.tiles[index].terrain >= 2);
    return { id: invariant.id, satisfied, detail: satisfied ? `${invariant.kind.toLowerCase().replaceAll("_", " ")} retained.` : `${invariant.kind.toLowerCase().replaceAll("_", " ")} was not retained.` };
  });
  const invariantScore = invariants.length ? invariants.filter((item) => item.satisfied).length / invariants.length : 1;
  const score = semantic.policy === "EXACT" ? exact : semantic.policy === "SHAPE" ? exact * 0.75 + Math.max(0, 1 - shift / 0.25) * 0.25 : semantic.policy === "FUNCTION" ? invariantScore : invariantScore * 0.6 + exact * 0.4;
  const minimum = semantic.policy === "EXACT" ? 1 : semantic.tolerance.minimumShapeSimilarity ?? semantic.tolerance.minimumTileOverlap ?? 0.5;
  const status = score + 1e-8 >= minimum ? "SATISFIED" : semantic.hard ? "BLOCKED" : "DEGRADED";
  return { protectionId: semantic.id, label: semantic.label, policy: semantic.policy, status, score, lineageConfidence, tileOverlap: exact, centroidShift: shift, invariants, message: `${semantic.policy.toLowerCase()} fidelity ${Math.round(score * 100)}%; ${invariants.filter((item) => item.satisfied).length}/${invariants.length || 0} invariants retained.` };
}

function startsAreLegal(map: Civ5Map) {
  return map.startLocations.every((start) => {
    const index = start.y * map.width + start.x;
    return start.x >= 0 && start.y >= 0 && start.x < map.width && start.y < map.height && isPassableLand(map, map.tiles[index]) && map.tiles[index].wonder === 255;
  });
}

function protectedPlacementConflict(map: Civ5Map, protectedIndices: Set<number>, validateStarts: boolean) {
  for (const index of protectedIndices) {
    const tile = map.tiles[index];
    if (!featurePlacementVerdict(map, tile).valid || !resourcePlacementVerdict(map, tile).valid || !wonderPlacementVerdict(map, tile).valid) return `Protected content at ${index % map.width}, ${Math.floor(index / map.width)} is illegal on the regenerated terrain.`;
  }
  if (validateStarts) for (const start of map.startLocations) {
    const index = start.y * map.width + start.x;
    if (index < 0 || index >= map.tiles.length || !isPassableLand(map, map.tiles[index]) || map.tiles[index].wonder !== 255) return `Protected start ${start.player + 1} is no longer on a legal passable tile.`;
  }
  return undefined;
}

export function applyProtectionState(source: Civ5Map, candidate: Civ5Map, state: ProtectionState) {
  const constraints = compileProtectionConstraints(source, state);
  if (source.width !== candidate.width || source.height !== candidate.height) return { map: candidate, conflicts: ["Protected regeneration cannot change map dimensions."], blocked: true, report: { schemaVersion: 1 as const, engineAdapter: constraints.engineAdapter, candidateCount: constraints.candidateCount, seamRepairs: 0, findings: [], summary: "Blocked because Exact tile coordinates cannot be resampled automatically." } };
  const conflicts: string[] = [];
  const sourceObjects = protectableSemantics(source);
  const channelSets = protectionChannelSets(source, state, sourceObjects);
  const candidateScore = scoreProtectionCandidate(source, candidate, state);
  const semanticObjects = new Map<string, ProtectableSemantic>();
  for (const semantic of state.semantic) {
    const object = protectedSourceObject(sourceObjects, semantic);
    if (!object) { conflicts.push(`${semantic.label} cannot be located in the source map.`); continue; }
    semanticObjects.set(semantic.id, object);
  }
  if (conflicts.length && state.semantic.some((item) => item.hard && conflicts.some((conflict) => conflict.startsWith(item.label)))) {
    const report = { schemaVersion: 1 as const, engineAdapter: constraints.engineAdapter, candidateCount: constraints.candidateCount, seamRepairs: 0, findings: candidateScore.findings, summary: conflicts.join(" ") };
    return { map: candidate, conflicts, blocked: true, report };
  }
  let seamRepairs = 0;
  const isolateProtectedWatershed = state.semantic.some((semantic) => semantic.policy === "FUNCTION" && (semantic.objectKind === "WATERSHED" || semantic.objectKind === "RIVER_BASIN" || semantic.objectKind === "RIVER_SYSTEM"));
  const hydrologyCore = channelSets.flatMap((channels, index) => channels.has("HYDROLOGY") ? [index] : []);
  for (const index of hydrologyCore) for (const [x, y] of adjacentCoordinates(index % source.width, Math.floor(index / source.width), source.width, source.height, source.wraps)) {
    const neighbor = y * source.width + x;
    if (!channelSets[neighbor].has("HYDROLOGY")) { channelSets[neighbor].add("HYDROLOGY"); seamRepairs += 1; }
    if (source.tiles[neighbor].river > 0) { channelSets[neighbor].add("TOPOLOGY"); channelSets[neighbor].add("ELEVATION"); }
  }
  const tiles = candidate.tiles.map((tile, index) => {
    const base = isolateProtectedWatershed ? { ...tile, river: 0 } : { ...tile };
    return channelSets[index].size ? copyChannels(source.tiles[index], base, channelSets[index]) : base;
  });
  const protectStarts = channelSets.some((channels) => channels.has("STARTS"));
  const protectScenario = channelSets.some((channels) => channels.has("SCENARIO"));
  const changedPasses = new Set<string>();
  for (const channels of channelSets) {
    if (channels.has("TOPOLOGY")) changedPasses.add("TOPOLOGY");
    if (channels.has("ELEVATION")) changedPasses.add("RELIEF");
    if (channels.has("CLIMATE") || channels.has("FEATURES")) changedPasses.add("CLIMATE");
    if (channels.has("HYDROLOGY")) changedPasses.add("HYDROLOGY");
    if (channels.has("CONTENT") || channels.has("SCENARIO")) changedPasses.add("CONTENT");
    if (channels.has("STARTS")) changedPasses.add("STARTS");
  }
  const semanticStructure = candidate.structure ? attachSemanticIdentities(candidate.structure, candidate.width, candidate.height, source.structure) : candidate.structure;
  let merged: Civ5Map = { ...candidate, tiles, startLocations: protectStarts ? source.startLocations.map((start) => ({ ...start })) : candidate.startLocations.map((start) => ({ ...start })), cities: protectScenario ? source.cities?.map((city) => ({ ...city })) : candidate.cities?.map((city) => ({ ...city })), structure: markGenerationStructureStale(semanticStructure, "Protected authoring constraints shaped and merged into a regenerated candidate.", changedPasses) };
  if (!protectStarts && !startsAreLegal(merged)) merged = balanceMapStarts(merged, { ...DEFAULT_GENERATION_OPTIONS, ...(candidate.generation ?? {}), players: candidate.startLocations.filter((start) => !start.cityState).length, cityStates: candidate.startLocations.filter((start) => start.cityState).length });
  const protectedIndices = new Set(channelSets.flatMap((channels, index) => channels.has("CONTENT") || channels.has("STARTS") || channels.has("SCENARIO") ? [index] : []));
  const placementConflict = protectedPlacementConflict(merged, protectedIndices, protectStarts);
  if (placementConflict) conflicts.push(placementConflict);
  const findings = state.semantic.map((semantic) => {
    const object = semanticObjects.get(semantic.id);
    const lineage = merged.structure?.semanticLineage?.find((item) => item.semanticId === semantic.sourceSemanticId);
    return object ? actualFinding(source, merged, semantic, object, lineage?.confidence ?? semantic.inference?.confidence ?? 0) : candidateScore.findings.find((finding) => finding.protectionId === semantic.id)!;
  }).filter(Boolean);
  for (const finding of findings) if (finding.status === "BLOCKED") conflicts.push(`${finding.label}: ${finding.message}`);
  const report: ProtectionFidelityReport = { schemaVersion: 1, engineAdapter: constraints.engineAdapter, candidateCount: constraints.candidateCount, seamRepairs, findings, summary: findings.length ? `${findings.filter((finding) => finding.status === "SATISFIED").length}/${findings.length} semantic protections satisfied; ${seamRepairs} seam tiles reconciled.` : `${constraints.fixedTileCount} protected tiles retained; ${seamRepairs} seam tiles reconciled.` };
  const blocked = Boolean(placementConflict) || findings.some((finding) => finding.status === "BLOCKED");
  return { map: blocked ? candidate : merged, conflicts, blocked, report };
}
