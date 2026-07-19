import { createHash } from "node:crypto";
import { parseCiv5Map, serializeCiv5Map, type Civ5Map } from "../lib/civ5-map.ts";
import { validateCiv5Map } from "../lib/map-analysis.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  GAME_BREAKING_GEOMETRIES,
  GAME_BREAKING_MAP_SIZES,
  SAFE_MAP_GEOMETRIES,
  SAFE_MAP_SIZES,
  generateMap,
  resolveMapDimensions,
  type MapGenerationOptions,
} from "../lib/map-generator.ts";

type BaselineCase = {
  id: string;
  class: "INVARIANT" | "CHARACTERIZATION" | "IMPROVEMENT";
  purpose: string;
  options: Partial<MapGenerationOptions>;
  scenario?: boolean;
};

export const REWRITE_BASELINE_CASES: BaselineCase[] = [
  { id: "engine-excogitare", class: "CHARACTERIZATION", purpose: "Current Excogitare field output", options: { engine: "EXCOGITARE", preset: "CONTINENTS", size: "DUEL", players: 2, cityStates: 2, seed: "rewrite-baseline-excogitare" } },
  { id: "engine-eccentric", class: "CHARACTERIZATION", purpose: "Current Eccentric graph output", options: { engine: "ECCENTRIC", preset: "TECTONIC_CONTINENTS", size: "DUEL", players: 2, cityStates: 2, seed: "rewrite-baseline-eccentric" } },
  { id: "engine-physical", class: "CHARACTERIZATION", purpose: "Current Physical simulation output", options: { engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size: "DUEL", players: 2, cityStates: 2, seed: "rewrite-baseline-physical" } },
  { id: "engine-polis", class: "CHARACTERIZATION", purpose: "Current Polis strategic output", options: { engine: "POLIS", preset: "IMPERIAL_RING", size: "DUEL", players: 2, cityStates: 2, seed: "rewrite-baseline-polis" } },
  { id: "identity-lonely-oceans", class: "IMPROVEMENT", purpose: "Isolation benchmark expected to improve", options: { engine: "ECCENTRIC", preset: "LONELY_OCEANS", size: "STANDARD", players: 8, cityStates: 8, seed: "rewrite-benchmark-lonely-oceans", waterPercent: 89, mountainPercent: 7 } },
  { id: "identity-broken-island-chains", class: "IMPROVEMENT", purpose: "Correlated island-arc benchmark expected to improve", options: { engine: "ECCENTRIC", preset: "SHATTERED_ARCHIPELAGO", size: "STANDARD", players: 8, cityStates: 8, seed: "rewrite-benchmark-island-chains", waterPercent: 78, mountainPercent: 16 } },
  { id: "identity-great-watersheds", class: "IMPROVEMENT", purpose: "Hierarchical drainage benchmark expected to improve", options: { engine: "ECCENTRIC", preset: "GREAT_WATERSHEDS", size: "STANDARD", players: 8, cityStates: 8, seed: "rewrite-benchmark-watersheds", waterPercent: 35, mountainPercent: 15, riverDensity: "DENSE" } },
  { id: "identity-glacial-world", class: "IMPROVEMENT", purpose: "Planetary cold and frontier-value benchmark expected to improve", options: { engine: "PHYSICAL", preset: "ICEHOUSE_EARTH", size: "STANDARD", players: 8, cityStates: 8, seed: "rewrite-benchmark-glacial-world", waterPercent: 40, mountainPercent: 15, climate: "COOL", physicalSeasonality: "EXTREME" } },
  { id: "scenario-round-trip", class: "CHARACTERIZATION", purpose: "Project-side scenario intent with geography-only Civ5Map export", options: { engine: "EXCOGITARE", preset: "PANGAEA", size: "DUEL", players: 4, cityStates: 4, modifier: "DOOMSDAY", seed: "rewrite-baseline-scenario" }, scenario: true },
];

function digest(value: ArrayBuffer | Uint8Array | string) {
  const hash = createHash("sha256");
  if (typeof value === "string") hash.update(value);
  else hash.update(new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer, value instanceof ArrayBuffer ? 0 : value.byteOffset, value instanceof ArrayBuffer ? value.byteLength : value.byteLength));
  return hash.digest("hex");
}

function sortedRecord(values: Record<string, number>) {
  return Object.fromEntries(Object.entries(values).sort(([one], [two]) => one.localeCompare(two)).map(([key, value]) => [key, Number(value.toFixed(6))]));
}

function prepareScenario(map: Civ5Map) {
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const start = map.startLocations.find((item) => !item.cityState);
  if (start) {
    const index = start.y * map.width + start.x;
    tiles[index].owner = start.player;
    if (!tiles[index].route) tiles[index].route = "ROUTE_ROAD";
  }
  return {
    ...map,
    tiles,
    cities: start ? [{ id: 0, name: "Baseline Capital", owner: start.player, population: 5, x: start.x, y: start.y, recordValid: true, duplicate: false }] : [],
  } satisfies Civ5Map;
}

function summarize(map: Civ5Map) {
  const objectsByKind: Record<string, number> = {};
  for (const object of map.structure?.objects ?? []) objectsByKind[object.kind] = (objectsByKind[object.kind] ?? 0) + 1;
  const issues = validateCiv5Map(map);
  const serialized = serializeCiv5Map(map);
  const parsed = parseCiv5Map(serialized, `${map.name}.Civ5Map`);
  return {
    digests: {
      normalizedRecipe: digest(JSON.stringify(map.generation ?? null)),
      civ5Map: digest(serialized),
      tiles: digest(JSON.stringify(map.tiles)),
      structure: digest(JSON.stringify(map.structure ?? null)),
    },
    summary: {
      width: map.width,
      height: map.height,
      wraps: map.wraps,
      landTiles: map.tiles.filter((tile) => tile.terrain >= 2).length,
      waterTiles: map.tiles.filter((tile) => tile.terrain < 2).length,
      mountainTiles: map.tiles.filter((tile) => tile.terrain >= 2 && tile.elevation === 2).length,
      riverTiles: map.tiles.filter((tile) => tile.river > 0).length,
      resourceTiles: map.tiles.filter((tile) => tile.resource !== 255).length,
      wonderTiles: map.tiles.filter((tile) => tile.wonder !== 255).length,
      improvementTiles: map.tiles.filter((tile) => Boolean(tile.improvement)).length,
      routeTiles: map.tiles.filter((tile) => Boolean(tile.route)).length,
      majorStarts: map.startLocations.filter((start) => !start.cityState).length,
      cityStateStarts: map.startLocations.filter((start) => start.cityState).length,
      citiesBeforeRoundTrip: map.cities?.length ?? 0,
      citiesAfterRoundTrip: parsed.cities?.length ?? 0,
      parsedMajorStarts: parsed.startLocations.filter((start) => !start.cityState).length,
      parsedCityStateStarts: parsed.startLocations.filter((start) => start.cityState).length,
      parsedOwnedTiles: parsed.tiles.filter((tile) => tile.owner !== undefined).length,
      parsedImprovementTiles: parsed.tiles.filter((tile) => Boolean(tile.improvement)).length,
      parsedRouteTiles: parsed.tiles.filter((tile) => Boolean(tile.route)).length,
      validationErrors: issues.filter((issue) => issue.severity === "ERROR").length,
      validationWarnings: issues.filter((issue) => issue.severity === "WARNING").length,
      objectsByKind: sortedRecord(objectsByKind),
      diagnostics: sortedRecord(map.structure?.diagnostics ?? {}),
    },
  };
}

export function captureRewriteBaseline() {
  return {
    schemaVersion: 1,
    purpose: "Phase 0 characterization; improvement fixtures are expected to change deliberately.",
    defaultRecipe: DEFAULT_GENERATION_OPTIONS,
    boundaries: {
      safeMapSizes: [...SAFE_MAP_SIZES],
      gameBreakingMapSizes: [...GAME_BREAKING_MAP_SIZES],
      safeGeometries: [...SAFE_MAP_GEOMETRIES],
      gameBreakingGeometries: [...GAME_BREAKING_GEOMETRIES],
      dimensions: [
        ["DUEL", "STANDARD", resolveMapDimensions("DUEL", "STANDARD")],
        ["DUEL", "PIN", resolveMapDimensions("DUEL", "PIN")],
        ["DUEL", "STRING", resolveMapDimensions("DUEL", "STRING")],
        ["EXTREME", "STANDARD", resolveMapDimensions("EXTREME", "STANDARD")],
        ["COLOSSAL", "STANDARD", resolveMapDimensions("COLOSSAL", "STANDARD")],
      ],
    },
    cases: REWRITE_BASELINE_CASES.map((definition) => {
      const options = { ...DEFAULT_GENERATION_OPTIONS, ...definition.options };
      const generated = generateMap(options);
      const map = definition.scenario ? prepareScenario(generated) : generated;
      return { id: definition.id, class: definition.class, purpose: definition.purpose, options: definition.options, ...summarize(map) };
    }),
  };
}
