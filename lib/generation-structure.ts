import type { Civ5Map } from "./civ5-map.ts";

export type GeographicObjectKind = "SUBREGION" | "POLYGON" | "SUPERPOLYGON" | "CONTINENT" | "OCEAN_BASIN" | "INLAND_SEA" | "LAKE" | "RIFT" | "CLIMATE_REGION" | "TECTONIC_PLATE";

export type GeographicObject = {
  id: string;
  name: string;
  kind: GeographicObjectKind;
  tileIndices: number[];
  neighbors?: string[];
  attributes?: Record<string, string | number | boolean>;
};

export type LinearGeography = {
  id: string;
  name: string;
  tileIndices: number[];
  source?: number;
  outlet?: number;
};

export type GenerationStructure = {
  engine: "EXCOGITARE" | "REGION_GRAPH" | "PHYSICAL";
  objects: GeographicObject[];
  mountainRanges: LinearGeography[];
  riverSystems: LinearGeography[];
  diagnostics: Record<string, number>;
};

function neighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width;
  const y = Math.floor(index / width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    return nextX >= 0 && nextX < width && nextY >= 0 && nextY < height ? [nextY * width + nextX] : [];
  });
}

export function objectsFromAssignments(kind: GeographicObjectKind, assignments: ArrayLike<number>, count: number, prefix: string) {
  const tiles = Array.from({ length: count }, () => [] as number[]);
  for (let index = 0; index < assignments.length; index += 1) {
    const owner = assignments[index];
    if (owner >= 0 && owner < count) tiles[owner].push(index);
  }
  return tiles.flatMap((tileIndices, index) => tileIndices.length ? [{ id: `${kind.toLowerCase()}-${index + 1}`, name: `${prefix} ${index + 1}`, kind, tileIndices }] : []);
}

export function connectedTileObjects(kind: GeographicObjectKind, mask: boolean[], width: number, height: number, wraps: boolean, prefix: string) {
  const assigned = new Set<number>();
  const result: GeographicObject[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || assigned.has(origin)) continue;
    const tileIndices = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < tileIndices.length; cursor += 1) {
      for (const next of neighbors(tileIndices[cursor], width, height, wraps)) {
        if (!mask[next] || assigned.has(next)) continue;
        assigned.add(next);
        tileIndices.push(next);
      }
    }
    const number = result.length + 1;
    result.push({ id: `${kind.toLowerCase()}-${number}`, name: `${prefix} ${number}`, kind, tileIndices });
  }
  return result;
}

export function connectedLinearFeatures(mask: boolean[], width: number, height: number, wraps: boolean, prefix: string): LinearGeography[] {
  const assigned = new Set<number>();
  const result: LinearGeography[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || assigned.has(origin)) continue;
    const tileIndices = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < tileIndices.length; cursor += 1) {
      for (const next of neighbors(tileIndices[cursor], width, height, wraps)) {
        if (!mask[next] || assigned.has(next)) continue;
        assigned.add(next);
        tileIndices.push(next);
      }
    }
    if (tileIndices.length < 2) continue;
    const number = result.length + 1;
    result.push({ id: `${prefix.toLowerCase().replaceAll(" ", "-")}-${number}`, name: `${prefix} ${number}`, tileIndices });
  }
  return result;
}

export function attachRiverSystems(map: Civ5Map, structure: GenerationStructure) {
  const riverTiles = map.tiles.map((tile) => tile.river > 0);
  const systems = connectedLinearFeatures(riverTiles, map.width, map.height, map.wraps, "River System");
  for (const system of systems) {
    system.source = system.tileIndices.reduce((best, index) => map.tiles[index].elevation > map.tiles[best].elevation ? index : best, system.tileIndices[0]);
    system.outlet = system.tileIndices.find((index) => neighbors(index, map.width, map.height, map.wraps).some((next) => map.tiles[next].terrain < 2));
  }
  return { ...structure, riverSystems: systems, diagnostics: { ...structure.diagnostics, riverSystems: systems.length } };
}

export function cloneGenerationStructure(structure: GenerationStructure | undefined) {
  if (!structure) return undefined;
  return {
    ...structure,
    objects: structure.objects.map((object) => ({ ...object, tileIndices: [...object.tileIndices], neighbors: object.neighbors ? [...object.neighbors] : undefined, attributes: object.attributes ? { ...object.attributes } : undefined })),
    mountainRanges: structure.mountainRanges.map((range) => ({ ...range, tileIndices: [...range.tileIndices] })),
    riverSystems: structure.riverSystems.map((river) => ({ ...river, tileIndices: [...river.tileIndices] })),
    diagnostics: { ...structure.diagnostics },
  } satisfies GenerationStructure;
}
