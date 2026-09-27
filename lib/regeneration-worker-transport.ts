import type { Civ5Map } from "./civ5-map.ts";
import type { RegenerationStage } from "./map-design.ts";
import { markGenerationStructureStale } from "./generation-structure.ts";
import { cloneGenerationRecipe, type GenerationRecipe } from "./generation-recipe.ts";

/**
 * Start balancing only reads the tile grid, existing cities and map geometry.
 * Retained compiler evidence can be considerably larger than those inputs and
 * must not make an unnecessary round trip through the browser worker.
 */
export function mapForRegenerationWorker(map: Civ5Map, stage: RegenerationStage): Civ5Map {
  if (stage !== "STARTS") return map;
  return { ...map, recipe: undefined, structure: undefined };
}

/**
 * A STARTS response is a selective result, not a new authoritative map. Merge
 * its authored changes into the original so metadata and retained structures
 * survive only after the worker has completed successfully.
 */
export function mergeRegenerationWorkerResult(source: Civ5Map, result: Civ5Map, stage: RegenerationStage, requestedRecipe?: GenerationRecipe): Civ5Map {
  if (stage !== "STARTS") return result;
  return {
    ...source,
    tiles: result.tiles.map((tile) => ({ ...tile })),
    players: result.players,
    startLocations: result.startLocations.map((start) => ({ ...start })),
    cities: result.cities?.map((city) => ({ ...city })) ?? source.cities?.map((city) => ({ ...city })),
    generation: result.generation ? { ...result.generation, dominantTerrains: [...result.generation.dominantTerrains] } : source.generation ? { ...source.generation, dominantTerrains: [...source.generation.dominantTerrains] } : undefined,
    // The worker intentionally receives no retained recipe or structure for a
    // STARTS-only pass. Its locally reconstructed recipe therefore cannot be
    // authoritative: it lacks Scale, Archetype, effort and Match Intent. Keep
    // the complete requested recipe (or the installed source recipe) instead.
    recipe: cloneGenerationRecipe(requestedRecipe ?? source.recipe ?? result.recipe),
    structure: markGenerationStructureStale(source.structure, "Start locations were rebalanced.", ["STARTS"]),
  };
}
