import type { Civ5Map, Civ5StartLocation } from "./civ5-map.ts";

export type ValidationIssue = {
  severity: "ERROR" | "WARNING" | "INFO";
  category: "STRUCTURE" | "STARTS" | "RESOURCES" | "RIVERS" | "SCENARIO";
  message: string;
  x?: number;
  y?: number;
};

export type PlayerBalance = {
  player: number;
  x: number;
  y: number;
  score: number;
  grade: "A" | "B" | "C" | "D";
  workableLand: number;
  expansionSpace: number;
  strategicResources: number;
  luxuries: number;
  bonusResources: number;
  coastal: boolean;
  freshwater: boolean;
  nearestOpponent: number | null;
  nearestCityState: number | null;
  barbarianPressure: number;
  nearbyRuins: number;
};

export type BalanceReport = {
  grade: "A" | "B" | "C" | "D";
  spread: number;
  players: PlayerBalance[];
  summary: string;
};

function neighbors(x: number, y: number, width: number, height: number, wraps: boolean) {
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

function hexDistance(a: [number, number], b: [number, number], width: number, wraps: boolean) {
  const cube = ([x, y]: [number, number]) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y];
  };
  const direct = (one: [number, number], two: [number, number]) => {
    const ac = cube(one);
    const bc = cube(two);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(a, b);
  return Math.min(direct(a, b), direct([a[0] - width, a[1]], b), direct([a[0] + width, a[1]], b));
}

function withinRadius(map: Civ5Map, start: Civ5StartLocation, radius: number) {
  const indices: number[] = [];
  for (let y = Math.max(0, start.y - radius); y <= Math.min(map.height - 1, start.y + radius); y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (hexDistance([start.x, start.y], [x, y], map.width, map.wraps) <= radius) indices.push(y * map.width + x);
    }
  }
  return indices;
}

export function validateCiv5Map(map: Civ5Map): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (map.width < 1 || map.height < 1 || map.tiles.length !== map.width * map.height) {
    issues.push({ severity: "ERROR", category: "STRUCTURE", message: `Tile data has ${map.tiles.length} records; ${map.width * map.height} are required.` });
  }
  const occupied = new Set<string>();
  const playerIds = new Set<number>();
  const majorStarts = map.startLocations.filter((start) => !start.cityState);
  for (const start of map.startLocations) {
    if (start.x < 0 || start.y < 0 || start.x >= map.width || start.y >= map.height) {
      issues.push({ severity: "ERROR", category: "STARTS", message: `Player ${start.player + 1} starts outside the map.` });
      continue;
    }
    const key = `${start.x},${start.y}`;
    if (occupied.has(key)) issues.push({ severity: "ERROR", category: "STARTS", message: `Multiple starts occupy tile ${key}.`, x: start.x, y: start.y });
    occupied.add(key);
    if (playerIds.has(start.player)) issues.push({ severity: "WARNING", category: "SCENARIO", message: `Player identifier ${start.player + 1} is duplicated.` });
    playerIds.add(start.player);
    const tile = map.tiles[start.y * map.width + start.x];
    if (tile && (tile.terrain < 2 || tile.elevation === 2)) issues.push({ severity: "ERROR", category: "STARTS", message: `Player ${start.player + 1} has an impassable start.`, x: start.x, y: start.y });
    if (start.cityState && start.playable) issues.push({ severity: "WARNING", category: "SCENARIO", message: `City state ${start.player + 1} is marked playable.`, x: start.x, y: start.y });
  }
  if (majorStarts.length !== map.players) issues.push({ severity: "WARNING", category: "SCENARIO", message: `The header declares ${map.players} players but stores ${majorStarts.length} major starts.` });

  let invalidResources = 0;
  let invalidWonders = 0;
  let invalidRiverBits = 0;
  let isolatedRivers = 0;
  let previewSites = 0;
  let previewRoutes = 0;
  for (let index = 0; index < map.tiles.length; index += 1) {
    const tile = map.tiles[index];
    if (tile.resource !== 255 && (tile.resource < 0 || tile.resource >= map.resources.length)) invalidResources += 1;
    if (tile.wonder !== 255 && (tile.wonder < 0 || tile.wonder >= map.wonders.length)) invalidWonders += 1;
    if (tile.river & ~7) invalidRiverBits += 1;
    if (tile.improvement) previewSites += 1;
    if (tile.route) previewRoutes += 1;
    if (tile.river & 7) {
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      if (!neighbors(x, y, map.width, map.height, map.wraps).some(([nx, ny]) => map.tiles[ny * map.width + nx].river & 7)) isolatedRivers += 1;
    }
  }
  if (invalidResources) issues.push({ severity: "ERROR", category: "RESOURCES", message: `${invalidResources} tiles reference missing resource definitions.` });
  if (invalidWonders) issues.push({ severity: "ERROR", category: "RESOURCES", message: `${invalidWonders} tiles reference missing wonder definitions.` });
  if (invalidRiverBits) issues.push({ severity: "ERROR", category: "RIVERS", message: `${invalidRiverBits} tiles contain unsupported river-edge flags.` });
  if (isolatedRivers) issues.push({ severity: "WARNING", category: "RIVERS", message: `${isolatedRivers} river tiles appear disconnected and should be inspected.` });
  if (previewSites || previewRoutes) issues.push({ severity: "WARNING", category: "SCENARIO", message: `${previewSites} scenario sites and ${previewRoutes} road tiles are previewed; geography-only Civ5Map export does not retain scenario improvements or routes.` });
  if (!issues.length) issues.push({ severity: "INFO", category: "STRUCTURE", message: "No structural Civ5Map problems were detected." });
  return issues;
}

export function analyzeMultiplayerBalance(map: Civ5Map): BalanceReport {
  const majors = map.startLocations.filter((start) => !start.cityState);
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const raw = majors.map((start) => {
    const local = withinRadius(map, start, 3).map((index) => map.tiles[index]);
    const expansion = withinRadius(map, start, 6).map((index) => map.tiles[index]);
    const adjacent = neighbors(start.x, start.y, map.width, map.height, map.wraps).map(([x, y]) => map.tiles[y * map.width + x]);
    const workableLand = local.filter((tile) => tile.terrain >= 2 && tile.elevation < 2).length;
    const expansionSpace = expansion.filter((tile) => tile.terrain >= 2 && tile.elevation < 2).length;
    const strategicResources = local.filter((tile) => tile.resource >= 5 && tile.resource <= 10).length;
    const luxuries = local.filter((tile) => tile.resource >= 11 && tile.resource !== 255).length;
    const bonusResources = local.filter((tile) => tile.resource >= 0 && tile.resource <= 4).length;
    const coastal = adjacent.some((tile) => tile.terrain < 2);
    const freshwater = map.tiles[start.y * map.width + start.x].river > 0 || adjacent.some((tile) => tile.river > 0);
    const nearest = (locations: Civ5StartLocation[]) => locations.length ? Math.min(...locations.map((other) => hexDistance([start.x, start.y], [other.x, other.y], map.width, map.wraps))) : null;
    const nearestOpponent = nearest(majors.filter((other) => other !== start));
    const nearestCityState = nearest(cityStates);
    const barbarianPressure = local.filter((tile) => tile.improvement === "IMPROVEMENT_BARBARIAN_CAMP").length;
    const nearbyRuins = local.filter((tile) => tile.improvement === "IMPROVEMENT_GOODY_HUT").length;
    const score = workableLand * 1.2 + expansionSpace * 0.25 + strategicResources * 7 + luxuries * 6 + bonusResources * 2.5 + (freshwater ? 6 : 0) + (coastal ? 3 : 0) - barbarianPressure * 2;
    return { player: start.player, x: start.x, y: start.y, score, workableLand, expansionSpace, strategicResources, luxuries, bonusResources, coastal, freshwater, nearestOpponent, nearestCityState, barbarianPressure, nearbyRuins };
  });
  const average = raw.reduce((sum, player) => sum + player.score, 0) / Math.max(1, raw.length);
  const graded: PlayerBalance[] = raw.map((player) => {
    const deviation = Math.abs(player.score - average) / Math.max(1, average);
    const grade = deviation <= 0.08 ? "A" : deviation <= 0.16 ? "B" : deviation <= 0.27 ? "C" : "D";
    return { ...player, score: Math.round(player.score), grade };
  });
  const scores = graded.map((player) => player.score);
  const spread = scores.length ? Math.round((Math.max(...scores) - Math.min(...scores)) / Math.max(1, average) * 100) : 0;
  const grade = spread <= 12 ? "A" : spread <= 24 ? "B" : spread <= 38 ? "C" : "D";
  return { grade, spread, players: graded, summary: graded.length ? `${spread}% score spread across ${graded.length} major starts` : "No major starts are available to compare" };
}
