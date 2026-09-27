import type { Civ5Map } from "./civ5-map.ts";
import type { GeographicObject, StrategicEdge, StrategicGraph, StrategicNode } from "./generation-structure.ts";
import type { NarrativeAdapterEvidence, NarrativeCausalObject } from "./narrative-engine-adapters.ts";
import { reconstructCiv5RiverEdgeSystems, type Civ5RiverEdgeSystem } from "./rivers.ts";

/**
 * Independent, final-state proof facts for the Physical and Polis narrative
 * grammars. These functions deliberately ignore cached diagnostic scores. A
 * label may identify an exact retained native object, but only the object's
 * final tiles, encoded rivers, assigned starts, or realized strategic graph
 * can satisfy a fact.
 */
export type NarrativeNativeProofFacts = {
  ok: boolean;
  evidence: string[];
  objectIds: string[];
  measurements: Record<string, number | boolean>;
};

type BoundObject = GeographicObject & { attributes: NonNullable<GeographicObject["attributes"]> };

type BoundRole = {
  causes: NarrativeCausalObject[];
  objects: BoundObject[];
  complete: boolean;
};

type ActualRiverSystem = Civ5RiverEdgeSystem;

const LAND = (map: Civ5Map, index: number) => map.tiles[index]?.terrain >= 2;
const PASSABLE = (map: Civ5Map, index: number) => LAND(map, index) && map.tiles[index].elevation < 2;
const WATER = (map: Civ5Map, index: number) => map.tiles[index]?.terrain < 2;

function facts(ok: boolean, evidence: string[], objects: GeographicObject[] = [], measurements: NarrativeNativeProofFacts["measurements"] = {}): NarrativeNativeProofFacts {
  return { ok, evidence, objectIds: [...new Set(objects.map((object) => object.id))], measurements };
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

function connectedShare(map: Civ5Map, source: readonly number[], predicate: (index: number) => boolean = () => true) {
  const members = new Set(validIndices(map, source).filter(predicate));
  if (!members.size) return 0;
  let largest = 0;
  const pending = new Set(members);
  while (pending.size) {
    const origin = pending.values().next().value as number;
    pending.delete(origin);
    const queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
      if (!pending.has(next)) continue;
      pending.delete(next);
      queue.push(next);
    }
    largest = Math.max(largest, queue.length);
  }
  return largest / members.size;
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
  const nearby = expand(map, one, radius);
  return validIndices(map, two).some((index) => nearby.has(index));
}

function overlapShare(one: readonly number[], two: readonly number[]) {
  const left = new Set(one);
  const right = new Set(two);
  let overlap = 0;
  for (const index of left) if (right.has(index)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function roleOf(object: GeographicObject) {
  return String(object.attributes?.role ?? object.attributes?.relationship ?? "");
}

function validUniqueObject(map: Civ5Map, object: GeographicObject, cause: NarrativeCausalObject) {
  const expectedKind = cause.kind === "REGION" ? "NARRATIVE_REGION" : "NARRATIVE_PATH";
  return object.attributes?.nativeNarrative === true
    && object.kind === expectedKind
    && roleOf(object) === cause.role
    && object.semanticId === `narrative:${cause.id}`
    && object.tileIndices.length > 0
    && object.tileIndices.length === new Set(object.tileIndices).size
    && object.tileIndices.every((index) => Number.isInteger(index) && index >= 0 && index < map.tiles.length);
}

function boundRole(map: Civ5Map, adapter: NarrativeAdapterEvidence, role: string): BoundRole {
  const causes = adapter.causalObjects.filter((cause) => cause.retained && cause.role === role);
  const objects: BoundObject[] = [];
  let complete = causes.length > 0;
  for (const cause of causes) {
    const matches = (map.structure?.objects ?? []).filter((object) => object.id === cause.nativeObjectId);
    if (matches.length !== 1 || !validUniqueObject(map, matches[0], cause)) {
      complete = false;
      continue;
    }
    objects.push(matches[0] as BoundObject);
  }
  const uniqueCauseIds = new Set(causes.map((cause) => cause.id)).size === causes.length;
  const uniqueNativeIds = new Set(causes.map((cause) => cause.nativeObjectId)).size === causes.length;
  return { causes, objects, complete: complete && uniqueCauseIds && uniqueNativeIds && objects.length === causes.length };
}

function boundObjects(map: Civ5Map, adapter: NarrativeAdapterEvidence, role?: string) {
  if (role) return boundRole(map, adapter, role).objects;
  const roles = [...new Set(adapter.causalObjects.filter((cause) => cause.retained).map((cause) => cause.role))];
  return roles.flatMap((candidate) => boundRole(map, adapter, candidate).objects);
}

function completeRoles(map: Civ5Map, adapter: NarrativeAdapterEvidence, roles: readonly string[]) {
  return roles.every((role) => boundRole(map, adapter, role).complete);
}

function boundBySkeletonId(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const result = new Map<string, BoundObject>();
  for (const object of boundObjects(map, adapter)) {
    const cause = adapter.causalObjects.find((candidate) => candidate.retained && candidate.nativeObjectId === object.id);
    if (cause) result.set(cause.id, object);
  }
  return result;
}

function endpointObjects(object: BoundObject, bindings: Map<string, BoundObject>) {
  const from = bindings.get(String(object.attributes.from ?? ""));
  const to = bindings.get(String(object.attributes.to ?? ""));
  return from && to && from.id !== to.id ? { from, to } : undefined;
}

function mediumSpine(
  map: Civ5Map,
  object: BoundObject,
  bindings: Map<string, BoundObject>,
  predicate: (index: number) => boolean,
  radius = 1,
) {
  const endpoints = endpointObjects(object, bindings);
  if (!endpoints) return false;
  const members = new Set(validIndices(map, object.tileIndices).filter(predicate));
  if (!members.size) return false;
  const starts = [...members].filter((index) => touches(map, [index], endpoints.from.tileIndices, radius));
  const targets = new Set([...members].filter((index) => touches(map, [index], endpoints.to.tileIndices, radius)));
  if (!starts.length || !targets.size) return false;
  const queue = [...starts];
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (!members.has(next) || reached.has(next)) continue;
    reached.add(next);
    queue.push(next);
  }
  return [...targets].some((index) => reached.has(index));
}

function pathEndpoints(map: Civ5Map, object: BoundObject, bindings: Map<string, BoundObject>, radius = 1) {
  const endpoints = endpointObjects(object, bindings);
  return Boolean(endpoints
    && touches(map, object.tileIndices, endpoints.from.tileIndices, radius)
    && touches(map, object.tileIndices, endpoints.to.tileIndices, radius));
}

function passableReach(map: Civ5Map, origins: readonly number[]) {
  const queue = validIndices(map, origins).filter((index) => PASSABLE(map, index));
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (reached.has(next) || !PASSABLE(map, next)) continue;
    reached.add(next);
    queue.push(next);
  }
  return reached;
}

function traversableDistances(map: Civ5Map, origin: number) {
  const distances = new Int32Array(map.tiles.length);
  distances.fill(-1);
  if (!map.tiles[origin] || map.tiles[origin].elevation >= 2) return distances;
  distances[origin] = 0;
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (distances[next] >= 0 || map.tiles[next].elevation >= 2) continue;
    distances[next] = distances[queue[cursor]] + 1;
    queue.push(next);
  }
  return distances;
}

function hexTileDistance(map: Pick<Civ5Map, "width" | "wraps">, one: number, two: number) {
  const cube = (x: number, y: number) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y] as const;
  };
  const oneX = one % map.width;
  const oneY = Math.floor(one / map.width);
  const twoX = two % map.width;
  const twoY = Math.floor(two / map.width);
  const distance = (targetX: number) => {
    const oneCube = cube(oneX, oneY);
    const twoCube = cube(targetX, twoY);
    return Math.max(Math.abs(oneCube[0] - twoCube[0]), Math.abs(oneCube[1] - twoCube[1]), Math.abs(oneCube[2] - twoCube[2]));
  };
  return map.wraps ? Math.min(distance(twoX), distance(twoX - map.width), distance(twoX + map.width)) : distance(twoX);
}

export function reconstructCiv5RiverSystems(map: Civ5Map): ActualRiverSystem[] {
  return reconstructCiv5RiverEdgeSystems(map).filter((system) => system.edgeCount >= 2 && system.acyclic);
}

function share(map: Civ5Map, source: readonly number[], predicate: (index: number) => boolean) {
  const indices = validIndices(map, source);
  return indices.filter(predicate).length / Math.max(1, indices.length);
}

function validLandPath(map: Civ5Map, object: BoundObject, bindings: Map<string, BoundObject>) {
  const indices = validIndices(map, object.tileIndices);
  return indices.length >= 1 && mediumSpine(map, object, bindings, (index) => LAND(map, index));
}

function validWaterPath(map: Civ5Map, object: BoundObject, bindings: Map<string, BoundObject>) {
  const indices = validIndices(map, object.tileIndices);
  return indices.length >= 1 && mediumSpine(map, object, bindings, (index) => WATER(map, index));
}

function distinctSpatialObjects(objects: BoundObject[]) {
  for (let one = 0; one < objects.length; one += 1) for (let two = one + 1; two < objects.length; two += 1) {
    const left = new Set(objects[one].tileIndices);
    const right = new Set(objects[two].tileIndices);
    const overlap = [...left].filter((index) => right.has(index)).length;
    if (overlap / Math.max(1, left.size + right.size - overlap) > 0.75) return false;
  }
  return true;
}

function effectFaithful(map: Civ5Map, object: BoundObject) {
  const effect = String(object.attributes.effect ?? "");
  if (effect === "WATER" || effect === "WATER_PATH") return share(map, object.tileIndices, (index) => WATER(map, index)) >= 0.8;
  if (effect === "LAND" || effect === "LAND_PATH") return share(map, object.tileIndices, (index) => LAND(map, index)) >= 0.8;
  if (effect === "RIDGE" || effect === "RIDGE_PATH" || effect === "VOLCANIC") {
    return share(map, object.tileIndices, (index) => LAND(map, index)) >= 0.8
      && share(map, object.tileIndices, (index) => LAND(map, index) && map.tiles[index].elevation > 0) >= 0.12;
  }
  if (effect === "LOWLAND") return share(map, object.tileIndices, (index) => PASSABLE(map, index)) >= 0.7;
  if (effect === "WET") return share(map, object.tileIndices, (index) => LAND(map, index)
    && (map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature))) >= 0.45;
  if (effect === "DRY" || effect === "HOT") return share(map, object.tileIndices, (index) => LAND(map, index) && [3, 4].includes(map.tiles[index].terrain)) >= 0.3;
  if (effect === "COLD") return share(map, object.tileIndices, (index) => map.tiles[index].terrain === 5 || map.tiles[index].terrain === 6 || map.tiles[index].feature === 3) >= 0.5;
  if (effect === "VALUE") return share(map, object.tileIndices, (index) => PASSABLE(map, index)
    && (map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255 || map.tiles[index].terrain === 2)) >= 0.2;
  if (effect === "RIVER_PATH") return reconstructCiv5RiverSystems(map).some((river) => overlapShare(river.tileIndices, object.tileIndices) >= 0.08 || touches(map, river.tileIndices, object.tileIndices, 1));
  if (effect === "TRANSITION") return share(map, object.tileIndices, (index) => LAND(map, index)) >= 0.7;
  return false;
}

function causalBoundaryObjects(map: Civ5Map, condition: "CONVERGENT_BOUNDARY" | "DIVERGENT_BOUNDARY") {
  return (map.structure?.objects ?? []).filter((object): object is BoundObject => object.attributes?.nativeCause === true
    && object.attributes.initialCondition === condition
    && object.tileIndices.length > 0
    && object.tileIndices.every((index) => Number.isInteger(index) && index >= 0 && index < map.tiles.length));
}

function dominantPlateFact(map: Civ5Map, object: BoundObject) {
  const plates = (map.structure?.objects ?? []).filter((candidate) => candidate.kind === "TECTONIC_PLATE" && candidate.attributes?.nativeCause === true);
  const field = new Set(object.tileIndices);
  const causalPlateId = object.attributes.causalPlateId;
  if (typeof causalPlateId === "string" && causalPlateId) {
    const matches = plates.filter((plate) => plate.id === causalPlateId);
    if (matches.length !== 1) return undefined;
    const plate = matches[0];
    const overlap = plate.tileIndices.filter((index) => field.has(index)).length;
    const recordedAge = Number(object.attributes.causalCrustAge);
    const actualAge = Number(plate.attributes?.crustAge);
    return overlap === field.size && field.size > 0 && Number.isFinite(recordedAge) && Math.abs(recordedAge - actualAge) < 0.000_001
      ? { plate, overlap }
      : undefined;
  }
  const winner = plates.map((plate) => ({
    plate,
    overlap: plate.tileIndices.filter((index) => field.has(index)).length,
  })).sort((one, two) => two.overlap - one.overlap || one.plate.id.localeCompare(two.plate.id))[0];
  return winner && winner.overlap > 0 ? winner : undefined;
}

function riverMatchesReservation(map: Civ5Map, river: ActualRiverSystem, object: BoundObject, radius = 1) {
  const reserved = new Set(object.tileIndices);
  const direct = river.tileIndices.filter((index) => reserved.has(index)).length;
  return river.directedToOutlet && (direct >= Math.max(1, Math.floor(Math.min(river.tileIndices.length, reserved.size) * 0.08))
    || touches(map, river.tileIndices, object.tileIndices, radius));
}

export function proveDynamicEarthSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const provinces = boundObjects(map, adapter, "PROCESS_PROVINCE");
  const active = boundObjects(map, adapter, "ACTIVE_MARGIN");
  const rifts = boundObjects(map, adapter, "RIFT_MARGIN");
  const convergent = causalBoundaryObjects(map, "CONVERGENT_BOUNDARY");
  const divergent = causalBoundaryObjects(map, "DIVERGENT_BOUNDARY");
  const provinceMaterial = (object: BoundObject) => effectFaithful(map, object)
    && (object.attributes.effect !== "LOWLAND"
      || share(map, object.tileIndices, (index) => PASSABLE(map, index) && map.tiles[index].elevation === 0) >= 0.6);
  const provinceFacts = provinces.map((object) => ({ object, plate: dominantPlateFact(map, object) }))
    .filter((entry) => typeof entry.object.attributes.causalPlateId === "string"
      && provinceMaterial(entry.object) && entry.plate);
  const validActive = active.filter((path) => validLandPath(map, path, bindings) && effectFaithful(map, path)
    && convergent.some((boundary) => touches(map, path.tileIndices, boundary.tileIndices, 1)));
  const validRifts = rifts.filter((path) => {
    const spatial = pathEndpoints(map, path, bindings) && connectedShare(map, path.tileIndices) >= 0.7;
    const boundaryContact = divergent.some((boundary) => touches(map, path.tileIndices, boundary.tileIndices, 1));
    const faithful = validWaterPath(map, path, bindings)
      || share(map, path.tileIndices, (index) => LAND(map, index)) >= 0.8;
    return spatial && faithful && boundaryContact;
  });
  const materialEffects = new Set(provinceFacts.map((entry) => String(entry.object.attributes.effect ?? "")));
  const ages = new Set(provinceFacts.map((entry) => Math.round(Number(entry.plate!.plate.attributes?.crustAge ?? -1) * 10)));
  const complete = completeRoles(map, adapter, ["PROCESS_PROVINCE", "ACTIVE_MARGIN", "RIFT_MARGIN"]);
  const ok = complete && provinceFacts.length === provinces.length && provinces.length >= 3 && distinctSpatialObjects(provinces)
    && materialEffects.size >= 3 && ages.size >= 3
    && validActive.length === active.length && validActive.length > 0 && validRifts.length === rifts.length && validRifts.length > 0
    && distinctSpatialObjects([...validActive, ...validRifts]);
  return facts(ok, [
    `${provinceFacts.length}/${provinces.length} exact retained process provinces occupy distinct, effect-faithful final fields across ${ages.size} retained crust-age bands.`,
    `${validActive.length}/${active.length} retained active margins overlap ${convergent.length} convergent cause object(s), and ${validRifts.length}/${rifts.length} retained divergent boundaries have real, endpoint-bound final geometry.`,
  ], [...provinces, ...validActive, ...validRifts], { completeBindings: complete, provinces: provinces.length, materialProcesses: materialEffects.size, ageBands: ages.size, activeBoundaries: validActive.length, riftBoundaries: validRifts.length });
}

export function proveCollidingPlatesSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const forelands = boundObjects(map, adapter, "FORELAND");
  const belts = boundObjects(map, adapter, "COLLISION_BELT");
  const convergent = causalBoundaryObjects(map, "CONVERGENT_BOUNDARY");
  const validBelts = belts.filter((belt) => {
    const from = bindings.get(String(belt.attributes.from ?? ""));
    const to = bindings.get(String(belt.attributes.to ?? ""));
    if (!from || !to || roleOf(from) !== "FORELAND" || roleOf(to) !== "FORELAND" || !validLandPath(map, belt, bindings)
      || !effectFaithful(map, belt) || !convergent.some((boundary) => touches(map, belt.tileIndices, boundary.tileIndices, 1))) return false;
    const fromPassable = validIndices(map, from.tileIndices).filter((index) => PASSABLE(map, index));
    const toPassable = validIndices(map, to.tileIndices).filter((index) => PASSABLE(map, index));
    const passTiles = belt.tileIndices.filter((index) => PASSABLE(map, index));
    const fromContacts = passTiles.filter((index) => touches(map, [index], fromPassable, 1));
    const toContacts = passTiles.filter((index) => touches(map, [index], toPassable, 1));
    const passReach = passableReach(map, fromContacts);
    return fromPassable.length >= 3 && toPassable.length >= 3
      && fromContacts.length > 0 && toContacts.some((index) => passReach.has(index));
  });
  const validForelands = forelands.filter((foreland) => effectFaithful(map, foreland)
    && validIndices(map, foreland.tileIndices).filter((index) => PASSABLE(map, index)).length >= 3);
  const complete = completeRoles(map, adapter, ["FORELAND", "COLLISION_BELT"]);
  const populatedAccess = map.startLocations.filter((start) => !start.cityState && start.playable !== false).every((start) => {
    const index = start.y * map.width + start.x;
    return PASSABLE(map, index) && passableReach(map, [index]).size >= 12;
  });
  const ok = complete && validForelands.length === forelands.length && forelands.length >= 3
    && belts.length >= 2 && validBelts.length === belts.length && distinctSpatialObjects(forelands) && populatedAccess;
  return facts(ok, [`Every one of ${validBelts.length}/${belts.length} collision belts overlaps actual convergent uplift and retains a passable route between effect-faithful forelands; populated homes remain ${populatedAccess ? "viable" : "sealed"}.`], [...forelands, ...validBelts], { completeBindings: complete, forelands: forelands.length, belts: belts.length, accessibleBelts: validBelts.length, populatedHomesAccessible: populatedAccess });
}

export function proveAncientCratonsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const cratons = boundObjects(map, adapter, "ANCIENT_CRATON");
  const ranges = boundObjects(map, adapter, "GHOST_RANGE");
  const drainages = boundObjects(map, adapter, "MATURE_DRAINAGE");
  const rivers = reconstructCiv5RiverSystems(map);
  const oldCratons = cratons.filter((craton) => {
    const plate = dominantPlateFact(map, craton)?.plate;
    return effectFaithful(map, craton) && Boolean(plate)
      && Number(plate!.attributes?.crustAge ?? 0) >= 0.7
      && Number(plate!.attributes?.stability ?? 0) >= 0.7;
  });
  const usedRivers = new Set<ActualRiverSystem>();
  let reservationMatches = 0;
  let rangeSourceMatches = 0;
  let cratonContactMatches = 0;
  const chains = ranges.filter((range) => {
    // A ghost range is an eroded remnant, not an active collision belt. Its
    // exact spine must remain terrestrial and retain measurable relief, but
    // requiring an active-range relief share would erase the deep-time claim.
    if (!validLandPath(map, range, bindings)
      || share(map, range.tileIndices, (index) => LAND(map, index)) < 0.8
      || share(map, range.tileIndices, (index) => LAND(map, index) && map.tiles[index].elevation > 0) <= 0) return false;
    const drainage = drainages.find((candidate) => candidate.attributes.from === range.attributes.from
      && candidate.attributes.to === range.attributes.to
      && share(map, candidate.tileIndices, (index) => LAND(map, index)) === 1
      && connectedShare(map, candidate.tileIndices, (index) => LAND(map, index)) >= 0.7);
    if (!drainage) return false;
    const endpoints = endpointObjects(range, bindings);
    const reserved = rivers.filter((candidate) => !usedRivers.has(candidate) && riverMatchesReservation(map, candidate, drainage, 1));
    reservationMatches += reserved.length;
    const sourceMatched = reserved.filter((candidate) => candidate.sourceTileIndices.some((source) => touches(map, [source], range.tileIndices, 3)));
    rangeSourceMatches += sourceMatched.length;
    const contacted = sourceMatched.filter((candidate) => Boolean(endpoints && (touches(map, candidate.tileIndices, endpoints.from.tileIndices, 2)
      || touches(map, candidate.tileIndices, endpoints.to.tileIndices, 2))));
    cratonContactMatches += contacted.length;
    const river = contacted[0];
    if (!river) return false;
    usedRivers.add(river);
    return true;
  });
  const complete = completeRoles(map, adapter, ["ANCIENT_CRATON", "GHOST_RANGE", "MATURE_DRAINAGE"]);
  const plannedRanges = adapter.causalObjects.filter((cause) => cause.role === "GHOST_RANGE").length;
  const plannedDrainages = adapter.causalObjects.filter((cause) => cause.role === "MATURE_DRAINAGE").length;
  const disclosedDrops = ranges.length === plannedRanges && drainages.length === plannedDrainages
    || adapter.relaxations.some((message) => /final hydrology retained/i.test(message));
  const ok = complete && cratons.length >= 3 && oldCratons.length === cratons.length && distinctSpatialObjects(cratons)
    && ranges.length >= 3 && ranges.length === drainages.length && chains.length === ranges.length && disclosedDrops;
  return facts(ok, [`All ${chains.length}/${ranges.length} retained old-crust → ghost-range → mature-drainage chains terminate through distinct, directed encoded river systems.`], [...cratons, ...ranges, ...drainages], { completeBindings: complete, cratons: cratons.length, oldStableCratons: oldCratons.length, plannedRanges, plannedDrainages, retainedChains: ranges.length, provenChains: chains.length, encodedRivers: rivers.length, directedRivers: rivers.filter((river) => river.directedToOutlet).length, reservationMatches, rangeSourceMatches, cratonContactMatches, disclosedDrops });
}

export function proveIslandArcSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const anchors = boundObjects(map, adapter, "VOLCANIC_ARC_ANCHOR");
  const arcs = boundObjects(map, adapter, "VOLCANIC_PARENT_ARC");
  const shelves = boundObjects(map, adapter, "ARC_SHELF");
  const seas = boundObjects(map, adapter, "SHELTERED_ARC_SEA");
  const centroid = (indices: readonly number[]) => {
    const values = validIndices(map, indices);
    return {
      x: values.reduce((sum, index) => sum + index % map.width + 0.5, 0) / Math.max(1, values.length),
      y: values.reduce((sum, index) => sum + (Math.floor(index / map.width) + 0.5) * 0.866, 0) / Math.max(1, values.length),
    };
  };
  const crossSection = (arc: BoundObject, shelf: BoundObject, sea: BoundObject) => {
    const endpoints = endpointObjects(arc, bindings);
    if (!endpoints || shelf.attributes.from !== arc.attributes.from || shelf.attributes.to !== arc.attributes.to
      || sea.attributes.from !== arc.attributes.from || sea.attributes.to !== arc.attributes.to) return undefined;
    const from = centroid(endpoints.from.tileIndices);
    const to = centroid(endpoints.to.tileIndices);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) return undefined;
    const signed = (indices: readonly number[]) => {
      const values = validIndices(map, indices);
      return values.reduce((sum, index) => {
        const x = index % map.width + 0.5;
        const y = (Math.floor(index / map.width) + 0.5) * 0.866;
        return sum + ((x - from.x) * dy - (y - from.y) * dx) / length;
      }, 0) / Math.max(1, values.length);
    };
    const arcSigned = signed(arc.tileIndices);
    const shelfSigned = signed(shelf.tileIndices);
    const seaSigned = signed(sea.tileIndices);
    const landward = Math.sign(seaSigned - arcSigned);
    if (!landward || Math.abs(seaSigned - arcSigned) < 0.6) return undefined;
    const shelfBetween = (shelfSigned - arcSigned) * landward >= 0.12
      && (seaSigned - shelfSigned) * landward >= 0.12;
    const trench = [...expand(map, arc.tileIndices, 3)].filter((index) => map.tiles[index].terrain === 0
      && (signed([index]) - arcSigned) * landward <= -0.35);
    return { arcSigned, shelfSigned, seaSigned, shelfBetween, trench };
  };
  let endpointFailures = 0;
  let orderingFailures = 0;
  let materialFailures = 0;
  let overlapFailures = 0;
  const failedSystems: string[] = [];
  const triples = arcs.filter((arc) => {
    const shelf = shelves.find((candidate) => candidate.attributes.from === arc.attributes.from && candidate.attributes.to === arc.attributes.to);
    const sea = seas.find((candidate) => candidate.attributes.from === arc.attributes.from && candidate.attributes.to === arc.attributes.to);
    if (!shelf || !sea || !pathEndpoints(map, arc, bindings, 3) || !pathEndpoints(map, shelf, bindings, 3) || !pathEndpoints(map, sea, bindings, 3)) {
      endpointFailures += 1;
      failedSystems.push(`${arc.id}:endpoint`);
      return false;
    }
    const section = crossSection(arc, shelf, sea);
    if (!section?.shelfBetween || section.trench.length === 0) {
      orderingFailures += 1;
      failedSystems.push(`${arc.id}:${section?.shelfBetween ? "trench" : "ordering"}`);
      return false;
    }
    if (!effectFaithful(map, arc) || !effectFaithful(map, shelf) || !effectFaithful(map, sea)
      || share(map, shelf.tileIndices, (index) => PASSABLE(map, index)) < 0.8) {
      materialFailures += 1;
      failedSystems.push(`${arc.id}:material`);
      return false;
    }
    if (overlapShare(arc.tileIndices, shelf.tileIndices) > 0.6
      || overlapShare(arc.tileIndices, sea.tileIndices) !== 0
      || overlapShare(shelf.tileIndices, sea.tileIndices) !== 0) {
      overlapFailures += 1;
      failedSystems.push(`${arc.id}:overlap`);
      return false;
    }
    return true;
  });
  const complete = completeRoles(map, adapter, ["VOLCANIC_ARC_ANCHOR", "VOLCANIC_PARENT_ARC", "ARC_SHELF", "SHELTERED_ARC_SEA"]);
  const validAnchors = anchors.filter((anchor) => effectFaithful(map, anchor));
  const ok = complete && anchors.length >= 4 && validAnchors.length === anchors.length && distinctSpatialObjects(anchors)
    && arcs.length >= 2 && arcs.length === shelves.length && arcs.length === seas.length && triples.length === arcs.length;
  return facts(ok, [`Every one of ${triples.length}/${arcs.length} retained systems recomputes as a signed deep-water trench → relief-bearing volcanic arc → distinct passable shelf → sheltered sea cross-section between exact volcanic anchors; failures: ${endpointFailures} endpoint, ${orderingFailures} ordering/trench, ${materialFailures} material, ${overlapFailures} overlap${failedSystems.length ? ` (${failedSystems.join(", ")})` : ""}.`], [...anchors, ...triples], { completeBindings: complete, volcanicAnchors: anchors.length, effectFaithfulAnchors: validAnchors.length, orderedCrossSections: triples.length, parentArcs: arcs.length, shelves: shelves.length, shelteredSeas: seas.length, endpointFailures, orderingFailures, materialFailures, overlapFailures });
}

function waterComponent(map: Civ5Map, origins: readonly number[]) {
  const queue = validIndices(map, origins).filter((index) => WATER(map, index));
  const reached = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (reached.has(next) || !WATER(map, next)) continue;
    reached.add(next);
    queue.push(next);
  }
  return reached;
}

export function proveSupercontinentInteriorSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const seas = boundObjects(map, adapter, "INTERIOR_SEA");
  const margins = boundObjects(map, adapter, "INTERIOR_BASIN_MARGIN");
  const highlands = boundObjects(map, adapter, "PERIPHERAL_HIGHLAND");
  const inward = boundObjects(map, adapter, "INWARD_DRAINAGE");
  const arcs = boundObjects(map, adapter, "BROKEN_HIGHLAND_ARC");
  const passes = boundObjects(map, adapter, "HIGHLAND_PASS");
  const rivers = reconstructCiv5RiverSystems(map);
  const sea = seas[0];
  const basin = sea ? waterComponent(map, sea.tileIndices) : new Set<number>();
  const enclosed = basin.size > 0 && [...basin].every((index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    return y > 0 && y < map.height - 1 && (map.wraps || x > 0 && x < map.width - 1);
  });
  const allWater = map.tiles.flatMap((tile, index) => WATER(map, index) ? [index] : []);
  const externalWater = allWater.filter((index) => !basin.has(index));
  let largestExternal = 0;
  const pendingExternal = new Set(externalWater);
  while (pendingExternal.size) {
    const origin = pendingExternal.values().next().value as number;
    const component = [origin];
    pendingExternal.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) for (const next of neighbors(component[cursor], map)) {
      if (!pendingExternal.delete(next)) continue;
      component.push(next);
    }
    largestExternal = Math.max(largestExternal, component.length);
  }
  const validHighlands = highlands.filter((highland) => effectFaithful(map, highland));
  const validArcs = arcs.filter((arc) => validLandPath(map, arc, bindings) && effectFaithful(map, arc));
  const validPasses = passes.filter((pass) => validLandPath(map, pass, bindings)
    && share(map, pass.tileIndices, (index) => PASSABLE(map, index)) >= 0.8);
  const usedSources = new Set<number>();
  const usedRivers = new Set<number>();
  const matchedDrainages: Array<{ path: BoundObject; source: number; river: ActualRiverSystem; riverIndex: number }> = [];
  for (const path of inward) {
    const endpoints = endpointObjects(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "PERIPHERAL_HIGHLAND" || roleOf(endpoints.to) !== "INTERIOR_SEA"
      || !pathEndpoints(map, path, bindings, 4) || !effectFaithful(map, path)) continue;
    const candidate = rivers.flatMap((river, riverIndex) => {
      if (usedRivers.has(riverIndex)) return [];
      if (!river.directedToOutlet || !river.outletTileIndices.length || river.outletTileIndices.some((outlet) => !basin.has(outlet))
        || !riverMatchesReservation(map, river, path, 1)) return [];
      return river.sourceTileIndices
        .filter((source) => !usedSources.has(source) && touches(map, [source], endpoints.from.tileIndices, 4))
        .map((source) => ({ river, source, riverIndex }));
    }).sort((one, two) => one.source - two.source)[0];
    if (!candidate) continue;
    usedSources.add(candidate.source);
    usedRivers.add(candidate.riverIndex);
    matchedDrainages.push({ path, ...candidate });
  }
  const spatiallyDistinctSources = matchedDrainages.every((entry, one) => matchedDrainages.slice(one + 1)
    .every((other) => hexTileDistance(map, entry.source, other.source) >= 4));
  const plannedDrainages = adapter.causalObjects.filter((cause) => cause.role === "INWARD_DRAINAGE").length;
  const disclosedDrops = plannedDrainages === inward.length || adapter.relaxations.some((relaxation) => /Final hydrology retained \d+ exact directed causal object\(s\) and left \d+ unmatched drainage template\(s\) explicitly unretained\./.test(relaxation));
  const complete = completeRoles(map, adapter, ["INTERIOR_SEA", "INTERIOR_BASIN_MARGIN", "PERIPHERAL_HIGHLAND", "INWARD_DRAINAGE", "BROKEN_HIGHLAND_ARC", "HIGHLAND_PASS"]);
  const ok = Boolean(complete && sea && seas.length === 1 && effectFaithful(map, sea) && enclosed
    && largestExternal < Math.max(1, basin.size * 0.15)
    && margins.length === 1 && effectFaithful(map, margins[0])
    && highlands.length >= 8 && validHighlands.length === highlands.length && distinctSpatialObjects(highlands)
    && arcs.length > 0 && validArcs.length === arcs.length
    && passes.length >= 3 && validPasses.length === passes.length
    && inward.length >= 3 && matchedDrainages.length === inward.length && spatiallyDistinctSources && disclosedDrops);
  return facts(ok, [`All ${matchedDrainages.length}/${inward.length} retained drainage causes recompute as spatially distinct peripheral-highland catchments flowing through actual directed Civ V edges into the same ${basin.size}-tile enclosed basin; the largest external water body is ${largestExternal} tiles.`], [...seas, ...margins, ...highlands, ...arcs, ...passes, ...matchedDrainages.map((entry) => entry.path)], { completeBindings: complete, enclosedSeaTiles: basin.size, enclosed, largestExternalWater: largestExternal, peripheralHighlands: highlands.length, faithfulHighlands: validHighlands.length, highlandArcs: arcs.length, faithfulHighlandArcs: validArcs.length, highlandPasses: passes.length, passableHighlandPasses: validPasses.length, plannedDrainages, retainedDrainages: inward.length, provenCatchments: matchedDrainages.length, distinctCatchmentSources: spatiallyDistinctSources, disclosedDrops });
}

export function proveMonsoonContinentsSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const wet = boundObjects(map, adapter, "WET_COAST")[0];
  const low = boundObjects(map, adapter, "MONSOON_LOWLAND")[0];
  const wall = boundObjects(map, adapter, "OROGRAPHIC_WALL")[0];
  const dry = boundObjects(map, adapter, "DRY_INTERIOR")[0];
  const transitions = boundObjects(map, adapter, "CAUSAL_TRANSITION");
  const riverPaths = boundObjects(map, adapter, "LIVING_RIVER");
  const rivers = reconstructCiv5RiverSystems(map);
  const transitionExists = (from: BoundObject, to: BoundObject) => transitions.some((path) => path.attributes.from === adapter.causalObjects.find((cause) => cause.nativeObjectId === from.id)?.id
    && path.attributes.to === adapter.causalObjects.find((cause) => cause.nativeObjectId === to.id)?.id
    && effectFaithful(map, path)
    && pathEndpoints(map, path, bindings, 3));
  const chain = Boolean(wet && low && wall && dry && [
    [wet, low], [low, wall], [wall, dry],
  ].every(([from, to]) => transitionExists(from!, to!)));
  const exclusive = (target: BoundObject | undefined, others: Array<BoundObject | undefined>) => {
    if (!target) return [];
    const occupied = new Set(others.filter(Boolean).flatMap((object) => object!.tileIndices));
    const result = target.tileIndices.filter((index) => !occupied.has(index));
    return result.length ? result : target.tileIndices;
  };
  const wetTiles = exclusive(wet, [low, wall, dry]);
  const lowTiles = exclusive(low, [wet, wall, dry]);
  const wallTiles = exclusive(wall, [wet, low, dry]);
  const dryTiles = exclusive(dry, [wet, low, wall]);
  const wetGreen = share(map, wetTiles, (index) => map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature));
  const dryGreen = share(map, dryTiles, (index) => map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature));
  const dryArid = share(map, dryTiles, (index) => [3, 4].includes(map.tiles[index].terrain));
  const wetArid = share(map, wetTiles, (index) => [3, 4].includes(map.tiles[index].terrain));
  const lowWet = share(map, lowTiles, (index) => LAND(map, index) && (map.tiles[index].terrain === 2 || [0, 1, 2].includes(map.tiles[index].feature)));
  const wallRelief = share(map, wallTiles, (index) => LAND(map, index) && map.tiles[index].elevation > 0);
  const meanX = (indices: readonly number[]) => validIndices(map, indices).reduce((sum, index) => sum + index % map.width + 0.5, 0) / Math.max(1, validIndices(map, indices).length);
  const wetX = wet ? meanX(wetTiles) : Number.NaN;
  const lowX = low ? meanX(lowTiles) : Number.NaN;
  const wallX = wall ? meanX(wallTiles) : Number.NaN;
  const dryX = dry ? meanX(dryTiles) : Number.NaN;
  const orderedStages = Number.isFinite(wetX) && wetX + 1 < lowX && lowX + 1 < wallX && wallX + 1 < dryX;
  const wetNeighborhood = wet ? expand(map, wet.tileIndices, 2) : new Set<number>();
  const warmSea = [...wetNeighborhood].filter((index) => WATER(map, index) && map.tiles[index].feature !== 3 && (() => {
    let dx = index % map.width + 0.5 - wetX;
    if (map.wraps && Math.abs(dx) > map.width / 2) dx += dx > 0 ? -map.width : map.width;
    // A crenellated wet coast can surround a bay, so the upwind sea need not
    // lie west of the region's centroid. It must, however, remain on the
    // seaward side of the following monsoon lowland rather than being an
    // unrelated leeward lake.
    return dx < Math.max(0.5, (wallX - wetX) * 0.9);
  })());
  const usedRivers = new Set<ActualRiverSystem>();
  const provenRiverPaths = riverPaths.filter((path) => {
    if (!wet || !low || !wall || !dry) return false;
    const endpoints = endpointObjects(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "OROGRAPHIC_WALL" || roleOf(endpoints.to) !== "WET_COAST" || !validLandPath(map, path, bindings)) return false;
    const river = rivers.find((candidate) => !usedRivers.has(candidate) && riverMatchesReservation(map, candidate, path, 1)
      && candidate.sourceTileIndices.some((source) => touches(map, [source], endpoints.from.tileIndices, 3))
      && candidate.outletTileIndices.some((outlet) => warmSea.includes(outlet))
      && touches(map, candidate.tileIndices, low.tileIndices, 2)
      && touches(map, candidate.tileIndices, wet.tileIndices, 2));
    if (!river) return false;
    usedRivers.add(river);
    return true;
  });
  const complete = completeRoles(map, adapter, ["WET_COAST", "MONSOON_LOWLAND", "OROGRAPHIC_WALL", "DRY_INTERIOR", "CAUSAL_TRANSITION", "LIVING_RIVER"]);
  const remainingSources = new Set(rivers.flatMap((river) => river.sourceTileIndices));
  let sourceCatchments = 0;
  while (remainingSources.size) {
    const origin = remainingSources.values().next().value as number;
    const component = [origin];
    remainingSources.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) for (const next of neighbors(component[cursor], map)) {
      if (!remainingSources.delete(next)) continue;
      component.push(next);
    }
    sourceCatchments += 1;
  }
  const exactStages = [wet, low, wall, dry].filter(Boolean).length === 4;
  const materialStages = wetTiles.length >= 3 && lowTiles.length >= 3 && wallTiles.length >= 3 && dryTiles.length >= 3
    && wetGreen >= 0.55 && lowWet >= 0.5 && dryArid >= 0.55 && wetArid <= 0.35 && wallRelief >= 0.35;
  const ok = complete && exactStages && chain && transitions.length === 3 && orderedStages && warmSea.length >= 2
    && materialStages && sourceCatchments >= 3 && riverPaths.length > 0 && provenRiverPaths.length === riverPaths.length;
  return facts(ok, [`The complete final transect recomputes in signed west→east order as ${warmSea.length} ice-free warm-sea tiles → wet coast → wet lowland → relief wall → dry leeward interior; ${provenRiverPaths.length}/${riverPaths.length} retained trunk rivers run on directed Civ V edges from the wall through the wet side to that sea, within ${sourceCatchments} distinct mountain-source catchments.`], [wet, low, wall, dry, ...transitions, ...provenRiverPaths].filter(Boolean) as BoundObject[], { completeBindings: complete, orderedStages, warmSeaTiles: warmSea.length, wetGreen, lowWet, dryGreen, wetArid, dryArid, wallRelief, transitions: transitions.length, sourceCatchments, livingRiverPaths: riverPaths.length, provenRiverPaths: provenRiverPaths.length });
}

export function proveIcehouseEarthSpatialFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const bindings = boundBySkeletonId(map, adapter);
  const sheets = boundObjects(map, adapter, "ICE_SHEET");
  const refuges = boundObjects(map, adapter, "REFUGE");
  const supplies = boundObjects(map, adapter, "SUPPLIES");
  const complete = completeRoles(map, adapter, ["ICE_SHEET", "REFUGE", "SUPPLIES"]);
  const refugeTiles = new Set(refuges.flatMap((refuge) => validIndices(map, refuge.tileIndices)));
  const isColdLand = (index: number) => LAND(map, index)
    && (map.tiles[index].terrain === 5 || map.tiles[index].terrain === 6);
  const land = map.tiles.flatMap((tile, index) => tile.terrain >= 2 ? [index] : []);
  const outsideRefuges = land.filter((index) => !refugeTiles.has(index));
  const coldOutside = outsideRefuges.filter(isColdLand);
  const coldDominance = coldOutside.length / Math.max(1, outsideRefuges.length);
  const refugeCoverage = refugeTiles.size / Math.max(1, land.length);

  const sheetFacts = sheets.map((sheet) => {
    const core = validIndices(map, sheet.tileIndices).filter((index) => !refugeTiles.has(index));
    const coldShare = share(map, core, isColdLand);
    const coldConnected = connectedShare(map, core, isColdLand);
    return { sheet, core, coldShare, coldConnected, faithful: core.length >= 8
      && coldShare >= 0.55
      && coldConnected >= 0.45
      && effectFaithful(map, sheet) };
  });
  const faithfulSheets = sheetFacts.filter((entry) => entry.faithful).map((entry) => entry.sheet);
  const faithfulRefuges = refuges.filter((refuge) => {
    const members = validIndices(map, refuge.tileIndices);
    const temperateShare = share(map, members, (index) => LAND(map, index) && [2, 3].includes(map.tiles[index].terrain));
    const localValue = members.filter((index) => map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255).length;
    return members.length >= 3
      && members.length <= Math.max(6, Math.ceil(land.length * 0.1))
      && share(map, members, PASSABLE.bind(undefined, map)) >= 0.8
      && connectedShare(map, members, (index) => PASSABLE(map, index)) >= 0.75
      && temperateShare >= 0.55
      && localValue >= 1
      && effectFaithful(map, refuge);
  });
  const faithfulSupplies = supplies.filter((path) => {
    const endpoints = endpointObjects(path, bindings);
    if (!endpoints || roleOf(endpoints.from) !== "REFUGE" || roleOf(endpoints.to) !== "ICE_SHEET") return false;
    const members = validIndices(map, path.tileIndices);
    return members.length >= 3
      && members.every((index) => PASSABLE(map, index))
      && mediumSpine(map, path, bindings, (index) => PASSABLE(map, index))
      && members.some((index) => refugeTiles.has(index))
      && members.some((index) => !refugeTiles.has(index) && isColdLand(index))
      && effectFaithful(map, path);
  });

  const coldValue = coldOutside.filter((index) => PASSABLE(map, index)
    && (map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255));
  const majors = map.startLocations
    .filter((start) => !start.cityState && start.playable !== false)
    .map((start) => start.y * map.width + start.x);
  const reaches = majors.map((origin) => passableReach(map, [origin]));
  const assignedValue = new Map<number, number>();
  const assignMajor = (major: number, visited: Set<number>): boolean => {
    for (const value of coldValue) {
      if (visited.has(value) || !reaches[major].has(value)) continue;
      visited.add(value);
      const incumbent = assignedValue.get(value);
      if (incumbent === undefined || assignMajor(incumbent, visited)) {
        assignedValue.set(value, major);
        return true;
      }
    }
    return false;
  };
  const majorAssignments = majors.reduce((count, _origin, major) => count + Number(assignMajor(major, new Set())), 0);
  const sheetValueAssignment = new Map<number, number>();
  const assignSheet = (sheet: number, visited: Set<number>): boolean => {
    for (const value of coldValue) {
      if (visited.has(value) || !sheets[sheet].tileIndices.includes(value)) continue;
      visited.add(value);
      const incumbent = sheetValueAssignment.get(value);
      if (incumbent === undefined || assignSheet(incumbent, visited)) {
        sheetValueAssignment.set(value, sheet);
        return true;
      }
    }
    return false;
  };
  const valuedSheets = sheets.reduce((count, _sheet, sheet) => count + Number(assignSheet(sheet, new Set())), 0);
  const startsLegal = majors.length > 0 && majors.every((index) => PASSABLE(map, index));
  const ok = complete
    && sheets.length >= 1 && faithfulSheets.length === sheets.length && distinctSpatialObjects(sheets)
    && refuges.length >= 2 && faithfulRefuges.length === refuges.length && distinctSpatialObjects(refuges)
    && refugeCoverage > 0 && refugeCoverage <= 0.18
    && coldDominance >= 0.55
    && supplies.length >= refuges.length && faithfulSupplies.length === supplies.length
    && startsLegal && coldValue.length >= majors.length
    && majorAssignments === majors.length
    && valuedSheets === sheets.length;
  return facts(ok, [`Cold/ice terrain occupies ${(coldDominance * 100).toFixed(1)}% of land outside ${refuges.length} bounded, productive refuges; all ${faithfulSupplies.length}/${supplies.length} exact supply paths enter a cold sheet, and ${majorAssignments}/${majors.length} majors receive distinct passably reachable hostile value sites outside the refuges.`], [...sheets, ...refuges, ...faithfulSupplies], { completeBindings: complete, iceSheets: sheets.length, faithfulIceSheets: faithfulSheets.length, minimumSheetColdShare: sheetFacts.length ? Math.min(...sheetFacts.map((entry) => entry.coldShare)) : 0, minimumSheetColdConnectedShare: sheetFacts.length ? Math.min(...sheetFacts.map((entry) => entry.coldConnected)) : 0, refuges: refuges.length, faithfulRefuges: faithfulRefuges.length, refugeCoverage, coldDominance, supplyPaths: supplies.length, faithfulSupplyPaths: faithfulSupplies.length, coldValue: coldValue.length, majorStarts: majors.length, assignedMajorColdValue: majorAssignments, valuedIceSheets: valuedSheets });
}

type RealizedGraph = {
  graph: StrategicGraph;
  nodes: Map<string, StrategicNode>;
  edges: StrategicEdge[];
  majors: StrategicNode[];
  objectives: StrategicNode[];
};

function realizedGraph(map: Civ5Map): RealizedGraph | undefined {
  const graph = map.structure?.strategicGraph;
  if (!graph) return undefined;
  if (new Set(graph.nodes.map((node) => node.id)).size !== graph.nodes.length
    || new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length) return undefined;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (graph.nodes.some((node) => !node.id || !Number.isInteger(node.x) || !Number.isInteger(node.y)
    || node.x < 0 || node.x >= map.width || node.y < 0 || node.y >= map.height)) return undefined;
  const majors = graph.nodes.filter((node) => node.kind === "MAJOR_START");
  if (!majors.length
    || majors.some((node) => !Number.isInteger(node.owner))
    || new Set(majors.map((node) => node.owner)).size !== majors.length
    || new Set(majors.map((node) => `${node.x},${node.y}`)).size !== majors.length) return undefined;
  const validEdges = graph.edges.every((edge) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!edge.id || !from || !to || edge.from === edge.to || edge.tileIndices.length < 2
      || !Number.isFinite(edge.width) || edge.width < 1) return false;
    const indices = [...edge.tileIndices];
    if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= map.tiles.length)) return false;
    for (let index = 1; index < indices.length; index += 1) if (!neighbors(indices[index - 1], map).includes(indices[index])) return false;
    const fromIndex = from.y * map.width + from.x;
    const toIndex = to.y * map.width + to.x;
    if (indices[0] !== fromIndex || indices.at(-1) !== toIndex) return false;
    if (edge.kind === "NAVAL") return indices.slice(1, -1).every((tile) => WATER(map, tile));
    return indices.every((tile) => PASSABLE(map, tile));
  });
  if (!validEdges) return undefined;
  return {
    graph,
    nodes,
    edges: graph.edges,
    majors,
    objectives: graph.nodes.filter((node) => node.kind === "OBJECTIVE"),
  };
}

function invalidGraphEvidence(map: Civ5Map) {
  const graph = map.structure?.strategicGraph;
  if (!graph) return "The strategic graph is missing.";
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const invalid = graph.edges.flatMap((edge) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const fromIndex = from ? from.y * map.width + from.x : -1;
    const toIndex = to ? to.y * map.width + to.x : -1;
    const continuous = edge.tileIndices.every((index, position) => position === 0 || neighbors(edge.tileIndices[position - 1], map).includes(index));
    const medium = edge.kind === "NAVAL"
      ? edge.tileIndices.slice(1, -1).every((index) => WATER(map, index))
      : edge.tileIndices.every((index) => PASSABLE(map, index));
    return !from || !to || edge.tileIndices.length < 2 || edge.tileIndices[0] !== fromIndex || edge.tileIndices.at(-1) !== toIndex || !continuous || !medium
      ? [`${edge.id}[kind=${edge.kind},from=${edge.tileIndices[0]}/${fromIndex},to=${edge.tileIndices.at(-1)}/${toIndex},continuous=${continuous},medium=${medium},water=${edge.tileIndices.filter((index) => WATER(map, index)).length},mountains=${edge.tileIndices.filter((index) => map.tiles[index]?.elevation === 2).length}]`]
      : [];
  });
  return invalid.length ? `Invalid strategic edges: ${invalid.join(", ")}.` : "Strategic node or edge identities are duplicated or malformed.";
}

function sameIndexSet(one: readonly number[], two: readonly number[]) {
  const left = new Set(one);
  const right = new Set(two);
  return left.size === right.size && [...left].every((index) => right.has(index));
}

function objectSources(object: BoundObject) {
  return String(object.attributes.strategicSources ?? object.attributes.strategicSource ?? "")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function actualStartForNode(map: Civ5Map, node: StrategicNode) {
  const matches = map.startLocations.filter((start) => !start.cityState && start.playable !== false
    && start.player === node.owner && start.x === node.x && start.y === node.y && start.team === node.team);
  return matches.length === 1 ? matches[0] : undefined;
}

function allMajorsAssigned(map: Civ5Map, graph: RealizedGraph) {
  const starts = map.startLocations.filter((start) => !start.cityState && start.playable !== false);
  const uniqueStarts = new Set(starts.map((start) => `${start.player}:${start.team}:${start.x}:${start.y}`)).size === starts.length;
  const separated = starts.every((start, one) => starts.slice(one + 1).every((other) => {
    const reached = expand(map, [start.y * map.width + start.x], 4);
    return !reached.has(other.y * map.width + other.x);
  }));
  return starts.length === graph.majors.length && uniqueStarts && separated
    && graph.majors.every((node) => Boolean(actualStartForNode(map, node)) && PASSABLE(map, node.y * map.width + node.x))
    && starts.every((start) => graph.majors.filter((node) => node.owner === start.player && node.team === start.team && node.x === start.x && node.y === start.y).length === 1);
}

type PolisNativeBindings = {
  complete: boolean;
  failures: string[];
  objects: BoundObject[];
  byRole: Map<string, BoundObject[]>;
  sourceRegionByObject: Map<string, GeographicObject>;
  sourceNodeByObject: Map<string, StrategicNode>;
  sourceNodesByObject: Map<string, StrategicNode[]>;
  sourceEdgesByObject: Map<string, StrategicEdge[]>;
};

function nodeMatchesEndpoint(node: StrategicNode, source: GeographicObject) {
  const members = String(source.attributes?.memberRegions ?? "").split(",").filter(Boolean);
  return Boolean(node.regionId && (members.length ? members.includes(node.regionId) : node.regionId === source.id));
}

function connectedEdgeBundle(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  if (!edges.length) return false;
  const used = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
  const links = adjacency(used, edges);
  if (used.some((id) => (links.get(id)?.size ?? 0) > 2)) return false;
  return connectedIds(used, edges) && nodeIds.every((id) => used.includes(id));
}

function bindPolisNativeObjects(profileId: string, map: Civ5Map, adapter: NarrativeAdapterEvidence, graph: RealizedGraph): PolisNativeBindings {
  const retained = adapter.causalObjects.filter((cause) => cause.retained);
  const objects = boundObjects(map, adapter);
  const result: PolisNativeBindings = {
    complete: retained.length > 0 && retained.length === adapter.causalObjects.length && objects.length === retained.length,
    failures: [],
    objects,
    byRole: new Map(),
    sourceRegionByObject: new Map(),
    sourceNodeByObject: new Map(),
    sourceNodesByObject: new Map(),
    sourceEdgesByObject: new Map(),
  };
  for (const object of objects) {
    const role = roleOf(object);
    result.byRole.set(role, [...(result.byRole.get(role) ?? []), object]);
  }
  const byCauseId = boundBySkeletonId(map, adapter);
  const usedEdgeIds = new Set<string>();
  const usedRegionIds = new Set<string>();
  for (const cause of retained) {
    const object = byCauseId.get(cause.id);
    if (!object) { result.complete = false; continue; }
    if (cause.kind === "REGION") {
      const sourceId = String(object.attributes.strategicSource ?? "");
      const sources = (map.structure?.objects ?? []).filter((candidate) => candidate.id === sourceId && candidate.kind === "STRATEGIC_REGION" && candidate.attributes?.nativeNarrative !== true);
      const memberRegions = String(sources[0]?.attributes?.memberRegions ?? "").split(",").filter(Boolean);
      const sourceIds = new Set(memberRegions.length ? memberRegions : [sourceId]);
      const nodes = graph.graph.nodes.filter((node) => node.regionId && sourceIds.has(node.regionId));
      const members = memberRegions.flatMap((id) => (map.structure?.objects ?? []).filter((candidate) => candidate.id === id && candidate.kind === "STRATEGIC_REGION" && candidate.attributes?.role === "SAFE"));
      const aggregateFaithful = memberRegions.length === 0 || new Set(memberRegions).size === memberRegions.length
        && members.length === memberRegions.length
        && sameIndexSet(sources[0]?.tileIndices ?? [], members.flatMap((member) => member.tileIndices));
      const nodeMembershipFaithful = memberRegions.length > 0
        ? new Set(nodes.map((node) => node.regionId)).size === memberRegions.length && members.every((member) => {
          const matches = nodes.filter((node) => node.regionId === member.id);
          if (matches.length !== 1) return false;
          const node = matches[0];
          const index = node.y * map.width + node.x;
          return member.tileIndices.includes(index)
            && (member.attributes?.owner === undefined || member.attributes.owner === node.owner)
            && (member.attributes?.team === undefined || member.attributes.team === node.team);
        })
        : nodes.length === 1 && sources[0]?.tileIndices.includes(nodes[0].y * map.width + nodes[0].x);
      const roleFaithful = (profileId === "OPPOSING_FRONTS" || profileId === "RIVAL_CONTINENTS" || profileId === "THREE_REALMS") && cause.role.startsWith("TEAM_REALM_")
        ? sources[0]?.attributes?.role === "TEAM_REALM"
          && Number(sources[0]?.attributes?.team) === Number(cause.role.match(/_(\d+)$/)?.[1] ?? 0) - 1
        : profileId === "UNEQUAL_REALMS" && ["TALL", "WIDE", "WAR", "TURTLE"].includes(cause.role)
          ? sources[0]?.attributes?.role === "ROLE_REALM" && sources[0]?.attributes?.contractRole === cause.role
          : profileId === "IMPERIAL_RING" && cause.role.startsWith("RING_SEAT_")
            ? sources[0]?.attributes?.role === "SAFE" || sources[0]?.attributes?.role === "RING_ANCHOR"
            : profileId === "CONTESTED_HEARTLAND" && cause.role.startsWith("MAJOR_HOME_") || cause.role.startsWith("PORT_REALM_")
              ? sources[0]?.attributes?.role === "SAFE"
              : cause.role === "SHARED_OBJECTIVE" || cause.role === "DIPLOMATIC_PORT" || cause.role.startsWith("HEARTLAND_DISTRICT_")
                ? sources[0]?.attributes?.role === "OBJECTIVE"
                : true;
      const failures = [
        sources.length !== 1 ? "source-count" : "",
        usedRegionIds.has(sourceId) ? "reused-source" : "",
        !nodes.length ? "missing-node" : "",
        memberRegions.length > 0 && nodes.length !== memberRegions.length ? "member-node-count" : "",
        !aggregateFaithful ? "aggregate-union" : "",
        !nodeMembershipFaithful ? "node-membership" : "",
        !roleFaithful ? "source-role" : "",
        !sameIndexSet(object.tileIndices, sources[0]?.tileIndices ?? []) ? "tile-set" : "",
      ].filter(Boolean);
      if (failures.length) {
        result.complete = false;
        result.failures.push(`${cause.id}:${failures.join(",")}`);
        continue;
      }
      usedRegionIds.add(sourceId);
      result.sourceRegionByObject.set(object.id, sources[0]);
      result.sourceNodeByObject.set(object.id, nodes[0]);
      result.sourceNodesByObject.set(object.id, nodes);
      continue;
    }
    const sourceIds = objectSources(object);
    if (!sourceIds.length || object.attributes.strategicSource !== sourceIds[0]
      || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => usedEdgeIds.has(id))) {
      result.complete = false;
      result.failures.push(`${cause.id}:source-list`);
      continue;
    }
    const edges = sourceIds.flatMap((id) => graph.edges.filter((edge) => edge.id === id));
    if (edges.length !== sourceIds.length || !sameIndexSet(object.tileIndices, edges.flatMap((edge) => edge.tileIndices))) {
      result.complete = false;
      result.failures.push(`${cause.id}:edge-tile-set`);
      continue;
    }
    const landEffect = object.attributes.effect === "LAND_PATH";
    const waterEffect = object.attributes.effect === "WATER_PATH";
    if (!landEffect && !waterEffect || landEffect && edges.some((edge) => edge.kind === "NAVAL") || waterEffect && edges.some((edge) => edge.kind !== "NAVAL")) {
      result.complete = false;
      result.failures.push(`${cause.id}:medium`);
      continue;
    }
    const fromObject = byCauseId.get(String(object.attributes.from ?? ""));
    const toObject = byCauseId.get(String(object.attributes.to ?? ""));
    const fromSource = fromObject && result.sourceRegionByObject.get(fromObject.id);
    const toSource = toObject && result.sourceRegionByObject.get(toObject.id);
    const usedNodes = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
    const fromMatches = fromSource ? usedNodes.filter((id) => nodeMatchesEndpoint(graph.nodes.get(id)!, fromSource)) : [];
    const toMatches = toSource ? usedNodes.filter((id) => nodeMatchesEndpoint(graph.nodes.get(id)!, toSource)) : [];
    if (!fromSource || !toSource || !fromMatches.length || !toMatches.length
      || !connectedEdgeBundle([fromMatches[0], toMatches[0]], edges)) {
      result.complete = false;
      result.failures.push(`${cause.id}:endpoints`);
      continue;
    }
    for (const id of sourceIds) usedEdgeIds.add(id);
    result.sourceEdgesByObject.set(object.id, edges);
  }
  if (result.sourceRegionByObject.size !== retained.filter((cause) => cause.kind === "REGION").length
    || result.sourceEdgesByObject.size !== retained.filter((cause) => cause.kind === "RELATIONSHIP").length) {
    result.complete = false;
    result.failures.push("binding-cardinality");
  }
  return result;
}

function adjacency(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  const result = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) if (result.has(edge.from) && result.has(edge.to)) {
    result.get(edge.from)!.add(edge.to);
    result.get(edge.to)!.add(edge.from);
  }
  return result;
}

function connectedIds(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  if (!nodeIds.length) return false;
  const links = adjacency(nodeIds, edges);
  const reached = new Set([nodeIds[0]]);
  const queue = [nodeIds[0]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of links.get(queue[cursor]) ?? []) if (!reached.has(next)) {
    reached.add(next);
    queue.push(next);
  }
  return nodeIds.every((id) => reached.has(id));
}

function bridgeIds(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  const allowed = new Set(nodeIds);
  const links = new Map(nodeIds.map((id) => [id, [] as Array<{ id: string; to: string }>]));
  for (const edge of edges) if (allowed.has(edge.from) && allowed.has(edge.to)) {
    links.get(edge.from)!.push({ id: edge.id, to: edge.to });
    links.get(edge.to)!.push({ id: edge.id, to: edge.from });
  }
  const entered = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges = new Set<string>();
  let time = 0;
  const visit = (node: string, parentEdge?: string) => {
    const at = ++time;
    entered.set(node, at);
    low.set(node, at);
    for (const edge of links.get(node) ?? []) {
      if (edge.id === parentEdge) continue;
      if (!entered.has(edge.to)) {
        visit(edge.to, edge.id);
        low.set(node, Math.min(low.get(node)!, low.get(edge.to)!));
        if (low.get(edge.to)! > entered.get(node)!) bridges.add(edge.id);
      } else low.set(node, Math.min(low.get(node)!, entered.get(edge.to)!));
    }
  };
  for (const id of nodeIds) if (!entered.has(id)) visit(id);
  return bridges;
}

function isSingleCycle(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  if (nodeIds.length < 3 || edges.length !== nodeIds.length || !connectedIds(nodeIds, edges)) return false;
  const degree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of edges) if (degree.has(edge.from) && degree.has(edge.to)) {
    degree.set(edge.from, degree.get(edge.from)! + 1);
    degree.set(edge.to, degree.get(edge.to)! + 1);
  }
  return [...degree.values()].every((value) => value === 2);
}

function twoEdgeConnected(nodeIds: readonly string[], edges: readonly StrategicEdge[]) {
  return nodeIds.length >= 3 && connectedIds(nodeIds, edges) && bridgeIds(nodeIds, edges).size === 0;
}

function teamOf(map: Civ5Map, node: StrategicNode) {
  return actualStartForNode(map, node)?.team;
}

function crossTeamEdges(map: Civ5Map, graph: RealizedGraph) {
  return graph.edges.filter((edge) => {
    const from = graph.nodes.get(edge.from);
    const to = graph.nodes.get(edge.to);
    if (from?.kind !== "MAJOR_START" || to?.kind !== "MAJOR_START") return false;
    const one = teamOf(map, from);
    const two = teamOf(map, to);
    return one !== undefined && two !== undefined && one !== two;
  });
}

function bundleInterior(edges: readonly StrategicEdge[]) {
  return [...new Set(edges.flatMap((edge) => edge.tileIndices.slice(1, -1)))];
}

function disjointBundles(bundles: readonly StrategicEdge[][]) {
  const occupied = new Set<number>();
  for (const bundle of bundles) for (const index of bundleInterior(bundle)) {
    if (occupied.has(index)) return false;
    occupied.add(index);
  }
  return bundles.length >= 2;
}

function disjointBundlesOutside(bundles: readonly StrategicEdge[][], ignored: ReadonlySet<number>) {
  if (bundles.length < 2) return false;
  const occupied = new Set<number>();
  for (const bundle of bundles) {
    const core = bundleInterior(bundle).filter((index) => !ignored.has(index));
    if (!core.length) return false;
    for (const index of core) {
      if (occupied.has(index)) return false;
      occupied.add(index);
    }
  }
  return true;
}

function distinctBundles(bundles: readonly StrategicEdge[][], minimumPrivateShare = 0.15) {
  if (bundles.length < 2) return false;
  const cores = bundles.map(bundleInterior);
  return cores.every((core, index) => {
    const others = new Set(cores.flatMap((candidate, other) => other === index ? [] : candidate));
    const privateTiles = core.filter((tile) => !others.has(tile)).length;
    return core.length > 0 && privateTiles / core.length >= minimumPrivateShare;
  });
}

/**
 * Recomputes removal resilience from the final passable tiles occupied by the
 * claimed routes. Graph-level cycles are insufficient: several nominal edges
 * can all traverse one non-terminal tile and collapse into one physical gate.
 */
function resilientPassableRouteNetwork(
  map: Civ5Map,
  graph: RealizedGraph,
  edges: readonly StrategicEdge[],
  terminalIds: readonly string[],
) {
  const terminals = [...new Set(terminalIds)];
  const terminalSet = new Set(terminals);
  if (terminals.length < 3 || edges.length < terminals.length) return false;
  if (edges.some((edge) => edge.tileIndices.some((index) => !PASSABLE(map, index)))) return false;

  const routeTiles = new Set(edges.flatMap((edge) => edge.tileIndices));
  const links = new Map<string, Set<string>>();
  const connect = (one: string, two: string) => {
    if (one === two) return;
    links.set(one, links.get(one) ?? new Set());
    links.set(two, links.get(two) ?? new Set());
    links.get(one)!.add(two);
    links.get(two)!.add(one);
  };
  for (const index of routeTiles) {
    const id = `route:${index}`;
    links.set(id, links.get(id) ?? new Set());
    for (const next of neighbors(index, map)) if (routeTiles.has(next)) connect(id, `route:${next}`);
  }

  const terminalHalo = new Set<number>();
  for (const terminalId of terminals) {
    const node = graph.nodes.get(terminalId);
    if (!node) return false;
    const nodeIndex = node.y * map.width + node.x;
    if (!routeTiles.has(nodeIndex)) return false;
    const gateways = new Set<number>();
    for (const edge of edges.filter((candidate) => candidate.from === terminalId || candidate.to === terminalId)) {
      const ordered = edge.from === terminalId ? edge.tileIndices : [...edge.tileIndices].reverse();
      if (ordered[1] !== undefined) gateways.add(ordered[1]);
    }
    if (gateways.size < 2) return false;
    const terminal = `terminal:${terminalId}`;
    links.set(terminal, links.get(terminal) ?? new Set());
    connect(terminal, `route:${nodeIndex}`);
    for (const index of expand(map, [nodeIndex], 1)) if (routeTiles.has(index)) terminalHalo.add(index);
  }

  const origin = `terminal:${terminals[0]}`;
  const reachable = new Set([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of links.get(queue[cursor]) ?? []) if (!reachable.has(next)) {
    reachable.add(next);
    queue.push(next);
  }
  if (terminals.some((terminal) => !reachable.has(`terminal:${terminal}`))) return false;

  const entered = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  const subtreeTerminals = new Map<string, number>();
  let clock = 0;
  let critical = false;
  const visit = (id: string) => {
    entered.set(id, ++clock);
    low.set(id, clock);
    let terminalCount = id.startsWith("terminal:") && terminalSet.has(id.slice("terminal:".length)) ? 1 : 0;
    const separatingChildren: number[] = [];
    for (const next of links.get(id) ?? []) {
      if (!entered.has(next)) {
        parent.set(next, id);
        visit(next);
        terminalCount += subtreeTerminals.get(next) ?? 0;
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
        if (low.get(next)! >= entered.get(id)!) separatingChildren.push(subtreeTerminals.get(next) ?? 0);
      } else if (parent.get(id) !== next) low.set(id, Math.min(low.get(id)!, entered.get(next)!));
    }
    subtreeTerminals.set(id, terminalCount);
    if (!id.startsWith("route:")) return;
    const tile = Number(id.slice("route:".length));
    if (terminalHalo.has(tile)) return;
    for (const separated of separatingChildren) if (separated > 0 && terminals.length - separated > 0) critical = true;
  };
  visit(origin);
  return !critical;
}

/**
 * Proves that the final water occupied by a set of authored naval lanes still
 * connects every named port after the loss of any one non-harbour water tile.
 * The strategic edge graph is not enough here: several nominally independent
 * lanes can collapse onto one physical canal or coastal approach.
 */
function resilientNavalTileNetwork(map: Civ5Map, graph: RealizedGraph, edges: readonly StrategicEdge[], terminalIds: readonly string[]) {
  const terminals = [...new Set(terminalIds)];
  const terminalSet = new Set(terminals);
  if (terminals.length < 3 || edges.length < terminals.length) return false;

  const water = new Set(edges.flatMap((edge) => edge.tileIndices.slice(1, -1)).filter((index) => WATER(map, index)));
  const links = new Map<string, Set<string>>();
  const connect = (one: string, two: string) => {
    if (one === two) return;
    links.set(one, links.get(one) ?? new Set());
    links.set(two, links.get(two) ?? new Set());
    links.get(one)!.add(two);
    links.get(two)!.add(one);
  };
  for (const index of water) {
    const id = `water:${index}`;
    links.set(id, links.get(id) ?? new Set());
    for (const next of neighbors(index, map)) if (water.has(next)) connect(id, `water:${next}`);
  }

  const harbourHalo = new Set<number>();
  for (const terminalId of terminals) {
    const node = graph.nodes.get(terminalId);
    if (!node) return false;
    const nodeIndex = node.y * map.width + node.x;
    const gatewayTiles = new Set<number>();
    for (const edge of edges.filter((candidate) => candidate.from === terminalId || candidate.to === terminalId)) {
      const ordered = edge.from === terminalId ? edge.tileIndices : [...edge.tileIndices].reverse();
      const gateway = ordered.slice(1).find((index) => WATER(map, index));
      if (gateway !== undefined && water.has(gateway)) gatewayTiles.add(gateway);
    }
    // Two nominal lanes using the same coastal tile are still one harbour exit.
    if (gatewayTiles.size < 2) return false;
    const terminal = `terminal:${terminalId}`;
    links.set(terminal, links.get(terminal) ?? new Set());
    for (const gateway of gatewayTiles) connect(terminal, `water:${gateway}`);
    for (const index of expand(map, [nodeIndex], 1)) if (water.has(index)) harbourHalo.add(index);
  }

  const origin = `terminal:${terminals[0]}`;
  const reachable = new Set([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of links.get(queue[cursor]) ?? []) if (!reachable.has(next)) {
    reachable.add(next);
    queue.push(next);
  }
  if (terminals.some((terminal) => !reachable.has(`terminal:${terminal}`))) return false;

  // Tarjan articulation facts, augmented with the number of strategic port
  // terminals below each DFS branch. Only a vertex whose removal separates
  // two named ports invalidates the network; harmless dead-water spurs do not.
  const entered = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  const subtreeTerminals = new Map<string, number>();
  let clock = 0;
  let critical = false;
  const visit = (id: string) => {
    entered.set(id, ++clock);
    low.set(id, clock);
    let terminalCount = terminalSet.has(id.slice("terminal:".length)) && id.startsWith("terminal:") ? 1 : 0;
    const separatingChildren: number[] = [];
    for (const next of links.get(id) ?? []) {
      if (!entered.has(next)) {
        parent.set(next, id);
        visit(next);
        terminalCount += subtreeTerminals.get(next) ?? 0;
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
        if (low.get(next)! >= entered.get(id)!) separatingChildren.push(subtreeTerminals.get(next) ?? 0);
      } else if (parent.get(id) !== next) low.set(id, Math.min(low.get(id)!, entered.get(next)!));
    }
    subtreeTerminals.set(id, terminalCount);
    if (!id.startsWith("water:")) return;
    const tile = Number(id.slice("water:".length));
    if (harbourHalo.has(tile)) return;
    const total = terminals.length;
    for (const separated of separatingChildren) if (separated > 0 && total - separated > 0) critical = true;
  };
  visit(origin);
  return !critical;
}

function connectedWithinTeams(map: Civ5Map, graph: RealizedGraph) {
  const teams = new Map<number, StrategicNode[]>();
  for (const node of graph.majors) {
    const team = teamOf(map, node);
    if (team === undefined) return false;
    teams.set(team, [...(teams.get(team) ?? []), node]);
  }
  return [...teams.entries()].every(([team, nodes]) => connectedIds(nodes.map((node) => node.id), graph.edges.filter((edge) => {
    const from = graph.nodes.get(edge.from);
    const to = graph.nodes.get(edge.to);
    return from?.kind === "MAJOR_START" && to?.kind === "MAJOR_START" && teamOf(map, from) === team && teamOf(map, to) === team;
  })));
}

function roleObjects(bindings: PolisNativeBindings, roles: readonly string[]) {
  return roles.flatMap((role) => bindings.byRole.get(role) ?? []);
}

function roleEdgeBundles(bindings: PolisNativeBindings, roles: readonly string[]) {
  return roleObjects(bindings, roles).map((object) => bindings.sourceEdgesByObject.get(object.id) ?? []);
}

function valuableRegion(map: Civ5Map, object: BoundObject | undefined) {
  if (!object) return false;
  const source = validIndices(map, object.tileIndices);
  const passable = source.filter((index) => PASSABLE(map, index));
  const value = source.filter((index) => map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255);
  return source.length >= 7 && passable.length / source.length >= 0.5 && connectedShare(map, passable) >= 0.7 && value.length >= 1;
}

function causalObjectiveFacts(
  map: Civ5Map,
  graph: RealizedGraph,
  bindings: PolisNativeBindings,
  roles: readonly string[],
  minimum: number,
) {
  const objects = roleObjects(bindings, roles);
  const nodes = objects.flatMap((object) => {
    const source = bindings.sourceNodeByObject.get(object.id);
    return source ? [source] : [];
  });
  const unique = new Set(nodes.map((node) => node.id)).size === nodes.length;
  const details = objects.map((object) => {
    const node = bindings.sourceNodeByObject.get(object.id);
    const source = validIndices(map, object.tileIndices);
    const passable = source.filter((index) => PASSABLE(map, index));
    const value = source.filter((index) => map.tiles[index].resource !== 255 || map.tiles[index].wonder !== 255);
    const nodeId = node?.id;
    const incidentMajors = new Set((nodeId ? incidentEdges(nodeId, graph.edges) : []).flatMap((edge) => {
      const other = graph.nodes.get(edge.from === nodeId ? edge.to : edge.from);
      return other?.kind === "MAJOR_START" ? [other.id] : [];
    }));
    return {
      id: object.id,
      node: Boolean(node && node.kind === "OBJECTIVE"),
      valuable: valuableRegion(map, object),
      tiles: source.length,
      passableShare: source.length ? passable.length / source.length : 0,
      connectedShare: connectedShare(map, passable),
      value: value.length,
      incidentMajors: incidentMajors.size,
      valid: Boolean(node && node.kind === "OBJECTIVE") && valuableRegion(map, object)
        && incidentMajors.size >= Math.min(2, graph.majors.length),
    };
  });
  const individual = objects.length >= minimum && nodes.length === objects.length && unique && details.every((detail) => detail.valid);
  return { objects, nodes, individual, unique, details };
}

function centralToMajors(map: Civ5Map, graph: RealizedGraph, node: StrategicNode | undefined) {
  if (!node || !graph.majors.length) return false;
  const centerX = graph.majors.reduce((sum, major) => sum + major.x, 0) / graph.majors.length;
  const centerY = graph.majors.reduce((sum, major) => sum + major.y, 0) / graph.majors.length;
  return Math.hypot((node.x - centerX) / Math.max(1, map.width), (node.y - centerY) / Math.max(1, map.height)) <= 0.23;
}

function incidentEdges(nodeId: string, edges: readonly StrategicEdge[]) {
  return edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

export function proveImperialRingGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, [`No realized strategic graph exists. ${invalidGraphEvidence(map)}`]);
  const bindings = bindPolisNativeObjects("IMPERIAL_RING", map, adapter, graph);
  const ringObjects = roleObjects(bindings, ["LATERAL_RING"]);
  const ringEdges = [...new Map(roleEdgeBundles(bindings, ["LATERAL_RING"]).flat().map((edge) => [edge.id, edge])).values()];
  const majorIds = graph.majors.map((node) => node.id);
  const allowedRingNodes = new Set([...graph.nodes.values()]
    .filter((node) => node.kind === "MAJOR_START" || node.role === "LATERAL_RING_ANCHOR")
    .map((node) => node.id));
  const ringNodeIds = [...new Set(ringEdges.flatMap((edge) => [edge.from, edge.to]))];
  const axleObject = bindings.byRole.get("SHARED_OBJECTIVE")?.[0];
  const axle = axleObject ? bindings.sourceNodeByObject.get(axleObject.id) : undefined;
  const primaryObjects = roleObjects(bindings, ["PRIMARY_AXLE_APPROACH"]);
  const secondaryObjects = roleObjects(bindings, ["SECONDARY_AXLE_APPROACH"]);
  const primaryBundles = roleEdgeBundles(bindings, ["PRIMARY_AXLE_APPROACH"]);
  const secondaryBundles = roleEdgeBundles(bindings, ["SECONDARY_AXLE_APPROACH"]);
  const approaches = [...primaryBundles, ...secondaryBundles].flat();
  const approachNodes = new Set(approaches.flatMap((edge) => {
    if (!axle) return [];
    if (edge.from === axle.id && majorIds.includes(edge.to)) return [edge.to];
    if (edge.to === axle.id && majorIds.includes(edge.from)) return [edge.from];
    return [];
  }));
  const perMajorSpokes = Boolean(axle) && primaryObjects.length === majorIds.length && secondaryObjects.length === majorIds.length
    && majorIds.every((majorId) => {
      const primary = primaryBundles.filter((bundle) => bundle.some((edge) => [edge.from, edge.to].includes(majorId) && [edge.from, edge.to].includes(axle!.id)));
      const secondary = secondaryBundles.filter((bundle) => bundle.some((edge) => [edge.from, edge.to].includes(majorId) && [edge.from, edge.to].includes(axle!.id)));
      return primary.length === 1 && secondary.length === 1 && disjointBundles([primary[0], secondary[0]]);
    });
  const augmented = [...new Map([...ringEdges, ...approaches].map((edge) => [edge.id, edge])).values()];
  const augmentedNodes = axle ? [...ringNodeIds, axle.id] : ringNodeIds;
  const cycle = ringNodeIds.length >= 4 && ringEdges.every((edge) => allowedRingNodes.has(edge.from) && allowedRingNodes.has(edge.to)) && isSingleCycle(ringNodeIds, ringEdges);
  const privateRingInteriors = disjointBundles(ringEdges.map((edge) => [edge]));
  const physicalRing = privateRingInteriors && resilientPassableRouteNetwork(map, graph, ringEdges, ringNodeIds);
  const majorsOccupyCircuit = majorIds.every((id) => ringNodeIds.includes(id));
  const resilientAxle = Boolean(axle && approachNodes.size === majorIds.length && twoEdgeConnected(augmentedNodes, augmented)
    && resilientPassableRouteNetwork(map, graph, augmented, augmentedNodes));
  const physicalApproaches = perMajorSpokes;
  const valuableAxle = valuableRegion(map, axleObject);
  const objectives = causalObjectiveFacts(map, graph, bindings, ["SHARED_OBJECTIVE"], 2);
  const ok = bindings.complete && allMajorsAssigned(map, graph) && ringObjects.length >= 4
    && majorsOccupyCircuit && cycle && physicalRing && resilientAxle && physicalApproaches && valuableAxle && objectives.individual;
  return facts(ok, [`${ringObjects.length} exact lateral causes form a ${ringNodeIds.length}-node circuit occupied by all ${majorIds.length} majors; private route interiors=${privateRingInteriors} and tile-removal resilience=${physicalRing}; ${primaryObjects.length}+${secondaryObjects.length} exact primary/secondary spokes give every major two private axle entries, and ${objectives.objects.length}/2 authored objectives are individually valuable and contestable.`], bindings.objects, { completeBindings: bindings.complete, majors: majorIds.length, ringNodes: ringNodeIds.length, causalRingObjects: ringObjects.length, majorsOccupyCircuit, exactCircuit: cycle, privateRingInteriors, physicalRing, axleApproaches: approachNodes.size, exactPerMajorSpokes: perMajorSpokes, physicalApproaches, resilientAxle, valuableAxle, objectives: objectives.objects.length, individualObjectives: objectives.individual });
}

export function proveOpposingFrontsGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("OPPOSING_FRONTS", map, adapter, graph);
  const bundles = roleEdgeBundles(bindings, ["PRIMARY_HINGE", "SECONDARY_HINGE"]);
  const cross = bundles.flat();
  const teams = new Set(graph.majors.map((node) => teamOf(map, node)));
  const teamSizes = [...teams].map((team) => graph.majors.filter((node) => teamOf(map, node) === team).length);
  const equalTeams = teamSizes.length === 2 && teamSizes[0] === teamSizes[1] && teamSizes[0] > 0;
  const crossSide = cross.length >= 2 && cross.every((edge) => crossTeamEdges(map, graph).some((candidate) => candidate.id === edge.id));
  const hostile = cross.every((edge) => edge.kind !== "OPEN");
  const independent = bundles.length === 2 && bundles.every((bundle) => bundle.length > 0) && disjointBundles(bundles);
  const objectives = causalObjectiveFacts(map, graph, bindings, ["SHARED_OBJECTIVE"], 2);
  const coherent = connectedWithinTeams(map, graph);
  const expectedRegionBindings = adapter.causalObjects.filter((cause) => cause.retained && cause.kind === "REGION").length;
  const expectedPathBindings = adapter.causalObjects.filter((cause) => cause.retained && cause.kind === "RELATIONSHIP").length;
  const ok = bindings.complete && allMajorsAssigned(map, graph) && teams.size === 2
    && equalTeams && coherent && crossSide && hostile && independent && objectives.individual;
  return facts(ok, [`The ${teamSizes.join("/")} sides have exact bindings=${bindings.complete} (${bindings.sourceRegionByObject.size}/${expectedRegionBindings} regions, ${bindings.sourceEdgesByObject.size}/${expectedPathBindings} paths${bindings.failures.length ? `; ${bindings.failures.join(" | ")}` : ""}), coherent interiors=${coherent}, cross-front routes=${crossSide}, hostile media=${hostile}, tile-disjoint theatres=${independent}, and ${objectives.objects.length}/2 individually contestable objectives=${objectives.individual}.`], bindings.objects, { completeBindings: bindings.complete, regionBindings: bindings.sourceRegionByObject.size, expectedRegionBindings, pathBindings: bindings.sourceEdgesByObject.size, expectedPathBindings, teams: teams.size, equalTeams, coherentTeams: coherent, crossSideRoutes: cross.length, crossSide, hostileTheatres: hostile, independentTheatres: independent, objectives: objectives.objects.length, individualObjectives: objectives.individual });
}

export function proveContestedHeartlandGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("CONTESTED_HEARTLAND", map, adapter, graph);
  const majorIds = graph.majors.map((node) => node.id);
  const districtObjects = [...bindings.byRole.entries()].filter(([role]) => role.startsWith("HEARTLAND_DISTRICT_")).flatMap(([, objects]) => objects);
  const districtNodes = districtObjects.flatMap((object) => bindings.sourceNodesByObject.get(object.id) ?? []);
  const districtIds = districtNodes.map((node) => node.id);
  const approachBundles = roleEdgeBundles(bindings, ["MANY_APPROACHES", "SECONDARY_APPROACH"]);
  const throughBundles = roleEdgeBundles(bindings, ["HEARTLAND_THROUGH_ROUTE"]);
  const causalEdges = [...new Map([...approachBundles, ...throughBundles].flat().map((edge) => [edge.id, edge])).values()];
  const causalNodeIds = [...majorIds, ...districtIds];
  const majorAccess = graph.majors.every((major) => {
    const districts = new Set(causalEdges.filter((edge) => edge.from === major.id || edge.to === major.id)
      .map((edge) => edge.from === major.id ? edge.to : edge.from).filter((id) => districtIds.includes(id)));
    return districts.size >= 2;
  });
  const districtAccess = districtIds.every((id) => incidentEdges(id, causalEdges)
    .some((edge) => majorIds.includes(edge.from === id ? edge.to : edge.from)));
  const throughMesh = throughBundles.length >= districtIds.length && twoEdgeConnected(districtIds, throughBundles.flat());
  const privateThroughInteriors = disjointBundles(throughBundles);
  const physicalThroughMesh = privateThroughInteriors
    && resilientPassableRouteNetwork(map, graph, throughBundles.flat(), districtIds);
  const resilient = causalNodeIds.length >= 5 && twoEdgeConnected(causalNodeIds, causalEdges);
  const majorApproachFacts = graph.majors.map((major) => {
    const bundles = approachBundles.filter((bundle) => bundle.some((edge) => edge.from === major.id || edge.to === major.id));
    const destinations = new Set(bundles.flatMap((bundle) => bundle.flatMap((edge) => {
      if (edge.from === major.id && districtIds.includes(edge.to)) return [edge.to];
      if (edge.to === major.id && districtIds.includes(edge.from)) return [edge.from];
      return [];
    })));
    const startIndex = major.y * map.width + major.x;
    const separate = disjointBundlesOutside(bundles, expand(map, [startIndex], 1));
    return { major: major.id, bundles: bundles.length, destinations: destinations.size, separate };
  });
  const privateMajorApproaches = majorApproachFacts.every((entry) => entry.bundles === 2 && entry.destinations === 2 && entry.separate);
  const valuable = districtObjects.length >= 3 && districtObjects.every((object) => valuableRegion(map, object)
    && centralToMajors(map, graph, bindings.sourceNodeByObject.get(object.id)));
  const privateApproaches = distinctBundles(approachBundles, 0.12);
  const ok = bindings.complete && allMajorsAssigned(map, graph) && districtObjects.length >= 3 && districtObjects.length <= 6 && districtNodes.length === districtObjects.length
    && majorAccess && districtAccess && throughMesh && physicalThroughMesh && resilient && privateMajorApproaches && valuable && privateApproaches;
  return facts(ok, [`${majorIds.length} majors each retain two distinct entries into ${districtIds.length} individually valuable heartland districts; the district through-route mesh is ${throughMesh && physicalThroughMesh ? "graph- and tile-removal-resilient" : "collapsed through a shared gate"}, the abstract causal network is ${resilient ? "route-removal-resilient" : "brittle"}, and every major's two entries are ${privateMajorApproaches ? "physically separate" : "collapsed"} (${majorApproachFacts.map((entry) => `${entry.major}:${entry.bundles}/${entry.destinations}/${entry.separate ? "separate" : "shared"}`).join(", ")}).`], bindings.objects, { completeBindings: bindings.complete, majors: majorIds.length, districts: districtIds.length, majorAccess, districtAccess, throughMesh, privateThroughInteriors, physicalThroughMesh, resilientHeartland: resilient, privateMajorApproaches, valuableDistricts: valuable, privateApproaches });
}

export function proveRivalContinentsGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("RIVAL_CONTINENTS", map, adapter, graph);
  const bundles = roleEdgeBundles(bindings, ["PRIMARY_HINGE", "SECONDARY_HINGE"]);
  const cross = bundles.flat();
  const teams = new Set(graph.majors.map((node) => teamOf(map, node)));
  const teamSizes = [...teams].map((team) => graph.majors.filter((node) => teamOf(map, node) === team).length);
  const equalTeams = teamSizes.length === 2 && teamSizes[0] === teamSizes[1] && teamSizes[0] > 0;
  const crossSide = cross.length >= 2 && cross.every((edge) => crossTeamEdges(map, graph).some((candidate) => candidate.id === edge.id));
  const costly = cross.every((edge) => edge.kind === "NAVAL" || edge.kind === "PASS" || edge.kind === "LAND_BRIDGE")
    && bundles.every((bundle) => bundleInterior(bundle).length >= Math.max(4, Math.round(Math.min(map.width, map.height) * 0.25)));
  const independent = bundles.length === 2 && bundles.every((bundle) => bundle.length > 0) && disjointBundles(bundles);
  const primary = roleEdgeBundles(bindings, ["PRIMARY_HINGE"]);
  const secondary = roleEdgeBundles(bindings, ["SECONDARY_HINGE"]);
  const mixedMedia = primary.length === 1 && primary[0].length > 0 && primary[0].every((edge) => edge.kind === "NAVAL")
    && secondary.length === 1 && secondary[0].length > 0 && secondary[0].every((edge) => edge.kind !== "NAVAL");
  const objectives = causalObjectiveFacts(map, graph, bindings, ["SHARED_OBJECTIVE"], 2);
  const ok = bindings.complete && allMajorsAssigned(map, graph) && teams.size === 2
    && equalTeams && connectedWithinTeams(map, graph) && crossSide && costly && mixedMedia && independent && objectives.individual;
  return facts(ok, [`The ${teamSizes.join("/")} coherent continental blocs retain one exact maritime and one exact terrestrial costly hinge; their route interiors are ${independent ? "tile-disjoint" : "not independent"}, and ${objectives.objects.length}/2 hinge objectives are individually contestable.`], bindings.objects, { completeBindings: bindings.complete, teams: teams.size, equalTeams, hinges: cross.length, costlyHinges: costly, mixedMedia, independentHinges: independent, objectives: objectives.objects.length, individualObjectives: objectives.individual });
}

export function proveThreeRealmsGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("THREE_REALMS", map, adapter, graph);
  const primaryBundles = roleEdgeBundles(bindings, ["MUTUAL_BORDER"]);
  const secondaryBundles = roleEdgeBundles(bindings, ["SECONDARY_REALM_BORDER"]);
  const bundles = [...primaryBundles, ...secondaryBundles];
  const causalEdges = bundles.flat();
  const teams = [...new Set(graph.majors.map((node) => teamOf(map, node)).filter((team): team is number => team !== undefined))];
  const teamSizes = teams.map((team) => graph.majors.filter((node) => teamOf(map, node) === team).length);
  const balancedTeams = teamSizes.length === 3 && Math.max(...teamSizes) === Math.min(...teamSizes);
  const pairOfBundle = (bundle: readonly StrategicEdge[]) => {
    const pairs = new Set(bundle.flatMap((edge) => {
      const one = teamOf(map, graph.nodes.get(edge.from)!);
      const two = teamOf(map, graph.nodes.get(edge.to)!);
      return one === undefined || two === undefined || one === two ? [] : [[one, two].sort((left, right) => left - right).join(":")];
    }));
    return pairs.size === 1 ? [...pairs][0] : undefined;
  };
  const expectedPairs = new Set<string>();
  for (let one = 0; one < teams.length; one += 1) for (let two = one + 1; two < teams.length; two += 1) expectedPairs.add([teams[one], teams[two]].sort((left, right) => left - right).join(":"));
  const bundlesByPair = new Map([...expectedPairs].map((pair) => [pair, bundles.filter((bundle) => pairOfBundle(bundle) === pair)]));
  const k3 = teams.length === 3 && [...expectedPairs].every((pair) => (bundlesByPair.get(pair)?.length ?? 0) === 2);
  const pluralFrontiers = [...bundlesByPair.values()].every((pairBundles) => pairBundles.length === 2 && distinctBundles(pairBundles, 0.55));
  const allCross = causalEdges.every((edge) => crossTeamEdges(map, graph).some((candidate) => candidate.id === edge.id));
  const objectives = causalObjectiveFacts(map, graph, bindings, ["SHARED_OBJECTIVE"], 3);
  const coherent = connectedWithinTeams(map, graph);
  const assigned = allMajorsAssigned(map, graph);
  const ok = bindings.complete && assigned && balancedTeams && coherent
    && primaryBundles.length === 3 && secondaryBundles.length === 3 && allCross && k3 && pluralFrontiers && objectives.individual;
  return facts(ok, [`The ${teamSizes.join("/")} realm quotient has bindings=${bindings.complete}${bindings.failures.length ? ` (${bindings.failures.join(" | ")})` : ""}, assigned starts=${assigned}, coherent teams=${coherent}, primary/secondary crossings=${primaryBundles.length}/${secondaryBundles.length}, exact K3=${k3}, pairwise tile independence=${pluralFrontiers}, cross-team media=${allCross}, and objectives=${objectives.objects.length}/3 individually valid=${objectives.individual}.`], bindings.objects, { completeBindings: bindings.complete, teams: teams.length, balancedTeams, assignedStarts: assigned, coherentTeams: coherent, primaryBorders: primaryBundles.length, secondaryBorders: secondaryBundles.length, completeK3: k3, pluralFrontiers, allCausalBordersCrossTeams: allCross, objectives: objectives.objects.length, individualObjectives: objectives.individual });
}

export function proveThalassicLeagueGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("THALASSIC_LEAGUE", map, adapter, graph);
  const bundles = roleEdgeBundles(bindings, ["SEA_LANE", "REDUNDANT_SEA_LANE"]);
  const majorIds = graph.majors.map((node) => node.id);
  const naval = bundles.flat().filter((edge) => edge.kind === "NAVAL" && majorIds.includes(edge.from) && majorIds.includes(edge.to));
  const coastal = graph.majors.every((node) => neighbors(node.y * map.width + node.x, map).some((index) => WATER(map, index)));
  const resilient = majorIds.length >= 3 && twoEdgeConnected(majorIds, naval);
  const degree = adjacency(majorIds, naval);
  const pluralPorts = [...degree.values()].every((links) => links.size >= 2);
  const physicallyResilient = resilientNavalTileNetwork(map, graph, naval, majorIds);
  const objectives = causalObjectiveFacts(map, graph, bindings, ["DIPLOMATIC_PORT"], 3);
  const majorDistances = graph.majors.map((major) => traversableDistances(map, major.y * map.width + major.x));
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const cityStatesContestable = cityStates.every((cityState) => {
    const index = cityState.y * map.width + cityState.x;
    const distances = majorDistances.map((field) => field[index]).filter((distance) => distance >= 0).sort((one, two) => one - two);
    return PASSABLE(map, index) && neighbors(index, map).some((neighbor) => WATER(map, neighbor))
      && distances.length >= Math.min(2, majorIds.length)
      && distances[1] <= distances[0] * 1.75 + 4;
  });
  const assigned = allMajorsAssigned(map, graph);
  const ok = bindings.complete && assigned && coastal && resilient && pluralPorts
    && physicallyResilient && objectives.individual && cityStatesContestable;
  const objectiveSummary = objectives.details.map((detail) => `${detail.id}[node=${detail.node}, tiles=${detail.tiles}, passable=${detail.passableShare.toFixed(2)}, connected=${detail.connectedShare.toFixed(2)}, value=${detail.value}, majors=${detail.incidentMajors}]`).join(", ");
  return facts(ok, [`The ${majorIds.length}-port league has bindings=${bindings.complete}${bindings.failures.length ? ` (${bindings.failures.join(" | ")})` : ""}, assigned starts=${assigned}, coastal principals=${coastal}, plural ports=${pluralPorts}, bridge-free graph=${resilient}, physical water resilience=${physicallyResilient}, diplomatic ports=${objectives.objects.length}/3 valid=${objectives.individual}${objectiveSummary ? ` (${objectiveSummary})` : ""}, and city states=${cityStates.length} contestable=${cityStatesContestable}.`], bindings.objects, { completeBindings: bindings.complete, assignedStarts: assigned, ports: majorIds.length, navalLanes: naval.length, coastal, pluralPorts, physicallyResilient, twoEdgeConnected: resilient, objectives: objectives.objects.length, individualObjectives: objectives.individual, cityStates: cityStates.length, cityStatesContestable });
}

export function proveUnequalRealmsGraphFacts(map: Civ5Map, adapter: NarrativeAdapterEvidence) {
  const graph = realizedGraph(map);
  if (!graph) return facts(false, ["No realized strategic graph exists."]);
  const bindings = bindPolisNativeObjects("UNEQUAL_REALMS", map, adapter, graph);
  const roles = ["TALL", "WIDE", "WAR", "TURTLE"] as const;
  const regions = (map.structure?.objects ?? []).filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE" && roles.includes(String(object.attributes.contractRole) as typeof roles[number]));
  const byRole = new Map(roles.map((role) => [role, regions.filter((region) => region.attributes?.contractRole === role)]));
  const roleCounts = roles.map((role) => byRole.get(role)!.length);
  const balancedRoles = roleCounts.every((count) => count > 0) && Math.max(...roleCounts) - Math.min(...roleCounts) <= 1;
  const tileOwners = new Map<number, string>();
  let disjoint = true;
  for (const region of regions) for (const index of validIndices(map, region.tileIndices)) {
    if (tileOwners.has(index) && tileOwners.get(index) !== region.id) disjoint = false;
    tileOwners.set(index, region.id);
  }
  const assignedHomes = graph.majors.every((node) => {
    const start = actualStartForNode(map, node);
    const region = regions.find((candidate) => candidate.id === node.regionId && candidate.attributes?.owner === node.owner && candidate.attributes?.contractRole === node.role);
    if (!start || !region || !roles.includes(node.role as typeof roles[number])) return false;
    const passable = validIndices(map, region.tileIndices).filter((index) => PASSABLE(map, index));
    const startIndex = start.y * map.width + start.x;
    return tileOwners.get(startIndex) === region.id && passable.length >= 12 && connectedShare(map, passable) >= 0.75;
  });
  const roleIndices = (role: typeof roles[number]) => [...new Set(byRole.get(role)!.flatMap((region) => validIndices(map, region.tileIndices)))];
  const meanArea = (role: typeof roles[number]) => byRole.get(role)!.reduce((sum, region) => sum + validIndices(map, region.tileIndices).length, 0) / Math.max(1, byRole.get(role)!.length);
  const terrain = (role: typeof roles[number], value: number) => share(map, roleIndices(role), (index) => map.tiles[index].terrain === value);
  const resources = (role: typeof roles[number]) => share(map, roleIndices(role), (index) => map.tiles[index].resource !== 255);
  const areaSignature = meanArea("WIDE") > meanArea("TURTLE") && meanArea("TURTLE") > meanArea("TALL");
  const terrainSignature = terrain("TALL", 2) > terrain("WAR", 2) && terrain("WAR", 3) > terrain("TALL", 3);
  const resourceSignature = resources("TALL") > resources("WIDE");
  const signatures = areaSignature && terrainSignature && resourceSignature;
  const causalRoles = roles.every((role) => (bindings.byRole.get(role)?.length ?? 0) === 1);
  const contacts = roleEdgeBundles(bindings, ["ROLE_CONTACT"]);
  const contactRoles = new Set(contacts.flat().map((edge) => [graph.nodes.get(edge.from)?.role, graph.nodes.get(edge.to)?.role].sort().join(":")));
  const warTargets = graph.majors.filter((node) => node.role === "WAR").every((node) => new Set(incidentEdges(node.id, graph.edges).map((edge) => edge.from === node.id ? edge.to : edge.from).filter((id) => graph.nodes.get(id)?.kind === "MAJOR_START")).size >= 2);
  const turtleApproaches = graph.majors.filter((node) => node.role === "TURTLE").every((node) => {
    const costly = incidentEdges(node.id, graph.edges).filter((edge) => edge.kind === "PASS" || edge.kind === "LAND_BRIDGE");
    const destinations = new Set(costly.map((edge) => edge.from === node.id ? edge.to : edge.from));
    return destinations.size >= 2 && disjointBundles(costly.map((edge) => [edge]));
  });
  const density = (region: GeographicObject, predicate: (index: number) => boolean) => share(map, validIndices(map, region.tileIndices), predicate);
  const tallHomes = byRole.get("TALL")!;
  const wideHomes = byRole.get("WIDE")!;
  const warHomes = byRole.get("WAR")!;
  const turtleHomes = byRole.get("TURTLE")!;
  const perHomeResources = regions.every((region) => region.tileIndices.some((index) => map.tiles[index].resource !== 255));
  const tallValue = tallHomes.every((region) => region.tileIndices.some((index) => map.tiles[index].resource !== 255));
  const wideCapacity = wideHomes.every((region) => region.tileIndices.length > Math.max(...tallHomes.map((tall) => tall.tileIndices.length)));
  const warMaterial = warHomes.every((region) => density(region, (index) => map.tiles[index].terrain === 3) > Math.max(...tallHomes.map((tall) => density(tall, (index) => map.tiles[index].terrain === 3))));
  const turtleReliefDensities = turtleHomes.map((region) => density(region, (index) => map.tiles[index].elevation === 1));
  const turtleRelief = turtleReliefDensities.every((value) => value >= 0.08);
  const individualRoleHomes = perHomeResources && tallValue && wideCapacity && warMaterial && turtleRelief;
  const objectives = causalObjectiveFacts(map, graph, bindings, ["SHARED_OBJECTIVE"], 3);
  const objectiveSummary = objectives.details.map((detail) => `${detail.id}[tiles=${detail.tiles},passable=${detail.passableShare.toFixed(2)},value=${detail.value},majors=${detail.incidentMajors}]`).join(", ");
  const ok = bindings.complete && allMajorsAssigned(map, graph) && causalRoles && contacts.length >= 4 && contactRoles.size >= 4
    && balancedRoles && disjoint && assignedHomes && signatures && individualRoleHomes && warTargets && turtleApproaches && objectives.individual;
  return facts(ok, [`${graph.majors.length} majors have balanced ${roleCounts.join("/")} Tall/Wide/War/Turtle assignments and ${disjoint ? "disjoint" : "overlapping"} homes; bindings=${bindings.complete}, assigned=${assignedHomes}, areas=${meanArea("TALL").toFixed(1)}/${meanArea("WIDE").toFixed(1)}/${meanArea("WAR").toFixed(1)}/${meanArea("TURTLE").toFixed(1)}, area/terrain/resource signatures=${areaSignature}/${terrainSignature}/${resourceSignature}, per-home resources=${perHomeResources}, Tall value=${tallValue}, Wide capacity=${wideCapacity}, War material=${warMaterial}, Turtle relief=${turtleRelief} (${turtleReliefDensities.map((value) => value.toFixed(2)).join(",")}), War targets=${warTargets}, independent Turtle approaches=${turtleApproaches}, and objectives=${objectives.objects.length}/3 valid=${objectives.individual}${objectiveSummary ? ` (${objectiveSummary})` : ""}.`], bindings.objects, { completeBindings: bindings.complete, causalRoles, roleCountsBalanced: balancedRoles, roleContacts: contacts.length, distinctRoleContacts: contactRoles.size, disjointHomes: disjoint, assignedHomes, areaSignature, terrainSignature, resourceSignature, distinctSignatures: signatures, perHomeResources, tallValue, wideCapacity, warMaterial, turtleRelief, individualRoleHomes, warTargets, turtleApproaches, objectives: objectives.objects.length, individualObjectives: objectives.individual, tallArea: meanArea("TALL"), wideArea: meanArea("WIDE"), warArea: meanArea("WAR"), turtleArea: meanArea("TURTLE") });
}

export function provePhysicalPolisNativeFacts(profileId: string, map: Civ5Map, adapter: NarrativeAdapterEvidence): NarrativeNativeProofFacts {
  switch (profileId) {
    case "DYNAMIC_EARTH": return proveDynamicEarthSpatialFacts(map, adapter);
    case "COLLIDING_PLATES": return proveCollidingPlatesSpatialFacts(map, adapter);
    case "ANCIENT_CRATONS": return proveAncientCratonsSpatialFacts(map, adapter);
    case "ISLAND_ARC_EARTH": return proveIslandArcSpatialFacts(map, adapter);
    case "SUPERCONTINENT_INTERIOR": return proveSupercontinentInteriorSpatialFacts(map, adapter);
    case "MONSOON_CONTINENTS": return proveMonsoonContinentsSpatialFacts(map, adapter);
    case "ICEHOUSE_EARTH": return proveIcehouseEarthSpatialFacts(map, adapter);
    case "IMPERIAL_RING": return proveImperialRingGraphFacts(map, adapter);
    case "OPPOSING_FRONTS": return proveOpposingFrontsGraphFacts(map, adapter);
    case "CONTESTED_HEARTLAND": return proveContestedHeartlandGraphFacts(map, adapter);
    case "RIVAL_CONTINENTS": return proveRivalContinentsGraphFacts(map, adapter);
    case "THREE_REALMS": return proveThreeRealmsGraphFacts(map, adapter);
    case "THALASSIC_LEAGUE": return proveThalassicLeagueGraphFacts(map, adapter);
    case "UNEQUAL_REALMS": return proveUnequalRealmsGraphFacts(map, adapter);
    default: return facts(false, [`${profileId} has no Physical/Polis native proof implementation.`]);
  }
}
