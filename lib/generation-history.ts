import type { Civ5Map } from "./civ5-map.ts";
import { cloneGenerationStructure } from "./generation-structure.ts";
import { cloneGenerationRecipe } from "./generation-recipe.ts";

export const MAX_GENERATION_HISTORY = 30;

export type GenerationHistoryOperation = "GENERATE" | "RANDOMISE" | "SELECTIVE_WORLD" | "SELECTIVE_CLIMATE" | "SELECTIVE_RIVERS" | "SELECTIVE_CONTENT" | "SELECTIVE_STARTS" | "BATCH_SELECTION" | "PROJECT_IMPORT";

export type GenerationHistoryEntry = {
  id: number;
  parentId?: number;
  operation: GenerationHistoryOperation;
  createdAt: string;
  map: Civ5Map;
};

function snapshotMap(map: Civ5Map): Civ5Map {
  return {
    ...map,
    tiles: map.tiles.map((tile) => ({ ...tile })),
    startLocations: map.startLocations.map((start) => ({ ...start })),
    cities: map.cities?.map((city) => ({ ...city })),
    generation: map.generation ? { ...map.generation, dominantTerrains: [...map.generation.dominantTerrains] } : undefined,
    recipe: cloneGenerationRecipe(map.recipe),
    structure: cloneGenerationStructure(map.structure),
  };
}

export function addGenerationToHistory(history: GenerationHistoryEntry[], map: Civ5Map, id: number, metadata: { parentId?: number; operation?: GenerationHistoryOperation; createdAt?: string } = {}) {
  return [{ id, parentId: metadata.parentId, operation: metadata.operation ?? "GENERATE", createdAt: metadata.createdAt ?? new Date().toISOString(), map: snapshotMap(map) }, ...history].slice(0, MAX_GENERATION_HISTORY);
}

export function restoreGeneration(entry: GenerationHistoryEntry) {
  return snapshotMap(entry.map);
}
