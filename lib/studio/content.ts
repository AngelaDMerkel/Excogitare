import type { Civ5Map } from "../civ5-map.ts";
import { isWaterTerrain, resourcePlacementVerdict, wonderPlacementVerdict } from "../civ5-rules.ts";
import { adjacency, region } from "./spatial.ts";
import { hash, random, type World } from "./model.ts";

const resourceGroup = (name: string) => /IRON|HORSE|COAL|OIL|ALUMINUM|URANIUM/.test(name) ? "strategics" : /WHEAT|COW|SHEEP|DEER|FISH|BANANA|STONE/.test(name) ? "resources" : "luxuries";
function suitability(world: World, index: number, resource: number) {
  const { map, fields } = world, tile = map.tiles[index], name = map.resources[resource], terrain = map.terrains[tile.terrain], feature = map.features[tile.feature] ?? "";
  if (!resourcePlacementVerdict(map, { ...tile, resource }).valid) return false;
  if (/WHEAT/.test(name) && !/PLAINS|DESERT/.test(terrain)) return false;
  if (/DEER|FUR/.test(name) && !/TUNDRA/.test(terrain) && !/FOREST/.test(feature)) return false;
  if (/BANANA|COCOA/.test(name) && !/JUNGLE/.test(feature)) return false;
  if (/SHEEP/.test(name) && tile.elevation !== 1) return false;
  if (/COW/.test(name) && fields.moisture[index] < .4) return false;
  return true;
}
export function updateContent(world: World, previous: World) {
  const { map, recipe } = world, graph = adjacency(map), locked = new Set(world.locked);
  // Move only displaced content. Never silently erase all resources during a local refinement.
  previous.map.tiles.forEach((old, i) => {
    if (old.resource === 255 || map.tiles[i].resource !== 255 || locked.has(i)) return;
    const choices = region(graph, [i], 5).filter(j => !locked.has(j) && map.tiles[j].resource === 255 && map.tiles[j].wonder === 255 && suitability(world, j, old.resource));
    choices.sort((a, b) => Math.abs(world.fields.moisture[a] - previous.fields.moisture[i]) - Math.abs(world.fields.moisture[b] - previous.fields.moisture[i]) || a - b);
    if (choices[0] !== undefined) { const tile = map.tiles[choices[0]]; tile.resource = old.resource; tile.resourceAmount = old.resourceAmount; }
    else world.messages.push(`A displaced ${map.resources[old.resource]?.replace("RESOURCE_", "").toLowerCase() ?? "resource"} near tile ${i} had no legal replacement within five hexes.`);
  });
  for (const group of ["resources", "luxuries", "strategics"] as const) {
    if (recipe[group] === previous.recipe[group]) continue;
    const present = map.tiles.flatMap((t, i) => t.resource !== 255 && resourceGroup(map.resources[t.resource] ?? "") === group ? [i] : []);
    const target = recipe[group] === 0 ? 0 : Math.round(Math.max(present.length, map.tiles.length * .025) * recipe[group] / Math.max(20, previous.recipe[group]));
    if (target < present.length) {
      const removable = present.filter(i => !locked.has(i)).sort((a, b) => hash(`${recipe.seed}:${group}:${a}`) - hash(`${recipe.seed}:${group}:${b}`));
      for (const i of removable.slice(0, present.length - target)) { map.tiles[i].resource = 255; map.tiles[i].resourceAmount = 0; }
    } else {
      let needed = target - present.length;
      const choices = map.tiles.flatMap((tile, i) => !locked.has(i) && tile.resource === 255 && tile.wonder === 255 ? [i] : []).sort((a, b) => hash(`${recipe.seed}:${group}:${a}`) - hash(`${recipe.seed}:${group}:${b}`));
      for (const i of choices) {
        if (!needed) break;
        const options = map.resources.flatMap((name, r) => name.startsWith("RESOURCE_") && resourceGroup(name) === group && suitability(world, i, r) ? [r] : []);
        if (!options.length) continue;
        const rng = random(`${recipe.seed}:deposit:${i}`), resource = options[Math.floor(rng() * options.length)];
        map.tiles[i].resource = resource; map.tiles[i].resourceAmount = group === "strategics" ? 2 + Math.floor(rng() * 4) : 1; needed--;
      }
      if (needed) world.messages.push(`${needed} requested ${group} placements could not fit the legal terrain.`);
    }
  }
  const present = map.tiles.flatMap((t, i) => t.wonder !== 255 ? [i] : []);
  if (recipe.wonders !== previous.recipe.wonders) {
    while (present.length > recipe.wonders) { const index = present.findLastIndex(i => !locked.has(i)); if (index < 0) break; map.tiles[present.splice(index, 1)[0]].wonder = 255; }
    const choices = map.tiles.flatMap((tile, i) => !locked.has(i) && tile.wonder === 255 ? [i] : []).sort((a, b) => hash(`${recipe.seed}:wonder:${a}`) - hash(`${recipe.seed}:wonder:${b}`));
    for (const i of choices) {
      if (present.length >= recipe.wonders) break;
      if (present.some(j => region(graph, [j], 4).includes(i))) continue;
      const allowed = map.wonders.flatMap((_, wonder) => wonderPlacementVerdict(map, { ...map.tiles[i], wonder }).valid ? [wonder] : []);
      if (allowed.length) { map.tiles[i].wonder = allowed[hash(`${recipe.seed}:${i}`) % allowed.length]; map.tiles[i].resource = 255; map.tiles[i].resourceAmount = 0; present.push(i); }
    }
    if (present.length !== recipe.wonders) world.messages.push(`Only ${present.length} wonders fit the requested placement and protection constraints.`);
  }
}
export function synchronizeAnalyticSites(map: Civ5Map, sites: number[]) {
  if (map.scenarioDataPresent && map.source === "file") return;
  // These records aid rendering only; geography-only serialization omits them.
  map.startLocations = sites.filter(i => !isWaterTerrain(map, map.tiles[i]) && map.tiles[i].elevation < 2).map((i, player) => ({ x: i % map.width, y: Math.floor(i / map.width), player, civilization: "", leader: "", team: player, playable: true, cityState: false }));
}
