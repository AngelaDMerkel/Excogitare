import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import type { WorldArchetype } from "./generation-recipe.ts";

export type ArchetypeProfile = {
  id: Exclude<WorldArchetype, "EXISTING" | "NARRATIVE_DEFAULT">;
  label: string;
  terrainWeights: ReadonlyArray<readonly [terrain: 2 | 3 | 4 | 5 | 6, weight: number]>;
  features: ReadonlyArray<readonly [feature: 0 | 1 | 2 | 4 | 5 | 255, chance: number]>;
};

export const ARCHETYPE_PROFILES: Record<ArchetypeProfile["id"], ArchetypeProfile> = {
  TEMPERATE: { id: "TEMPERATE", label: "Temperate", terrainWeights: [[2, 0.58], [3, 0.42]], features: [[0, 0.28], [255, 1]] },
  JUNGLE: { id: "JUNGLE", label: "Jungle", terrainWeights: [[2, 0.76], [3, 0.24]], features: [[1, 0.62], [2, 0.1], [0, 0.12], [255, 1]] },
  SUNSCOURGED: { id: "SUNSCOURGED", label: "Sunscourged", terrainWeights: [[4, 0.74], [3, 0.26]], features: [[4, 0.045], [255, 1]] },
  WORLDFROST: { id: "WORLDFROST", label: "Worldfrost", terrainWeights: [[6, 0.58], [5, 0.34], [3, 0.08]], features: [[0, 0.07], [255, 1]] },
  MONSOON: { id: "MONSOON", label: "Monsoon", terrainWeights: [[2, 0.68], [3, 0.32]], features: [[1, 0.36], [2, 0.25], [0, 0.12], [255, 1]] },
  MEDITERRANEAN: { id: "MEDITERRANEAN", label: "Mediterranean", terrainWeights: [[3, 0.52], [2, 0.34], [4, 0.14]], features: [[0, 0.18], [255, 1]] },
  STEPPE: { id: "STEPPE", label: "Steppe", terrainWeights: [[3, 0.72], [5, 0.18], [2, 0.1]], features: [[0, 0.08], [255, 1]] },
  SAVANNA: { id: "SAVANNA", label: "Savanna", terrainWeights: [[3, 0.66], [2, 0.2], [4, 0.14]], features: [[0, 0.12], [255, 1]] },
  MARSHLAND: { id: "MARSHLAND", label: "Marshland", terrainWeights: [[2, 0.72], [3, 0.28]], features: [[2, 0.48], [0, 0.16], [255, 1]] },
  VOLCANIC: { id: "VOLCANIC", label: "Volcanic", terrainWeights: [[3, 0.58], [4, 0.25], [2, 0.17]], features: [[0, 0.1], [255, 1]] },
  JURASSIC: { id: "JURASSIC", label: "Jurassic", terrainWeights: [[2, 0.82], [3, 0.18]], features: [[1, 0.54], [2, 0.2], [0, 0.15], [255, 1]] },
  POST_COLLAPSE: { id: "POST_COLLAPSE", label: "Post-Collapse", terrainWeights: [[3, 0.56], [2, 0.28], [4, 0.16]], features: [[5, 0.09], [0, 0.12], [255, 1]] },
  FALLOUT_WASTES: { id: "FALLOUT_WASTES", label: "Fallout Wastes", terrainWeights: [[4, 0.58], [3, 0.36], [2, 0.06]], features: [[5, 0.31], [255, 1]] },
};

function hashUnit(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function seedSalt(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

function weightedTerrain(profile: ArchetypeProfile, value: number) {
  let cursor = 0;
  for (const [terrain, weight] of profile.terrainWeights) {
    cursor += weight;
    if (value <= cursor) return terrain;
  }
  return profile.terrainWeights.at(-1)![0];
}

function surfaceFeature(profile: ArchetypeProfile, value: number) {
  for (const [feature, chance] of profile.features) if (value <= chance) return feature;
  return 255;
}

export function applyWorldArchetype(map: Civ5Map, archetype: WorldArchetype): Civ5Map {
  if (archetype === "EXISTING" || archetype === "NARRATIVE_DEFAULT") return map;
  const profile = ARCHETYPE_PROFILES[archetype];
  const salt = seedSalt(map.recipe?.settings.seed ?? map.generation?.seed ?? map.name);
  const tiles = map.tiles.map((source, index): Civ5Tile => {
    if (source.terrain < 2) return { ...source };
    const terrain = weightedTerrain(profile, hashUnit(index, salt));
    const feature = source.elevation === 2 ? 255 : surfaceFeature(profile, hashUnit(index, salt ^ 0x9e3779b9));
    return { ...source, terrain, feature };
  });
  return { ...map, tiles };
}
