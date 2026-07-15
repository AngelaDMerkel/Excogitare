import type { Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { poleProximity } from "./climate-projection.ts";
import { connectedTileObjects, type GenerationStructure, type GeographicObject, type StrategicEdge, type StrategicNode } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";

export type PolisGeography = {
  landMask: boolean[];
  reliefValues: number[];
  moistures: number[];
  elevations: number[];
  tiles: Civ5Tile[];
  structure: GenerationStructure;
  startLocations: Civ5StartLocation[];
  diagnostics: Record<string, number>;
};

type Point = { x: number; y: number };

const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2d) ^ seed;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}

function smoothNoise(x: number, y: number, seed: number, scale: number) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const fade = (value: number) => value * value * (3 - 2 * value);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * fade(tx);
  const bottom = c + (d - c) * fade(tx);
  return top + (bottom - top) * fade(ty);
}

function neighbors(point: Point, width: number, height: number, wraps: boolean) {
  const offsets = point.y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let x = point.x + dx;
    const y = point.y + dy;
    if (wraps) x = (x + width) % width;
    return x >= 0 && x < width && y >= 0 && y < height ? [{ x, y }] : [];
  });
}

function hexDistance(a: Point, b: Point, width: number, wraps: boolean) {
  const cube = (point: Point) => {
    const q = point.x - (point.y - (point.y & 1)) / 2;
    return [q, -q - point.y, point.y];
  };
  const direct = (one: Point, two: Point) => {
    const ac = cube(one);
    const bc = cube(two);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(a, b);
  return Math.min(direct(a, b), direct({ x: a.x - width, y: a.y }, b), direct({ x: a.x + width, y: a.y }, b));
}

function indexOf(point: Point, width: number) {
  return point.y * width + point.x;
}

function pointsWithin(point: Point, radius: number, width: number, height: number, wraps: boolean) {
  const result: Point[] = [];
  for (let y = Math.max(0, point.y - radius); y <= Math.min(height - 1, point.y + radius); y += 1) {
    for (let x = 0; x < width; x += 1) {
      const candidate = { x, y };
      if (hexDistance(point, candidate, width, wraps) <= radius) result.push(candidate);
    }
  }
  return result;
}

function routeBetween(start: Point, target: Point, width: number, height: number, wraps: boolean, seed: number) {
  const startIndex = indexOf(start, width);
  const targetIndex = indexOf(target, width);
  const parents = new Int32Array(width * height);
  parents.fill(-1);
  parents[startIndex] = startIndex;
  const queue = [startIndex];
  for (let cursor = 0; cursor < queue.length && parents[targetIndex] < 0; cursor += 1) {
    const index = queue[cursor];
    const point = { x: index % width, y: Math.floor(index / width) };
    const ordered = neighbors(point, width, height, wraps).sort((one, two) => {
      const distance = hexDistance(one, target, width, wraps) - hexDistance(two, target, width, wraps);
      return distance || hashNoise(one.x, one.y, seed + cursor) - hashNoise(two.x, two.y, seed + cursor);
    });
    for (const next of ordered) {
      const nextIndex = indexOf(next, width);
      if (parents[nextIndex] >= 0) continue;
      parents[nextIndex] = index;
      queue.push(nextIndex);
    }
  }
  if (parents[targetIndex] < 0) throw new Error("Polis could not embed a required strategic route.");
  const reversed = [targetIndex];
  while (reversed.at(-1) !== startIndex) reversed.push(parents[reversed.at(-1)!]);
  return reversed.reverse().map((index) => ({ x: index % width, y: Math.floor(index / width) }));
}

function uniqueAnchors(points: Point[], width: number, height: number, wraps: boolean) {
  const occupied: Point[] = [];
  return points.map((point) => {
    let candidate = { x: Math.max(1, Math.min(width - 2, Math.round(point.x))), y: Math.max(2, Math.min(height - 3, Math.round(point.y))) };
    if (occupied.some((other) => other.x === candidate.x && other.y === candidate.y)) {
      const replacement = pointsWithin(candidate, 4, width, height, wraps).find((next) => !occupied.some((other) => other.x === next.x && other.y === next.y));
      if (replacement) candidate = replacement;
    }
    occupied.push(candidate);
    return candidate;
  });
}

function buildMajorAnchors(options: MapGenerationOptions, width: number, height: number, wraps: boolean, count: number, random: () => number) {
  const marginX = Math.max(4, Math.round(width * 0.12));
  const marginY = Math.max(3, Math.round(height * 0.13));
  const jitter = options.polisSymmetry === "ASYMMETRIC" ? 0.09 : options.polisSymmetry === "EQUIVALENT" ? 0.035 : 0;
  const point = (x: number, y: number) => ({
    x: x + (random() - 0.5) * width * jitter,
    y: y + (random() - 0.5) * height * jitter,
  });
  const anchors: Point[] = [];

  if (options.polisConflictPattern === "OPPOSING_FRONTS" || options.polisConflictPattern === "RIVAL_CONTINENTS") {
    const leftCount = Math.ceil(count / 2);
    const rightCount = count - leftCount;
    const column = options.polisConflictPattern === "RIVAL_CONTINENTS" ? [0.25, 0.75] : [0.2, 0.8];
    for (let index = 0; index < leftCount; index += 1) {
      anchors.push(point(width * column[0], marginY + ((height - marginY * 2) * (index + 0.5)) / leftCount));
    }
    for (let index = 0; index < rightCount; index += 1) {
      anchors.push(point(width * column[1], marginY + ((height - marginY * 2) * (index + 0.5)) / Math.max(1, rightCount)));
    }
  } else {
    const radiusX = Math.max(3, (width - marginX * 2) / 2);
    const radiusY = Math.max(3, (height - marginY * 2) / 2);
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      anchors.push(point(width / 2 + Math.cos(angle) * radiusX, height / 2 + Math.sin(angle) * radiusY));
    }
  }

  if (options.polisSymmetry === "MIRRORED") {
    for (let index = Math.ceil(count / 2); index < count; index += 1) {
      const source = anchors[index - Math.ceil(count / 2)];
      anchors[index] = { x: width - 1 - source.x, y: height - 1 - source.y };
    }
  }
  return uniqueAnchors(anchors, width, height, wraps);
}

function buildEdgePairs(options: MapGenerationOptions, count: number) {
  const pairs: Array<[number, number, StrategicEdge["kind"]]> = [];
  const add = (one: number, two: number, kind: StrategicEdge["kind"]) => {
    if (one === two || pairs.some(([a, b]) => (a === one && b === two) || (a === two && b === one))) return;
    pairs.push([one, two, kind]);
  };
  if (options.polisConflictPattern === "OPPOSING_FRONTS" || options.polisConflictPattern === "RIVAL_CONTINENTS") {
    const left = Math.ceil(count / 2);
    for (let index = 0; index < left - 1; index += 1) add(index, index + 1, "OPEN");
    for (let index = left; index < count - 1; index += 1) add(index, index + 1, "OPEN");
    for (let index = 0; index < Math.min(left, count - left); index += 1) {
      const naval = options.polisConflictPattern === "RIVAL_CONTINENTS" && options.polisNavalImportance !== "LOW";
      add(index, left + index, naval ? "NAVAL" : index % 2 ? "PASS" : "LAND_BRIDGE");
    }
  } else {
    for (let index = 0; index < count; index += 1) add(index, (index + 1) % count, index % 3 === 0 ? "PASS" : "OPEN");
    if (options.polisConflictPattern === "CROSSROADS") {
      for (let index = 0; index < Math.floor(count / 2); index += 1) add(index, (index + Math.floor(count / 2)) % count, "RIVER_CROSSING");
    } else {
      for (let index = 0; index < Math.min(4, Math.floor(count / 2)); index += 1) add(index, (index + Math.floor(count / 2)) % count, "PASS");
    }
  }
  return pairs;
}

function minimumStartDistance(starts: Point[], width: number, wraps: boolean) {
  let result = Number.POSITIVE_INFINITY;
  for (let one = 0; one < starts.length; one += 1) {
    for (let two = one + 1; two < starts.length; two += 1) result = Math.min(result, hexDistance(starts[one], starts[two], width, wraps));
  }
  return Number.isFinite(result) ? result : 0;
}

function validateStrategicTopology(nodes: StrategicNode[], edges: StrategicEdge[], width: number, height: number, wraps: boolean) {
  const majors = nodes.filter((node) => node.kind === "MAJOR_START");
  if (new Set(majors.map((node) => `${node.x},${node.y}`)).size !== majors.length) throw new Error("Polis produced overlapping major starts.");
  if (majors.some((node) => node.x < 0 || node.x >= width || node.y < 0 || node.y >= height)) throw new Error("Polis produced a major start outside the map.");
  const neighborsByNode = new Map(majors.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    neighborsByNode.get(edge.from)?.push(edge.to);
    neighborsByNode.get(edge.to)?.push(edge.from);
    for (let index = 1; index < edge.tileIndices.length; index += 1) {
      if (!neighbors({ x: edge.tileIndices[index - 1] % width, y: Math.floor(edge.tileIndices[index - 1] / width) }, width, height, wraps).some((point) => indexOf(point, width) === edge.tileIndices[index])) {
        throw new Error(`Polis produced a discontinuous strategic front: ${edge.id}.`);
      }
    }
  }
  const reached = new Set<string>(majors.length ? [majors[0].id] : []);
  const queue = [...reached];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of neighborsByNode.get(queue[cursor]) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  if (reached.size !== majors.length) throw new Error("Polis produced a disconnected strategic graph.");
}

function assignCityStates(
  tiles: Civ5Tile[],
  majorStarts: Civ5StartLocation[],
  count: number,
  width: number,
  height: number,
  wraps: boolean,
  options: MapGenerationOptions,
  seed: number,
) {
  const selected: Point[] = [];
  const candidates = tiles.flatMap((tile, index) => {
    if (tile.terrain < 2 || tile.elevation === 2) return [];
    const point = { x: index % width, y: Math.floor(index / width) };
    const coastal = neighbors(point, width, height, wraps).some((next) => tiles[indexOf(next, width)].terrain < 2);
    if (options.cityStateCoastalPreference === "REQUIRE" && !coastal) return [];
    return [{ point, coastal }];
  });
  while (selected.length < count && selected.length < candidates.length) {
    let best: Point | undefined;
    let score = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (selected.some((point) => point.x === candidate.point.x && point.y === candidate.point.y)) continue;
      const references = [...majorStarts.map((start) => ({ x: start.x, y: start.y })), ...selected];
      const nearest = Math.min(...references.map((point) => hexDistance(candidate.point, point, width, wraps)));
      if (nearest < options.cityStateMinSpacing) continue;
      const value = nearest * 4 + (candidate.coastal && options.cityStateCoastalPreference === "PREFER" ? 8 : 0) + hashNoise(candidate.point.x, candidate.point.y, seed) * 0.2;
      if (value > score) {
        score = value;
        best = candidate.point;
      }
    }
    if (!best) break;
    selected.push(best);
  }
  return selected.map<Civ5StartLocation>((point, index) => ({
    ...point,
    player: majorStarts.length + index,
    civilization: "",
    leader: "",
    team: majorStarts.length + index,
    playable: false,
    cityState: true,
  }));
}

function dominantTerrain(options: MapGenerationOptions, x: number, y: number, seed: number) {
  if (!options.dominantTerrains.length || hashNoise(x, y, seed + 8801) > 0.68) return null;
  return options.dominantTerrains[Math.floor(hashNoise(x, y, seed + 8819) * options.dominantTerrains.length)];
}

export function generatePolisGeography(
  options: MapGenerationOptions,
  width: number,
  height: number,
  wraps: boolean,
  seed: number,
  random: () => number,
): PolisGeography {
  const playerCount = Math.max(2, Math.min(22, Math.round(options.players)));
  const cityStateCount = Math.max(0, Math.min(41, Math.round(options.cityStates)));
  const anchors = buildMajorAnchors(options, width, height, wraps, playerCount, random);
  const teamFor = (player: number) => options.balance === "TEAMS" ? Math.floor(player / options.teamSize) : player;
  const majorStarts = anchors.map<Civ5StartLocation>((anchor, player) => ({
    ...anchor,
    player,
    civilization: "",
    leader: "",
    team: teamFor(player),
    playable: true,
    cityState: false,
  }));
  const requestedSafeRadius = Math.max(2, Math.min(8, Math.round(options.polisSafeRadius)));
  const maximumDistinctSafeRadius = Math.max(2, Math.floor((minimumStartDistance(anchors, width, wraps) - 1) / 2));
  const safeRadius = Math.min(requestedSafeRadius, maximumDistinctSafeRadius);
  const relaxations: string[] = [];
  if (safeRadius < requestedSafeRadius) relaxations.push(`Safe territory radius reduced from ${requestedSafeRadius} to ${safeRadius} to prevent overlapping starts.`);
  const edgePairs = buildEdgePairs(options, playerCount);
  const strategicNodes: StrategicNode[] = anchors.map((anchor, owner) => ({
    id: `major-${owner + 1}`,
    kind: "MAJOR_START",
    ...anchor,
    owner,
    team: teamFor(owner),
    regionId: `safe-region-${owner + 1}`,
  }));
  const protectedTiles = new Set<number>();
  const safeTiles = new Set<number>();
  const corridorTiles = new Set<number>();
  const edgeRoutes: StrategicEdge[] = [];
  for (const anchor of anchors) {
    for (const point of pointsWithin(anchor, safeRadius, width, height, wraps)) {
      protectedTiles.add(indexOf(point, width));
      safeTiles.add(indexOf(point, width));
    }
  }

  const corridorRadius = options.polisChokepointDensity >= 72 ? 0 : options.polisChokepointDensity >= 38 ? 1 : 2;
  for (const [edgeIndex, [from, to, kind]] of edgePairs.entries()) {
    const route = routeBetween(anchors[from], anchors[to], width, height, wraps, seed + edgeIndex * 97);
    const routeIndices = route.map((point) => indexOf(point, width));
    if (kind !== "NAVAL") {
      for (const point of route) {
        for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
          const index = indexOf(expanded, width);
          protectedTiles.add(index);
          corridorTiles.add(index);
        }
      }
    }
    edgeRoutes.push({ id: `front-${edgeIndex + 1}`, from: `major-${from + 1}`, to: `major-${to + 1}`, kind, tileIndices: routeIndices, width: corridorRadius * 2 + 1 });
  }
  validateStrategicTopology(strategicNodes, edgeRoutes, width, height, wraps);

  const contestedPoints: Point[] = [];
  for (const edge of edgeRoutes.filter((item) => item.kind !== "OPEN").slice(0, Math.max(1, Math.min(8, Math.ceil(playerCount / 2))))) {
    const midpoint = edge.tileIndices[Math.floor(edge.tileIndices.length / 2)];
    const point = { x: midpoint % width, y: Math.floor(midpoint / width) };
    if (!contestedPoints.some((other) => hexDistance(point, other, width, wraps) < 4)) contestedPoints.push(point);
  }
  if (options.polisConflictPattern === "RADIAL" || options.polisConflictPattern === "CROSSROADS") contestedPoints.unshift({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
  contestedPoints.slice(0, 8).forEach((point, index) => strategicNodes.push({ id: `contested-${index + 1}`, kind: index === 0 ? "OBJECTIVE" : "CONTESTED", ...point, regionId: `contested-region-${index + 1}` }));

  const strategicObjects: GeographicObject[] = anchors.map((anchor, owner) => ({
    id: `safe-region-${owner + 1}`,
    name: `Player ${owner + 1} Safe Territory`,
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(anchor, safeRadius + 1, width, height, wraps).map((point) => indexOf(point, width)),
    attributes: { role: "SAFE", owner, team: teamFor(owner), radius: safeRadius },
  }));
  contestedPoints.slice(0, 8).forEach((point, index) => strategicObjects.push({
    id: `contested-region-${index + 1}`,
    name: index === 0 ? "Primary Contested Objective" : `Contested Region ${index + 1}`,
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(point, Math.max(2, safeRadius - 1), width, height, wraps).map((tile) => indexOf(tile, width)),
    attributes: { role: index === 0 ? "OBJECTIVE" : "CONTESTED", priority: index + 1 },
  }));

  const protectedArray = [...protectedTiles];
  const scores = new Array<number>(width * height);
  const expansionRadius = options.polisExpansionPressure === "RELAXED" ? 0.27 : options.polisExpansionPressure === "IMMEDIATE" ? 0.18 : 0.22;
  const influenceRadius = Math.max(safeRadius + 2, Math.min(width, height) * expansionRadius);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = { x, y };
      const startInfluence = Math.max(...anchors.map((anchor) => 1 - hexDistance(point, anchor, width, wraps) / influenceRadius));
      const contestedInfluence = contestedPoints.length ? Math.max(...contestedPoints.map((target) => 0.72 - hexDistance(point, target, width, wraps) / Math.max(4, influenceRadius * 0.9))) : 0;
      const broadNoise = smoothNoise(x, y, seed + 1201, Math.max(4, Math.min(width, height) / 5));
      const detail = smoothNoise(x, y, seed + 1213, 2.4);
      let score = Math.max(startInfluence, contestedInfluence) + broadNoise * 0.5 + detail * 0.16;
      if (options.polisConflictPattern === "RIVAL_CONTINENTS") {
        const side = Math.min(Math.abs(x / Math.max(1, width - 1) - 0.25), Math.abs(x / Math.max(1, width - 1) - 0.75));
        score += 0.46 - side * 1.65;
        const middle = Math.abs(x / Math.max(1, width - 1) - 0.5);
        if (middle < 0.09) score -= options.polisNavalImportance === "HIGH" ? 0.9 : 0.55;
      }
      if (!wraps) {
        const edge = Math.min(x, width - 1 - x, y, height - 1 - y);
        if (edge < 2) score -= (2 - edge) * 0.5;
      }
      scores[y * width + x] = score;
    }
  }
  const desiredLand = Math.max(protectedTiles.size, Math.round(width * height * (1 - clamp(options.waterPercent / 100, 0, 0.9))));
  const rankedLand = Array.from({ length: scores.length }, (_value, index) => index).sort((one, two) => scores[two] - scores[one] || one - two);
  const landMask = new Array<boolean>(scores.length).fill(false);
  for (const index of protectedTiles) landMask[index] = true;
  let landCount = protectedTiles.size;
  for (const index of rankedLand) {
    if (landCount >= desiredLand) break;
    if (landMask[index]) continue;
    landMask[index] = true;
    landCount += 1;
  }

  const reliefValues = scores.map((score, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nearCorridor = neighbors({ x, y }, width, height, wraps).some((point) => corridorTiles.has(indexOf(point, width)));
    return smoothNoise(x, y, seed + 3011, 3.6) * 0.55 + smoothNoise(x, y, seed + 3023, 9) * 0.25 + (nearCorridor ? options.polisChokepointDensity / 250 : 0) + score * 0.08;
  });
  const mountainCandidates = reliefValues.flatMap((value, index) => landMask[index] && !protectedTiles.has(index) && !safeTiles.has(index) ? [{ index, value }] : []);
  mountainCandidates.sort((one, two) => two.value - one.value || one.index - two.index);
  const mountainTarget = Math.min(mountainCandidates.length, Math.round(landCount * clamp(options.mountainPercent / 100, 0, 0.38)));
  const mountains = new Set(mountainCandidates.slice(0, mountainTarget).map((item) => item.index));
  const hillTarget = Math.round(landCount * (options.worldAge === "YOUNG" ? 0.3 : options.worldAge === "OLD" ? 0.14 : 0.21));
  const hills = new Set(mountainCandidates.slice(mountainTarget, mountainTarget + hillTarget).map((item) => item.index));
  const elevations = landMask.map((land, index) => land ? mountains.has(index) ? 2 : hills.has(index) ? 1 : 0 : 0);
  for (const index of corridorTiles) if (landMask[index]) elevations[index] = hashNoise(index % width, Math.floor(index / width), seed + 4013) > 0.78 ? 1 : 0;
  for (const index of safeTiles) if (landMask[index]) elevations[index] = hashNoise(index % width, Math.floor(index / width), seed + 4021) > 0.86 ? 1 : 0;

  const moistures = new Array<number>(landMask.length);
  const temperatures = new Array<number>(landMask.length);
  const rainShift = options.rainfall === "WET" ? 0.14 : options.rainfall === "ARID" ? -0.16 : 0;
  const temperatureShift = options.climate === "HOT" ? 0.15 : options.climate === "COOL" ? -0.15 : 0;
  for (let y = 0; y < height; y += 1) {
    let airborne = 0.55 + rainShift;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!landMask[index]) airborne += (0.88 - airborne) * 0.3;
      const lift = elevations[index] === 2 ? 0.2 : elevations[index] === 1 ? 0.06 : 0;
      moistures[index] = clamp(airborne + smoothNoise(x, y, seed + 5011, 7) * 0.28 - 0.12 + lift);
      airborne = clamp(airborne - lift * 0.58 + (landMask[index] ? -0.006 : 0.02));
      temperatures[index] = clamp(0.14 + Math.cos(poleProximity(x, y, width, height, options.projectionType) * Math.PI / 2) * 0.76 + temperatureShift - elevations[index] * 0.07 + (smoothNoise(x, y, seed + 5021, 10) - 0.5) * 0.16);
    }
  }

  const tiles: Civ5Tile[] = landMask.map((land, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const adjacentLand = neighbors({ x, y }, width, height, wraps).some((point) => landMask[indexOf(point, width)]);
    let terrain = land ? 2 : adjacentLand ? 1 : 0;
    if (land) {
      const preferred = dominantTerrain(options, x, y, seed);
      if (preferred === "PLAINS") terrain = 3;
      else if (preferred === "DESERT") terrain = 4;
      else if (preferred === "TUNDRA") terrain = 5;
      else if (preferred === "GRASSLAND") terrain = 2;
      else if (temperatures[index] < 0.18) terrain = 6;
      else if (temperatures[index] < 0.32) terrain = 5;
      else if (temperatures[index] > 0.73 && moistures[index] < 0.31) terrain = 4;
      else if (moistures[index] < 0.47) terrain = 3;
    }
    let feature = 255;
    if (!land && poleProximity(x, y, width, height, options.projectionType) > 0.9 && hashNoise(x, y, seed + 6011) > 0.55) feature = 3;
    else if (land && elevations[index] < 2 && terrain === 2 && moistures[index] > 0.78) feature = temperatures[index] > 0.7 ? 1 : 2;
    else if (land && elevations[index] < 2 && terrain !== 4 && terrain !== 6 && moistures[index] > 0.57) feature = temperatures[index] > 0.72 ? 1 : 0;
    else if (land && elevations[index] === 0 && terrain === 4 && moistures[index] < 0.27 && hashNoise(x, y, seed + 6029) > 0.93) feature = 4;
    if (safeTiles.has(index)) {
      const nearestStartDistance = Math.min(...anchors.map((anchor) => hexDistance({ x, y }, anchor, width, wraps)));
      terrain = nearestStartDistance > 0 && nearestStartDistance % 3 === 0 ? 3 : 2;
      feature = 255;
    }
    return { terrain, elevation: elevations[index], feature, resource: 255, resourceAmount: 0, river: 0, wonder: 255, continent: land ? 1 : 0 };
  });
  const cityStates = assignCityStates(tiles, majorStarts, cityStateCount, width, height, wraps, options, seed + 7001);
  if (cityStates.length < cityStateCount) relaxations.push(`Placed ${cityStates.length} of ${cityStateCount} requested city states after exhausting legal spacing.`);
  for (const cityState of cityStates) strategicNodes.push({ id: `city-state-${cityState.player - playerCount + 1}`, kind: "CITY_STATE", x: cityState.x, y: cityState.y, owner: cityState.player });

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Strategic Landmass");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Strategic Water Basin");
  const startDistances: number[] = [];
  for (let one = 0; one < anchors.length; one += 1) for (let two = one + 1; two < anchors.length; two += 1) startDistances.push(hexDistance(anchors[one], anchors[two], width, wraps));
  const metrics = {
    minimumStartDistance: minimumStartDistance(anchors, width, wraps),
    averageStartDistance: startDistances.length ? Math.round(startDistances.reduce((sum, value) => sum + value, 0) / startDistances.length) : 0,
    averageFrontLength: edgeRoutes.length ? Math.round(edgeRoutes.reduce((sum, edge) => sum + edge.tileIndices.length, 0) / edgeRoutes.length) : 0,
    protectedTiles: protectedTiles.size,
    landRoutes: edgeRoutes.filter((edge) => edge.kind !== "NAVAL").length,
    navalRoutes: edgeRoutes.filter((edge) => edge.kind === "NAVAL").length,
  };
  const diagnostics = {
    strategicRegions: strategicObjects.length,
    fronts: edgeRoutes.length,
    contestedRegions: contestedPoints.length,
    majorStarts: majorStarts.length,
    cityStates: cityStates.length,
    ...metrics,
  };
  const structure: GenerationStructure = {
    engine: "POLIS",
    objects: [...strategicObjects, ...continents, ...basins],
    mountainRanges: [],
    riverSystems: [],
    diagnostics,
    strategicGraph: {
      version: 1,
      pattern: options.polisConflictPattern,
      symmetry: options.polisSymmetry,
      nodes: strategicNodes,
      edges: edgeRoutes,
      protectedTileIndices: protectedArray,
      relaxations: [...relaxations, ...(landCount > desiredLand ? ["Protected strategic routes exceeded the requested land budget."] : [])],
      metrics,
    },
  };
  return { landMask, reliefValues, moistures, elevations, tiles, structure, startLocations: [...majorStarts, ...cityStates], diagnostics };
}
