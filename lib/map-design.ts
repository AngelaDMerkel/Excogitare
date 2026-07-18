import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import { cloneGenerationStructure, markGenerationStructureStale } from "./generation-structure.ts";
import { cloneGenerationRecipe, generationRecipeFromOptions, type GenerationRecipe } from "./generation-recipe.ts";
import { applyArchetypeContentEcology, applyWorldArchetype } from "./world-archetype.ts";
import { analyzeMultiplayerBalance, validateCiv5Map, type BalanceReport } from "./map-analysis.ts";
import {
  balanceMapStarts,
  enforceGeneratedPlacementLegality,
  generateMap,
  generateMapFromRecipe,
  regenerateMapContent,
  regenerateMapRivers,
  type DominantTerrain,
  type MapGenerationOptions,
} from "./map-generator.ts";

export type RegenerationStage = "WORLD" | "CLIMATE" | "RIVERS" | "CONTENT" | "STARTS";
export type StructureOperation = "RAISE_PLATE" | "CARVE_BASIN" | "RIDGE" | "CLIMATE" | "WATERSHED";
export type MapRegion = { minX: number; minY: number; maxX: number; maxY: number };

export type BatchCandidate = {
  id: number;
  seed: string;
  map: Civ5Map;
  score: number;
  balance: BalanceReport;
  errors: number;
  warnings: number;
};

export type MapCheckpoint = {
  id: number;
  name: string;
  createdAt: number;
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

export function createMapCheckpoint(map: Civ5Map, name: string, id: number, createdAt = Date.now()): MapCheckpoint {
  return { id, name: name.trim() || `Checkpoint ${id}`, createdAt, map: snapshotMap(map) };
}

export function restoreMapCheckpoint(checkpoint: MapCheckpoint) {
  return snapshotMap(checkpoint.map);
}

function sameTile(one: Civ5Tile, two: Civ5Tile) {
  return one.terrain === two.terrain
    && one.elevation === two.elevation
    && one.feature === two.feature
    && one.resource === two.resource
    && one.resourceAmount === two.resourceAmount
    && one.wonder === two.wonder
    && one.river === two.river
    && one.continent === two.continent
    && one.improvement === two.improvement
    && one.route === two.route
    && one.owner === two.owner;
}

export function compareMaps(current: Civ5Map, baseline: Civ5Map) {
  const dimensionsMatch = current.width === baseline.width && current.height === baseline.height;
  const changedTiles = new Set<number>();
  if (dimensionsMatch) {
    for (let index = 0; index < current.tiles.length; index += 1) {
      if (!sameTile(current.tiles[index], baseline.tiles[index])) changedTiles.add(index);
    }
  }
  const currentStarts = new Map(current.startLocations.map((start) => [start.player, `${start.x},${start.y},${start.team}`]));
  const changedStarts = baseline.startLocations.filter((start) => currentStarts.get(start.player) !== `${start.x},${start.y},${start.team}`).length
    + current.startLocations.filter((start) => !baseline.startLocations.some((other) => other.player === start.player)).length;
  return { dimensionsMatch, changedTiles, changedStarts };
}

export function scoreBatchCandidate(map: Civ5Map, seed: string, id: number): BatchCandidate {
  const balance = analyzeMultiplayerBalance(map);
  const issues = validateCiv5Map(map);
  const errors = issues.filter((issue) => issue.severity === "ERROR").length;
  const warnings = issues.filter((issue) => issue.severity === "WARNING").length;
  const lowGradeStarts = balance.players.filter((player) => player.grade === "D").length;
  const score = Math.max(0, Math.round(100 - balance.spread * 1.45 - errors * 24 - warnings * 3 - lowGradeStarts * 4));
  return { id, seed, map: snapshotMap(map), score, balance, errors, warnings };
}

export function generateBatchCandidate(options: MapGenerationOptions, index: number) {
  const seed = `${options.seed}-${String(index + 1).padStart(2, "0")}`;
  return scoreBatchCandidate(generateMap({ ...options, seed }), seed, index + 1);
}

export function regenerateMapStage(map: Civ5Map, options: MapGenerationOptions, stage: RegenerationStage, variation: number, recipe?: GenerationRecipe) {
  const passOptions = { ...options, seed: `${options.seed}:${stage.toLowerCase()}:${variation}` };
  const passRecipe = recipe ? { ...cloneGenerationRecipe(recipe)!, effort: "STANDARD" as const, settings: { ...recipe.settings, seed: passOptions.seed } } : undefined;
  if (stage === "WORLD") return passRecipe ? generateMapFromRecipe(passRecipe) : generateMap(passOptions);
  if (stage === "RIVERS") return regenerateMapRivers(map, passOptions, variation);
  if (stage === "CONTENT") return regenerateMapContent(map, passOptions, variation);
  if (stage === "STARTS") return balanceMapStarts(map, passOptions);

  const climate = passRecipe ? generateMapFromRecipe({ ...passRecipe, archetype: "NARRATIVE_DEFAULT", archetypeIntensity: "STRONG" }) : generateMap(passOptions);
  const tiles = map.tiles.map((tile, index) => {
    if (tile.terrain < 2) return { ...tile };
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const sourceX = Math.min(climate.width - 1, Math.floor(x / Math.max(1, map.width) * climate.width));
    const sourceY = Math.min(climate.height - 1, Math.floor(y / Math.max(1, map.height) * climate.height));
    const source = climate.tiles[sourceY * climate.width + sourceX];
    return { ...tile, terrain: source.terrain >= 2 ? source.terrain : 2, feature: source.terrain >= 2 ? source.feature : 255 };
  });
  return enforceGeneratedPlacementLegality({ ...map, tiles, generation: { ...passOptions, dominantTerrains: [...passOptions.dominantTerrains] }, recipe: generationRecipeFromOptions(passOptions), structure: markGenerationStructureStale(map.structure, "Climate was selectively regenerated.", ["CLIMATE"]) });
}

export function buildArchetypeRefinementCandidate(map: Civ5Map, options: MapGenerationOptions, recipe: GenerationRecipe, variation: number) {
  if (recipe.archetype === "EXISTING") return { ...snapshotMap(map), recipe: cloneGenerationRecipe(recipe) };
  const regenerated = regenerateMapStage(map, options, "CLIMATE", variation, recipe);
  const coated = enforceGeneratedPlacementLegality(applyWorldArchetype(regenerated, recipe.archetype, recipe.archetypeIntensity ?? "STRONG"));
  if (recipe.archetypeIntensity !== "TRANSFORMATIVE") return { ...coated, recipe: cloneGenerationRecipe(recipe) };
  const content = applyArchetypeContentEcology(regenerateMapContent(coated, options, variation), recipe.archetype);
  const tiles = content.tiles.map((tile, index) => ({
    ...tile,
    improvement: coated.tiles[index].improvement,
    route: coated.tiles[index].route,
    owner: coated.tiles[index].owner,
  }));
  return enforceGeneratedPlacementLegality({
    ...content,
    tiles,
    cities: coated.cities?.map((city) => ({ ...city })),
    startLocations: coated.startLocations.map((start) => ({ ...start })),
    recipe: cloneGenerationRecipe(recipe),
  });
}

function regionContains(region: MapRegion, x: number, y: number) {
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY;
}

function clearContent(tile: Civ5Tile) {
  tile.feature = 255;
  tile.resource = 255;
  tile.resourceAmount = 0;
  tile.wonder = 255;
  tile.improvement = undefined;
  tile.route = undefined;
  tile.river = 0;
}

const dominantTerrainIndex: Record<DominantTerrain, number> = { GRASSLAND: 2, PLAINS: 3, DESERT: 4, TUNDRA: 5 };

export function applyStructureOperation(
  map: Civ5Map,
  region: MapRegion,
  operation: StructureOperation,
  strength: 1 | 2 | 3,
  options: MapGenerationOptions,
  variation: number,
) {
  if (operation === "WATERSHED") {
    const drainage = regenerateMapRivers(map, options, variation);
    const tiles = map.tiles.map((tile, index) => {
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      return regionContains(region, x, y) ? { ...tile, river: drainage.tiles[index].river } : { ...tile };
    });
    return { ...map, tiles, structure: markGenerationStructureStale(map.structure, "A selected watershed was regenerated.", ["HYDROLOGY"]) };
  }

  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const width = Math.max(1, region.maxX - region.minX + 1);
  const height = Math.max(1, region.maxY - region.minY + 1);
  const horizontal = width >= height;
  const climateTerrain = dominantTerrainIndex[options.dominantTerrains[0] ?? "GRASSLAND"];
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const tile = tiles[y * map.width + x];
      const edgeDistance = Math.min(x - region.minX, region.maxX - x, y - region.minY, region.maxY - y);
      const axisDistance = horizontal ? Math.abs(y - (region.minY + region.maxY) / 2) : Math.abs(x - (region.minX + region.maxX) / 2);
      if (operation === "RAISE_PLATE") {
        if (tile.terrain < 2) {
          tile.terrain = climateTerrain;
          clearContent(tile);
        }
        if (edgeDistance >= 1 && strength >= 2) tile.elevation = Math.max(tile.elevation, 1);
        if (strength === 3 && edgeDistance >= 2 && (x + y) % 4 !== 0) tile.elevation = 2;
      } else if (operation === "CARVE_BASIN") {
        if (edgeDistance >= Math.max(0, 3 - strength)) {
          tile.terrain = edgeDistance > strength ? 0 : 1;
          tile.elevation = 0;
          clearContent(tile);
        }
      } else if (operation === "RIDGE") {
        if (tile.terrain >= 2 && axisDistance <= strength - 0.35) {
          tile.elevation = (horizontal ? x : y) % 6 === 0 ? 1 : 2;
          tile.feature = 255;
          tile.resource = 255;
          tile.resourceAmount = 0;
        } else if (tile.terrain >= 2 && axisDistance <= strength + 0.75) tile.elevation = Math.max(tile.elevation, 1);
      } else if (operation === "CLIMATE" && tile.terrain >= 2) {
        tile.terrain = climateTerrain;
        tile.feature = climateTerrain === 4 ? 255 : options.rainfall === "WET" ? (climateTerrain === 2 ? 1 : 0) : tile.feature;
      }
    }
  }
  const changedPass = operation === "CLIMATE" ? "CLIMATE" : operation === "RIDGE" ? "RELIEF" : "TOPOLOGY";
  return enforceGeneratedPlacementLegality({ ...map, tiles, structure: markGenerationStructureStale(map.structure, "The retained world structure was edited.", [changedPass]) });
}
