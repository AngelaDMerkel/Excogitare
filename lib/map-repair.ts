import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import {
  adjacentCoordinates,
  featurePlacementVerdict,
  isPassableLand,
  isWaterTerrain,
  nearestValidTile,
  resourcePlacementVerdict,
  wonderPlacementVerdict,
} from "./civ5-rules.ts";

export type RepairProfile = "SAFE" | "STANDARD" | "COMPETITIVE";
export type RepairCategory = "STRUCTURE" | "RESOURCES" | "FEATURES" | "WONDERS" | "RIVERS" | "STARTS" | "SCENARIO" | "VISUAL";
export type RepairMutation =
  | { kind: "SET_TILE"; index: number; changes: Partial<Civ5Tile> }
  | { kind: "MOVE_RESOURCE"; from: number; to: number }
  | { kind: "MOVE_WONDER"; from: number; to: number }
  | { kind: "MOVE_START"; startIndex: number; x: number; y: number }
  | { kind: "SET_START"; startIndex: number; changes: Partial<Civ5StartLocation> }
  | { kind: "SET_PLAYERS"; players: number };

export type RepairIssue = {
  id: string;
  category: RepairCategory;
  severity: "ERROR" | "WARNING" | "INFO";
  confidence: "CERTAIN" | "HIGH" | "REVIEW";
  title: string;
  detail: string;
  x?: number;
  y?: number;
  tileIndex?: number;
  mutation?: RepairMutation;
  minimumProfile: RepairProfile;
};

const PROFILE_ORDER: Record<RepairProfile, number> = { SAFE: 0, STANDARD: 1, COMPETITIVE: 2 };

export function issueSelectedByProfile(issue: RepairIssue, profile: RepairProfile) {
  return Boolean(issue.mutation) && PROFILE_ORDER[profile] >= PROFILE_ORDER[issue.minimumProfile];
}

function tileLocation(map: Civ5Map, index: number) {
  return { x: index % map.width, y: Math.floor(index / map.width), tileIndex: index };
}

function hexDistance(a: [number, number], b: [number, number], width: number, wraps: boolean) {
  const cube = ([x, y]: [number, number]) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y];
  };
  const direct = (one: [number, number], two: [number, number]) => {
    const ac = cube(one);
    const bc = cube(two);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(a, b);
  return Math.min(direct(a, b), direct([a[0] - width, a[1]], b), direct([a[0] + width, a[1]], b));
}

function riverNeighbor(map: Civ5Map, index: number, bit: number) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  const [dx, dy] = bit === 1 ? [-1, 0] : bit === 2 ? (y % 2 === 0 ? [-1, -1] : [0, -1]) : (y % 2 === 0 ? [0, -1] : [1, -1]);
  let nx = x + dx;
  const ny = y + dy;
  if (map.wraps) nx = (nx + map.width) % map.width;
  if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) return null;
  return ny * map.width + nx;
}

export function buildRepairIssues(map: Civ5Map): RepairIssue[] {
  const issues: RepairIssue[] = [];
  const reservedResources = new Set<number>();
  const reservedWonders = new Set<number>();
  const add = (issue: RepairIssue) => issues.push(issue);

  if (map.tiles.length !== map.width * map.height) {
    add({ id: "structure-tile-count", category: "STRUCTURE", severity: "ERROR", confidence: "CERTAIN", title: "Incomplete tile grid", detail: `Expected ${map.width * map.height} tiles but found ${map.tiles.length}.`, minimumProfile: "SAFE" });
  }

  for (let index = 0; index < map.tiles.length; index += 1) {
    const tile = map.tiles[index];
    const location = tileLocation(map, index);
    if (tile.terrain < 0 || tile.terrain >= map.terrains.length) {
      add({ id: `terrain-index-${index}`, category: "STRUCTURE", severity: "ERROR", confidence: "CERTAIN", title: "Missing terrain definition", detail: `Terrain index ${tile.terrain} does not exist; replace it with the first defined terrain.`, ...location, mutation: { kind: "SET_TILE", index, changes: { terrain: 0 } }, minimumProfile: "SAFE" });
    }
    if (tile.elevation < 0 || tile.elevation > 2) {
      add({ id: `elevation-${index}`, category: "VISUAL", severity: "ERROR", confidence: "CERTAIN", title: "Invalid elevation", detail: `Elevation ${tile.elevation} cannot render correctly; flatten this tile.`, ...location, mutation: { kind: "SET_TILE", index, changes: { elevation: 0 } }, minimumProfile: "SAFE" });
    }

    const resourceVerdict = resourcePlacementVerdict(map, tile);
    if (!resourceVerdict.valid) {
      const target = nearestValidTile(map, index, (candidate) => candidate.resource === 255 && candidate.wonder === 255 && resourcePlacementVerdict(map, { ...candidate, resource: tile.resource }).valid, reservedResources);
      if (target !== null) reservedResources.add(target);
      add({
        id: `resource-${index}`,
        category: "RESOURCES",
        severity: "ERROR",
        confidence: "CERTAIN",
        title: "Illegal resource placement",
        detail: target === null ? `${resourceVerdict.reason} No safe relocation was found.` : `${resourceVerdict.reason} Move it to the nearest compatible empty tile.`,
        ...location,
        mutation: target === null ? undefined : { kind: "MOVE_RESOURCE", from: index, to: target },
        minimumProfile: "STANDARD",
      });
    }

    const featureVerdict = featurePlacementVerdict(map, tile);
    if (!featureVerdict.valid) {
      add({ id: `feature-${index}`, category: "FEATURES", severity: "ERROR", confidence: "CERTAIN", title: "Illegal terrain feature", detail: `${featureVerdict.reason} Remove the incompatible feature.`, ...location, mutation: { kind: "SET_TILE", index, changes: { feature: 255 } }, minimumProfile: "SAFE" });
    }

    const wonderVerdict = wonderPlacementVerdict(map, tile);
    if (!wonderVerdict.valid) {
      const target = nearestValidTile(map, index, (candidate) => candidate.wonder === 255 && candidate.resource === 255 && wonderPlacementVerdict(map, { ...candidate, wonder: tile.wonder }).valid, reservedWonders);
      if (target !== null) reservedWonders.add(target);
      add({ id: `wonder-${index}`, category: "WONDERS", severity: "ERROR", confidence: "HIGH", title: "Illegal natural wonder placement", detail: target === null ? `${wonderVerdict.reason} Manual placement is required.` : `${wonderVerdict.reason} Move it to the nearest compatible empty tile.`, ...location, mutation: target === null ? undefined : { kind: "MOVE_WONDER", from: index, to: target }, minimumProfile: "STANDARD" });
    }
    if (tile.resource !== 255 && tile.wonder !== 255 && resourceVerdict.valid) {
      const target = nearestValidTile(map, index, (candidate, candidateIndex) => candidate.resource === 255 && candidate.wonder === 255 && resourcePlacementVerdict(map, { ...candidate, resource: tile.resource }).valid && !reservedResources.has(candidateIndex), reservedResources);
      if (target !== null) reservedResources.add(target);
      add({ id: `overlap-${index}`, category: "VISUAL", severity: "ERROR", confidence: "CERTAIN", title: "Wonder and resource overlap", detail: target === null ? "A natural wonder and resource occupy the same rendered tile; manual relocation is required." : "A natural wonder and resource occupy the same rendered tile; relocate the resource to the nearest legal tile.", ...location, mutation: target === null ? undefined : { kind: "MOVE_RESOURCE", from: index, to: target }, minimumProfile: "STANDARD" });
    }

    let repairedRiver = tile.river & 7;
    for (const bit of [1, 2, 4]) {
      if (!(repairedRiver & bit)) continue;
      const neighbor = riverNeighbor(map, index, bit);
      if (neighbor === null || (isWaterTerrain(map, tile) && isWaterTerrain(map, map.tiles[neighbor]))) repairedRiver &= ~bit;
    }
    if (repairedRiver !== tile.river) {
      add({ id: `river-mask-${index}`, category: "RIVERS", severity: "ERROR", confidence: "CERTAIN", title: "Invalid river edge", detail: "Remove unsupported or all-water river edges while preserving valid edges on this tile.", ...location, mutation: { kind: "SET_TILE", index, changes: { river: repairedRiver } }, minimumProfile: "SAFE" });
    } else if (repairedRiver && !adjacentCoordinates(location.x, location.y, map.width, map.height, map.wraps).some(([x, y]) => map.tiles[y * map.width + x].river & 7)) {
      add({ id: `river-fragment-${index}`, category: "RIVERS", severity: "WARNING", confidence: "HIGH", title: "Disconnected river fragment", detail: "This isolated segment cannot form a continuous visible river; remove it.", ...location, mutation: { kind: "SET_TILE", index, changes: { river: 0 } }, minimumProfile: "STANDARD" });
    }
  }

  const passableComponents: Array<Set<number>> = [];
  const unvisitedPassable = new Set(map.tiles.flatMap((tile, index) => isPassableLand(map, tile) ? [index] : []));
  while (unvisitedPassable.size) {
    const origin = unvisitedPassable.values().next().value as number;
    const component = new Set<number>([origin]);
    const queue = [origin];
    unvisitedPassable.delete(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      for (const [nx, ny] of adjacentCoordinates(x, y, map.width, map.height, map.wraps)) {
        const neighbor = ny * map.width + nx;
        if (!unvisitedPassable.has(neighbor)) continue;
        unvisitedPassable.delete(neighbor);
        component.add(neighbor);
        queue.push(neighbor);
      }
    }
    passableComponents.push(component);
  }
  passableComponents.sort((one, two) => two.size - one.size);
  const largestPassableComponent = passableComponents[0] ?? new Set<number>();
  const occupiedStarts = new Set<number>();
  for (let startIndex = 0; startIndex < map.startLocations.length; startIndex += 1) {
    const start = map.startLocations[startIndex];
    const inBounds = start.x >= 0 && start.y >= 0 && start.x < map.width && start.y < map.height;
    const index = inBounds ? start.y * map.width + start.x : 0;
    const duplicate = inBounds && occupiedStarts.has(index);
    const invalid = !inBounds || !isPassableLand(map, map.tiles[index]) || duplicate;
    if (invalid) {
      const target = nearestValidTile(map, index, (tile, candidateIndex) => isPassableLand(map, tile) && tile.wonder === 255 && !occupiedStarts.has(candidateIndex), occupiedStarts);
      if (target !== null) occupiedStarts.add(target);
      add({ id: `start-${startIndex}`, category: "STARTS", severity: "ERROR", confidence: "CERTAIN", title: duplicate ? "Overlapping start locations" : "Invalid start location", detail: target === null ? "No safe passable location was found for this start." : "Move the start to the nearest unoccupied passable land tile.", x: start.x, y: start.y, tileIndex: inBounds ? index : undefined, mutation: target === null ? undefined : { kind: "MOVE_START", startIndex, x: target % map.width, y: Math.floor(target / map.width) }, minimumProfile: "SAFE" });
    } else {
      occupiedStarts.add(index);
      const component = passableComponents.find((candidate) => candidate.has(index));
      const minimumReachable = Math.min(12, largestPassableComponent.size);
      if (component && component.size < minimumReachable) {
        const target = nearestValidTile(map, index, (tile, candidateIndex) => isPassableLand(map, tile) && tile.wonder === 255 && largestPassableComponent.has(candidateIndex) && !occupiedStarts.has(candidateIndex), occupiedStarts);
        if (target !== null) occupiedStarts.add(target);
        add({ id: `start-access-${startIndex}`, category: "STARTS", severity: "ERROR", confidence: "HIGH", title: "Start trapped in an inaccessible pocket", detail: target === null ? `Only ${component.size} passable tiles are reachable and no safe relocation was found.` : `Only ${component.size} passable tiles are reachable without crossing mountains or water; move the start into the main accessible land region.`, x: start.x, y: start.y, tileIndex: index, mutation: target === null ? undefined : { kind: "MOVE_START", startIndex, x: target % map.width, y: Math.floor(target / map.width) }, minimumProfile: "STANDARD" });
      }
    }
    if (start.cityState && start.playable) {
      add({ id: `city-state-playable-${startIndex}`, category: "SCENARIO", severity: "WARNING", confidence: "CERTAIN", title: "Playable city state", detail: "City-state records should not be marked as major playable civilizations.", x: start.x, y: start.y, tileIndex: inBounds ? index : undefined, mutation: { kind: "SET_START", startIndex, changes: { playable: false } }, minimumProfile: "SAFE" });
    }
  }

  const starts = map.startLocations.filter((start) => !start.cityState);
  for (let one = 0; one < starts.length; one += 1) {
    for (let two = one + 1; two < starts.length; two += 1) {
      const distance = hexDistance([starts[one].x, starts[one].y], [starts[two].x, starts[two].y], map.width, map.wraps);
      if (distance < 4) add({ id: `start-spacing-${one}-${two}`, category: "STARTS", severity: "WARNING", confidence: "REVIEW", title: "Major starts are very close", detail: `Players ${starts[one].player + 1} and ${starts[two].player + 1} are only ${distance} hexes apart. Competitive repair recommends manual review.`, x: starts[two].x, y: starts[two].y, tileIndex: starts[two].y * map.width + starts[two].x, minimumProfile: "COMPETITIVE" });
    }
  }
  if (starts.length !== map.players) add({ id: "player-count", category: "SCENARIO", severity: "WARNING", confidence: "CERTAIN", title: "Player count mismatch", detail: `Set the header player count from ${map.players} to ${starts.length}.`, mutation: { kind: "SET_PLAYERS", players: starts.length }, minimumProfile: "SAFE" });

  if (!issues.length) add({ id: "clean", category: "STRUCTURE", severity: "INFO", confidence: "CERTAIN", title: "No repairs required", detail: "The supported geography, placement, river, and start-location checks passed.", minimumProfile: "SAFE" });
  return issues;
}

export function applyRepairIssues(map: Civ5Map, issues: RepairIssue[], selectedIds: ReadonlySet<string>) {
  const result: Civ5Map = { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), startLocations: map.startLocations.map((start) => ({ ...start })) };
  for (const issue of issues) {
    if (!selectedIds.has(issue.id) || !issue.mutation) continue;
    const mutation = issue.mutation;
    if (mutation.kind === "SET_TILE") Object.assign(result.tiles[mutation.index], mutation.changes);
    else if (mutation.kind === "MOVE_RESOURCE") {
      const source = result.tiles[mutation.from];
      const target = result.tiles[mutation.to];
      target.resource = source.resource;
      target.resourceAmount = source.resourceAmount;
      source.resource = 255;
      source.resourceAmount = 0;
    } else if (mutation.kind === "MOVE_WONDER") {
      result.tiles[mutation.to].wonder = result.tiles[mutation.from].wonder;
      result.tiles[mutation.from].wonder = 255;
    } else if (mutation.kind === "MOVE_START") Object.assign(result.startLocations[mutation.startIndex], { x: mutation.x, y: mutation.y });
    else if (mutation.kind === "SET_START") Object.assign(result.startLocations[mutation.startIndex], mutation.changes);
    else if (mutation.kind === "SET_PLAYERS") result.players = mutation.players;
  }
  return result;
}

export function cloneMap(map: Civ5Map) {
  return { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), startLocations: map.startLocations.map((start) => ({ ...start })) };
}
