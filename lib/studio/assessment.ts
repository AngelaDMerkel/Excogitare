import type { Civ5Map, Civ5Tile } from "../civ5-map.ts";
import { isWaterTerrain } from "../civ5-rules.ts";
import { reconstructCiv5RiverEdgeSystems, riverEdgeDefinitions } from "../rivers.ts";
import { adjacency, paths, region, tileDistance, trace } from "./spatial.ts";
import { clamp, hash, type Assessment, type StudioRecipe } from "./model.ts";

export function tileYields(map: Civ5Map, tile: Civ5Tile): { food: number; production: number; value: number } {
  if (tile.elevation === 2) return { food: 0, production: 0, value: 0 };
  const terrain = map.terrains[tile.terrain] ?? "", feature = map.features[tile.feature] ?? "", resource = map.resources[tile.resource] ?? "";
  let food = /GRASS/.test(terrain) ? 2 : /PLAINS|COAST/.test(terrain) ? 1 : 0;
  let production = /PLAINS/.test(terrain) ? 1 : 0;
  if (tile.elevation === 1) { production = 2; food = 0; }
  if (/FOREST/.test(feature)) { food = 1; production = 1; }
  if (/JUNGLE/.test(feature)) { food = 2; production = 0; }
  if (/FLOOD_PLAINS|OASIS/.test(feature)) food = 3;
  if (/MARSH/.test(feature)) food = Math.max(0, food - 1);
  if (/WHEAT|COW|BANANA|DEER|FISH|SHEEP/.test(resource)) food += 1;
  if (/IRON|HORSE|COAL|ALUMINUM|STONE/.test(resource)) production += 1;
  return { food, production, value: food * 1.3 + production + (tile.resource !== 255 ? .8 : 0) + (tile.river & 7 ? .35 : 0) };
}
export function movementCost(map: Civ5Map, stage: "LAND" | "COASTAL" | "OCEAN") {
  return (from: number, to: number) => {
    const tile = map.tiles[to], water = isWaterTerrain(map, tile), feature = map.features[tile.feature] ?? "";
    if (tile.elevation === 2 || /ICE/.test(feature)) return Infinity;
    if (water) {
      if (stage === "LAND" || stage === "COASTAL" && /OCEAN/.test(map.terrains[tile.terrain])) return Infinity;
      return isWaterTerrain(map, map.tiles[from]) ? 1 : 2;
    }
    const ground = /MARSH/.test(feature) ? 3 : tile.elevation === 1 || /FOREST|JUNGLE/.test(feature) ? 2 : 1;
    // Crossing is measured from the actual owned Civ V edge, not every tile
    // adjacent to a river. The relative hex direction is encoded below.
    const x = from % map.width, y = Math.floor(from / map.width), tx = to % map.width, ty = Math.floor(to / map.width);
    let dx = tx - x; if (map.wraps && Math.abs(dx) > 1) dx = -Math.sign(dx);
    const dy = ty - y;
    let river = riverEdgeDefinitions(x, y).some(edge => edge.dx === dx && edge.dy === dy && !!(map.tiles[from].river & edge.bit));
    river ||= riverEdgeDefinitions(tx, ty).some(edge => edge.dx === -dx && edge.dy === -dy && !!(tile.river & edge.bit));
    return ground + (river && stage === "LAND" ? 2 : 0);
  };
}
const spread = (values: number[]) => {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.length < 2 ? 0 : (Math.max(...values) - Math.min(...values)) / Math.max(1, mean) * 100;
};
const median = (values: number[]) => { const ordered = values.filter(Number.isFinite).sort((a, b) => a - b); return ordered.length ? ordered[Math.floor(ordered.length / 2)] : -1; };

export function assess(map: Civ5Map, recipe?: StudioRecipe): Assessment {
  const graph = adjacency(map), yields = map.tiles.map(tile => tileYields(map, tile));
  const land = map.tiles.flatMap((t, i) => !isWaterTerrain(map, t) && t.elevation < 2 ? [i] : []);
  const water = map.tiles.filter(t => isWaterTerrain(map, t)).length, landCount = Math.max(1, map.tiles.length - water);
  const opportunities = land.map(tile => {
    const nearby = region(graph, [tile], 2), useful = nearby.map(i => yields[i]);
    return { tile, food: useful.reduce((s, y) => s + y.food, 0), production: useful.reduce((s, y) => s + y.production, 0), value: useful.reduce((s, y) => s + y.value, 0), coastal: graph[tile].some(i => isWaterTerrain(map, map.tiles[i])), space: nearby.filter(i => !isWaterTerrain(map, map.tiles[i]) && map.tiles[i].elevation < 2).length };
  }).filter(site => site.food >= 5 && site.space >= 5).sort((a, b) => b.value - a.value || a.tile - b.tile);
  const centers: typeof opportunities = [];
  for (const site of opportunities) if (centers.every(other => tileDistance(map, other.tile, site.tile) >= 4)) { centers.push(site); if (centers.length >= 72) break; }
  const count = recipe?.players ?? Math.max(2, map.players || 4), layoutCount = count > 8 ? 2 : 4;
  const rivals = (a: number, b: number) => a !== b && (!recipe?.teams || a % recipe.teams !== b % recipe.teams);
  const layouts: Assessment["layouts"] = [];
  const stages: Assessment["stages"] = [];
  const findings: Assessment["findings"] = [];
  const axes: NonNullable<Assessment["axes"]> = [];
  let primarySites: typeof centers = [], primaryDistances: ReturnType<typeof paths>[] = [];
  for (let variation = 0; variation < layoutCount; variation++) {
    const sites: typeof centers = [];
    const offset = variation * Math.max(1, Math.floor(centers.length / layoutCount));
    for (let seat = 0; seat < count; seat++) {
      const candidates = centers.filter(site => sites.every(other => tileDistance(map, other.tile, site.tile) >= 5));
      candidates.sort((a, b) => {
        const score = (site: typeof a) => sites.length ? Math.min(...sites.map(s => tileDistance(map, site.tile, s.tile))) * 2 + site.value * .12 : -(centers.indexOf(site) - offset + centers.length) % Math.max(1, centers.length);
        return score(b) - score(a) || a.tile - b.tile;
      });
      if (!candidates[0]) break; sites.push(candidates[0]);
    }
    const journeys = sites.map(site => paths(graph, [site.tile], movementCost(map, "LAND")));
    const expansion = journeys.map((journey, seat) => land.filter(i => journey.distance[i] <= 18 && journeys.every((other, s) => s === seat || journey.distance[i] <= other.distance[i])).length);
    const isolation = journeys.filter((journey, seat) => sites.every((other, s) => !rivals(s, seat) || !Number.isFinite(journey.distance[other.tile]))).length;
    layouts.push({ sites: sites.map(s => s.tile), openingSpread: spread(sites.map(s => s.value)), expansionSpread: spread(expansion), isolation });
    if (variation === 0) {
      primarySites = sites; primaryDistances = journeys;
      const resourceTypes = (pattern: RegExp) => journeys.map(journey => new Set(map.tiles.flatMap((tile, i) => journey.distance[i] <= 24 && pattern.test(map.resources[tile.resource] ?? "") ? [tile.resource] : [])).size);
      const values = [
        { name: "Opening alternatives", values: sites.map(s => Math.round(s.value)), unit: "yield estimate" },
        { name: "Reachable expansion", values: expansion, unit: "tiles within 18 movement cost" },
        { name: "Early strategic access", values: resourceTypes(/IRON|HORSE/), unit: "resource types" },
        { name: "Later strategic access", values: resourceTypes(/COAL|OIL|ALUMINUM|URANIUM/), unit: "resource types by land" },
        { name: "Deployment space", values: sites.map(s => s.space), unit: "passable tiles within 2 hexes" },
        { name: "Land contact", values: journeys.map((j, seat) => { const v = sites.flatMap((s, n) => rivals(n, seat) && Number.isFinite(j.distance[s.tile]) ? [j.distance[s.tile]] : []); return v.length ? Math.round(Math.min(...v)) : -1; }), unit: "movement cost to a rival" },
      ];
      axes.push(...values.map(axis => ({ ...axis, spread: spread(axis.values.filter(v => v >= 0)) })));
    }
  }
  for (const id of ["LAND", "COASTAL", "OCEAN"] as const) {
    const distances = id === "LAND" ? primaryDistances : primarySites.map(site => paths(graph, [site.tile], movementCost(map, id)));
    const pairCosts = primarySites.flatMap((site, i) => primarySites.flatMap((other, j) => j > i && rivals(i, j) ? [distances[i].distance[other.tile]] : []));
    stages.push({ id, label: id === "LAND" ? "Overland" : id === "COASTAL" ? "Coastal travel" : "Ocean travel", reachablePairs: pairCosts.filter(Number.isFinite).length, pairs: pairCosts.length, medianCost: median(pairCosts) });
  }
  if (primarySites.length < count) findings.push({ id: "capacity", label: "Few viable settlement alternatives", detail: `${primarySites.length} separated opportunities found for ${count} humans.`, severity: "WEAK", tiles: primarySites.map(s => s.tile) });
  const barrierDistance = paths(graph, map.tiles.flatMap((tile, i) => isWaterTerrain(map, tile) || tile.elevation === 2 ? [i] : []), () => 1).distance;
  let widthPenalty = 0;
  for (let a = 0; a < primarySites.length; a++) for (let b = a + 1; b < primarySites.length; b++) {
    if (!rivals(a, b)) continue;
    const path = trace(primaryDistances[a].previous, primarySites[b].tile);
    if (path.length < 5 || !Number.isFinite(primaryDistances[a].distance[primarySites[b].tile])) continue;
    const interior = path.filter(i => tileDistance(map, i, primarySites[a].tile) > 2 && tileDistance(map, i, primarySites[b].tile) > 2);
    const width = (i: number) => Math.min(20, Math.max(1, barrierDistance[i] * 2 - 1));
    const narrow = interior.filter(i => width(i) < (recipe?.frontage[0] ?? 2));
    const approachWidth = median(interior.map(width));
    if (recipe && approachWidth > recipe.frontage[1]) {
      widthPenalty += Math.min(12, (approachWidth - recipe.frontage[1]) / 2);
      findings.push({ id: `open-${a}-${b}`, label: "This approach is more open than intended", detail: `Estimated clearance is ${approachWidth} tiles; the requested range is ${recipe.frontage.join("–")}.`, severity: "INFO", tiles: interior });
    }
    if (narrow.length) {
      const blocked = new Set(narrow), cost = movementCost(map, "LAND");
      const alternate = paths(graph, [primarySites[a].tile], (i, j) => blocked.has(j) ? Infinity : cost(i, j));
      const alternative = alternate.distance[primarySites[b].tile];
      if (!Number.isFinite(alternative) || alternative > primaryDistances[a].distance[primarySites[b].tile] * 1.7) findings.push({ id: `front-${a}-${b}`, label: "A narrow approach controls this journey", detail: Number.isFinite(alternative) ? "A bypass exists but is substantially more costly; another saddle could broaden the front." : "No independent overland bypass was found. A second approach could reduce defensive dominance.", severity: "WEAK", tiles: narrow });
    }
  }
  const sensitivity = layouts.map(l => l.openingSpread);
  if (Math.max(0, ...sensitivity) > 45) findings.push({ id: "opening", label: "Opening opportunities depend on placement", detail: `Yield spread ranges from ${Math.min(...sensitivity).toFixed(0)}% to ${Math.max(...sensitivity).toFixed(0)}% across ${layouts.length} plausible layouts.`, severity: "WEAK", tiles: primarySites.filter(s => s.value < median(primarySites.map(p => p.value))).map(s => s.tile) });
  const contact = axes.find(axis => axis.name === "Land contact")?.values.filter(v => v >= 0) ?? [];
  if (recipe && contact.some(v => v < recipe.contact[0] || v > recipe.contact[1])) findings.push({ id: "contact", label: "Contact differs from the intended pace", detail: `Some nearest land journeys lie outside the requested ${recipe.contact.join("–")} movement-cost range.`, severity: "WEAK", tiles: primarySites.map(s => s.tile) });
  const systems = reconstructCiv5RiverEdgeSystems(map);
  const economicRoles = new Set(centers.map(site => `${site.food > site.production * 1.8 ? "food" : site.production > site.food ? "production" : "mixed"}:${site.coastal ? "coastal" : "inland"}`));
  const pacePenalty = recipe ? contact.reduce((sum, cost) => sum + Math.min(10, Math.max(0, recipe.contact[0] - cost, cost - recipe.contact[1]) / 3), 0) / Math.max(1, contact.length) : 0;
  const expansionPenalty = Math.max(0, ...layouts.map(layout => layout.expansionSpread)) / 500;
  const resourcePenalty = (axes.find(axis => axis.name === "Early strategic access")?.values.filter(n => n === 0).length ?? 0) / Math.max(1, count) * .08;
  const quality = {
    coherence: systems.length ? Math.round(systems.filter(s => s.directedToOutlet).length / systems.length * 100) : 100,
    identity: 100,
    opportunity: Math.round(clamp(1 - Math.max(0, ...sensitivity) / 240 - Math.max(0, count - primarySites.length) / count - expansionPenalty - resourcePenalty - findings.filter(f => f.id.startsWith("front")).length * .025 - (pacePenalty + widthPenalty) / 100) * 100),
    variety: Math.round(economicRoles.size / 6 * 100),
    fidelity: 100,
  };
  return {
    water: water / map.tiles.length * 100, mountains: map.tiles.filter(t => !isWaterTerrain(map, t) && t.elevation === 2).length / landCount * 100,
    fertileShare: map.tiles.filter(t => /GRASS|PLAINS/.test(map.terrains[t.terrain]) && t.elevation < 2).length / landCount * 100,
    riverTiles: map.tiles.filter(t => t.river & 7).length, sampleSpread: Math.max(0, ...sensitivity), candidate: 1, attempts: 1, axes, layouts, stages, opportunities: centers, findings, quality,
    notes: ["Sampled settlement regions are analytical alternatives. Civ V assigns multiplayer starts; actual placement and fairness are unverified.", ...(recipe?.teams ? [`Contact is screened between rival teams in hypothetical ${recipe.teams}-team assignments. Actual team placement is unverified.`] : []), "Movement costs model generic terrain, river crossings and travel capabilities. Promotions, civilization abilities, roads, combat and diplomacy are excluded.", "Yield estimates compare geographic opportunities; scores are screening heuristics, not measures of enjoyment or predictions of victory."],
  };
}
export function assessmentFingerprint(map: Civ5Map) { return hash(map.tiles.map(t => `${t.terrain},${t.elevation},${t.river},${t.feature},${t.resource}`).join(";")).toString(36); }
