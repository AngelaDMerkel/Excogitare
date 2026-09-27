import type { Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { connectedTileObjects, type GenerationStructure, type GeographicObject, type StrategicEdge, type StrategicNode } from "./generation-structure.ts";
import type { MapGenerationOptions } from "./map-generator.ts";
import type { MatchIntent, VictoryCondition, WorldScale } from "./generation-recipe.ts";
import { MINIMUM_START_DISTANCE } from "./start-locations.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";
import { narrativeInfluenceStrength, type NarrativeAdapterPlan, type PolisStrategicPlan } from "./narrative-engine-adapters.ts";

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

function directRouteBetween(start: Point, target: Point, width: number, height: number, wraps: boolean, seed: number, wander: number, blocked?: ReadonlySet<number>) {
  const startIndex = indexOf(start, width);
  const targetIndex = indexOf(target, width);
  const parents = new Int32Array(width * height);
  parents.fill(-1);
  parents[startIndex] = startIndex;
  const costs = new Float64Array(width * height);
  costs.fill(Number.POSITIVE_INFINITY);
  costs[startIndex] = 0;
  const queue: Array<{ index: number; priority: number }> = [{ index: startIndex, priority: 0 }];
  const push = (item: { index: number; priority: number }) => {
    queue.push(item);
    let position = queue.length - 1;
    while (position > 0) {
      const parent = Math.floor((position - 1) / 2);
      if (queue[parent].priority < item.priority || queue[parent].priority === item.priority && queue[parent].index <= item.index) break;
      queue[position] = queue[parent];
      position = parent;
    }
    queue[position] = item;
  };
  const pop = () => {
    const root = queue[0];
    const tail = queue.pop()!;
    if (queue.length) {
      let position = 0;
      while (true) {
        const left = position * 2 + 1;
        const right = left + 1;
        if (left >= queue.length) break;
        const child = right < queue.length && (queue[right].priority < queue[left].priority || queue[right].priority === queue[left].priority && queue[right].index < queue[left].index) ? right : left;
        if (queue[child].priority > tail.priority || queue[child].priority === tail.priority && queue[child].index >= tail.index) break;
        queue[position] = queue[child];
        position = child;
      }
      queue[position] = tail;
    }
    return root;
  };
  const settled = new Uint8Array(width * height);
  while (queue.length && parents[targetIndex] < 0) {
    const index = pop().index;
    if (settled[index]) continue;
    settled[index] = 1;
    const point = { x: index % width, y: Math.floor(index / width) };
    for (const next of neighbors(point, width, height, wraps)) {
      const nextIndex = indexOf(next, width);
      if (blocked?.has(nextIndex) && nextIndex !== targetIndex) continue;
      if (settled[nextIndex]) continue;
      const nextCost = costs[index] + 1 + hashNoise(next.x, next.y, seed) * Math.max(0, wander) * 0.08;
      if (nextCost >= costs[nextIndex]) continue;
      costs[nextIndex] = nextCost;
      parents[nextIndex] = index;
      push({ index: nextIndex, priority: nextCost + hexDistance(next, target, width, wraps) });
    }
  }
  if (parents[targetIndex] < 0) throw new Error("Polis could not embed a required strategic route.");
  const reversed = [targetIndex];
  while (reversed.at(-1) !== startIndex) reversed.push(parents[reversed.at(-1)!]);
  return reversed.reverse().map((index) => ({ x: index % width, y: Math.floor(index / width) }));
}

function routeBetween(start: Point, target: Point, width: number, height: number, wraps: boolean, seed: number, wander: number, blocked?: ReadonlySet<number>) {
  const separation = hexDistance(start, target, width, wraps);
  if (separation < Math.max(9, Math.round(Math.min(width, height) * 0.24))) {
    return directRouteBetween(start, target, width, height, wraps, seed, wander, blocked);
  }
  let dx = target.x - start.x;
  if (wraps && Math.abs(dx) > width / 2) dx += dx > 0 ? -width : width;
  const dy = target.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const naturalWander = Math.max(0.42, wander);
  const sign = hashNoise(start.x + target.x, start.y + target.y, seed + 53) > 0.5 ? 1 : -1;
  const offset = Math.max(2, Math.min(Math.round(Math.min(width, height) * 0.24), Math.round(separation * (0.28 + naturalWander * 0.1))));
  let middleX = start.x + dx * 0.5 - dy / length * offset * sign;
  const middleY = start.y + dy * 0.5 + dx / length * offset * sign;
  if (wraps) middleX = (middleX % width + width) % width;
  const preferred = { x: Math.max(1, Math.min(width - 2, Math.round(middleX))), y: Math.max(2, Math.min(height - 3, Math.round(middleY))) };
  const waypoint = Array.from({ length: width * height }, (_value, index) => ({ x: index % width, y: Math.floor(index / width) }))
    .filter((point) => point.y >= 1 && point.y < height - 1 && (!blocked?.has(indexOf(point, width)) || point.x === target.x && point.y === target.y))
    .sort((one, two) => hexDistance(one, preferred, width, wraps) - hexDistance(two, preferred, width, wraps)
      || hexDistance(start, one, width, wraps) + hexDistance(one, target, width, wraps) - hexDistance(start, two, width, wraps) - hexDistance(two, target, width, wraps)
      || one.y - two.y || one.x - two.x)[0];
  if (!waypoint || waypoint.x === start.x && waypoint.y === start.y || waypoint.x === target.x && waypoint.y === target.y) {
    return directRouteBetween(start, target, width, height, wraps, seed, naturalWander, blocked);
  }
  try {
    const first = directRouteBetween(start, waypoint, width, height, wraps, seed + 101, naturalWander, blocked);
    const second = directRouteBetween(waypoint, target, width, height, wraps, seed + 211, naturalWander, blocked);
    return [...first, ...second.slice(1)];
  } catch {
    return directRouteBetween(start, target, width, height, wraps, seed, naturalWander, blocked);
  }
}

function horizontalRoute(start: Point, target: Point, width: number, wraps: boolean) {
  const route = [{ ...start }];
  let x = start.x;
  while (x !== target.x) {
    const direct = target.x - x;
    const direction = wraps && Math.abs(direct) > width / 2 ? (direct > 0 ? -1 : 1) : Math.sign(direct);
    x += direction;
    if (wraps) x = (x + width) % width;
    route.push({ x, y: start.y });
  }
  return route;
}

function verticalRoute(start: Point, target: Point) {
  const route = [{ ...start }];
  const direction = Math.sign(target.y - start.y);
  for (let y = start.y + direction; direction && (direction > 0 ? y <= target.y : y >= target.y); y += direction) route.push({ x: start.x, y });
  return route;
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

function isNarrativeObjectiveRole(role: string) {
  return role === "SHARED_OBJECTIVE" || role === "DIPLOMATIC_PORT" || role.startsWith("HEARTLAND_DISTRICT_");
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

function buildNativeMajorAnchors(plan: PolisStrategicPlan | undefined, width: number, height: number, wraps: boolean, count: number, seed: number) {
  if (!plan) return undefined;
  const realms = plan.regions.filter((region) => !isNarrativeObjectiveRole(region.role) && (region.effect === "LAND" || region.effect === "VALUE"));
  if (!realms.length) return undefined;
  const anchors: Point[] = [];
  const seatsByRealm = new Array<number>(realms.length).fill(0);
  for (let player = 0; player < count; player += 1) {
    // Most Polis grammars arrange the actual seats in the same traversal order
    // as their retained realms. Extra Imperial Ring seats therefore subdivide
    // a realm locally instead of being appended after a complete circuit and
    // producing long criss-crossing fronts. Unequal Realms is the deliberate
    // exception: its repeating Tall/Wide/War/Turtle roles must retain their
    // corresponding four authored homes.
    const realmIndex = plan.profileId === "UNEQUAL_REALMS"
      ? player % realms.length
      : Math.min(realms.length - 1, Math.floor(player * realms.length / Math.max(1, count)));
    const realm = realms[realmIndex];
    const seat = seatsByRealm[realmIndex]++;
    const phase = hashNoise(realmIndex, player, seed + 911) * Math.PI * 2;
    const radius = seat === 0 && count <= realms.length ? 0 : Math.min(width, height) * (0.035 + seat * 0.025);
    const rawX = realm.anchor.x * width + Math.cos(phase) * radius;
    const rawY = realm.anchor.y * height + Math.sin(phase) * radius * 0.82;
    // A low-frequency warp preserves the strategic graph while preventing the
    // accepted ring/triangle/two-side contracts from reading as a literal board.
    const x = rawX + Math.sin(realm.anchor.y * Math.PI * 3 + seed * 0.00001) * width * 0.035;
    const y = rawY + Math.sin(realm.anchor.x * Math.PI * 2.4 + seed * 0.000017) * height * 0.028;
    anchors.push({ x, y });
  }
  const unique = uniqueAnchors(anchors, width, height, wraps);
  return unique.length >= Math.min(count, 2) ? unique : undefined;
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
      const rivalKind: StrategicEdge["kind"] = index === 0 && options.polisNavalImportance !== "LOW" ? "NAVAL" : index === 1 ? "LAND_BRIDGE" : index % 2 ? "PASS" : "NAVAL";
      add(index, left + index, options.preset === "RIVAL_CONTINENTS" ? rivalKind : index % 2 ? "PASS" : "LAND_BRIDGE");
    }
    if (count >= 4) add(0, count - 1, options.preset === "RIVAL_CONTINENTS" ? "LAND_BRIDGE" : "PASS");
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
    for (let index = 0; index < count; index += 1) add(index, (index + 1) % count, roleForPlayer(options, index) === "TURTLE" || roleForPlayer(options, (index + 1) % count) === "TURTLE" ? "PASS" : "OPEN");
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
  const objectives = nodes.filter((node) => node.kind === "OBJECTIVE");
  const graphNodes = [...majors, ...objectives];
  if (new Set(majors.map((node) => `${node.x},${node.y}`)).size !== majors.length) throw new Error("Polis produced overlapping major starts.");
  if (majors.some((node) => node.x < 0 || node.x >= width || node.y < 0 || node.y >= height)) throw new Error("Polis produced a major start outside the map.");
  const neighborsByNode = new Map(graphNodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!neighborsByNode.has(edge.from) || !neighborsByNode.has(edge.to)) throw new Error(`Polis produced a strategic edge with a missing endpoint: ${edge.id}.`);
    if (neighborsByNode.has(edge.from) && neighborsByNode.has(edge.to)) {
      neighborsByNode.get(edge.from)!.push(edge.to);
      neighborsByNode.get(edge.to)!.push(edge.from);
    }
    for (let index = 1; index < edge.tileIndices.length; index += 1) {
      if (!neighbors({ x: edge.tileIndices[index - 1] % width, y: Math.floor(edge.tileIndices[index - 1] / width) }, width, height, wraps).some((point) => indexOf(point, width) === edge.tileIndices[index])) {
        throw new Error(`Polis produced a discontinuous strategic front: ${edge.id}.`);
      }
    }
  }
  for (const objective of objectives) if ((neighborsByNode.get(objective.id)?.length ?? 0) < 2) throw new Error(`Polis produced an uncontestable objective: ${objective.id}.`);
  const reached = new Set<string>(majors.length ? [majors[0].id] : []);
  const queue = [...reached];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of neighborsByNode.get(queue[cursor]) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  if (reached.size !== graphNodes.length) throw new Error("Polis produced a disconnected strategic graph.");
}

function strategicTerrainFidelity(edges: StrategicEdge[], tiles: Civ5Tile[]) {
  const navalTiles = edges.filter((edge) => edge.kind === "NAVAL").flatMap((edge) => edge.tileIndices.slice(1, -1));
  const landTiles = edges.filter((edge) => edge.kind !== "NAVAL").flatMap((edge) => edge.tileIndices);
  const navalWaterShare = navalTiles.length ? navalTiles.filter((index) => tiles[index].terrain < 2).length / navalTiles.length : 1;
  const landPassableShare = landTiles.length ? landTiles.filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2).length / landTiles.length : 1;
  return { navalWaterShare, landPassableShare };
}

function passableComponentSizes(tiles: Civ5Tile[], width: number, height: number, wraps: boolean) {
  const sizeByTile = new Int32Array(tiles.length);
  const assigned = new Uint8Array(tiles.length);
  let largest = 0;
  for (let origin = 0; origin < tiles.length; origin += 1) {
    if (assigned[origin] || tiles[origin].terrain < 2 || tiles[origin].elevation >= 2) continue;
    const component = [origin];
    assigned[origin] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const point = { x: component[cursor] % width, y: Math.floor(component[cursor] / width) };
      for (const adjacent of neighbors(point, width, height, wraps)) {
        const index = indexOf(adjacent, width);
        if (assigned[index] || tiles[index].terrain < 2 || tiles[index].elevation >= 2) continue;
        assigned[index] = 1;
        component.push(index);
      }
    }
    largest = Math.max(largest, component.length);
    for (const index of component) sizeByTile[index] = component.length;
  }
  return { sizeByTile, largest };
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
  const components = passableComponentSizes(tiles, width, height, wraps);
  const minimumReachable = Math.min(12, components.largest);
  const candidates = tiles.flatMap((tile, index) => {
    if (tile.terrain < 2 || tile.elevation === 2) return [];
    if (components.sizeByTile[index] < minimumReachable) return [];
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
  narrative?: NarrativeAdapterPlan,
): PolisGeography {
  const character = worldCharacterProfile(options.style);
  const strategicPlan = narrative?.native.kind === "STRATEGIC_PLAN" ? narrative.native : undefined;
  const scaleProfile = worldScaleProfile(scale);
  const intent: MatchIntent = matchIntent ?? { schemaVersion: 1, humanPlayers: 0, aiPlayers: 0, flexiblePlayers: options.players, enabledVictories: ["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"], emphasizedVictories: [], teamIntent: options.balance === "TEAMS" ? "FIXED_TEAMS" : "FLEXIBLE", competitiveStrictness: options.balance === "TOURNAMENT" ? "TOURNAMENT" : "BALANCED", aiAccommodation: "NORMAL", balanceMode: options.balance, teamSize: options.teamSize, teamLayout: options.teamLayout, strategicBalance: options.strategicBalance };
  const requestedPlayerCount = Math.max(2, Math.min(22, Math.round(options.players)));
  const normalizedPlayers = normalizedPolisPlayerCount(options, requestedPlayerCount);
  const cityStateCount = Math.max(0, Math.min(41, Math.round(options.cityStates)));
  let anchors = buildNativeMajorAnchors(strategicPlan, width, height, wraps, normalizedPlayers.count, seed)
    ?? buildMajorAnchors(options, width, height, wraps, normalizedPlayers.count, random);
  if (constraints?.adapter === "POLIS_STRATEGIC" && constraints.width === width && constraints.height === height) {
    const protectedMajorStarts = constraints.sourceStarts.filter((start) => !start.cityState && constraints.startsMask[start.y * width + start.x]);
    const semanticAnchors = constraints.semantics.filter((semantic) => semantic.objectKind === "STRATEGIC_REGION" && semantic.policy !== "RELATIONSHIP")
      .map((semantic) => ({ x: semantic.anchorIndex % width, y: Math.floor(semantic.anchorIndex / width) }));
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
  const protectedSemanticRoutes: Array<{ sourceSemanticId: string; objectKind: string; policy: string; one: number; two: number; kind: StrategicEdge["kind"] }> = [];
  if (strategicPlan) {
    const candidates: Array<[number, number]> = [];
    for (let one = 0; one < playerCount; one += 1) for (let two = one + 1; two < playerCount; two += 1) if (!edgePairs.some(([from, to]) => from === one && to === two || from === two && to === one)) candidates.push([one, two]);
    candidates.sort((one, two) => hashNoise(one[0], one[1], seed + 1001) - hashNoise(two[0], two[1], seed + 1001));
    while (Math.max(0, edgePairs.length - playerCount + 1) < strategicPlan.obligations.routeRedundancy && candidates.length) {
      const [one, two] = candidates.shift()!;
      const navalShare = edgePairs.filter((edge) => edge[2] === "NAVAL").length / Math.max(1, edgePairs.length);
      edgePairs.push([one, two, navalShare < strategicPlan.obligations.navalDependence ? "NAVAL" : "OPEN"]);
    }
  }
  if (constraints?.adapter === "POLIS_STRATEGIC") {
    const closestAnchor = (tile: number) => anchors.reduce((best, anchor, index) => {
      const separation = hexDistance(anchor, { x: tile % width, y: Math.floor(tile / width) }, width, wraps);
      return separation < best.separation ? { index, separation } : best;
    }, { index: 0, separation: Number.POSITIVE_INFINITY }).index;
    for (const semantic of constraints.semantics) for (const related of semantic.relatedAnchors) {
      const one = closestAnchor(semantic.anchorIndex);
      const two = closestAnchor(related.index);
      if (one !== two) {
        const kind: StrategicEdge["kind"] = /OCEAN|SEA|STRAIT|RIFT|ARCHIPELAGO/.test(semantic.objectKind) ? "NAVAL" : /MOUNTAIN|RANGE|RIDGE/.test(semantic.objectKind) ? "PASS" : /RIVER|WATERSHED/.test(semantic.objectKind) ? "RIVER_CROSSING" : "LAND_BRIDGE";
        const existing = edgePairs.findIndex(([from, to]) => from === one && to === two || from === two && to === one);
        if (existing >= 0) edgePairs[existing] = [one, two, kind];
        else edgePairs.push([one, two, kind]);
        protectedSemanticRoutes.push({ sourceSemanticId: semantic.sourceSemanticId, objectKind: semantic.objectKind, policy: semantic.policy, one, two, kind });
      }
    }
  }
  if (options.preset === "THALASSIC_LEAGUE" && (strategicPlan?.obligations.navalDependence ?? 0) >= 0.9) {
    for (let index = 0; index < edgePairs.length; index += 1) edgePairs[index] = [edgePairs[index][0], edgePairs[index][1], "NAVAL"];
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
  const imperialRingAnchorNodes: StrategicNode[] = [];
  if (options.preset === "IMPERIAL_RING" && strategicPlan) {
    const authoredRealms = strategicPlan.regions.filter((region) => !isNarrativeObjectiveRole(region.role) && (region.effect === "LAND" || region.effect === "VALUE"));
    const occupiedRealmIndices = new Set(anchors.map((_anchor, owner) => Math.min(authoredRealms.length - 1, Math.floor(owner * authoredRealms.length / Math.max(1, playerCount)))));
    const selectedRealmIndices = new Set<number>();
    const cyclicDistance = (one: number, two: number) => Math.min(Math.abs(one - two), authoredRealms.length - Math.abs(one - two));
    while (imperialRingAnchorNodes.length < Math.max(0, authoredRealms.length - playerCount) && selectedRealmIndices.size < authoredRealms.length) {
      const references = [...occupiedRealmIndices, ...selectedRealmIndices];
      const nextRealm = authoredRealms
        .map((_region, index) => ({ index, separation: references.length ? Math.min(...references.map((reference) => cyclicDistance(index, reference))) : authoredRealms.length }))
        .filter((candidate) => !occupiedRealmIndices.has(candidate.index) && !selectedRealmIndices.has(candidate.index))
        .sort((one, two) => two.separation - one.separation || one.index - two.index)[0];
      if (!nextRealm) break;
      selectedRealmIndices.add(nextRealm.index);
      const region = authoredRealms[nextRealm.index];
      imperialRingAnchorNodes.push({
        id: `imperial-ring-anchor-${imperialRingAnchorNodes.length + 1}`,
        kind: "OBJECTIVE",
        x: Math.max(1, Math.min(width - 2, Math.round(region.anchor.x * (width - 1)))),
        y: Math.max(1, Math.min(height - 2, Math.round(region.anchor.y * (height - 1)))),
        regionId: `imperial-ring-anchor-region-${imperialRingAnchorNodes.length + 1}`,
        role: "LATERAL_RING_ANCHOR",
      });
    }
    strategicNodes.push(...imperialRingAnchorNodes);
  }
  const protectedTiles = new Set<number>();
  const startSafetyTiles = new Set<number>();
  const safeTiles = new Set<number>();
  const homeTilesByOwner = anchors.map(() => new Set<number>());
  const homeTileOwner = new Map<number, number>();
  const contestedDistrictTiles = new Set<number>();
  const corridorTiles = new Set<number>();
  const hardRouteTiles = new Set<number>();
  const navalRouteTiles = new Set<number>();
  const mandatoryPortWaterTiles = new Set<number>();
  const portsByOwner = new Map<number, Point[]>();
  const navalApproachesByOwner = new Map<number, Point[][]>();
  const edgeRoutes: StrategicEdge[] = [];
  const imperialLateralEdgeIds = new Set<string>();
  const navalOwners = new Set(edgePairs.flatMap(([from, to, kind]) => kind === "NAVAL" ? [from, to] : []));
  for (const owner of navalOwners) {
    const anchor = anchors[owner];
    const outward = anchor.x < width / 2 ? -1 : 1;
    const candidates = neighbors(anchor, width, height, wraps)
      .filter((point) => !anchors.some((other) => other.x === point.x && other.y === point.y))
      .sort((one, two) => Number(two.y === anchor.y && two.x - anchor.x === outward) - Number(one.y === anchor.y && one.x - anchor.x === outward));
    const ports = candidates.filter((point) => constraints?.topology[indexOf(point, width)] !== 1).slice(0, 2);
    if (!ports.length && candidates[0]) ports.push(candidates[0]);
    if (!ports.length) continue;
    portsByOwner.set(owner, ports);
    for (const port of ports) mandatoryPortWaterTiles.add(indexOf(port, width));
  }
  for (const [owner, anchor] of anchors.entries()) {
    const ports = portsByOwner.get(owner);
    if (ports?.length) {
      const blocked = new Set<number>();
      for (const [otherOwner, other] of anchors.entries()) if (otherOwner !== owner) for (const point of pointsWithin(other, 1, width, height, wraps)) blocked.add(indexOf(point, width));
      if (constraints?.topology.length === width * height) for (let index = 0; index < constraints.topology.length; index += 1) if (constraints.topology[index] === 1) blocked.add(index);
      const approaches: Point[][] = [];
      for (const [portIndex, port] of ports.entries()) {
        const direction = port.x === (anchor.x + width - 1) % width ? -1 : port.x === (anchor.x + 1) % width ? 1 : anchor.x < width / 2 ? -1 : 1;
        const target = {
          x: Math.max(0, Math.min(width - 1, port.x + direction * Math.max(3, Math.min(6, Math.floor(width / 10))))),
          y: Math.max(0, Math.min(height - 1, anchor.y + (portIndex ? 2 : -2))),
        };
        const routeBlocked = new Set(blocked);
        for (const prior of approaches) for (const point of prior.slice(0, -1)) routeBlocked.add(indexOf(point, width));
        let approach: Point[];
        try { approach = routeBetween(port, target, width, height, false, seed + 1301 + owner * 41 + portIndex * 997, character.polis.routeWander * 0.22, routeBlocked); }
        catch {
          const anchorsOnly = new Set(anchors.flatMap((other, otherOwner) => otherOwner === owner ? [] : [indexOf(other, width)]));
          approach = routeBetween(port, target, width, height, false, seed + 1301 + owner * 41 + portIndex * 997, character.polis.routeWander * 0.22, anchorsOnly);
        }
        for (const point of approach) mandatoryPortWaterTiles.add(indexOf(point, width));
        if (approach.length) approaches.push(approach);
      }
      if (approaches.length) navalApproachesByOwner.set(owner, approaches);
    }
  }
  for (const [owner, anchor] of anchors.entries()) {
    const role = roleForPlayer(options, owner);
    const roleRadius = options.preset === "UNEQUAL_REALMS" ? role === "WIDE" ? safeRadius + 2 : role === "TALL" ? Math.max(2, safeRadius - 1) : role === "TURTLE" ? safeRadius + 1 : safeRadius : safeRadius;
    for (const point of pointsWithin(anchor, roleRadius, width, height, wraps)) {
      const index = indexOf(point, width);
      if (mandatoryPortWaterTiles.has(index)) continue;
      const nearest = anchors.map((candidate, candidateOwner) => ({
        owner: candidateOwner,
        distance: hexDistance(point, candidate, width, wraps),
      })).sort((one, two) => one.distance - two.distance || one.owner - two.owner)[0];
      if (nearest.owner !== owner) continue;
      if (options.preset === "UNEQUAL_REALMS" && role === "TURTLE" && nearest.distance === roleRadius
        && hashNoise(point.x, point.y, seed + 4177 + owner) < 0.48) continue;
      homeTileOwner.set(index, owner);
      protectedTiles.add(index);
      safeTiles.add(index);
      homeTilesByOwner[owner].add(index);
    }
    for (const point of pointsWithin(anchor, 1, width, height, wraps)) if (!mandatoryPortWaterTiles.has(indexOf(point, width))) startSafetyTiles.add(indexOf(point, width));
  }
  const effectiveChokepointDensity = clamp(options.polisChokepointDensity + character.polis.chokepointShift + scaleProfile.polis.chokepointShift, 0, 100);
  const aiRatio = intent.aiPlayers / Math.max(1, intent.humanPlayers + intent.aiPlayers + intent.flexiblePlayers);
  const aiWidth = intent.aiAccommodation === "STRONG" ? 2 : aiRatio > 0.5 ? 1 : 0;
  const authoredWidth = Math.max(0, Math.round(((strategicPlan?.connectionScale ?? 1) - 1) * 8));
  const corridorRadius = Math.min(4, (effectiveChokepointDensity >= 72 ? 0 : effectiveChokepointDensity >= 38 ? 1 : 2) + aiWidth + authoredWidth);
  const laneUseByOwner = new Map<number, number>();
  const nextApproach = (owner: number) => {
    const approaches = navalApproachesByOwner.get(owner) ?? [];
    if (!approaches.length) return undefined;
    const use = laneUseByOwner.get(owner) ?? 0;
    laneUseByOwner.set(owner, use + 1);
    return approaches[use % approaches.length];
  };
  const buildNavalRoute = (from: number, to: number, routeSeed: number) => {
    const fromApproach = nextApproach(from);
    const toApproach = nextApproach(to);
    if (!fromApproach?.length || !toApproach?.length) return routeBetween(anchors[from], anchors[to], width, height, wraps, routeSeed, character.polis.routeWander * scaleProfile.polis.routeWander);
    const fromGateway = fromApproach.at(-1)!;
    const toGateway = toApproach.at(-1)!;
    if (options.preset === "THALASSIC_LEAGUE" || options.preset === "RIVAL_CONTINENTS") {
      const blocked = new Set(safeTiles);
      blocked.delete(indexOf(fromGateway, width));
      blocked.delete(indexOf(toGateway, width));
      const openSea = routeBetween(fromGateway, toGateway, width, height, wraps, routeSeed, character.polis.routeWander * scaleProfile.polis.routeWander, blocked);
      return [anchors[from], ...fromApproach, ...openSea.slice(1), ...[...toApproach].reverse().slice(1), anchors[to]];
    }
    const seaRow = fromGateway.y + toGateway.y <= height - 1 ? 0 : height - 1;
    const fromSea = { x: fromGateway.x, y: seaRow };
    const toSea = { x: toGateway.x, y: seaRow };
    const outward = verticalRoute(fromGateway, fromSea);
    const openSea = horizontalRoute(fromSea, toSea, width, wraps);
    const inward = verticalRoute(toSea, toGateway);
    return [anchors[from], ...fromApproach, ...outward.slice(1), ...openSea.slice(1), ...inward.slice(1), ...[...toApproach].reverse().slice(1), anchors[to]];
  };
  const orderedEdgePairs = edgePairs.map((pair, edgeIndex) => ({ pair, edgeIndex })).sort((one, two) => Number(one.pair[2] === "NAVAL") - Number(two.pair[2] === "NAVAL") || one.edgeIndex - two.edgeIndex);
  const initialImperialRingInteriors = new Set<number>();
  for (const { pair: [from, to, kind], edgeIndex } of orderedEdgePairs) {
    const edgeId = `front-${edgeIndex + 1}`;
    const imperialLateral = options.preset === "IMPERIAL_RING" && edgeIndex < playerCount;
    const blocked = imperialLateral
      ? new Set([...mandatoryPortWaterTiles, ...initialImperialRingInteriors])
      : mandatoryPortWaterTiles;
    if (imperialLateral) {
      blocked.delete(indexOf(anchors[from], width));
      blocked.delete(indexOf(anchors[to], width));
    }
    const route = kind === "NAVAL" && portsByOwner.has(from) && portsByOwner.has(to)
      ? buildNavalRoute(from, to, seed + edgeIndex * 97)
      : routeBetween(anchors[from], anchors[to], width, height, wraps, seed + edgeIndex * 97, character.polis.routeWander * scaleProfile.polis.routeWander, blocked);
    const routeIndices = route.map((point) => indexOf(point, width));
    if (imperialLateral) {
      imperialLateralEdgeIds.add(edgeId);
      for (const index of routeIndices.slice(1, -1)) initialImperialRingInteriors.add(index);
    }
    if (kind !== "NAVAL") {
      for (const index of routeIndices) hardRouteTiles.add(index);
      for (const point of route) {
        for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
          const index = indexOf(expanded, width);
          protectedTiles.add(index);
          corridorTiles.add(index);
        }
      }
    } else {
      for (const index of routeIndices.slice(1, -1)) navalRouteTiles.add(index);
    }
    edgeRoutes.push({ id: edgeId, from: `major-${from + 1}`, to: `major-${to + 1}`, kind, tileIndices: routeIndices, width: corridorRadius * 2 + 1 });
  }
  const reserveSupplementalRoute = (id: string, from: number, to: number, kind: StrategicEdge["kind"], ordinal: number, additionalBlocked: readonly number[] = [], allowOverlapFallback = true) => {
    const existing = edgeRoutes.filter((edge) => {
      const endpoints = new Set([edge.from, edge.to]);
      return endpoints.has(`major-${from + 1}`) && endpoints.has(`major-${to + 1}`);
    });
    const blocked = new Set([...mandatoryPortWaterTiles, ...additionalBlocked, ...existing.flatMap((edge) => edge.tileIndices.slice(1, -1))]);
    let route: Point[];
    if (kind === "NAVAL" && portsByOwner.has(from) && portsByOwner.has(to)) route = buildNavalRoute(from, to, seed + 2203 + ordinal * 211);
    else {
      try { route = routeBetween(anchors[from], anchors[to], width, height, wraps, seed + 2203 + ordinal * 211, character.polis.routeWander * scaleProfile.polis.routeWander, blocked); }
      catch {
        if (!allowOverlapFallback) return false;
        route = routeBetween(anchors[from], anchors[to], width, height, wraps, seed + 2203 + ordinal * 211, character.polis.routeWander * scaleProfile.polis.routeWander);
      }
    }
    const tileIndices = route.map((point) => indexOf(point, width));
    if (kind === "NAVAL") for (const index of tileIndices.slice(1, -1)) navalRouteTiles.add(index);
    else for (const point of route) {
      const index = indexOf(point, width);
      hardRouteTiles.add(index);
      for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
        const expandedIndex = indexOf(expanded, width);
        protectedTiles.add(expandedIndex);
        corridorTiles.add(expandedIndex);
      }
    }
    edgeRoutes.push({ id, from: `major-${from + 1}`, to: `major-${to + 1}`, kind, tileIndices, width: corridorRadius * 2 + 1 });
    return true;
  };
  if ((options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS") && playerCount === 2) {
    reserveSupplementalRoute(`${options.preset === "RIVAL_CONTINENTS" ? "rival" : "opposing"}-secondary-front`, 0, 1, options.preset === "RIVAL_CONTINENTS" ? "LAND_BRIDGE" : "PASS", 1);
  }
  if (options.preset === "THREE_REALMS") {
    const teams = [...new Set(anchors.map((_anchor, owner) => teamFor(owner)))];
    let ordinal = 0;
    for (let one = 0; one < teams.length; one += 1) for (let two = one + 1; two < teams.length; two += 1) {
      const existing = edgeRoutes.filter((edge) => {
        const from = Number(edge.from.slice("major-".length)) - 1;
        const to = Number(edge.to.slice("major-".length)) - 1;
        return new Set([teamFor(from), teamFor(to)]).has(teams[one]) && new Set([teamFor(from), teamFor(to)]).has(teams[two]) && teamFor(from) !== teamFor(to);
      });
      const fromMembers = anchors.flatMap((_anchor, owner) => teamFor(owner) === teams[one] ? [owner] : []);
      const toMembers = anchors.flatMap((_anchor, owner) => teamFor(owner) === teams[two] ? [owner] : []);
      ordinal += 1;
      const blocked = existing.flatMap((edge) => edge.tileIndices.slice(1, -1));
      const pairs = fromMembers.flatMap((from) => toMembers.map((to) => ({ from, to })))
        .sort((one, two) => {
          const separation = (pair: { from: number; to: number }) => Math.min(...blocked.map((index) => Math.min(
            hexDistance(anchors[pair.from], { x: index % width, y: Math.floor(index / width) }, width, wraps),
            hexDistance(anchors[pair.to], { x: index % width, y: Math.floor(index / width) }, width, wraps),
          )));
          return separation(two) - separation(one) || one.from - two.from || one.to - two.to;
        });
      let reserved = false;
      for (const pair of pairs) {
        if (reserveSupplementalRoute(`three-realm-secondary-${ordinal}`, pair.from, pair.to, "PASS", ordinal, blocked, false)) { reserved = true; break; }
      }
      if (!reserved) relaxations.push(`Three Realms could not embed a tile-independent secondary frontier for realm pair ${teams[one]}–${teams[two]}.`);
    }
  }
  if (options.preset === "THALASSIC_LEAGUE" && playerCount === 3) {
    for (let one = 0; one < playerCount; one += 1) {
      const two = (one + 1) % playerCount;
      if (one > two && !(one === playerCount - 1 && two === 0)) continue;
      reserveSupplementalRoute(`thalassic-secondary-${one + 1}`, one, two, "NAVAL", one + 1);
    }
  }
  if (options.preset === "UNEQUAL_REALMS") for (const owner of anchors.map((_anchor, index) => index).filter((index) => roleForPlayer(options, index) === "TURTLE")) {
    const incident = edgeRoutes.filter((edge) => (edge.from === `major-${owner + 1}` || edge.to === `major-${owner + 1}`) && (edge.kind === "PASS" || edge.kind === "LAND_BRIDGE"));
    if (incident.length < 2) continue;
    const reserved = new Set([...mandatoryPortWaterTiles, ...incident[0].tileIndices.slice(1, -1)]);
    for (const edge of incident.slice(1)) {
      const otherId = edge.from === `major-${owner + 1}` ? edge.to : edge.from;
      const other = Number(otherId.slice("major-".length)) - 1;
      if (!Number.isInteger(other) || !anchors[other]) continue;
      try {
        const route = routeBetween(anchors[owner], anchors[other], width, height, wraps, seed + 2503 + owner * 211 + edge.id.length * 17, character.polis.routeWander * scaleProfile.polis.routeWander, reserved);
        edge.from = `major-${owner + 1}`;
        edge.to = `major-${other + 1}`;
        edge.tileIndices = route.map((point) => indexOf(point, width));
        for (const index of edge.tileIndices) hardRouteTiles.add(index);
        for (const point of route) for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
          const index = indexOf(expanded, width);
          protectedTiles.add(index);
          corridorTiles.add(index);
        }
      } catch {
        // The strict final proof rejects the candidate if a genuinely separate
        // second approach cannot be embedded; no duplicated route is claimed.
      }
    }
  }
  if (imperialRingAnchorNodes.length) {
    const circuit = strategicNodes
      .filter((node) => node.kind === "MAJOR_START" || node.role === "LATERAL_RING_ANCHOR")
      .sort((one, two) => Math.atan2(one.y - height / 2, one.x - width / 2) - Math.atan2(two.y - height / 2, two.x - width / 2));
    const reservedRingInteriors = new Set<number>();
    for (let index = 0; index < circuit.length; index += 1) {
      const from = circuit[index];
      const to = circuit[(index + 1) % circuit.length];
      const blocked = new Set([...mandatoryPortWaterTiles, ...reservedRingInteriors]);
      blocked.delete(indexOf(from, width));
      blocked.delete(indexOf(to, width));
      const route = routeBetween(from, to, width, height, wraps, seed + 1703 + index * 149, character.polis.routeWander * scaleProfile.polis.routeWander, blocked);
      const routeIndices = route.map((point) => indexOf(point, width));
      for (const routeIndex of routeIndices.slice(1, -1)) reservedRingInteriors.add(routeIndex);
      for (const routeIndex of routeIndices) hardRouteTiles.add(routeIndex);
      for (const point of route) for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
        const expandedIndex = indexOf(expanded, width);
        protectedTiles.add(expandedIndex);
        corridorTiles.add(expandedIndex);
      }
      edgeRoutes.push({ id: `imperial-lateral-${index + 1}`, from: from.id, to: to.id, kind: "OPEN", tileIndices: routeIndices, width: corridorRadius * 2 + 1 });
    }
  }
  validateStrategicTopology(strategicNodes, edgeRoutes, width, height, wraps);

  const contestedPoints: Point[] = [];
  const objectiveDistrictRadius = options.preset === "THALASSIC_LEAGUE" ? 2 : 1;
  for (const edge of edgeRoutes.filter((item) => item.kind !== "OPEN").slice(0, Math.max(1, Math.min(8, Math.ceil(playerCount / 2))))) {
    const midpoint = edge.tileIndices[Math.floor(edge.tileIndices.length / 2)];
    const midpointPoint = { x: midpoint % width, y: Math.floor(midpoint / width) };
    // A hinge objective may overlook a sea lane, but the objective itself is a
    // settleable land district. Land and naval hinges can cross, so reserve the
    // complete district footprint against every exact sea lane regardless of
    // which hinge supplied this midpoint.
    const point = pointsWithin(midpointPoint, 3, width, height, wraps)
      .filter((candidate) => pointsWithin(candidate, objectiveDistrictRadius, width, height, wraps)
        .every((districtTile) => !navalRouteTiles.has(indexOf(districtTile, width))
          && !mandatoryPortWaterTiles.has(indexOf(districtTile, width)))
        && anchors.every((anchor) => hexDistance(candidate, anchor, width, wraps) >= 3))
      .sort((one, two) => hexDistance(one, midpointPoint, width, wraps) - hexDistance(two, midpointPoint, width, wraps)
        || hashNoise(one.x, one.y, seed + 1031) - hashNoise(two.x, two.y, seed + 1031)
        || one.y - two.y || one.x - two.x)[0];
    if (!point) continue;
    if (!contestedPoints.some((other) => hexDistance(point, other, width, wraps) < 4)) contestedPoints.push(point);
  }
  if (options.preset === "CONTESTED_HEARTLAND" && strategicPlan) {
    contestedPoints.length = 0;
    for (const region of strategicPlan.regions.filter((candidate) => isNarrativeObjectiveRole(candidate.role))) contestedPoints.push({ x: Math.max(1, Math.min(width - 2, Math.round(region.anchor.x * (width - 1)))), y: Math.max(1, Math.min(height - 2, Math.round(region.anchor.y * (height - 1)))) });
  } else if (options.preset === "THALASSIC_LEAGUE") {
    // Diplomatic port districts are selected after the principal sea network
    // exists so a land objective can never overwrite the interior of an exact
    // port-to-port lane.
    contestedPoints.length = 0;
  } else if (["IMPERIAL_RING", "THREE_REALMS", "UNEQUAL_REALMS"].includes(options.preset)) contestedPoints.unshift({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
  const authoredObjectiveCount = strategicPlan?.regions.filter((region) => isNarrativeObjectiveRole(region.role)).length ?? 0;
  const requiredObjectives = Math.min(8, Math.max(strategicPlan?.obligations.minimumObjectives ?? 1, authoredObjectiveCount));
  // Contested city-state content is an authored strategic obligation, so the
  // graph must reserve enough distinct theatres for the requested roster
  // before terrain and starts are finalized. Two tiny objective disks cannot
  // physically hold five or nine globally spaced city states on otherwise
  // ordinary Duel/Standard Rival Continents maps.
  const contestedCityStateTarget = Math.ceil(cityStateCount * (strategicPlan?.contract.content.cityStateContestability ?? 0.5));
  const desiredContestedRegions = Math.max(requiredObjectives, contestedCityStateTarget);
  for (let attempt = 0; contestedPoints.length < desiredContestedRegions && attempt < width * height; attempt += 1) {
    const point = { x: 2 + Math.floor(hashNoise(attempt, 17, seed + 1049) * Math.max(1, width - 4)), y: 2 + Math.floor(hashNoise(attempt, 31, seed + 1051) * Math.max(1, height - 4)) };
    const clearsNavalLane = pointsWithin(point, objectiveDistrictRadius, width, height, wraps)
      .every((candidate) => !navalRouteTiles.has(indexOf(candidate, width)) && !mandatoryPortWaterTiles.has(indexOf(candidate, width)));
    if (clearsNavalLane && contestedPoints.every((other) => hexDistance(point, other, width, wraps) >= 5) && anchors.every((anchor) => hexDistance(point, anchor, width, wraps) >= 5)) contestedPoints.push(point);
  }
  contestedPoints.slice(0, desiredContestedRegions).forEach((point, index) => strategicNodes.push({ id: `contested-${index + 1}`, kind: index < requiredObjectives ? "OBJECTIVE" : "CONTESTED", ...point, regionId: `contested-region-${index + 1}` }));
  for (const [districtIndex, point] of contestedPoints.slice(0, desiredContestedRegions).entries()) {
    const district = pointsWithin(point, objectiveDistrictRadius, width, height, wraps);
    for (const tile of district) {
      const index = indexOf(tile, width);
      contestedDistrictTiles.add(index);
      if (districtIndex < requiredObjectives) safeTiles.add(index);
      protectedTiles.add(index);
    }
  }
  const addObjectiveRoute = (objective: number, owner: number, variant: string, kind: StrategicEdge["kind"]) => {
    const point = contestedPoints[objective];
    const prior = edgeRoutes.filter((edge) => new Set([edge.from, edge.to]).has(`major-${owner + 1}`) && new Set([edge.from, edge.to]).has(`contested-${objective + 1}`));
    const priorOwnerApproaches = options.preset === "CONTESTED_HEARTLAND"
      ? edgeRoutes.filter((edge) => (edge.from === `major-${owner + 1}` || edge.to === `major-${owner + 1}`)
        && (edge.from.startsWith("contested-") || edge.to.startsWith("contested-")))
      : prior;
    const blocked = new Set([...mandatoryPortWaterTiles, ...navalRouteTiles, ...priorOwnerApproaches.flatMap((edge) => edge.tileIndices.slice(1, -1))]);
    const ownerPorts = portsByOwner.get(owner) ?? [];
    const objectivePort = ownerPorts[objective % Math.max(1, ownerPorts.length)];
    let route: Point[];
    if (kind === "NAVAL" && objectivePort) {
      const ownerApproach = nextApproach(owner) ?? [objectivePort];
      const ownerGateway = ownerApproach.at(-1)!;
      const objectiveGateways = neighbors(point, width, height, wraps)
        .filter((candidate) => !anchors.some((anchor) => anchor.x === candidate.x && anchor.y === candidate.y))
        .sort((one, two) => hashNoise(one.x, one.y, seed + objective * 127) - hashNoise(two.x, two.y, seed + objective * 127) || one.y - two.y || one.x - two.x);
      const objectiveGateway = objectiveGateways[prior.length % Math.max(1, objectiveGateways.length)];
      if (!objectiveGateway) throw new Error(`Polis could not reserve a coastal approach for contested objective ${objective + 1}.`);
      mandatoryPortWaterTiles.add(indexOf(objectiveGateway, width));
      const seaRow = ownerGateway.y + objectiveGateway.y <= height - 1 ? 0 : height - 1;
      if (options.preset === "THALASSIC_LEAGUE") {
        const outerGateway = neighbors(objectiveGateway, width, height, wraps)
          .filter((candidate) => hexDistance(candidate, point, width, wraps) === 2
            && !anchors.some((anchor) => anchor.x === candidate.x && anchor.y === candidate.y))
          .sort((one, two) => hashNoise(one.x, one.y, seed + objective * 139 + prior.length) - hashNoise(two.x, two.y, seed + objective * 139 + prior.length)
            || one.y - two.y || one.x - two.x)[0] ?? objectiveGateway;
        mandatoryPortWaterTiles.add(indexOf(outerGateway, width));
        const blocked = new Set(safeTiles);
        // The open-water leg may enter the district through its chosen coastal
        // gateway, but it must not traverse the land objective before the
        // explicit terminal step appends that objective as the final endpoint.
        blocked.add(indexOf(point, width));
        blocked.delete(indexOf(ownerGateway, width));
        blocked.delete(indexOf(outerGateway, width));
        const openSea = routeBetween(ownerGateway, outerGateway, width, height, wraps, seed + 1601 + objective * 131 + owner * 17 + prior.length * 997, character.polis.routeWander * scaleProfile.polis.routeWander, blocked);
        route = [anchors[owner], ...ownerApproach, ...openSea.slice(1), ...(outerGateway.x === objectiveGateway.x && outerGateway.y === objectiveGateway.y ? [] : [objectiveGateway]), point];
      } else {
        const ownerSea = { x: ownerGateway.x, y: seaRow };
        const objectiveSea = { x: objectiveGateway.x, y: seaRow };
        route = [anchors[owner], ...ownerApproach, ...verticalRoute(ownerGateway, ownerSea).slice(1), ...horizontalRoute(ownerSea, objectiveSea, width, wraps).slice(1), ...verticalRoute(objectiveSea, objectiveGateway).slice(1), point];
      }
    }
    else {
      try { route = routeBetween(anchors[owner], point, width, height, wraps, seed + 1601 + objective * 131 + owner * 17 + prior.length * 997, character.polis.routeWander * scaleProfile.polis.routeWander, blocked); }
      catch { route = routeBetween(anchors[owner], point, width, height, wraps, seed + 1601 + objective * 131 + owner * 17 + prior.length * 997, character.polis.routeWander * scaleProfile.polis.routeWander, navalRouteTiles); }
    }
    const routeIndices = route.map((tile) => indexOf(tile, width));
    if (kind === "NAVAL") for (const index of routeIndices.slice(1, -1)) {
      navalRouteTiles.add(index);
      if (options.preset === "THALASSIC_LEAGUE") mandatoryPortWaterTiles.add(index);
    }
    else for (const index of routeIndices) { hardRouteTiles.add(index); protectedTiles.add(index); corridorTiles.add(index); }
    edgeRoutes.push({ id: `objective-route-${objective + 1}-${owner + 1}-${variant}`, from: `major-${owner + 1}`, to: `contested-${objective + 1}`, kind, tileIndices: routeIndices, width: Math.max(1, corridorRadius * 2 + 1) });
  };
  if (options.preset === "IMPERIAL_RING") {
    for (let owner = 0; owner < playerCount; owner += 1) {
      addObjectiveRoute(0, owner, "primary", "OPEN");
      addObjectiveRoute(0, owner, "secondary", "PASS");
    }
    for (let objective = 1; objective < Math.min(requiredObjectives, contestedPoints.length); objective += 1) for (const owner of anchors.map((_anchor, index) => index).sort((one, two) => hexDistance(anchors[one], contestedPoints[objective], width, wraps) - hexDistance(anchors[two], contestedPoints[objective], width, wraps)).slice(0, 2)) addObjectiveRoute(objective, owner, "support", "OPEN");
  } else if (options.preset === "CONTESTED_HEARTLAND") {
    const districtCount = Math.min(requiredObjectives, contestedPoints.length);
    for (let owner = 0; owner < playerCount; owner += 1) {
      addObjectiveRoute(owner % districtCount, owner, "primary", "OPEN");
      addObjectiveRoute((owner + 1) % districtCount, owner, "secondary", "RIVER_CROSSING");
    }
    const reservedThroughInteriors = new Set<number>();
    for (let district = 0; district < districtCount; district += 1) {
      const next = (district + 1) % districtCount;
      const blocked = new Set([...navalRouteTiles, ...reservedThroughInteriors]);
      blocked.delete(indexOf(contestedPoints[district], width));
      blocked.delete(indexOf(contestedPoints[next], width));
      const route = routeBetween(contestedPoints[district], contestedPoints[next], width, height, wraps, seed + 2801 + district * 149, character.polis.routeWander * scaleProfile.polis.routeWander, blocked);
      const tileIndices = route.map((tile) => indexOf(tile, width));
      for (const index of tileIndices.slice(1, -1)) reservedThroughInteriors.add(index);
      for (const index of tileIndices) { hardRouteTiles.add(index); protectedTiles.add(index); corridorTiles.add(index); }
      edgeRoutes.push({ id: `heartland-through-${district + 1}`, from: `contested-${district + 1}`, to: `contested-${next + 1}`, kind: "OPEN", tileIndices, width: Math.max(1, corridorRadius * 2 + 1) });
    }
  } else for (let objective = 0; objective < Math.min(requiredObjectives, contestedPoints.length); objective += 1) {
    const point = contestedPoints[objective];
    const nearestMajors = anchors.map((_anchor, owner) => owner).sort((one, two) => hexDistance(anchors[one], point, width, wraps) - hexDistance(anchors[two], point, width, wraps)).slice(0, Math.min(2, anchors.length));
    for (const owner of nearestMajors) {
      // Contested objectives are settleable land districts. Naval identity is
      // carried by the exact port-to-port lane graph; the final approach onto
      // a district must remain a legal land route rather than submerging safe
      // territory in order to make a nominal NAVAL edge appear valid.
      addObjectiveRoute(objective, owner, "support", options.preset === "THALASSIC_LEAGUE" ? "NAVAL" : "OPEN");
    }
  }
  // Water and land reservations are negotiated as distinct media. Once all
  // naval obligations (including objective approaches) are known, land routes
  // are re-embedded around them instead of silently becoming submerged roads.
  protectedTiles.clear();
  for (const index of safeTiles) protectedTiles.add(index);
  for (const index of contestedDistrictTiles) protectedTiles.add(index);
  corridorTiles.clear();
  hardRouteTiles.clear();
  const pointByNode = new Map(strategicNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  // A naval objective route legitimately terminates on the objective's land
  // tile.  Keep that endpoint out of both source reservation sets as well as
  // the negotiated union: the later terrain pass consumes the source sets,
  // and deleting only from the union would still submerge the port district.
  for (const point of contestedPoints.slice(0, requiredObjectives)) {
    const index = indexOf(point, width);
    navalRouteTiles.delete(index);
    mandatoryPortWaterTiles.delete(index);
    safeTiles.add(index);
    protectedTiles.add(index);
  }
  const exactWaterReservations = constraints?.topology.length === width * height
    ? Array.from(constraints.topology, (value, index) => value === 0 ? index : -1).filter((index) => index >= 0)
    : [];
  const finalWaterReservations = new Set([...navalRouteTiles, ...mandatoryPortWaterTiles, ...exactWaterReservations]);
  const finalImperialRingInteriors = new Set<number>();
  let finalImperialRingOrdinal = 0;
  for (const edge of edgeRoutes.filter((candidate) => candidate.kind !== "NAVAL")) {
    const imperialLateral = options.preset === "IMPERIAL_RING"
      && (imperialLateralEdgeIds.has(edge.id) || edge.id.startsWith("imperial-lateral-"));
    if (imperialLateral) {
      const from = pointByNode.get(edge.from);
      const to = pointByNode.get(edge.to);
      if (from && to) {
        const blocked = new Set([...finalWaterReservations, ...finalImperialRingInteriors]);
        blocked.delete(indexOf(from, width));
        blocked.delete(indexOf(to, width));
        try {
          edge.tileIndices = routeBetween(from, to, width, height, wraps, seed + 3109 + finalImperialRingOrdinal * 149, character.polis.routeWander * scaleProfile.polis.routeWander, blocked).map((point) => indexOf(point, width));
        } catch {
          relaxations.push(`${edge.id} could not retain a private lateral interior after water negotiation; candidate review must reject any collapsed circuit.`);
        }
      }
      for (const index of edge.tileIndices.slice(1, -1)) finalImperialRingInteriors.add(index);
      finalImperialRingOrdinal += 1;
    } else if (edge.tileIndices.some((index) => finalWaterReservations.has(index))) {
      const from = pointByNode.get(edge.from);
      const to = pointByNode.get(edge.to);
      if (from && to) {
        try {
          edge.tileIndices = routeBetween(from, to, width, height, wraps, seed + 1901 + edge.tileIndices.length * 13, character.polis.routeWander * scaleProfile.polis.routeWander, finalWaterReservations).map((point) => indexOf(point, width));
        } catch {
          relaxations.push(`${edge.id} could not be separated completely from the naval network; the overlap remains disclosed for candidate review.`);
        }
      }
    }
    for (const index of edge.tileIndices) hardRouteTiles.add(index);
    for (const index of edge.tileIndices) {
      const point = { x: index % width, y: Math.floor(index / width) };
      for (const expanded of pointsWithin(point, corridorRadius, width, height, wraps)) {
        const expandedIndex = indexOf(expanded, width);
        protectedTiles.add(expandedIndex);
        corridorTiles.add(expandedIndex);
      }
    }
  }
  if (options.preset === "THREE_REALMS") {
    for (const edge of edgeRoutes.filter((candidate) => candidate.id.startsWith("three-realm-secondary-"))) {
      const fromOwner = Number(edge.from.slice("major-".length)) - 1;
      const toOwner = Number(edge.to.slice("major-".length)) - 1;
      const fromTeam = teamFor(fromOwner);
      const toTeam = teamFor(toOwner);
      const pair = new Set([fromTeam, toTeam]);
      const primaryInteriors = edgeRoutes.filter((candidate) => candidate.id !== edge.id && !candidate.id.startsWith("three-realm-secondary-")
        && candidate.from.startsWith("major-") && candidate.to.startsWith("major-")
        && (() => {
          const one = Number(candidate.from.slice("major-".length)) - 1;
          const two = Number(candidate.to.slice("major-".length)) - 1;
          return teamFor(one) !== teamFor(two) && pair.has(teamFor(one)) && pair.has(teamFor(two));
        })()).flatMap((candidate) => candidate.tileIndices.slice(1, -1));
      const candidatePairs = anchors.flatMap((_anchor, one) => teamFor(one) === fromTeam
        ? anchors.flatMap((_other, two) => teamFor(two) === toTeam ? [{ one, two }] : [])
        : []).sort((one, two) => Number(one.one === fromOwner && one.two === toOwner) - Number(two.one === fromOwner && two.two === toOwner)
          || one.one - two.one || one.two - two.two);
      let realized: { one: number; two: number; route: number[] } | undefined;
      for (const candidate of candidatePairs) {
        const blocked = new Set([...finalWaterReservations, ...primaryInteriors]);
        blocked.delete(indexOf(anchors[candidate.one], width));
        blocked.delete(indexOf(anchors[candidate.two], width));
        try {
          const route = routeBetween(anchors[candidate.one], anchors[candidate.two], width, height, wraps,
            seed + 3607 + Number(edge.id.match(/(\d+)$/)?.[1] ?? 0) * 173 + candidate.one * 31 + candidate.two * 43,
            character.polis.routeWander * scaleProfile.polis.routeWander, blocked).map((point) => indexOf(point, width));
          realized = { ...candidate, route };
          break;
        } catch { /* Try another exact cross-realm seat pair. */ }
      }
      if (realized) {
        edge.from = `major-${realized.one + 1}`;
        edge.to = `major-${realized.two + 1}`;
        edge.tileIndices = realized.route;
      } else {
        relaxations.push(`${edge.id} could not retain a tile-independent final frontier after sea-level negotiation.`);
      }
      for (const index of edge.tileIndices) {
        hardRouteTiles.add(index);
        protectedTiles.add(index);
      }
    }
  }
  validateStrategicTopology(strategicNodes, edgeRoutes, width, height, wraps);

  const strategicObjects: GeographicObject[] = anchors.map((anchor, owner) => ({
    id: `safe-region-${owner + 1}`,
    name: `Player ${owner + 1} Safe Territory`,
    kind: "STRATEGIC_REGION",
    tileIndices: [...homeTilesByOwner[owner]],
    attributes: { role: "SAFE", contractRole: roleForPlayer(options, owner), owner, team: teamFor(owner), radius: Math.max(...[...homeTilesByOwner[owner]].map((index) => hexDistance(anchor, { x: index % width, y: Math.floor(index / width) }, width, wraps)), 0), control: controlForPlayer(intent, owner) },
  }));
  contestedPoints.slice(0, desiredContestedRegions).forEach((point, index) => strategicObjects.push({
    id: `contested-region-${index + 1}`,
    name: index < requiredObjectives ? `Contested Objective ${index + 1}` : `Contested Region ${index + 1}`,
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(point, Math.max(2, safeRadius - 1), width, height, wraps).map((tile) => indexOf(tile, width)),
    attributes: { role: index < requiredObjectives ? "OBJECTIVE" : "CONTESTED", priority: index + 1 },
  }));
  for (const node of imperialRingAnchorNodes) strategicObjects.push({
    id: node.regionId!,
    name: "Neutral Ring Seat",
    kind: "STRATEGIC_REGION",
    tileIndices: pointsWithin(node, 2, width, height, wraps).map((point) => indexOf(point, width)),
    attributes: { role: "RING_ANCHOR", strategicNode: node.id },
  });
  if (options.preset === "OPPOSING_FRONTS" || options.preset === "RIVAL_CONTINENTS" || options.preset === "THREE_REALMS") {
    const teams = [...new Set(strategicNodes.filter((node) => node.kind === "MAJOR_START").map((node) => node.team!))];
    for (const team of teams) {
      const members = strategicObjects.filter((object) => object.attributes?.role === "SAFE" && object.attributes?.team === team);
      strategicObjects.push({
        id: `team-region-${team + 1}`,
        name: `Team ${team + 1} Realm`,
        kind: "STRATEGIC_REGION",
        tileIndices: [...new Set(members.flatMap((object) => object.tileIndices))],
        attributes: { role: "TEAM_REALM", team, memberRegions: members.map((object) => object.id).join(",") },
      });
    }
  }
  if (options.preset === "UNEQUAL_REALMS") for (const role of ["TALL", "WIDE", "WAR", "TURTLE"]) {
    const members = strategicObjects.filter((object) => object.attributes?.role === "SAFE" && object.attributes?.contractRole === role);
    strategicObjects.push({
      id: `role-region-${role.toLowerCase()}`,
      name: `${role[0]}${role.slice(1).toLowerCase()} Realms`,
      kind: "STRATEGIC_REGION",
      tileIndices: [...new Set(members.flatMap((object) => object.tileIndices))],
      attributes: { role: "ROLE_REALM", contractRole: role, memberRegions: members.map((object) => object.id).join(",") },
    });
  }

  const requestedLand = Math.round(width * height * (1 - clamp(options.waterPercent / 100, 0, 0.9)));
  const hardProtectedTiles = new Set([...safeTiles, ...hardRouteTiles, ...contestedDistrictTiles]);
  if (hardProtectedTiles.size > requestedLand) {
    const removableSafe = [...safeTiles].filter((index) => !startSafetyTiles.has(index) && !hardRouteTiles.has(index) && !contestedDistrictTiles.has(index))
      .sort((one, two) => {
        const ownerOf = (index: number) => homeTileOwner.get(index);
        const distanceFromOwner = (index: number) => {
          const owner = ownerOf(index);
          return owner === undefined ? 0 : hexDistance({ x: index % width, y: Math.floor(index / width) }, anchors[owner], width, wraps);
        };
        return distanceFromOwner(two) - distanceFromOwner(one) || one - two;
      });
    let removed = 0;
    for (const index of removableSafe) {
      if (hardProtectedTiles.size <= requestedLand) break;
      const owner = homeTileOwner.get(index);
      if (owner === undefined || homeTilesByOwner[owner].size <= 16) continue;
      safeTiles.delete(index);
      protectedTiles.delete(index);
      homeTilesByOwner[owner].delete(index);
      homeTileOwner.delete(index);
      hardProtectedTiles.delete(index);
      removed += 1;
    }
    if (removed) relaxations.push(`Peripheral safe-territory fringes were narrowed by ${removed} tiles to preserve the explicit sea level while retaining sixteen-tile home buffers and every hard route.`);
  }
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
  const rivalTeamCenters = options.preset === "RIVAL_CONTINENTS"
    ? [0, 1].map((team) => {
        const members = anchors.filter((_anchor, owner) => teamFor(owner) === team);
        return { x: members.reduce((sum, anchor) => sum + anchor.x, 0) / Math.max(1, members.length), y: members.reduce((sum, anchor) => sum + anchor.y, 0) / Math.max(1, members.length) };
      })
    : [];
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
        const realmDistance = Math.min(...rivalTeamCenters.map((center) => hexDistance(point, center, width, wraps))) / Math.max(1, Math.min(width, height));
        score += 0.5 - realmDistance * 1.9;
        const midpoint = { x: (rivalTeamCenters[0].x + rivalTeamCenters[1].x) / 2, y: (rivalTeamCenters[0].y + rivalTeamCenters[1].y) / 2 };
        const middle = hexDistance(point, midpoint, width, wraps) / Math.max(1, Math.min(width, height));
        if (middle < 0.1) score -= options.polisNavalImportance === "HIGH" ? 0.9 : 0.55;
      }
      if (!wraps) {
        const edge = Math.min(x, width - 1 - x, y, height - 1 - y);
        if (edge < 2) score -= (2 - edge) * 0.5;
      }
      const narrativeDisguise = narrative?.topology[y * width + x] ?? 0;
      const asymmetricDisguise = (smoothNoise(x + 17, y + 29, seed + 1291, 5.7) - 0.5) * character.polis.detailLandNoise;
      scores[y * width + x] = score + narrativeDisguise * narrativeInfluenceStrength("POLIS").topology + asymmetricDisguise;
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
  applyConstrainedLandBudget(landMask, desiredLand, scores, constraints);
  let protectedNavalConflicts = 0;
  for (const index of navalRouteTiles) {
    if (constraints?.topology[index] === 1 || safeTiles.has(index) && !mandatoryPortWaterTiles.has(index)) { protectedNavalConflicts += 1; continue; }
    landMask[index] = false;
    protectedTiles.delete(index);
    safeTiles.delete(index);
    corridorTiles.delete(index);
  }
  for (const index of mandatoryPortWaterTiles) {
    if (constraints?.topology[index] === 1) { protectedNavalConflicts += 1; continue; }
    landMask[index] = false;
    protectedTiles.delete(index);
    safeTiles.delete(index);
    corridorTiles.delete(index);
  }
  if (protectedNavalConflicts) relaxations.push(`${protectedNavalConflicts} protected land tiles interrupt native naval routes; the relationship was retained as a disclosed protection conflict.`);
  let adjustedLand = landMask.reduce((count, land) => count + Number(land), 0);
  for (const index of rankedLand) {
    if (adjustedLand >= desiredLand) break;
    if (landMask[index] || navalRouteTiles.has(index) || constraints?.topology[index] === 0 || anchors.some((anchor) => indexOf(anchor, width) === index)) continue;
    landMask[index] = true;
    adjustedLand += 1;
  }
  if (adjustedLand > desiredLand) {
    const removable = [...rankedLand].reverse().filter((index) => landMask[index] && !protectedTiles.has(index) && !startSafetyTiles.has(index) && constraints?.topology[index] !== 1);
    for (const index of removable) { if (adjustedLand <= desiredLand) break; landMask[index] = false; adjustedLand -= 1; }
  }
  if (options.preset === "THALASSIC_LEAGUE") {
    const landComponent = (origin: number) => {
      if (!landMask[origin]) return new Set<number>();
      const reached = new Set([origin]);
      const queue = [origin];
      for (let cursor = 0; cursor < queue.length; cursor += 1) for (const point of neighbors({ x: queue[cursor] % width, y: Math.floor(queue[cursor] / width) }, width, height, wraps)) {
        const next = indexOf(point, width);
        if (!landMask[next] || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
      return reached;
    };
    for (const [owner, anchor] of anchors.entries()) {
      const origin = indexOf(anchor, width);
      const component = landComponent(origin);
      while (component.size < 12) {
        const additions = [...new Set([...component].flatMap((index) => neighbors({ x: index % width, y: Math.floor(index / width) }, width, height, wraps)
          .map((point) => indexOf(point, width))))]
          .filter((index) => !landMask[index] && !navalRouteTiles.has(index) && !mandatoryPortWaterTiles.has(index)
            && constraints?.topology[index] !== 0
            && neighbors({ x: index % width, y: Math.floor(index / width) }, width, height, wraps)
              .every((point) => {
                const neighborOwner = homeTileOwner.get(indexOf(point, width));
                return neighborOwner === undefined || neighborOwner === owner;
              }))
          .sort((one, two) => scores[two] - scores[one] || one - two);
        const donors = landMask.flatMap((land, index) => land && !component.has(index) && !protectedTiles.has(index) && !hardRouteTiles.has(index)
          && !contestedDistrictTiles.has(index) && constraints?.topology[index] !== 1 ? [index] : [])
          .sort((one, two) => neighbors({ x: one % width, y: Math.floor(one / width) }, width, height, wraps).filter((point) => landMask[indexOf(point, width)]).length
            - neighbors({ x: two % width, y: Math.floor(two / width) }, width, height, wraps).filter((point) => landMask[indexOf(point, width)]).length || one - two);
        const added = additions[0];
        const donor = donors[0];
        if (added === undefined || donor === undefined) break;
        landMask[added] = true;
        landMask[donor] = false;
        component.add(added);
        safeTiles.add(added);
        protectedTiles.add(added);
        homeTilesByOwner[owner].add(added);
        homeTileOwner.set(added, owner);
        const home = strategicObjects.find((object) => object.id === `safe-region-${owner + 1}`);
        if (home && !home.tileIndices.includes(added)) home.tileIndices.push(added);
      }
    }
  }
  protectedArray = [...protectedTiles];
  landCount = landMask.reduce((count, land) => count + Number(land), 0);

  const reliefValues = scores.map((score, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nearCorridor = neighbors({ x, y }, width, height, wraps).some((point) => corridorTiles.has(indexOf(point, width)));
    const value = smoothNoise(x, y, seed + 3011, 3.6) * 0.55 * character.polis.reliefNoise + smoothNoise(x, y, seed + 3023, 9) * 0.25 * character.polis.reliefNoise + (nearCorridor ? effectiveChokepointDensity / 250 * character.polis.corridorBarrier : 0) + score * 0.08 + (narrative?.relief[index] ?? 0) * narrativeInfluenceStrength("POLIS").relief;
    return hardRouteTiles.has(index) ? Math.min(value, -1) : value;
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
    if (role === "TURTLE") {
      const defensiveFlank = [...homeTilesByOwner[owner]].filter((index) => landMask[index]
        && hexDistance(anchor, { x: index % width, y: Math.floor(index / width) }, width, wraps) >= 3)
        .sort((one, two) => hashNoise(one % width, Math.floor(one / width), seed + 4133 + owner) - hashNoise(two % width, Math.floor(two / width), seed + 4133 + owner) || one - two);
      for (const index of defensiveFlank.slice(0, Math.max(5, Math.ceil(defensiveFlank.length * 0.55)))) elevations[index] = 1;
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
      moistures[index] = clamp(airborne + smoothNoise(x, y, seed + 5011, 7) * 0.28 * character.polis.climateVariance - 0.12 + lift + (narrative?.moisture[index] ?? 0) * narrativeInfluenceStrength("POLIS").climate);
      airborne = clamp(airborne - lift * 0.58 + (landMask[index] ? -0.006 : 0.02));
      temperatures[index] = clamp(0.14 + Math.cos(scaledPoleProximity(x, y, width, height, options.projectionType, scale, seed + 53) * Math.PI / 2) * 0.76 + temperatureShift - elevations[index] * 0.07 + (smoothNoise(x, y, seed + 5021, 10 * scaleProfile.localDetail) - 0.5) * 0.16 * character.polis.climateVariance + (narrative?.temperature[index] ?? 0) * narrativeInfluenceStrength("POLIS").climate);
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
    if (land && safeTiles.has(index)) {
      const nearest = anchors.reduce((best, anchor, owner) => {
        const separation = hexDistance({ x, y }, anchor, width, wraps);
        return separation < best.separation ? { owner, separation } : best;
      }, { owner: 0, separation: Number.POSITIVE_INFINITY });
      const role = roleForPlayer(options, nearest.owner);
      if (options.preset === "UNEQUAL_REALMS") {
        if (role === "TALL") { terrain = hashNoise(x, y, seed + 6101) > 0.22 ? 2 : 3; feature = hashNoise(x, y, seed + 6103) > 0.78 ? 0 : 255; }
        else if (role === "WAR") { terrain = hashNoise(x, y, seed + 6113) > 0.18 ? 3 : 2; feature = 255; }
        else if (role === "TURTLE") { terrain = hashNoise(x, y, seed + 6121) > 0.52 ? 3 : 2; feature = elevations[index] < 2 && hashNoise(x, y, seed + 6127) > 0.48 ? 0 : 255; }
      } else {
        terrain = nearest.separation > 0 && nearest.separation % 3 === 0 ? 3 : 2;
        feature = 255;
      }
    }
    return { terrain, elevation: elevations[index], feature, resource: 255, resourceAmount: 0, river: 0, wonder: 255, continent: land ? 1 : 0 };
  });
  applyConstrainedSurface(tiles, landMask, elevations, constraints);
  for (const object of strategicObjects) {
    if (object.attributes?.role !== "SAFE" && object.attributes?.role !== "OBJECTIVE") continue;
    object.tileIndices = object.tileIndices.filter((index) => landMask[index]);
    if (object.attributes?.role !== "OBJECTIVE") continue;
    // A port district can border several authored sea lanes.  Those lanes may
    // divide the original radius stencil into separate shore fragments, but a
    // single causal objective must describe one actual, traversable district.
    // Retain exactly the passable component containing its strategic node.
    const node = strategicNodes.find((candidate) => candidate.regionId === object.id && candidate.kind === "OBJECTIVE");
    const origin = node ? indexOf(node, width) : undefined;
    const members = new Set(object.tileIndices.filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2));
    if (origin === undefined || !members.has(origin)) {
      object.tileIndices = [];
      continue;
    }
    const reached = new Set([origin]);
    const queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = { x: queue[cursor] % width, y: Math.floor(queue[cursor] / width) };
      for (const adjacent of neighbors(point, width, height, wraps)) {
        const adjacentIndex = indexOf(adjacent, width);
        if (!members.has(adjacentIndex) || reached.has(adjacentIndex)) continue;
        reached.add(adjacentIndex);
        queue.push(adjacentIndex);
      }
    }
    if (options.preset === "THALASSIC_LEAGUE") {
      const majorSites = new Set(anchors.map((anchor) => indexOf(anchor, width)));
      while (reached.size < 7) {
        const frontier = [...new Set([...reached].flatMap((index) => neighbors({ x: index % width, y: Math.floor(index / width) }, width, height, wraps)
          .map((adjacent) => indexOf(adjacent, width))))]
          .filter((index) => !reached.has(index) && !majorSites.has(index) && tiles[index].terrain >= 2 && tiles[index].elevation < 2)
          .sort((one, two) => hexDistance({ x: one % width, y: Math.floor(one / width) }, { x: origin % width, y: Math.floor(origin / width) }, width, wraps)
            - hexDistance({ x: two % width, y: Math.floor(two / width) }, { x: origin % width, y: Math.floor(origin / width) }, width, wraps)
            || reliefValues[one] - reliefValues[two] || one - two);
        if (!frontier.length) break;
        reached.add(frontier[0]);
      }
    }
    object.tileIndices = [...reached];
  }
  const strategicRegionById = new Map(strategicObjects.map((object) => [object.id, object]));
  for (const object of strategicObjects.filter((candidate) => candidate.attributes?.role === "TEAM_REALM" || candidate.attributes?.role === "ROLE_REALM")) {
    const members = String(object.attributes?.memberRegions ?? "").split(",").filter(Boolean);
    object.tileIndices = [...new Set(members.flatMap((id) => strategicRegionById.get(id)?.tileIndices ?? []))];
  }
  const routeFidelity = strategicTerrainFidelity(edgeRoutes, tiles);
  if (routeFidelity.navalWaterShare < 0.98) relaxations.push(`Native naval-route fidelity is ${Math.round(routeFidelity.navalWaterShare * 100)}% because protected terrain interrupts one or more sea lanes.`);
  if (routeFidelity.landPassableShare < 0.98) relaxations.push(`Native land-route fidelity is ${Math.round(routeFidelity.landPassableShare * 100)}% because protected terrain interrupts one or more strategic corridors.`);
  const cityStates = assignCityStates(tiles, majorStarts, cityStateCount, width, height, wraps, options, seed + 7001, intent);
  if (cityStates.length < cityStateCount) relaxations.push(`Placed ${cityStates.length} of ${cityStateCount} requested city states after exhausting legal spacing.`);
  for (const cityState of cityStates) strategicNodes.push({ id: `city-state-${cityState.player - playerCount + 1}`, kind: "CITY_STATE", x: cityState.x, y: cityState.y, owner: cityState.player });

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Strategic Landmass");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Strategic Water Basin");
  const barrierTiles = new Set(elevations.flatMap((elevation, index) => elevation === 2 && neighbors({ x: index % width, y: Math.floor(index / width) }, width, height, wraps).some((point) => corridorTiles.has(indexOf(point, width))) ? [index] : []));
  const objectiveTileIndices = new Set(strategicObjects.filter((object) => object.attributes?.role === "OBJECTIVE").flatMap((object) => object.tileIndices));
  const startDistances: number[] = [];
  for (let one = 0; one < anchors.length; one += 1) for (let two = one + 1; two < anchors.length; two += 1) startDistances.push(hexDistance(anchors[one], anchors[two], width, wraps));
  const contacts = realmContactMetrics(strategicNodes, edgeRoutes);
  const degreeByNode = strategicNodes.filter((node) => node.kind === "MAJOR_START").map((node) => edgeRoutes.filter((edge) => edge.from === node.id || edge.to === node.id).length);
  const averageRouteWidth = edgeRoutes.length ? edgeRoutes.reduce((sum, edge) => sum + edge.width, 0) / edgeRoutes.length : 0;
  const routeRedundancy = Math.max(0, edgeRoutes.length - playerCount + 1);
  const contestability = cityStateContestability(cityStates, majorStarts, width, wraps);
  const roleCapacity: Record<string, number> = {};
  for (const object of strategicObjects.filter((candidate) => candidate.attributes?.role === "SAFE")) {
    const role = String(object.attributes?.contractRole ?? "REALM").toLowerCase();
    roleCapacity[`roleCapacity${role[0].toUpperCase()}${role.slice(1).toLowerCase()}`] = (roleCapacity[`roleCapacity${role[0].toUpperCase()}${role.slice(1).toLowerCase()}`] ?? 0) + object.tileIndices.length;
  }
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
    objectiveCount: strategicNodes.filter((node) => node.kind === "OBJECTIVE").length,
    objectiveRouteCount: edgeRoutes.filter((edge) => edge.to.startsWith("contested-") || edge.from.startsWith("contested-")).length,
    navalRouteWaterShare: routeFidelity.navalWaterShare,
    landRoutePassableShare: routeFidelity.landPassableShare,
    requiredRouteRedundancy: strategicPlan?.obligations.routeRedundancy ?? 0,
    ...roleCapacity,
  };
  const roleGroups = new Map<string, { team: number; role: string; playerIds: number[] }>();
  for (let player = 0; player < playerCount; player += 1) {
    const team = teamFor(player); const role = roleForPlayer(options, player); const key = `${team}:${role}`;
    const group = roleGroups.get(key) ?? { team, role, playerIds: [] };
    group.playerIds.push(player); roleGroups.set(key, group);
  }
  const feasibility = victoryFeasibility(intent, metrics, options);
  const sourceByNativeRegion = new Map<string, GeographicObject>();
  if (strategicPlan) {
    const nativeRealms = strategicPlan.regions.filter((region) => !isNarrativeObjectiveRole(region.role));
    const realmOrder = new Map(nativeRealms.map((region, index) => [region.id, index]));
    const used = new Set<string>();
    const centerOf = (object: GeographicObject) => {
      const indices = object.tileIndices.length ? object.tileIndices : [0];
      return {
        x: indices.reduce((sum, index) => sum + index % width, 0) / indices.length,
        y: indices.reduce((sum, index) => sum + Math.floor(index / width), 0) / indices.length,
      };
    };
    for (const region of strategicPlan.regions) {
      const order = realmOrder.get(region.id) ?? 0;
      let candidates: GeographicObject[];
      if (isNarrativeObjectiveRole(region.role)) candidates = strategicObjects.filter((object) => object.attributes?.role === "OBJECTIVE");
      else if (strategicPlan.profileId === "OPPOSING_FRONTS" || strategicPlan.profileId === "RIVAL_CONTINENTS" || strategicPlan.profileId === "THREE_REALMS") {
        candidates = strategicObjects.filter((object) => object.attributes?.role === "TEAM_REALM" && object.attributes?.team === order);
      } else if (strategicPlan.profileId === "UNEQUAL_REALMS") {
        candidates = strategicObjects.filter((object) => object.attributes?.role === "ROLE_REALM" && object.attributes?.contractRole === region.role);
      } else candidates = strategicObjects.filter((object) => object.attributes?.role === "SAFE" || object.attributes?.role === "RING_ANCHOR");
      const target = { x: region.anchor.x * width, y: region.anchor.y * height };
      const source = candidates.filter((object) => !used.has(object.id)).sort((one, two) => {
        const a = centerOf(one); const b = centerOf(two);
        return hexDistance(a, target, width, wraps) - hexDistance(b, target, width, wraps) || one.id.localeCompare(two.id);
      })[0];
      if (!source) continue;
      used.add(source.id);
      sourceByNativeRegion.set(region.id, source);
    }
  }
  const sourceNodes = (source: GeographicObject | undefined) => {
    if (!source) return [] as StrategicNode[];
    const members = String(source.attributes?.memberRegions ?? "").split(",").filter(Boolean);
    const regionIds = new Set(members.length ? members : [source.id]);
    return strategicNodes.filter((node) => node.regionId && regionIds.has(node.regionId));
  };
  const usedNativeEdgeIds = new Set<string>();
  const edgePath = (from: string, to: string, candidates: StrategicEdge[]) => {
    const links = new Map<string, StrategicEdge[]>();
    for (const edge of candidates) {
      links.set(edge.from, [...(links.get(edge.from) ?? []), edge]);
      links.set(edge.to, [...(links.get(edge.to) ?? []), edge]);
    }
    const queue = [from];
    const parent = new Map<string, { node: string; edge: StrategicEdge }>();
    for (let cursor = 0; cursor < queue.length && !parent.has(to); cursor += 1) for (const edge of links.get(queue[cursor]) ?? []) {
      const next = edge.from === queue[cursor] ? edge.to : edge.from;
      if (next === from || parent.has(next)) continue;
      parent.set(next, { node: queue[cursor], edge });
      queue.push(next);
    }
    if (!parent.has(to)) return [];
    const result: StrategicEdge[] = [];
    for (let current = to; current !== from;) {
      const step = parent.get(current)!;
      result.push(step.edge);
      current = step.node;
    }
    return result.reverse();
  };
  const nativeStrategicObjects: GeographicObject[] = strategicPlan ? [
    ...strategicPlan.regions.flatMap((region): GeographicObject[] => {
      const source = sourceByNativeRegion.get(region.id);
      if (!source) return [];
      return [{ id: `narrative-${region.id}`, semanticId: `narrative:${region.id}`, name: region.role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_REGION", tileIndices: [...source.tileIndices], attributes: { nativeNarrative: true, grammarFamily: strategicPlan.grammarFamily, strategicSource: source.id, role: region.role, effect: region.effect, parent: region.parentId ?? "", priority: region.priority } }];
    }),
    ...strategicPlan.paths.flatMap((path): GeographicObject[] => {
      const fromNodes = sourceNodes(sourceByNativeRegion.get(path.from));
      const toNodes = sourceNodes(sourceByNativeRegion.get(path.to));
      const fromIds = new Set(fromNodes.map((node) => node.id));
      const toIds = new Set(toNodes.map((node) => node.id));
      const medium = (edge: StrategicEdge) => path.effect === "WATER_PATH" ? edge.kind === "NAVAL" : path.effect === "LAND_PATH" ? edge.kind !== "NAVAL" : true;
      const usedRouteTiles = new Set(edgeRoutes.filter((edge) => usedNativeEdgeIds.has(edge.id)).flatMap((edge) => edge.tileIndices.slice(1, -1)));
      const direct = edgeRoutes.filter((edge) => medium(edge) && !usedNativeEdgeIds.has(edge.id)
        && (fromIds.has(edge.from) && toIds.has(edge.to) || fromIds.has(edge.to) && toIds.has(edge.from)));
      direct.sort((one, two) => one.tileIndices.slice(1, -1).filter((index) => usedRouteTiles.has(index)).length
        - two.tileIndices.slice(1, -1).filter((index) => usedRouteTiles.has(index)).length
        || one.id.localeCompare(two.id));
      let sourceEdges = direct.length ? [direct[0]] : [];
      if (!sourceEdges.length && strategicPlan.profileId === "IMPERIAL_RING" && path.kind === "LATERAL_RING" && fromNodes[0] && toNodes[0]) {
        const circuit = edgeRoutes.filter((edge) => !usedNativeEdgeIds.has(edge.id) && medium(edge)
          && [edge.from, edge.to].every((id) => strategicNodes.some((node) => node.id === id && (node.kind === "MAJOR_START" || node.role === "LATERAL_RING_ANCHOR"))));
        sourceEdges = edgePath(fromNodes[0].id, toNodes[0].id, circuit);
      }
      if (!sourceEdges.length) return [];
      for (const edge of sourceEdges) usedNativeEdgeIds.add(edge.id);
      const tileIndices = [...new Set(sourceEdges.flatMap((sourceEdge) => sourceEdge.tileIndices))];
      const strategicSources = sourceEdges.map((sourceEdge) => sourceEdge.id);
      return [{ id: `narrative-${path.id}`, semanticId: `narrative:${path.id}`, name: path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_PATH", tileIndices, attributes: { nativeNarrative: true, grammarFamily: strategicPlan.grammarFamily, strategicSource: strategicSources[0], strategicSources: strategicSources.join(","), relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength } }];
    }),
  ] : [];
  const protectedSemanticObjects: GeographicObject[] = (constraints?.semantics ?? []).flatMap((semantic, semanticIndex): GeographicObject[] => {
    const binding = protectedSemanticRoutes.find((candidate) => candidate.sourceSemanticId === semantic.sourceSemanticId);
    if (binding) {
      const edge = edgeRoutes.find((candidate) => candidate.from === `major-${binding.one + 1}` && candidate.to === `major-${binding.two + 1}` || candidate.from === `major-${binding.two + 1}` && candidate.to === `major-${binding.one + 1}`);
      if (edge) return [{ id: `protected-semantic-route-${semanticIndex + 1}`, semanticId: semantic.sourceSemanticId, name: `Protected ${semantic.objectKind.replaceAll("_", " ")}`, kind: "NARRATIVE_PATH", tileIndices: [...edge.tileIndices], attributes: { nativeProtectedSemantic: true, sourceSemanticId: semantic.sourceSemanticId, objectKind: semantic.objectKind, policy: semantic.policy, strategicEdge: edge.id, relationshipKind: edge.kind } }];
    }
    const anchor = { x: semantic.anchorIndex % width, y: Math.floor(semantic.anchorIndex / width) };
    const owner = anchors.reduce((best, candidate, index) => {
      const separation = hexDistance(candidate, anchor, width, wraps);
      return separation < best.separation ? { index, separation } : best;
    }, { index: 0, separation: Number.POSITIVE_INFINITY }).index;
    const region = strategicObjects.find((object) => object.id === `safe-region-${owner + 1}`);
    if (!region) return [];
    return [{ id: `protected-semantic-region-${semanticIndex + 1}`, semanticId: semantic.sourceSemanticId, name: `Protected ${semantic.objectKind.replaceAll("_", " ")}`, kind: "NARRATIVE_REGION", tileIndices: [...region.tileIndices], attributes: { nativeProtectedSemantic: true, sourceSemanticId: semantic.sourceSemanticId, objectKind: semantic.objectKind, policy: semantic.policy, strategicRegion: region.id } }];
  });
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
    narrativeTopologyInfluences: narrative?.evidence.diagnostics.topologyInfluences ?? 0,
    narrativeReliefInfluences: narrative?.evidence.diagnostics.reliefInfluences ?? 0,
    narrativeClimateInfluences: narrative?.evidence.diagnostics.climateInfluences ?? 0,
    nativeStrategicRegions: strategicPlan?.regions.length ?? 0,
    nativeStrategicPaths: strategicPlan?.paths.length ?? 0,
    nativeStrategicBoundObjects: nativeStrategicObjects.length,
    nativeProtectedSemanticObjects: protectedSemanticObjects.length,
    nativeProtectedSemanticRoutes: protectedSemanticRoutes.length,
    ...nativeConstraintDiagnostics(constraints),
    ...metrics,
  };
  const structure: GenerationStructure = {
    engine: "POLIS",
    objects: [...strategicObjects, ...continents, ...basins, ...nativeStrategicObjects, ...protectedSemanticObjects],
    mountainRanges: [],
    riverSystems: [],
    diagnostics,
    narrativeAdapter: narrative?.evidence,
    strategicGraph: {
      version: 2,
      mapType: options.preset,
      pattern: options.polisConflictPattern,
      symmetry: options.polisSymmetry,
      nodes: strategicNodes,
      edges: edgeRoutes,
      protectedTileIndices: protectedArray,
      startSafetyTileIndices: [...startSafetyTiles],
      homeCapacityTileIndices: [...safeTiles].filter((index) => landMask[index] && !startSafetyTiles.has(index)),
      routeTileIndices: [...new Set(edgeRoutes.flatMap((edge) => edge.tileIndices))].filter((index) => !startSafetyTiles.has(index) && !safeTiles.has(index)),
      barrierTileIndices: [...barrierTiles],
      objectiveTileIndices: [...objectiveTileIndices],
      relaxations: [...relaxations, ...(landCount > desiredLand ? ["Protected strategic routes exceeded the requested land budget."] : [])],
      metrics,
      matchIntent: { humanPlayers: intent.humanPlayers, aiPlayers: intent.aiPlayers, flexiblePlayers: intent.flexiblePlayers, teamIntent: intent.teamIntent, competitiveStrictness: intent.competitiveStrictness, aiAccommodation: intent.aiAccommodation, enabledVictories: [...intent.enabledVictories], emphasizedVictories: [...intent.emphasizedVictories] },
      realmRoles: [...roleGroups.values()],
      victoryFeasibility: feasibility,
    },
  };
  return { landMask, reliefValues, moistures, elevations, tiles, structure, startLocations: [...majorStarts, ...cityStates], diagnostics };
}
