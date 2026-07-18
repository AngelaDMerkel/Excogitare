import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { cloneGenerationStructure, markGenerationStructureStale } from "./generation-structure.ts";
import { cloneGenerationRecipe } from "./generation-recipe.ts";
import { balanceMapStarts, DEFAULT_GENERATION_OPTIONS, generateRiverNetwork, MAP_SIZES } from "./map-generator.ts";
import { RIVER_DATA_MASK, riverEdgeDefinitions } from "./rivers.ts";
import { MINIMUM_START_DISTANCE } from "./start-locations.ts";
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
export type RepairCategory = "STRUCTURE" | "RESOURCES" | "FEATURES" | "WONDERS" | "RIVERS" | "STARTS" | "CITIES" | "SCENARIO" | "VISUAL";
export type RepairMutation =
  | { kind: "SET_TILE"; index: number; changes: Partial<Civ5Tile> }
  | { kind: "MOVE_RESOURCE"; from: number; to: number }
  | { kind: "REMOVE_RESOURCE"; index: number }
  | { kind: "MOVE_WONDER"; from: number; to: number }
  | { kind: "MOVE_START"; startIndex: number; x: number; y: number }
  | { kind: "SET_START"; startIndex: number; changes: Partial<Civ5StartLocation> }
  | { kind: "REPLACE_STARTS"; starts: Civ5StartLocation[]; players: number }
  | { kind: "MOVE_CITY"; id: number; fromX: number; fromY: number; x: number; y: number }
  | { kind: "REMOVE_CITY_LINK"; id: number; x: number; y: number }
  | { kind: "SET_RIVER_NETWORK"; rivers: number[] }
  | { kind: "NORMALIZE_SCENARIO_MARKER"; marker: number }
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

function closestMapSize(map: Civ5Map) {
  const area = map.width * map.height;
  return [...MAP_SIZES].sort((one, two) => Math.abs(one.width * one.height - area) - Math.abs(two.width * two.height - area))[0];
}

function balancedReplacementStarts(map: Civ5Map, majorCount: number, cityStateCount: number) {
  const size = closestMapSize(map);
  const balanced = balanceMapStarts(map, {
    ...DEFAULT_GENERATION_OPTIONS,
    size: size.id,
    seed: `repair-starts:${map.name}:${map.width}x${map.height}`,
    players: Math.max(2, majorCount),
    cityStates: Math.max(0, cityStateCount),
    balance: "TOURNAMENT",
    startQuality: "STANDARD",
    strategicBalance: false,
    cityStateMinSpacing: MINIMUM_START_DISTANCE,
  });
  const existingMajors = map.startLocations.filter((start) => !start.cityState);
  const existingCityStates = map.startLocations.filter((start) => start.cityState);
  const merge = (proposed: Civ5StartLocation[], existing: Civ5StartLocation[], cityState: boolean) => proposed.map((position, index) => existing[index]
    ? { ...existing[index], x: position.x, y: position.y, playable: !cityState, cityState }
    : { ...position, playable: !cityState, cityState });
  const starts = [
    ...merge(balanced.startLocations.filter((start) => !start.cityState), existingMajors, false),
    ...merge(balanced.startLocations.filter((start) => start.cityState), existingCityStates, true),
  ];
  const players = starts.filter((start) => !start.cityState).length;
  const cityStates = starts.filter((start) => start.cityState).length;
  return { starts, players, cityStates, complete: players === Math.max(2, majorCount) && cityStates === Math.max(0, cityStateCount) };
}

function flexibleReplacementStarts(map: Civ5Map, majorCount: number, cityStateCount: number) {
  for (let players = Math.max(2, majorCount); players >= 2; players -= 1) {
    const replacement = balancedReplacementStarts(map, players, cityStateCount);
    if (replacement.players === players) return replacement;
  }
  return undefined;
}

type RepairRiverEdge = { a: string; b: string; tiles: [number, number] };

function rebuildLogicalRivers(map: Civ5Map) {
  const edges: RepairRiverEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const vertexTiles = new Map<string, Set<number>>();
  let invalidEdges = map.tiles.filter((tile) => Boolean(tile.river & ~RIVER_DATA_MASK)).length;
  const addVertexEdge = (vertex: string, edge: number) => adjacency.set(vertex, [...(adjacency.get(vertex) ?? []), edge]);
  const addVertexTiles = (vertex: string, tiles: [number, number]) => {
    const values = vertexTiles.get(vertex) ?? new Set<number>();
    for (const tile of tiles) values.add(tile);
    vertexTiles.set(vertex, values);
  };
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const owner = y * map.width + x;
      for (const definition of riverEdgeDefinitions(x, y)) {
        const enabled = Boolean(map.tiles[owner].river & definition.bit);
        let nextX = x + definition.dx;
        const nextY = y + definition.dy;
        if (map.wraps) nextX = (nextX + map.width) % map.width;
        if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height || Math.abs(nextX - x) > 1) {
          if (enabled) invalidEdges += 1;
          continue;
        }
        const neighbor = nextY * map.width + nextX;
        addVertexTiles(definition.a, [owner, neighbor]);
        addVertexTiles(definition.b, [owner, neighbor]);
        // Civ5 rivers occupy edges between two land plots. Their mouth is the
        // endpoint where that land edge meets an ocean, coast, or lake plot.
        // Keeping a river bit on a shoreline or open-water edge renders the
        // channel in the water rather than terminating it.
        if (isWaterTerrain(map, map.tiles[owner]) || isWaterTerrain(map, map.tiles[neighbor])) {
          if (enabled) invalidEdges += 1;
          continue;
        }
        if (!enabled) continue;
        const edgeIndex = edges.length;
        edges.push({ a: definition.a, b: definition.b, tiles: [owner, neighbor] });
        addVertexEdge(definition.a, edgeIndex);
        addVertexEdge(definition.b, edgeIndex);
      }
    }
  }

  const invalidComponents: string[] = [];
  const visitedVertices = new Set<string>();
  for (const origin of adjacency.keys()) {
    if (visitedVertices.has(origin)) continue;
    const queue = [origin];
    const vertices: string[] = [];
    const componentEdges = new Set<number>();
    visitedVertices.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      vertices.push(vertex);
      for (const edgeIndex of adjacency.get(vertex) ?? []) {
        componentEdges.add(edgeIndex);
        const edge = edges[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (visitedVertices.has(next)) continue;
        visitedVertices.add(next);
        queue.push(next);
      }
    }
    const endpoints = vertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) === 1);
    const vertexTouches = (vertex: string, predicate: (tile: Civ5Tile) => boolean) => [...(vertexTiles.get(vertex) ?? [])].some((index) => predicate(map.tiles[index]));
    const waterEndpoints = endpoints.filter((vertex) => vertexTouches(vertex, (tile) => isWaterTerrain(map, tile)));
    const mountainEndpoints = endpoints.filter((vertex) => vertexTouches(vertex, (tile) => tile.elevation === 2 && !isWaterTerrain(map, tile)));
    const deadEnds = endpoints.filter((vertex) => !waterEndpoints.includes(vertex) && !mountainEndpoints.includes(vertex));
    const waterInsideChannel = vertices.some((vertex) => (adjacency.get(vertex)?.length ?? 0) > 1 && vertexTouches(vertex, (tile) => isWaterTerrain(map, tile)));
    if (componentEdges.size < 3) invalidComponents.push("short fragment");
    if (componentEdges.size !== vertices.length - 1) invalidComponents.push("loop or broken junction");
    if (!mountainEndpoints.length) invalidComponents.push("no mountain headwater");
    if (!waterEndpoints.length) invalidComponents.push("no ocean or lake outlet");
    if (deadEnds.length) invalidComponents.push("inland dead end");
    if (waterInsideChannel) invalidComponents.push("river continues through water");
  }
  if (!map.tiles.some((tile) => tile.river) || (!invalidEdges && !invalidComponents.length)) return null;

  let seed = 2166136261;
  for (const character of `${map.name}:${map.width}x${map.height}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const relief = map.tiles.map((tile) => tile.elevation * 0.42 + (isWaterTerrain(map, tile) ? -0.2 : 0.18));
  const moisture = map.tiles.map((tile) => {
    const terrain = map.terrains[tile.terrain] ?? "";
    return terrain.includes("GRASS") ? 1 : terrain.includes("PLAINS") ? 0.68 : terrain.includes("TUNDRA") ? 0.42 : terrain.includes("DESERT") ? 0.12 : isWaterTerrain(map, tile) ? 1 : 0.5;
  });
  const waterMask = map.tiles.map((tile) => isWaterTerrain(map, tile));
  const rivers = [...generateRiverNetwork(map.tiles, relief, moisture, map.width, map.height, map.wraps, "REALISTIC", "NORMAL", random, waterMask)];
  const reasons = [...new Set([...(invalidEdges ? ["invalid edges"] : []), ...invalidComponents])];
  return { rivers, reasons };
}

export function buildRepairIssues(map: Civ5Map): RepairIssue[] {
  const issues: RepairIssue[] = [];
  const reservedResources = new Set<number>();
  const reservedWonders = new Set<number>();
  const add = (issue: RepairIssue) => issues.push(issue);

  if (map.tiles.length !== map.width * map.height) {
    add({ id: "structure-tile-count", category: "STRUCTURE", severity: "ERROR", confidence: "CERTAIN", title: "Incomplete tile grid", detail: `Expected ${map.width * map.height} tiles but found ${map.tiles.length}.`, minimumProfile: "SAFE" });
  }

  const expectedScenarioMarker = map.scenarioDataPresent ? 8 : 0;
  if (map.source === "file" && map.scenarioMarker !== undefined && map.scenarioMarker !== expectedScenarioMarker) {
    add({
      id: "structure-scenario-marker",
      category: "STRUCTURE",
      severity: "ERROR",
      confidence: "CERTAIN",
      title: "Invalid scenario header",
      detail: map.scenarioDataPresent
        ? `The file contains scenario data but declares marker 0x${map.scenarioMarker.toString(16).toUpperCase()}; Civ V WorldBuilder files use marker 0x8. Normalize the header without changing the scenario content.`
        : `The file declares scenario marker 0x${map.scenarioMarker.toString(16).toUpperCase()} but contains geography only. Remove the false scenario marker.`,
      mutation: { kind: "NORMALIZE_SCENARIO_MARKER", marker: expectedScenarioMarker },
      minimumProfile: "SAFE",
    });
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
        detail: target === null ? `${resourceVerdict.reason} No legal destination exists, so delete the resource.` : `${resourceVerdict.reason} Move it to the nearest compatible empty tile.`,
        ...location,
        mutation: target === null ? { kind: "REMOVE_RESOURCE", index } : { kind: "MOVE_RESOURCE", from: index, to: target },
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
      add({ id: `overlap-${index}`, category: "VISUAL", severity: "ERROR", confidence: "CERTAIN", title: "Wonder and resource overlap", detail: target === null ? "A natural wonder and resource occupy the same rendered tile; no legal destination exists, so delete the resource." : "A natural wonder and resource occupy the same rendered tile; relocate the resource to the nearest legal tile.", ...location, mutation: target === null ? { kind: "REMOVE_RESOURCE", index } : { kind: "MOVE_RESOURCE", from: index, to: target }, minimumProfile: "STANDARD" });
    }
  }

  const riverRepair = rebuildLogicalRivers(map);
  if (riverRepair) {
    const firstRiver = map.tiles.findIndex((tile) => tile.river !== 0);
    const replacementCount = riverRepair.rivers.filter(Boolean).length;
    add({ id: "river-network", category: "RIVERS", severity: "ERROR", confidence: "HIGH", title: "Illogical river network", detail: `${riverRepair.reasons.join(", ")}. Rebuild the river system as continuous mountain-to-ocean-or-lake drainage with no water-edge segments${replacementCount ? "." : "; no viable route exists, so remove the broken rivers."}`, ...(firstRiver >= 0 ? tileLocation(map, firstRiver) : {}), mutation: { kind: "SET_RIVER_NETWORK", rivers: riverRepair.rivers }, minimumProfile: "STANDARD" });
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

  const reservedCities = new Set((map.cities ?? []).flatMap((city) => city.x >= 0 && city.y >= 0 && city.x < map.width && city.y < map.height ? [city.y * map.width + city.x] : []));
  for (const city of map.cities ?? []) {
    const inBounds = city.x >= 0 && city.y >= 0 && city.x < map.width && city.y < map.height;
    const index = inBounds ? city.y * map.width + city.x : undefined;
    if (!city.recordValid || city.duplicate) {
      add({ id: `city-link-${city.id}-${city.x}-${city.y}`, category: "CITIES", severity: "ERROR", confidence: "CERTAIN", title: city.duplicate ? "Duplicate city tile link" : "City tile has no scenario record", detail: "Remove the invalid city reference from the tile improvement data.", x: inBounds ? city.x : undefined, y: inBounds ? city.y : undefined, tileIndex: index, mutation: inBounds ? { kind: "REMOVE_CITY_LINK", id: city.id, x: city.x, y: city.y } : undefined, minimumProfile: "SAFE" });
      continue;
    }
    if (!inBounds) {
      add({ id: `city-unplaced-${city.id}`, category: "CITIES", severity: "WARNING", confidence: "REVIEW", title: "City record has no map tile", detail: `${city.name || `City ${city.id}`} exists in scenario data but is not linked to a tile; manual review is required.`, minimumProfile: "COMPETITIVE" });
      continue;
    }
    if (!isPassableLand(map, map.tiles[index!])) {
      reservedCities.delete(index!);
      const target = nearestValidTile(map, index!, (tile, candidateIndex) => isPassableLand(map, tile) && tile.wonder === 255 && !reservedCities.has(candidateIndex), reservedCities);
      reservedCities.add(index!);
      if (target !== null) reservedCities.add(target);
      add({ id: `city-placement-${city.id}`, category: "CITIES", severity: "ERROR", confidence: "CERTAIN", title: "City on impassable terrain", detail: target === null ? `${city.name || `City ${city.id}`} is on water or a mountain and needs manual relocation.` : `Move ${city.name || `City ${city.id}`} from water or mountain terrain to the nearest passable tile.`, x: city.x, y: city.y, tileIndex: index, mutation: target === null ? undefined : { kind: "MOVE_CITY", id: city.id, fromX: city.x, fromY: city.y, x: target % map.width, y: Math.floor(target / map.width) }, minimumProfile: "SAFE" });
    }
  }

  const storedMajors = map.startLocations.filter((start) => !start.cityState);
  const storedCityStates = map.startLocations.filter((start) => start.cityState);
  const missingMajorStarts = storedMajors.length === 0;
  if (missingMajorStarts) {
    const size = closestMapSize(map);
    const geographyOnlyFile = map.source === "file" && !map.scenarioDataPresent;
    const generatedMap = map.source !== "file";
    const canCreateScenario = generatedMap || geographyOnlyFile;
    const writablePlayerSlots = map.source === "file" ? map.scenarioPlayerSlots ?? 0 : Math.max(0, map.players);
    const targetPlayers = writablePlayerSlots > 0 ? writablePlayerSlots : map.players >= 2 ? map.players : size.recommendedPlayers;
    const targetCityStates = map.source === "file" && (map.scenarioCityStateSlots ?? 0) > 0
      ? Math.min(map.scenarioCityStateSlots!, size.recommendedCityStates)
      : generatedMap && map.generation
        ? Math.min(map.generation.cityStates, size.recommendedCityStates)
        : canCreateScenario
          ? Math.min(targetPlayers, size.recommendedCityStates)
          : Math.min(storedCityStates.length, size.recommendedCityStates);
    const candidateReplacement = writablePlayerSlots >= 2 || canCreateScenario
      ? canCreateScenario
        ? flexibleReplacementStarts(map, targetPlayers, targetCityStates)
        : balancedReplacementStarts(map, targetPlayers, targetCityStates)
      : undefined;
    const replacement = candidateReplacement && (canCreateScenario || candidateReplacement.complete) ? candidateReplacement : undefined;
    const blockedByScenario = map.source === "file" && map.scenarioDataPresent && writablePlayerSlots < 2;
    add({
      id: "missing-start-locations",
      category: "STARTS",
      severity: "ERROR",
      confidence: "CERTAIN",
      title: "Map has no start locations",
      detail: replacement
        ? `${geographyOnlyFile ? "Create a new scenario section with" : "Create"} ${replacement.players} legal major-civilization starts and ${replacement.cityStates} city-state starts, all at least ${MINIMUM_START_DISTANCE} hexes apart${replacement.players < targetPlayers || replacement.cityStates < targetCityStates ? "; the population was reduced to fit the available geography" : ""}.`
        : blockedByScenario
          ? "A playable map requires major-civilization starts. This file contains scenario data but exposes no writable scenario player slots, so Excogitare cannot safely invent records without replacing unrelated scenario content. Add scenario players in Civ V WorldBuilder, then run Repair again."
          : `A playable map requires major-civilization starts, but no legal layout with at least ${MINIMUM_START_DISTANCE} hexes between starts could be constructed from this terrain.`,
      mutation: replacement ? { kind: "REPLACE_STARTS", starts: replacement.starts, players: replacement.players } : undefined,
      minimumProfile: "SAFE",
    });
  }

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

  const closePairs: Array<{ one: Civ5StartLocation; two: Civ5StartLocation; distance: number }> = [];
  for (let one = 0; one < map.startLocations.length; one += 1) {
    for (let two = one + 1; two < map.startLocations.length; two += 1) {
      const distance = hexDistance([map.startLocations[one].x, map.startLocations[one].y], [map.startLocations[two].x, map.startLocations[two].y], map.width, map.wraps);
      if (distance < MINIMUM_START_DISTANCE) closePairs.push({ one: map.startLocations[one], two: map.startLocations[two], distance });
    }
  }
  const rebalanced = !missingMajorStarts && storedMajors.length
    ? balancedReplacementStarts(map, storedMajors.length, storedCityStates.length)
    : undefined;
  if (closePairs.length && rebalanced) {
    const closest = closePairs.reduce((best, pair) => pair.distance < best.distance ? pair : best);
    add({
      id: "start-spacing",
      category: "STARTS",
      severity: "ERROR",
      confidence: "CERTAIN",
      title: "Start locations are overcrowded",
      detail: rebalanced.complete
        ? `${closePairs.length} pair${closePairs.length === 1 ? " is" : "s are"} closer than the required ${MINIMUM_START_DISTANCE} hexes; the closest pair is ${closest.distance} hexes apart. Replace the complete layout with separated, comparable starting sites.`
        : `${closePairs.length} pair${closePairs.length === 1 ? " is" : "s are"} closer than the required ${MINIMUM_START_DISTANCE} hexes; the closest pair is ${closest.distance} hexes apart. This terrain cannot fit every stored start at the required separation; reduce the scenario population or edit the geography.`,
      x: closest.two.x,
      y: closest.two.y,
      tileIndex: closest.two.y * map.width + closest.two.x,
      mutation: rebalanced.complete ? { kind: "REPLACE_STARTS", starts: rebalanced.starts, players: rebalanced.players } : undefined,
      minimumProfile: "SAFE",
    });
  } else if (map.source === "file" && rebalanced?.complete) {
    const changed = rebalanced.starts.some((start, index) => map.startLocations[index]?.x !== start.x || map.startLocations[index]?.y !== start.y);
    if (changed) add({
      id: "start-balance",
      category: "STARTS",
      severity: "INFO",
      confidence: "REVIEW",
      title: "Competitive start balancing",
      detail: `Relocate the complete start layout to favor comparable workable terrain while retaining at least ${MINIMUM_START_DISTANCE} hexes between every major and city-state start.`,
      mutation: { kind: "REPLACE_STARTS", starts: rebalanced.starts, players: rebalanced.players },
      minimumProfile: "COMPETITIVE",
    });
  }
  if (!missingMajorStarts && storedMajors.length !== map.players) add({ id: "player-count", category: "SCENARIO", severity: "WARNING", confidence: "CERTAIN", title: "Player count mismatch", detail: `Set the header player count from ${map.players} to ${storedMajors.length}.`, mutation: { kind: "SET_PLAYERS", players: storedMajors.length }, minimumProfile: "SAFE" });

  if (!issues.length) add({ id: "clean", category: "STRUCTURE", severity: "INFO", confidence: "CERTAIN", title: "No repairs required", detail: "The supported geography, placement, river, and start-location checks passed.", minimumProfile: "SAFE" });
  return issues;
}

export function applyRepairIssues(map: Civ5Map, issues: RepairIssue[], selectedIds: ReadonlySet<string>) {
  const result: Civ5Map = { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), startLocations: map.startLocations.map((start) => ({ ...start })), cities: map.cities?.map((city) => ({ ...city })) };
  let changed = false;
  for (const issue of issues) {
    if (!selectedIds.has(issue.id) || !issue.mutation) continue;
    changed = true;
    const mutation = issue.mutation;
    if (mutation.kind === "SET_TILE") Object.assign(result.tiles[mutation.index], mutation.changes);
    else if (mutation.kind === "MOVE_RESOURCE") {
      const source = result.tiles[mutation.from];
      const target = result.tiles[mutation.to];
      target.resource = source.resource;
      target.resourceAmount = source.resourceAmount;
      source.resource = 255;
      source.resourceAmount = 0;
    } else if (mutation.kind === "REMOVE_RESOURCE") {
      result.tiles[mutation.index].resource = 255;
      result.tiles[mutation.index].resourceAmount = 0;
    } else if (mutation.kind === "MOVE_WONDER") {
      result.tiles[mutation.to].wonder = result.tiles[mutation.from].wonder;
      result.tiles[mutation.from].wonder = 255;
    } else if (mutation.kind === "MOVE_START") Object.assign(result.startLocations[mutation.startIndex], { x: mutation.x, y: mutation.y });
    else if (mutation.kind === "SET_START") Object.assign(result.startLocations[mutation.startIndex], mutation.changes);
    else if (mutation.kind === "REPLACE_STARTS") {
      result.startLocations = mutation.starts.map((start) => ({ ...start }));
      result.players = mutation.players;
    }
    else if (mutation.kind === "MOVE_CITY") {
      const city = result.cities?.find((candidate) => candidate.id === mutation.id && candidate.x === mutation.fromX && candidate.y === mutation.fromY);
      if (city) Object.assign(city, { x: mutation.x, y: mutation.y });
    } else if (mutation.kind === "REMOVE_CITY_LINK") {
      result.cities = result.cities?.filter((city) => city.id !== mutation.id || city.x !== mutation.x || city.y !== mutation.y);
    } else if (mutation.kind === "SET_RIVER_NETWORK") {
      for (let index = 0; index < result.tiles.length; index += 1) result.tiles[index].river = mutation.rivers[index] ?? 0;
    } else if (mutation.kind === "NORMALIZE_SCENARIO_MARKER") {
      result.scenarioMarker = mutation.marker;
    } else if (mutation.kind === "SET_PLAYERS") result.players = mutation.players;
  }
  if (changed) result.structure = markGenerationStructureStale(map.structure, "Repair changed authored map data.");
  return result;
}

export function cloneMap(map: Civ5Map) {
  return { ...map, tiles: map.tiles.map((tile) => ({ ...tile })), startLocations: map.startLocations.map((start) => ({ ...start })), cities: map.cities?.map((city) => ({ ...city })), recipe: cloneGenerationRecipe(map.recipe), structure: cloneGenerationStructure(map.structure) };
}
