import type { Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { connectedTileObjects, type GenerationStructure, type GeographicObject, type StrategicEdge, type StrategicNode } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { MatchIntent, VictoryCondition, WorldScale } from "./generation-recipe.ts";
import { MINIMUM_START_DISTANCE } from "./start-locations.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";

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

function routeBetween(start: Point, target: Point, width: number, height: number, wraps: boolean, seed: number, wander: number) {
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
      const variation = (hashNoise(one.x, one.y, seed + cursor) - hashNoise(two.x, two.y, seed + cursor)) * wander;
      return distance + variation;
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
  const legal = Array.from({ length: Math.max(0, height - 4) }, (_row, row) => row + 2)
    .flatMap((y) => Array.from({ length: Math.max(0, width - 2) }, (_column, column) => ({ x: column + 1, y })));
  for (const point of points) {
    const target = { x: Math.max(1, Math.min(width - 2, Math.round(point.x))), y: Math.max(2, Math.min(height - 3, Math.round(point.y))) };
    const candidate = [...legal].sort((one, two) => hexDistance(one, target, width, wraps) - hexDistance(two, target, width, wraps) || one.y - two.y || one.x - two.x)
      .find((next) => occupied.every((other) => hexDistance(next, other, width, wraps) >= MINIMUM_START_DISTANCE));
    if (!candidate) break;
    occupied.push(candidate);
  }
  return occupied;
}

function normalizedPolisPlayerCount(options: MapGenerationOptions, requested: number) {
  const relaxations: string[] = [];
  let count = requested;
  if (options.preset === "THREE_REALMS") {
    if (count < 3) throw new Error("Three Realms requires at least three major civilizations.");
    const compatible = count - count % 3;
    if (compatible !== count) relaxations.push(`Three Realms normalized ${count} major civilizations to ${compatible} so all three realms contain equal seats.`);
    count = compatible;
  }
  if (options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS") {
    if (count % 2) { relaxations.push(`${options.preset === "OPPOSING_FRONTS" ? "Opposing Fronts" : "Rival Continents"} normalized ${count} major civilizations to ${count - 1} so both sides contain equal seats.`); count -= 1; }
  }
  if (options.preset === "THALASSIC_LEAGUE" && count < 3) throw new Error("Thalassic League requires at least three major civilizations to form a league.");
  if (options.preset === "UNEQUAL_REALMS" && count < 4) throw new Error("Unequal Realms requires at least four major civilizations for its Tall, Wide, War, and Turtle roles.");
  return { count, relaxations };
}

function roleForPlayer(options: MapGenerationOptions, player: number) {
  if (options.preset === "UNEQUAL_REALMS") return ["TALL", "WIDE", "WAR", "TURTLE"][player % 4];
  if (options.preset === "THALASSIC_LEAGUE") return "PORT";
  if (options.preset === "OPPOSING_FRONTS") return "FRONT";
  if (options.preset === "RIVAL_CONTINENTS") return "CONTINENTAL_BLOC";
  return "REALM";
}

function teamForPlayer(options: MapGenerationOptions, intent: MatchIntent, player: number, count: number) {
  const explicit = intent.seats?.[player]?.team;
  if (explicit !== undefined) return explicit;
  if (options.preset === "THREE_REALMS") return Math.floor(player / Math.max(1, count / 3));
  if (options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS") return player < count / 2 ? 0 : 1;
  if (options.preset === "UNEQUAL_REALMS") return player;
  return options.balance === "TEAMS" || intent.teamIntent === "FIXED_TEAMS" ? Math.floor(player / intent.teamSize) : player;
}

function controlForPlayer(intent: MatchIntent, player: number) {
  return intent.seats?.[player]?.control ?? "FLEXIBLE";
}

function buildMajorAnchors(options: MapGenerationOptions, width: number, height: number, wraps: boolean, count: number, random: () => number) {
  const marginX = Math.max(4, Math.round(width * 0.12));
  const marginY = Math.max(3, Math.round(height * 0.13));
  const character = worldCharacterProfile(options.style).polis;
  const jitter = (options.polisSymmetry === "ASYMMETRIC" ? 0.09 : options.polisSymmetry === "EQUIVALENT" ? 0.035 : 0) * character.anchorJitter;
  const point = (x: number, y: number) => ({
    x: x + (random() - 0.5) * width * jitter,
    y: y + (random() - 0.5) * height * jitter,
  });
  const anchors: Point[] = [];

  if (options.preset === "THREE_REALMS") {
    const perRealm = count / 3;
    const centers = [{ x: width * 0.5, y: height * 0.18 }, { x: width * 0.2, y: height * 0.76 }, { x: width * 0.8, y: height * 0.76 }];
    for (const center of centers) for (let seat = 0; seat < perRealm; seat += 1) {
      const angle = perRealm === 1 ? -Math.PI / 2 : seat / perRealm * Math.PI * 2;
      anchors.push(point(center.x + Math.cos(angle) * Math.min(width, height) * 0.08, center.y + Math.sin(angle) * Math.min(width, height) * 0.07));
    }
  } else if (options.preset === "UNEQUAL_REALMS") {
    const centers = [{ x: width * 0.24, y: height * 0.25 }, { x: width * 0.74, y: height * 0.24 }, { x: width * 0.25, y: height * 0.75 }, { x: width * 0.74, y: height * 0.74 }];
    for (let player = 0; player < count; player += 1) {
      const center = centers[player % 4];
      const layer = Math.floor(player / 4);
      const angle = (player % 4) / 4 * Math.PI * 2 + layer * 1.7;
      anchors.push(point(center.x + Math.cos(angle) * layer * 5, center.y + Math.sin(angle) * layer * 4));
    }
  } else if (options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS") {
    const leftCount = Math.ceil(count / 2);
    const rightCount = count - leftCount;
    const column = options.preset === "RIVAL_CONTINENTS" ? [0.25, 0.75] : [0.2, 0.8];
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

function buildEdgePairs(options: MapGenerationOptions, count: number, intent: MatchIntent) {
  const pairs: Array<[number, number, StrategicEdge["kind"]]> = [];
  const add = (one: number, two: number, kind: StrategicEdge["kind"]) => {
    if (one === two || pairs.some(([a, b]) => (a === one && b === two) || (a === two && b === one))) return;
    pairs.push([one, two, kind]);
  };
  const emphasized = new Set(intent.emphasizedVictories);
  const aiHeavy = intent.aiAccommodation === "STRONG" || intent.aiPlayers > (intent.humanPlayers + intent.flexiblePlayers);
  if (options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS") {
    const left = Math.ceil(count / 2);
    for (let index = 0; index < left - 1; index += 1) add(index, index + 1, "OPEN");
    for (let index = left; index < count - 1; index += 1) add(index, index + 1, "OPEN");
    for (let index = 0; index < Math.min(left, count - left); index += 1) {
      const naval = options.preset === "RIVAL_CONTINENTS" && options.polisNavalImportance !== "LOW";
      add(index, left + index, naval ? "NAVAL" : index % 2 ? "PASS" : "LAND_BRIDGE");
    }
    if (count >= 4) add(0, count - 1, options.preset === "RIVAL_CONTINENTS" ? "NAVAL" : "PASS");
    if (aiHeavy || emphasized.has("DOMINATION")) add(Math.max(0, left - 1), left, options.preset === "RIVAL_CONTINENTS" ? "LAND_BRIDGE" : "OPEN");
  } else if (options.preset === "THREE_REALMS") {
    const perRealm = count / 3;
    for (let realm = 0; realm < 3; realm += 1) for (let seat = 0; seat < perRealm; seat += 1) add(realm * perRealm + seat, realm * perRealm + (seat + 1) % perRealm, "OPEN");
    for (let realm = 0; realm < 3; realm += 1) {
      const next = (realm + 1) % 3;
      for (let seat = 0; seat < Math.max(1, Math.min(perRealm, aiHeavy ? 3 : 2)); seat += 1) add(realm * perRealm + seat, next * perRealm + seat % perRealm, seat % 2 ? "PASS" : "LAND_BRIDGE");
    }
  } else if (options.preset === "THALASSIC_LEAGUE") {
    for (let index = 0; index < count; index += 1) {
      add(index, (index + 1) % count, "NAVAL");
      add(index, (index + 2) % count, index % 3 === 0 && options.polisNavalImportance !== "HIGH" ? "LAND_BRIDGE" : "NAVAL");
    }
    if (aiHeavy) for (let index = 0; index < count; index += 2) add(index, (index + 3) % count, "NAVAL");
  } else if (options.preset === "UNEQUAL_REALMS") {
    for (let index = 0; index < count; index += 1) add(index, (index + 1) % count, roleForPlayer(options, index) === "TURTLE" ? "PASS" : "OPEN");
    for (let index = 0; index < count; index += 1) if (roleForPlayer(options, index) === "WAR") {
      add(index, (index + 2) % count, "LAND_BRIDGE");
      add(index, (index + 3) % count, "PASS");
    }
  } else {
    for (let index = 0; index < count; index += 1) add(index, (index + 1) % count, index % 3 === 0 ? "PASS" : "OPEN");
    if (options.preset === "CONTESTED_HEARTLAND") {
      for (let index = 0; index < Math.floor(count / 2); index += 1) add(index, (index + Math.floor(count / 2)) % count, "RIVER_CROSSING");
    } else {
      for (let index = 0; index < Math.min(4, Math.floor(count / 2)); index += 1) add(index, (index + Math.floor(count / 2)) % count, "PASS");
    }
    if (aiHeavy || emphasized.has("DOMINATION")) for (let index = 0; index < count; index += 2) add(index, (index + 2) % count, "OPEN");
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
  intent: MatchIntent,
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
      if (nearest < Math.max(MINIMUM_START_DISTANCE, Math.round(options.cityStateMinSpacing))) continue;
      const majorDistances = majorStarts.map((start) => hexDistance(candidate.point, start, width, wraps)).sort((one, two) => one - two);
      const contestability = majorDistances.length > 1 ? Math.max(0, 10 - Math.abs(majorDistances[1] - majorDistances[0])) : 0;
      const diplomacy = intent.emphasizedVictories.includes("DIPLOMACY") ? contestability * 2.4 : contestability * 0.5;
      const port = options.preset === "THALASSIC_LEAGUE" && candidate.coastal ? 14 : 0;
      const value = nearest * 4 + (candidate.coastal && options.cityStateCoastalPreference === "PREFER" ? 8 : 0) + diplomacy + port + hashNoise(candidate.point.x, candidate.point.y, seed) * 0.2;
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

function realmContactMetrics(nodes: StrategicNode[], edges: StrategicEdge[]) {
  const majors = nodes.filter((node) => node.kind === "MAJOR_START");
  const teamById = new Map(majors.map((node) => [node.id, node.team ?? node.owner ?? 0]));
  const pairs = new Set<string>();
  let crossRealmRoutes = 0;
  for (const edge of edges) {
    const one = teamById.get(edge.from); const two = teamById.get(edge.to);
    if (one === undefined || two === undefined || one === two) continue;
    crossRealmRoutes += 1;
    pairs.add([one, two].sort((a, b) => a - b).join("-"));
  }
  return { realmContactPairs: pairs.size, crossRealmRoutes };
}

function cityStateContestability(cityStates: Civ5StartLocation[], majors: Civ5StartLocation[], width: number, wraps: boolean) {
  if (!cityStates.length || majors.length < 2) return 0;
  const scores = cityStates.map((cityState) => {
    const distances = majors.map((major) => hexDistance(cityState, major, width, wraps)).sort((one, two) => one - two);
    return clamp(1 - Math.abs(distances[1] - distances[0]) / Math.max(4, distances[1]));
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function victoryFeasibility(intent: MatchIntent, metrics: Record<string, number>, options: MapGenerationOptions) {
  const state = (victory: VictoryCondition) => !intent.enabledVictories.includes(victory) ? "DISABLED" as const : intent.emphasizedVictories.includes(victory) ? "EMPHASIZED" as const : "ENABLED" as const;
  const scores: Record<VictoryCondition, number> = {
    DOMINATION: clamp(0.48 + metrics.averageNodeDegree * 0.08 + metrics.routeRedundancy * 0.035 + metrics.averageRouteWidth * 0.025 - metrics.navalDependence * 0.08),
    SCIENCE: clamp(0.42 + metrics.safeTilesPerPlayer / 85 + (options.strategicStartGuarantee ? 0.16 : 0) + metrics.routeRedundancy * 0.02),
    CULTURE: clamp(0.45 + metrics.safeTilesPerPlayer / 105 + metrics.crossRealmRoutes * 0.018 + metrics.averageRouteWidth * 0.015),
    DIPLOMACY: clamp(0.35 + metrics.cityStateContestability * 0.42 + Math.min(0.18, metrics.cityStatesPerPlayer * 0.14) + metrics.routeRedundancy * 0.018),
    TIME: clamp(0.45 + metrics.landTilesPerPlayer / 260 + metrics.averageNodeDegree * 0.045),
  };
  const descriptions: Record<VictoryCondition, string[]> = {
    DOMINATION: [`Capital graph degree averages ${metrics.averageNodeDegree.toFixed(2)} with ${metrics.routeRedundancy} redundant cycles.`, `${metrics.landRoutes} land and ${metrics.navalRoutes} naval capital routes preserve more than one military theatre.`],
    SCIENCE: [`Each major has roughly ${Math.round(metrics.safeTilesPerPlayer)} protected safe-region tiles.`, options.strategicStartGuarantee ? "Strategic start guarantees remain enabled for late-game development." : "Strategic start guarantees are disabled, which weakens predictable late-game access."],
    CULTURE: [`Safe territory and ${metrics.crossRealmRoutes} cross-realm contacts support defense, trade, and tourism contact.`, `Primary strategic routes average ${metrics.averageRouteWidth.toFixed(1)} tiles wide.`],
    DIPLOMACY: [`${Math.round(metrics.cityStateContestability * 100)}% mean city-state contestability avoids private diplomatic blocs.`, `${metrics.cityStates} city states provide ${metrics.cityStatesPerPlayer.toFixed(2)} per major civilization.`],
    TIME: [`Each major has roughly ${Math.round(metrics.landTilesPerPlayer)} land tiles of territorial capacity.`, `The capital network averages ${metrics.averageNodeDegree.toFixed(2)} routes per major.`],
  };
  const strictnessShift = intent.competitiveStrictness === "CASUAL" ? 5 : intent.competitiveStrictness === "TOURNAMENT" ? -5 : intent.competitiveStrictness === "ASYMMETRIC" ? -2 : 0;
  return (["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"] as VictoryCondition[]).map((victory) => {
    const score = Math.max(0, Math.min(100, Math.round(scores[victory] * 100) + strictnessShift));
    return { victory, state: state(victory), status: score >= 65 ? "SUPPORTED" as const : score >= 45 ? "WEAK" as const : "BLOCKED" as const, score, evidence: descriptions[victory], metrics: { score } };
  });
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
  scale: WorldScale = "GLOBAL",
  matchIntent?: MatchIntent,
  constraints?: GenerationConstraintPayload,
): PolisGeography {
  const character = worldCharacterProfile(options.style);
  const scaleProfile = worldScaleProfile(scale);
  const intent: MatchIntent = matchIntent ?? { schemaVersion: 1, humanPlayers: 0, aiPlayers: 0, flexiblePlayers: options.players, enabledVictories: ["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"], emphasizedVictories: [], teamIntent: options.balance === "TEAMS" ? "FIXED_TEAMS" : "FLEXIBLE", competitiveStrictness: options.balance === "TOURNAMENT" ? "TOURNAMENT" : "BALANCED", aiAccommodation: "NORMAL", balanceMode: options.balance, teamSize: options.teamSize, teamLayout: options.teamLayout, strategicBalance: options.strategicBalance };
  const requestedPlayerCount = Math.max(2, Math.min(22, Math.round(options.players)));
  const normalizedPlayers = normalizedPolisPlayerCount(options, requestedPlayerCount);
  const cityStateCount = Math.max(0, Math.min(41, Math.round(options.cityStates)));
  let anchors = buildMajorAnchors(options, width, height, wraps, normalizedPlayers.count, random);
  if (constraints?.adapter === "POLIS_STRATEGIC" && constraints.width === width && constraints.height === height) {
    const protectedMajorStarts = constraints.sourceStarts.filter((start) => !start.cityState && constraints.startsMask[start.y * width + start.x]);
    const semanticAnchors = constraints.semantics.filter((semantic) => semantic.objectKind === "STRATEGIC_REGION" || semantic.policy === "RELATIONSHIP").map((semantic) => ({ x: semantic.anchorIndex % width, y: Math.floor(semantic.anchorIndex / width) }));
    const replacements = [...protectedMajorStarts.map((start) => ({ x: start.x, y: start.y })), ...semanticAnchors];
    anchors = uniqueAnchors(anchors.map((anchor, index) => replacements[index] ?? anchor), width, height, wraps);
  }
  const playerCount = anchors.length;
  const teamFor = (player: number) => teamForPlayer(options, intent, player, playerCount);
  const majorStarts = anchors.map<Civ5StartLocation>((anchor, player) => ({
    ...anchor,
    player,
    civilization: "",
    leader: "",
    team: teamFor(player),
    playable: true,
    cityState: false,
  }));
  const expansionVictory = intent.emphasizedVictories.includes("SCIENCE") || intent.emphasizedVictories.includes("TIME");
  const requestedSafeRadius = Math.max(2, Math.min(8, Math.round(options.polisSafeRadius * scaleProfile.polis.safeRadius) + (expansionVictory ? 1 : 0)));
  const maximumDistinctSafeRadius = Math.max(2, Math.floor((minimumStartDistance(anchors, width, wraps) - 1) / 2));
  const safeRadius = Math.min(requestedSafeRadius, maximumDistinctSafeRadius);
  const relaxations: string[] = [...normalizedPlayers.relaxations];
  if (playerCount < normalizedPlayers.count) relaxations.push(`Placed ${playerCount} of ${normalizedPlayers.count} requested major starts after applying the Map Type contract and exhausting legal five-hex spacing.`);
  if (safeRadius < requestedSafeRadius) relaxations.push(`Safe territory radius reduced from ${requestedSafeRadius} to ${safeRadius} to prevent overlapping starts.`);
  const edgePairs = buildEdgePairs(options, playerCount, intent);
  if (constraints?.adapter === "POLIS_STRATEGIC") {
    const closestAnchor = (tile: number) => anchors.reduce((best, anchor, index) => {
      const separation = hexDistance(anchor, { x: tile % width, y: Math.floor(tile / width) }, width, wraps);
      return separation < best.separation ? { index, separation } : best;
    }, { index: 0, separation: Number.POSITIVE_INFINITY }).index;
    for (const semantic of constraints.semantics) for (const related of semantic.relatedAnchors) {
      const one = closestAnchor(semantic.anchorIndex);
      const two = closestAnchor(related.index);
      if (one !== two && !edgePairs.some(([from, to]) => from === one && to === two || from === two && to === one)) edgePairs.push([one, two, "LAND_BRIDGE"]);
    }
  }
  const strategicNodes: StrategicNode[] = anchors.map((anchor, owner) => ({
    id: `major-${owner + 1}`,
    kind: "MAJOR_START",
    ...anchor,
    owner,
    team: teamFor(owner),
    regionId: `safe-region-${owner + 1}`,
    role: roleForPlayer(options, owner),
    control: controlForPlayer(intent, owner),
  }));
  const protectedTiles = new Set<number>();
  const safeTiles = new Set<number>();
  const corridorTiles = new Set<number>();
  const hardRouteTiles = new Set<number>();
  const edgeRoutes: StrategicEdge[] = [];
  for (const [owner, anchor] of anchors.entries()) {
    const role = roleForPlayer(options, owner);
    const roleRadius = options.preset === "UNEQUAL_REALMS" ? role === "WIDE" ? safeRadius + 2 : role === "TALL" ? Math.max(2, safeRadius - 1) : role === "TURTLE" ? safeRadius + 1 : safeRadius : safeRadius;
    for (const point of pointsWithin(anchor, roleRadius, width, height, wraps)) {
      protectedTiles.add(indexOf(point, width));
      safeTiles.add(indexOf(point, width));
    }
  }

  const effectiveChokepointDensity = clamp(options.polisChokepointDensity + character.polis.chokepointShift + scaleProfile.polis.chokepointShift, 0, 100);
  const aiRatio = intent.aiPlayers / Math.max(1, intent.humanPlayers + intent.aiPlayers + intent.flexiblePlayers);
  const aiWidth = intent.aiAccommodation === "STRONG" ? 2 : aiRatio > 0.5 ? 1 : 0;
  const corridorRadius = Math.min(3, (effectiveChokepointDensity >= 72 ? 0 : effectiveChokepointDensity >= 38 ? 1 : 2) + aiWidth);
  for (const [edgeIndex, [from, to, kind]] of edgePairs.entries()) {
    const route = routeBetween(anchors[from], anchors[to], width, height, wraps, seed + edgeIndex * 97, character.polis.routeWander * scaleProfile.polis.routeWander);
    const routeIndices = route.map((point) => indexOf(point, width));
    if (kind !== "NAVAL") {
      for (const index of routeIndices) hardRouteTiles.add(index);
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
  if (["IMPERIAL_RING", "CONTESTED_HEARTLAND", "THREE_REALMS", "UNEQUAL_REALMS", "THALASSIC_LEAGUE"].includes(options.preset)) contestedPoints.unshift({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
  contestedPoints.slice(0, 8).forEach((point, index) => strategicNodes.push({ id: `contested-${index + 1}`, kind: index === 0 ? "OBJECTIVE" : "CONTESTED", ...point, regionId: `contested-region-${index + 1}` }));

  const strategicObjects: GeographicObject[] = anchors.map((anchor, owner) => ({
    id: `safe-region-${owner + 1}`,
    name: `Player ${owner + 1} Safe Territory`,
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(anchor, safeRadius + 1, width, height, wraps).map((point) => indexOf(point, width)),
    attributes: { role: "SAFE", contractRole: roleForPlayer(options, owner), owner, team: teamFor(owner), radius: safeRadius, control: controlForPlayer(intent, owner) },
  }));
  contestedPoints.slice(0, 8).forEach((point, index) => strategicObjects.push({
    id: `contested-region-${index + 1}`,
    name: index === 0 ? "Primary Contested Objective" : `Contested Region ${index + 1}`,
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(point, Math.max(2, safeRadius - 1), width, height, wraps).map((tile) => indexOf(tile, width)),
    attributes: { role: index === 0 ? "OBJECTIVE" : "CONTESTED", priority: index + 1 },
  }));

  const requestedLand = Math.round(width * height * (1 - clamp(options.waterPercent / 100, 0, 0.9)));
  const hardProtectedTiles = new Set([...safeTiles, ...hardRouteTiles]);
  if (constraints?.topology.length === width * height) for (let index = 0; index < constraints.topology.length; index += 1) if (constraints.topology[index] === 1) protectedTiles.add(index);
  if (protectedTiles.size > requestedLand && hardProtectedTiles.size <= requestedLand) {
    const removable = [...protectedTiles].filter((index) => !hardProtectedTiles.has(index)).sort((one, two) => {
      const oneHash = hashNoise(one % width, Math.floor(one / width), seed + 1193);
      const twoHash = hashNoise(two % width, Math.floor(two / width), seed + 1193);
      return oneHash - twoHash || one - two;
    });
    for (const index of removable) {
      if (protectedTiles.size <= requestedLand) break;
      protectedTiles.delete(index);
    }
    relaxations.push("Peripheral corridor width was narrowed to honor the requested land budget while preserving every strategic route.");
  }
  let protectedArray = [...protectedTiles];
  const scores = new Array<number>(width * height);
  const expansionRadius = options.polisExpansionPressure === "RELAXED" ? 0.27 : options.polisExpansionPressure === "IMMEDIATE" ? 0.18 : 0.22;
  const influenceRadius = Math.max(safeRadius + 2, Math.min(width, height) * expansionRadius);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = { x, y };
      const startInfluence = Math.max(...anchors.map((anchor) => 1 - hexDistance(point, anchor, width, wraps) / influenceRadius));
      const contestedInfluence = contestedPoints.length ? Math.max(...contestedPoints.map((target) => character.polis.contestedInfluence - hexDistance(point, target, width, wraps) / Math.max(4, influenceRadius * 0.9))) : 0;
      const broadNoise = smoothNoise(x, y, seed + 1201, Math.max(4, Math.min(width, height) / 5));
      const detail = smoothNoise(x, y, seed + 1213, 2.4);
      let score = Math.max(startInfluence, contestedInfluence) + broadNoise * character.polis.broadLandNoise + detail * character.polis.detailLandNoise;
      if (options.preset === "RIVAL_CONTINENTS") {
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
  const desiredLand = Math.max(protectedTiles.size, requestedLand);
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
  if (options.preset === "THALASSIC_LEAGUE") {
    for (const anchor of anchors) {
      const coast = neighbors(anchor, width, height, wraps)
        .map((point) => indexOf(point, width))
        .find((index) => landMask[index] && !hardRouteTiles.has(index));
      if (coast === undefined) continue;
      landMask[coast] = false;
      protectedTiles.delete(coast);
      safeTiles.delete(coast);
      landCount -= 1;
    }
    for (const index of rankedLand) {
      if (landCount >= desiredLand) break;
      if (landMask[index] || anchors.some((anchor) => hexDistance(anchor, { x: index % width, y: Math.floor(index / width) }, width, wraps) <= 1)) continue;
      landMask[index] = true;
      landCount += 1;
    }
    protectedArray = [...protectedTiles];
  }
  applyConstrainedLandBudget(landMask, desiredLand, scores, constraints);
  landCount = landMask.reduce((count, land) => count + Number(land), 0);

  const reliefValues = scores.map((score, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nearCorridor = neighbors({ x, y }, width, height, wraps).some((point) => corridorTiles.has(indexOf(point, width)));
    return smoothNoise(x, y, seed + 3011, 3.6) * 0.55 * character.polis.reliefNoise + smoothNoise(x, y, seed + 3023, 9) * 0.25 * character.polis.reliefNoise + (nearCorridor ? effectiveChokepointDensity / 250 * character.polis.corridorBarrier : 0) + score * 0.08;
  });
  const mountainCandidates = reliefValues.flatMap((value, index) => landMask[index] && !protectedTiles.has(index) && !safeTiles.has(index) ? [{ index, value }] : []);
  mountainCandidates.sort((one, two) => two.value - one.value || one.index - two.index);
  const effectiveMountainPercent = options.modifier === "STRATEGIC_DEPTH" ? Math.max(22, options.mountainPercent) : options.modifier === "DOOMSDAY" ? Math.max(18, options.mountainPercent) : Math.max(character.mountainFloor, options.mountainPercent);
  const mountainTarget = Math.min(mountainCandidates.length, Math.round(landCount * clamp(effectiveMountainPercent / 100, 0, 0.38)));
  const mountains = new Set(mountainCandidates.slice(0, mountainTarget).map((item) => item.index));
  const hillTarget = Math.round(landCount * (options.worldAge === "YOUNG" ? 0.3 : options.worldAge === "OLD" ? 0.14 : 0.21));
  const hills = new Set(mountainCandidates.slice(mountainTarget, mountainTarget + hillTarget).map((item) => item.index));
  const elevations = landMask.map((land, index) => land ? mountains.has(index) ? 2 : hills.has(index) ? 1 : 0 : 0);
  for (const index of corridorTiles) if (landMask[index]) elevations[index] = hashNoise(index % width, Math.floor(index / width), seed + 4013) > 0.78 ? 1 : 0;
  for (const index of safeTiles) if (landMask[index]) elevations[index] = hashNoise(index % width, Math.floor(index / width), seed + 4021) > character.polis.safeHillThreshold ? 1 : 0;
  if (options.preset === "UNEQUAL_REALMS") for (const [owner, anchor] of anchors.entries()) {
    const role = roleForPlayer(options, owner);
    for (const point of pointsWithin(anchor, safeRadius + 1, width, height, wraps)) {
      const index = indexOf(point, width);
      if (!landMask[index]) continue;
      const noise = hashNoise(point.x, point.y, seed + 4091 + owner);
      elevations[index] = role === "TALL" ? (noise > 0.52 ? 1 : 0) : role === "WIDE" ? (noise > 0.9 ? 1 : 0) : role === "WAR" ? (noise > 0.68 ? 1 : 0) : (noise > 0.74 ? 1 : 0);
    }
  }
  applyConstrainedRelief(reliefValues, elevations, landMask, constraints);

  const moistures = new Array<number>(landMask.length);
  const temperatures = new Array<number>(landMask.length);
  const rainShift = (options.rainfall === "WET" ? 0.14 : options.rainfall === "ARID" ? -0.16 : 0) + character.polis.moistureBias;
  const temperatureShift = options.climate === "HOT" ? 0.15 : options.climate === "COOL" ? -0.15 : 0;
  for (let y = 0; y < height; y += 1) {
    let airborne = 0.55 + rainShift;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!landMask[index]) airborne += (0.88 - airborne) * 0.3;
      const lift = elevations[index] === 2 ? 0.2 : elevations[index] === 1 ? 0.06 : 0;
      moistures[index] = clamp(airborne + smoothNoise(x, y, seed + 5011, 7) * 0.28 * character.polis.climateVariance - 0.12 + lift);
      airborne = clamp(airborne - lift * 0.58 + (landMask[index] ? -0.006 : 0.02));
      temperatures[index] = clamp(0.14 + Math.cos(scaledPoleProximity(x, y, width, height, options.projectionType, scale, seed + 53) * Math.PI / 2) * 0.76 + temperatureShift - elevations[index] * 0.07 + (smoothNoise(x, y, seed + 5021, 10 * scaleProfile.localDetail) - 0.5) * 0.16 * character.polis.climateVariance);
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
    if (!land && scaledPoleProximity(x, y, width, height, options.projectionType, scale, seed + 53) > 0.9 && hashNoise(x, y, seed + 6011) > 0.55) feature = 3;
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
  applyConstrainedSurface(tiles, landMask, elevations, constraints);
  const cityStates = assignCityStates(tiles, majorStarts, cityStateCount, width, height, wraps, options, seed + 7001, intent);
  if (cityStates.length < cityStateCount) relaxations.push(`Placed ${cityStates.length} of ${cityStateCount} requested city states after exhausting legal spacing.`);
  for (const cityState of cityStates) strategicNodes.push({ id: `city-state-${cityState.player - playerCount + 1}`, kind: "CITY_STATE", x: cityState.x, y: cityState.y, owner: cityState.player });

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Strategic Landmass");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Strategic Water Basin");
  const startDistances: number[] = [];
  for (let one = 0; one < anchors.length; one += 1) for (let two = one + 1; two < anchors.length; two += 1) startDistances.push(hexDistance(anchors[one], anchors[two], width, wraps));
  const contacts = realmContactMetrics(strategicNodes, edgeRoutes);
  const degreeByNode = strategicNodes.filter((node) => node.kind === "MAJOR_START").map((node) => edgeRoutes.filter((edge) => edge.from === node.id || edge.to === node.id).length);
  const averageRouteWidth = edgeRoutes.length ? edgeRoutes.reduce((sum, edge) => sum + edge.width, 0) / edgeRoutes.length : 0;
  const routeRedundancy = Math.max(0, edgeRoutes.length - playerCount + 1);
  const contestability = cityStateContestability(cityStates, majorStarts, width, wraps);
  const metrics: Record<string, number> = {
    minimumStartDistance: minimumStartDistance(anchors, width, wraps),
    averageStartDistance: startDistances.length ? Math.round(startDistances.reduce((sum, value) => sum + value, 0) / startDistances.length) : 0,
    averageFrontLength: edgeRoutes.length ? Math.round(edgeRoutes.reduce((sum, edge) => sum + edge.tileIndices.length, 0) / edgeRoutes.length) : 0,
    protectedTiles: protectedTiles.size,
    landRoutes: edgeRoutes.filter((edge) => edge.kind !== "NAVAL").length,
    navalRoutes: edgeRoutes.filter((edge) => edge.kind === "NAVAL").length,
    navalDependence: edgeRoutes.length ? edgeRoutes.filter((edge) => edge.kind === "NAVAL").length / edgeRoutes.length : 0,
    routeRedundancy,
    averageNodeDegree: degreeByNode.length ? degreeByNode.reduce((sum, value) => sum + value, 0) / degreeByNode.length : 0,
    minimumNodeDegree: degreeByNode.length ? Math.min(...degreeByNode) : 0,
    averageRouteWidth,
    realmContactPairs: contacts.realmContactPairs,
    crossRealmRoutes: contacts.crossRealmRoutes,
    cityStateContestability: contestability,
    cityStatesPerPlayer: cityStates.length / Math.max(1, playerCount),
    safeTilesPerPlayer: safeTiles.size / Math.max(1, playerCount),
    landTilesPerPlayer: landCount / Math.max(1, playerCount),
    cityStates: cityStates.length,
  };
  const roleGroups = new Map<string, { team: number; role: string; playerIds: number[] }>();
  for (let player = 0; player < playerCount; player += 1) {
    const team = teamFor(player); const role = roleForPlayer(options, player); const key = `${team}:${role}`;
    const group = roleGroups.get(key) ?? { team, role, playerIds: [] };
    group.playerIds.push(player); roleGroups.set(key, group);
  }
  const feasibility = victoryFeasibility(intent, metrics, options);
  const diagnostics = {
    strategicRegions: strategicObjects.length,
    fronts: edgeRoutes.length,
    contestedRegions: contestedPoints.length,
    majorStarts: majorStarts.length,
    cityStates: cityStates.length,
    characterChokepointDensity: Math.round(effectiveChokepointDensity),
    characterRouteWander: Math.round(character.polis.routeWander * 100),
    characterBarrierPressure: Math.round(character.polis.corridorBarrier * 100),
    scaleStrategicTravel: Math.round(scaleProfile.strategicTravel * 100),
    scaleSafeRadius: Math.round(scaleProfile.polis.safeRadius * 100),
    scaleRouteWander: Math.round(scaleProfile.polis.routeWander * 100),
    ...nativeConstraintDiagnostics(constraints),
    ...metrics,
  };
  const structure: GenerationStructure = {
    engine: "POLIS",
    objects: [...strategicObjects, ...continents, ...basins],
    mountainRanges: [],
    riverSystems: [],
    diagnostics,
    strategicGraph: {
      version: 2,
      mapType: options.preset,
      pattern: options.polisConflictPattern,
      symmetry: options.polisSymmetry,
      nodes: strategicNodes,
      edges: edgeRoutes,
      protectedTileIndices: protectedArray,
      relaxations: [...relaxations, ...(landCount > desiredLand ? ["Protected strategic routes exceeded the requested land budget."] : [])],
      metrics,
      matchIntent: { humanPlayers: intent.humanPlayers, aiPlayers: intent.aiPlayers, flexiblePlayers: intent.flexiblePlayers, teamIntent: intent.teamIntent, competitiveStrictness: intent.competitiveStrictness, aiAccommodation: intent.aiAccommodation, enabledVictories: [...intent.enabledVictories], emphasizedVictories: [...intent.emphasizedVictories] },
      realmRoles: [...roleGroups.values()],
      victoryFeasibility: feasibility,
    },
  };
  return { landMask, reliefValues, moistures, elevations, tiles, structure, startLocations: [...majorStarts, ...cityStates], diagnostics };
}
