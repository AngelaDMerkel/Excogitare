import type { Civ5Map } from "./civ5-map.ts";
import type { GeographicObject } from "./generation-structure.ts";
import type { NarrativeAdapterEvidence, NarrativeCausalObject } from "./narrative-engine-adapters.ts";

/**
 * Final-state proofs for the eight Excogitare field grammars.
 *
 * These functions deliberately do not consume semantic aggregate metrics,
 * generator diagnostics, or cached `outputEffectMatched`/`deepWaterShare`
 * claims. Authored roles identify which exact retained causes must be checked;
 * the exported tiles and their actual hex connectivity decide whether those
 * causes still tell the truth.
 */
export type NarrativeNativeExcogitareProofFacts = {
  ok: boolean;
  evidence: string[];
  objectIds: string[];
  measurements: Record<string, number | boolean>;
};

export type ExcogitareNativeInvariantId =
  | "viable-crooked-interiors"
  | "robust-dominant-continent"
  | "viable-shelf-anchors"
  | "bounded-terrestrial-kingdoms"
  | "viable-island-homelands"
  | "technology-gated-divide"
  | "accessible-dual-maze"
  | "coherent-contrasting-provinces";

type BoundObject = GeographicObject & { attributes: NonNullable<GeographicObject["attributes"]> };

type BindingSet = {
  causes: NarrativeCausalObject[];
  objects: BoundObject[];
  complete: boolean;
};

type ComponentField = {
  ids: Int32Array;
  members: number[][];
};

const LAND = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain >= 2);
const WATER = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain < 2);
const DEEP_WATER = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain === 0);
const PASSABLE_LAND = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
const PRE_ASTRONOMY = (map: Civ5Map, index: number) => Boolean(map.tiles[index]
  && (map.tiles[index].terrain === 1 || map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2));

function proof(
  ok: boolean,
  evidence: string[],
  objects: readonly GeographicObject[] = [],
  measurements: NarrativeNativeExcogitareProofFacts["measurements"] = {},
): NarrativeNativeExcogitareProofFacts {
  return { ok, evidence, objectIds: [...new Set(objects.map((object) => object.id))], measurements };
}

function roleOf(object: GeographicObject) {
  return String(object.attributes?.role ?? object.attributes?.relationship ?? "");
}

function validIndices(map: Civ5Map, indices: readonly number[]) {
  return [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0 && index < map.tiles.length))];
}

function hasOnlyValidUniqueIndices(map: Civ5Map, object: GeographicObject) {
  return object.tileIndices.length > 0
    && object.tileIndices.length === new Set(object.tileIndices).size
    && object.tileIndices.every((index) => Number.isInteger(index) && index >= 0 && index < map.tiles.length);
}

function neighbors(index: number, map: Pick<Civ5Map, "width" | "height" | "wraps">) {
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

function expand(map: Civ5Map, source: readonly number[], radius = 1) {
  const reached = new Set(validIndices(map, source));
  let frontier = [...reached];
  for (let step = 0; step < radius; step += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of neighbors(index, map)) if (!reached.has(neighbor)) {
      reached.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return reached;
}

function touches(map: Civ5Map, one: readonly number[], two: readonly number[], radius = 1) {
  const reached = expand(map, one, radius);
  return validIndices(map, two).some((index) => reached.has(index));
}

function overlapCount(one: readonly number[], two: readonly number[]) {
  const right = new Set(two);
  return [...new Set(one)].filter((index) => right.has(index)).length;
}

function overlappingTileCount(objects: readonly GeographicObject[]) {
  let overlaps = 0;
  for (let one = 0; one < objects.length; one += 1) for (let two = one + 1; two < objects.length; two += 1) {
    overlaps += overlapCount(objects[one].tileIndices, objects[two].tileIndices);
  }
  return overlaps;
}

function connectedShare(map: Civ5Map, indices: readonly number[], predicate: (index: number) => boolean = () => true) {
  const pending = new Set(validIndices(map, indices).filter(predicate));
  const total = pending.size;
  let largest = 0;
  while (pending.size) {
    const origin = pending.values().next().value as number;
    pending.delete(origin);
    const queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (!pending.delete(next)) continue;
      queue.push(next);
    }
    largest = Math.max(largest, queue.length);
  }
  return total ? largest / total : 0;
}

function components(map: Civ5Map, predicate: (index: number) => boolean): ComponentField {
  const ids = new Int32Array(map.tiles.length).fill(-1);
  const members: number[][] = [];
  for (let index = 0; index < map.tiles.length; index += 1) {
    if (ids[index] >= 0 || !predicate(index)) continue;
    const id = members.length;
    const queue = [index];
    ids[index] = id;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (ids[next] >= 0 || !predicate(next)) continue;
      ids[next] = id;
      queue.push(next);
    }
    members.push(queue);
  }
  return { ids, members };
}

function dominantComponent(object: GeographicObject, field: ComponentField, predicate: (index: number) => boolean) {
  const counts = new Map<number, number>();
  const eligible = object.tileIndices.filter((index) => predicate(index) && field.ids[index] >= 0);
  for (const index of eligible) counts.set(field.ids[index], (counts.get(field.ids[index]) ?? 0) + 1);
  const winner = [...counts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
  return { id: winner?.[0] ?? -1, share: winner ? winner[1] / Math.max(1, eligible.length) : 0, eligible: eligible.length };
}

function exactRoleBindings(map: Civ5Map, adapter: NarrativeAdapterEvidence, role: string): BindingSet {
  const causes = adapter.causalObjects.filter((cause) => cause.role === role);
  const objects: BoundObject[] = [];
  let complete = causes.length > 0 && causes.every((cause) => cause.retained);
  for (const cause of causes) {
    if (!cause.retained) continue;
    const candidates = (map.structure?.objects ?? []).filter((object) => object.id === cause.nativeObjectId);
    if (candidates.length !== 1) { complete = false; continue; }
    const object = candidates[0];
    const expectedKind = cause.kind === "REGION" ? "NARRATIVE_REGION" : "NARRATIVE_PATH";
    if (object.attributes?.nativeNarrative !== true
      || roleOf(object) !== cause.role
      || object.semanticId !== `narrative:${cause.id}`
      || object.kind !== expectedKind
      || !hasOnlyValidUniqueIndices(map, object)) {
      complete = false;
      continue;
    }
    objects.push(object as BoundObject);
  }
  return { causes, objects, complete: complete && objects.length === causes.length };
}

function exactBindingsByCause(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const result = new Map<string, BoundObject>();
  for (const cause of adapter.causalObjects.filter((candidate) => candidate.retained)) {
    const matches = (map.structure?.objects ?? []).filter((object) => object.id === cause.nativeObjectId);
    if (matches.length !== 1) continue;
    const object = matches[0];
    if (object.attributes?.nativeNarrative !== true
      || roleOf(object) !== cause.role
      || object.semanticId !== `narrative:${cause.id}`
      || !hasOnlyValidUniqueIndices(map, object)) continue;
    result.set(cause.id, object as BoundObject);
  }
  return result;
}

function pathEndpoints(path: BoundObject, bindings: Map<string, BoundObject>) {
  const from = bindings.get(String(path.attributes.from ?? ""));
  const to = bindings.get(String(path.attributes.to ?? ""));
  return from && to && from.id !== to.id ? { from, to } : undefined;
}

function objectFullyMatches(map: Civ5Map, object: BoundObject, predicate: (index: number) => boolean) {
  return object.tileIndices.length > 0 && object.tileIndices.every(predicate);
}

function cachedPassableInterior(map: Civ5Map, passable: ComponentField, object: BoundObject, minimum: number) {
  const interior = dominantComponent(object, passable, (index) => PASSABLE_LAND(map, index));
  return interior.eligible >= minimum && interior.share >= 0.7;
}

/** Tarjan articulation analysis: O(V + E), independent of bond raster size. */
function landComponentRobustness(map: Civ5Map, candidateTiles: readonly number[], land: ComponentField) {
  const totalLand = land.members.reduce((sum, component) => sum + component.length, 0);
  if (totalLand <= 1) return 0;
  const largestId = land.members.reduce((winner, component, id) => component.length > (land.members[winner]?.length ?? -1) ? id : winner, 0);
  const largest = land.members[largestId] ?? [];
  const largestSet = new Set(largest);
  const secondLargest = Math.max(0, ...land.members.filter((_, id) => id !== largestId).map((component) => component.length));
  const discovery = new Int32Array(map.tiles.length).fill(-1);
  const low = new Int32Array(map.tiles.length).fill(-1);
  const parent = new Int32Array(map.tiles.length).fill(-1);
  const subtree = new Int32Array(map.tiles.length);
  const separated = new Map<number, number[]>();
  let time = 0;
  if (largest.length) {
    type Frame = { index: number; adjacency: number[]; cursor: number };
    const enter = (index: number): Frame => {
      discovery[index] = low[index] = time++;
      subtree[index] = 1;
      return { index, adjacency: neighbors(index, map).filter((next) => largestSet.has(next)), cursor: 0 };
    };
    // Iterative Tarjan traversal avoids overflowing the JavaScript call stack
    // on Extreme and Colossal maps while retaining O(V + E) proof cost.
    const stack: Frame[] = [enter(largest[0])];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const next = frame.adjacency[frame.cursor++];
      if (next !== undefined) {
        if (discovery[next] < 0) {
          parent[next] = frame.index;
          stack.push(enter(next));
        } else if (next !== parent[frame.index]) low[frame.index] = Math.min(low[frame.index], discovery[next]);
        continue;
      }
      stack.pop();
      const parentIndex = parent[frame.index];
      if (parentIndex < 0) continue;
      subtree[parentIndex] += subtree[frame.index];
      low[parentIndex] = Math.min(low[parentIndex], low[frame.index]);
      if (low[frame.index] >= discovery[parentIndex]) {
        const pieces = separated.get(parentIndex) ?? [];
        pieces.push(subtree[frame.index]);
        separated.set(parentIndex, pieces);
      }
    }
  }
  let minimum = 1;
  for (const removed of new Set(candidateTiles)) {
    if (!largestSet.has(removed)) {
      minimum = Math.min(minimum, largest.length / (totalLand - 1));
      continue;
    }
    const pieces = separated.get(removed) ?? [];
    const separatedSize = pieces.reduce((sum, size) => sum + size, 0);
    const remainder = Math.max(0, largest.length - 1 - separatedSize);
    const after = Math.max(secondLargest, remainder, ...pieces);
    minimum = Math.min(minimum, after / (totalLand - 1));
  }
  return minimum;
}

function shortestRoute(
  map: Civ5Map,
  allowed: readonly number[],
  origins: readonly number[],
  targets: readonly number[],
) {
  const members = new Set(validIndices(map, allowed));
  const target = new Set(validIndices(map, targets).filter((index) => members.has(index)));
  const queue = validIndices(map, origins).filter((index) => members.has(index));
  const parent = new Int32Array(map.tiles.length).fill(-2);
  for (const index of queue) parent[index] = -1;
  let reached = -1;
  for (let cursor = 0; cursor < queue.length && reached < 0; cursor += 1) {
    const current = queue[cursor];
    if (target.has(current)) { reached = current; break; }
    for (const next of neighbors(current, map)) {
      if (!members.has(next) || parent[next] !== -2) continue;
      parent[next] = current;
      queue.push(next);
    }
  }
  if (reached < 0) return [];
  const route: number[] = [];
  for (let current = reached; current >= 0; current = parent[current]) route.push(current);
  return route.reverse();
}

function pathTermini(map: Civ5Map, indices: readonly number[]) {
  const members = new Set(validIndices(map, indices));
  return [...members].filter((index) => neighbors(index, map).filter((next) => members.has(next)).length <= 1);
}

function endpointTerminatingSpine(
  map: Civ5Map,
  path: BoundObject,
  bindings: Map<string, BoundObject>,
  predicate: (index: number) => boolean,
  minimumTiles: number,
  excludeEndpointInteriors = false,
) {
  const endpoints = pathEndpoints(path, bindings);
  if (!endpoints || path.tileIndices.length < minimumTiles || !path.tileIndices.every(predicate) || connectedShare(map, path.tileIndices) !== 1) return false;
  const termini = pathTermini(map, path.tileIndices);
  if (termini.length !== 2) return false;
  const fromMembers = new Set(endpoints.from.tileIndices);
  const toMembers = new Set(endpoints.to.tileIndices);
  const endpointUsesPathEffect = (endpoint: BoundObject) => endpoint.tileIndices.filter(predicate).length >= Math.ceil(endpoint.tileIndices.length * 0.8);
  const matchesEndpoint = (index: number, endpoint: BoundObject, endpointMembers: ReadonlySet<number>, otherMembers: ReadonlySet<number>) => {
    if (endpointUsesPathEffect(endpoint)) {
      const hasExclusiveMembers = endpoint.tileIndices.some((member) => !otherMembers.has(member));
      return endpointMembers.has(index) && (!hasExclusiveMembers || !otherMembers.has(index));
    }
    return touches(map, [index], endpoint.tileIndices, 1) && !touches(map, [index], [...otherMembers], 1);
  };
  const oriented = matchesEndpoint(termini[0], endpoints.from, fromMembers, toMembers)
    && matchesEndpoint(termini[1], endpoints.to, toMembers, fromMembers)
    ? termini
    : matchesEndpoint(termini[1], endpoints.from, fromMembers, toMembers)
      && matchesEndpoint(termini[0], endpoints.to, toMembers, fromMembers)
      ? [termini[1], termini[0]]
      : [];
  if (oriented.length !== 2) return false;
  const endpointInteriors = path.tileIndices.filter((index) => index !== oriented[0] && index !== oriented[1]);
  if (excludeEndpointInteriors && endpointInteriors.some((index) => fromMembers.has(index) || toMembers.has(index))) return false;
  const route = shortestRoute(map, path.tileIndices, [oriented[0]], [oriented[1]]);
  return route.length === path.tileIndices.length && route.length >= minimumTiles;
}

function materiallyDistinct(objects: readonly GeographicObject[], minimumUniqueTiles = 2) {
  const signatures = new Set<string>();
  for (const object of objects) {
    const signature = [...object.tileIndices].sort((one, two) => one - two).join(",");
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    const others = new Set(objects.filter((candidate) => candidate.id !== object.id).flatMap((candidate) => candidate.tileIndices));
    if (object.tileIndices.filter((index) => !others.has(index)).length < Math.min(minimumUniqueTiles, object.tileIndices.length)) return false;
  }
  return true;
}

function boundaryIndices(map: Civ5Map) {
  const result = new Set<number>();
  for (let x = 0; x < map.width; x += 1) {
    result.add(x);
    result.add((map.height - 1) * map.width + x);
  }
  if (!map.wraps) for (let y = 0; y < map.height; y += 1) {
    result.add(y * map.width);
    result.add(y * map.width + map.width - 1);
  }
  return result;
}

function graphConnected(nodes: readonly string[], edges: readonly { from: string; to: string }[]) {
  if (!nodes.length) return false;
  const adjacency = new Map(nodes.map((node) => [node, new Set<string>()]));
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  const reached = new Set([nodes[0]]);
  const queue = [nodes[0]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of adjacency.get(queue[cursor]) ?? []) if (!reached.has(next)) {
    reached.add(next);
    queue.push(next);
  }
  return reached.size === new Set(nodes).size;
}

function geometricDistance(map: Civ5Map, origins: readonly number[], targets: readonly number[]) {
  const target = new Set(validIndices(map, targets));
  const queue = validIndices(map, origins);
  const distances = new Int32Array(map.tiles.length).fill(-1);
  for (const index of queue) distances[index] = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (target.has(current)) return distances[current];
    for (const next of neighbors(current, map)) {
      if (distances[next] >= 0) continue;
      distances[next] = distances[current] + 1;
      queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function pathTortuosity(map: Civ5Map, path: BoundObject, from: BoundObject, to: BoundObject) {
  // Callers admit only an endpoint-terminating simple spine, so its real route
  // length is the number of retained path edges. Measuring from every path tile
  // that happens to touch an endpoint lets an incidental side contact belong to
  // both sets and falsely reports a zero-length route on tightly folded mazes.
  const route = Math.max(0, path.tileIndices.length - 1);
  const direct = geometricDistance(map, from.tileIndices, to.tileIndices);
  return Number.isFinite(route) && Number.isFinite(direct) && direct > 0 ? route / direct : 0;
}

function sharedBoundary(map: Civ5Map, one: readonly number[], two: readonly number[]) {
  const right = new Set(two);
  const left = new Set(one);
  const shared = new Set<number>();
  for (const index of left) for (const next of neighbors(index, map)) if (right.has(next)) {
    shared.add(index);
    shared.add(next);
  }
  return [...shared];
}

function provinceEffectMatches(map: Civ5Map, object: BoundObject) {
  const effect = String(object.attributes.effect ?? "");
  return object.tileIndices.every((index) => {
    const tile = map.tiles[index];
    if (!tile || tile.terrain < 2) return false;
    if (effect === "LAND") return true;
    if (effect === "WET") return tile.terrain === 2 || tile.feature === 0 || tile.feature === 1 || tile.feature === 2;
    if (effect === "DRY" || effect === "HOT") return tile.terrain === 3 || tile.terrain === 4;
    if (effect === "COLD") return tile.terrain === 5 || tile.terrain === 6;
    if (effect === "RIDGE") return tile.elevation > 0;
    if (effect === "LOWLAND") return tile.elevation < 2;
    if (effect === "BARREN") return tile.feature === 255 && tile.resource === 255 && tile.wonder === 255;
    return false;
  });
}

export function proveCrookedContinentsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const cores = exactRoleBindings(map, adapter, "CONTINENT_CORE");
  const lobes = exactRoleBindings(map, adapter, "CROOKED_LOBE");
  const interiors = exactRoleBindings(map, adapter, "CROOKED_INTERIOR");
  const fjords = exactRoleBindings(map, adapter, "FJORD_INTRUSION");
  const land = components(map, (index) => LAND(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const pairedLobes = new Set<string>();
  const validInteriors = interiors.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "CONTINENT_CORE" || roleOf(endpoints.to) !== "CROOKED_LOBE") return false;
    if (String(endpoints.to.attributes.parent ?? "") !== endpoints.from.id.replace(/^narrative-/, "")) return false;
    const coreComponent = dominantComponent(endpoints.from, land, (index) => LAND(map, index));
    const lobeComponent = dominantComponent(endpoints.to, land, (index) => LAND(map, index));
    if (coreComponent.id < 0 || coreComponent.id !== lobeComponent.id || coreComponent.share < 0.8 || lobeComponent.share < 0.8) return false;
    if (!endpointTerminatingSpine(map, path, bindings, (index) => LAND(map, index), 3)) return false;
    if (!objectFullyMatches(map, endpoints.to, (index) => LAND(map, index)) || connectedShare(map, endpoints.to.tileIndices) < 0.8) return false;
    pairedLobes.add(endpoints.to.id);
    return true;
  });
  const validCores = cores.objects.filter((core) => objectFullyMatches(map, core, (index) => LAND(map, index))
    && connectedShare(map, core.tileIndices) >= 0.8
    && cachedPassableInterior(map, passable, core, 6)
    && lobes.objects.filter((lobe) => String(lobe.attributes.parent ?? "") === core.id.replace(/^narrative-/, "")).every((lobe) => pairedLobes.has(lobe.id)));
  const distinctComponents = new Set(validCores.map((core) => dominantComponent(core, land, (index) => LAND(map, index)).id).filter((id) => id >= 0));
  const validFjords = fjords.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    return Boolean(endpoints
      && roleOf(endpoints.from) === "CONTINENT_CORE"
      && roleOf(endpoints.to) === "CONTINENT_CORE"
      && endpointTerminatingSpine(map, path, bindings, (index) => WATER(map, index), 2));
  });
  const distinctLobes = materiallyDistinct(lobes.objects, 1);
  const distinctInteriors = new Set(validInteriors.map((interior) => [...interior.tileIndices].sort((one, two) => one - two).join(","))).size;
  const distinctFjords = new Set(validFjords.map((fjord) => [...fjord.tileIndices].sort((one, two) => one - two).join(","))).size;
  const overlappingRegions = overlappingTileCount([...cores.objects, ...lobes.objects]);
  const complete = cores.complete && lobes.complete && interiors.complete && fjords.complete;
  const ok = complete && validCores.length === cores.objects.length && validCores.length >= 2
    && pairedLobes.size === lobes.objects.length && distinctLobes
    && validInteriors.length === interiors.objects.length && distinctInteriors === interiors.objects.length
    && distinctComponents.size === validCores.length
    && validFjords.length === fjords.objects.length && distinctFjords === fjords.objects.length;
  return proof(ok, [
    `Required native bindings: ${validCores.length} continent cores, ${validInteriors.length} crooked interior corridors, ${pairedLobes.size} child lobes, and ${validFjords.length} final water intrusions.`,
    `${validCores.length}/${cores.objects.length} exact continent cores retain connected passable interiors across ${distinctComponents.size} actual land components.`,
    `${validInteriors.length}/${interiors.objects.length} crooked interior corridors pair their exact child lobes with the correct parent core; ${validFjords.length} water intrusions remain continuous.`,
    ...(!ok ? [`Strict crooked predicates: complete=${complete}; distinctLobes=${distinctLobes}; distinctCorridors=${distinctInteriors}/${interiors.objects.length}; distinctIntrusions=${distinctFjords}/${fjords.objects.length}; overlappingRegionTiles=${overlappingRegions}.`] : []),
  ], [...validCores, ...lobes.objects, ...validInteriors, ...validFjords], {
    completeBindings: complete,
    viableCores: validCores.length,
    pairedLobes: pairedLobes.size,
    distinctLobes,
    distinctComponents: distinctComponents.size,
    validCorridors: validInteriors.length,
    distinctCorridors: distinctInteriors,
    validIntrusions: validFjords.length,
    distinctIntrusions: distinctFjords,
    overlappingRegionTiles: overlappingRegions,
  });
}

export function proveBrokenPangaeaSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const roots = exactRoleBindings(map, adapter, "DOMINANT_CONTINENT");
  const lobes = exactRoleBindings(map, adapter, "CONTINENT_LOBE");
  const bonds = exactRoleBindings(map, adapter, "CONTINENT_BOND");
  const land = components(map, (index) => LAND(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const totalLand = land.members.reduce((sum, component) => sum + component.length, 0);
  const largestId = land.members.reduce((winner, component, id) => component.length > (land.members[winner]?.length ?? -1) ? id : winner, 0);
  const largestShare = (land.members[largestId]?.length ?? 0) / Math.max(1, totalLand);
  const root = roots.objects[0];
  const rootComponent = root ? dominantComponent(root, land, (index) => LAND(map, index)) : { id: -1, share: 0, eligible: 0 };
  const validLobes = lobes.objects.filter((lobe) => objectFullyMatches(map, lobe, (index) => LAND(map, index))
    && String(lobe.attributes.parent ?? "") === root?.id.replace(/^narrative-/, "")
    && dominantComponent(lobe, land, (index) => LAND(map, index)).id === largestId
    && cachedPassableInterior(map, passable, lobe, 4));
  const bondedLobes = new Set<string>();
  const validBonds = bonds.objects.filter((bond) => {
    const endpoints = pathEndpoints(bond, bindings);
    if (!endpoints || endpoints.from.id !== root?.id || roleOf(endpoints.to) !== "CONTINENT_LOBE") return false;
    if (!endpointTerminatingSpine(map, bond, bindings, (index) => LAND(map, index), 3)) return false;
    if (dominantComponent(bond, land, (index) => LAND(map, index)).id !== largestId) return false;
    bondedLobes.add(endpoints.to.id);
    return true;
  });
  const bondDiversity = new Set(validBonds.map((bond) => [...bond.tileIndices].sort((one, two) => one - two).join(","))).size;
  const distinctLobes = materiallyDistinct(lobes.objects, 1);
  const robustness = landComponentRobustness(map, validBonds.flatMap((bond) => bond.tileIndices), land);
  const overlappingRegions = overlappingTileCount([...(root ? [root] : []), ...lobes.objects]);
  const complete = roots.complete && roots.objects.length === 1 && lobes.complete && bonds.complete;
  const ok = complete && Boolean(root)
    && objectFullyMatches(map, root!, (index) => LAND(map, index))
    && rootComponent.id === largestId && rootComponent.share >= 0.8 && cachedPassableInterior(map, passable, root!, 6)
    && largestShare >= 0.72
    && validLobes.length === lobes.objects.length && bondedLobes.size === lobes.objects.length && distinctLobes
    && validBonds.length === bonds.objects.length && validBonds.length >= 2 && bondDiversity === bonds.objects.length
    && robustness >= 0.72;
  return proof(ok, [
    `Required native bindings: one dominant-continent field, ${validLobes.length} child lobes, and ${validBonds.length} distinct final land bonds.`,
    `The exact dominant-continent field occupies the actual largest land component, which contains ${Math.round(largestShare * 100)}% of final land.`,
    `${validBonds.length}/${bonds.objects.length} distinct authored bonds connect real child lobes; deleting any single bond tile leaves at least ${Math.round(robustness * 100)}% of land in the largest component.`,
  ], [root, ...validLobes, ...validBonds].filter((object): object is BoundObject => Boolean(object)), {
    completeBindings: complete,
    largestLandShare: largestShare,
    dominantObjectInLargest: rootComponent.id === largestId,
    validBonds: validBonds.length,
    bondedLobes: bondedLobes.size,
    distinctLobes,
    distinctBondSpines: bondDiversity,
    singleTileRobustness: robustness,
    overlappingRegionTiles: overlappingRegions,
  });
}

type ShelfSystem = {
  root: BoundObject;
  fragments: BoundObject[];
  arcs: BoundObject[];
  componentId: number;
  tiles: number[];
};

function shelfSystems(
  map: Civ5Map,
  bindings: Map<string, BoundObject>,
  roots: BoundObject[],
  fragments: BoundObject[],
  arcs: BoundObject[],
  minimumInterior: number,
) {
  const land = components(map, (index) => LAND(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const systems: ShelfSystem[] = [];
  for (const root of roots) {
    const rootId = root.id.replace(/^narrative-/, "");
    const component = dominantComponent(root, land, (index) => LAND(map, index));
    const children = fragments.filter((fragment) => String(fragment.attributes.parent ?? "") === rootId);
    const childArcs: BoundObject[] = [];
    if (!objectFullyMatches(map, root, (index) => LAND(map, index))
      || component.share < 0.8
      || !cachedPassableInterior(map, passable, root, minimumInterior)
      || !children.length
      || !materiallyDistinct(children, 1)
      || overlappingTileCount(children) > 0) continue;
    let valid = true;
    const usedArcs = new Set<string>();
    const arcSignatures = new Set<string>();
    const rootTermini = new Set<number>();
    for (const child of children) {
      const childComponent = dominantComponent(child, land, (index) => LAND(map, index));
      const matches = arcs.filter((candidate) => {
        const endpoints = pathEndpoints(candidate, bindings);
        return endpoints?.from.id === root.id && endpoints.to.id === child.id
          && endpointTerminatingSpine(map, candidate, bindings, (index) => LAND(map, index), 2);
      });
      const arc = matches[0];
      const signature = arc ? [...arc.tileIndices].sort((one, two) => one - two).join(",") : "";
      if (matches.length !== 1 || !arc || usedArcs.has(arc.id) || arcSignatures.has(signature)
        || !objectFullyMatches(map, child, (index) => LAND(map, index))
        || childComponent.id !== component.id || childComponent.share < 0.7) { valid = false; break; }
      usedArcs.add(arc.id);
      arcSignatures.add(signature);
      const termini = pathTermini(map, arc.tileIndices);
      const childMembers = new Set(child.tileIndices);
      const rootTerminus = termini.find((index) => root.tileIndices.includes(index) && !childMembers.has(index));
      if (rootTerminus === undefined || rootTermini.has(rootTerminus)) { valid = false; break; }
      rootTermini.add(rootTerminus);
      childArcs.push(arc);
    }
    if (valid && childArcs.some((arc, index) => childArcs.slice(index + 1)
      .some((other) => overlapCount(arc.tileIndices, other.tileIndices) / Math.max(1, Math.min(arc.tileIndices.length, other.tileIndices.length)) > 0.2))) valid = false;
    if (!valid) continue;
    systems.push({ root, fragments: children, arcs: childArcs, componentId: component.id, tiles: [...new Set([...root.tileIndices, ...children.flatMap((child) => child.tileIndices), ...childArcs.flatMap((arc) => arc.tileIndices)])] });
  }
  return systems;
}

function systemsAreSeparated(systems: readonly ShelfSystem[]) {
  if (new Set(systems.map((system) => system.componentId)).size !== systems.length) return false;
  for (let one = 0; one < systems.length; one += 1) for (let two = one + 1; two < systems.length; two += 1) {
    if (overlapCount(systems[one].tiles, systems[two].tiles) > 0) return false;
  }
  return true;
}

export function proveDrownedShelvesSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const roots = exactRoleBindings(map, adapter, "DROWNED_SHELF");
  const fragments = exactRoleBindings(map, adapter, "SHELF_FRAGMENT");
  const arcs = exactRoleBindings(map, adapter, "DROWNED_SHELF_ARC");
  const systems = shelfSystems(map, bindings, roots.objects, fragments.objects, arcs.objects, 4);
  const representedFragments = new Set(systems.flatMap((system) => system.fragments.map((fragment) => fragment.id)));
  const representedArcs = new Set(systems.flatMap((system) => system.arcs.map((arc) => arc.id)));
  const separated = systemsAreSeparated(systems);
  const reducedShelves = adapter.relaxations.some((message) => /fewer drowned parent shelves|merge secondary shelf systems/i.test(message));
  const retainedComplete = (bindings: BindingSet) => bindings.objects.length === bindings.causes.filter((cause) => cause.retained).length;
  const complete = reducedShelves
    ? retainedComplete(roots) && retainedComplete(fragments) && retainedComplete(arcs)
    : roots.complete && fragments.complete && arcs.complete;
  const ok = complete && systems.length === roots.objects.length && systems.length >= 2 && separated
    && representedFragments.size === fragments.objects.length && representedArcs.size === arcs.objects.length;
  return proof(ok, [
    `Required native bindings: ${systems.length} parent shelves, ${representedFragments.size} subordinate fragments, and ${representedArcs.size} exact shelf arcs.`,
    `${systems.length}/${roots.objects.length} exact parent shelves retain a connected settlement-capable anchor and correctly parented fragments.`,
    `${new Set(systems.map((system) => system.componentId)).size} actual land systems contain those shelves without cross-parent overlap.`,
    ...(!ok ? [`Strict shelf predicates: complete=${complete}${reducedShelves ? " under disclosed shelf-system reduction" : ""}; roots=${roots.objects.length}/${roots.causes.length}; fragments=${fragments.objects.length}/${fragments.causes.length}; arcs=${arcs.objects.length}/${arcs.causes.length}; representedFragments=${representedFragments.size}; representedArcs=${representedArcs.size}; separated=${separated}.`] : []),
  ], systems.flatMap((system) => [system.root, ...system.fragments, ...system.arcs]), {
    completeBindings: complete,
    viableShelfSystems: systems.length,
    distinctShelfComponents: new Set(systems.map((system) => system.componentId)).size,
    separatedSystems: separated,
    parentedFragments: representedFragments.size,
  });
}

export function proveLakeKingdomsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const lands = exactRoleBindings(map, adapter, "ENCLOSING_LAND");
  const seas = exactRoleBindings(map, adapter, "INLAND_SEA");
  const lakes = exactRoleBindings(map, adapter, "INLAND_LAKE");
  const circuits = exactRoleBindings(map, adapter, "OUTER_CIRCUIT");
  const land = components(map, (index) => LAND(map, index));
  const water = components(map, (index) => WATER(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const totalLand = land.members.reduce((sum, component) => sum + component.length, 0);
  const largestLandId = land.members.reduce((winner, component, id) => component.length > (land.members[winner]?.length ?? -1) ? id : winner, 0);
  const largestLandShare = (land.members[largestLandId]?.length ?? 0) / Math.max(1, totalLand);
  const edge = boundaryIndices(map);
  const edgeWaterShare = [...edge].filter((index) => WATER(map, index)).length / Math.max(1, edge.size);
  const enclosedWaterIds = new Set(water.members.flatMap((component, id) => component.some((index) => edge.has(index)) ? [] : [id]));
  const validWater = [...seas.objects, ...lakes.objects].filter((object) => {
    const component = dominantComponent(object, water, (index) => WATER(map, index));
    return objectFullyMatches(map, object, (index) => WATER(map, index)) && component.share >= 0.8 && enclosedWaterIds.has(component.id);
  });
  const distinctWaterFields = materiallyDistinct([...seas.objects, ...lakes.objects], 1);
  const overlappingWaterObjects = overlappingTileCount([...seas.objects, ...lakes.objects]);
  const overlappingLandObjects = overlappingTileCount(lands.objects);
  const validLands = lands.objects.filter((object) => objectFullyMatches(map, object, (index) => LAND(map, index))
    && dominantComponent(object, land, (index) => LAND(map, index)).id === largestLandId
    && cachedPassableInterior(map, passable, object, 4));
  const validCircuits = circuits.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    return Boolean(endpoints && roleOf(endpoints.from) === "ENCLOSING_LAND" && roleOf(endpoints.to) === "ENCLOSING_LAND"
      && dominantComponent(path, land, (index) => LAND(map, index)).id === largestLandId
      && endpointTerminatingSpine(map, path, bindings, (index) => LAND(map, index), 2, true));
  });
  const circuitEdges = validCircuits.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    return endpoints ? [{ from: endpoints.from.id, to: endpoints.to.id }] : [];
  });
  const degrees = new Map(lands.objects.map((object) => [object.id, 0]));
  for (const edgeRecord of circuitEdges) {
    degrees.set(edgeRecord.from, (degrees.get(edgeRecord.from) ?? 0) + 1);
    degrees.set(edgeRecord.to, (degrees.get(edgeRecord.to) ?? 0) + 1);
  }
  const closedCircuit = validCircuits.length === circuits.objects.length
    && graphConnected(lands.objects.map((object) => object.id), circuitEdges)
    && [...degrees.values()].every((degree) => degree === 2);
  const distinctLandFields = materiallyDistinct(lands.objects, 2) && lands.objects.every((object) => {
    const otherTiles = new Set(lands.objects.filter((candidate) => candidate.id !== object.id).flatMap((candidate) => candidate.tileIndices));
    return object.tileIndices.filter((index) => !otherTiles.has(index)).length >= Math.max(2, Math.ceil(object.tileIndices.length * 0.15));
  });
  const uniqueCircuitEdges = new Set(circuitEdges.map((edgeRecord) => [edgeRecord.from, edgeRecord.to].sort().join("|"))).size === circuitEdges.length;
  const distinctCircuitPaths = materiallyDistinct(validCircuits, 1);
  const limitedCircuitOverlap = validCircuits.every((path, index) => validCircuits.slice(index + 1).every((other) => overlapCount(path.tileIndices, other.tileIndices) / Math.max(1, Math.min(path.tileIndices.length, other.tileIndices.length)) <= 0.2));
  const circuitTerminals = new Map(lands.objects.map((object) => [object.id, [] as number[]]));
  for (const path of validCircuits) {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints) continue;
    const termini = pathTermini(map, path.tileIndices);
    const fromSet = new Set(endpoints.from.tileIndices);
    const toSet = new Set(endpoints.to.tileIndices);
    const fromTerminus = termini.find((index) => fromSet.has(index) && !toSet.has(index));
    const toTerminus = termini.find((index) => toSet.has(index) && !fromSet.has(index));
    if (fromTerminus !== undefined) circuitTerminals.get(endpoints.from.id)?.push(fromTerminus);
    if (toTerminus !== undefined) circuitTerminals.get(endpoints.to.id)?.push(toTerminus);
  }
  const spatialCircuit = [...circuitTerminals.values()].every((termini) => termini.length === 2 && new Set(termini).size === 2);
  const complete = lands.complete && seas.complete && lakes.complete && circuits.complete;
  const ok = complete && validLands.length === lands.objects.length && validLands.length >= 3
    && largestLandShare >= 0.75 && edgeWaterShare <= 0.2
    && seas.objects.length >= 1 && validWater.length === seas.objects.length + lakes.objects.length && distinctWaterFields
    && validCircuits.length === circuits.objects.length && closedCircuit
    && distinctLandFields && uniqueCircuitEdges && distinctCircuitPaths && limitedCircuitOverlap && spatialCircuit;
  return proof(ok, [
    `Required native bindings: ${validLands.length} enclosing-land fields, ${validWater.length} inland water fields, and ${validCircuits.length} real circuit paths.`,
    `The enclosing land circuit occupies ${Math.round(largestLandShare * 100)}% of final land; ${Math.round(edgeWaterShare * 100)}% of the external boundary is water.`,
    `${validWater.length}/${seas.objects.length + lakes.objects.length} authored seas and lakes belong to actual water components with no external-map outlet.`,
    `${validCircuits.length}/${circuits.objects.length} land paths form a connected degree-two-or-better circuit through every enclosing-land field.`,
  ], [...validLands, ...validWater, ...validCircuits], {
    completeBindings: complete,
    largestLandShare,
    edgeWaterShare,
    enclosedWaterObjects: validWater.length,
    distinctWaterFields,
    closedCircuit,
    distinctLandFields,
    uniqueCircuitEdges,
    distinctCircuitPaths,
    limitedCircuitOverlap,
    spatialCircuit,
    overlappingWaterObjectTiles: overlappingWaterObjects,
    overlappingLandObjectTiles: overlappingLandObjects,
  });
}

export function proveIslandContinentsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const roots = exactRoleBindings(map, adapter, "ISLAND_CONTINENT");
  const fragments = exactRoleBindings(map, adapter, "SHELF_FRAGMENT");
  const arcs = exactRoleBindings(map, adapter, "DROWNED_SHELF_ARC");
  const completeShelfSystems = shelfSystems(map, bindings, roots.objects, fragments.objects, arcs.objects, 6);
  const majors = map.startLocations.filter((start) => !start.cityState && start.playable !== false);
  const land = components(map, (index) => LAND(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const realms = roots.objects.flatMap((root) => {
    const component = dominantComponent(root, land, (index) => LAND(map, index));
    return objectFullyMatches(map, root, (index) => LAND(map, index)) && component.share >= 0.8
      && cachedPassableInterior(map, passable, root, 6) ? [{ root, componentId: component.id }] : [];
  });
  const distinctRealmComponents = new Set(realms.map((realm) => realm.componentId));
  const startRealms: string[] = [];
  let unambiguous = true;
  for (const start of majors) {
    const index = start.y * map.width + start.x;
    if (!PASSABLE_LAND(map, index)) { unambiguous = false; continue; }
    const matches = realms.filter((realm) => realm.componentId === land.ids[index]);
    if (matches.length !== 1) { unambiguous = false; continue; }
    startRealms.push(matches[0].root.id);
  }
  const distinctStartRealms = new Set(startRealms);
  const representedFragments = new Set(completeShelfSystems.flatMap((system) => system.fragments.map((fragment) => fragment.id)));
  const representedArcs = new Set(completeShelfSystems.flatMap((system) => system.arcs.map((arc) => arc.id)));
  const complete = roots.complete && fragments.complete && arcs.complete;
  const ok = complete && majors.length >= 2 && realms.length === roots.objects.length && roots.objects.length >= 3
    && distinctRealmComponents.size === realms.length
    && unambiguous && startRealms.length === majors.length && distinctStartRealms.size >= Math.min(2, realms.length);
  return proof(ok, [
    `Required native bindings: ${realms.length} settlement-capable island-continent realms plus ${startRealms.length} final major-start assignments; several majors may lawfully share one capacious geographic realm.`,
    `${realms.length}/${roots.objects.length} principal realms retain six-tile passable interiors in ${distinctRealmComponents.size} distinct actual island components; ${completeShelfSystems.length} retain their complete subordinate shelf family.`,
    `${startRealms.length}/${majors.length} major starts map unambiguously onto ${distinctStartRealms.size} populated island realms without requiring one player per geographic continent.`,
    ...(!ok ? [`Strict island predicates: complete=${complete}; roots=${roots.objects.length}/${roots.causes.length}; fragments=${fragments.objects.length}/${fragments.causes.length}; arcs=${arcs.objects.length}/${arcs.causes.length}; viableRealms=${realms.length}; distinctComponents=${distinctRealmComponents.size}; representedFragments=${representedFragments.size}; representedArcs=${representedArcs.size}; unambiguousStarts=${unambiguous}.`] : []),
  ], [...realms.map((realm) => realm.root), ...completeShelfSystems.flatMap((system) => [...system.fragments, ...system.arcs])], {
    completeBindings: complete,
    viableIslandRealms: realms.length,
    distinctRealmComponents: distinctRealmComponents.size,
    completeShelfSystems: completeShelfSystems.length,
    majorStarts: majors.length,
    assignedStartRealms: startRealms.length,
    distinctStartRealms: distinctStartRealms.size,
    unambiguousStartRealmBinding: unambiguous,
    separatedSystems: distinctRealmComponents.size === realms.length,
    parentedFragments: representedFragments.size,
    parentedArcs: representedArcs.size,
  });
}

export function proveDeepOceanDividesSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const cells = exactRoleBindings(map, adapter, "VIABLE_RIFT_CELL");
  const rifts = exactRoleBindings(map, adapter, "PRIMARY_RIFT");
  const land = components(map, (index) => LAND(map, index));
  const early = components(map, (index) => PRE_ASTRONOMY(map, index));
  const passable = components(map, (index) => PASSABLE_LAND(map, index));
  const viableCells = cells.objects.filter((cell) => objectFullyMatches(map, cell, (index) => LAND(map, index))
    && dominantComponent(cell, land, (index) => LAND(map, index)).share >= 0.75
    && cachedPassableInterior(map, passable, cell, 4));
  const validRifts = rifts.objects.filter((rift) => {
    const endpoints = pathEndpoints(rift, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "VIABLE_RIFT_CELL" || roleOf(endpoints.to) !== "VIABLE_RIFT_CELL") return false;
    if (!endpointTerminatingSpine(map, rift, bindings, (index) => DEEP_WATER(map, index), Math.max(4, Math.floor(Math.min(map.width, map.height) / 2)))) return false;
    const from = dominantComponent(endpoints.from, early, (index) => PRE_ASTRONOMY(map, index));
    const to = dominantComponent(endpoints.to, early, (index) => PRE_ASTRONOMY(map, index));
    if (from.id < 0 || to.id < 0 || from.id === to.id || from.share < 0.65 || to.share < 0.65) return false;
    const openedRift = new Set(rift.tileIndices);
    const bridged = components(map, (index) => PRE_ASTRONOMY(map, index) || openedRift.has(index));
    const bridgedFrom = dominantComponent(endpoints.from, bridged, (index) => PRE_ASTRONOMY(map, index) || openedRift.has(index));
    const bridgedTo = dominantComponent(endpoints.to, bridged, (index) => PRE_ASTRONOMY(map, index) || openedRift.has(index));
    return bridgedFrom.id >= 0 && bridgedFrom.id === bridgedTo.id;
  });
  const riftPairs = validRifts.flatMap((rift) => {
    const endpoints = pathEndpoints(rift, bindings);
    return endpoints ? [[endpoints.from.id, endpoints.to.id].sort().join("|")] : [];
  });
  const distinctRifts = new Set(riftPairs).size === validRifts.length
    && materiallyDistinct(validRifts, 1)
    && validRifts.every((rift, index) => validRifts.slice(index + 1).every((other) => overlapCount(rift.tileIndices, other.tileIndices)
      / Math.max(1, Math.min(rift.tileIndices.length, other.tileIndices.length)) <= 0.2));
  const distinctEarlyCells = new Set(viableCells.map((cell) => dominantComponent(cell, early, (index) => PRE_ASTRONOMY(map, index)).id).filter((id) => id >= 0));
  const overlappingCells = overlappingTileCount(cells.objects);
  const complete = cells.complete && rifts.complete;
  const ok = complete && viableCells.length === cells.objects.length && viableCells.length >= 2
    && overlappingCells === 0
    && validRifts.length >= 1 && validRifts.length === rifts.objects.length && distinctRifts && distinctEarlyCells.size >= 2;
  return proof(ok, [
    `Required native bindings: ${viableCells.length} viable rift cells and ${validRifts.length} continuous, causally separating deep-water cuts.`,
    `${validRifts.length}/${rifts.objects.length} exact primary rifts recompute as continuous all-deep-water cuts whose endpoint cells have no land-or-coast bypass before Astronomy.`,
    `${viableCells.length}/${cells.objects.length} retained rift cells contain passable interiors across ${distinctEarlyCells.size} pre-Astronomy components.`,
  ], [...viableCells, ...validRifts], {
    completeBindings: complete,
    viableCells: viableCells.length,
    validDeepCuts: validRifts.length,
    distinctRifts,
    distinctPreAstronomyComponents: distinctEarlyCells.size,
    overlappingCellTiles: overlappingCells,
  });
}

export function proveLandSeaMazeSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const chambers = exactRoleBindings(map, adapter, "MAZE_CHAMBER");
  const passages = exactRoleBindings(map, adapter, "WINDING_PASSAGE");
  const alleys = exactRoleBindings(map, adapter, "BLIND_WATER_ALLEY");
  const validChambers = chambers.objects.filter((chamber) => objectFullyMatches(map, chamber, (index) => LAND(map, index))
    && connectedShare(map, chamber.tileIndices) === 1
    && chamber.tileIndices.filter((index) => PASSABLE_LAND(map, index)).length >= 2);
  const overlappingChambers = overlappingTileCount(chambers.objects);
  const validPassages = passages.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    return Boolean(endpoints && roleOf(endpoints.from) === "MAZE_CHAMBER" && roleOf(endpoints.to) === "MAZE_CHAMBER"
      && endpointTerminatingSpine(map, path, bindings, (index) => LAND(map, index), 3));
  });
  const invalidPassageDetails = passages.objects.filter((path) => !validPassages.includes(path)).map((path) => {
    const endpoints = pathEndpoints(path, bindings);
    const termini = pathTermini(map, path.tileIndices);
    const fromTouches = endpoints ? termini.filter((index) => touches(map, [index], endpoints.from.tileIndices, 1)).length : 0;
    const toTouches = endpoints ? termini.filter((index) => touches(map, [index], endpoints.to.tileIndices, 1)).length : 0;
    const ambiguousTermini = endpoints ? termini.filter((index) => touches(map, [index], endpoints.from.tileIndices, 1) && touches(map, [index], endpoints.to.tileIndices, 1)).length : 0;
    const members = new Set(path.tileIndices);
    const maximumDegree = Math.max(0, ...path.tileIndices.map((index) => neighbors(index, map).filter((next) => members.has(next)).length));
    return `${path.id}[tiles=${path.tileIndices.length}, land=${path.tileIndices.filter((index) => LAND(map, index)).length}, connected=${connectedShare(map, path.tileIndices).toFixed(2)}, termini=${termini.length}, maxDegree=${maximumDegree}, fromTermini=${fromTouches}, toTermini=${toTouches}, ambiguousTermini=${ambiguousTermini}, roles=${endpoints ? `${roleOf(endpoints.from)}→${roleOf(endpoints.to)}` : "missing"}]`;
  });
  const passageEdges = validPassages.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    return endpoints ? [{ from: endpoints.from.id, to: endpoints.to.id }] : [];
  });
  const distinctPassages = new Set(passageEdges.map((edge) => [edge.from, edge.to].sort().join("|"))).size === passageEdges.length
    && materiallyDistinct(validPassages, 1);
  const tortuosities = validPassages.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints) return [];
    const value = pathTortuosity(map, path, endpoints.from, endpoints.to);
    return value > 0 ? [value] : [];
  });
  const averageTortuosity = tortuosities.reduce((sum, value) => sum + value, 0) / Math.max(1, tortuosities.length);
  const stretchedPassages = tortuosities.filter((value) => value >= 1.15).length;
  const validAlleys = alleys.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "MAZE_CHAMBER" || roleOf(endpoints.to) !== "MAZE_CHAMBER"
      || path.tileIndices.length < 2
      || !path.tileIndices.every((index) => WATER(map, index))
      || connectedShare(map, path.tileIndices) !== 1) return false;
    const touchesFrom = touches(map, path.tileIndices, endpoints.from.tileIndices, 1);
    const touchesTo = touches(map, path.tileIndices, endpoints.to.tileIndices, 1);
    if (touchesFrom === touchesTo) return false;
    const mouth = touchesFrom ? endpoints.from : endpoints.to;
    const other = touchesFrom ? endpoints.to : endpoints.from;
    const termini = pathTermini(map, path.tileIndices);
    if (termini.length !== 2) return false;
    const mouthTermini = termini.filter((index) => touches(map, [index], mouth.tileIndices, 1) && !touches(map, [index], other.tileIndices, 1));
    const terminalBranches = termini.filter((index) => !touches(map, [index], mouth.tileIndices, 1)
      && !touches(map, [index], other.tileIndices, 1)
      && neighbors(index, map).filter((next) => WATER(map, next)).length <= 1);
    return mouthTermini.length === 1 && terminalBranches.length === 1
      && shortestRoute(map, path.tileIndices, mouthTermini, terminalBranches).length === path.tileIndices.length;
  });
  const alleyMouths = validAlleys.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints) return [];
    const mouth = touches(map, path.tileIndices, endpoints.from.tileIndices, 1) ? endpoints.from : endpoints.to;
    return pathTermini(map, path.tileIndices).filter((index) => touches(map, [index], mouth.tileIndices, 1)).slice(0, 1);
  });
  let alleyOverlap = 0;
  let limitedAlleyOverlap = true;
  for (let one = 0; one < validAlleys.length; one += 1) for (let two = one + 1; two < validAlleys.length; two += 1) {
    const overlap = overlapCount(validAlleys[one].tileIndices, validAlleys[two].tileIndices);
    alleyOverlap += overlap;
    if (overlap / Math.max(1, Math.min(validAlleys[one].tileIndices.length, validAlleys[two].tileIndices.length)) > 0.2) limitedAlleyOverlap = false;
  }
  const distinctAlleyBranches = materiallyDistinct(validAlleys, 1);
  const distinctAlleyMouths = new Set(alleyMouths).size;
  const majors = map.startLocations.filter((start) => !start.cityState && start.playable !== false);
  const majorIndices = majors.map((start) => start.y * map.width + start.x);
  const reachable = new Set<number>();
  if (majorIndices.length && PASSABLE_LAND(map, majorIndices[0])) {
    const queue = [majorIndices[0]];
    reachable.add(majorIndices[0]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (reachable.has(next) || !PASSABLE_LAND(map, next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  const populatedChambers = new Set<string>();
  let startsBound = majors.length >= 2;
  for (const index of majorIndices) {
    if (!PASSABLE_LAND(map, index) || !reachable.has(index)) { startsBound = false; continue; }
    const matches = validChambers.filter((chamber) => touches(map, [index], chamber.tileIndices, 1));
    if (!matches.length) { startsBound = false; continue; }
    populatedChambers.add(matches.sort((one, two) => geometricDistance(map, [index], one.tileIndices) - geometricDistance(map, [index], two.tileIndices) || one.id.localeCompare(two.id))[0].id);
  }
  const chamberGraphConnected = graphConnected(validChambers.map((chamber) => chamber.id), passageEdges);
  const retainedAlleysComplete = alleys.objects.length === alleys.causes.filter((cause) => cause.retained).length && alleys.objects.length >= 3;
  const complete = chambers.complete && passages.complete && retainedAlleysComplete;
  const ok = complete && validChambers.length === chambers.objects.length && validChambers.length >= 4
    && overlappingChambers === 0
    && validPassages.length === passages.objects.length && validPassages.length >= 3 && distinctPassages && chamberGraphConnected
    && tortuosities.length === validPassages.length && averageTortuosity >= 1.08 && stretchedPassages >= 2
    && validAlleys.length === alleys.objects.length && validAlleys.length >= 2
    && distinctAlleyBranches && limitedAlleyOverlap && distinctAlleyMouths === alleys.objects.length
    && startsBound && populatedChambers.size >= Math.min(2, majors.length);
  return proof(ok, [
    `Required native bindings: ${validChambers.length} connected chambers, ${validPassages.length} winding land passages, and ${validAlleys.length} blind water alleys.`,
    `${validPassages.length}/${passages.objects.length} land passages connect the complete chamber graph with ${averageTortuosity.toFixed(2)}× mean geometric route stretch (${stretchedPassages} materially indirect passages).`,
    `${validAlleys.length}/${alleys.objects.length} continuous water alleys form the second maze; all ${majors.length} major starts remain passably reachable in ${populatedChambers.size} populated chambers.`,
    ...(!ok ? [`Strict maze predicates: complete=${complete} (chambers=${chambers.complete}:${chambers.objects.length}/${chambers.causes.filter((cause) => cause.retained).length}/${chambers.causes.length}, passages=${passages.complete}:${passages.objects.length}/${passages.causes.filter((cause) => cause.retained).length}/${passages.causes.length}, alleys=${alleys.complete}:${alleys.objects.length}/${alleys.causes.filter((cause) => cause.retained).length}/${alleys.causes.length}); chambers=${validChambers.length}/${chambers.objects.length}; chamberOverlap=${overlappingChambers}; passagesDistinct=${distinctPassages}; chamberGraph=${chamberGraphConnected}; tortuosities=${tortuosities.length}/${validPassages.length}; alleyMouths=${distinctAlleyMouths}/${alleys.objects.length}; alleyBranches=${distinctAlleyBranches}; alleyOverlapLimited=${limitedAlleyOverlap}; startsBound=${startsBound}. Invalid passages: ${invalidPassageDetails.join(", ") || "none"}.`] : []),
  ], [...validChambers, ...validPassages, ...validAlleys], {
    completeBindings: complete,
    viableChambers: validChambers.length,
    validPassages: validPassages.length,
    distinctPassages,
    validWaterAlleys: validAlleys.length,
    distinctAlleyMouths,
    distinctAlleyBranches,
    limitedAlleyOverlap,
    overlappingAlleyTiles: alleyOverlap,
    averageTortuosity,
    stretchedPassages,
    chamberGraphConnected,
    accessibleMajorStarts: startsBound,
    populatedChambers: populatedChambers.size,
    overlappingChamberTiles: overlappingChambers,
  });
}

export function provePatchworkProvincesSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const provinces = exactRoleBindings(map, adapter, "PATCHWORK_PROVINCE");
  const boundaries = exactRoleBindings(map, adapter, "COMPOSED_BOUNDARY");
  const validProvinces = provinces.objects.filter((province) => province.tileIndices.length >= 4
    && connectedShare(map, province.tileIndices) === 1
    && provinceEffectMatches(map, province));
  let overlapTiles = 0;
  for (let one = 0; one < provinces.objects.length; one += 1) for (let two = one + 1; two < provinces.objects.length; two += 1) {
    overlapTiles += overlapCount(provinces.objects[one].tileIndices, provinces.objects[two].tileIndices);
  }
  const validBoundaries = boundaries.objects.filter((boundary) => {
    const endpoints = pathEndpoints(boundary, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "PATCHWORK_PROVINCE" || roleOf(endpoints.to) !== "PATCHWORK_PROVINCE") return false;
    if (String(endpoints.from.attributes.effect ?? "") === String(endpoints.to.attributes.effect ?? "")) return false;
    const shared = sharedBoundary(map, endpoints.from.tileIndices, endpoints.to.tileIndices);
    const sharedSet = new Set(shared);
    return shared.length > 0
      && boundary.tileIndices.length === shared.length
      && connectedShare(map, boundary.tileIndices) === 1
      && boundary.tileIndices.every((index) => sharedSet.has(index))
      && boundary.tileIndices.some((index) => endpoints.from.tileIndices.includes(index))
      && boundary.tileIndices.some((index) => endpoints.to.tileIndices.includes(index));
  });
  const boundaryPairs = validBoundaries.flatMap((boundary) => {
    const endpoints = pathEndpoints(boundary, bindings);
    return endpoints ? [[endpoints.from.id, endpoints.to.id].sort().join("|")] : [];
  });
  let maximumBoundaryOverlapShare = 0;
  for (let one = 0; one < validBoundaries.length; one += 1) for (let two = one + 1; two < validBoundaries.length; two += 1) {
    maximumBoundaryOverlapShare = Math.max(maximumBoundaryOverlapShare, overlapCount(validBoundaries[one].tileIndices, validBoundaries[two].tileIndices)
      / Math.max(1, Math.min(validBoundaries[one].tileIndices.length, validBoundaries[two].tileIndices.length)));
  }
  const oneToOneBoundaries = new Set(boundaryPairs).size === validBoundaries.length
    && materiallyDistinct(validBoundaries, 1)
    && validBoundaries.every((boundary, index) => validBoundaries.slice(index + 1)
      .every((other) => overlapCount(boundary.tileIndices, other.tileIndices) <= 1))
    && maximumBoundaryOverlapShare <= 0.5;
  const effects = new Set(validProvinces.map((province) => String(province.attributes.effect ?? "")));
  let contrastingSharedPairs = 0;
  for (let one = 0; one < validProvinces.length; one += 1) for (let two = one + 1; two < validProvinces.length; two += 1) {
    if (String(validProvinces[one].attributes.effect ?? "") === String(validProvinces[two].attributes.effect ?? "")) continue;
    if (sharedBoundary(map, validProvinces[one].tileIndices, validProvinces[two].tileIndices).length > 0) contrastingSharedPairs += 1;
  }
  const complete = provinces.complete && boundaries.complete;
  const ok = complete && validProvinces.length === provinces.objects.length && validProvinces.length >= 4
    && effects.size >= 4 && overlapTiles === 0
    && contrastingSharedPairs >= 6
    && validBoundaries.length === boundaries.objects.length && validBoundaries.length >= 3
    && oneToOneBoundaries;
  return proof(ok, [
    `Required native bindings: ${validProvinces.length} connected effect-faithful provinces and ${validBoundaries.length} exact shared contrasting boundaries.`,
    `${validProvinces.length}/${provinces.objects.length} exact provinces recompute as connected, non-overlapping final fields with ${effects.size} effect-faithful laws and ${contrastingSharedPairs} real contrasting adjacencies.`,
    `${validBoundaries.length}/${boundaries.objects.length} composed boundaries touch real shared hex boundaries between provinces with contrasting final effects.`,
    ...(!ok ? [`Strict patchwork predicates: complete=${complete} (provinces ${provinces.complete}:${provinces.objects.length}/${provinces.causes.length}; boundaries ${boundaries.complete}:${boundaries.objects.length}/${boundaries.causes.length}); effects=${effects.size}; overlapTiles=${overlapTiles}; contrastingPairs=${contrastingSharedPairs}; oneToOneBoundaries=${oneToOneBoundaries}; maximumBoundaryOverlap=${maximumBoundaryOverlapShare.toFixed(2)}.`] : []),
  ], [...validProvinces, ...validBoundaries], {
    completeBindings: complete,
    validProvinces: validProvinces.length,
    distinctEffects: effects.size,
    overlappingProvinceTiles: overlapTiles,
    contrastingSharedPairs,
    validSharedBoundaries: validBoundaries.length,
    oneToOneBoundaries,
    maximumBoundaryOverlapShare,
  });
}

export const EXCOGITARE_NATIVE_SPATIAL_PROVERS: Readonly<Record<ExcogitareNativeInvariantId, (
  map: Civ5Map,
  adapter: NarrativeAdapterEvidence,
) => NarrativeNativeExcogitareProofFacts>> = {
  "viable-crooked-interiors": proveCrookedContinentsSpatialFacts,
  "robust-dominant-continent": proveBrokenPangaeaSpatialFacts,
  "viable-shelf-anchors": proveDrownedShelvesSpatialFacts,
  "bounded-terrestrial-kingdoms": proveLakeKingdomsSpatialFacts,
  "viable-island-homelands": proveIslandContinentsSpatialFacts,
  "technology-gated-divide": proveDeepOceanDividesSpatialFacts,
  "accessible-dual-maze": proveLandSeaMazeSpatialFacts,
  "coherent-contrasting-provinces": provePatchworkProvincesSpatialFacts,
};

export function proveExcogitareNativeInvariant(
  invariantId: ExcogitareNativeInvariantId,
  map: Civ5Map,
  adapter: NarrativeAdapterEvidence,
) {
  return EXCOGITARE_NATIVE_SPATIAL_PROVERS[invariantId](map, adapter);
}
