import type { Civ5Map, Civ5StartLocation } from "./civ5-map.ts";

const POLITICAL_PALETTE = [
  "#b84f4f", "#557fbd", "#c28b42", "#6c9b58", "#835fa6", "#4d9b98",
  "#b7648b", "#7e7350", "#5f82a0", "#9b694d", "#657a4a", "#9a5b59",
  "#527b6f", "#75639a", "#a7773e", "#68758e", "#a85e77", "#5f8d55",
] as const;

function neighbors(index: number, map: Civ5Map) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nx = x + dx;
    const ny = y + dy;
    if (map.wraps) nx = (nx + map.width) % map.width;
    return nx >= 0 && nx < map.width && ny >= 0 && ny < map.height ? [ny * map.width + nx] : [];
  });
}

function isWater(map: Civ5Map, index: number) {
  const terrain = map.terrains[map.tiles[index].terrain] ?? "";
  return terrain.includes("OCEAN") || terrain.includes("COAST");
}

function mix(hex: string, target: string, amount: number) {
  const read = (value: string, shift: number) => (Number.parseInt(value.slice(1), 16) >> shift) & 0xff;
  const channel = (one: number, two: number) => Math.round(one + (two - one) * amount).toString(16).padStart(2, "0");
  return `#${channel(read(hex, 16), read(target, 16))}${channel(read(hex, 8), read(target, 8))}${channel(read(hex, 0), read(target, 0))}`;
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result;
}

export function politicalStartForOwner(map: Civ5Map, owner: number) {
  if (owner >= 32) return map.startLocations.filter((start) => start.cityState)[owner - 32];
  return map.startLocations.find((start) => !start.cityState && start.player === owner);
}

function virtualOwner(map: Civ5Map, start: Civ5StartLocation) {
  if (!start.cityState) return start.player;
  return 32 + map.startLocations.filter((candidate) => candidate.cityState).indexOf(start);
}

export function hasPoliticalLayer(map: Civ5Map) {
  return map.tiles.some((tile) => tile.owner !== undefined) || (map.source !== "file" && map.startLocations.length > 0);
}

export function buildPoliticalOwnership(map: Civ5Map) {
  const owners = new Int16Array(map.tiles.length);
  owners.fill(-1);
  const scenarioOwnership = map.tiles.some((tile) => tile.owner !== undefined);
  if (scenarioOwnership) {
    for (let index = 0; index < map.tiles.length; index += 1) owners[index] = map.tiles[index].owner ?? -1;
    return owners;
  }
  if (map.source === "file") return owners;

  const distances = new Int16Array(map.tiles.length);
  distances.fill(32767);
  for (const start of map.startLocations) {
    const origin = start.y * map.width + start.x;
    if (origin < 0 || origin >= map.tiles.length || isWater(map, origin)) continue;
    const owner = virtualOwner(map, start);
    const radius = start.cityState ? 3 : 6;
    const queue: Array<[number, number]> = [[origin, 0]];
    const visited = new Set<number>([origin]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [index, distance] = queue[cursor];
      if (distance < distances[index] || (distance === distances[index] && owner < owners[index])) {
        distances[index] = distance;
        owners[index] = owner;
      }
      if (distance >= radius) continue;
      for (const next of neighbors(index, map)) {
        if (visited.has(next) || isWater(map, next)) continue;
        visited.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }
  return owners;
}

export function politicalColors(map: Civ5Map, owner: number) {
  const start = politicalStartForOwner(map, owner);
  const identity = start?.teamColor || start?.civilization || `OWNER_${owner}`;
  const base = POLITICAL_PALETTE[hash(identity) % POLITICAL_PALETTE.length];
  const cityState = owner >= 32 || Boolean(start?.cityState);
  return {
    fill: cityState ? mix(base, "#ffffff", 0.26) : mix(base, "#ffffff", 0.14),
    border: cityState ? mix(base, "#151d20", 0.22) : mix(base, "#151d20", 0.36),
    city: cityState ? mix(base, "#151d20", 0.32) : mix(base, "#ffffff", 0.34),
    label: start?.civilization?.replace(/^CIVILIZATION_/, "").replaceAll("_", " ") || (cityState ? `City state ${owner - 31}` : `Player ${owner + 1}`),
  };
}
