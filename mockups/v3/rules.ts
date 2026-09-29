// Prototype adapter over the existing parser and placement rules. No generator.
import { parseCiv5Map, serializeCiv5Map, updateCiv5Map, inspectCiv5MapStructure, type Civ5Map, type Civ5Tile } from '../../lib/civ5-map.ts';
import { featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict, isWaterTerrain } from '../../lib/civ5-rules.ts';

export { parseCiv5Map as parse, isWaterTerrain };
export function inspect(map: Civ5Map) {
  const issues: Array<{ id: string; index: number; title: string; detail: string; action: string; changes: Partial<Civ5Tile> }> = [];
  map.tiles.forEach((tile, index) => {
    if (isWaterTerrain(map, tile) && tile.elevation !== 0) issues.push({ id: `relief-${index}`, index, title: 'Raised water tile', detail: 'Water tiles cannot have hills or mountains.', action: 'Flatten this water tile; keep its coast or ocean terrain.', changes: { elevation: 0 } });
    for (const [channel, check] of [['feature', featurePlacementVerdict], ['resource', resourcePlacementVerdict], ['wonder', wonderPlacementVerdict]] as const) {
      const verdict = check(map, tile);
      if (!verdict.valid) issues.push({ id: `${channel}-${index}`, index, title: channel === 'feature' ? 'Misplaced vegetation or feature' : channel === 'resource' ? 'Misplaced resource' : 'Misplaced natural wonder', detail: verdict.reason ?? 'This placement is not supported.', action: `Remove the incompatible ${channel === 'feature' ? 'feature' : channel} from this tile.`, changes: channel === 'resource' ? { resource: 255, resourceAmount: 0 } : { [channel]: 255 } });
    }
  });
  return issues;
}
export function repair(map: Civ5Map, ids: string[]) {
  const result = structuredClone(map), selected = new Set(ids);
  for (const issue of inspect(map)) if (selected.has(issue.id)) Object.assign(result.tiles[issue.index], issue.changes);
  return result;
}

export function save(map: Civ5Map, originalBytes?: ArrayBuffer) {
  const issues = inspect(map);
  if (issues.length) throw new Error('Correct tile-placement issues before saving this map.');
  const bytes = originalBytes ? updateCiv5Map(originalBytes, map) : serializeCiv5Map(map);
  const errors = inspectCiv5MapStructure(bytes).filter(issue => issue.severity === 'ERROR');
  if (errors.length) throw new Error(errors[0].message);
  const parsed = parseCiv5Map(bytes, map.name);
  for (let i = 0; i < map.tiles.length; i++) for (const key of ['terrain', 'elevation', 'feature', 'resource', 'resourceAmount', 'river', 'wonder', 'continent'] as const) {
    if (parsed.tiles[i]?.[key] !== map.tiles[i][key]) throw new Error(`Save verification failed at tile ${i}.`);
  }
  return bytes;
}
