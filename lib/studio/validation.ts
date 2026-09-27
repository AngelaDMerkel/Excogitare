import { featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict } from "../civ5-rules.ts";
import { reconstructCiv5RiverEdgeSystems } from "../rivers.ts";
import type { World } from "./model.ts";
export function validateWorld(world: World) {
  const issues: string[] = [];
  for (const [i, tile] of world.map.tiles.entries()) {
    if (!world.map.terrains[tile.terrain]) issues.push(`Tile ${i}: unknown terrain index.`);
    if (![0, 1, 2].includes(tile.elevation)) issues.push(`Tile ${i}: invalid relief.`);
    for (const verdict of [resourcePlacementVerdict(world.map, tile), featurePlacementVerdict(world.map, tile), wonderPlacementVerdict(world.map, tile)]) if (!verdict.valid) issues.push(`Tile ${i}: ${verdict.reason}`);
    if (tile.river & ~63) issues.push(`Tile ${i}: invalid river flags.`);
  }
  return issues;
}
export function validateDevelopedRivers(world: World) {
  return reconstructCiv5RiverEdgeSystems(world.map).filter(system => !system.directedToOutlet).map(system => `A changed river system near tile ${system.tileIndices[0]} has no valid directed outlet.`);
}
