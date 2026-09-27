import type { Civ5Map } from "./civ5-map.ts";
import type { GeographicObject } from "./generation-structure.ts";
import type { NarrativeAdapterEvidence, NarrativeCausalObject } from "./narrative-engine-adapters.ts";
import { reconstructCiv5RiverEdgeSystems } from "./rivers.ts";

/**
 * Final-state spatial proofs for the eleven Eccentric graph grammars.
 *
 * Labels select authored causes; they never prove them. Every proof below
 * resolves an exact retained cause to one final native object and then
 * recomputes connectivity, endpoint incidence, enclosure, component
 * membership, relief, surface, start, or encoded-river facts from the map.
 */
export type NarrativeNativeEccentricProofFacts = {
  ok: boolean;
  evidence: string[];
  objectIds: string[];
  measurements: Record<string, number | boolean>;
};

export type EccentricNativeInvariantId =
  | "one-causal-transect"
  | "distinct-continental-histories"
  | "legal-directed-drainage"
  | "sea-dominated-crossroads"
  | "heart-march-contrast"
  | "resilient-outer-circuit"
  | "scarred-surviving-pangaea"
  | "authoritative-primary-rifts"
  | "one-major-per-isolated-realm"
  | "attached-peninsula-provinces"
  | "parent-arc-ancestry";

type BoundObject = GeographicObject & { attributes: NonNullable<GeographicObject["attributes"]> };
type BindingSet = { causes: NarrativeCausalObject[]; objects: BoundObject[]; complete: boolean };
type ComponentField = { ids: Int32Array; members: number[][] };

const LAND = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain >= 2);
const WATER = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain < 2);
const DEEP_WATER = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain === 0);
const PASSABLE = (map: Civ5Map, index: number) => Boolean(map.tiles[index] && map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2 && map.tiles[index].wonder === 255);

function proof(ok: boolean, evidence: string[], objects: readonly GeographicObject[] = [], measurements: NarrativeNativeEccentricProofFacts["measurements"] = {}): NarrativeNativeEccentricProofFacts {
  return { ok, evidence, objectIds: [...new Set(objects.map((object) => object.id))], measurements };
}

function roleOf(object: GeographicObject) {
  return String(object.attributes?.role ?? object.attributes?.relationship ?? "");
}

function validUniqueIndices(map: Civ5Map, object: GeographicObject) {
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

function validIndices(map: Civ5Map, indices: readonly number[]) {
  return [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0 && index < map.tiles.length))];
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

function share(map: Civ5Map, indices: readonly number[], predicate: (index: number) => boolean) {
  const valid = validIndices(map, indices);
  return valid.filter(predicate).length / Math.max(1, valid.length);
}

function overlapShare(one: readonly number[], two: readonly number[]) {
  const left = new Set(one);
  const right = new Set(two);
  let overlap = 0;
  for (const index of left) if (right.has(index)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function limitedOverlap(objects: readonly GeographicObject[], maximum: number) {
  return objects.every((one, index) => objects.slice(index + 1).every((two) => overlapShare(one.tileIndices, two.tileIndices) <= maximum));
}

function connectedShare(map: Civ5Map, source: readonly number[], predicate: (index: number) => boolean = () => true) {
  const pending = new Set(validIndices(map, source).filter(predicate));
  const total = pending.size;
  let largest = 0;
  while (pending.size) {
    const origin = pending.values().next().value as number;
    pending.delete(origin);
    const queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) if (pending.delete(next)) queue.push(next);
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
  let total = 0;
  for (const index of object.tileIndices) if (index >= 0 && index < field.ids.length && predicate(index) && field.ids[index] >= 0) {
    total += 1;
    counts.set(field.ids[index], (counts.get(field.ids[index]) ?? 0) + 1);
  }
  const winner = [...counts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
  return { id: winner?.[0] ?? -1, share: winner ? winner[1] / Math.max(1, total) : 0, count: winner?.[1] ?? 0, total };
}

function exactRoleBindings(map: Civ5Map, adapter: NarrativeAdapterEvidence, role: string): BindingSet {
  const causes = adapter.causalObjects.filter((cause) => cause.retained && cause.role === role);
  const objects: BoundObject[] = [];
  let complete = causes.length > 0;
  for (const cause of causes) {
    const matches = (map.structure?.objects ?? []).filter((object) => object.id === cause.nativeObjectId);
    if (matches.length !== 1) { complete = false; continue; }
    const object = matches[0];
    if (object.attributes?.nativeNarrative !== true || roleOf(object) !== cause.role
      || object.semanticId !== `narrative:${cause.id}` || !validUniqueIndices(map, object)) { complete = false; continue; }
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
    if (object.attributes?.nativeNarrative !== true || roleOf(object) !== cause.role
      || object.semanticId !== `narrative:${cause.id}` || !validUniqueIndices(map, object)) continue;
    result.set(cause.id, object as BoundObject);
  }
  return result;
}

function pathEndpoints(path: BoundObject, bindings: Map<string, BoundObject>) {
  const from = bindings.get(String(path.attributes.from ?? ""));
  const to = bindings.get(String(path.attributes.to ?? ""));
  return from && to && from.id !== to.id ? { from, to } : undefined;
}

function validPath(map: Civ5Map, path: BoundObject, bindings: Map<string, BoundObject>, predicate: (index: number) => boolean, radius = 1) {
  const endpoints = pathEndpoints(path, bindings);
  return Boolean(endpoints && path.tileIndices.length > 0 && path.tileIndices.every(predicate)
    && connectedShare(map, path.tileIndices) === 1
    && touches(map, path.tileIndices, endpoints!.from.tileIndices, radius)
    && touches(map, path.tileIndices, endpoints!.to.tileIndices, radius));
}

/** A causal relationship must be a line with one physical terminus at each exact endpoint, not a labelled field blob. */
function endpointTerminatingSpine(
  map: Civ5Map,
  path: BoundObject,
  bindings: Map<string, BoundObject>,
  predicate: (index: number) => boolean,
  radius = 1,
) {
  const endpoints = pathEndpoints(path, bindings);
  if (!endpoints || !validPath(map, path, bindings, predicate, radius)) return false;
  if (path.tileIndices.length === 1) {
    return touches(map, path.tileIndices, endpoints.from.tileIndices, radius)
      && touches(map, path.tileIndices, endpoints.to.tileIndices, radius);
  }
  const members = new Set(path.tileIndices);
  const degree = new Map(path.tileIndices.map((index) => [index, neighbors(index, map).filter((next) => members.has(next)).length]));
  if ([...degree.values()].some((value) => value > 2)) return false;
  const termini = path.tileIndices.filter((index) => (degree.get(index) ?? 0) === 1);
  if (termini.length !== 2) return false;
  const direct = touches(map, [termini[0]], endpoints.from.tileIndices, radius)
    && touches(map, [termini[1]], endpoints.to.tileIndices, radius);
  const reverse = touches(map, [termini[1]], endpoints.from.tileIndices, radius)
    && touches(map, [termini[0]], endpoints.to.tileIndices, radius);
  return direct || reverse;
}

function realEdgeTile(map: Civ5Map, index: number) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  return y === 0 || y === map.height - 1 || !map.wraps && (x === 0 || x === map.width - 1);
}

function blockerEncloses(map: Civ5Map, interior: readonly number[], blocker: ReadonlySet<number>) {
  const starts = validIndices(map, interior).filter((index) => !blocker.has(index));
  if (!starts.length) return false;
  const queue = [...starts];
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (realEdgeTile(map, queue[cursor])) return false;
    for (const next of neighbors(queue[cursor], map)) {
      if (blocker.has(next) || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return true;
}

type DirectedRiverFacts = {
  ok: boolean;
  edgeCount: number;
  sourceTiles: number[];
  outletTiles: number[];
};

/**
 * Rebuild the exact path-owned Civ V edge graph with the shared canonical
 * river decoder. Clearing non-path owners is intentional: a relationship
 * cannot borrow an adjacent tributary or trunk merely because both belong to
 * the same larger river system.
 */
function directedRiverFacts(map: Civ5Map, ownerTiles: readonly number[]): DirectedRiverFacts {
  const owners = new Set(validIndices(map, ownerTiles));
  if (!owners.size) return { ok: false, edgeCount: 0, sourceTiles: [], outletTiles: [] };
  const scopedTiles = map.tiles.map((tile, index) => owners.has(index) || tile.river === 0 ? tile : { ...tile, river: 0 });
  const systems = reconstructCiv5RiverEdgeSystems({ width: map.width, height: map.height, wraps: map.wraps, tiles: scopedTiles });
  const coveredOwners = new Set(systems.flatMap((system) => system.ownerIndices));
  const system = systems.length === 1 ? systems[0] : undefined;
  return {
    ok: Boolean(system)
      && [...owners].every((owner) => coveredOwners.has(owner))
      && system!.edgeCount >= 2
      && system!.acyclic
      && system!.sourceVertices.length >= 1
      && system!.outletVertices.length === 1
      && system!.directedToOutlet,
    edgeCount: system?.edgeCount ?? systems.reduce((sum, candidate) => sum + candidate.edgeCount, 0),
    sourceTiles: system?.sourceTileIndices ?? [],
    outletTiles: system?.outletTileIndices ?? [],
  };
}

function actualLargestLandComponent(map: Civ5Map) {
  const field = components(map, (index) => LAND(map, index));
  const largest = field.members.reduce((best, member, id) => member.length > best.members.length ? { id, members: member } : best, { id: -1, members: [] as number[] });
  return { ...largest, field, share: largest.members.length / Math.max(1, map.tiles.filter((tile) => tile.terrain >= 2).length) };
}

function objectValue(map: Civ5Map, object: GeographicObject) {
  return object.tileIndices.reduce((sum, index) => {
    const tile = map.tiles[index];
    if (!tile || tile.terrain < 2) return sum;
    return sum + (tile.resource !== 255 ? 2 : 0) + (tile.wonder !== 255 ? 4 : 0) + (tile.terrain === 2 ? 1 : tile.terrain === 3 ? 0.7 : 0.25);
  }, 0) / Math.max(1, object.tileIndices.length);
}

function edgeTile(map: Civ5Map, index: number) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  return x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
}

function waterFlankedShare(map: Civ5Map, indices: readonly number[]) {
  return share(map, indices, (index) => {
    const water = neighbors(index, map).filter((neighbor) => WATER(map, neighbor));
    if (water.length < 2) return false;
    // A curved or diagonal canal is still water-flanked. Test angular
    // separation in the hex graph instead of assuming both shores lie on the
    // global east/west axis.
    return water.length >= 2;
  });
}

export function proveEcologicalTransectSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const roles = ["COAST", "RIVER_MARSH", "LIVING_PLAIN", "MOUNTAIN_WALL", "RAIN_SHADOW"] as const;
  const stages = roles.map((role) => exactRoleBindings(map, adapter, role));
  const transitions = exactRoleBindings(map, adapter, "CAUSAL_TRANSITION");
  const rivers = exactRoleBindings(map, adapter, "LIVING_RIVER");
  const complete = [...stages, transitions, rivers].every((set) => set.complete)
    && stages.every((set) => set.objects.length === 1) && transitions.objects.length === 4 && rivers.objects.length === 1;
  const stage = stages.map((set) => set.objects[0]);
  const effects = stage.length === 5 && stage.every(Boolean)
    && stage[0].tileIndices.every((index) => LAND(map, index))
    && share(map, stage[0].tileIndices, (index) => neighbors(index, map).some((next) => WATER(map, next))) >= 0.2
    && stage[1].tileIndices.every((index) => LAND(map, index) && (map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature)))
    && stage[2].tileIndices.every((index) => LAND(map, index) && map.tiles[index].elevation < 2)
    && stage[3].tileIndices.every((index) => LAND(map, index) && map.tiles[index].elevation > 0)
    && stage[4].tileIndices.every((index) => LAND(map, index) && [3, 4].includes(map.tiles[index].terrain));
  const columns = stage.map((object) => object.tileIndices.reduce((sum, index) => sum + index % map.width, 0) / object.tileIndices.length);
  const orderTolerance = Math.max(1, map.width * 0.06);
  const forwardSteps = columns.slice(1).filter((column, index) => column > columns[index]).length;
  const ordered = columns.length === 5
    && columns.every((column, index) => index === 0 || column >= columns[index - 1] - orderTolerance)
    && forwardSteps >= 3
    && columns[4] - columns[0] >= Math.max(4, map.width * 0.42);
  const validTransitions = transitions.objects.filter((path) => validPath(map, path, bindings, (index) => LAND(map, index), 1));
  const transitionOverlap = limitedOverlap(validTransitions, 0.5);
  const stageOverlap = limitedOverlap(stage.filter(Boolean), 0.35);
  const chainConnected = connectedShare(map, [...stage.filter(Boolean), ...validTransitions].flatMap((object) => object.tileIndices), (index) => LAND(map, index)) >= 0.8;
  const validRiver = rivers.objects.find((object) => {
    const directed = directedRiverFacts(map, object.tileIndices);
    return object.tileIndices.every((index) => LAND(map, index) && map.tiles[index].river > 0)
      && validPath(map, object, bindings, (index) => LAND(map, index) && map.tiles[index].river > 0, 2)
      && directed.ok
      && directed.sourceTiles.some((index) => map.tiles[index].elevation === 2 && touches(map, [index], stage[3]?.tileIndices ?? [], 2))
      && directed.outletTiles.some((index) => WATER(map, index) && touches(map, [index], stage[0]?.tileIndices ?? [], 2))
      && touches(map, object.tileIndices, stage[1]?.tileIndices ?? [], 1);
  });
  const ok = complete && effects && ordered && stageOverlap && transitionOverlap && chainConnected
    && validTransitions.length === transitions.objects.length && Boolean(validRiver);
  return proof(ok, [`The final transect has ${validTransitions.length}/4 exact, limited-overlap transitions at mean columns ${columns.map((column) => column.toFixed(1)).join(" → ")}, spans ${Math.round((columns[4] ?? 0) - (columns[0] ?? 0))} columns with ${forwardSteps}/4 forward stage shifts, and retains ${validRiver ? 1 : 0} directed mountain-to-coast river intersecting the marsh.`], [...stage.filter(Boolean), ...validTransitions, ...(validRiver ? [validRiver] : [])], { ordered, effectFaithful: effects, stageOverlap, transitionOverlap, chainConnected, transitions: validTransitions.length, encodedRiver: Boolean(validRiver) });
}

export function proveContinentalHistoriesSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const histories = exactRoleBindings(map, adapter, "GEOLOGIC_HISTORY");
  const active = exactRoleBindings(map, adapter, "ACTIVE_MARGIN");
  const rifts = exactRoleBindings(map, adapter, "RIFT_MARGIN");
  const land = components(map, (index) => LAND(map, index));
  const faithful = histories.objects.flatMap((object) => {
    if (connectedShare(map, object.tileIndices, (index) => LAND(map, index)) < 0.8 || share(map, object.tileIndices, (index) => LAND(map, index)) < 0.9) return [];
    const effect = String(object.attributes.effect ?? "");
    const effectFaithful = effect === "RIDGE" || effect === "VOLCANIC"
      ? share(map, object.tileIndices, (index) => map.tiles[index].elevation > 0) >= 0.2
      : effect === "LOWLAND"
        ? share(map, object.tileIndices, (index) => map.tiles[index].elevation < 2) >= 0.85
        : effect === "DRY"
          ? share(map, object.tileIndices, (index) => [3, 4].includes(map.tiles[index].terrain)) >= 0.45
          : effect === "WET"
            ? share(map, object.tileIndices, (index) => map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature)) >= 0.45
            : true;
    if (!effectFaithful) return [];
    const component = dominantComponent(object, land, (index) => PASSABLE(map, index));
    return component.share >= 0.8 && component.id >= 0 && land.members[component.id].filter((index) => PASSABLE(map, index)).length >= 6
      ? [{ object, component: component.id }]
      : [];
  });
  const distinct = new Set(faithful.map((entry) => entry.component)).size === faithful.length
    && faithful.every((one, index) => faithful.slice(index + 1).every((two) => overlapShare(one.object.tileIndices, two.object.tileIndices) === 0));
  const validActive = active.objects.filter((path) => validPath(map, path, bindings, (index) => LAND(map, index), 2) && share(map, path.tileIndices, (index) => map.tiles[index].elevation > 0) >= 0.15);
  const validRifts = rifts.objects.filter((path) => validPath(map, path, bindings, (index) => WATER(map, index)));
  const effects = new Set(faithful.map((entry) => String(entry.object.attributes.effect ?? "")));
  const margins = [...validActive, ...validRifts];
  const marginEndpointsDistinct = margins.every((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints) return false;
    const from = faithful.find((entry) => entry.object.id === endpoints.from.id);
    const to = faithful.find((entry) => entry.object.id === endpoints.to.id);
    return Boolean(from && to && from.component !== to.component);
  });
  const ok = histories.complete && active.complete && rifts.complete && faithful.length >= 3
    && faithful.length === histories.objects.length && effects.size >= 3 && distinct
    && validActive.length === active.objects.length && validRifts.length === rifts.objects.length
    && marginEndpointsDistinct && limitedOverlap(margins, 0.8);
  return proof(ok, [`All ${faithful.length}/${histories.objects.length} effect-faithful geological histories occupy distinct viable land components with ${effects.size} material signatures; all ${validActive.length} active ridge-island and ${validRifts.length} rift-water margins terminate on their exact different-history endpoints.`], [...faithful.map((entry) => entry.object), ...margins], { histories: faithful.length, effects: effects.size, activeMargins: validActive.length, riftMargins: validRifts.length, distinct, marginEndpointsDistinct });
}

export function proveDirectedDrainageSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const heads = exactRoleBindings(map, adapter, "HEADWATER");
  const outlets = exactRoleBindings(map, adapter, "OUTLET");
  const paths = exactRoleBindings(map, adapter, "FLOWS_TO");
  const valid = paths.objects.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "HEADWATER" || roleOf(endpoints.to) !== "OUTLET") return [];
    const directed = directedRiverFacts(map, path.tileIndices);
    if (!directed.ok || !validPath(map, path, bindings, (index) => LAND(map, index) && map.tiles[index].river > 0, 2)) return [];
    const mountainFed = directed.sourceTiles.some((index) => map.tiles[index].elevation === 2 && touches(map, [index], endpoints.from.tileIndices, 2));
    const legalOutlet = directed.outletTiles.some((index) => WATER(map, index) && touches(map, [index], endpoints.to.tileIndices, 2));
    return mountainFed && legalOutlet ? [{ path, head: endpoints.from, outlet: endpoints.to, directed }] : [];
  });
  const coveredHeads = new Set(valid.map((entry) => entry.head.id));
  const coveredOutlets = new Set(valid.map((entry) => entry.outlet.id));
  const completeDrainage = coveredHeads.size === heads.objects.length && coveredOutlets.size === outlets.objects.length
    && heads.objects.every((head) => coveredHeads.has(head.id)) && outlets.objects.every((outlet) => coveredOutlets.has(outlet.id));
  const ok = heads.complete && outlets.complete && paths.complete && valid.length > 0
    && valid.length === paths.objects.length && completeDrainage;
  return proof(ok, [`${valid.length}/${paths.objects.length} exact retained trunk paths rebuild as acyclic directed Civ V edge networks; all ${coveredHeads.size}/${heads.objects.length} mountain-fed headwaters drain to all ${coveredOutlets.size}/${outlets.objects.length} exact legal water outlets.`], [...heads.objects, ...outlets.objects, ...valid.map((entry) => entry.path)], { trunks: paths.objects.length, validTrunks: valid.length, coveredHeads: coveredHeads.size, coveredOutlets: coveredOutlets.size, completeDrainage });
}

function enclosedWaterObject(map: Civ5Map, object: BoundObject, water: ComponentField) {
  if (!object.tileIndices.every((index) => WATER(map, index)) || connectedShare(map, object.tileIndices) !== 1) return { ok: false, component: -1 };
  const component = water.ids[object.tileIndices[0]];
  return { ok: component >= 0 && object.tileIndices.every((index) => water.ids[index] === component) && !water.members[component].some((index) => edgeTile(map, index)), component };
}

export function proveInlandSeaCrossroadsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const seas = exactRoleBindings(map, adapter, "GREAT_INLAND_SEA");
  const straits = exactRoleBindings(map, adapter, "NARROW_STRAIT");
  const canals = exactRoleBindings(map, adapter, "CANAL_ISTHMUS");
  const water = components(map, (index) => WATER(map, index));
  const validSeas = seas.objects.map((object) => ({ object, ...enclosedWaterObject(map, object, water) })).filter((entry) => entry.ok);
  const spatiallyDistinctSeas = validSeas.filter((entry, index) => validSeas.slice(0, index)
    .every((other) => overlapShare(entry.object.tileIndices, other.object.tileIndices) < 0.05));
  const crossings = [...straits.objects, ...canals.objects].filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "GREAT_INLAND_SEA" || roleOf(endpoints.to) !== "GREAT_INLAND_SEA") return false;
    const from = validSeas.find((entry) => entry.object.id === endpoints.from.id);
    const to = validSeas.find((entry) => entry.object.id === endpoints.to.id);
    if (!from || !to || overlapShare(from.object.tileIndices, to.object.tileIndices) > 0) return false;
    const predicate = roleOf(path) === "NARROW_STRAIT" ? (index: number) => WATER(map, index) : (index: number) => PASSABLE(map, index);
    if (!validPath(map, path, bindings, predicate, 1) || path.tileIndices.length > 2) return false;
    if (roleOf(path) === "CANAL_ISTHMUS") {
      const removed = new Set(path.tileIndices);
      const passable = components(map, (index) => PASSABLE(map, index) && !removed.has(index));
      const adjacentSides = passable.members.filter((members) => members.length >= 3
        && members.some((index) => neighbors(index, map).some((next) => removed.has(next))));
      return adjacentSides.length >= 2 && waterFlankedShare(map, path.tileIndices) >= 0.5;
    }
    const removed = new Set(path.tileIndices);
    const fromWater = from.object.tileIndices.filter((index) => !removed.has(index));
    const toWater = new Set(to.object.tileIndices.filter((index) => !removed.has(index)));
    const queue = [...fromWater];
    const reached = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (removed.has(next) || reached.has(next) || !WATER(map, next)) continue;
      reached.add(next);
      queue.push(next);
    }
    return ![...toWater].some((index) => reached.has(index));
  });
  const principalSeaTiles = new Set(spatiallyDistinctSeas.flatMap((entry) => entry.object.tileIndices));
  const totalWater = map.tiles.filter((tile) => tile.terrain < 2).length;
  const principalSeaShare = principalSeaTiles.size / Math.max(1, totalWater);
  const minimumPrincipalSea = Math.max(3, Math.floor(totalWater * 0.025));
  const viablePrincipalSeas = spatiallyDistinctSeas.every((entry) => entry.object.tileIndices.length >= minimumPrincipalSea);
  const landShare = (map.tiles.length - totalWater) / Math.max(1, map.tiles.length);
  const allSeas = spatiallyDistinctSeas.length === seas.objects.length && validSeas.length === seas.objects.length;
  const allCrossings = crossings.length === straits.objects.length + canals.objects.length;
  const crossingFormRelaxed = adapter.relaxations.some((message) => /one dominant crossing form|strait or canal isthmus/i.test(message));
  const marginalLandRelaxed = adapter.relaxations.some((message) => /land becomes less scarce|marginal land/i.test(message));
  const authoredCrossings = adapter.causalObjects.filter((cause) => cause.role === "NARROW_STRAIT" || cause.role === "CANAL_ISTHMUS").length;
  const completeCrossingInventory = crossingFormRelaxed || straits.objects.length + canals.objects.length === authoredCrossings;
  const crossingBindingsComplete = crossingFormRelaxed
    ? straits.complete || canals.complete
    : straits.complete && canals.complete;
  const minimumPrincipalShare = marginalLandRelaxed ? 0.3 : 0.47;
  const ok = seas.complete && crossingBindingsComplete && allSeas && spatiallyDistinctSeas.length >= 2
    && viablePrincipalSeas && allCrossings && completeCrossingInventory && crossings.length >= 1
    && limitedOverlap(crossings, 0) && principalSeaShare >= minimumPrincipalShare && (marginalLandRelaxed ? landShare <= 0.65 : landShare <= 0.55);
  return proof(ok, [
    `All ${spatiallyDistinctSeas.length}/${seas.objects.length} exact principal seas are connected, topologically enclosed away from the map edge, materially distinct, and at least ${minimumPrincipalSea} tiles, accounting for ${Math.round(principalSeaShare * 100)}% of final water; all ${crossings.length}/${straits.objects.length + canals.objects.length} retained 1–2 tile crossings bind their actual shores${crossingFormRelaxed ? " under the disclosed single-form relaxation" : ` across the complete ${authoredCrossings}-cause inventory`}; land occupies ${Math.round(landShare * 100)}%${marginalLandRelaxed ? " under the disclosed marginal-land relaxation" : ""} inside an irregular enclosing framework.`,
    ...(!ok ? [`Strict Crossroads predicates: seaBindings=${seas.complete}; allSeas=${allSeas}; viableSeas=${viablePrincipalSeas}; crossingBindings=${crossingBindingsComplete}; allCrossings=${allCrossings}; completeInventory=${completeCrossingInventory}; crossingOverlap=${limitedOverlap(crossings, 0)}; principalShare=${principalSeaShare.toFixed(3)}/${minimumPrincipalShare}; landShare=${landShare.toFixed(3)}.`] : []),
  ], [...spatiallyDistinctSeas.map((entry) => entry.object), ...crossings], { enclosedSeas: spatiallyDistinctSeas.length, allSeas, viablePrincipalSeas, minimumPrincipalSea, crossings: crossings.length, allCrossings, crossingBindingsComplete, completeCrossingInventory, minimumPrincipalShare, principalSeaShare, landShare, marginalLandRelaxed, topologicallyEnclosed: allSeas });
}

export function proveMythicHeartMarchSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const hearts = exactRoleBindings(map, adapter, "MYTHIC_HEART");
  const marches = exactRoleBindings(map, adapter, "BARREN_MARCH");
  const paths = exactRoleBindings(map, adapter, "ENSCONCED_BY");
  const pairs = paths.objects.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints) return [];
    const heart = roleOf(endpoints.from) === "MYTHIC_HEART" ? endpoints.from : roleOf(endpoints.to) === "MYTHIC_HEART" ? endpoints.to : undefined;
    const march = roleOf(endpoints.from) === "BARREN_MARCH" ? endpoints.from : roleOf(endpoints.to) === "BARREN_MARCH" ? endpoints.to : undefined;
    const heartId = heart?.id.replace(/^narrative-/, "") ?? "";
    if (!heart || !march || march.attributes.parent !== heartId
      || !endpointTerminatingSpine(map, path, bindings, (index) => LAND(map, index), 1)
      || connectedShare(map, heart.tileIndices, (index) => LAND(map, index)) < 0.8
      || connectedShare(map, march.tileIndices, (index) => LAND(map, index)) < 0.8
      || overlapShare(heart.tileIndices, march.tileIndices) > 0) return [];
    const boundary = expand(map, heart.tileIndices, 1);
    for (const index of heart.tileIndices) boundary.delete(index);
    const terrestrialBoundary = [...boundary].filter((index) => LAND(map, index));
    const marchMembers = new Set(march.tileIndices);
    const marchContactShare = terrestrialBoundary.filter((index) => marchMembers.has(index)).length / Math.max(1, terrestrialBoundary.length);
    const bufferShare = terrestrialBoundary.filter((index) => marchMembers.has(index)
      || map.tiles[index].elevation === 2 || map.tiles[index].terrain === 4).length / Math.max(1, terrestrialBoundary.length);
    const effect = String(march.attributes.effect ?? "");
    const effectFaithful = effect === "RIDGE"
      ? share(map, march.tileIndices, (index) => LAND(map, index) && map.tiles[index].elevation > 0) >= 0.6
      : effect === "BARREN" && march.tileIndices.every((index) => LAND(map, index)
        && map.tiles[index].feature === 255 && map.tiles[index].resource === 255 && map.tiles[index].wonder === 255);
    const contrast = objectValue(map, heart) - objectValue(map, march);
    return marchContactShare >= 0.3 && bufferShare >= 0.5 && effectFaithful && contrast >= 0.5
      ? [{ heart, march, path, marchContactShare, bufferShare, contrast }] : [];
  });
  const usedHearts = new Set(pairs.map((pair) => pair.heart.id));
  const usedMarches = new Set(pairs.map((pair) => pair.march.id));
  const distinctRegions = limitedOverlap(hearts.objects, 0.1) && limitedOverlap(marches.objects, 0.2);
  const completePairs = pairs.length === paths.objects.length && pairs.length === hearts.objects.length && pairs.length === marches.objects.length
    && usedHearts.size === hearts.objects.length && usedMarches.size === marches.objects.length;
  const ok = hearts.complete && marches.complete && paths.complete && hearts.objects.length >= 3
    && completePairs && distinctRegions;
  return proof(ok, [`All ${pairs.length}/${paths.objects.length} exact heart–march relationships pair one distinct connected valuable heart with one effect-faithful enclosing march, ≥30% direct terrestrial march contact, ≥50% hostile/mountain buffering, and ≥0.5 recomputed value contrast.`], pairs.flatMap((pair) => [pair.heart, pair.march, pair.path]), { pairs: pairs.length, completePairs, distinctRegions, minimumContactShare: pairs.length ? Math.min(...pairs.map((pair) => pair.marchContactShare)) : 0, minimumContrast: pairs.length ? Math.min(...pairs.map((pair) => pair.contrast)) : 0, minimumBufferShare: pairs.length ? Math.min(...pairs.map((pair) => pair.bufferShare)) : 0 });
}

export function proveEncirclingCircuitSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const lands = exactRoleBindings(map, adapter, "ENCLOSING_LAND");
  const seas = exactRoleBindings(map, adapter, "INLAND_SEA");
  const paths = exactRoleBindings(map, adapter, "OUTER_CIRCUIT");
  const water = components(map, (index) => WATER(map, index));
  const enclosed = seas.objects.filter((object) => enclosedWaterObject(map, object, water).ok);
  const validPaths = paths.objects.filter((path) => endpointTerminatingSpine(map, path, bindings, (index) => PASSABLE(map, index), 1));
  const degree = new Map<string, number>();
  for (const path of validPaths) {
    const endpoints = pathEndpoints(path, bindings)!;
    degree.set(endpoints.from.id, (degree.get(endpoints.from.id) ?? 0) + 1);
    degree.set(endpoints.to.id, (degree.get(endpoints.to.id) ?? 0) + 1);
  }
  const cycle = lands.objects.length >= 4 && validPaths.length === lands.objects.length
    && lands.objects.every((object) => degree.get(object.id) === 2)
    && connectedShare(map, [...lands.objects, ...validPaths].flatMap((object) => object.tileIndices), (index) => PASSABLE(map, index)) >= 0.75;
  const relationResilience = validPaths.every((removed) => {
    const remaining = validPaths.filter((path) => path.id !== removed.id);
    const adjacency = new Map(lands.objects.map((land) => [land.id, new Set<string>()]));
    for (const path of remaining) {
      const endpoints = pathEndpoints(path, bindings)!;
      adjacency.get(endpoints.from.id)?.add(endpoints.to.id);
      adjacency.get(endpoints.to.id)?.add(endpoints.from.id);
    }
    const queue = [lands.objects[0]?.id ?? ""];
    const reached = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of adjacency.get(queue[cursor]) ?? []) if (!reached.has(next)) {
      reached.add(next);
      queue.push(next);
    }
    return reached.size === lands.objects.length;
  });
  const nodeInterfaceFacts = lands.objects.map((land) => {
    const contacts = validPaths.flatMap((path) => {
      const endpoints = pathEndpoints(path, bindings)!;
      if (endpoints.from.id !== land.id && endpoints.to.id !== land.id) return [];
      if (path.tileIndices.length === 1) return path.tileIndices;
      const members = new Set(path.tileIndices);
      const termini = path.tileIndices.filter((index) => neighbors(index, map).filter((next) => members.has(next)).length === 1);
      const other = endpoints.from.id === land.id ? endpoints.to : endpoints.from;
      const candidates = termini.filter((index) => touches(map, [index], land.tileIndices, 1));
      const exclusive = candidates.filter((index) => !touches(map, [index], other.tileIndices, 1));
      return (exclusive[0] ?? candidates[0]) === undefined ? [] : [exclusive[0] ?? candidates[0]];
    });
    if (contacts.length !== 2) return { id: land.id, contacts: contacts.length, coherent: false };
    const allowed = expand(map, land.tileIndices, 1);
    const queue = [contacts[0]];
    const reached = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (!allowed.has(next) || reached.has(next) || !PASSABLE(map, next)) continue;
      reached.add(next);
      queue.push(next);
    }
    return { id: land.id, contacts: contacts.length, coherent: reached.has(contacts[1]) };
  });
  const coherentNodeInterfaces = nodeInterfaceFacts.every((fact) => fact.coherent);
  // With coherent physical interfaces at every node, the exact edge-removal
  // audit above is also the physical one-choke audit: every surviving graph
  // edge is an endpoint-terminating passable spine, not an abstract label.
  const physicalResilience = relationResilience && coherentNodeInterfaces;
  const circuitTiles = new Set([...lands.objects, ...validPaths].flatMap((object) => object.tileIndices));
  const spatialRing = enclosed.length === seas.objects.length && enclosed.every((sea) => blockerEncloses(map, sea.tileIndices, circuitTiles));
  const circuitNodeTiles = new Set(lands.objects.flatMap((object) => object.tileIndices));
  const limitedPathOverlap = limitedOverlap(validPaths.map((path) => ({ ...path, tileIndices: path.tileIndices.filter((index) => !circuitNodeTiles.has(index)) })), 0.2);
  const ok = lands.complete && seas.complete && paths.complete && cycle && enclosed.length === seas.objects.length
    && relationResilience && physicalResilience && spatialRing;
  return proof(ok, [`The exact outer graph has ${lands.objects.length} land nodes and ${validPaths.length}/${paths.objects.length} endpoint-terminating traversable edges; every node has degree two with a coherent physical interface, all ${enclosed.length}/${seas.objects.length} bound seas lie inside the spatial circuit, and the exact relationship graph remains connected after removal of any one route; cycle=${cycle}, limited overlap=${limitedPathOverlap}, relation resilience=${relationResilience}, coherent interfaces=${coherentNodeInterfaces}, physical resilience=${physicalResilience}, spatial enclosure=${spatialRing}.`], [...lands.objects, ...validPaths, ...enclosed], { nodes: lands.objects.length, paths: validPaths.length, cycle, enclosedWaters: enclosed.length, limitedPathOverlap, relationResilience, coherentNodeInterfaces, physicalResilience, spatialRing });
}

export function proveScarredPangaeaSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const continents = exactRoleBindings(map, adapter, "DOMINANT_CONTINENT");
  const lobes = exactRoleBindings(map, adapter, "ASTRAL_LOBE");
  const bonds = exactRoleBindings(map, adapter, "CONTINENT_BOND");
  const scars = exactRoleBindings(map, adapter, "ALIEN_SCAR");
  const largest = actualLargestLandComponent(map);
  const dominant = continents.objects.find((object) => {
    const component = dominantComponent(object, largest.field, (index) => LAND(map, index));
    return component.id === largest.id && component.share >= 0.8 && connectedShare(map, object.tileIndices, (index) => LAND(map, index)) >= 0.8;
  });
  const broadBonds = bonds.objects.filter((path) => {
    const endpoints = pathEndpoints(path, bindings);
    const lobe = endpoints && (roleOf(endpoints.from) === "ASTRAL_LOBE" ? endpoints.from : roleOf(endpoints.to) === "ASTRAL_LOBE" ? endpoints.to : undefined);
    const core = endpoints && (roleOf(endpoints.from) === "DOMINANT_CONTINENT" ? endpoints.from : roleOf(endpoints.to) === "DOMINANT_CONTINENT" ? endpoints.to : undefined);
    return Boolean(lobe && core && lobe.attributes.parent === core.id.replace(/^narrative-/, "")
      && endpointTerminatingSpine(map, path, bindings, (index) => LAND(map, index), 1) && path.tileIndices.length >= 3
      && path.tileIndices.every((index) => largest.field.ids[index] === largest.id));
  });
  const validScars = scars.objects.filter((path) => {
    const waterScar = String(path.attributes.effect ?? "") === "WATER_PATH";
    const faithful = waterScar ? path.tileIndices.every((index) => WATER(map, index)) : path.tileIndices.every((index) => LAND(map, index) && map.tiles[index].elevation > 0);
    const endpoints = pathEndpoints(path, bindings);
    return faithful && endpoints && roleOf(endpoints.from) === "ASTRAL_LOBE" && roleOf(endpoints.to) === "ASTRAL_LOBE"
      && endpointTerminatingSpine(map, path, bindings, waterScar ? (index) => WATER(map, index) : (index) => LAND(map, index) && map.tiles[index].elevation > 0, 1)
      && endpoints.from.tileIndices.some((index) => largest.field.ids[index] === largest.id)
      && endpoints.to.tileIndices.some((index) => largest.field.ids[index] === largest.id);
  });
  const distinctScars = limitedOverlap(validScars, 0.2);
  // Every lobe has its own exact terminal, while broad sutures may lawfully
  // share the first half of a route through the common continental core.
  // More than half overlap would cease to be a distinct surviving bond.
  const distinctBonds = limitedOverlap(broadBonds, 0.5);
  const bondedLobes = new Set(broadBonds.flatMap((path) => {
    const endpoints = pathEndpoints(path, bindings)!;
    return [roleOf(endpoints.from) === "ASTRAL_LOBE" ? endpoints.from.id : endpoints.to.id];
  }));
  const completeBonds = broadBonds.length === bonds.objects.length && bondedLobes.size === lobes.objects.length;
  const completeScars = validScars.length === scars.objects.length;
  const lobesOnDominant = lobes.objects.every((object) => object.tileIndices.some((index) => largest.field.ids[index] === largest.id));
  const ok = continents.complete && lobes.complete && bonds.complete && scars.complete && continents.objects.length === 1
    && Boolean(dominant) && largest.share >= 0.72 && lobes.objects.length >= 3 && lobesOnDominant
    && completeBonds && distinctBonds && completeScars && validScars.length >= 2 && distinctScars;
  return proof(ok, [`The actual largest land component retains ${Math.round(largest.share * 100)}% of land and every one of its ${lobes.objects.length} exact lobes through ${broadBonds.length}/${bonds.objects.length} distinct endpoint-terminating broad bonds; all ${validScars.length}/${scars.objects.length} scars are distinct, effect-faithful spines between exact lobes.`], [...(dominant ? [dominant] : []), ...lobes.objects, ...broadBonds, ...validScars], { largestLandShare: largest.share, lobes: lobes.objects.length, lobesOnDominant, bonds: broadBonds.length, completeBonds, distinctBonds, scars: validScars.length, completeScars, distinctScars });
}

export function proveRiftLatticeSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const cells = exactRoleBindings(map, adapter, "VIABLE_RIFT_CELL");
  const primary = exactRoleBindings(map, adapter, "PRIMARY_RIFT");
  const secondary = exactRoleBindings(map, adapter, "SECONDARY_RIFT");
  const land = components(map, (index) => LAND(map, index));
  const cellFacts = cells.objects.map((object) => ({ object, component: dominantComponent(object, land, (index) => PASSABLE(map, index)) }));
  const coherent = cellFacts.filter((entry) => entry.component.count >= 3 && entry.component.share >= 0.8);
  const rejectedCells = cellFacts.filter((entry) => !coherent.includes(entry))
    .map((entry) => `${entry.object.id}[tiles=${entry.object.tileIndices.length},nativeFloor=${String(entry.object.attributes.retainedPassableCellFloor ?? "n/a")},passable=${entry.component.count},share=${entry.component.share.toFixed(2)}]`);
  const validRift = (path: BoundObject) => {
    const endpoints = pathEndpoints(path, bindings);
    if (!endpoints || !validPath(map, path, bindings, (index) => WATER(map, index), 1)
      || share(map, path.tileIndices, (index) => DEEP_WATER(map, index)) < 0.55) return false;
    const from = coherent.find((entry) => entry.object.id === endpoints.from.id);
    const to = coherent.find((entry) => entry.object.id === endpoints.to.id);
    return Boolean(from && to && from.component.id !== to.component.id);
  };
  const validPrimary = primary.objects.filter(validRift);
  const validSecondary = secondary.objects.filter(validRift);
  const distinctComponents = new Set(coherent.map((entry) => entry.component.id));
  const riftPaths = [...validPrimary, ...validSecondary];
  const distinctRifts = limitedOverlap(riftPaths, 0.8);
  const unequal = coherent.length >= 4 && Math.max(...coherent.map((entry) => entry.component.count)) >= Math.min(...coherent.map((entry) => entry.component.count)) * 1.2;
  const ok = cells.complete && primary.complete && secondary.complete && coherent.length >= 4
    && coherent.length === cells.objects.length && distinctComponents.size === coherent.length
    && validPrimary.length === primary.objects.length && validPrimary.length >= 2
    && validSecondary.length === secondary.objects.length && distinctRifts && unequal;
  return proof(ok, [`${coherent.length}/${cells.objects.length} exact rift cells retain coherent passable interiors in ${distinctComponents.size} distinct land components${rejectedCells.length ? `; rejected ${rejectedCells.join(", ")}` : ""}; all ${validPrimary.length} primary and ${validSecondary.length} secondary paths terminate on their exact opposing cell shores and retain at least 55% deep-ocean extent, and their capacities ${unequal ? "remain unequal" : "have collapsed"}.`], [...coherent.map((entry) => entry.object), ...riftPaths], { cells: coherent.length, distinctComponents: distinctComponents.size, primaryRifts: validPrimary.length, secondaryRifts: validSecondary.length, minimumDeepWaterShare: 0.55, distinctRifts, unequal });
}

export function proveLonelyRealmsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const realms = exactRoleBindings(map, adapter, "REALM");
  const isolation = exactRoleBindings(map, adapter, "ISOLATED_FROM");
  const bindings = exactBindingsByCause(map, adapter);
  const majors = map.startLocations.filter((start) => !start.cityState);
  const land = components(map, (index) => LAND(map, index));
  const realmFacts = realms.objects.map((object) => ({ object, component: dominantComponent(object, land, (index) => PASSABLE(map, index)) }))
    .filter((entry) => entry.component.count >= 6 && entry.component.share >= 0.8);
  const assignments = majors.map((start) => {
    const index = start.y * map.width + start.x;
    return realmFacts.filter((entry) => entry.object.tileIndices.includes(index));
  });
  const distinctComponents = new Set(realmFacts.map((entry) => entry.component.id));
  const preAstronomy = components(map, (index) => !DEEP_WATER(map, index));
  const preAstronomyComponents = new Set(realmFacts.map((entry) => preAstronomy.ids[entry.object.tileIndices.find((index) => LAND(map, index)) ?? -1]).filter((id) => id >= 0));
  const paths = isolation.objects.filter((path) => validPath(map, path, bindings, (index) => WATER(map, index), 2)
    && path.tileIndices.some((index) => DEEP_WATER(map, index)));
  const onePerRealm = assignments.length === realmFacts.length && assignments.every((matches) => matches.length === 1)
    && new Set(assignments.map((matches) => matches[0].object.id)).size === majors.length;
  const ok = realms.complete && isolation.complete && majors.length >= 2 && realmFacts.length === majors.length
    && distinctComponents.size === majors.length && preAstronomyComponents.size === majors.length
    && onePerRealm && paths.length === isolation.objects.length;
  return proof(ok, [`${majors.length} majors map bijectively to ${realmFacts.length} exact viable realm objects in ${distinctComponents.size} land and ${preAstronomyComponents.size} pre-Astronomy surface components; ${paths.length}/${isolation.objects.length} exact isolation relations are continuous water routes that cross the deep ocean.`], [...realmFacts.map((entry) => entry.object), ...paths], { majors: majors.length, realms: realmFacts.length, components: distinctComponents.size, preAstronomyComponents: preAstronomyComponents.size, onePerRealm, isolationPaths: paths.length });
}

function reachWithout(map: Civ5Map, origins: readonly number[], removed: ReadonlySet<number>) {
  const queue = validIndices(map, origins).filter((index) => PASSABLE(map, index) && !removed.has(index));
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (removed.has(next) || reached.has(next) || !PASSABLE(map, next)) continue;
    reached.add(next);
    queue.push(next);
  }
  return reached;
}

export function provePeninsulaAttachmentsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const backbones = exactRoleBindings(map, adapter, "CONTINENTAL_BACKBONE");
  const heads = exactRoleBindings(map, adapter, "PENINSULA_PROVINCE");
  const shared = exactRoleBindings(map, adapter, "SHARED_BACKBONE");
  const necks = exactRoleBindings(map, adapter, "PENINSULA_NECK");
  const maximumNeckLength = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(map.tiles.length) / 24)));
  const minimumHeadArea = Math.max(5, Math.round(Math.sqrt(map.tiles.length) / 3));
  const checks = { endpoints: 0, narrow: 0, connected: 0, headContact: 0, flanked: 0, headCapacity: 0, coastal: 0, remoteBackbone: 0, attached: 0, separated: 0 };
  const pairs = necks.objects.flatMap((neck) => {
    const endpoints = pathEndpoints(neck, bindings);
    if (!endpoints) return [];
    checks.endpoints += 1;
    const head = roleOf(endpoints.from) === "PENINSULA_PROVINCE" ? endpoints.from : roleOf(endpoints.to) === "PENINSULA_PROVINCE" ? endpoints.to : undefined;
    const backbone = roleOf(endpoints.from) === "CONTINENTAL_BACKBONE" ? endpoints.from : roleOf(endpoints.to) === "CONTINENTAL_BACKBONE" ? endpoints.to : undefined;
    if (!head || !backbone || head.attributes.parent !== backbone.id.replace(/^narrative-/, "")
      || neck.tileIndices.length > maximumNeckLength) return [];
    checks.narrow += 1;
    const neckMembers = new Set(neck.tileIndices);
    if (neck.tileIndices.some((index) => !PASSABLE(map, index)) || connectedShare(map, neck.tileIndices) !== 1
      || neck.tileIndices.some((index) => neighbors(index, map).filter((next) => neckMembers.has(next)).length > 2)) return [];
    checks.connected += 1;
    if (!touches(map, neck.tileIndices, head.tileIndices, 1)) return [];
    checks.headContact += 1;
    if (waterFlankedShare(map, neck.tileIndices) < 0.5) return [];
    checks.flanked += 1;
    if (head.tileIndices.filter((index) => PASSABLE(map, index)).length < minimumHeadArea) return [];
    checks.headCapacity += 1;
    if (share(map, head.tileIndices, (index) => neighbors(index, map).some((next) => WATER(map, next))) < 0.25) return [];
    checks.coastal += 1;
    const removed = new Set(neck.tileIndices);
    const localHead = expand(map, [...head.tileIndices, ...neck.tileIndices], 2);
    const remoteBackbone = backbone.tileIndices.filter((index) => PASSABLE(map, index) && !localHead.has(index));
    if (remoteBackbone.length < 3) return [];
    checks.remoteBackbone += 1;
    const attachedReach = reachWithout(map, head.tileIndices, new Set());
    const headReach = reachWithout(map, head.tileIndices, removed);
    const attached = remoteBackbone.some((index) => attachedReach.has(index));
    if (attached) checks.attached += 1;
    const separated = !remoteBackbone.some((index) => headReach.has(index));
    if (separated) checks.separated += 1;
    const separates = attached && separated;
    return separates ? [{ head, neck, backbone }] : [];
  });
  const distinctHeads = new Set(pairs.map((pair) => pair.head.id));
  const distinctNecks = new Set(pairs.map((pair) => pair.neck.id));
  const distinctHeadExtents = limitedOverlap(heads.objects, 0.1);
  const distinctNeckExtents = limitedOverlap(necks.objects, 0.2);
  const sharedPaths = shared.objects.filter((path) => endpointTerminatingSpine(map, path, bindings, (index) => PASSABLE(map, index), 1));
  const backboneField = components(map, (index) => PASSABLE(map, index));
  const backboneComponents = new Set(backbones.objects.flatMap((object) => {
    const component = dominantComponent(object, backboneField, (index) => PASSABLE(map, index));
    return component.count >= 3 && component.share >= 0.8 ? [component.id] : [];
  }));
  const completeAttachments = pairs.length === necks.objects.length && pairs.length === heads.objects.length
    && distinctHeads.size === heads.objects.length && distinctNecks.size === necks.objects.length;
  const sharedSystem = shared.objects.length > 0 && sharedPaths.length === shared.objects.length
    && backboneComponents.size === 1 && backbones.objects.length >= 1;
  const largest = actualLargestLandComponent(map);
  const ok = backbones.complete && heads.complete && shared.complete && necks.complete && heads.objects.length >= 3
    && completeAttachments && distinctHeadExtents && distinctNeckExtents && sharedSystem && largest.share >= 0.65;
  return proof(ok, [`Every one of the ${pairs.length}/${heads.objects.length} exact coastal heads retains at least ${minimumHeadArea} passable tiles and owns one distinct, endpoint-terminating, water-flanked articulation neck (bounded to ${maximumNeckLength} tiles at this scale); all ${sharedPaths.length}/${shared.objects.length} shared routes bind the one passable parent-backbone system, which retains ${Math.round(largest.share * 100)}% of land.`], [...pairs.flatMap((pair) => [pair.head, pair.neck, pair.backbone]), ...sharedPaths], { attachedHeads: distinctHeads.size, articulationNecks: pairs.length, completeAttachments, distinctHeadExtents, distinctNeckExtents, sharedSystem, sharedPaths: sharedPaths.length, largestLandShare: largest.share, maximumNeckLength, minimumHeadArea, ...checks });
}

function distanceAlong(map: Civ5Map, path: readonly number[], origins: readonly number[]) {
  const members = new Set(path);
  const queue = path.filter((index) => touches(map, [index], origins, 1));
  const distances = new Map(queue.map((index) => [index, 0]));
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (!members.has(next) || distances.has(next)) continue;
    distances.set(next, distances.get(queue[cursor])! + 1);
    queue.push(next);
  }
  return distances;
}

export function proveParentArcSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = exactBindingsByCause(map, adapter);
  const chains = exactRoleBindings(map, adapter, "CHAIN");
  const anchors = exactRoleBindings(map, adapter, "ANCHOR");
  const generics = exactRoleBindings(map, adapter, "GENERIC");
  const memberships = exactRoleBindings(map, adapter, "BELONGS_TO");
  const arcs = exactRoleBindings(map, adapter, "FOLLOWS_ARC");
  const children = [...anchors.objects, ...generics.objects];
  const land = components(map, (index) => LAND(map, index));
  const systemFailures: string[] = [];
  const systems = chains.objects.flatMap((chain) => {
    const id = chain.id.replace(/^narrative-/, "");
    const members = children.filter((child) => child.attributes.parent === id);
    const arc = arcs.objects.find((candidate) => {
      const endpoints = pathEndpoints(candidate, bindings);
      return endpoints && members.includes(endpoints.from) && members.includes(endpoints.to)
        && validPath(map, candidate, bindings, () => true, 1) && candidate.tileIndices.length >= 3
        && share(map, candidate.tileIndices, (index) => LAND(map, index)) <= 0.65;
    });
    if (!arc || members.length < 3 || !members.some((member) => roleOf(member) === "ANCHOR") || !members.some((member) => roleOf(member) === "GENERIC")) { systemFailures.push(`${id}:arc-or-members`); return []; }
    const memberPaths = members.map((child) => memberships.objects.filter((path) => {
      const endpoints = pathEndpoints(path, bindings);
      return endpoints && endpoints.from.id === child.id && endpoints.to.id === chain.id
        && path.tileIndices.length > 0 && touches(map, path.tileIndices, child.tileIndices, 0)
        && touches(map, path.tileIndices, chain.tileIndices, 0);
    }));
    if (memberPaths.some((paths) => paths.length !== 1) || !limitedOverlap(members, 0)) { systemFailures.push(`${id}:${memberPaths.some((paths) => paths.length !== 1) ? "memberships" : "child-overlap"}`); return []; }
    const from = bindings.get(String(arc.attributes.from))!;
    const distances = distanceAlong(map, arc.tileIndices, from.tileIndices);
    const positions = members.map((child) => {
      const exact = arc.tileIndices.filter((index) => child.tileIndices.includes(index));
      const contacts = exact.length ? exact : arc.tileIndices.filter((index) => touches(map, [index], child.tileIndices, 1));
      return Math.min(...contacts.map((index) => distances.get(index) ?? Number.POSITIVE_INFINITY));
    });
    if (positions.some((position) => !Number.isFinite(position)) || new Set(positions).size < 3 || Math.max(...positions) - Math.min(...positions) < 2) { systemFailures.push(`${id}:ordered-contacts`); return []; }
    const componentIds = new Set(members.flatMap((member) => member.tileIndices.map((index) => land.ids[index]).filter((component) => component >= 0)));
    const broken = componentIds.size >= 2;
    const covered = members.every((member) => member.tileIndices.every((index) => chain.tileIndices.includes(index)));
    if (!broken || !covered) { systemFailures.push(`${id}:${!broken ? "unbroken" : "uncovered"}`); return []; }
    return [{ chain, arc, members, memberships: memberPaths.flat(), components: componentIds }];
  });
  const distinctArcs = limitedOverlap(systems.map((system) => system.arc), 0.2);
  const distinctComponentFamilies = systems.every((system, index) => systems.slice(index + 1).every((other) => [...system.components].every((component) => !other.components.has(component))));
  const distinct = systems.length === chains.objects.length && distinctArcs && distinctComponentFamilies;
  const usedChildren = new Set(systems.flatMap((system) => system.members.map((member) => member.id)));
  const usedMemberships = new Set(systems.flatMap((system) => system.memberships.map((path) => path.id)));
  const plannedMinimum = map.structure?.narrativeNativePlan?.engine === "ECCENTRIC"
    ? map.structure.narrativeNativePlan.contract.topology.primarySystems[0]
    : 3;
  const completeCoverage = systems.length === chains.objects.length && arcs.objects.length === chains.objects.length
    && usedChildren.size === children.length && usedMemberships.size === memberships.objects.length;
  const ok = chains.complete && anchors.complete && generics.complete && memberships.complete && arcs.complete
    && systems.length >= plannedMinimum && distinct && completeCoverage;
  const completeBindings = chains.complete && anchors.complete && generics.complete && memberships.complete && arcs.complete;
  return proof(ok, [`All ${systems.length}/${chains.objects.length} retained parent systems (minimum ${plannedMinimum}) occupy disjoint multi-island component families, retain limited-overlap latent shelf traces with at least 35% deliberate water gaps, three or more non-overlapping ordered children, and one exact child-to-parent membership binding per child; bindings=${completeBindings}, distinct arcs=${distinctArcs}, distinct component families=${distinctComponentFamilies}, coverage=${completeCoverage}${systemFailures.length ? `; rejected ${systemFailures.join(", ")}` : ""}.`], systems.flatMap((system) => [system.chain, system.arc, ...system.members, ...system.memberships]), { systems: systems.length, retainedChains: chains.objects.length, plannedMinimum, distinct, distinctArcs, distinctComponentFamilies, completeCoverage, latentShelfArcs: systems.filter((system) => share(map, system.arc.tileIndices, (index) => LAND(map, index)) <= 0.65).length });
}

export function proveEccentricNativeFacts(invariantId: EccentricNativeInvariantId, map: Civ5Map, adapter: NarrativeAdapterEvidence): NarrativeNativeEccentricProofFacts {
  switch (invariantId) {
    case "one-causal-transect": return proveEcologicalTransectSpatialFacts(map, adapter);
    case "distinct-continental-histories": return proveContinentalHistoriesSpatialFacts(map, adapter);
    case "legal-directed-drainage": return proveDirectedDrainageSpatialFacts(map, adapter);
    case "sea-dominated-crossroads": return proveInlandSeaCrossroadsSpatialFacts(map, adapter);
    case "heart-march-contrast": return proveMythicHeartMarchSpatialFacts(map, adapter);
    case "resilient-outer-circuit": return proveEncirclingCircuitSpatialFacts(map, adapter);
    case "scarred-surviving-pangaea": return proveScarredPangaeaSpatialFacts(map, adapter);
    case "authoritative-primary-rifts": return proveRiftLatticeSpatialFacts(map, adapter);
    case "one-major-per-isolated-realm": return proveLonelyRealmsSpatialFacts(map, adapter);
    case "attached-peninsula-provinces": return provePeninsulaAttachmentsSpatialFacts(map, adapter);
    case "parent-arc-ancestry": return proveParentArcSpatialFacts(map, adapter);
  }
}
