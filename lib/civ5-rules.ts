import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";

export type PlacementVerdict = { valid: boolean; reason?: string };

function typeName(values: string[], index: number) {
  return index === 255 ? "" : values[index] ?? "";
}

export function isWaterTerrain(map: Civ5Map, tile: Civ5Tile) {
  const terrain = typeName(map.terrains, tile.terrain);
  if (terrain) return terrain.includes("OCEAN") || terrain.includes("COAST");
  return tile.terrain < 2;
}

export function isPassableLand(map: Civ5Map, tile: Civ5Tile) {
  return !isWaterTerrain(map, tile) && tile.elevation !== 2;
}

export function resourcePlacementVerdict(map: Civ5Map, tile: Civ5Tile): PlacementVerdict {
  if (tile.resource === 255) return { valid: true };
  const resource = typeName(map.resources, tile.resource);
  if (!resource) return { valid: false, reason: "The resource definition is missing." };
  if (tile.elevation === 2) return { valid: false, reason: `${resource.replace("RESOURCE_", "")} cannot occupy a mountain.` };
  const water = isWaterTerrain(map, tile);
  const waterOnly = ["FISH", "WHALE", "PEARLS", "CRAB"].some((name) => resource.includes(name));
  const oil = resource.includes("OIL");
  if (waterOnly && !water) return { valid: false, reason: `${resource.replace("RESOURCE_", "")} requires water.` };
  if (!waterOnly && !oil && water) return { valid: false, reason: `${resource.replace("RESOURCE_", "")} requires land.` };
  return { valid: true };
}

export function featurePlacementVerdict(map: Civ5Map, tile: Civ5Tile): PlacementVerdict {
  if (tile.feature === 255) return { valid: true };
  const feature = typeName(map.features, tile.feature);
  if (!feature) return { valid: false, reason: "The feature definition is missing." };
  const terrain = typeName(map.terrains, tile.terrain);
  const water = isWaterTerrain(map, tile);
  if (feature.includes("ICE") && !water) return { valid: false, reason: "Ice requires a water tile." };
  if (feature.includes("OASIS") && (!terrain.includes("DESERT") || tile.elevation !== 0)) return { valid: false, reason: "An oasis requires flat desert." };
  if (feature.includes("JUNGLE") && (water || terrain.includes("DESERT") || terrain.includes("TUNDRA") || terrain.includes("SNOW") || tile.elevation === 2)) return { valid: false, reason: "Jungle requires passable warm land." };
  if (feature.includes("FOREST") && (water || terrain.includes("DESERT") || terrain.includes("SNOW") || tile.elevation === 2)) return { valid: false, reason: "Forest requires passable non-desert land." };
  if (feature.includes("MARSH") && (water || tile.elevation !== 0 || (!terrain.includes("GRASS") && !terrain.includes("PLAINS")))) return { valid: false, reason: "Marsh requires flat grassland or plains." };
  if (!feature.includes("ICE") && water) return { valid: false, reason: `${feature.replace("FEATURE_", "")} cannot occupy water.` };
  return { valid: true };
}

export function wonderPlacementVerdict(map: Civ5Map, tile: Civ5Tile): PlacementVerdict {
  if (tile.wonder === 255) return { valid: true };
  const wonder = typeName(map.wonders, tile.wonder);
  if (!wonder) return { valid: false, reason: "The natural-wonder definition is missing." };
  const waterWonder = ["KRAKATOA", "BARRIER_REEF"].some((name) => wonder.includes(name));
  if (waterWonder !== isWaterTerrain(map, tile)) return { valid: false, reason: waterWonder ? `${wonder.replace("FEATURE_", "")} requires water.` : `${wonder.replace("FEATURE_", "")} requires land.` };
  if (!waterWonder && tile.elevation === 2 && !wonder.includes("GIBRALTAR")) return { valid: false, reason: `${wonder.replace("FEATURE_", "")} cannot occupy a mountain.` };
  return { valid: true };
}

export function adjacentCoordinates(x: number, y: number, width: number, height: number, wraps: boolean) {
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nx = x + dx;
    const ny = y + dy;
    if (wraps) nx = (nx + width) % width;
    return nx >= 0 && nx < width && ny >= 0 && ny < height ? [[nx, ny] as [number, number]] : [];
  });
}

export function nearestValidTile(map: Civ5Map, origin: number, predicate: (tile: Civ5Tile, index: number) => boolean, reserved = new Set<number>()) {
  const startX = origin % map.width;
  const startY = Math.floor(origin / map.width);
  const queue: Array<[number, number]> = [[startX, startY]];
  const seen = new Set([`${startX},${startY}`]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    const index = y * map.width + x;
    if (index !== origin && !reserved.has(index) && predicate(map.tiles[index], index)) return index;
    if (queue.length > 800) break;
    for (const [nx, ny] of adjacentCoordinates(x, y, map.width, map.height, map.wraps)) {
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return null;
}
