"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDemoMap,
  inspectCiv5MapStructure,
  parseCiv5Map,
  parseCiv5MapForRepair,
  serializeCiv5Map,
  updateCiv5Map,
  type Civ5Map,
  type Civ5StartLocation,
  type Civ5Tile,
} from "@/lib/civ5-map";
import { analyzeMultiplayerBalance, validateCiv5Map } from "@/lib/map-analysis";
import {
  applyStructureOperation,
  compareMaps,
  createMapCheckpoint,
  restoreMapCheckpoint,
  scoreBatchCandidate,
  type BatchCandidate,
  type MapCheckpoint,
  type RegenerationStage,
  type StructureOperation,
} from "@/lib/map-design";
import { addGenerationToHistory, MAX_GENERATION_HISTORY, restoreGeneration, type GenerationHistoryEntry } from "@/lib/generation-history";
import type { IdentityLabSession as LegacyIdentityLabSession } from "@/lib/identity-lab";
import {
  CONTINUOUS_IDENTITY_LAB_STORAGE_KEY,
  continuousIdentityLabFileName,
  createContinuousIdentityLabSession,
  currentContinuousIdentityLabTrial,
  endContinuousIdentityLabSession,
  exportIdentityLabEvidence,
  importIdentityLabEvidence,
  isContinuousIdentityLabSession,
  prefetchedContinuousIdentityLabTrial,
  presentContinuousIdentityLabTrial,
  recordContinuousIdentityLabGeneration,
  recordContinuousIdentityLabGenerationError,
  submitContinuousIdentityLabAnswer,
  type ContinuousIdentityLabSession,
} from "@/lib/identity-lab-continuous";
import { CLIMATE_PROJECTIONS } from "@/lib/climate-projection";
import { applyRepairIssues, buildRepairIssues, cloneMap, issueSelectedByProfile, type RepairIssue, type RepairProfile } from "@/lib/map-repair";
import {
  DEFAULT_GENERATION_OPTIONS,
  DOMINANT_TERRAINS,
  estimateGenerationResources,
  fantasticalityForPreset,
  isGameBreakingGeometry,
  isGameBreakingMapSize,
  MAP_PRESETS,
  MAP_SIZES,
  polisPatternForPreset,
  randomGenerationRecipe,
  resolveMapDimensions,
  WORLD_MODIFIERS,
  type MapGenerationOptions,
} from "@/lib/map-generator";
import { generationOptionsFromRecipe, generationRecipeFromOptions, normalizeGenerationRecipe, type ArchetypeIntensity, type GenerationEffort, type GenerationRecipe, type MatchIntent, type VictoryCondition, type WorldArchetype, type WorldScale } from "@/lib/generation-recipe";
import {
  createLuaMapScript,
  createModInfo,
  inspectLuaMapScript,
  mapExportBaseName,
  mapFromLuaScript,
  type LuaCompatibilityReport,
} from "@/lib/map-script";
import { runLuaMapScript } from "@/lib/lua-runtime";
import { mergeLuaDependencies, type LuaProjectDependency, type LuaRuntimeMetadata, type LuaScriptOption } from "@/lib/lua-project";
import { buildPoliticalOwnership, hasPoliticalLayer, politicalColors } from "@/lib/political-map";
import { fitViewport, minimumViewportZoom } from "@/lib/map-viewport";
import { generationPassChangesBetweenMaps, markGenerationStructureStale } from "@/lib/generation-structure";
import { describeWorldCharacter } from "@/lib/world-character";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject, type ProjectHistoryPolicy } from "@/lib/excogitare-project";
import type { ExcogitareProject, ProjectHistory, ProjectManifest, ProtectionChannel, ProtectionState, ScenarioDraft } from "@/lib/authoring-schema";
import { applyProtectionState, cloneProtectionState, emptyProtectionState, eraseProtectedTiles, protectableSemantics, PROTECTION_CHANNELS, protectSemanticObject, protectTiles, removeProtection, type ProtectableSemantic } from "@/lib/map-protection";
import { ARCHETYPE_PROFILES, describeArchetype } from "@/lib/world-archetype";
import { WORLD_SCALE_PROFILES } from "@/lib/world-scale";
import { describeNarrativeProfile, narrativeProfile } from "@/lib/narrative-map-types";
import { CreateOperationStatus, CreateStagePanel, CreateStageTabs, GenerationHistoryCard, normalizeCreateStage, type CreateStage } from "./create-workspace";
import { ScenarioStageTabs, ScenarioWorkspace, type ScenarioStage } from "./scenario-workspace";
import { applyScenarioDraft, cloneScenarioDraft, scenarioCompatibility, scenarioDraftFromMap, scenarioExportSummary, validateScenarioDraft } from "@/lib/scenario-authoring";

const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const ISOMETRIC_RELIEF_MARGIN = 52;
const APP_VERSION = "1.3.0";

type View = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };
type Layers = { political: boolean; strategy: boolean; grid: boolean; features: boolean; resources: boolean; elevation: boolean; starts: boolean; cityStates: boolean };
type HoveredTile = { tile: Civ5Tile; col: number; row: number } | null;
type ImportedMapSource = { fileName: string; buffer: ArrayBuffer; salvaged?: boolean };
type WorkspaceMode = "VIEW" | "CREATE" | "SCENARIO" | "REPAIR" | "LAB" | "SCRIPT";
type Brush = { terrain: number | null; elevation: number | null; feature: number | null; resource: number | null };
type TileSelection = { minX: number; minY: number; maxX: number; maxY: number };
type TileClipboard = { width: number; height: number; tiles: Civ5Tile[] };
type Projection = "FLAT" | "ISOMETRIC";
type RepairView = "ORIGINAL" | "CORRECTED" | "DIFFERENCE";
type ArchetypePreviewView = "ORIGINAL" | "PREVIEW" | "DIFFERENCE";
type RepairStage = "INSPECT" | "CORRECT" | "VALIDATE";
type LuaStage = "SCRIPT" | "GENERATE" | "DIAGNOSTICS";
type LabStage = "REVIEW" | "RESULTS" | "GUIDE";
type UiTooltip = { text: string; x: number; y: number; above: boolean };
type ProjectionTransform = { a: number; b: number; c: number; d: number; e: number; f: number; width: number; height: number };
type GenerationWorkerMessage = { id: number; type: "PROGRESS"; stage: string; progress?: import("@/lib/generation-pass-graph").GenerationProgress } | { id: number; type: "COMPLETE"; map: Civ5Map } | { id: number; type: "ERROR"; message: string };

function normalizeGenerationOptions(options: Partial<MapGenerationOptions>, allowGameBreakingOptions = false): MapGenerationOptions {
  const legacyEngine = String(options.engine ?? "");
  const normalized = { ...DEFAULT_GENERATION_OPTIONS, ...options, engine: legacyEngine === "FIELD" ? "EXCOGITARE" : legacyEngine === "REGION_GRAPH" ? "ECCENTRIC" : options.engine ?? DEFAULT_GENERATION_OPTIONS.engine, cityStateMinSpacing: Math.max(5, options.cityStateMinSpacing ?? DEFAULT_GENERATION_OPTIONS.cityStateMinSpacing), dominantTerrains: [...(options.dominantTerrains ?? DEFAULT_GENERATION_OPTIONS.dominantTerrains)] };
  if (allowGameBreakingOptions) return normalized;
  return {
    ...normalized,
    geometry: isGameBreakingGeometry(normalized.geometry) ? "STANDARD" : normalized.geometry,
    size: isGameBreakingMapSize(normalized.size) ? "HUGE" : normalized.size,
  };
}

const GEOMETRY_OPTIONS = [
  { id: "STANDARD", label: "Standard proportions", gameBreaking: false },
  { id: "TALL", label: "Very tall and narrow", gameBreaking: false },
  { id: "WIDE", label: "Very thin and wide", gameBreaking: false },
  { id: "SQUARE", label: "Perfectly square", gameBreaking: false },
  { id: "NEEDLE", label: "Needle — extreme vertical", gameBreaking: true },
  { id: "RIBBON", label: "Ribbon — extreme horizontal", gameBreaking: true },
  { id: "PIN", label: "Pin — ultra-extreme vertical", gameBreaking: true },
  { id: "STRING", label: "String — ultra-extreme horizontal", gameBreaking: true },
] as const satisfies ReadonlyArray<{ id: MapGenerationOptions["geometry"]; label: string; gameBreaking: boolean }>;

const GENERATION_ENGINES = [
  { id: "EXCOGITARE", label: "Excogitare", preset: "WILD_REGIONS", description: "The native expressive engine: warped fields, dramatic landforms, and the broadest stylistic range." },
  { id: "ECCENTRIC", label: "Eccentric", preset: "MYTHIC_REGIONS", description: "A dense Fantastical-inspired compiler of irregular cells, authoritative navigation basins, dissonant biome realms, boundary ranges, and hierarchical watersheds." },
  { id: "PHYSICAL", label: "Physical", preset: "DYNAMIC_EARTH", description: "A retained Earth-system model of plates, erosion, continentality, seasonal temperature, three-cell circulation, vapor transport, biomes, and watersheds." },
  { id: "POLIS", label: "Polis", preset: "IMPERIAL_RING", description: "Gameplay-first strategic graphs: safe territories, contested objectives, fronts, protected routes, and auditable balance." },
] as const satisfies ReadonlyArray<{ id: MapGenerationOptions["engine"]; label: string; preset: string; description: string }>;

function generationEngineStage(engine: MapGenerationOptions["engine"]) {
  if (engine === "ECCENTRIC") return "Preparing multi-pass world graph";
  if (engine === "PHYSICAL") return "Preparing Earth-system simulation";
  if (engine === "POLIS") return "Preparing strategic graph";
  return "Preparing Excogitare fields";
}

const TERRAIN_COLORS: Record<string, string> = {
  OCEAN: "#183d50",
  COAST: "#2e7180",
  GRASS: "#76955a",
  PLAINS: "#ae9656",
  DESERT: "#c9a963",
  TUNDRA: "#7d8d83",
  SNOW: "#d7dfdc",
};

function friendlyName(value: string | undefined, prefix: string) {
  if (!value) return "None";
  return value.replace(prefix, "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function terrainColor(name: string | undefined) {
  const key = Object.keys(TERRAIN_COLORS).find((candidate) => name?.includes(candidate));
  return key ? TERRAIN_COLORS[key] : "#6f8068";
}

function shade(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel + amount));
  const red = clamp(value >> 16);
  const green = clamp((value >> 8) & 0xff);
  const blue = clamp(value & 0xff);
  return `rgb(${red}, ${green}, ${blue})`;
}

function mapBounds(width: number, height: number) {
  return {
    width: HEX_WIDTH * (width + 0.5) + MAP_MARGIN * 2,
    height: HEX_RADIUS * 1.5 * (height - 1) + HEX_RADIUS * 2 + MAP_MARGIN * 2,
  };
}

function projectionTransform(width: number, height: number, projection: Projection): ProjectionTransform {
  const bounds = mapBounds(width, height);
  if (projection === "FLAT") return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, ...bounds };
  const base = { a: 0.86, b: 0.25, c: -0.52, d: 0.38 };
  const corners = [
    { x: 0, y: 0 },
    { x: bounds.width, y: 0 },
    { x: 0, y: bounds.height },
    { x: bounds.width, y: bounds.height },
  ].map(({ x, y }) => ({ x: base.a * x + base.c * y, y: base.b * x + base.d * y }));
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { ...base, e: -minX, f: -minY + ISOMETRIC_RELIEF_MARGIN, width: maxX - minX, height: maxY - minY + ISOMETRIC_RELIEF_MARGIN };
}

function projectPoint(x: number, y: number, transform: ProjectionTransform) {
  return { x: transform.a * x + transform.c * y + transform.e, y: transform.b * x + transform.d * y + transform.f };
}

function unprojectPoint(x: number, y: number, transform: ProjectionTransform) {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  const shiftedX = x - transform.e;
  const shiftedY = y - transform.f;
  return {
    x: (transform.d * shiftedX - transform.c * shiftedY) / determinant,
    y: (-transform.b * shiftedX + transform.a * shiftedY) / determinant,
  };
}

function liftPoint(x: number, y: number, height: number, transform: ProjectionTransform) {
  if (!height) return { x, y };
  const determinant = transform.a * transform.d - transform.b * transform.c;
  return {
    x: x + (transform.c * height) / determinant,
    y: y - (transform.a * height) / determinant,
  };
}

function tileReliefHeight(tile: Civ5Tile, showElevation: boolean, isometric: boolean) {
  if (!isometric || !showElevation || tile.terrain < 2) return 0;
  return tile.elevation === 2 ? 24 : tile.elevation === 1 ? 10 : 0;
}

function tileCenter(col: number, row: number, sourceRow = row) {
  return {
    x: MAP_MARGIN + HEX_WIDTH / 2 + HEX_WIDTH * (col + (sourceRow % 2 ? 0.5 : 0)),
    y: MAP_MARGIN + HEX_RADIUS + row * HEX_RADIUS * 1.5,
  };
}

function tileAtDisplayPosition(map: Civ5Map, col: number, row: number) {
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return null;
  const sourceRow = map.height - 1 - row;
  return map.tiles[sourceRow * map.width + col] ?? null;
}

function hexPath(context: CanvasRenderingContext2D, x: number, y: number) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    const px = x + HEX_RADIUS * Math.cos(angle);
    const py = y + HEX_RADIUS * Math.sin(angle);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function hexPoints(x: number, y: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
  });
}

function polygonPath(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

function drawIsometricSidewalls(
  context: CanvasRenderingContext2D,
  baseCenter: { x: number; y: number },
  topCenter: { x: number; y: number },
  color: string,
  projection: ProjectionTransform,
) {
  const base = hexPoints(baseCenter.x, baseCenter.y);
  const top = hexPoints(topCenter.x, topCenter.y);
  const projectedCenter = projectPoint(topCenter.x, topCenter.y, projection);
  const visibleEdges = Array.from({ length: 6 }, (_, index) => index).filter((index) => {
    const next = (index + 1) % 6;
    const midpoint = projectPoint((top[index].x + top[next].x) / 2, (top[index].y + top[next].y) / 2, projection);
    return midpoint.y >= projectedCenter.y - 0.1;
  });
  for (const index of visibleEdges) {
    const next = (index + 1) % 6;
    const midpoint = projectPoint((top[index].x + top[next].x) / 2, (top[index].y + top[next].y) / 2, projection);
    context.fillStyle = shade(color, midpoint.x < projectPoint(topCenter.x, topCenter.y, projection).x ? -55 : -38);
    polygonPath(context, [top[index], top[next], base[next], base[index]]);
    context.fill();
    context.strokeStyle = "rgba(5, 17, 20, .24)";
    context.lineWidth = 0.75;
    context.stroke();
  }
}

function drawIsometricRelief(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  elevation: number,
  projection: ProjectionTransform,
) {
  if (elevation <= 0) return;
  const peak = liftPoint(center.x, center.y - 1, elevation === 2 ? 19 : 6, projection);
  const left = { x: center.x - (elevation === 2 ? 10 : 8), y: center.y + 7 };
  const right = { x: center.x + (elevation === 2 ? 11 : 9), y: center.y + 7 };
  const back = { x: center.x, y: center.y - (elevation === 2 ? 8 : 5) };
  context.save();
  context.fillStyle = elevation === 2 ? "rgba(53, 55, 51, .94)" : "rgba(72, 69, 53, .55)";
  polygonPath(context, [back, peak, left]);
  context.fill();
  context.fillStyle = elevation === 2 ? "rgba(126, 122, 107, .96)" : "rgba(133, 119, 75, .48)";
  polygonPath(context, [back, right, peak]);
  context.fill();
  context.fillStyle = elevation === 2 ? "rgba(91, 88, 76, .96)" : "rgba(101, 91, 63, .45)";
  polygonPath(context, [left, peak, right]);
  context.fill();
  if (elevation === 2) {
    const snowLeft = { x: peak.x + (left.x - peak.x) * 0.3, y: peak.y + (left.y - peak.y) * 0.3 };
    const snowRight = { x: peak.x + (right.x - peak.x) * 0.3, y: peak.y + (right.y - peak.y) * 0.3 };
    context.fillStyle = "rgba(235, 235, 220, .9)";
    polygonPath(context, [peak, snowLeft, snowRight]);
    context.fill();
  }
  context.restore();
}

function resourceColor(resource: string) {
  if (resource.includes("GOLD")) return "#f4cf5d";
  if (resource.includes("IRON")) return "#83909a";
  if (resource.includes("FISH")) return "#72b5d1";
  if (resource.includes("WHEAT")) return "#e8bd63";
  if (resource.includes("DEER")) return "#a8764d";
  return "#e8d7a3";
}

function drawFeature(context: CanvasRenderingContext2D, name: string, x: number, y: number) {
  context.save();
  if (name.includes("FOREST")) {
    context.fillStyle = "rgba(25, 65, 43, .74)";
    for (const dx of [-7, 0, 7]) {
      context.beginPath();
      context.moveTo(x + dx, y - 9);
      context.lineTo(x + dx - 5, y + 4);
      context.lineTo(x + dx + 5, y + 4);
      context.closePath();
      context.fill();
    }
  } else if (name.includes("JUNGLE")) {
    context.fillStyle = "rgba(22, 83, 52, .78)";
    for (const [dx, dy] of [[-6, -3], [2, -5], [7, 2], [-3, 5]]) {
      context.beginPath();
      context.arc(x + dx, y + dy, 5, 0, Math.PI * 2);
      context.fill();
    }
  } else if (name.includes("MARSH")) {
    context.strokeStyle = "rgba(43, 82, 65, .9)";
    context.lineWidth = 1.7;
    for (const dx of [-7, 0, 7]) {
      context.beginPath();
      context.moveTo(x + dx, y + 7);
      context.quadraticCurveTo(x + dx - 3, y, x + dx + 1, y - 7);
      context.stroke();
    }
  } else if (name.includes("ICE")) {
    context.fillStyle = "rgba(232, 244, 242, .72)";
    context.beginPath();
    context.moveTo(x - 11, y + 6);
    context.lineTo(x - 4, y - 9);
    context.lineTo(x + 1, y - 2);
    context.lineTo(x + 7, y - 10);
    context.lineTo(x + 12, y + 6);
    context.closePath();
    context.fill();
  } else if (name.includes("FALLOUT")) {
    context.fillStyle = "rgba(109, 126, 55, .42)";
    context.strokeStyle = "rgba(179, 202, 93, .9)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(x, y, 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "rgba(37, 48, 28, .9)";
    for (let part = 0; part < 3; part += 1) {
      const angle = -Math.PI / 2 + part * Math.PI * 2 / 3;
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * 2, y + Math.sin(angle) * 2);
      context.lineTo(x + Math.cos(angle - 0.38) * 7, y + Math.sin(angle - 0.38) * 7);
      context.lineTo(x + Math.cos(angle + 0.38) * 7, y + Math.sin(angle + 0.38) * 7);
      context.closePath();
      context.fill();
    }
    context.beginPath();
    context.arc(x, y, 1.7, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawMapContent(context: CanvasRenderingContext2D, tile: Civ5Tile, x: number, y: number) {
  if (tile.wonder !== 255) {
    context.save();
    context.fillStyle = "#f2d17f";
    context.strokeStyle = "rgba(20, 35, 34, .9)";
    context.lineWidth = 1.5;
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 ? 4 : 9;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!point) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }
  if (tile.improvement === "IMPROVEMENT_BARBARIAN_CAMP") {
    context.save();
    context.fillStyle = "rgba(76, 39, 33, .94)";
    context.strokeStyle = "#d28468";
    context.lineWidth = 1.8;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(x - 4, y - 4);
    context.lineTo(x + 4, y + 4);
    context.moveTo(x + 4, y - 4);
    context.lineTo(x - 4, y + 4);
    context.stroke();
    context.restore();
  } else if (tile.improvement === "IMPROVEMENT_GOODY_HUT") {
    context.save();
    context.fillStyle = "#d8c08a";
    context.strokeStyle = "#4d493a";
    context.lineWidth = 1.4;
    context.fillRect(x - 5, y - 3, 10, 8);
    context.strokeRect(x - 5, y - 3, 10, 8);
    context.beginPath();
    context.moveTo(x - 7, y - 3);
    context.lineTo(x, y - 9);
    context.lineTo(x + 7, y - 3);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  } else if (tile.improvement === "IMPROVEMENT_CITY_RUINS") {
    context.save();
    context.fillStyle = "rgba(70, 65, 57, .96)";
    context.strokeStyle = "#b09d79";
    context.lineWidth = 1.35;
    context.fillRect(x - 8, y - 2, 6, 8);
    context.strokeRect(x - 8, y - 2, 6, 8);
    context.fillRect(x + 1, y - 7, 7, 13);
    context.strokeRect(x + 1, y - 7, 7, 13);
    context.beginPath();
    context.moveTo(x - 9, y - 2);
    context.lineTo(x - 5, y - 7);
    context.lineTo(x - 1, y - 2);
    context.moveTo(x, y - 7);
    context.lineTo(x + 4, y - 11);
    context.lineTo(x + 9, y - 7);
    context.stroke();
    context.restore();
  }
}

function drawRoad(
  context: CanvasRenderingContext2D,
  map: Civ5Map,
  col: number,
  row: number,
  center: { x: number; y: number },
  showElevation: boolean,
  projection: ProjectionTransform,
) {
  const sourceRow = map.height - 1 - row;
  const offsets = sourceRow % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const connections: Array<{ x: number; y: number }> = [];
  for (const [dx, dy] of offsets) {
    let nextX = col + dx;
    const nextY = sourceRow + dy;
    if (map.wraps) nextX = (nextX + map.width) % map.width;
    if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height || Math.abs(nextX - col) > 1) continue;
    const nextTile = map.tiles[nextY * map.width + nextX];
    if (!nextTile?.route) continue;
    const nextDisplayRow = map.height - 1 - nextY;
    const base = tileCenter(nextX, nextDisplayRow, nextY);
    const isometric = projection.b !== 0;
    connections.push(liftPoint(base.x, base.y, tileReliefHeight(nextTile, showElevation, isometric), projection));
  }
  context.save();
  context.lineCap = "round";
  for (const pass of [{ color: "rgba(37, 31, 27, .78)", width: 5.2 }, { color: "rgba(181, 151, 103, .9)", width: 2.3 }]) {
    context.strokeStyle = pass.color;
    context.lineWidth = pass.width;
    context.beginPath();
    if (!connections.length) {
      context.moveTo(center.x - 7, center.y + 2);
      context.lineTo(center.x + 7, center.y - 2);
    } else {
      for (const next of connections) {
        context.moveTo(center.x, center.y);
        context.lineTo((center.x + next.x) / 2, (center.y + next.y) / 2);
      }
    }
    context.stroke();
  }
  context.restore();
}

function drawRiver(context: CanvasRenderingContext2D, river: number, x: number, y: number) {
  if (!(river & 7)) return;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
  });
  const edges = [
    [1, 2, 1], // plot is west of the river: east edge
    [2, 3, 2], // plot is northwest of the river: southeast edge
    [3, 4, 4], // plot is northeast of the river: southwest edge
  ];
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const pass of [
    { color: "rgba(7, 31, 39, .58)", width: 4.4 },
    { color: "rgba(91, 185, 211, .94)", width: 2.35 },
    { color: "rgba(184, 230, 233, .45)", width: 0.7 },
  ]) {
    context.strokeStyle = pass.color;
    context.lineWidth = pass.width;
    context.beginPath();
    for (const [start, end, bit] of edges) {
      if (!(river & bit)) continue;
      const one = points[start];
      const two = points[end];
      const middleX = (one.x + two.x) / 2;
      const middleY = (one.y + two.y) / 2;
      context.moveTo(one.x, one.y);
      context.quadraticCurveTo(middleX + (x - middleX) * 0.14, middleY + (y - middleY) * 0.14, two.x, two.y);
    }
    context.stroke();
  }
  context.restore();
}

function drawStartLocations(
  context: CanvasRenderingContext2D,
  map: Civ5Map,
  view: View,
  showMajors: boolean,
  showCityStates: boolean,
  showElevation: boolean,
  projection: ProjectionTransform,
) {
  const scale = Math.max(view.zoom, 0.35);
  const radius = 9 / scale;
  const isometric = projection.b !== 0;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const start of map.startLocations) {
    if (start.cityState ? !showCityStates : !showMajors) continue;
    const displayRow = map.height - 1 - start.y;
    const baseCenter = tileCenter(start.x, displayRow, start.y);
    const tile = map.tiles[start.y * map.width + start.x];
    const center = liftPoint(baseCenter.x, baseCenter.y, tile ? tileReliefHeight(tile, showElevation, isometric) + (isometric ? 5 : 0) : 0, projection);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = start.cityState ? "#7cb5c3" : "#f0ce79";
    context.fill();
    context.strokeStyle = "rgba(8, 24, 27, .92)";
    context.lineWidth = 2.4 / scale;
    context.stroke();
    context.fillStyle = "#173036";
    context.font = `700 ${10 / scale}px "Geist Mono", monospace`;
    context.fillText(start.cityState ? "CS" : String(start.player + 1), center.x, center.y + 0.5 / scale);
  }

  context.restore();
}

function drawPoliticalBorders(
  context: CanvasRenderingContext2D,
  map: Civ5Map,
  col: number,
  sourceRow: number,
  center: { x: number; y: number },
  owner: number,
  ownership: Int16Array,
) {
  if (owner < 0) return;
  const offsets = sourceRow % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const points = hexPoints(center.x, center.y);
  const border = politicalColors(map, owner).border;
  const edges: Array<[number, number]> = [];

  for (const [dx, dy] of offsets) {
    let nextX = col + dx;
    const nextY = sourceRow + dy;
    if (map.wraps) nextX = (nextX + map.width) % map.width;
    const inBounds = nextX >= 0 && nextX < map.width && nextY >= 0 && nextY < map.height && Math.abs(nextX - col) <= 1;
    if (inBounds && ownership[nextY * map.width + nextX] === owner) continue;

    const nextDisplayRow = map.height - 1 - nextY;
    const neighborCenter = tileCenter(col + dx, nextDisplayRow, nextY);
    const directionX = neighborCenter.x - tileCenter(col, map.height - 1 - sourceRow, sourceRow).x;
    const directionY = neighborCenter.y - tileCenter(col, map.height - 1 - sourceRow, sourceRow).y;
    let bestEdge: [number, number] = [0, 1];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < 6; index += 1) {
      const next = (index + 1) % 6;
      const middleX = (points[index].x + points[next].x) / 2 - center.x;
      const middleY = (points[index].y + points[next].y) / 2 - center.y;
      const score = middleX * directionX + middleY * directionY;
      if (score > bestScore) {
        bestScore = score;
        bestEdge = [index, next];
      }
    }
    if (!edges.some(([one, two]) => one === bestEdge[0] && two === bestEdge[1])) edges.push(bestEdge);
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const pass of [{ color: "rgba(9, 20, 22, .82)", width: 4.8 }, { color: border, width: 2.3 }]) {
    context.strokeStyle = pass.color;
    context.lineWidth = pass.width;
    context.beginPath();
    for (const [one, two] of edges) {
      context.moveTo(points[one].x, points[one].y);
      context.lineTo(points[two].x, points[two].y);
    }
    context.stroke();
  }
  context.restore();
}

function drawPoliticalCities(
  context: CanvasRenderingContext2D,
  map: Civ5Map,
  ownership: Int16Array,
  showElevation: boolean,
  projection: ProjectionTransform,
) {
  if (!map.cities?.length) return;
  const isometric = projection.b !== 0;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "bottom";
  for (const city of map.cities) {
    if (city.x < 0 || city.y < 0 || city.x >= map.width || city.y >= map.height) continue;
    const tileIndex = city.y * map.width + city.x;
    const owner = city.owner === 255 ? ownership[tileIndex] : city.owner;
    const colors = politicalColors(map, owner);
    const displayRow = map.height - 1 - city.y;
    const base = tileCenter(city.x, displayRow, city.y);
    const center = liftPoint(base.x, base.y, tileReliefHeight(map.tiles[tileIndex], showElevation, isometric) + (isometric ? 5 : 0), projection);
    context.fillStyle = colors.city;
    context.strokeStyle = "rgba(8, 20, 22, .92)";
    context.lineWidth = 1.8;
    context.fillRect(center.x - 5, center.y - 5, 10, 10);
    context.strokeRect(center.x - 5, center.y - 5, 10, 10);
    context.font = '700 7px "Geist Mono", monospace';
    context.lineWidth = 2.8;
    context.strokeStyle = "rgba(8, 20, 22, .9)";
    context.strokeText(city.name, center.x, center.y - 8);
    context.fillStyle = "#edf0e9";
    context.fillText(city.name, center.x, center.y - 8);
  }
  context.restore();
}

function drawMap(
  context: CanvasRenderingContext2D,
  map: Civ5Map,
  layers: Layers,
  hovered: HoveredTile,
  view: View,
  size: Size,
  pixelRatio: number,
  projection: ProjectionTransform,
  selection: TileSelection | null,
  focusedStart: Civ5StartLocation | null,
  highlightedRepairs: ReadonlySet<number>,
  protectedTiles: ReadonlySet<number>,
  politicalOwnership: Int16Array,
  transparentBackground = false,
) {
  let paintedTiles = 0;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  if (!transparentBackground) {
    context.fillStyle = "#10242b";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.save();
  context.translate(view.x, view.y);
  context.scale(view.zoom, view.zoom);
  context.transform(projection.a, projection.b, projection.c, projection.d, projection.e, projection.f);
  const isometric = projection.b !== 0;
  const strategicRoles = new Uint8Array(map.tiles.length);
  const strategicProtected = new Uint8Array(map.tiles.length);
  if (layers.strategy && map.structure?.strategicGraph) {
    for (const object of map.structure.objects) {
      if (object.kind !== "STRATEGIC_REGION") continue;
      const role = object.attributes?.role === "OBJECTIVE" ? 3 : object.attributes?.role === "CONTESTED" ? 2 : object.attributes?.role === "SAFE" ? 1 : 0;
      for (const index of object.tileIndices) if (index >= 0 && index < strategicRoles.length) strategicRoles[index] = Math.max(strategicRoles[index], role);
    }
    for (const index of map.structure.strategicGraph.protectedTileIndices) if (index >= 0 && index < strategicProtected.length) strategicProtected[index] = 1;
  }
  const renderOrder: Array<{
    row: number;
    col: number;
    tile: Civ5Tile;
    baseCenter: { x: number; y: number };
    center: { x: number; y: number };
    projected: { x: number; y: number };
  }> = [];
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const tile = tileAtDisplayPosition(map, col, row);
      if (!tile) continue;
      const baseCenter = tileCenter(col, row, map.height - 1 - row);
      const center = liftPoint(baseCenter.x, baseCenter.y, tileReliefHeight(tile, layers.elevation, isometric), projection);
      const projected = projectPoint(center.x, center.y, projection);
      renderOrder.push({ row, col, tile, baseCenter, center, projected });
    }
  }
  if (isometric) renderOrder.sort((one, two) => one.projected.y - two.projected.y || one.projected.x - two.projected.x);

  for (const { row, col, tile, baseCenter, center, projected } of renderOrder) {
      const screenX = view.x + projected.x * view.zoom;
      const screenY = view.y + projected.y * view.zoom;
      if (screenX < -70 || screenY < -70 || screenX > size.width + 70 || screenY > size.height + 70) continue;

      const sourceY = map.height - 1 - row;
      const sourceIndex = sourceY * map.width + col;
      const terrainName = map.terrains[tile.terrain] ?? "";
      const isWater = terrainName.includes("OCEAN") || terrainName.includes("COAST");
      const owner = layers.political ? politicalOwnership[sourceIndex] : -1;
      const base = owner >= 0 && !isWater ? politicalColors(map, owner).fill : terrainColor(terrainName);
      const reliefHeight = tileReliefHeight(tile, layers.elevation, isometric);
      if (reliefHeight) drawIsometricSidewalls(context, baseCenter, center, base, projection);
      context.fillStyle = isometric && reliefHeight
        ? shade(base, tile.elevation === 2 ? -12 : -5)
        : layers.elevation && tile.elevation === 2 ? shade(base, -34) : layers.elevation && tile.elevation === 1 ? shade(base, -15) : base;
      hexPath(context, center.x, center.y);
      context.fill();
      paintedTiles += 1;

      if (layers.strategy && map.structure?.strategicGraph && !isWater && (strategicRoles[sourceIndex] || strategicProtected[sourceIndex])) {
        hexPath(context, center.x, center.y);
        context.fillStyle = strategicRoles[sourceIndex] === 3
          ? "rgba(241, 209, 131, .34)"
          : strategicRoles[sourceIndex] === 2
            ? "rgba(219, 153, 83, .24)"
            : strategicRoles[sourceIndex] === 1
              ? "rgba(95, 191, 185, .16)"
              : "rgba(112, 167, 164, .12)";
        context.fill();
      }

      if (layers.grid) {
        context.strokeStyle = "rgba(6, 22, 25, .34)";
        context.lineWidth = 1 / Math.max(view.zoom, 0.55);
        context.stroke();
      }

      if (layers.features && tile.route) drawRoad(context, map, col, row, center, layers.elevation, projection);
      if (layers.features && tile.feature !== 255) {
        drawFeature(context, map.features[tile.feature] ?? "", center.x, center.y);
      }
      if (layers.features && (tile.wonder !== 255 || tile.improvement)) drawMapContent(context, tile, center.x, center.y);

      if (layers.elevation && tile.elevation > 0) {
        if (isometric) drawIsometricRelief(context, center, tile.elevation, projection);
        else {
          context.fillStyle = tile.elevation === 2 ? "rgba(238, 232, 213, .76)" : "rgba(64, 55, 41, .5)";
          context.beginPath();
          context.moveTo(center.x - 7, center.y + 7);
          context.lineTo(center.x, center.y - (tile.elevation === 2 ? 10 : 6));
          context.lineTo(center.x + 8, center.y + 7);
          context.closePath();
          context.fill();
        }
      }

      drawRiver(context, tile.river, center.x, center.y);

      if (layers.resources && tile.resource !== 255) {
        const resource = map.resources[tile.resource] ?? "RESOURCE";
        context.fillStyle = "rgba(13, 26, 27, .82)";
        context.beginPath();
        context.arc(center.x, center.y, 6.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = resourceColor(resource);
        context.beginPath();
        context.arc(center.x, center.y, 3.8, 0, Math.PI * 2);
        context.fill();
      }

      if (layers.political && owner >= 0) drawPoliticalBorders(context, map, col, sourceY, center, owner, politicalOwnership);

      if (hovered?.col === col && hovered.row === row) {
        hexPath(context, center.x, center.y);
        context.strokeStyle = "#f1d183";
        context.lineWidth = 2.8 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
      if (selection && col >= selection.minX && col <= selection.maxX && sourceY >= selection.minY && sourceY <= selection.maxY) {
        hexPath(context, center.x, center.y);
        context.fillStyle = "rgba(94, 198, 205, .18)";
        context.fill();
        context.strokeStyle = "rgba(126, 220, 220, .82)";
        context.lineWidth = 1.6 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
      if (highlightedRepairs.has(sourceIndex)) {
        hexPath(context, center.x, center.y);
        context.fillStyle = "rgba(222, 119, 78, .34)";
        context.fill();
        context.strokeStyle = "#efb06f";
        context.lineWidth = 2.1 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
      if (protectedTiles.has(sourceIndex)) {
        hexPath(context, center.x, center.y);
        context.fillStyle = "rgba(128, 112, 214, .22)";
        context.fill();
        context.strokeStyle = "rgba(183, 171, 255, .9)";
        context.lineWidth = 1.45 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
  }
  if (layers.strategy && map.structure?.strategicGraph) {
    context.save();
    for (const edge of map.structure.strategicGraph.edges) {
      context.beginPath();
      edge.tileIndices.forEach((index, pathIndex) => {
        const sourceX = index % map.width;
        const sourceY = Math.floor(index / map.width);
        const displayRow = map.height - 1 - sourceY;
        const baseCenter = tileCenter(sourceX, displayRow, sourceY);
        const tile = map.tiles[index];
        const center = liftPoint(baseCenter.x, baseCenter.y, tile ? tileReliefHeight(tile, layers.elevation, isometric) : 0, projection);
        if (pathIndex === 0) context.moveTo(center.x, center.y);
        else context.lineTo(center.x, center.y);
      });
      context.strokeStyle = edge.kind === "NAVAL" ? "rgba(108, 196, 219, .9)" : edge.kind === "PASS" ? "rgba(239, 188, 94, .9)" : "rgba(126, 216, 216, .78)";
      context.lineWidth = (edge.kind === "LAND_BRIDGE" ? 3 : 2) / Math.max(view.zoom, 0.55);
      context.setLineDash(edge.kind === "NAVAL" ? [8 / Math.max(view.zoom, 0.55), 6 / Math.max(view.zoom, 0.55)] : []);
      context.stroke();
    }
    context.setLineDash([]);
    context.restore();
  }
  if (layers.political) drawPoliticalCities(context, map, politicalOwnership, layers.elevation, projection);
  if ((layers.starts || layers.cityStates) && map.startLocations.length) {
    drawStartLocations(context, map, view, layers.starts, layers.cityStates, layers.elevation, projection);
  }
  if (focusedStart) {
    const displayRow = map.height - 1 - focusedStart.y;
    const baseCenter = tileCenter(focusedStart.x, displayRow, focusedStart.y);
    const tile = map.tiles[focusedStart.y * map.width + focusedStart.x];
    const center = liftPoint(baseCenter.x, baseCenter.y, tile ? tileReliefHeight(tile, layers.elevation, isometric) : 0, projection);
    context.beginPath();
    context.arc(center.x, center.y, 15 / Math.max(view.zoom, 0.4), 0, Math.PI * 2);
    context.strokeStyle = "#7ed8d8";
    context.lineWidth = 2.5 / Math.max(view.zoom, 0.5);
    context.stroke();
  }
  context.restore();
  return paintedTiles;
}

function closestTile(map: Civ5Map, worldX: number, worldY: number): HoveredTile {
  const estimatedRow = Math.round((worldY - MAP_MARGIN - HEX_RADIUS) / (HEX_RADIUS * 1.5));
  let closest: HoveredTile = null;
  let distance = Number.POSITIVE_INFINITY;
  for (let row = estimatedRow - 1; row <= estimatedRow + 1; row += 1) {
    const sourceRow = map.height - 1 - row;
    const estimatedCol = Math.round((worldX - MAP_MARGIN - HEX_WIDTH / 2) / HEX_WIDTH - (sourceRow % 2 ? 0.5 : 0));
    for (let col = estimatedCol - 1; col <= estimatedCol + 1; col += 1) {
      const tile = tileAtDisplayPosition(map, col, row);
      if (!tile) continue;
      const center = tileCenter(col, row, sourceRow);
      const candidate = Math.hypot(center.x - worldX, center.y - worldY);
      if (candidate < distance && candidate <= HEX_RADIUS) {
        closest = { tile, col, row };
        distance = candidate;
      }
    }
  }
  return closest;
}

function closestIsometricTile(
  map: Civ5Map,
  projectedX: number,
  projectedY: number,
  projection: ProjectionTransform,
  showElevation: boolean,
): HoveredTile {
  const world = unprojectPoint(projectedX, projectedY, projection);
  const estimatedRow = Math.round((world.y - MAP_MARGIN - HEX_RADIUS) / (HEX_RADIUS * 1.5));
  let closest: HoveredTile = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let row = estimatedRow - 4; row <= estimatedRow + 4; row += 1) {
    const sourceRow = map.height - 1 - row;
    const estimatedCol = Math.round((world.x - MAP_MARGIN - HEX_WIDTH / 2) / HEX_WIDTH - (sourceRow % 2 ? 0.5 : 0));
    for (let col = estimatedCol - 4; col <= estimatedCol + 4; col += 1) {
      const tile = tileAtDisplayPosition(map, col, row);
      if (!tile) continue;
      const baseCenter = tileCenter(col, row, sourceRow);
      const height = tileReliefHeight(tile, showElevation, true);
      const topCenter = liftPoint(baseCenter.x, baseCenter.y, height, projection);
      const projectedTop = projectPoint(topCenter.x, topCenter.y, projection);
      const projectedBase = projectPoint(baseCenter.x, baseCenter.y, projection);
      const dx = projectedX - projectedTop.x;
      const dy = projectedY - projectedTop.y;
      const topScore = Math.abs(dx) / 22 + Math.abs(dy) / 13;
      const onTop = topScore <= 1.15;
      const onSide = height > 0 && Math.abs(dx) <= 20 && projectedY >= projectedTop.y && projectedY <= projectedBase.y + 11;
      if (!onTop && !onSide) continue;
      const score = onTop ? topScore : 1.2 + Math.abs(dx) / 22 + (projectedY - projectedTop.y) / Math.max(1, height) * 0.2;
      if (score < bestScore) {
        bestScore = score;
        closest = { tile, col, row };
      }
    }
  }
  return closest;
}

function editorNeighbors(x: number, y: number, width: number, height: number, wraps: boolean) {
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

function editorArea(x: number, y: number, radius: number, width: number, height: number, wraps: boolean) {
  const result: Array<[number, number]> = [[x, y]];
  const seen = new Set([`${x},${y}`]);
  let frontier: Array<[number, number]> = [[x, y]];
  for (let distance = 0; distance < radius; distance += 1) {
    const next: Array<[number, number]> = [];
    for (const point of frontier) {
      for (const neighbor of editorNeighbors(point[0], point[1], width, height, wraps)) {
        const key = `${neighbor[0]},${neighbor[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return result;
}

function paintedTile(source: Civ5Tile, brush: Brush) {
  const tile = { ...source };
  if (brush.terrain !== null) tile.terrain = brush.terrain;
  if (brush.elevation !== null) tile.elevation = brush.elevation;
  if (brush.feature !== null) tile.feature = brush.feature;
  if (brush.resource !== null) {
    tile.resource = brush.resource;
    tile.resourceAmount = brush.resource === 255 ? 0 : Math.max(1, tile.resourceAmount);
  }
  return tile;
}

export function Civ5MapViewer() {
  const [map, setMap] = useState<Civ5Map>(() => createDemoMap());
  const [pastMaps, setPastMaps] = useState<Civ5Map[]>([]);
  const [futureMaps, setFutureMaps] = useState<Civ5Map[]>([]);
  const [sourceFile, setSourceFile] = useState<ImportedMapSource | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>("VIEW");
  const [labStage, setLabStage] = useState<LabStage>("REVIEW");
  const [labSession, setLabSession] = useState<ContinuousIdentityLabSession | null>(null);
  const [labLegacyArchive, setLabLegacyArchive] = useState<LegacyIdentityLabSession | null>(null);
  const [labMap, setLabMap] = useState<Civ5Map | null>(null);
  const [labActiveCandidateId, setLabActiveCandidateId] = useState<string | null>(null);
  const [labLoading, setLabLoading] = useState(false);
  const [labPrefetching, setLabPrefetching] = useState(false);
  const [labPrefetchedTrialId, setLabPrefetchedTrialId] = useState<string | null>(null);
  const [labStatus, setLabStatus] = useState("Start or import a blind-recognition session.");
  const [labStorageReady, setLabStorageReady] = useState(false);
  const [labStyle, setLabStyle] = useState<MapGenerationOptions["style"]>("MUNDANE");
  const [labSize, setLabSize] = useState<MapGenerationOptions["size"]>("STANDARD");
  const [labSessionSeed, setLabSessionSeed] = useState("baseline-1");
  const [labSelectedChoice, setLabSelectedChoice] = useState<MapGenerationOptions["preset"] | "">("");
  const [projectName, setProjectName] = useState("The Twin Continents Project");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectDirty, setProjectDirty] = useState(false);
  const [projectLastSavedAt, setProjectLastSavedAt] = useState<string | null>(null);
  const [projectHistoryPolicy, setProjectHistoryPolicy] = useState<ProjectHistoryPolicy>("FULL");
  const [showProjectSaveDialog, setShowProjectSaveDialog] = useState(false);
  const [projectScenario, setProjectScenario] = useState<ScenarioDraft | null>(null);
  const [scenarioStage, setScenarioStage] = useState<ScenarioStage>("SETUP");
  const [selectedScenarioFactionId, setSelectedScenarioFactionId] = useState("");
  const [scenarioPlacementFactionId, setScenarioPlacementFactionId] = useState("");
  const [showScenarioExportConfirmation, setShowScenarioExportConfirmation] = useState(false);
  const [scenarioExportPreflightError, setScenarioExportPreflightError] = useState("");
  const [projectExtensions, setProjectExtensions] = useState<Record<string, unknown> | undefined>(undefined);
  const [projectOpaqueFields, setProjectOpaqueFields] = useState<Record<string, unknown>>({});
  const [projectSourceManifest, setProjectSourceManifest] = useState<ProjectManifest | null>(null);
  const [generationOptions, setGenerationOptions] = useState<MapGenerationOptions>(DEFAULT_GENERATION_OPTIONS);
  const [generationScale, setGenerationScale] = useState<WorldScale>("GLOBAL");
  const [generationArchetype, setGenerationArchetype] = useState<WorldArchetype>("NARRATIVE_DEFAULT");
  const [generationArchetypeIntensity, setGenerationArchetypeIntensity] = useState<ArchetypeIntensity>("STRONG");
  const [generationEffort, setGenerationEffort] = useState<GenerationEffort>("STANDARD");
  const [matchIntent, setMatchIntent] = useState<MatchIntent>(() => generationRecipeFromOptions(DEFAULT_GENERATION_OPTIONS).matchIntent);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
  const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [createOperationError, setCreateOperationError] = useState("");
  const [createView, setCreateView] = useState<CreateStage>("GENERATE");
  const [createDisclosureState, setCreateDisclosureState] = useState<Record<CreateStage, Record<string, boolean>>>({ GENERATE: {}, REFINE: {}, ITERATE: {}, EDIT: {}, ANALYZE: {} });
  const [brush, setBrush] = useState<Brush>({ terrain: 2, elevation: 0, feature: null, resource: null });
  const [editTool, setEditTool] = useState<"TILE" | "FILL" | "SELECT" | "START" | "STRUCTURE" | "PRESERVE">("TILE");
  const [brushSize, setBrushSize] = useState(1);
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [tileClipboard, setTileClipboard] = useState<TileClipboard | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [structureOperation, setStructureOperation] = useState<StructureOperation>("RAISE_PLATE");
  const [structureStrength, setStructureStrength] = useState<1 | 2 | 3>(2);
  const [protectionState, setProtectionState] = useState<ProtectionState>(() => emptyProtectionState());
  const [pastProtectionStates, setPastProtectionStates] = useState<ProtectionState[]>([]);
  const [futureProtectionStates, setFutureProtectionStates] = useState<ProtectionState[]>([]);
  const [preserveChannels, setPreserveChannels] = useState<Set<ProtectionChannel>>(() => new Set(["TOPOLOGY", "ELEVATION", "CLIMATE", "FEATURES", "HYDROLOGY", "CONTENT"]));
  const [semanticProtectionId, setSemanticProtectionId] = useState("");
  const [semanticProtectionPolicy, setSemanticProtectionPolicy] = useState<"EXACT" | "SHAPE" | "FUNCTION" | "RELATIONSHIP">("FUNCTION");
  const [semanticProtectionHard, setSemanticProtectionHard] = useState(true);
  const [showProtectionOverlay, setShowProtectionOverlay] = useState(true);
  const [protectionRegionName, setProtectionRegionName] = useState("Protected region");
  const [batchCount, setBatchCount] = useState(8);
  const [batchCandidates, setBatchCandidates] = useState<BatchCandidate[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchRunning, setBatchRunning] = useState(false);
  const [checkpoints, setCheckpoints] = useState<MapCheckpoint[]>([]);
  const [checkpointName, setCheckpointName] = useState("");
  const [comparisonCheckpointId, setComparisonCheckpointId] = useState<number | null>(null);
  const [comparisonView, setComparisonView] = useState<"CURRENT" | "CHECKPOINT" | "DIFFERENCE">("CURRENT");
  const [focusedStart, setFocusedStart] = useState<Civ5StartLocation | null>(null);
  const [showExportValidation, setShowExportValidation] = useState(false);
  const [archetypePreviewMap, setArchetypePreviewMap] = useState<Civ5Map | null>(null);
  const [archetypePreviewView, setArchetypePreviewView] = useState<ArchetypePreviewView>("DIFFERENCE");
  const [allowGameBreakingGeometry, setAllowGameBreakingGeometry] = useState(false);
  const [showGameBreakingGeometryConfirmation, setShowGameBreakingGeometryConfirmation] = useState(false);
  const [showLuaExperimentalWarning, setShowLuaExperimentalWarning] = useState(false);
  const [repairBaseline, setRepairBaseline] = useState<Civ5Map | null>(null);
  const [repairIssues, setRepairIssues] = useState<RepairIssue[]>([]);
  const [repairSelected, setRepairSelected] = useState<Set<string>>(new Set());
  const [repairProfile, setRepairProfile] = useState<RepairProfile>("STANDARD");
  const [repairView, setRepairView] = useState<RepairView>("CORRECTED");
  const [repairStage, setRepairStage] = useState<RepairStage>("INSPECT");
  const [repairDiagnostics, setRepairDiagnostics] = useState<string[]>([]);
  const [luaReport, setLuaReport] = useState<LuaCompatibilityReport | null>(null);
  const [luaFileName, setLuaFileName] = useState("");
  const [luaSource, setLuaSource] = useState("");
  const [luaDependencies, setLuaDependencies] = useState<LuaProjectDependency[]>([]);
  const [luaPostProcess, setLuaPostProcess] = useState("");
  const [luaCustomOptions, setLuaCustomOptions] = useState<LuaScriptOption[]>([]);
  const [luaMetadata, setLuaMetadata] = useState<LuaRuntimeMetadata | null>(null);
  const [luaLogs, setLuaLogs] = useState<string[]>([]);
  const [luaIsRunning, setLuaIsRunning] = useState(false);
  const [luaRunStatus, setLuaRunStatus] = useState("");
  const [luaStage, setLuaStage] = useState<LuaStage>("SCRIPT");
  const [size, setSize] = useState<Size>({ width: 900, height: 620 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [layers, setLayers] = useState<Layers>({ political: false, strategy: false, grid: true, features: true, resources: true, elevation: true, starts: true, cityStates: true });
  const [showLegend, setShowLegend] = useState(false);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [uiTooltip, setUiTooltip] = useState<UiTooltip | null>(null);
  const [projection, setProjection] = useState<Projection>("FLAT");
  const [hovered, setHovered] = useState<HoveredTile>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [message, setMessage] = useState("Demo map loaded");
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const engineCarouselRef = useRef<HTMLDivElement>(null);
  const exportConfirmationCancelRef = useRef<HTMLButtonElement>(null);
  const archetypePreviewCancelRef = useRef<HTMLButtonElement>(null);
  const gameBreakingGeometryCancelRef = useRef<HTMLButtonElement>(null);
  const luaExperimentalCancelRef = useRef<HTMLButtonElement>(null);
  const scenarioExportCancelRef = useRef<HTMLButtonElement>(null);
  const repairSourceMapRef = useRef<Civ5Map | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const luaInputRef = useRef<HTMLInputElement>(null);
  const luaDependencyInputRef = useRef<HTMLInputElement>(null);
  const labInputRef = useRef<HTMLInputElement>(null);
  const labPrefetchRef = useRef<{ trialId: string; map: Civ5Map } | null>(null);
  const labOperationEpochRef = useRef(0);
  const projectSavedIntentRef = useRef<string | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const generationIdRef = useRef(0);
  const generationRequestIdRef = useRef(0);
  const generationWorkerRef = useRef<Worker | null>(null);
  const generationRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const regenerationIdRef = useRef(0);
  const checkpointIdRef = useRef(0);
  const mapRef = useRef(map);
  const createScrollPositionsRef = useRef<Record<CreateStage, number>>({ GENERATE: 0, REFINE: 0, ITERATE: 0, EDIT: 0, ANALYZE: 0 });
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const preserveDragRef = useRef<{ x: number; y: number } | null>(null);
  const projectIntentKey = useMemo(() => JSON.stringify({ generationOptions, generationScale, generationArchetype, generationArchetypeIntensity, generationEffort, matchIntent }), [generationOptions, generationScale, generationArchetype, generationArchetypeIntensity, generationEffort, matchIntent]);

  useEffect(() => {
    if (projectSavedIntentRef.current === null) {
      projectSavedIntentRef.current = projectIntentKey;
      return;
    }
    if (projectSavedIntentRef.current === projectIntentKey) return;
    const frame = window.requestAnimationFrame(() => setProjectDirty(true));
    return () => window.cancelAnimationFrame(frame);
  }, [projectIntentKey]);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (!projectDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => window.removeEventListener("beforeunload", warnIfUnsaved);
  }, [projectDirty]);

  useEffect(() => {
    if (!showProjectSaveDialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowProjectSaveDialog(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showProjectSaveDialog]);

  useLayoutEffect(() => {
    if (mode !== "CREATE" || createView !== "GENERATE" || !engineCarouselRef.current) return;
    const index = GENERATION_ENGINES.findIndex((item) => item.id === generationOptions.engine);
    const activeCard = engineCarouselRef.current.children[index] as HTMLElement | undefined;
    engineCarouselRef.current.scrollTo({ left: activeCard?.offsetLeft ?? index * engineCarouselRef.current.clientWidth, behavior: "smooth" });
  }, [createView, generationOptions.engine, mode]);

  useLayoutEffect(() => {
    if (mode !== "CREATE" || !sidebarRef.current) return;
    sidebarRef.current.scrollTop = createScrollPositionsRef.current[createView] ?? 0;
  }, [createView, mode]);

  useEffect(() => {
    const tooltipTarget = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>("[data-tooltip]") : null;
    const showTooltip = (target: HTMLElement) => {
      const text = target.dataset.tooltip?.trim();
      if (!text) return;
      const bounds = target.getBoundingClientRect();
      const above = bounds.bottom + 104 > window.innerHeight && bounds.top > 104;
      const halfWidth = Math.min(140, (window.innerWidth - 36) / 2);
      setUiTooltip({
        text,
        x: Math.max(18 + halfWidth, Math.min(window.innerWidth - 18 - halfWidth, bounds.left + bounds.width / 2)),
        y: above ? bounds.top - 9 : bounds.bottom + 9,
        above,
      });
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = tooltipTarget(event.target);
      if (target) showTooltip(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      const related = tooltipTarget(event.relatedTarget);
      if (!target || target === related) return;
      setUiTooltip(null);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target) showTooltip(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (tooltipTarget(event.target)) setUiTooltip(null);
    };
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(CONTINUOUS_IDENTITY_LAB_STORAGE_KEY);
        if (stored) {
          const restored = importIdentityLabEvidence(stored);
          if (isContinuousIdentityLabSession(restored)) {
            setLabSession(restored);
            setLabStage(restored.status === "ENDED" ? "RESULTS" : "REVIEW");
            setLabStatus(restored.status === "ENDED"
              ? `${restored.summary.trialsAnswered} completed blind trials restored from this device. Results remain available for export.`
              : `${restored.summary.trialsAnswered} continuous blind trials restored from this device. Generate the current trial to resume.`);
          }
        }
      } catch (error) {
        setLabStatus(error instanceof Error ? `Saved Lab session was not loaded: ${error.message}` : "Saved Lab session was not loaded.");
      } finally {
        setLabStorageReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!labStorageReady || !labSession) return;
    let warningFrame = 0;
    try {
      window.localStorage.setItem(CONTINUOUS_IDENTITY_LAB_STORAGE_KEY, exportIdentityLabEvidence(labSession));
    } catch {
      warningFrame = window.requestAnimationFrame(() => setLabStatus("This continuous session has outgrown device recovery storage. End and export remains the durable handoff."));
    }
    return () => window.cancelAnimationFrame(warningFrame);
  }, [labSession, labStorageReady]);

  const replaceMap = useCallback((next: Civ5Map, source: ImportedMapSource | null = null) => {
    mapRef.current = next;
    setMap(next);
    setPastMaps([]);
    setFutureMaps([]);
    setSourceFile(source);
    setHovered(null);
    setSelection(null);
    setSelectionAnchor(null);
    setFocusedStart(null);
    setActiveGenerationId(null);
    setProjectDirty(true);
  }, []);

  const generateMapAsync = useCallback((options: MapGenerationOptions, recipe?: GenerationRecipe) => new Promise<Civ5Map>((resolve, reject) => {
    generationWorkerRef.current?.terminate();
    generationRejectRef.current?.(new DOMException("Superseded by a new generation", "AbortError"));
    const worker = new Worker(new URL("./map-generation.worker.ts", import.meta.url), { type: "module" });
    const id = ++generationRequestIdRef.current;
    generationWorkerRef.current = worker;
    generationRejectRef.current = reject;
    setGenerationRunning(true);
    setGenerationStage(generationEngineStage(options.engine));
    worker.onmessage = (event: MessageEvent<GenerationWorkerMessage>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "PROGRESS") {
        setGenerationStage(event.data.stage);
        return;
      }
      worker.terminate();
      generationWorkerRef.current = null;
      generationRejectRef.current = null;
      setGenerationRunning(false);
      setGenerationStage("");
      if (event.data.type === "COMPLETE") resolve(event.data.map);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      generationWorkerRef.current = null;
      generationRejectRef.current = null;
      setGenerationRunning(false);
      setGenerationStage("");
      reject(new Error("The map-generation worker stopped unexpectedly."));
    };
    worker.postMessage({ id, options, recipe });
  }), []);

  const regenerateMapAsync = useCallback((source: Civ5Map, options: MapGenerationOptions, stage: RegenerationStage, variation: number, recipe?: GenerationRecipe, protection?: ProtectionState) => new Promise<Civ5Map>((resolve, reject) => {
    generationWorkerRef.current?.terminate();
    generationRejectRef.current?.(new DOMException("Superseded by a new generation", "AbortError"));
    const worker = new Worker(new URL("./map-generation.worker.ts", import.meta.url), { type: "module" });
    const id = ++generationRequestIdRef.current;
    generationWorkerRef.current = worker;
    generationRejectRef.current = reject;
    setGenerationRunning(true);
    setGenerationStage(`Preparing ${stage.toLowerCase()} pass`);
    worker.onmessage = (event: MessageEvent<GenerationWorkerMessage>) => {
      if (event.data.id !== id) return;
      if (event.data.type === "PROGRESS") { setGenerationStage(event.data.stage); return; }
      worker.terminate();
      generationWorkerRef.current = null;
      generationRejectRef.current = null;
      setGenerationRunning(false);
      setGenerationStage("");
      if (event.data.type === "COMPLETE") resolve(event.data.map);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      generationWorkerRef.current = null;
      generationRejectRef.current = null;
      setGenerationRunning(false);
      setGenerationStage("");
      reject(new Error("The background regeneration worker stopped unexpectedly."));
    };
    worker.postMessage({ id, kind: "REGENERATE", map: source, options, stage, variation, recipe, protection });
  }), []);

  const cancelGeneration = useCallback(() => {
    generationWorkerRef.current?.terminate();
    generationWorkerRef.current = null;
    generationRejectRef.current?.(new DOMException("Generation cancelled", "AbortError"));
    generationRejectRef.current = null;
    setGenerationRunning(false);
    setGenerationStage("");
    setCreateOperationError("");
    setMessage("Map generation cancelled");
  }, []);

  const commitMap = useCallback((next: Civ5Map | ((current: Civ5Map) => Civ5Map)) => {
    const current = mapRef.current;
    const resolved = typeof next === "function" ? next(current) : next;
    if (resolved === current) return;
    const authoredGeographyChanged = resolved.tiles !== current.tiles
      || resolved.startLocations !== current.startLocations
      || resolved.cities !== current.cities
      || resolved.players !== current.players;
    const installed = authoredGeographyChanged && resolved.structure === current.structure
      ? { ...resolved, structure: markGenerationStructureStale(current.structure, "Map edits changed authored geography.", generationPassChangesBetweenMaps(current, resolved)) }
      : resolved;
    mapRef.current = installed;
    setPastMaps((past) => [...past.slice(-49), current]);
    setFutureMaps([]);
    setMap(installed);
    setProjectDirty(true);
  }, []);

  const beginRepair = useCallback((target: Civ5Map, diagnostics: string[] = []) => {
    const baseline = cloneMap(target);
    const issues = buildRepairIssues(baseline);
    repairSourceMapRef.current = target;
    setRepairBaseline(baseline);
    setRepairIssues(issues);
    setRepairSelected(new Set(issues.filter((issue) => issueSelectedByProfile(issue, "STANDARD")).map((issue) => issue.id)));
    setRepairProfile("STANDARD");
    setRepairView("CORRECTED");
    setRepairDiagnostics(diagnostics);
  }, []);

  const repairPreviewMap = useMemo(() => repairBaseline ? applyRepairIssues(repairBaseline, repairIssues, repairSelected) : map, [repairBaseline, repairIssues, repairSelected, map]);
  const repairPreviewIssues = useMemo(() => buildRepairIssues(repairPreviewMap), [repairPreviewMap]);
  const scenarioDraft = useMemo(() => scenarioDraftFromMap(map, projectScenario), [map, projectScenario]);
  const scenarioPreviewMap = useMemo(() => applyScenarioDraft(map, scenarioDraft), [map, scenarioDraft]);
  const scenarioFindings = useMemo(() => validateScenarioDraft(map, scenarioDraft), [map, scenarioDraft]);
  const scenarioCompatibilityReport = useMemo(() => scenarioCompatibility(map, scenarioDraft), [map, scenarioDraft]);
  const scenarioExportReport = useMemo(() => scenarioExportSummary(map, scenarioDraft), [map, scenarioDraft]);
  const selectedScenarioFaction = scenarioDraft.factions.find((faction) => faction.id === selectedScenarioFactionId)
    ?? scenarioDraft.factions.find((faction) => faction.status !== "DISABLED");
  const scenarioFocusedStart: Civ5StartLocation | null = selectedScenarioFaction?.start ? {
    ...selectedScenarioFaction.start,
    player: selectedScenarioFaction.slot,
    civilization: selectedScenarioFaction.civilization,
    leader: selectedScenarioFaction.leader,
    team: selectedScenarioFaction.team,
    playable: selectedScenarioFaction.playable,
    cityState: selectedScenarioFaction.cityState,
    teamColor: selectedScenarioFaction.teamColor,
  } : null;
  const renderFocusedStart = mode === "SCENARIO" ? scenarioFocusedStart : focusedStart;
  const comparisonCheckpoint = useMemo(() => checkpoints.find((checkpoint) => checkpoint.id === comparisonCheckpointId) ?? null, [checkpoints, comparisonCheckpointId]);
  const mapComparison = useMemo(() => comparisonCheckpoint ? compareMaps(map, comparisonCheckpoint.map) : null, [map, comparisonCheckpoint]);
  const archetypePreviewComparison = useMemo(() => archetypePreviewMap ? compareMaps(archetypePreviewMap, map) : null, [archetypePreviewMap, map]);
  const archetypePreviewCounts = useMemo(() => {
    if (!archetypePreviewMap || !archetypePreviewComparison?.dimensionsMatch) return { surface: 0, content: 0 };
    let surface = 0;
    let content = 0;
    for (const index of archetypePreviewComparison.changedTiles) {
      const before = map.tiles[index];
      const after = archetypePreviewMap.tiles[index];
      if (before.terrain !== after.terrain || before.feature !== after.feature) surface += 1;
      if (before.resource !== after.resource || before.resourceAmount !== after.resourceAmount || before.wonder !== after.wonder) content += 1;
    }
    return { surface, content };
  }, [archetypePreviewComparison, archetypePreviewMap, map]);
  const canvasMap = mode === "LAB" && labMap
    ? labMap
    : mode === "SCENARIO"
    ? scenarioPreviewMap
    : mode === "REPAIR" && repairBaseline
    ? repairView === "ORIGINAL" ? repairBaseline : repairPreviewMap
    : mode === "CREATE" && archetypePreviewMap && archetypePreviewView !== "ORIGINAL" ? archetypePreviewMap
    : mode === "CREATE" && comparisonCheckpoint && comparisonView === "CHECKPOINT" ? comparisonCheckpoint.map : map;
  const repairHighlights = useMemo(() => mode === "REPAIR" && repairView === "DIFFERENCE"
    ? new Set(repairIssues.filter((issue) => repairSelected.has(issue.id) && issue.tileIndex !== undefined).map((issue) => issue.tileIndex!))
    : mode === "CREATE" && archetypePreviewMap && archetypePreviewView === "DIFFERENCE" && archetypePreviewComparison?.dimensionsMatch
      ? archetypePreviewComparison.changedTiles
    : mode === "CREATE" && comparisonView === "DIFFERENCE" && mapComparison?.dimensionsMatch
      ? mapComparison.changedTiles
      : new Set<number>(), [mode, repairView, repairIssues, repairSelected, archetypePreviewMap, archetypePreviewView, archetypePreviewComparison, comparisonView, mapComparison]);
  const semanticProtectionChoices = useMemo<ProtectableSemantic[]>(() => protectableSemantics(map), [map]);
  const protectedOverlay = useMemo(() => {
    const indices = new Set<number>();
    if (!showProtectionOverlay || mode !== "CREATE") return indices;
    if (protectionState.tileMask?.width === canvasMap.width && protectionState.tileMask.height === canvasMap.height) {
      for (const channel of PROTECTION_CHANNELS) for (let index = 0; index < canvasMap.tiles.length; index += 1) if (protectionState.tileMask.channels[channel]?.[index]) indices.add(index);
    }
    for (const semantic of protectionState.semantic) for (const index of semantic.sourceTileIndices ?? []) if (index >= 0 && index < canvasMap.tiles.length) indices.add(index);
    return indices;
  }, [canvasMap.height, canvasMap.tiles.length, canvasMap.width, mode, protectionState, showProtectionOverlay]);
  const politicalAvailable = hasPoliticalLayer(canvasMap);
  const strategyAvailable = Boolean(canvasMap.structure?.strategicGraph);
  const politicalOwnership = useMemo(() => buildPoliticalOwnership(canvasMap), [canvasMap]);
  const hasScenarioOwnership = canvasMap.tiles.some((tile) => tile.owner !== undefined);

  const undo = () => {
    const previous = pastMaps.at(-1);
    if (!previous) return;
    setFutureMaps((future) => [mapRef.current, ...future].slice(0, 50));
    mapRef.current = previous;
    setMap(previous);
    setPastMaps((past) => past.slice(0, -1));
    setProjectDirty(true);
    if (mode === "REPAIR") beginRepair(previous, repairDiagnostics);
  };

  const redo = () => {
    const next = futureMaps[0];
    if (!next) return;
    setPastMaps((past) => [...past.slice(-49), mapRef.current]);
    mapRef.current = next;
    setMap(next);
    setFutureMaps((future) => future.slice(1));
    setProjectDirty(true);
    if (mode === "REPAIR") beginRepair(next, repairDiagnostics);
  };

  // Map edits replace the map object, but they do not change viewport geometry.
  // Keep this memo stable across content-only edits so zoom and pan survive redraws.
  const mapProjection = useMemo(
    () => projectionTransform(canvasMap.width, canvasMap.height, projection),
    [canvasMap.width, canvasMap.height, projection],
  );
  const bounds = useMemo(() => ({ width: mapProjection.width, height: mapProjection.height }), [mapProjection]);
  const fitMap = useCallback((targetSize: Size, targetBounds = bounds) => {
    setView(fitViewport(targetSize, targetBounds));
  }, [bounds]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextSize = { width: Math.max(320, entry.contentRect.width), height: Math.max(380, entry.contentRect.height) };
      setSize(nextSize);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    generationWorkerRef.current?.terminate();
    generationRejectRef.current?.(new DOMException("Viewer closed", "AbortError"));
  }, []);

  useEffect(() => {
    if (!showExportValidation) return;
    const frame = window.requestAnimationFrame(() => exportConfirmationCancelRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowExportValidation(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showExportValidation]);

  useEffect(() => {
    if (!showScenarioExportConfirmation) return;
    const frame = window.requestAnimationFrame(() => scenarioExportCancelRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowScenarioExportConfirmation(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showScenarioExportConfirmation]);

  useEffect(() => {
    if (!archetypePreviewMap) return;
    const frame = window.requestAnimationFrame(() => archetypePreviewCancelRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArchetypePreviewMap(null);
        setArchetypePreviewView("DIFFERENCE");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [archetypePreviewMap]);

  useEffect(() => {
    if (!showGameBreakingGeometryConfirmation) return;
    const frame = window.requestAnimationFrame(() => gameBreakingGeometryCancelRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGameBreakingGeometryConfirmation(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showGameBreakingGeometryConfirmation]);

  useEffect(() => {
    if (!showLuaExperimentalWarning) return;
    const frame = window.requestAnimationFrame(() => luaExperimentalCancelRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowLuaExperimentalWarning(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showLuaExperimentalWarning]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitMap(size));
    return () => window.cancelAnimationFrame(frame);
  }, [size, fitMap]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = `${size.width}px`;
    const displayHeight = `${size.height}px`;
    const backingWidth = Math.round(size.width * pixelRatio);
    const backingHeight = Math.round(size.height * pixelRatio);
    // Assigning width or height clears the entire canvas. Keep layer-only
    // redraws on the existing backing buffer so Edit mode never flashes the
    // canvas-shell background between the input event and the next frame.
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    if (canvas.style.width !== displayWidth) canvas.style.width = displayWidth;
    if (canvas.style.height !== displayHeight) canvas.style.height = displayHeight;
    if (!renderCanvasRef.current) renderCanvasRef.current = document.createElement("canvas");
    const renderCanvas = renderCanvasRef.current;
    if (renderCanvas.width !== backingWidth) renderCanvas.width = backingWidth;
    if (renderCanvas.height !== backingHeight) renderCanvas.height = backingHeight;
    const renderContext = renderCanvas.getContext("2d");
    const context = canvas.getContext("2d");
    if (!context || !renderContext) return;

    // Complete the next frame away from the visible canvas. If a transient
    // layout state culls every tile, retain the last valid map frame instead
    // of replacing it with the blue canvas background.
    const paintedTiles = drawMap(renderContext, canvasMap, layers, hovered, view, size, pixelRatio, mapProjection, selection, renderFocusedStart, repairHighlights, protectedOverlay, politicalOwnership);
    if (canvasMap.tiles.length && paintedTiles === 0) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "copy";
    context.drawImage(renderCanvas, 0, 0);
    context.restore();
  }, [canvasMap, layers, hovered, view, size, mapProjection, selection, renderFocusedStart, repairHighlights, protectedOverlay, politicalOwnership]);

  const terrainBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tile of canvasMap.tiles) {
      const name = friendlyName(canvasMap.terrains[tile.terrain], "TERRAIN_");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [canvasMap]);

  const generationMetrics = useMemo(() => {
    const water = map.tiles.filter((tile) => tile.terrain < 2).length;
    const land = map.tiles.length - water;
    const mountains = map.tiles.filter((tile) => tile.terrain >= 2 && tile.elevation === 2).length;
    return {
      water: Math.round((water / Math.max(1, map.tiles.length)) * 100),
      mountains: Math.round((mountains / Math.max(1, land)) * 100),
    };
  }, [map]);

  const generationSummary = useMemo(() => {
    const sizeLabel = MAP_SIZES.find((item) => item.id === generationOptions.size)?.label ?? generationOptions.size;
    const presetLabel = MAP_PRESETS.find((item) => item.id === generationOptions.preset)?.label ?? generationOptions.preset;
    const styleLabel = generationOptions.style.toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
    const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry);
    const engineLabel = generationOptions.engine === "ECCENTRIC" ? "Eccentric" : generationOptions.engine === "PHYSICAL" ? "Physical" : generationOptions.engine === "POLIS" ? "Polis" : "Excogitare";
    const projectionLabel = CLIMATE_PROJECTIONS.find((item) => item.id === generationOptions.projectionType)?.label ?? generationOptions.projectionType;
    const archetypeLabel = generationArchetype === "EXISTING" ? "Existing surface" : generationArchetype === "NARRATIVE_DEFAULT" ? "Narrative surface" : `${ARCHETYPE_PROFILES[generationArchetype].label} ${generationArchetypeIntensity.toLowerCase()}`;
    return `${projectionLabel} · ${engineLabel} · ${styleLabel} · ${presetLabel} · ${generationScale.toLowerCase()} scale · ${archetypeLabel} · ${sizeLabel} ${dimensions.width}×${dimensions.height} · ${generationOptions.players} players`;
  }, [generationArchetype, generationArchetypeIntensity, generationOptions, generationScale]);
  const generationCompactSummary = useMemo(() => {
    const presetLabel = MAP_PRESETS.find((item) => item.id === generationOptions.preset)?.label ?? generationOptions.preset;
    const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry);
    const engineLabel = generationOptions.engine === "ECCENTRIC" ? "Eccentric" : generationOptions.engine === "PHYSICAL" ? "Physical" : generationOptions.engine === "POLIS" ? "Polis" : "Excogitare";
    return `${engineLabel} · ${presetLabel} · ${dimensions.width}×${dimensions.height} · ${generationOptions.players}P`;
  }, [generationOptions]);
  const generationResourceEstimate = useMemo(() => estimateGenerationResources(generationOptions, generationEffort), [generationOptions, generationEffort]);
  const validationIssues = useMemo(() => {
    const modelIssues = validateCiv5Map(map);
    try {
      const encoded = sourceFile && !sourceFile.salvaged ? updateCiv5Map(sourceFile.buffer, map) : serializeCiv5Map(map);
      const structural = inspectCiv5MapStructure(encoded).map((issue) => ({ severity: issue.severity, category: "STRUCTURE" as const, message: `Encoded file: ${issue.message}` }));
      const reparsed = parseCiv5Map(encoded, `${map.name}.Civ5Map`);
      const roundTripErrors = validateCiv5Map(reparsed)
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => ({ ...issue, message: `Encoded file: ${issue.message}` }));
      return [...modelIssues, ...structural, ...roundTripErrors].filter((issue, index, all) => all.findIndex((candidate) => candidate.severity === issue.severity && candidate.category === issue.category && candidate.message === issue.message) === index);
    } catch (error) {
      return [...modelIssues, { severity: "ERROR" as const, category: "STRUCTURE" as const, message: error instanceof Error ? `Encoded file: ${error.message}` : "Encoded file: structural inspection failed." }];
    }
  }, [map, sourceFile]);
  const balanceReport = useMemo(() => analyzeMultiplayerBalance(map), [map]);
  const narrativeAssessment = map.structure?.narrativeAssessment;

  const majorStartCount = canvasMap.startLocations.filter((start) => !start.cityState).length;
  const cityStateCount = canvasMap.startLocations.filter((start) => start.cityState).length;
  const visibleLayerCount = Object.entries(layers).filter(([key, enabled]) => enabled
    && (key !== "political" || politicalAvailable)
    && (key !== "strategy" || strategyAvailable)
    && (key !== "starts" || majorStartCount > 0)
    && (key !== "cityStates" || cityStateCount > 0)).length;

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".civ5map")) {
      setMessage("Choose a file ending in .Civ5Map");
      return;
    }
    if (projectDirty && !window.confirm("Open this Civ5Map as a new unsaved project? Download the current project first if you want to retain it.")) return;
    try {
      setMessage("Reading map…");
      const buffer = await file.arrayBuffer();
      if (mode === "REPAIR") {
        const parsed = parseCiv5MapForRepair(buffer, file.name);
        const structuralDiagnostics = inspectCiv5MapStructure(buffer).map((issue) => `${issue.severity}: ${issue.message}`);
        replaceMap(parsed.map, { fileName: file.name, buffer, salvaged: parsed.salvaged });
        beginRepair(parsed.map, [...parsed.diagnostics, ...structuralDiagnostics]);
        setMessage(parsed.salvaged ? `${file.name} · damaged data recovered for repair` : `${file.name} · repair tests complete`);
      } else {
        const parsed = parseCiv5Map(buffer, file.name);
        replaceMap(parsed, { fileName: file.name, buffer });
        setGenerationArchetype("EXISTING");
        setGenerationArchetypeIntensity("STRONG");
        setMessage(`${file.name} · rendered locally`);
      }
      const importedProjectName = `${file.name.replace(/\.civ5map$/i, "")} Project`;
      setProjectName(importedProjectName);
      setProjectId(null);
      setProjectLastSavedAt(null);
      setProjectScenario(null);
      setProjectExtensions(undefined);
      setProjectOpaqueFields({});
      setProjectSourceManifest(null);
      setGenerationHistory([]);
      setCheckpoints([]);
      setProtectionState(emptyProtectionState());
      setPastProtectionStates([]);
      setFutureProtectionStates([]);
      setProjectDirty(true);
      setShowEditPrompt(false);
      setIsEditingMetadata(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That map could not be read.");
    }
  }, [beginRepair, mode, projectDirty, replaceMap]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const tileAtPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const projectedPoint = {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    };
    const worldPoint = unprojectPoint(projectedPoint.x, projectedPoint.y, mapProjection);
    const target = projection === "ISOMETRIC"
      ? closestIsometricTile(map, projectedPoint.x, projectedPoint.y, mapProjection, layers.elevation)
      : closestTile(map, worldPoint.x, worldPoint.y);
    return target ? { x: target.col, y: map.height - 1 - target.row } : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "CREATE" && createView === "EDIT" && editTool === "PRESERVE") {
      const target = tileAtPointer(event);
      if (target) {
        preserveDragRef.current = target;
        setSelectionAnchor(target);
        setSelection({ minX: target.x, minY: target.y, maxX: target.x, maxY: target.y });
        setMessage("Drag across the geography to define the protected region");
      }
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const preserveOrigin = preserveDragRef.current;
    if (preserveOrigin) {
      const target = tileAtPointer(event);
      if (target) setSelection({ minX: Math.min(preserveOrigin.x, target.x), minY: Math.min(preserveOrigin.y, target.y), maxX: Math.max(preserveOrigin.x, target.x), maxY: Math.max(preserveOrigin.y, target.y) });
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
      setView((current) => ({ ...current, x: drag.viewX + event.clientX - drag.x, y: drag.viewY + event.clientY - drag.y }));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const projectedPoint = {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    };
    if (projection === "ISOMETRIC") {
      setHovered(closestIsometricTile(canvasMap, projectedPoint.x, projectedPoint.y, mapProjection, layers.elevation));
    } else {
      const worldPoint = unprojectPoint(projectedPoint.x, projectedPoint.y, mapProjection);
      setHovered(closestTile(canvasMap, worldPoint.x, worldPoint.y));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const preserveOrigin = preserveDragRef.current;
    if (preserveOrigin) {
      const target = tileAtPointer(event) ?? preserveOrigin;
      setSelection({ minX: Math.min(preserveOrigin.x, target.x), minY: Math.min(preserveOrigin.y, target.y), maxX: Math.max(preserveOrigin.x, target.x), maxY: Math.max(preserveOrigin.y, target.y) });
      preserveDragRef.current = null;
      setSelectionAnchor(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      setMessage("Region selected · choose the channels to preserve");
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (mode === "SCENARIO" && scenarioPlacementFactionId && !drag?.moved) {
      const target = tileAtPointer(event);
      if (!target) return;
      const next = cloneScenarioDraft(scenarioDraft);
      const faction = next.factions.find((candidate) => candidate.id === scenarioPlacementFactionId);
      if (!faction) return;
      faction.start = target;
      setProjectScenario(next);
      setSelectedScenarioFactionId(faction.id);
      setScenarioPlacementFactionId("");
      setProjectDirty(true);
      setMessage(`Faction ${faction.slot + 1} start placed at ${target.x}, ${target.y}`);
      return;
    }
    if (mode !== "CREATE" || createView !== "EDIT" || drag?.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const projectedPoint = {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    };
    const worldPoint = unprojectPoint(projectedPoint.x, projectedPoint.y, mapProjection);
    const target = projection === "ISOMETRIC"
      ? closestIsometricTile(map, projectedPoint.x, projectedPoint.y, mapProjection, layers.elevation)
      : closestTile(map, worldPoint.x, worldPoint.y);
    if (!target) return;
    const sourceY = map.height - 1 - target.row;
    if (editTool === "SELECT" || editTool === "STRUCTURE") {
      if (editTool === "SELECT" && isPasting && tileClipboard) {
        commitMap((current) => {
          const tiles = current.tiles.map((tile) => ({ ...tile }));
          for (let dy = 0; dy < tileClipboard.height; dy += 1) {
            for (let dx = 0; dx < tileClipboard.width; dx += 1) {
              const x = target.col + dx;
              const y = sourceY + dy;
              if (x >= current.width || y >= current.height) continue;
              tiles[y * current.width + x] = { ...tileClipboard.tiles[dy * tileClipboard.width + dx] };
            }
          }
          return { ...current, tiles };
        });
        setSelection({ minX: target.col, minY: sourceY, maxX: Math.min(map.width - 1, target.col + tileClipboard.width - 1), maxY: Math.min(map.height - 1, sourceY + tileClipboard.height - 1) });
        setIsPasting(false);
        setMessage("Region pasted · undo available");
      } else if (!selectionAnchor) {
        setSelectionAnchor({ x: target.col, y: sourceY });
        setSelection({ minX: target.col, minY: sourceY, maxX: target.col, maxY: sourceY });
        setMessage("Region start selected · choose the opposite corner");
      } else {
        setSelection({ minX: Math.min(selectionAnchor.x, target.col), minY: Math.min(selectionAnchor.y, sourceY), maxX: Math.max(selectionAnchor.x, target.col), maxY: Math.max(selectionAnchor.y, sourceY) });
        setSelectionAnchor(null);
        setMessage(editTool === "STRUCTURE" ? "World region selected · choose a structural operation" : "Region selected · copy or edit it");
      }
      return;
    }
    if (editTool === "START") {
      commitMap((current) => {
        const existing = current.startLocations.findIndex((start) => start.x === target.col && start.y === sourceY);
        const startLocations = [...current.startLocations];
        if (existing >= 0) startLocations.splice(existing, 1);
        else startLocations.push({
          x: target.col,
          y: sourceY,
          player: startLocations.filter((start) => !start.cityState).length,
          civilization: "",
          leader: "",
          team: generationOptions.balance === "TEAMS" ? Math.floor(startLocations.length / generationOptions.teamSize) : startLocations.length,
          playable: true,
          cityState: false,
        });
        return { ...current, players: startLocations.filter((start) => !start.cityState).length || current.players, startLocations };
      });
      setMessage("Start position updated · undo available");
      return;
    }
    commitMap((current) => {
      const tiles = current.tiles.map((tile) => ({ ...tile }));
      if (editTool === "FILL") {
        const origin = tiles[sourceY * current.width + target.col];
        const matches = (tile: Civ5Tile) => (brush.terrain === null || tile.terrain === origin.terrain)
          && (brush.elevation === null || tile.elevation === origin.elevation)
          && (brush.feature === null || tile.feature === origin.feature)
          && (brush.resource === null || tile.resource === origin.resource);
        const queue: Array<[number, number]> = [[target.col, sourceY]];
        const seen = new Set([`${target.col},${sourceY}`]);
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const [x, y] = queue[cursor];
          const index = y * current.width + x;
          if (!matches(tiles[index])) continue;
          tiles[index] = paintedTile(tiles[index], brush);
          for (const [nx, ny] of editorNeighbors(x, y, current.width, current.height, current.wraps)) {
            const key = `${nx},${ny}`;
            if (seen.has(key) || !matches(tiles[ny * current.width + nx])) continue;
            seen.add(key);
            queue.push([nx, ny]);
          }
        }
      } else {
        for (const [x, y] of editorArea(target.col, sourceY, brushSize - 1, current.width, current.height, current.wraps)) {
          const index = y * current.width + x;
          tiles[index] = paintedTile(tiles[index], brush);
        }
      }
      return { ...current, tiles };
    });
    setMessage(editTool === "FILL" ? "Connected terrain filled · undo available" : `${brushSize === 1 ? "Tile" : "Brush area"} edited · undo available`);
  };

  const zoomAt = (factor: number, screenX: number, screenY: number) => {
    setView((current) => {
      const zoom = Math.max(minimumViewportZoom(size, bounds), Math.min(4.5, current.zoom * factor));
      const worldX = (screenX - current.x) / current.zoom;
      const worldY = (screenY - current.y) / current.zoom;
      return { zoom, x: screenX - worldX * zoom, y: screenY - worldY * zoom };
    });
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX - rect.left, event.clientY - rect.top);
  };

  const download = (data: BlobPart, fileName: string, type = "application/octet-stream") => {
    const blobUrl = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement("a");
    link.download = fileName;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  };

  const activeRecipe = (options = generationOptions): GenerationRecipe => {
    const normalized = normalizeGenerationOptions(options, allowGameBreakingGeometry);
    const base = generationRecipeFromOptions(normalized);
    return { ...base, scale: generationScale, archetype: generationArchetype, archetypeIntensity: generationArchetypeIntensity, effort: generationEffort, matchIntent: { ...matchIntent, seats: matchIntent.seats?.slice(0, normalized.players).map((seat) => ({ ...seat })), enabledVictories: [...matchIntent.enabledVictories], emphasizedVictories: [...matchIntent.emphasizedVictories], flexiblePlayers: Math.max(0, normalized.players - matchIntent.humanPlayers - matchIntent.aiPlayers), balanceMode: normalized.balance, teamSize: normalized.teamSize, teamLayout: normalized.teamLayout, strategicBalance: normalized.strategicBalance } };
  };

  const requestProjectExport = () => {
    setProjectName((current) => current.trim() || `${map.name} Project`);
    setShowProjectSaveDialog(true);
  };

  const exportProject = () => {
    try {
      const recipe = map.recipe ? normalizeGenerationRecipe(map.recipe, DEFAULT_GENERATION_OPTIONS) : activeRecipe();
      const historyEntries = generationHistory.map((entry) => ({ id: String(entry.id), parentId: entry.parentId === undefined ? undefined : String(entry.parentId), operation: entry.operation, createdAt: entry.createdAt, recipe: entry.map.recipe ?? recipe, map: entry.map, provenance: entry.map.structure?.provenance ?? [] }));
      const projectCheckpoints = checkpoints.map((checkpoint) => ({ id: String(checkpoint.id), name: checkpoint.name, createdAt: checkpoint.createdAt, recipe: checkpoint.map.recipe ?? recipe, map: checkpoint.map, provenance: checkpoint.map.structure?.provenance ?? [] }));
      const history: ProjectHistory = { schemaVersion: 1, activeEntryId: activeGenerationId === null ? undefined : String(activeGenerationId), entries: historyEntries, checkpoints: projectCheckpoints };
      const expandedSections = Object.entries(createDisclosureState).flatMap(([stage, entries]) => Object.entries(entries).filter(([, open]) => open).map(([key]) => `${stage}:${key}`));
      const now = new Date().toISOString();
      const project = createExcogitareProject({ projectName, projectId: projectId ?? undefined, map: { ...map, recipe }, recipe, history, protection: protectionState, scenario: projectScenario ?? undefined, excogitareVersion: APP_VERSION, now: projectSourceManifest?.createdAt ?? now, editorState: { schemaVersion: 1, workspace: mode, stage: mode === "CREATE" ? createView : mode === "SCENARIO" ? scenarioStage : undefined, view, expandedSections, stageScrollPositions: { ...createScrollPositionsRef.current } } });
      if (projectSourceManifest) project.manifest = { ...projectSourceManifest, ...project.manifest, projectId: projectId ?? project.manifest.projectId, projectName: projectName.trim() || map.name, createdAt: projectSourceManifest.createdAt };
      Object.assign(project, projectOpaqueFields);
      project.extensions = projectExtensions;
      const encoded = serializeExcogitareProject(project, { historyPolicy: projectHistoryPolicy, now });
      const fileName = `${mapExportBaseName({ ...map, name: projectName.trim() || map.name })}.excogitare`;
      download(encoded, fileName, "application/vnd.excogitare.project+zip");
      setProjectId(project.manifest.projectId);
      setProjectLastSavedAt(now);
      setProjectSourceManifest({ ...project.manifest, updatedAt: now, historyPolicy: projectHistoryPolicy });
      projectSavedIntentRef.current = projectIntentKey;
      setProjectDirty(false);
      setShowProjectSaveDialog(false);
      setMessage(`${fileName} · ${projectHistoryPolicy === "FULL" ? `${historyEntries.length} generations` : "current map"} and ${projectCheckpoints.length} named checkpoint${projectCheckpoints.length === 1 ? "" : "s"} downloaded`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The project could not be exported."); }
  };

  const beginNewProject = () => {
    if (projectDirty && !window.confirm("Begin a new project from the current map? Download the present project first if you want to retain its history and protection state.")) return;
    setProjectName(`${map.name} Project`);
    setProjectId(null);
    setProjectLastSavedAt(null);
    setProjectScenario(null);
    setProjectExtensions(undefined);
    setProjectOpaqueFields({});
    setProjectSourceManifest(null);
    setGenerationHistory([]);
    setActiveGenerationId(null);
    setCheckpoints([]);
    setComparisonCheckpointId(null);
    setProtectionState(emptyProtectionState());
    setPastProtectionStates([]);
    setFutureProtectionStates([]);
    setProjectDirty(true);
    setMessage(`${map.name} · new unsaved project begun from the current map`);
  };

  const importProject = async (file: File) => {
    if (projectDirty && !window.confirm("Open this downloaded project? Unsaved work in the current project will be replaced.")) return;
    try {
      const project = parseExcogitareProject(await file.arrayBuffer());
      const projectRecipe = normalizeGenerationRecipe(project.recipe, DEFAULT_GENERATION_OPTIONS);
      const projectOptions = generationOptionsFromRecipe(projectRecipe);
      const projectNeedsGameBreakingPermission = isGameBreakingMapSize(projectOptions.size) || isGameBreakingGeometry(projectOptions.geometry);
      const restoredGenerationOptions = normalizeGenerationOptions(projectOptions, allowGameBreakingGeometry || projectNeedsGameBreakingPermission);
      let fallbackHistoryId = generationIdRef.current;
      const restoredHistory = project.history.entries.slice(0, MAX_GENERATION_HISTORY).map((entry) => {
        const operation = (["GENERATE", "RANDOMISE", "SELECTIVE_WORLD", "SELECTIVE_CLIMATE", "SELECTIVE_RIVERS", "SELECTIVE_CONTENT", "SELECTIVE_STARTS", "BATCH_SELECTION", "PROJECT_IMPORT"].includes(entry.operation) ? entry.operation : "PROJECT_IMPORT") as GenerationHistoryEntry["operation"];
        const parsedParentId = entry.parentId === undefined ? undefined : Number(entry.parentId);
        const recipe = normalizeGenerationRecipe(entry.map.recipe ?? entry.recipe, DEFAULT_GENERATION_OPTIONS);
        return { id: Number(entry.id) || ++fallbackHistoryId, parentId: parsedParentId !== undefined && Number.isFinite(parsedParentId) ? parsedParentId : undefined, operation, createdAt: entry.createdAt ?? project.manifest.updatedAt, map: { ...entry.map, recipe } };
      });
      const restoredMap = { ...project.map, recipe: normalizeGenerationRecipe(project.map.recipe ?? projectRecipe, DEFAULT_GENERATION_OPTIONS) };
      const restoredCheckpoints = (project.history.checkpoints ?? []).map((checkpoint) => ({ id: Number(checkpoint.id) || ++checkpointIdRef.current, name: checkpoint.name, createdAt: checkpoint.createdAt, map: { ...checkpoint.map, recipe: normalizeGenerationRecipe(checkpoint.map.recipe ?? checkpoint.recipe, DEFAULT_GENERATION_OPTIONS) } }));
      const restoredStage = normalizeCreateStage(project.editorState?.stage);
      const restoredScenarioStage = (["SETUP", "FACTIONS", "WORLD", "OBJECTIVES", "VALIDATE"] as const).find((stage) => stage === project.editorState?.stage) ?? "SETUP";
      const restoredDisclosureState: Record<CreateStage, Record<string, boolean>> = { GENERATE: {}, REFINE: {}, ITERATE: {}, EDIT: {}, ANALYZE: {} };
      for (const stored of project.editorState?.expandedSections ?? []) {
        const separator = stored.indexOf(":");
        const normalized = normalizeCreateStage(stored.slice(0, separator));
        if (separator > 0 && !normalized.recovered) restoredDisclosureState[normalized.stage][stored.slice(separator + 1)] = true;
      }
      replaceMap(restoredMap);
      if (projectNeedsGameBreakingPermission) setAllowGameBreakingGeometry(true);
      setGenerationOptions(restoredGenerationOptions);
      setGenerationScale(projectRecipe.scale);
      setGenerationArchetype(projectRecipe.archetype);
      setGenerationArchetypeIntensity(projectRecipe.archetypeIntensity);
      setGenerationEffort(projectRecipe.effort);
      setMatchIntent(projectRecipe.matchIntent);
      setProtectionState(cloneProtectionState(project.protection));
      setPastProtectionStates([]);
      setFutureProtectionStates([]);
      setGenerationHistory(restoredHistory);
      setCheckpoints(restoredCheckpoints);
      setComparisonCheckpointId(null);
      generationIdRef.current = Math.max(generationIdRef.current, ...restoredHistory.map((entry) => entry.id), 0);
      checkpointIdRef.current = Math.max(checkpointIdRef.current, ...restoredCheckpoints.map((checkpoint) => checkpoint.id), 0);
      const activeId = project.history.activeEntryId ? Number(project.history.activeEntryId) : null;
      setActiveGenerationId(activeId !== null && Number.isFinite(activeId) && restoredHistory.some((entry) => entry.id === activeId) ? activeId : null);
      setMode(project.editorState?.workspace === "SCENARIO" ? "SCENARIO" : "CREATE");
      setCreateView(restoredStage.stage);
      setScenarioStage(restoredScenarioStage);
      setCreateDisclosureState(restoredDisclosureState);
      for (const stage of ["GENERATE", "REFINE", "ITERATE", "EDIT", "ANALYZE"] as const) createScrollPositionsRef.current[stage] = Math.max(0, Number(project.editorState?.stageScrollPositions?.[stage]) || 0);
      if (project.editorState?.view) setView(project.editorState.view);
      const knownProjectFields = new Set(["schemaVersion", "manifest", "map", "recipe", "protection", "scenario", "history", "editorState", "derived", "extensions"]);
      setProjectOpaqueFields(Object.fromEntries(Object.entries(project as ExcogitareProject & Record<string, unknown>).filter(([key]) => !knownProjectFields.has(key))));
      setProjectExtensions(project.extensions);
      setProjectScenario(project.scenario);
      setProjectSourceManifest(project.manifest);
      setProjectName(project.manifest.projectName);
      setProjectId(project.manifest.projectId);
      setProjectLastSavedAt(project.manifest.updatedAt);
      setProjectHistoryPolicy(project.manifest.historyPolicy ?? "FULL");
      projectSavedIntentRef.current = JSON.stringify({ generationOptions: restoredGenerationOptions, generationScale: projectRecipe.scale, generationArchetype: projectRecipe.archetype, generationArchetypeIntensity: projectRecipe.archetypeIntensity, generationEffort: projectRecipe.effort, matchIntent: projectRecipe.matchIntent });
      setProjectDirty(false);
      setMessage(`${file.name} · ${project.manifest.bundleVersion === 2 ? "compressed project" : "legacy v1 project migrated"} and restored${project.editorState?.workspace !== "SCENARIO" && restoredStage.recovered ? " · unknown Create stage recovered to Design" : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The project could not be opened. The active map was not replaced."); }
  };

  const exportView = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.round(size.width * pixelRatio);
    exportCanvas.height = Math.round(size.height * pixelRatio);
    const context = exportCanvas.getContext("2d", { alpha: true });
    if (!context) return;
    drawMap(context, canvasMap, layers, hovered, view, size, pixelRatio, mapProjection, selection, renderFocusedStart, repairHighlights, new Set<number>(), politicalOwnership, true);
    const fileName = `${mapExportBaseName(canvasMap)}.png`;
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      download(blob, fileName, "image/png");
      setMessage(`${fileName} · exported with transparent background`);
    }, "image/png");
  };

  const requestEditMode = () => {
    setDraftName(map.name);
    setDraftDescription(map.description);
    setShowEditPrompt(true);
  };

  const enterEditMode = () => {
    setShowEditPrompt(false);
    setIsEditingMetadata(true);
  };

  const cancelEditMode = () => {
    setShowEditPrompt(false);
    setIsEditingMetadata(false);
    setDraftName(map.name);
    setDraftDescription(map.description);
  };

  const saveMetadata = () => {
    const name = draftName.trim();
    if (!name) return;
    commitMap((current) => ({ ...current, name, description: draftDescription }));
    setIsEditingMetadata(false);
    setMessage(sourceFile ? "Map details edited · ready to export" : "Demo map details edited");
  };

  const performCiv5MapExport = (targetMap = map, repaired = false) => {
    try {
      const exported = sourceFile && !sourceFile.salvaged ? updateCiv5Map(sourceFile.buffer, targetMap) : serializeCiv5Map(targetMap);
      const structuralError = inspectCiv5MapStructure(exported).find((issue) => issue.severity === "ERROR");
      if (structuralError) throw new Error(`Export blocked: ${structuralError.message}`);
      const reparsed = parseCiv5Map(exported, `${targetMap.name}.Civ5Map`);
      const encodedError = validateCiv5Map(reparsed).find((issue) => issue.severity === "ERROR");
      if (encodedError) throw new Error(`Export blocked after binary round trip: ${encodedError.message}`);
      const baseName = mapExportBaseName(targetMap);
      const suffix = repaired ? "-repaired" : "";
      const downloadName = `${baseName}${suffix}.Civ5Map`;
      download(exported, downloadName);
      setMessage(`${downloadName} · exported`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The edited map could not be exported.");
    }
  };

  const exportCiv5Map = () => {
    if (isEditingMetadata) return;
    if (mode === "SCENARIO") {
      requestScenarioExport();
      return;
    }
    if (validationIssues.some((issue) => issue.severity !== "INFO")) {
      setShowExportValidation(true);
      return;
    }
    performCiv5MapExport();
  };

  const hasBlockingStructureError = validationIssues.some((issue) => issue.category === "STRUCTURE" && issue.severity === "ERROR");

  const changeScenarioDraft = (next: ScenarioDraft) => {
    setProjectScenario(next);
    setProjectDirty(true);
  };

  const applyScenarioPreview = () => {
    setProjectScenario(cloneScenarioDraft(scenarioDraft));
    commitMap(scenarioPreviewMap);
    setMessage("Scenario preview applied · undo remains available");
  };

  const sendScenarioToRepair = () => {
    setProjectScenario(cloneScenarioDraft(scenarioDraft));
    commitMap(scenarioPreviewMap);
    beginRepair(scenarioPreviewMap);
    setScenarioPlacementFactionId("");
    setRepairStage("INSPECT");
    setMode("REPAIR");
    setMessage("Scenario preview sent to Repair · no corrections were applied automatically");
  };

  function requestScenarioExport() {
    let preflightError = "";
    try {
      const importedScenario = sourceFile && !sourceFile.salvaged
        ? parseCiv5Map(sourceFile.buffer, sourceFile.fileName).scenarioDataPresent
        : false;
      if (!importedScenario) {
        preflightError = "New scenario Civ5Map construction is disabled. Download the Excogitare project to retain this Scenario draft; ordinary map export remains available from Create or Explore.";
      } else {
        const encoded = updateCiv5Map(sourceFile!.buffer, scenarioPreviewMap);
        const structuralError = inspectCiv5MapStructure(encoded).find((issue) => issue.severity === "ERROR");
        if (structuralError) preflightError = structuralError.message;
        else {
          const reparsed = parseCiv5Map(encoded, `${scenarioPreviewMap.name}.Civ5Map`);
          const encodedError = validateCiv5Map(reparsed).find((issue) => issue.severity === "ERROR");
          if (encodedError) preflightError = encodedError.message;
        }
      }
    } catch (error) {
      preflightError = error instanceof Error ? error.message : "The Scenario could not be encoded safely.";
    }
    setScenarioExportPreflightError(preflightError);
    setShowScenarioExportConfirmation(true);
  }

  const selectRepairProfile = (profile: RepairProfile) => {
    setRepairProfile(profile);
    setRepairSelected(new Set(repairIssues.filter((issue) => issueSelectedByProfile(issue, profile)).map((issue) => issue.id)));
  };

  const toggleRepairIssue = (issue: RepairIssue) => {
    if (!issue.mutation) return;
    setRepairSelected((current) => {
      const next = new Set(current);
      if (next.has(issue.id)) next.delete(issue.id);
      else next.add(issue.id);
      return next;
    });
  };

  const focusRepairIssue = (issue: RepairIssue) => {
    if (issue.x === undefined || issue.y === undefined) return;
    setRepairView("DIFFERENCE");
    setSelection({ minX: issue.x, minY: issue.y, maxX: issue.x, maxY: issue.y });
  };

  const applySelectedRepairs = () => {
    if (!repairBaseline) return;
    const repaired = applyRepairIssues(repairBaseline, repairIssues, repairSelected);
    if (repaired === repairBaseline) {
      setMessage("The selected corrections conflict with a legal population layout · no changes were applied");
      return;
    }
    const appliedCount = repairIssues.filter((issue) => repairSelected.has(issue.id) && issue.mutation).length;
    commitMap(repaired);
    beginRepair(repaired, repairDiagnostics);
    setMessage(`${appliedCount} automated repairs applied · undo available`);
  };

  const enterRepairMode = () => {
    setMode("REPAIR");
    if (repairSourceMapRef.current !== mapRef.current) {
      beginRepair(mapRef.current);
      setMessage("Repair tests complete · review the proposed corrections");
    } else {
      setMessage("Repair workspace restored · corrections and validation preserved");
    }
  };

  const selectWorkspaceMode = (nextMode: WorkspaceMode) => {
    setShowLegend(false);
    setShowDisplayPanel(false);
    if (nextMode === "SCRIPT" && mode !== "SCRIPT") {
      setShowLuaExperimentalWarning(true);
      return;
    }
    if (nextMode === "LAB") {
      setProjection("FLAT");
      setLayers({ political: false, strategy: false, grid: true, features: true, resources: false, elevation: true, starts: false, cityStates: false });
      setMode("LAB");
      return;
    }
    if (nextMode === "SCENARIO") {
      const draft = scenarioDraftFromMap(mapRef.current, projectScenario);
      setProjectScenario(draft);
      setSelectedScenarioFactionId((current) => draft.factions.some((faction) => faction.id === current) ? current : draft.factions.find((faction) => faction.status !== "DISABLED")?.id ?? "");
      setScenarioPlacementFactionId("");
      setLayers((current) => ({ ...current, political: true, starts: true, cityStates: true }));
      setMode("SCENARIO");
      return;
    }
    if (nextMode === "REPAIR") enterRepairMode();
    else setMode(nextMode);
  };

  const prefetchIdentityLabTrial = async (sourceSession: ContinuousIdentityLabSession) => {
    const trial = prefetchedContinuousIdentityLabTrial(sourceSession);
    if (!trial || sourceSession.status !== "ACTIVE") return;
    const operationEpoch = labOperationEpochRef.current;
    setLabPrefetching(true);
    setLabPrefetchedTrialId(null);
    labPrefetchRef.current = null;
    try {
      const generated = await generateMapAsync(trial.options, trial.recipe);
      if (operationEpoch !== labOperationEpochRef.current) return;
      labPrefetchRef.current = { trialId: trial.id, map: generated };
      setLabPrefetchedTrialId(trial.id);
      setLabSession((current) => current?.id === sourceSession.id ? recordContinuousIdentityLabGeneration(current, trial.id, generated, new Date().toISOString()) : current);
      setLabStatus("Choose one answer. The next unlabeled map is ready; correctness remains hidden until the session ends.");
    } catch (error) {
      if (operationEpoch !== labOperationEpochRef.current) return;
      const detail = error instanceof Error ? error.message : "Map generation failed.";
      setLabSession((current) => current?.id === sourceSession.id ? recordContinuousIdentityLabGenerationError(current, trial.id, detail, new Date().toISOString()) : current);
      setLabStatus(`The current trial is safe, but next-map prefetch failed: ${detail}`);
    } finally {
      if (operationEpoch === labOperationEpochRef.current) setLabPrefetching(false);
    }
  };

  const openIdentityLabTrial = async (sourceSession: ContinuousIdentityLabSession) => {
    const trial = currentContinuousIdentityLabTrial(sourceSession);
    if (!trial || sourceSession.status !== "ACTIVE") return;
    const operationEpoch = ++labOperationEpochRef.current;
    setLabSession(sourceSession);
    setLabLegacyArchive(null);
    setLabStage("REVIEW");
    setLabLoading(true);
    setLabMap(null);
    setLabActiveCandidateId(null);
    setLabSelectedChoice("");
    setLabPrefetchedTrialId(null);
    labPrefetchRef.current = null;
    setLabStatus(`Generating blind trial ${trial.sequence + 1}…`);
    try {
      const generated = await generateMapAsync(trial.options, trial.recipe);
      if (operationEpoch !== labOperationEpochRef.current) return;
      const generatedAt = new Date().toISOString();
      const recorded = recordContinuousIdentityLabGeneration(sourceSession, trial.id, generated, generatedAt);
      const presented = presentContinuousIdentityLabTrial(recorded, trial.id, generatedAt);
      setLabSession(presented);
      setLabMap(generated);
      setLabActiveCandidateId(trial.id);
      fitMap(size, projectionTransform(generated.width, generated.height, "FLAT"));
      setLabStatus("The map is ready. Four plausible identities follow; no result will be shown between trials.");
      void prefetchIdentityLabTrial(presented);
    } catch (error) {
      if (operationEpoch !== labOperationEpochRef.current) return;
      const detail = error instanceof Error ? error.message : "Map generation failed.";
      const failed = recordContinuousIdentityLabGenerationError(sourceSession, trial.id, detail, new Date().toISOString());
      setLabSession(failed);
      setLabStatus(`Current trial generation failed: ${detail}`);
    } finally {
      if (operationEpoch === labOperationEpochRef.current) setLabLoading(false);
    }
  };

  const startIdentityLabSession = () => {
    if ((labSession?.summary.trialsAnswered || labLegacyArchive?.summary.reviewed) && !window.confirm("Start a new continuous session? Download the current JSON first if you want to retain its evidence.")) return;
    const now = new Date().toISOString();
    const next = createContinuousIdentityLabSession({ sessionSeed: labSessionSeed, size: labSize, style: labStyle, modifier: "NONE" }, now);
    setLabSession(next);
    setLabLegacyArchive(null);
    setLabMap(null);
    setLabActiveCandidateId(null);
    setLabStage("REVIEW");
    void openIdentityLabTrial(next);
  };

  const submitIdentityGuess = () => {
    if (!labSession || !labActiveCandidateId || !labSelectedChoice || labPrefetching) return;
    const cached = labPrefetchRef.current;
    const current = currentContinuousIdentityLabTrial(labSession);
    if (!current || !cached || cached.trialId !== prefetchedContinuousIdentityLabTrial(labSession)?.id) {
      setLabStatus("The next map is not ready. Retry prefetch without losing this answer.");
      return;
    }
    try {
      const now = new Date().toISOString();
      let advanced = submitContinuousIdentityLabAnswer(labSession, labActiveCandidateId, labSelectedChoice, now);
      const next = currentContinuousIdentityLabTrial(advanced)!;
      advanced = recordContinuousIdentityLabGeneration(advanced, next.id, cached.map, now);
      advanced = presentContinuousIdentityLabTrial(advanced, next.id, now);
      setLabSession(advanced);
      setLabMap(cached.map);
      setLabActiveCandidateId(next.id);
      setLabSelectedChoice("");
      setLabPrefetchedTrialId(null);
      labPrefetchRef.current = null;
      fitMap(size, projectionTransform(cached.map.width, cached.map.height, "FLAT"));
      setLabStatus(`Trial ${next.sequence + 1} is ready. The preceding answer was retained without revealing correctness.`);
      void prefetchIdentityLabTrial(advanced);
    } catch (error) {
      setLabStatus(error instanceof Error ? error.message : "The blind answer could not be recorded.");
    }
  };

  const endAndExportIdentityLab = () => {
    if (!labSession || labSession.status !== "ACTIVE") return;
    labOperationEpochRef.current += 1;
    const ended = endContinuousIdentityLabSession(labSession, new Date().toISOString());
    setLabSession(ended);
    setLabMap(null);
    setLabActiveCandidateId(null);
    setLabPrefetchedTrialId(null);
    setLabLoading(false);
    setLabPrefetching(false);
    labPrefetchRef.current = null;
    setLabStage("RESULTS");
    download(exportIdentityLabEvidence(ended), continuousIdentityLabFileName(ended), "application/json");
    setLabStatus("Session ended and schema v2 evidence downloaded. Accuracy is now available in Results.");
  };

  const exportIdentityEvidence = () => {
    const evidence = labSession ?? labLegacyArchive;
    if (!evidence) return;
    download(exportIdentityLabEvidence(evidence), continuousIdentityLabFileName(evidence), "application/json");
    setLabStatus(evidence.schemaVersion === 1 ? "Archived schema v1 evidence downloaded without inventing v2 timing or choices." : "Schema v2 evidence downloaded with exact recipes, choices, answers, timings, diagnostics and narrative assessment.");
  };

  const importIdentityEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = importIdentityLabEvidence(await file.text());
      labOperationEpochRef.current += 1;
      setLabLoading(false);
      setLabPrefetching(false);
      setLabMap(null);
      setLabActiveCandidateId(null);
      setLabPrefetchedTrialId(null);
      labPrefetchRef.current = null;
      if (isContinuousIdentityLabSession(imported)) {
        setLabSession(imported);
        setLabLegacyArchive(null);
        setLabStage(imported.status === "ENDED" ? "RESULTS" : "REVIEW");
        setLabStatus(`${file.name} imported as schema v2${imported.status === "ENDED" ? ". Review its completed evidence." : ". Regenerating the current trial and bounded prefetch."}`);
        if (imported.status === "ACTIVE") void openIdentityLabTrial(imported);
      } else {
        setLabSession(null);
        setLabLegacyArchive(imported);
        setLabStage("RESULTS");
        setLabStatus(`${file.name} imported as a read-only schema v1 archive. Its judgments were not reinterpreted as timed four-choice trials.`);
      }
    } catch (error) {
      setLabStatus(error instanceof Error ? error.message : "That file is not valid Identity Lab JSON.");
    }
  };

  const copySelection = () => {
    if (!selection) return;
    const width = selection.maxX - selection.minX + 1;
    const height = selection.maxY - selection.minY + 1;
    const tiles: Civ5Tile[] = [];
    for (let y = selection.minY; y <= selection.maxY; y += 1) {
      for (let x = selection.minX; x <= selection.maxX; x += 1) tiles.push({ ...map.tiles[y * map.width + x] });
    }
    setTileClipboard({ width, height, tiles });
    setMessage(`${width} × ${height} region copied`);
  };

  const disableGameBreakingGeometry = () => {
    setAllowGameBreakingGeometry(false);
    setShowGameBreakingGeometryConfirmation(false);
    setGenerationOptions((current) => {
      const unsafeSize = isGameBreakingMapSize(current.size);
      const huge = MAP_SIZES.find((size) => size.id === "HUGE")!;
      return {
        ...current,
        geometry: isGameBreakingGeometry(current.geometry) ? "STANDARD" : current.geometry,
        size: unsafeSize ? "HUGE" : current.size,
        players: unsafeSize ? huge.recommendedPlayers : current.players,
        cityStates: unsafeSize ? huge.recommendedCityStates : current.cityStates,
      };
    });
  };

  const requestGameBreakingGeometry = () => setShowGameBreakingGeometryConfirmation(true);

  const confirmGameBreakingGeometry = () => {
    setShowGameBreakingGeometryConfirmation(false);
    setAllowGameBreakingGeometry(true);
    setMessage("Game-breaking generation enabled · oversized or extreme maps may crash Civ V");
  };

  const selectGenerationEngine = (engine: MapGenerationOptions["engine"]) => {
    const definition = GENERATION_ENGINES.find((item) => item.id === engine)!;
    const preset = MAP_PRESETS.find((item) => item.id === definition.preset)!;
    setGenerationOptions((current) => {
      if (engine === "ECCENTRIC") return { ...current, engine, preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, riverDensity: preset.riverDensity ?? current.riverDensity, style: "FANTASTICAL", climateRealism: preset.climateRealism ?? false, fantasticality: fantasticalityForPreset(preset.id), regionClimateLogic: preset.climateRealism ? "ORDERED" : "LAWLESS", eccentricExtreme: "NONE" };
      if (engine === "PHYSICAL") return { ...current, engine, preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, riverDensity: preset.riverDensity ?? current.riverDensity, climateRealism: true, plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity, erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength, worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge, climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate, rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall, physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation, physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality, physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence };
      if (engine === "POLIS") return { ...current, engine, preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, climateRealism: false, polisConflictPattern: polisPatternForPreset(preset.id) };
      return { ...current, engine, preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains };
    });
  };

  const stepGenerationEngine = (direction: -1 | 1) => {
    const currentIndex = GENERATION_ENGINES.findIndex((item) => item.id === generationOptions.engine);
    const nextIndex = (currentIndex + direction + GENERATION_ENGINES.length) % GENERATION_ENGINES.length;
    selectGenerationEngine(GENERATION_ENGINES[nextIndex].id);
  };

  const generateNewMap = async () => {
    setShowLegend(false);
    setCreateOperationError("");
    const options = normalizeGenerationOptions(generationOptions, allowGameBreakingGeometry);
    if (options !== generationOptions) setGenerationOptions(options);
    try {
      const baseRecipe = generationRecipeFromOptions(options);
      const recipe = { ...baseRecipe, scale: generationScale, archetype: generationArchetype, archetypeIntensity: generationArchetypeIntensity, effort: generationEffort, matchIntent: { ...matchIntent, seats: matchIntent.seats?.slice(0, options.players).map((seat) => ({ ...seat })), flexiblePlayers: Math.max(0, options.players - matchIntent.humanPlayers - matchIntent.aiPlayers), balanceMode: options.balance, teamSize: options.teamSize, teamLayout: options.teamLayout, strategicBalance: options.strategicBalance } } satisfies GenerationRecipe;
      const generated = await generateMapAsync(options, recipe);
      replaceMap(generated);
      setProjectScenario(null);
      if (!projectId) setProjectName(`${generated.name} Project`);
      const id = ++generationIdRef.current;
      setGenerationHistory((history) => addGenerationToHistory(history, generated, id, { parentId: activeGenerationId ?? undefined, operation: "GENERATE" }));
      setActiveGenerationId(id);
      setMode("CREATE");
      setMessage(`${generated.name} · generated from seed ${options.seed}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const detail = error instanceof Error ? error.message : "Map generation failed.";
        setCreateOperationError(detail);
        setMessage(detail);
      }
    }
  };

  const randomiseWorld = async (mobileSafe = false) => {
    setShowLegend(false);
    setCreateOperationError("");
    const randomizedRecipe = randomGenerationRecipe(Math.random, mobileSafe ? false : allowGameBreakingGeometry);
    const options = generationOptionsFromRecipe(randomizedRecipe);
    setGenerationOptions(options);
    setGenerationScale(randomizedRecipe.scale);
    setGenerationArchetype(randomizedRecipe.archetype);
    setGenerationArchetypeIntensity(randomizedRecipe.archetypeIntensity);
    setGenerationEffort("STANDARD");
    setMatchIntent(randomizedRecipe.matchIntent);
    try {
      const generated = await generateMapAsync(options, { ...randomizedRecipe, effort: "STANDARD" });
      replaceMap(generated);
      setProjectScenario(null);
      if (!projectId) setProjectName(`${generated.name} Project`);
      const id = ++generationIdRef.current;
      setGenerationHistory((history) => addGenerationToHistory(history, generated, id, { operation: "RANDOMISE" }));
      setActiveGenerationId(id);
      setMessage(`${generated.name} · every generation option randomised`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const detail = error instanceof Error ? error.message : "Random generation failed.";
        setCreateOperationError(detail);
        setMessage(detail);
      }
    }
  };

  const openGeneration = (entry: GenerationHistoryEntry) => {
    setCreateOperationError("");
    try {
      const restored = restoreGeneration(entry);
      setShowLegend(false);
      replaceMap(restored);
      setProjectScenario(null);
      setActiveGenerationId(entry.id);
      if (restored.recipe) {
        setGenerationOptions(normalizeGenerationOptions(generationOptionsFromRecipe(restored.recipe), allowGameBreakingGeometry));
        setGenerationScale(restored.recipe.scale);
        setGenerationArchetype(restored.recipe.archetype);
        setGenerationArchetypeIntensity(restored.recipe.archetypeIntensity ?? "STRONG");
        setGenerationEffort(restored.recipe.effort);
        setMatchIntent(restored.recipe.matchIntent);
      } else if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation, allowGameBreakingGeometry));
      setMode("CREATE");
      setMessage(`${restored.name} · restored from generation history`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Generation history could not be restored.";
      setCreateOperationError(detail);
      setMessage(`${detail} · current map and Create stage retained`);
    }
  };

  const loadGenerationDesignRecipe = (entry: GenerationHistoryEntry) => {
    const restored = entry.map;
    if (restored.recipe) {
      setGenerationOptions(normalizeGenerationOptions(generationOptionsFromRecipe(restored.recipe), allowGameBreakingGeometry));
      setGenerationScale(restored.recipe.scale);
      setGenerationArchetype(restored.recipe.archetype);
      setGenerationArchetypeIntensity(restored.recipe.archetypeIntensity ?? "STRONG");
      setGenerationEffort(restored.recipe.effort);
      setMatchIntent(restored.recipe.matchIntent);
    } else if (restored.generation) {
      const normalized = normalizeGenerationOptions(restored.generation, allowGameBreakingGeometry);
      setGenerationOptions(normalized);
      setGenerationScale("GLOBAL");
      setGenerationArchetype("NARRATIVE_DEFAULT");
      setGenerationArchetypeIntensity("STRONG");
      setGenerationEffort("STANDARD");
      setMatchIntent(generationRecipeFromOptions(normalized).matchIntent);
    } else return;
    setCreateView("GENERATE");
    setMessage(`Generation ${entry.id} recipe loaded into Design · current map unchanged`);
  };

  const selectCreateStage = (stage: CreateStage) => {
    setCreateView(stage);
    setCreateOperationError("");
  };

  const recordCreateDisclosure = useCallback((stage: CreateStage, key: string, open: boolean) => {
    setCreateDisclosureState((current) => current[stage][key] === open ? current : { ...current, [stage]: { ...current[stage], [key]: open } });
  }, []);

  const randomizeSeed = () => {
    const seed = Math.random().toString(36).slice(2, 10);
    setGenerationOptions((current) => ({ ...current, seed }));
  };

  const runSelectivePass = async (stage: RegenerationStage) => {
    setCreateOperationError("");
    const variation = ++regenerationIdRef.current;
    const options = normalizeGenerationOptions(generationOptions, allowGameBreakingGeometry);
    if (options !== generationOptions) setGenerationOptions(options);
    try {
      const baseRecipe = generationRecipeFromOptions(options);
      const recipe = { ...baseRecipe, scale: generationScale, archetype: generationArchetype, archetypeIntensity: generationArchetypeIntensity, effort: generationEffort, matchIntent: { ...matchIntent, seats: matchIntent.seats?.slice(0, options.players).map((seat) => ({ ...seat })), flexiblePlayers: Math.max(0, options.players - matchIntent.humanPlayers - matchIntent.aiPlayers), balanceMode: options.balance, teamSize: options.teamSize, teamLayout: options.teamLayout, strategicBalance: options.strategicBalance } } satisfies GenerationRecipe;
      const regenerated = await regenerateMapAsync(map, options, stage, variation, recipe, protectionState);
      const protectedResult = applyProtectionState(map, regenerated, protectionState);
      if (protectedResult.blocked) {
        const detail = `Regeneration blocked · ${protectedResult.conflicts.join(" ")}`;
        setCreateOperationError(detail);
        setMessage(`${detail} · current map and Create stage retained`);
        return;
      }
      const accepted = protectedResult.map;
      if (protectionState.tileMask || protectionState.semantic.length) setProtectionState((current) => ({ ...cloneProtectionState(current), lastReport: protectedResult.report }));
      if (stage === "CLIMATE") {
        setArchetypePreviewMap(accepted);
        setArchetypePreviewView("DIFFERENCE");
        setMessage(`${generationArchetype === "EXISTING" ? "Existing surface retained" : `${generationArchetype.toLowerCase().replaceAll("_", " ")} candidate ready`} · review the Difference preview before applying`);
        return;
      }
      replaceMap(accepted);
      if (accepted.generation) setGenerationOptions(normalizeGenerationOptions(accepted.generation, allowGameBreakingGeometry));
      const id = ++generationIdRef.current;
      const operation = `SELECTIVE_${stage}` as const;
      setGenerationHistory((history) => addGenerationToHistory(history, accepted, id, { parentId: activeGenerationId ?? undefined, operation }));
      setActiveGenerationId(id);
      setComparisonCheckpointId(null);
      setComparisonView("CURRENT");
      const labels: Record<RegenerationStage, string> = { WORLD: "world", CLIMATE: "climate and biomes", RIVERS: "river network", CONTENT: "resources and sites", STARTS: "players and starts" };
      setMessage(`${labels[stage]} regenerated${protectionState.tileMask || protectionState.semantic.length ? ` · ${protectedResult.report.summary}` : ""} · other compatible layers retained`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const detail = error instanceof Error ? error.message : "Selective regeneration failed.";
        setCreateOperationError(detail);
        setMessage(detail);
      }
    }
  };

  const cancelArchetypePreview = () => {
    setArchetypePreviewMap(null);
    setArchetypePreviewView("DIFFERENCE");
    setMessage("Archetype preview discarded · current map unchanged");
  };

  const confirmArchetypePreview = () => {
    if (!archetypePreviewMap) return;
    const accepted = archetypePreviewMap;
    replaceMap(accepted);
    if (accepted.generation) setGenerationOptions(normalizeGenerationOptions(accepted.generation, allowGameBreakingGeometry));
    const id = ++generationIdRef.current;
    setGenerationHistory((history) => addGenerationToHistory(history, accepted, id, { parentId: activeGenerationId ?? undefined, operation: "SELECTIVE_CLIMATE" }));
    setActiveGenerationId(id);
    setComparisonCheckpointId(null);
    setComparisonView("CURRENT");
    setArchetypePreviewMap(null);
    setArchetypePreviewView("DIFFERENCE");
    setMessage(`${generationArchetype === "EXISTING" ? "Existing surface recipe retained" : `${generationArchetype.toLowerCase().replaceAll("_", " ")} applied`} · generation ${id} added to history`);
  };

  const generateBatch = async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    setBatchCandidates([]);
    setBatchProgress(0);
    setCreateOperationError("");
    const candidates: BatchCandidate[] = [];
    const options = normalizeGenerationOptions(generationOptions, allowGameBreakingGeometry);
    if (options !== generationOptions) setGenerationOptions(options);
    try {
      for (let index = 0; index < batchCount; index += 1) {
        const seed = `${options.seed}-${String(index + 1).padStart(2, "0")}`;
        const generated = await generateMapAsync({ ...options, seed });
        candidates.push(scoreBatchCandidate(generated, seed, index + 1));
        candidates.sort((one, two) => two.score - one.score || one.balance.spread - two.balance.spread);
        setBatchCandidates([...candidates]);
        setBatchProgress(index + 1);
      }
      setMessage(`${batchCount} candidates generated and ranked · best score ${candidates[0]?.score ?? 0}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage(`Batch stopped after ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}.`);
      else {
        const detail = error instanceof Error ? error.message : "Batch generation failed.";
        setCreateOperationError(detail);
        setMessage(detail);
      }
    } finally {
      setBatchRunning(false);
    }
  };

  const openBatchCandidate = (candidate: BatchCandidate) => {
    const restored = cloneMap(candidate.map);
    replaceMap(restored);
    setProjectScenario(null);
    if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation, allowGameBreakingGeometry));
    const id = ++generationIdRef.current;
    setGenerationHistory((history) => addGenerationToHistory(history, restored, id, { parentId: activeGenerationId ?? undefined, operation: "BATCH_SELECTION" }));
    setActiveGenerationId(id);
    setMessage(`${candidate.seed} · selected from batch with score ${candidate.score}`);
  };

  const saveCheckpoint = () => {
    const id = ++checkpointIdRef.current;
    const checkpoint = createMapCheckpoint(map, checkpointName, id);
    setCheckpoints((current) => [checkpoint, ...current].slice(0, 30));
    setProjectDirty(true);
    setCheckpointName("");
    setMessage(`${checkpoint.name} · checkpoint saved`);
  };

  const restoreCheckpoint = (checkpoint: MapCheckpoint) => {
    setCreateOperationError("");
    try {
      const restored = restoreMapCheckpoint(checkpoint);
      replaceMap(restored);
      if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation, allowGameBreakingGeometry));
      setComparisonCheckpointId(null);
      setComparisonView("CURRENT");
      setMessage(`${checkpoint.name} · checkpoint restored`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Checkpoint could not be restored.";
      setCreateOperationError(detail);
      setMessage(`${detail} · current map and Create stage retained`);
    }
  };

  const compareCheckpoint = (checkpoint: MapCheckpoint) => {
    setComparisonCheckpointId(checkpoint.id);
    setComparisonView("DIFFERENCE");
    setMessage(`${checkpoint.name} · showing changes from checkpoint`);
  };

  const applyWorldStructure = () => {
    if (!selection) return;
    const variation = ++regenerationIdRef.current;
    const structured = applyStructureOperation(map, selection, structureOperation, structureStrength, generationOptions, variation);
    replaceMap(structured);
    setMessage(`${structureOperation.toLowerCase().replaceAll("_", " ")} applied to selected world region · undo available`);
  };

  const selectedTileIndices = () => {
    if (!selection) return [];
    const indices: number[] = [];
    for (let y = selection.minY; y <= selection.maxY; y += 1) for (let x = selection.minX; x <= selection.maxX; x += 1) indices.push(y * map.width + x);
    return indices;
  };

  const commitProtection = (next: ProtectionState) => {
    setPastProtectionStates((past) => [...past.slice(-49), cloneProtectionState(protectionState)]);
    setFutureProtectionStates([]);
    setProtectionState(cloneProtectionState(next));
    setProjectDirty(true);
  };

  const undoProtection = () => {
    const previous = pastProtectionStates.at(-1);
    if (!previous) return;
    setFutureProtectionStates((future) => [cloneProtectionState(protectionState), ...future.slice(0, 49)]);
    setPastProtectionStates((past) => past.slice(0, -1));
    setProtectionState(cloneProtectionState(previous));
    setProjectDirty(true);
    setMessage("Protection change undone");
  };

  const redoProtection = () => {
    const next = futureProtectionStates[0];
    if (!next) return;
    setPastProtectionStates((past) => [...past.slice(-49), cloneProtectionState(protectionState)]);
    setFutureProtectionStates((future) => future.slice(1));
    setProtectionState(cloneProtectionState(next));
    setProjectDirty(true);
    setMessage("Protection change restored");
  };

  const preserveSelection = () => {
    const indices = selectedTileIndices();
    if (!indices.length || !preserveChannels.size) return;
    commitProtection(protectTiles(protectionState, map.width, map.height, indices, [...preserveChannels], protectionRegionName.trim() || `Protected region ${(protectionState.tileMask?.namedRegions.length ?? 0) + 1}`));
    setMessage(`${indices.length} tiles protected across ${preserveChannels.size} authoring channels`);
  };

  const eraseSelectionProtection = () => {
    const indices = selectedTileIndices();
    if (!indices.length || !preserveChannels.size) return;
    commitProtection(eraseProtectedTiles(protectionState, indices, [...preserveChannels]));
    setMessage(`${indices.length} tiles erased from ${preserveChannels.size} protection channels`);
  };

  const preserveSemanticSelection = () => {
    if (!semanticProtectionId) return;
    try {
      commitProtection(protectSemanticObject(protectionState, map, semanticProtectionId, semanticProtectionPolicy, semanticProtectionHard));
      setMessage(`${semanticProtectionPolicy.toLowerCase()} semantic protection added${semanticProtectionHard ? " as a hard constraint" : " with degradable tolerance"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The semantic object could not be protected."); }
  };

  const exportLua = () => {
    const baseName = mapExportBaseName(map);
    download(createLuaMapScript(map), `${baseName}.lua`, "text/x-lua;charset=utf-8");
    setMessage(`${baseName}.lua · exported`);
  };

  const exportModInfo = () => {
    const baseName = mapExportBaseName(map);
    download(createModInfo(map, `${baseName}.lua`), `${baseName}.modinfo`, "application/xml;charset=utf-8");
    setMessage(`${baseName}.modinfo · exported`);
  };

  const onLuaFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const source = await file.text();
    const report = inspectLuaMapScript(source);
    setLuaFileName(file.name);
    setLuaSource(source);
    setLuaDependencies([]);
    setLuaPostProcess("");
    setLuaCustomOptions([]);
    setLuaMetadata(null);
    setLuaLogs([]);
    setLuaReport(report);
    setLuaRunStatus(`${file.name} is ready to generate.`);
    setMessage(`${file.name} · loaded into the Lua project`);
  };

  const onLuaDependencyChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    const incoming = await Promise.all(files.map(async (file) => ({ name: file.name, source: await file.text() })));
    setLuaDependencies((current) => mergeLuaDependencies(current, incoming));
    setLuaMetadata(null);
    setMessage(`${files.length} Lua dependenc${files.length === 1 ? "y" : "ies"} added to ${luaFileName || "the project"}`);
  };

  const runLuaProject = async () => {
    if (!luaSource.trim() || luaIsRunning) return;
    const report = inspectLuaMapScript(luaSource);
    setLuaReport(report);
    setLuaIsRunning(true);
    setLuaMetadata(null);
    setLuaRunStatus(`Starting ${luaFileName || "the Lua project"}…`);
    setMessage(`${luaFileName} · running the Lua project…`);
    try {
      if (report.execution === "NATIVE" && !luaDependencies.length && !luaPostProcess.trim()) {
        const result = mapFromLuaScript(luaSource);
        replaceMap(result.map);
        setProjectScenario(null);
        setGenerationOptions(result.map.generation ? normalizeGenerationOptions(result.map.generation, allowGameBreakingGeometry) : generationOptions);
        setLuaLogs([]);
        setLuaRunStatus("Map generated and opened in the editor.");
        setMessage(`${luaFileName} · safely regenerated from embedded settings`);
        return;
      }
      const result = await runLuaMapScript(luaSource, luaFileName, generationOptions, {
        dependencies: luaDependencies,
        customOptions: luaCustomOptions.map((option) => option.selectedValue),
        postProcessSource: luaPostProcess,
      });
      replaceMap(result.map);
      setProjectScenario(null);
      setLuaCustomOptions(result.metadata.options);
      setLuaMetadata(result.metadata);
      setLuaLogs(result.logs);
      const includeDetail = result.metadata.missingIncludes.length
        ? `${result.metadata.missingIncludes.length} include${result.metadata.missingIncludes.length === 1 ? "" : "s"} still missing`
        : `${result.metadata.loadedIncludes.length} include${result.metadata.loadedIncludes.length === 1 ? "" : "s"} resolved`;
      setLuaReport({
        compatible: !result.metadata.missingIncludes.length,
        execution: "SANDBOX",
        title: result.metadata.missingIncludes.length ? "Generated with compatibility gaps" : "Lua project generated",
        details: [
          `${result.metadata.width}×${result.metadata.height} map allocated by the runtime`,
          result.metadata.wraps ? "East/west wrapping enabled" : "Non-wrapping map",
          includeDetail,
          `${result.metadata.options.length} script option${result.metadata.options.length === 1 ? "" : "s"} exposed`,
          `${result.metadata.stages.filter((stage) => stage.status === "COMPLETE").length} pipeline stages completed`,
        ],
      });
      setLuaRunStatus(`Generated ${result.metadata.width}×${result.metadata.height} map and opened it in the editor.`);
      setMessage(`${luaFileName} · Lua project generated an editable map`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The Lua project could not be executed.";
      setLuaReport({ ...report, details: [...report.details, detail] });
      setLuaRunStatus(detail);
      setMessage(`${luaFileName} · ${detail}`);
    } finally {
      setLuaIsRunning(false);
    }
  };

  const labCurrentCandidate = labSession ? currentContinuousIdentityLabTrial(labSession) ?? null : null;
  const labNextCandidate = labSession ? prefetchedContinuousIdentityLabTrial(labSession) ?? null : null;
  const labChoiceOptions = labCurrentCandidate?.choices.map((preset) => ({ id: preset, label: MAP_PRESETS.find((item) => item.id === preset)?.label ?? preset })) ?? [];
  const labCandidateLoaded = Boolean(labCurrentCandidate && labMap && labActiveCandidateId === labCurrentCandidate.id);
  const presetLabel = (preset: MapGenerationOptions["preset"] | undefined) => MAP_PRESETS.find((item) => item.id === preset)?.label ?? preset ?? "Unknown";
  const activeTile = hovered?.tile;
  const workspacePresentation = mode === "VIEW"
    ? { key: "explore", label: "Explore", symbol: "⌖" }
    : mode === "CREATE"
      ? { key: "create", label: "Create", symbol: "+" }
      : mode === "SCENARIO"
        ? { key: "scenario", label: "Scenario", symbol: "§" }
      : mode === "REPAIR"
        ? { key: "repair", label: "Repair", symbol: "◇" }
        : mode === "LAB"
          ? { key: "lab", label: "Lab", symbol: "◫" }
          : { key: "lua", label: "Lua", symbol: "{ }" };
  const workspaceTask = mode === "VIEW"
    ? { stage: "Map inspection", title: "Explore the current world", description: "Inspect terrain, layers, starts, resources and individual tiles without changing the map." }
    : mode === "CREATE"
      ? createView === "GENERATE"
        ? { stage: "Design", title: "World design", description: "Choose the construction engine, geographic narrative, scale, size and top-level world shape." }
        : createView === "REFINE"
          ? { stage: "Refine", title: "World refinement", description: "Set the world character, environmental coat, inhabitants, content and selective surface passes." }
        : createView === "ITERATE"
          ? { stage: "Iterate", title: "Generation workshop", description: "Revisit candidates, compare checkpoints and rerun selected parts of the current world." }
          : createView === "EDIT"
            ? { stage: "Edit", title: "Map editor", description: "Paint tiles, reshape regions and relocate structures or starting positions directly." }
            : { stage: "Review", title: "Narrative, balance and validation", description: "Judge whether the intended Map Type is recognizable, then inspect multiplayer fairness and Civ V export readiness." }
      : mode === "REPAIR"
        ? repairStage === "INSPECT"
          ? { stage: "Inspect", title: "Map audit", description: "Read structural, terrain, river, scenario and start-location findings without mutation controls." }
          : repairStage === "CORRECT"
            ? { stage: "Correct", title: "Proposed corrections", description: "Choose an automation profile and preview only the repairs you are prepared to accept." }
            : { stage: "Validate", title: "Export readiness", description: "Test the corrected preview again and identify anything that still blocks a defensible export." }
        : mode === "SCENARIO"
          ? scenarioStage === "SETUP"
            ? { stage: "Setup", title: "Scenario identity", description: "Define the scenario, lobby intent, slot capacity and ruleset context before assigning its actors." }
            : scenarioStage === "FACTIONS"
              ? { stage: "Factions", title: "Factions and starts", description: "Author explicit civilization slots, teams, control intent and legal map-linked starting plots." }
              : scenarioStage === "WORLD"
                ? { stage: "World", title: "Scenario world", description: "Edit existing cities, territory ownership, declared improvements and road or railroad records." }
                : scenarioStage === "OBJECTIVES"
                  ? { stage: "Objectives", title: "Objectives and briefing", description: "Attach faction or semantic-geography goals while retaining unsupported intentions honestly in the project." }
                  : { stage: "Validate", title: "Scenario export readiness", description: "Check every link and binary boundary, disclose Project-only fields and hand fixable geography to Repair." }
        : mode === "LAB"
          ? labStage === "REVIEW"
            ? { stage: "Blind recognition", title: "Identity Lab", description: "Choose among four plausible Map Types; the next unlabeled map is prefetched and correctness remains hidden until you end." }
            : labStage === "RESULTS"
              ? { stage: "Results", title: "Recognition evidence", description: "Inspect accuracy, confusion pairs and per-identity results retained in the current session." }
              : { stage: "Guide", title: "Evidence contract", description: "Understand the JSON schema and how Lab evidence guides changes to the narrative identities." }
          : luaStage === "SCRIPT"
          ? { stage: "Script", title: "Lua project", description: "Load generator source and dependencies, then edit the script or its post-process hook." }
          : luaStage === "GENERATE"
            ? { stage: "Generate", title: "Lua runtime", description: "Configure exposed options and execute the experimental project into an editable map." }
            : { stage: "Diagnostics", title: "Compatibility report", description: "Inspect runtime stages, unsupported behavior and captured console output." };
  const workspaceContextStatus = mode === "CREATE"
    ? createView === "GENERATE"
      ? generationRunning ? generationStage : `${GENERATION_ENGINES.find((engine) => engine.id === generationOptions.engine)?.label ?? generationOptions.engine} · ${generationOptions.seed}`
      : createView === "REFINE" ? `${generationArchetype.replaceAll("_", " ").toLowerCase()} · ${generationOptions.style.toLowerCase()} character`
        : createView === "ITERATE" ? `${generationHistory.length} of ${MAX_GENERATION_HISTORY} generations retained`
        : createView === "EDIT" ? `${pastMaps.length ? "Edited" : "Unmodified"} · ${selection ? `${selection.maxX - selection.minX + 1}×${selection.maxY - selection.minY + 1} selected` : "No region selected"}`
          : `${narrativeAssessment?.grade ?? "—"} narrative · ${balanceReport.grade} balance · ${validationIssues.filter((issue) => issue.severity !== "INFO").length} validation findings`
    : mode === "REPAIR"
      ? repairStage === "INSPECT" ? `${repairIssues.filter((issue) => issue.severity !== "INFO").length} findings`
        : repairStage === "CORRECT" ? `${repairSelected.size} corrections selected`
          : repairPreviewIssues.some((issue) => issue.severity === "ERROR") ? `${repairPreviewIssues.filter((issue) => issue.severity === "ERROR").length} blockers remain`
            : repairPreviewIssues.length ? `${repairPreviewIssues.length} diagnostics remain` : "Ready for export"
      : mode === "SCENARIO"
        ? scenarioFindings.some((finding) => finding.severity === "ERROR")
          ? `${scenarioFindings.filter((finding) => finding.severity === "ERROR").length} blockers`
          : `${scenarioDraft.factions.filter((faction) => faction.status !== "DISABLED").length} factions · export review ready`
      : mode === "LAB"
        ? labLoading ? generationStage || "Generating blind candidate"
          : labPrefetching ? "Current trial ready · preparing next"
            : labSession ? labSession.status === "ENDED" ? `${labSession.summary.trialsAnswered} trials ended` : `${labSession.summary.trialsAnswered} trials answered`
              : labLegacyArchive ? `${labLegacyArchive.summary.reviewed} archived v1 reviews` : "No Lab session"
        : luaStage === "SCRIPT" ? luaFileName || "No script loaded"
          : luaStage === "GENERATE" ? luaIsRunning ? "Lua project running" : luaMetadata ? "Map generated" : "Awaiting generation"
            : luaReport?.title || "No compatibility report yet";
  const workspaceContextDetail = mode === "LAB"
    ? labSession ? labSession.status === "ENDED" ? "Schema v2 results" : `Blind trial ${(labCurrentCandidate?.sequence ?? 0) + 1}` : labLegacyArchive ? "Read-only schema v1 archive" : "Narrative identity development"
    : map.name;
  const mapMetadataContent = (
    <>
      <div className="map-heading">
        {isEditingMetadata ? (
          <label className="metadata-field metadata-name-field">
            <span>Name</span>
            <input value={draftName} maxLength={160} onChange={(event) => setDraftName(event.target.value)} autoFocus />
          </label>
        ) : (
          <div>
            <p className="eyebrow">{map.source === "demo" ? "Sample map" : map.source === "file" ? "Open map" : map.source === "script" ? "Lua map" : "Generated map"}</p>
            <button className="editable-map-name" type="button" onClick={requestEditMode} aria-haspopup="dialog" title="Edit map name and description">
              <h2>{map.name}</h2>
            </button>
          </div>
        )}
        <div className="map-badges">
          {pastMaps.length > 0 && <span className="dirty-badge">Edited</span>}
          <span className="version-badge" aria-label={`Excogitare version ${APP_VERSION}`}>{`v${APP_VERSION}`}</span>
        </div>
      </div>
      {isEditingMetadata ? (
        <div className="metadata-editor">
          <label className="metadata-field">
            <span>Description</span>
            <textarea value={draftDescription} maxLength={2000} rows={4} onChange={(event) => setDraftDescription(event.target.value)} />
          </label>
          <div className="metadata-actions">
            <button type="button" onClick={cancelEditMode}>Cancel</button>
            <button className="save-metadata" type="button" disabled={!draftName.trim()} onClick={saveMetadata}>Save changes</button>
          </div>
        </div>
      ) : (
        <button className="editable-map-description" type="button" onClick={requestEditMode} aria-haspopup="dialog" title="Edit map name and description">
          {map.description || "Physical terrain extracted from the Civ5 map file."}
        </button>
      )}
    </>
  );
  return (
    <main className={`viewer-app workspace-${workspacePresentation.key}${mode === "VIEW" ? "" : " has-workspace-context"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div>
            <h1>Excogitare</h1>
          </div>
        </div>
        <nav className="workspace-navigation" aria-label="Workspaces">
          <span className="workspace-navigation-label">Workspaces</span>
          <div className="workspace-tabs">
            {(["VIEW", "CREATE", "SCENARIO", "REPAIR", "LAB", "SCRIPT"] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-tooltip={item === "VIEW" ? "Inspect map statistics, terrain, layers, starts, resources, and individual tiles." : item === "CREATE" ? "Design a generated world, iterate on it, edit tiles and structures, then review balance and validity." : item === "SCENARIO" ? "Turn the current geography into an authored Scenario with factions, cities, ownership, objectives and export validation." : item === "REPAIR" ? "Inspect a Civ5Map, choose corrections, and validate the repaired result." : item === "LAB" ? "Run development-stage blind Map Type recognition sessions and export evidence for generator iteration." : "Experimentally edit, generate, and diagnose Civ V Lua map projects."}
                className={`workspace-tab workspace-tab-${item === "VIEW" ? "explore" : item === "CREATE" ? "create" : item === "SCENARIO" ? "scenario" : item === "REPAIR" ? "repair" : item === "LAB" ? "lab" : "lua"}${mode === item ? " is-active" : ""}${item === "SCRIPT" ? " lua-mode-tab" : ""}`}
                aria-current={mode === item ? "page" : undefined}
                aria-expanded={item === "VIEW" ? undefined : mode === item}
                aria-controls={item === "CREATE" ? "create-workspace-navigation" : item === "SCENARIO" ? "scenario-workspace-navigation" : item === "REPAIR" ? "repair-workspace-navigation" : item === "LAB" ? "lab-workspace-navigation" : item === "SCRIPT" ? "lua-workspace-navigation" : undefined}
                onClick={() => selectWorkspaceMode(item)}
              >
                <span className="workspace-tab-symbol" aria-hidden="true">{item === "VIEW" ? "⌖" : item === "CREATE" ? "+" : item === "SCENARIO" ? "§" : item === "REPAIR" ? "◇" : item === "LAB" ? "◫" : "{ }"}</span>
                <span>{item === "VIEW" ? "Explore" : item === "CREATE" ? "Create" : item === "SCENARIO" ? "Scenario" : item === "REPAIR" ? "Repair" : item === "LAB" ? "Lab" : "Lua"}</span>
                {item === "LAB" && <span className="development-badge">Development</span>}
                {item === "SCRIPT" && <span className="experimental-badge">Experimental</span>}
              </button>
            ))}
          </div>
        </nav>
        <div className="topbar-actions">
          {mode !== "LAB" && (
          <>
          <div className={`project-status${projectDirty ? " is-unsaved" : projectLastSavedAt ? " is-downloaded" : ""}`} aria-label={`${projectName}, ${projectDirty ? "unsaved changes" : projectLastSavedAt ? "downloaded project" : "not yet downloaded"}`} data-tooltip={`${projectName} · ${projectDirty ? "Unsaved changes—download the project to retain them." : projectLastSavedAt ? "Downloaded project; later changes will be marked unsaved." : "Local session—not yet downloaded."}`}>
            <span>{projectName}</span><small>{projectDirty ? "Unsaved" : projectLastSavedAt ? "Downloaded" : "Local session"}</small>
          </div>
          <div className="history-actions" aria-label="Edit history">
            <button type="button" data-tooltip="Undo the most recent map edit while preserving the current zoom and pan." onClick={undo} disabled={!pastMaps.length} title="Undo" aria-label="Undo">↶</button>
            <button type="button" data-tooltip="Restore the most recently undone map edit while preserving the current zoom and pan." onClick={redo} disabled={!futureMaps.length} title="Redo" aria-label="Redo">↷</button>
          </div>
          {mode !== "CREATE" && <button className="button button-secondary button-export-view" type="button" data-tooltip="Export the current rendered view as a transparent-background PNG at high resolution." onClick={exportView}>Export PNG</button>}
          <button className="button button-secondary button-new-project" type="button" data-tooltip="Begin a new unsaved project from the current generated or imported map." onClick={beginNewProject}>New project</button>
          <button className="button button-secondary" type="button" data-tooltip={`${projectName} · ${projectDirty ? "Unsaved. " : ""}Choose a history policy, then download a compressed, SHA-256 verified Excogitare project.`} onClick={requestProjectExport}>Save project</button>
          <button className="button button-secondary" type="button" data-tooltip="Open a downloaded .excogitare ZIP bundle or migrate a legacy v1 project without relying on browser persistence." onClick={() => projectInputRef.current?.click()}>Open project</button>
          {mode === "SCRIPT" && <button className="button button-secondary button-export-script" type="button" data-tooltip="Download the current map as an Excogitare-compatible Lua generation script." onClick={exportLua}>Export Lua</button>}
          {mode === "SCRIPT" && <button className="button button-secondary button-export-script" type="button" data-tooltip="Download a Civ V mod manifest for the exported Lua map script." onClick={exportModInfo}>Export .modinfo</button>}
          <button
            className="button button-secondary button-export-map"
            type="button"
            onClick={exportCiv5Map}
            disabled={isEditingMetadata}
            data-tooltip={isEditingMetadata ? "Save the map name and description before exporting." : "Validate and download the current edited map as a Civ V .Civ5Map file."}
            title={isEditingMetadata ? "Save your edits before exporting" : "Export the current Civ5Map file"}
          >
            Export Civ5Map
          </button>
          <button className="button button-primary" type="button" data-tooltip="Open a .Civ5Map file from this device for inspection, editing, or repair." onClick={() => fileInputRef.current?.click()}>Open map</button>
          </>
          )}
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".civ5map,.Civ5Map,application/octet-stream" onChange={onFileChange} />
          <input ref={luaInputRef} className="visually-hidden" type="file" accept=".lua,text/x-lua,text/plain" onChange={onLuaFileChange} />
          <input ref={luaDependencyInputRef} className="visually-hidden" type="file" multiple accept=".lua,text/x-lua,text/plain" onChange={onLuaDependencyChange} />
          <input ref={labInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => void importIdentityEvidence(event)} />
          <input ref={projectInputRef} className="visually-hidden" type="file" accept=".excogitare,application/vnd.excogitare.project+zip,application/vnd.excogitare.project+json,application/zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importProject(file); }} />
        </div>
      </header>

      {mode !== "VIEW" && (
        <section className="workspace-context-bar" aria-label={`${workspacePresentation.label} workspace navigation`}>
          <div className="workspace-context-identity">
            <span className="workspace-context-symbol" aria-hidden="true">{workspacePresentation.symbol}</span>
            <span><small>{workspacePresentation.label} workspace</small><strong>{workspaceTask.stage}</strong></span>
          </div>
          {mode === "CREATE" && (
            <CreateStageTabs active={createView} onChange={selectCreateStage} />
          )}
          {mode === "SCENARIO" && (
            <ScenarioStageTabs active={scenarioStage} onChange={(stage) => { setScenarioStage(stage); setScenarioPlacementFactionId(""); }} />
          )}
          {mode === "REPAIR" && (
            <div id="repair-workspace-navigation" className="workspace-stage-tabs" role="tablist" aria-label="Repair workspace">
              <button type="button" role="tab" aria-controls="repair-workspace-panel" aria-selected={repairStage === "INSPECT"} className={repairStage === "INSPECT" ? "is-active" : ""} data-tooltip="Read structural, terrain, river, scenario, and start-location findings without changing the map." onClick={() => setRepairStage("INSPECT")}>Inspect</button>
              <button type="button" role="tab" aria-controls="repair-workspace-panel" aria-selected={repairStage === "CORRECT"} className={repairStage === "CORRECT" ? "is-active" : ""} data-tooltip="Select an automation profile, preview individual corrections, and apply the repairs you accept." onClick={() => setRepairStage("CORRECT")}>Correct</button>
              <button type="button" role="tab" aria-controls="repair-workspace-panel" aria-selected={repairStage === "VALIDATE"} className={repairStage === "VALIDATE" ? "is-active" : ""} data-tooltip="Run the repair tests against the corrected preview and review any remaining blockers before export." onClick={() => setRepairStage("VALIDATE")}>Validate</button>
            </div>
          )}
          {mode === "SCRIPT" && (
            <div id="lua-workspace-navigation" className="workspace-stage-tabs lua-stage-tabs" role="tablist" aria-label="Lua workspace">
              <button type="button" role="tab" aria-controls="lua-workspace-panel" aria-selected={luaStage === "SCRIPT"} className={luaStage === "SCRIPT" ? "is-active" : ""} data-tooltip="Load the main script and its dependencies, then edit generator functions and the post-process hook." onClick={() => setLuaStage("SCRIPT")}>Script</button>
              <button type="button" role="tab" aria-controls="lua-workspace-panel" aria-selected={luaStage === "GENERATE"} className={luaStage === "GENERATE" ? "is-active" : ""} data-tooltip="Configure exposed script options and fallback runtime values, then execute the project." onClick={() => setLuaStage("GENERATE")}>Generate</button>
              <button type="button" role="tab" aria-controls="lua-workspace-panel" aria-selected={luaStage === "DIAGNOSTICS"} className={luaStage === "DIAGNOSTICS" ? "is-active" : ""} data-tooltip="Inspect compatibility findings, execution stages, missing APIs, and script-console output." onClick={() => setLuaStage("DIAGNOSTICS")}>Diagnostics</button>
            </div>
          )}
          {mode === "LAB" && (
            <div id="lab-workspace-navigation" className="workspace-stage-tabs lab-stage-tabs" role="tablist" aria-label="Lab workspace">
              <button type="button" role="tab" aria-controls="lab-workspace-panel" aria-selected={labStage === "REVIEW"} className={labStage === "REVIEW" ? "is-active" : ""} disabled={Boolean(labLegacyArchive) || labSession?.status === "ENDED"} data-tooltip="Choose one of four plausible Map Types and automatically continue to the prefetched trial without correctness feedback." onClick={() => setLabStage("REVIEW")}>Review</button>
              <button type="button" role="tab" aria-controls="lab-workspace-panel" aria-selected={labStage === "RESULTS"} className={labStage === "RESULTS" ? "is-active" : ""} disabled={!labLegacyArchive && labSession?.status !== "ENDED"} data-tooltip="Available only after End and export, so accuracy cannot contaminate an active blind session." onClick={() => setLabStage("RESULTS")}>Results</button>
              <button type="button" role="tab" aria-controls="lab-workspace-panel" aria-selected={labStage === "GUIDE"} className={labStage === "GUIDE" ? "is-active" : ""} data-tooltip="Read how the exported JSON maps human evidence to the narrative identities guide." onClick={() => setLabStage("GUIDE")}>Guide</button>
            </div>
          )}
          <div className="workspace-context-status" role="status"><strong>{workspaceContextStatus}</strong><small>{workspaceContextDetail}</small></div>
        </section>
      )}

      <section className="workspace">
        <aside ref={sidebarRef} className="sidebar" aria-label="Map information and layers" onScroll={(event) => { if (mode === "CREATE") createScrollPositionsRef.current[createView] = event.currentTarget.scrollTop; }}>
          {mode !== "CREATE" && (
            <header className="workspace-masthead">
              <p><span aria-hidden="true">{workspacePresentation.symbol}</span>{workspacePresentation.label} / {workspaceTask.stage}</p>
              <h2>{workspaceTask.title}</h2>
              <span>{workspaceTask.description}</span>
            </header>
          )}
          {mode === "CREATE" && (
            <button className="randomise-world-button" type="button" data-tooltip="Choose a completely new safe combination of generation settings and immediately build the resulting map." disabled={generationRunning} onClick={() => void randomiseWorld()}>
              <span>Randomise</span><small>{generationRunning ? generationStage : allowGameBreakingGeometry ? "New map from every option" : "New map from Civ V-safe options"}</small>
            </button>
          )}
          {mode === "VIEW" ? (
            <section className="explore-map-identity" aria-label="Current map details">{mapMetadataContent}</section>
          ) : mode !== "LAB" ? (
            <details key={`${mode}-${isEditingMetadata ? "editing" : "idle"}`} className="current-map-disclosure" open={isEditingMetadata || undefined}>
              <summary data-tooltip="Expand the current map name, description, edit state and version without leaving this workspace.">
                <span>Current map</span>
                <strong>{map.name}</strong>
                <small>{pastMaps.length ? "Edited" : map.source === "file" ? "Imported" : map.source === "script" ? "Lua generated" : "Generated"} · v{APP_VERSION}</small>
              </summary>
              <div className={`current-map-body${isEditingMetadata ? " is-editing" : ""}`}>{mapMetadataContent}</div>
            </details>
          ) : null}

          {showEditPrompt && !isEditingMetadata && (
            <div className="edit-mode-prompt" role="dialog" aria-label="Enter Edit Mode">
              <strong>Enter Edit Mode?</strong>
              <p>Change this map&apos;s name and description. Saved changes will be included in the exported Civ5Map.</p>
              {!sourceFile && <small>Open a Civ5Map file to enable binary export.</small>}
              <div>
                <button type="button" onClick={() => setShowEditPrompt(false)}>Not now</button>
                <button className="confirm-edit" type="button" onClick={enterEditMode}>Edit details</button>
              </div>
            </div>
          )}

          {mode === "LAB" && (
            <div id="lab-workspace-panel" className="identity-lab-panel">
              {!labSession && !labLegacyArchive && labStage !== "GUIDE" ? (
                <>
                  <section className="lab-introduction">
                    <div className="section-title"><h3>Continuous blind recognition</h3><span>33 narratives</span></div>
                    <p>Each trial generates one unlabeled Map Type and exactly four plausible choices drawn from the narrative guide&apos;s nearest confusions. Correctness remains hidden until you end the session.</p>
                  </section>
                  <section className="lab-session-builder">
                    <div className="section-title"><h3>New continuous session</h3><span>ends when you choose</span></div>
                    <label className="control-field"><span>World character</span><select value={labStyle} onChange={(event) => setLabStyle(event.target.value as MapGenerationOptions["style"])}><option value="MUNDANE">Mundane · baseline recognition</option><option value="REALISTIC">Realistic</option><option value="FANTASTICAL">Fantastical</option><option value="BRUTAL">Brutal</option></select></label>
                    <label className="control-field"><span>Map size</span><select value={labSize} onChange={(event) => setLabSize(event.target.value as MapGenerationOptions["size"])}><option value="SMALL">Small · faster</option><option value="STANDARD">Standard · recommended</option><option value="HUGE">Huge · detailed</option></select></label>
                    <label className="control-field"><span>Session seed</span><input value={labSessionSeed} maxLength={80} onChange={(event) => setLabSessionSeed(event.target.value)} /></label>
                    <button className="lab-primary-action" type="button" disabled={labLoading || !labSessionSeed.trim()} onClick={startIdentityLabSession}>Start continuous session</button>
                    <button className="lab-secondary-action" type="button" onClick={() => labInputRef.current?.click()}>Import session JSON</button>
                  </section>
                </>
              ) : labStage === "REVIEW" && labCurrentCandidate && labSession ? (
                <>
                  <section className="lab-candidate-header">
                    <div><span>Trial {labCurrentCandidate.sequence + 1}</span><strong>Identity hidden</strong><small>4 choices · {labSession.configuration.style.toLowerCase()} character · schema v2</small></div>
                    <div className="lab-prefetch-state" aria-label="Bounded prefetch status"><span>{labPrefetching ? "Preparing next" : labPrefetchedTrialId === labNextCandidate?.id ? "Next ready" : "Next unavailable"}</span></div>
                  </section>
                  <p className="lab-status" role="status">{labStatus}</p>
                  {!labCandidateLoaded && (
                    <button className="lab-primary-action" type="button" disabled={labLoading} onClick={() => void openIdentityLabTrial(labSession)}>{labLoading ? generationStage || "Generating…" : labCurrentCandidate.generationError ? "Retry current trial" : "Generate current trial"}</button>
                  )}
                  {labCandidateLoaded && (
                    <section className="lab-review-form" aria-label="Blind Map Type review">
                      <fieldset className="lab-four-choice"><legend>Which Map Type does this world express?</legend>{labChoiceOptions.map((choice, index) => <button key={choice.id} type="button" aria-pressed={labSelectedChoice === choice.id} className={labSelectedChoice === choice.id ? "is-active" : ""} onClick={() => setLabSelectedChoice(choice.id)}><span>Option {String.fromCharCode(65 + index)}</span><strong>{choice.label}</strong></button>)}</fieldset>
                      <p className="lab-blind-caveat">No answer, target, engine or score is revealed between trials. Prior records retain recipes and evidence—not map snapshots.</p>
                      <button className="lab-primary-action" type="button" disabled={!labSelectedChoice || labPrefetching || labPrefetchedTrialId !== labNextCandidate?.id} onClick={submitIdentityGuess}>{labPrefetching ? "Preparing next map…" : "Submit and continue"}</button>
                      {!labPrefetching && labPrefetchedTrialId !== labNextCandidate?.id && <button className="lab-secondary-action" type="button" onClick={() => void prefetchIdentityLabTrial(labSession)}>Retry next-map prefetch</button>}
                    </section>
                  )}
                  <div className="lab-session-actions"><button className="lab-end-action" type="button" onClick={endAndExportIdentityLab}>End and export</button><button type="button" onClick={() => labInputRef.current?.click()}>Import JSON</button></div>
                </>
              ) : labStage === "RESULTS" && (labSession?.status === "ENDED" || labLegacyArchive) ? (
                <section className="lab-results">
                  {labSession ? <>
                    <div className="lab-score-grid"><div><strong>{labSession.summary.trialsAnswered}</strong><span>Trials</span></div><div><strong>{labSession.summary.accuracyPercent}%</strong><span>Accuracy</span></div><div><strong>{(labSession.summary.averageResponseTimeMs / 1000).toFixed(1)}s</strong><span>Mean response</span></div></div>
                    <div className="section-title"><h3>By narrative identity</h3><span>schema v2</span></div>
                    <div className="lab-identity-results">{labSession.summary.byIdentity.filter((result) => result.answered).map((result) => <div key={result.targetPreset}><span><strong>{presetLabel(result.targetPreset)}</strong><small>{result.answered} answered</small></span><span>{result.correct} correct · {result.accuracyPercent}%</span></div>)}</div>
                    <div className="section-title"><h3>Confusion pairs</h3><span>{labSession.summary.confusions.length}</span></div>
                    {labSession.summary.confusions.length ? <div className="lab-confusions">{labSession.summary.confusions.map((confusion) => <div key={`${confusion.targetPreset}-${confusion.selectedPreset}`}><span>{presetLabel(confusion.targetPreset)}</span><b>→</b><span>{presetLabel(confusion.selectedPreset)}</span><strong>{confusion.count}</strong></div>)}</div> : <p className="workspace-empty-state">No incorrect recognition pair was recorded.</p>}
                  </> : labLegacyArchive ? <>
                    <div className="section-title"><h3>Archived finite session</h3><span>schema v1 · read only</span></div>
                    <p className="lab-caveat">This evidence remains in its original finite-deck form. Excogitare does not invent response times, four-choice positions or continuous-trial meaning for it.</p>
                    <div className="lab-score-grid"><div><strong>{labLegacyArchive.summary.reviewed}</strong><span>Reviewed</span></div><div><strong>{labLegacyArchive.summary.firstChoicePercent}%</strong><span>First choice</span></div><div><strong>{labLegacyArchive.summary.topTwoPercent}%</strong><span>Top two</span></div></div>
                    <div className="section-title"><h3>Confusion pairs</h3><span>{labLegacyArchive.summary.confusions.length}</span></div>
                    {labLegacyArchive.summary.confusions.length ? <div className="lab-confusions">{labLegacyArchive.summary.confusions.map((confusion) => <div key={`${confusion.intendedPreset}-${confusion.guessedPreset}`}><span>{presetLabel(confusion.intendedPreset)}</span><b>→</b><span>{presetLabel(confusion.guessedPreset)}</span><strong>{confusion.count}</strong></div>)}</div> : <p className="workspace-empty-state">No first-choice confusion was recorded.</p>}
                  </> : null}
                  <p className="lab-status" role="status">{labStatus}</p>
                  <div className="lab-session-actions"><button type="button" onClick={exportIdentityEvidence}>Download JSON</button><button type="button" onClick={() => labInputRef.current?.click()}>Import JSON</button><button type="button" onClick={() => { setLabSession(null); setLabLegacyArchive(null); setLabStage("REVIEW"); }}>New session</button></div>
                </section>
              ) : (
                <section className="lab-guide">
                  <div className="section-title"><h3>How to read the JSON</h3><span>schema v2</span></div>
                  <p>The export is the durable evidence handoff. It contains no uploaded account data or Civ5Map binary; each trial can be regenerated from its exact recipe while prior maps themselves are discarded.</p>
                  <dl>
                    <div><dt><code>narrativeGuide</code></dt><dd>Names version 1 of <code>docs/features/map-type-narrative-identities.md</code>, the specification against which the candidate is judged.</dd></div>
                    <div><dt><code>configuration</code></dt><dd>Records the deterministic session seed, character, size and complete target catalogue.</dd></div>
                    <div><dt><code>trials[].recipe</code></dt><dd>Contains the authoritative recipe used to reproduce that unlabeled map.</dd></div>
                    <div><dt><code>targetPreset / choices</code></dt><dd>Records one intended identity and exactly four deterministically positioned choices drawn first from its nearest confusions.</dd></div>
                    <div><dt><code>selectedPreset / responseTimeMs</code></dt><dd>Records the single blind answer and elapsed viewing time. Neither is scored in the interface before End and export.</dd></div>
                    <div><dt><code>diagnostics / narrativeEvidence</code></dt><dd>Retains structural measurements and the final Narrative Assessment without retaining the generated map snapshot.</dd></div>
                    <div><dt><code>summary.confusions</code></dt><dd>Lists intended-versus-guessed pairs. These identify which narrative rules need iteration.</dd></div>
                  </dl>
                  <p className="lab-caveat">Schema v1 remains importable as a read-only archive. Its finite-deck judgments are never rewritten as v2 timings or four-choice evidence.</p>
                  <div className="section-title"><h3>How it changes generation</h3><span>reviewed loop</span></div>
                  <ol><li>End and export after enough blind trials.</li><li>Attach the JSON or provide its local path in a development task.</li><li>Compare confusion pairs, response times, diagnostics and Narrative Assessments with the guide.</li><li>Change engine rules across repeatable recipes—not individual favorable maps.</li><li>Run a new seeded session after implementation and compare aggregate evidence.</li></ol>
                  <p className="lab-caveat">The Lab never modifies a generator automatically. Narrative changes remain deliberate code changes reviewed against legality, accessibility, determinism and World Character variation.</p>
                  <div className="lab-session-actions"><button type="button" onClick={exportIdentityEvidence}>Export JSON</button><button type="button" onClick={() => labInputRef.current?.click()}>Import JSON</button></div>
                </section>
              )}
            </div>
          )}

          {mode === "SCENARIO" && (
            <ScenarioWorkspace
              map={map}
              draft={scenarioDraft}
              stage={scenarioStage}
              findings={scenarioFindings}
              compatibility={scenarioCompatibilityReport}
              selectedFactionId={selectedScenarioFactionId}
              placementFactionId={scenarioPlacementFactionId}
              hoveredCoordinate={hovered ? { x: hovered.col, y: canvasMap.height - 1 - hovered.row } : undefined}
              onChange={changeScenarioDraft}
              onSelectFaction={setSelectedScenarioFactionId}
              onPlaceFaction={setScenarioPlacementFactionId}
              onApply={applyScenarioPreview}
              onSendToRepair={sendScenarioToRepair}
              onExport={requestScenarioExport}
            />
          )}

          {mode === "REPAIR" && repairBaseline && (
            <div id="repair-workspace-panel" className="repair-panel">
              {repairStage === "INSPECT" && (
                <>
                  <div className="section-title"><h3>Inspect map</h3><span>{repairIssues.filter((issue) => issue.severity !== "INFO").length} findings</span></div>
                  <p className="repair-intro">Read-only tests cover file structure, legal terrain content, complete mountain-to-ocean-or-lake river drainage, scenario records, and start locations.</p>
                  {repairDiagnostics.length > 0 && (
                    <details className="repair-diagnostics" open>
                      <summary>File recovery report</summary>
                      <ul>{repairDiagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}</ul>
                    </details>
                  )}
                  <div className="start-test-summary">
                    <strong>Start-location tests included</strong>
                    <span>Bounds · land access · mountain safety · duplicates · spacing · player count · city-state flags</span>
                    <strong>Scenario-city tests included</strong>
                    <span>Tile links · duplicate IDs · missing records · water and mountain placement</span>
                  </div>
                  <div className="repair-issue-list">
                    {repairIssues.length ? repairIssues.map((issue) => (
                      <div key={issue.id} className={`repair-issue severity-${issue.severity.toLowerCase()}`}>
                        <div className="repair-issue-heading"><span>{issue.severity}</span><span><strong>{issue.title}</strong><small>{issue.category.toLowerCase()} · {issue.confidence.toLowerCase()}</small></span></div>
                        <p>{issue.detail}</p>
                        {issue.x !== undefined && issue.y !== undefined && <button type="button" onClick={() => focusRepairIssue(issue)}>Show tile {issue.x}, {issue.y}</button>}
                      </div>
                    )) : <p className="workspace-empty-state">No repair findings were detected. Validate still performs a final pass against the corrected preview.</p>}
                  </div>
                </>
              )}

              {repairStage === "CORRECT" && (
                <>
                  <div className="section-title"><h3>Correct map</h3><span>{repairSelected.size} selected</span></div>
                  <p className="repair-intro">Choose how aggressive automation may be, inspect the live preview, and apply only the corrections you accept.</p>
                  <div className="repair-profile" role="group" aria-label="Repair profile">
                    {(["SAFE", "STANDARD", "COMPETITIVE"] as const).map((profile) => (
                      <button key={profile} type="button" data-tooltip={profile === "SAFE" ? "Apply only high-confidence structural and scenario corrections." : profile === "STANDARD" ? "Also clean up illegal resources and rebuild complete logical river networks." : "Include competitive start-count, spacing, reachability, and balance-oriented corrections."} className={repairProfile === profile ? "is-active" : ""} onClick={() => selectRepairProfile(profile)}>{profile.toLowerCase()}</button>
                    ))}
                  </div>
                  <small className="repair-profile-note">{repairProfile === "SAFE" ? "Only certain structural and scenario corrections." : repairProfile === "STANDARD" ? "Safe fixes plus guaranteed resource cleanup and complete river-network rebuilding." : "All automated fixes plus competitive start-location review."}</small>
                  <div className="repair-view-tabs" role="tablist" aria-label="Repair comparison view">
                    {(["ORIGINAL", "CORRECTED", "DIFFERENCE"] as const).map((item) => <button key={item} type="button" data-tooltip={item === "ORIGINAL" ? "Show the imported map before any proposed repairs." : item === "CORRECTED" ? "Preview the map after all currently selected corrections." : "Overlay tiles affected by the proposed repair set."} role="tab" aria-selected={repairView === item} className={repairView === item ? "is-active" : ""} onClick={() => setRepairView(item)}>{item.toLowerCase()}</button>)}
                  </div>
                  <p className="repair-preview-note"><strong>Corrected is a live preview.</strong> Applying selected fixes adds them to edit history; exporting can use the preview directly.</p>
                  <div className="repair-issue-list">
                    {repairIssues.map((issue) => (
                      <div key={issue.id} className={`repair-issue severity-${issue.severity.toLowerCase()}${repairSelected.has(issue.id) ? " is-selected" : ""}`}>
                        <label>
                          <input type="checkbox" checked={repairSelected.has(issue.id)} disabled={!issue.mutation} onChange={() => toggleRepairIssue(issue)} />
                          <span><strong>{issue.title}</strong><small>{issue.category.toLowerCase()} · {issue.confidence.toLowerCase()}</small></span>
                        </label>
                        <p>{issue.detail}</p>
                        {issue.x !== undefined && issue.y !== undefined && <button type="button" onClick={() => focusRepairIssue(issue)}>Show tile {issue.x}, {issue.y}</button>}
                      </div>
                    ))}
                  </div>
                  <div className="repair-actions">
                    <button type="button" disabled={!repairSelected.size} onClick={applySelectedRepairs}>Apply selected ({repairSelected.size})</button>
                    <button className="repair-export" type="button" onClick={() => performCiv5MapExport(repairPreviewMap, true)}>Export repaired Civ5Map</button>
                  </div>
                </>
              )}

              {repairStage === "VALIDATE" && (
                <>
                  <div className="section-title"><h3>Validate result</h3><span>{repairPreviewIssues.filter((issue) => issue.severity !== "INFO").length ? `${repairPreviewIssues.filter((issue) => issue.severity !== "INFO").length} remaining` : "ready"}</span></div>
                  <p className="repair-intro">This pass tests the corrected preview—including selected but not yet committed repairs—so the final result can be judged before export.</p>
                  <div className={`repair-validation-summary${repairPreviewIssues.some((issue) => issue.severity === "ERROR") ? " has-errors" : " is-clear"}`}>
                    <strong>{repairPreviewIssues.some((issue) => issue.severity === "ERROR") ? "Blocking findings remain" : repairPreviewIssues.some((issue) => issue.severity === "WARNING") ? "Warnings remain" : "Repair checks pass"}</strong>
                    <span>{repairPreviewIssues.length ? `${repairPreviewIssues.length} total diagnostic finding${repairPreviewIssues.length === 1 ? "" : "s"} on the corrected preview.` : "No structural, placement, river, scenario, or start-location findings remain."}</span>
                  </div>
                  <div className="repair-view-tabs" role="tablist" aria-label="Validated repair view">
                    {(["ORIGINAL", "CORRECTED", "DIFFERENCE"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={repairView === item} className={repairView === item ? "is-active" : ""} onClick={() => setRepairView(item)}>{item.toLowerCase()}</button>)}
                  </div>
                  <div className="repair-issue-list">
                    {repairPreviewIssues.length ? repairPreviewIssues.map((issue) => (
                      <div key={issue.id} className={`repair-issue severity-${issue.severity.toLowerCase()}`}>
                        <div className="repair-issue-heading"><span>{issue.severity}</span><span><strong>{issue.title}</strong><small>{issue.category.toLowerCase()} · corrected preview</small></span></div>
                        <p>{issue.detail}</p>
                      </div>
                    )) : <p className="workspace-empty-state">The corrected preview passes Excogitare&apos;s repair checks. Mod-specific rules and Civ V engine limits remain outside this validation.</p>}
                  </div>
                  <div className="repair-actions repair-validation-actions">
                    <button type="button" onClick={() => setRepairStage("CORRECT")}>Review corrections</button>
                    <button className="repair-export" type="button" onClick={() => performCiv5MapExport(repairPreviewMap, true)}>Export validated Civ5Map</button>
                  </div>
                </>
              )}
            </div>
          )}

          {mode === "CREATE" && (
            <CreateStagePanel stage={createView} disclosureState={createDisclosureState[createView]} onDisclosureChange={recordCreateDisclosure}>
              <CreateOperationStatus running={generationRunning} stage={generationStage} error={createOperationError} onCancel={cancelGeneration} />
              {createView === "GENERATE" || createView === "REFINE" || createView === "ITERATE" ? (
                createView === "ITERATE" ? (
                  <div className="iteration-workspace">
                  <div className="creator-advanced-title"><span>Iteration tools</span><small>Revisit, compare, and refine completed worlds</small></div>
                  {map.structure && (
                    <details className="world-structure-report">
                      <summary data-tooltip="Inspect the geographic objects, ranges, basins, climate regions, river systems, and diagnostics retained by the current generated map."><span>Generated structure</span><small>{map.structure.engine.replaceAll("_", " ").toLowerCase()} · retained for editing</small></summary>
                      <div>
                        <dl>{Object.entries(map.structure.diagnostics).map(([label, value]) => <div key={label}><dt>{label.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>
                        <p>{map.structure.objects.length} geographic objects, {map.structure.mountainRanges.length} mountain ranges, and {map.structure.riverSystems.length} river systems remain attached to this generation.</p>
                        {map.structure.engine === "ECCENTRIC" && <p><strong>Eccentric compiler:</strong> {map.structure.diagnostics.passes ?? 0} retained passes · {map.structure.diagnostics.subregions ?? 0} small regions · {map.structure.diagnostics.climateCollections ?? 0} biome collections · {map.structure.diagnostics.biomeTransitions ?? 0} dissonant borders · {map.structure.diagnostics.astronomyBasins ?? 0} navigation basins.</p>}
                        {map.structure.engine === "PHYSICAL" && <p><strong>Physical system:</strong> {map.structure.diagnostics.passes ?? 0} retained passes · {map.structure.diagnostics.plates ?? 0} plates · {map.structure.diagnostics.atmosphericCells ?? 0} circulation cells · {map.structure.diagnostics.rainShadows ?? 0} rain shadows · {map.structure.diagnostics.glacialRegions ?? 0} glacial regions · {map.structure.diagnostics.watersheds ?? 0} watersheds.</p>}
                        {map.structure.strategicGraph && (
                          <p><strong>Polis graph:</strong> {map.structure.strategicGraph.pattern.replaceAll("_", " ").toLowerCase()} · {map.structure.strategicGraph.symmetry.toLowerCase()} · {map.structure.strategicGraph.edges.length} fronts · {map.structure.strategicGraph.protectedTileIndices.length} protected route and safe-territory tiles{map.structure.strategicGraph.relaxations.length ? ` · ${map.structure.strategicGraph.relaxations.join(" ")}` : " · no hard constraints relaxed"}</p>
                        )}
                        <small>{map.structure.objects.slice(0, 8).map((object) => object.name).join(" · ")}{map.structure.objects.length > 8 ? " · …" : ""}</small>
                      </div>
                    </details>
                  )}
                  <details className="generation-history">
                    <summary data-tooltip="Reopen any of the last 30 maps generated during this browser session, including its exact seed and settings."><span>Generation history</span><small>{generationHistory.length} / {MAX_GENERATION_HISTORY} saved</small></summary>
                    <div className="generation-history-body">
                      {generationHistory.length ? (
                        <div className="generation-history-list">
                          {generationHistory.map((entry) => {
                            const options = entry.map.generation;
                            const preset = options ? MAP_PRESETS.find((item) => item.id === options.preset)?.label ?? options.preset : "Generated map";
                            return (
                              <GenerationHistoryCard key={entry.id} entry={entry} active={activeGenerationId === entry.id} preset={preset} onOpen={() => openGeneration(entry)} onUseRecipe={() => loadGenerationDesignRecipe(entry)} />
                            );
                          })}
                        </div>
                      ) : <p>Generated maps will appear here. The newest 30 remain available for this session.</p>}
                    </div>
                  </details>
                  <details className="creator-group iteration-group">
                    <summary data-tooltip="Rerun world, climate, rivers, content, or starts while retaining compatible layers from the current map."><span>Selective regeneration</span><small>rerun one design pass</small></summary>
                    <div className="creator-group-body">
                      <p className="iteration-note">Rerun one layer while retaining the parts of the current map that remain compatible. A world pass necessarily rebuilds everything downstream.</p>
                      <div className="selective-pass-grid">
                        <button type="button" onClick={() => void runSelectivePass("WORLD")}><strong>World</strong><small>Land, relief and all dependent layers</small></button>
                        <button type="button" onClick={() => void runSelectivePass("CLIMATE")}><strong>Climate</strong><small>Terrain and biome features</small></button>
                        <button type="button" onClick={() => void runSelectivePass("RIVERS")}><strong>Rivers</strong><small>Drainage on current relief</small></button>
                        <button type="button" onClick={() => void runSelectivePass("CONTENT")}><strong>Content</strong><small>Resources, wonders and sites</small></button>
                        <button type="button" onClick={() => void runSelectivePass("STARTS")}><strong>Starts</strong><small>Majors, teams and city states</small></button>
                      </div>
                    </div>
                  </details>
                  <details className="creator-group batch-generation-group">
                    <summary data-tooltip="Generate several related seeds and rank them using validation and multiplayer-balance heuristics."><span>Candidate batch</span><small>{batchRunning ? `${batchProgress} / ${batchCount}` : batchCandidates.length ? `${batchCandidates.length} ranked` : "compare seeds"}</small></summary>
                    <div className="creator-group-body">
                      <div className="batch-controls">
                        <label className="control-field"><span>Candidates</span><select value={batchCount} disabled={batchRunning} onChange={(event) => setBatchCount(Number(event.target.value))}><option value="4">4 quick</option><option value="8">8 standard</option><option value="12">12 thorough</option><option value="20">20 tournament</option></select></label>
                        <button type="button" disabled={batchRunning} onClick={() => void generateBatch()}>{batchRunning ? `Generating ${batchProgress} / ${batchCount}…` : "Generate and rank"}</button>
                      </div>
                      {batchCandidates.length > 0 && (
                        <div className="batch-candidate-list">
                          {batchCandidates.map((candidate, index) => (
                            <button type="button" key={candidate.seed} onClick={() => openBatchCandidate(candidate)}>
                              <span><em>#{index + 1}</em><strong>{candidate.score}</strong><small>score</small></span>
                              <span><strong>{candidate.seed}</strong><small>{candidate.balance.grade} balance · {candidate.balance.spread}% spread · {candidate.errors ? `${candidate.errors} errors` : "valid"}</small></span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                  <details className="creator-group checkpoint-group">
                    <summary data-tooltip="Save deliberate map revisions, compare changed tiles and starts, and restore an earlier checkpoint."><span>Named checkpoints</span><small>{checkpoints.length ? `${checkpoints.length} saved` : "compare revisions"}</small></summary>
                    <div className="creator-group-body">
                      <div className="checkpoint-create"><input aria-label="Checkpoint name" placeholder={`e.g. Before river pass`} value={checkpointName} onChange={(event) => setCheckpointName(event.target.value)} /><button type="button" onClick={saveCheckpoint}>Save current</button></div>
                      {comparisonCheckpoint && mapComparison && (
                        <div className="checkpoint-comparison">
                          <strong>Compared with {comparisonCheckpoint.name}</strong>
                          <small>{mapComparison.dimensionsMatch ? `${mapComparison.changedTiles.size.toLocaleString()} changed tiles · ${mapComparison.changedStarts} changed starts` : "Dimensions differ; tile overlay is unavailable."}</small>
                          <div><button type="button" className={comparisonView === "CURRENT" ? "is-active" : ""} onClick={() => setComparisonView("CURRENT")}>Current</button><button type="button" className={comparisonView === "CHECKPOINT" ? "is-active" : ""} onClick={() => setComparisonView("CHECKPOINT")}>Checkpoint</button><button type="button" disabled={!mapComparison.dimensionsMatch} className={comparisonView === "DIFFERENCE" ? "is-active" : ""} onClick={() => setComparisonView("DIFFERENCE")}>Difference</button></div>
                        </div>
                      )}
                      {checkpoints.length ? (
                        <div className="checkpoint-list">
                          {checkpoints.map((checkpoint) => <div key={checkpoint.id}><span><strong>{checkpoint.name}</strong><small>{checkpoint.map.width}×{checkpoint.map.height} · {new Date(checkpoint.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span><div><button type="button" onClick={() => compareCheckpoint(checkpoint)}>Compare</button><button type="button" onClick={() => restoreCheckpoint(checkpoint)}>Restore</button><button type="button" aria-label={`Delete ${checkpoint.name}`} onClick={() => { setCheckpoints((current) => current.filter((item) => item.id !== checkpoint.id)); if (comparisonCheckpointId === checkpoint.id) setComparisonCheckpointId(null); setProjectDirty(true); }}>×</button></div></div>)}
                        </div>
                      ) : <p className="iteration-note">Save a deliberate revision before a risky generation pass or structural edit.</p>}
                    </div>
                  </details>
                  </div>
                ) : (
                <>
                  <div className={`world-building-steps create-stage-${createView === "REFINE" ? "refine" : "design"}`}>
                  <section className="world-recipe-card">
                  <div className="section-title"><h3>{createView === "REFINE" ? "Refinement recipe" : "World recipe"}</h3><span>{createView === "REFINE" ? "topography retained" : "start here"}</span></div>
                  <fieldset className="world-model-picker">
                    <legend>Generation engine</legend>
                    <nav className="engine-carousel-controls" aria-label="Generation engine carousel controls">
                      <button type="button" data-tooltip="Select the previous generation architecture." aria-label="Previous generation engine" onClick={() => stepGenerationEngine(-1)}>←</button>
                      <output aria-live="polite">{GENERATION_ENGINES.findIndex((item) => item.id === generationOptions.engine) + 1} / {GENERATION_ENGINES.length}</output>
                      <button type="button" data-tooltip="Select the next generation architecture." aria-label="Next generation engine" onClick={() => stepGenerationEngine(1)}>→</button>
                    </nav>
                    <div ref={engineCarouselRef} className="engine-carousel" aria-label="Generation engines">
                      {GENERATION_ENGINES.map((engine) => (
                        <button key={engine.id} type="button" data-tooltip={`Select ${engine.label} and load its recommended baseline map type and physical parameters.`} className={generationOptions.engine === engine.id ? "is-active" : ""} aria-pressed={generationOptions.engine === engine.id} onClick={() => selectGenerationEngine(engine.id)}>
                          <span>{engine.label}</span><small>{engine.description}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="style-picker">
                    <legend>World character</legend>
                    {([
                      ["REALISTIC", "Realistic", "Tectonics and coupled climate"],
                      ["FANTASTICAL", "Fantastical", "Warped and dramatic regions"],
                      ["MUNDANE", "Mundane", "Restrained Civ-like geography"],
                      ["BRUTAL", "Brutal", "Punishing competitive routes"],
                    ] as const).map(([value, label, note]) => (
                      <button
                        key={value}
                        type="button"
                        data-tooltip={`${note}. ${describeWorldCharacter(generationOptions.engine, value)}`}
                        className={generationOptions.style === value ? "is-active" : ""}
                        onClick={() => setGenerationOptions((current) => value === "BRUTAL"
                          ? { ...current, style: value, balance: "TOURNAMENT", startQuality: "BALANCED", mountainPercent: Math.max(18, current.mountainPercent) }
                          : { ...current, style: value })}
                      >
                        <strong>{label}</strong><small>{note}</small>
                      </button>
                    ))}
                  </fieldset>
                  <div className="recipe-fields">
                  <label className="control-field map-type-control" data-tooltip={`Choose a geographic archetype and its recommended defaults. ${describeNarrativeProfile(generationOptions.preset, generationOptions.style)}`}>
                    <span>Map type</span>
                    <select value={generationOptions.preset} onChange={(event) => {
                      const preset = MAP_PRESETS.find((item) => item.id === event.target.value);
                      if (!preset) return;
                      setGenerationOptions((current) => ({ ...current, engine: preset.engine, preset: preset.id, waterPercent: preset.water, mountainPercent: current.style === "BRUTAL" ? Math.max(18, preset.mountains) : preset.mountains, riverDensity: preset.riverDensity ?? current.riverDensity, climateRealism: preset.climateRealism ?? current.climateRealism, climate: preset.engine === "PHYSICAL" ? preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate : current.climate, rainfall: preset.engine === "PHYSICAL" ? preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall : current.rainfall, fantasticality: preset.engine === "ECCENTRIC" ? fantasticalityForPreset(preset.id) : current.fantasticality, regionClimateLogic: preset.engine === "ECCENTRIC" ? preset.climateRealism ? "ORDERED" : "LAWLESS" : current.regionClimateLogic, plateActivity: preset.plateActivity ?? current.plateActivity, erosionStrength: preset.erosionStrength ?? current.erosionStrength, worldAge: preset.worldAge ?? current.worldAge, physicalRotation: preset.engine === "PHYSICAL" ? preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation : current.physicalRotation, physicalSeasonality: preset.engine === "PHYSICAL" ? preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality : current.physicalSeasonality, physicalOceanInfluence: preset.engine === "PHYSICAL" ? preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence : current.physicalOceanInfluence, polisConflictPattern: preset.engine === "POLIS" ? polisPatternForPreset(preset.id) : current.polisConflictPattern }));
                    }}>
                      <optgroup label="Excogitare worlds">{MAP_PRESETS.filter((preset) => preset.engine === "EXCOGITARE").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                      <optgroup label="Eccentric worlds">{MAP_PRESETS.filter((preset) => preset.engine === "ECCENTRIC").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                      <optgroup label="Physical worlds">{MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                      <optgroup label="Polis worlds">{MAP_PRESETS.filter((preset) => preset.engine === "POLIS").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                    </select>
                    <em className={`narrative-profile-state state-${narrativeProfile(generationOptions.preset).implementation.toLowerCase().replaceAll("_", "-")}`}>{narrativeProfile(generationOptions.preset).implementation === "BENCHMARK" ? "Recognition benchmark" : "Compiler pending"}</em>
                  </label>
                  <label className="control-field scale-control" data-tooltip={`Scale describes how much of the imagined world is visible; it is independent of the tile budget. ${WORLD_SCALE_PROFILES[generationScale].subject} Map Size changes resolution, not this category.`}>
                    <span>Scale</span>
                    <select value={generationScale} onChange={(event) => setGenerationScale(event.target.value as WorldScale)}>
                      <option value="GLOBAL">Global</option>
                      <option value="CONTINENTAL">Continental</option>
                      <option value="REGIONAL">Regional</option>
                      <option value="PROVINCIAL">Provincial</option>
                      <option value="LOCAL">Local</option>
                    </select>
                  </label>
                  <label className="control-field archetype-control" data-tooltip={`Apply an environmental coat while preserving land, elevation, rivers, starts, and scenario data by default. ${describeArchetype(generationArchetype, generationArchetypeIntensity)}`}>
                    <span>Archetype</span>
                    <select value={generationArchetype} onChange={(event) => setGenerationArchetype(event.target.value as WorldArchetype)}>
                      <option value="EXISTING">Existing · retain the current surface</option>
                      <option value="NARRATIVE_DEFAULT">Narrative default</option>
                      <option value="TEMPERATE">Temperate</option><option value="JUNGLE">Jungle</option><option value="SUNSCOURGED">Sunscourged</option><option value="WORLDFROST">Worldfrost</option>
                      <option value="MONSOON">Monsoon</option><option value="MEDITERRANEAN">Mediterranean</option><option value="STEPPE">Steppe</option><option value="SAVANNA">Savanna</option>
                      <option value="MARSHLAND">Marshland</option><option value="VOLCANIC">Volcanic</option><option value="JURASSIC">Jurassic</option><option value="POST_COLLAPSE">Post-Collapse</option><option value="FALLOUT_WASTES">Fallout Wastes</option>
                    </select>
                    {generationArchetype !== "EXISTING" && generationArchetype !== "NARRATIVE_DEFAULT" && !ARCHETYPE_PROFILES[generationArchetype].compatibleCharacters.includes(generationOptions.style) && <small className="archetype-conflict-warning">This coat contradicts the selected World Character. It remains explicit, but Review will treat the intended identity as weakened.</small>}
                  </label>
                  <label className="control-field archetype-intensity-control" data-tooltip={`Hint repaints selected coherent regions, Strong makes the coat dominant, and Transformative additionally rebuilds compatible resources and wonders only after a Difference preview and confirmation.${generationArchetype !== "EXISTING" && generationArchetype !== "NARRATIVE_DEFAULT" ? ` Resource ecology: ${ARCHETYPE_PROFILES[generationArchetype].resourceEcology.join(", ")}; favors ${ARCHETYPE_PROFILES[generationArchetype].wonderTendencies.join(" and ")}.` : ""}`}>
                    <span>Archetype intensity</span>
                    <select value={generationArchetypeIntensity} disabled={generationArchetype === "EXISTING" || generationArchetype === "NARRATIVE_DEFAULT"} onChange={(event) => setGenerationArchetypeIntensity(event.target.value as ArchetypeIntensity)}>
                      <option value="HINT">Hint · restrained regional coat</option>
                      <option value="STRONG">Strong · dominant surface coat</option>
                      <option value="TRANSFORMATIVE">Transformative · surface and content ecology</option>
                    </select>
                  </label>
                  <label className="control-field map-size-control" data-tooltip={`Choose a tile budget. At the current geometry, ${MAP_SIZES.find((item) => item.id === generationOptions.size)?.label ?? generationOptions.size} contains ${(() => { const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry); return (dimensions.width * dimensions.height).toLocaleString(); })()} tiles. Non-stock dimensions remain behind Game Breaking permission.`}>
                    <span>Map size</span>
                    <select value={generationOptions.size} onChange={(event) => {
                      const nextSize = event.target.value as MapGenerationOptions["size"];
                      const next = MAP_SIZES.find((item) => item.id === nextSize);
                      setGenerationOptions((current) => ({ ...current, size: nextSize, players: next?.recommendedPlayers ?? current.players, cityStates: next?.recommendedCityStates ?? current.cityStates }));
                    }}>
                      {MAP_SIZES.filter((item) => allowGameBreakingGeometry || !item.gameBreaking).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}{item.gameBreaking ? " · experimental" : ""}</option>)}
                    </select>
                    {isGameBreakingMapSize(generationOptions.size) && <small className="generation-resource-warning">Non-stock dimensions; Civ V stability is not guaranteed.</small>}
                  </label>
                  <label className="control-field generation-effort-control" data-tooltip={`Effort uses fixed deterministic candidate budgets rather than elapsed time, so the same recipe remains reproducible. ${generationResourceEstimate.candidates} candidate${generationResourceEstimate.candidates === 1 ? "" : "s"}; approximately ${generationResourceEstimate.estimatedPeakMegabytes} MB peak working memory. Mobile Randomise always uses Standard effort and safe dimensions.`}>
                    <span>Generation effort</span>
                    <select value={generationEffort} onChange={(event) => setGenerationEffort(event.target.value as GenerationEffort)}><option value="STANDARD">Standard</option><option value="THOROUGH">Thorough</option><option value="EXHAUSTIVE">Exhaustive</option></select>
                    {generationResourceEstimate.warning && <small className="generation-resource-warning">{generationResourceEstimate.warning}</small>}
                  </label>
                  </div>
                  <div className="seed-row">
                    <label className="control-field" data-tooltip="The same complete settings and seed produce the same world, making a generation reproducible."><span>Seed</span><input value={generationOptions.seed} maxLength={80} onChange={(event) => setGenerationOptions((current) => ({ ...current, seed: event.target.value }))} /></label>
                    <button type="button" data-tooltip="Replace the current seed without changing any other design setting." onClick={randomizeSeed}>Shuffle</button>
                  </div>
                  </section>
                  <details className="creator-group world-shape-group" name="world-design-step" open data-modified={generationOptions.projectionType !== DEFAULT_GENERATION_OPTIONS.projectionType || generationOptions.modifier !== DEFAULT_GENERATION_OPTIONS.modifier || generationOptions.wrapType !== DEFAULT_GENERATION_OPTIONS.wrapType || generationOptions.geometry !== DEFAULT_GENERATION_OPTIONS.geometry || generationOptions.waterPercent !== DEFAULT_GENERATION_OPTIONS.waterPercent || generationOptions.mountainPercent !== DEFAULT_GENERATION_OPTIONS.mountainPercent}>
                    <summary data-tooltip="Control the map's climate orientation, modifier, wrapping, aspect ratio, land-water balance, relief, and physical structure."><span>1 · World shape</span><small>{generationOptions.waterPercent}% water · {generationOptions.mountainPercent}% mountains</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, modifier: DEFAULT_GENERATION_OPTIONS.modifier, wrapType: DEFAULT_GENERATION_OPTIONS.wrapType, geometry: DEFAULT_GENERATION_OPTIONS.geometry, waterPercent: DEFAULT_GENERATION_OPTIONS.waterPercent, mountainPercent: current.style === "BRUTAL" ? 18 : DEFAULT_GENERATION_OPTIONS.mountainPercent, worldAge: DEFAULT_GENERATION_OPTIONS.worldAge, granularity: DEFAULT_GENERATION_OPTIONS.granularity, oceanBasins: DEFAULT_GENERATION_OPTIONS.oceanBasins, landAtPoles: DEFAULT_GENERATION_OPTIONS.landAtPoles, coastalRangePercent: DEFAULT_GENERATION_OPTIONS.coastalRangePercent, riverDensity: DEFAULT_GENERATION_OPTIONS.riverDensity, fantasticality: DEFAULT_GENERATION_OPTIONS.fantasticality, regionClimateLogic: DEFAULT_GENERATION_OPTIONS.regionClimateLogic, plateActivity: DEFAULT_GENERATION_OPTIONS.plateActivity, erosionStrength: DEFAULT_GENERATION_OPTIONS.erosionStrength, polisConflictPattern: DEFAULT_GENERATION_OPTIONS.polisConflictPattern, polisSymmetry: DEFAULT_GENERATION_OPTIONS.polisSymmetry, polisExpansionPressure: DEFAULT_GENERATION_OPTIONS.polisExpansionPressure, polisNavalImportance: DEFAULT_GENERATION_OPTIONS.polisNavalImportance, polisChokepointDensity: DEFAULT_GENERATION_OPTIONS.polisChokepointDensity, polisSafeRadius: DEFAULT_GENERATION_OPTIONS.polisSafeRadius }))}>Reset world shape</button>
                      <label className="control-field projection-type-control" data-tooltip={`Relocate the climatic poles without changing Civ V's rectangular tile adjacency or the 2D/3D camera. ${CLIMATE_PROJECTIONS.find((projectionType) => projectionType.id === generationOptions.projectionType)?.description ?? ""}`}>
                        <span>Pole orientation</span>
                        <select value={generationOptions.projectionType} onChange={(event) => setGenerationOptions((current) => ({ ...current, projectionType: event.target.value as MapGenerationOptions["projectionType"] }))}>
                          {CLIMATE_PROJECTIONS.map((projectionType) => <option key={projectionType.id} value={projectionType.id}>{projectionType.label}</option>)}
                        </select>
                      </label>
                      <label className="control-field" data-tooltip={`Apply a broad thematic transformation on top of the chosen map type. ${WORLD_MODIFIERS.find((modifier) => modifier.id === (generationOptions.modifier === "FANTASTICAL" ? "NONE" : generationOptions.modifier))?.description ?? ""}`}>
                        <span>World modifier</span>
                        <select value={generationOptions.modifier === "FANTASTICAL" ? "NONE" : generationOptions.modifier} onChange={(event) => {
                          const modifier = event.target.value as MapGenerationOptions["modifier"];
                          setGenerationOptions((current) => ({ ...current, modifier, mountainPercent: modifier === "STRATEGIC_DEPTH" ? Math.max(22, current.mountainPercent) : modifier === "DOOMSDAY" ? Math.max(18, current.mountainPercent) : current.mountainPercent }));
                        }}>
                          {WORLD_MODIFIERS.map((modifier) => <option key={modifier.id} value={modifier.id}>{modifier.label}</option>)}
                        </select>
                      </label>
                      <label className="control-field" data-tooltip="Choose whether east and west edges connect in Civ V. This affects navigation and exported map metadata.">
                        <span>Wrap type</span>
                        <select value={generationOptions.wrapType ?? "PRESET"} onChange={(event) => setGenerationOptions((current) => ({ ...current, wrapType: event.target.value as MapGenerationOptions["wrapType"] }))}>
                          <option value="PRESET">Map type default</option>
                          <option value="EAST_WEST">East / west</option>
                          <option value="NONE">No wrapping</option>
                        </select>
                      </label>
                      <label className="control-field" data-tooltip="Change the map's aspect ratio while retaining approximately the selected size's tile budget.">
                        <span>Geometry</span>
                        <select value={generationOptions.geometry} onChange={(event) => setGenerationOptions((current) => ({ ...current, geometry: event.target.value as MapGenerationOptions["geometry"] }))}>
                          {GEOMETRY_OPTIONS.filter((option) => allowGameBreakingGeometry || !option.gameBreaking).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                        <small>{(() => { const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry); return `${dimensions.width} × ${dimensions.height} tiles`; })()}</small>
                      </label>
                      <label className={`check-row game-breaking-geometry-toggle${allowGameBreakingGeometry ? " is-enabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={allowGameBreakingGeometry}
                          onChange={(event) => event.target.checked ? requestGameBreakingGeometry() : disableGameBreakingGeometry()}
                        />
                        <span><strong>Show game-breaking options</strong><small>Unlock oversized budgets and aspect ratios known to crash Civ V. Randomise will use them only while this is enabled.</small></span>
                      </label>
                      <div className="percentage-controls">
                        <label className="control-field percentage-field" data-tooltip="Set the target share of water tiles. Zero creates a wholly terrestrial world."><span>Water percent <output>{generationOptions.waterPercent}%</output></span><input type="range" min="0" max="90" step="1" value={generationOptions.waterPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, waterPercent: Number(event.target.value) }))} /></label>
                        <label className="control-field percentage-field" data-tooltip="Set the target share of impassable mountain tiles. Accessibility passes still preserve routes across every landmass."><span>Mountain percent <output>{generationOptions.mountainPercent}%</output></span><input type="range" min={generationOptions.modifier === "STRATEGIC_DEPTH" ? 22 : generationOptions.modifier === "DOOMSDAY" || generationOptions.style === "BRUTAL" ? 18 : 0} max="38" step="1" value={generationOptions.mountainPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, mountainPercent: Number(event.target.value) }))} /></label>
                      </div>
                      <details className="advanced-controls">
                        <summary data-tooltip={`Reveal engine-specific controls for world age, geographic granularity, basins, tectonics, erosion, coastal ranges, and river density. ${generationOptions.engine === "ECCENTRIC" ? "Eccentric retains a dense subpolygon mesh, land and astronomy basins, biome palettes, boundary ranges and drainage." : generationOptions.engine === "PHYSICAL" ? "Physical retains moving plates, crust, convergence, rifting, eroded relief, sea level, basins and drainage-ready elevation." : generationOptions.engine === "POLIS" ? "Polis validates strategic territories and required routes before terrain, keeping mountain passes open by construction." : "Excogitare exposes direct terrain-form controls."}`}><span>More world controls</span><small>age, geology, rivers</small></summary>
                        <div>
                      <label className="control-field"><span>World age</span><select value={generationOptions.worldAge} onChange={(event) => setGenerationOptions((current) => ({ ...current, worldAge: event.target.value as MapGenerationOptions["worldAge"] }))}><option value="YOUNG">Young</option><option value="NORMAL">Normal</option><option value="OLD">Old</option></select></label>
                      {generationOptions.engine === "ECCENTRIC" && (
                        <div className="region-architecture-controls">
                          <label className="control-field" data-tooltip="Controls cell irregularity, biome dissonance, palette count, rift breadth, and the willingness of regions to contradict one another."><span>Fantasticality</span><select value={generationOptions.fantasticality} onChange={(event) => setGenerationOptions((current) => ({ ...current, fantasticality: event.target.value as MapGenerationOptions["fantasticality"] }))}><option value="RESTRAINED">Restrained · coherent realms</option><option value="MYTHIC">Mythic · dramatic borders</option><option value="UNBOUND">Unbound · geographic delirium</option></select></label>
                          <div className="control-grid">
                            <label className="control-field"><span>Geographic granularity</span><select value={generationOptions.granularity} onChange={(event) => setGenerationOptions((current) => ({ ...current, granularity: event.target.value as MapGenerationOptions["granularity"] }))}><option value="LOW">Low · vast forms</option><option value="FAIR">Fair · continental</option><option value="HIGH">High · intricate</option><option value="VERY_HIGH">Very high · fractured</option></select></label>
                            <label className="control-field"><span>Ocean basins</span><input type="number" min="1" max="5" value={generationOptions.oceanBasins} onChange={(event) => setGenerationOptions((current) => ({ ...current, oceanBasins: Math.max(1, Math.min(5, Number(event.target.value))) }))} /></label>
                          </div>
                          <label className="control-field" data-tooltip="Lawless regions ignore latitude, Influenced regions merely consult it, and Ordered climates preserve latitude plus west-to-east rain shadows."><span>Climate logic</span><select value={generationOptions.regionClimateLogic} onChange={(event) => { const regionClimateLogic = event.target.value as MapGenerationOptions["regionClimateLogic"]; setGenerationOptions((current) => ({ ...current, regionClimateLogic, climateRealism: regionClimateLogic === "ORDERED" })); }}><option value="LAWLESS">Lawless · latitude ignored</option><option value="INFLUENCED">Influenced · latitude negotiates</option><option value="ORDERED">Ordered · latitude governs</option></select></label>
                          <label className="check-row"><input type="checkbox" checked={generationOptions.landAtPoles} onChange={(event) => setGenerationOptions((current) => ({ ...current, landAtPoles: event.target.checked }))} /><span>Permit continents and islands at the poles</span></label>
                          <label className="control-field percentage-field"><span>Coastal mountain ranges <output>{generationOptions.coastalRangePercent}%</output></span><input type="range" min="0" max="100" value={generationOptions.coastalRangePercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, coastalRangePercent: Number(event.target.value) }))} /></label>
                          <label className="control-field"><span>River network</span><select value={generationOptions.riverDensity} onChange={(event) => setGenerationOptions((current) => ({ ...current, riverDensity: event.target.value as MapGenerationOptions["riverDensity"] }))}><option value="SPARSE">Sparse · major systems</option><option value="NORMAL">Normal · rivers and tributaries</option><option value="DENSE">Dense · wet watersheds</option></select></label>
                        </div>
                      )}
                      {generationOptions.engine === "PHYSICAL" && (
                        <div className="region-architecture-controls physical-architecture-controls">
                          <div className="control-grid">
                            <label className="control-field"><span>Plate activity</span><select value={generationOptions.plateActivity} onChange={(event) => setGenerationOptions((current) => ({ ...current, plateActivity: event.target.value as MapGenerationOptions["plateActivity"] }))}><option value="QUIET">Quiet · subdued boundaries</option><option value="NORMAL">Normal · mixed tectonics</option><option value="VIOLENT">Violent · collision belts</option></select></label>
                            <label className="control-field"><span>Erosion</span><select value={generationOptions.erosionStrength} onChange={(event) => setGenerationOptions((current) => ({ ...current, erosionStrength: event.target.value as MapGenerationOptions["erosionStrength"] }))}><option value="LIGHT">Light · young relief</option><option value="MODERATE">Moderate · mature terrain</option><option value="STRONG">Strong · ancient terrain</option></select></label>
                          </div>
                          <label className="control-field"><span>River network</span><select value={generationOptions.riverDensity} onChange={(event) => setGenerationOptions((current) => ({ ...current, riverDensity: event.target.value as MapGenerationOptions["riverDensity"] }))}><option value="SPARSE">Sparse · major systems</option><option value="NORMAL">Normal · rivers and tributaries</option><option value="DENSE">Dense · wet watersheds</option></select></label>
                        </div>
                      )}
                      {generationOptions.engine === "POLIS" && (
                        <div className="region-architecture-controls polis-architecture-controls">
                          <div className="control-grid">
                            <label className="control-field" data-tooltip="Choose the abstract relationship Polis embeds before it creates terrain."><span>Conflict pattern</span><select value={generationOptions.polisConflictPattern} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisConflictPattern: event.target.value as MapGenerationOptions["polisConflictPattern"] }))}><option value="RADIAL">Radial · contested interior</option><option value="OPPOSING_FRONTS">Opposing fronts</option><option value="CROSSROADS">Crossroads · flanking routes</option><option value="RIVAL_CONTINENTS">Rival continents</option></select></label>
                            <label className="control-field" data-tooltip="Control whether strategic territories are rotational, reflected, approximately equivalent, or deliberately asymmetric."><span>Balance geometry</span><select value={generationOptions.polisSymmetry} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisSymmetry: event.target.value as MapGenerationOptions["polisSymmetry"] }))}><option value="EQUIVALENT">Equivalent · organic variation</option><option value="MIRRORED">Mirrored</option><option value="ROTATIONAL">Rotational</option><option value="ASYMMETRIC">Designed asymmetry</option></select></label>
                            <label className="control-field"><span>Expansion pressure</span><select value={generationOptions.polisExpansionPressure} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisExpansionPressure: event.target.value as MapGenerationOptions["polisExpansionPressure"] }))}><option value="RELAXED">Relaxed · larger safe hinterlands</option><option value="STANDARD">Standard</option><option value="IMMEDIATE">Immediate · early contact</option></select></label>
                            <label className="control-field"><span>Naval importance</span><select value={generationOptions.polisNavalImportance} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisNavalImportance: event.target.value as MapGenerationOptions["polisNavalImportance"] }))}><option value="LOW">Low · land crossings</option><option value="BALANCED">Balanced</option><option value="HIGH">High · naval fronts</option></select></label>
                          </div>
                          <label className="control-field percentage-field" data-tooltip="Higher values narrow protected routes and raise mountains around their approaches without blocking them."><span>Chokepoint density <output>{generationOptions.polisChokepointDensity}%</output></span><input type="range" min="0" max="100" value={generationOptions.polisChokepointDensity} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisChokepointDensity: Number(event.target.value) }))} /></label>
                          <label className="control-field"><span>Safe territory radius</span><input type="number" min="2" max="8" value={generationOptions.polisSafeRadius} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisSafeRadius: Math.max(2, Math.min(8, Number(event.target.value))) }))} /></label>
                        </div>
                      )}
                        </div>
                      </details>
                    </div>
                  </details>

                  <details className="creator-group content-group" name="world-design-step" data-modified={generationOptions.bonusAbundance !== DEFAULT_GENERATION_OPTIONS.bonusAbundance || generationOptions.luxuryAbundance !== DEFAULT_GENERATION_OPTIONS.luxuryAbundance || generationOptions.strategicAbundance !== DEFAULT_GENERATION_OPTIONS.strategicAbundance || generationOptions.wonderCount !== DEFAULT_GENERATION_OPTIONS.wonderCount}>
                    <summary data-tooltip="Control bonus, luxury and strategic resources, natural wonders, guarantees, barbarians, ruins, and placement spacing."><span>3 · Resources and wonders</span><small>{generationOptions.wonderCount} wonders · {generationOptions.strategicAbundance.toLowerCase()} strategics</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, bonusAbundance: DEFAULT_GENERATION_OPTIONS.bonusAbundance, luxuryAbundance: DEFAULT_GENERATION_OPTIONS.luxuryAbundance, luxuryRegional: DEFAULT_GENERATION_OPTIONS.luxuryRegional, luxuryStartGuarantee: DEFAULT_GENERATION_OPTIONS.luxuryStartGuarantee, strategicAbundance: DEFAULT_GENERATION_OPTIONS.strategicAbundance, strategicDistribution: DEFAULT_GENERATION_OPTIONS.strategicDistribution, strategicStartGuarantee: DEFAULT_GENERATION_OPTIONS.strategicStartGuarantee, offshoreOilPercent: DEFAULT_GENERATION_OPTIONS.offshoreOilPercent, wonderCount: DEFAULT_GENERATION_OPTIONS.wonderCount, wonderMinSpacing: DEFAULT_GENERATION_OPTIONS.wonderMinSpacing, wonderStartBuffer: DEFAULT_GENERATION_OPTIONS.wonderStartBuffer, barbarianAbundance: DEFAULT_GENERATION_OPTIONS.barbarianAbundance, barbarianStartDistance: DEFAULT_GENERATION_OPTIONS.barbarianStartDistance, ruinAbundance: DEFAULT_GENERATION_OPTIONS.ruinAbundance, ruinStartDistance: DEFAULT_GENERATION_OPTIONS.ruinStartDistance, polisContestedResourcePercent: DEFAULT_GENERATION_OPTIONS.polisContestedResourcePercent }))}>Reset content</button>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Bonus resources</span><select value={generationOptions.bonusAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, bonusAbundance: event.target.value as MapGenerationOptions["bonusAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                        <label className="control-field"><span>Luxuries</span><select value={generationOptions.luxuryAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryAbundance: event.target.value as MapGenerationOptions["luxuryAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                        <label className="control-field"><span>Strategics</span><select value={generationOptions.strategicAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicAbundance: event.target.value as MapGenerationOptions["strategicAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                      </div>
                      <label className="control-field"><span>Strategic distribution</span><select value={generationOptions.strategicDistribution} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicDistribution: event.target.value as MapGenerationOptions["strategicDistribution"] }))}><option value="EVEN">Even</option><option value="REGIONAL">Regional types</option><option value="CLUSTERED">Clustered deposits</option></select></label>
                      <label className="control-field"><span>Natural wonders</span><input type="number" min="0" max="12" value={generationOptions.wonderCount} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderCount: Number(event.target.value) }))} /></label>
                      <details className="advanced-controls">
                        <summary data-tooltip="Reveal start guarantees, regional luxury rules, offshore oil, wonder spacing, barbarian camps, and ancient ruins."><span>More content controls</span><small>guarantees, spacing, sites</small></summary>
                        <div>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.strategicStartGuarantee} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicStartGuarantee: event.target.checked }))} /><span>Guarantee iron and horses near every major start</span></label>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.luxuryStartGuarantee} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryStartGuarantee: event.target.checked }))} /><span>Guarantee a luxury near every major start</span></label>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.luxuryRegional} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryRegional: event.target.checked }))} /><span>Create regional luxury monopolies</span></label>
                      <label className="control-field percentage-field"><span>Offshore oil <output>{generationOptions.offshoreOilPercent}%</output></span><input type="range" min="0" max="70" value={generationOptions.offshoreOilPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, offshoreOilPercent: Number(event.target.value) }))} /></label>
                      {generationOptions.engine === "POLIS" && <label className="control-field percentage-field" data-tooltip="Move this share of ordinary strategic and luxury deposits into the graph's contested regions; start guarantees remain local."><span>Contested resources <output>{generationOptions.polisContestedResourcePercent}%</output></span><input type="range" min="0" max="80" value={generationOptions.polisContestedResourcePercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, polisContestedResourcePercent: Number(event.target.value) }))} /></label>}
                      <div className="control-grid">
                        <label className="control-field"><span>Wonder spacing</span><input type="number" min="3" max="20" value={generationOptions.wonderMinSpacing} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderMinSpacing: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Start buffer</span><input type="number" min="0" max="15" value={generationOptions.wonderStartBuffer} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderStartBuffer: Number(event.target.value) }))} /></label>
                      </div>
                      <div className="control-grid">
                        <label className="control-field"><span>Barbarians</span><select value={generationOptions.barbarianAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, barbarianAbundance: event.target.value as MapGenerationOptions["barbarianAbundance"] }))}><option value="NONE">None</option><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="RAGING">Raging</option></select></label>
                        <label className="control-field"><span>Camp start distance</span><input type="number" min="2" max="15" value={generationOptions.barbarianStartDistance} onChange={(event) => setGenerationOptions((current) => ({ ...current, barbarianStartDistance: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Ancient ruins</span><select value={generationOptions.ruinAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, ruinAbundance: event.target.value as MapGenerationOptions["ruinAbundance"] }))}><option value="NONE">None</option><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="RAGING">Abundant</option></select></label>
                        <label className="control-field"><span>Ruin start distance</span><input type="number" min="1" max="12" value={generationOptions.ruinStartDistance} onChange={(event) => setGenerationOptions((current) => ({ ...current, ruinStartDistance: Number(event.target.value) }))} /></label>
                      </div>
                      <small className="content-note">Camps, ruins, ruined cities, roads, and designed start locations are retained in the Excogitare project. Ordinary Civ5Map export contains geography only, and Civ V assigns starts when the game is created.</small>
                        </div>
                      </details>
                    </div>
                  </details>

                  <details className="creator-group climate-group" name="world-design-step" data-modified={generationOptions.climate !== DEFAULT_GENERATION_OPTIONS.climate || generationOptions.rainfall !== DEFAULT_GENERATION_OPTIONS.rainfall || (generationOptions.dominantTerrains ?? []).length > 0 || generationOptions.regionContrast !== DEFAULT_GENERATION_OPTIONS.regionContrast || generationOptions.eccentricExtreme !== DEFAULT_GENERATION_OPTIONS.eccentricExtreme || generationOptions.physicalRotation !== DEFAULT_GENERATION_OPTIONS.physicalRotation || generationOptions.physicalSeasonality !== DEFAULT_GENERATION_OPTIONS.physicalSeasonality || generationOptions.physicalOceanInfluence !== DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence}>
                    <summary data-tooltip="Set broad temperature, rainfall, dominant terrain, biome logic, and regional climate contrast."><span>2 · Climate and terrain</span><small>{generationOptions.climate.toLowerCase()} · {generationOptions.rainfall.toLowerCase()}</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, climate: DEFAULT_GENERATION_OPTIONS.climate, rainfall: DEFAULT_GENERATION_OPTIONS.rainfall, dominantTerrains: [], climateRealism: DEFAULT_GENERATION_OPTIONS.climateRealism, regionContrast: DEFAULT_GENERATION_OPTIONS.regionContrast, regionClimateLogic: DEFAULT_GENERATION_OPTIONS.regionClimateLogic, eccentricExtreme: DEFAULT_GENERATION_OPTIONS.eccentricExtreme, physicalRotation: DEFAULT_GENERATION_OPTIONS.physicalRotation, physicalSeasonality: DEFAULT_GENERATION_OPTIONS.physicalSeasonality, physicalOceanInfluence: DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence }))}>Reset climate</button>
                      <div className="control-grid">
                        <label className="control-field"><span>Climate</span><select value={generationOptions.climate} onChange={(event) => setGenerationOptions((current) => ({ ...current, climate: event.target.value as MapGenerationOptions["climate"] }))}><option value="COOL">Cool</option><option value="TEMPERATE">Temperate</option><option value="HOT">Hot</option></select></label>
                        <label className="control-field"><span>Rainfall</span><select value={generationOptions.rainfall} onChange={(event) => setGenerationOptions((current) => ({ ...current, rainfall: event.target.value as MapGenerationOptions["rainfall"] }))}><option value="ARID">Arid</option><option value="NORMAL">Normal</option><option value="WET">Wet</option></select></label>
                      </div>
                      <details className="advanced-controls">
                        <summary data-tooltip={`Reveal engine-specific climate simulation and regional-contrast controls.${generationOptions.engine === "PHYSICAL" ? " Physical couples latitude, altitude, continentality, seasonal range, circulation, vapor transport, water recharge, orographic rainfall, evaporation and outlet drainage." : ""}`}><span>More climate controls</span><small>simulation and contrast</small></summary>
                        <div>
                      {generationOptions.engine === "ECCENTRIC" && (
                        <div className="control-grid">
                          <label className="control-field" data-tooltip="Apply an optional planet-wide climate envelope after regional climates are composed. These are not cosmetic palettes: they change terrain and vegetation."><span>World extreme</span><select value={generationOptions.eccentricExtreme} onChange={(event) => setGenerationOptions((current) => ({ ...current, eccentricExtreme: event.target.value as MapGenerationOptions["eccentricExtreme"] }))}><option value="NONE">None · regional spectrum</option><option value="SNOWBALL">Snowball · frozen world</option><option value="JURASSIC">Jurassic · hot and humid</option><option value="ARRAKIS">Arrakis · hot and arid</option><option value="ARBOREA">Arborea · forest world</option></select></label>
                          <label className="control-field"><span>Region contrast</span><select value={generationOptions.regionContrast} onChange={(event) => setGenerationOptions((current) => ({ ...current, regionContrast: event.target.value as MapGenerationOptions["regionContrast"] }))}><option value="BLENDED">Blended borders</option><option value="VARIED">Varied provinces</option><option value="EXTREME">Extreme realms</option></select></label>
                        </div>
                      )}
                      {generationOptions.engine === "PHYSICAL" && (
                        <div className="physical-climate-controls">
                          <div className="control-grid">
                            <label className="control-field" data-tooltip="Reverse the zonal component of the tropical, temperate, and polar circulation cells. Retrograde worlds therefore reverse their prevailing east-west winds and rain shadows."><span>Rotation</span><select value={generationOptions.physicalRotation} onChange={(event) => setGenerationOptions((current) => ({ ...current, physicalRotation: event.target.value as MapGenerationOptions["physicalRotation"] }))}><option value="PROGRADE">Prograde · Earth-like winds</option><option value="RETROGRADE">Retrograde · reversed winds</option></select></label>
                            <label className="control-field" data-tooltip="Control annual temperature range. Continental interiors and high latitudes respond more strongly than maritime coasts."><span>Axial seasonality</span><select value={generationOptions.physicalSeasonality} onChange={(event) => setGenerationOptions((current) => ({ ...current, physicalSeasonality: event.target.value as MapGenerationOptions["physicalSeasonality"] }))}><option value="MILD">Mild · low seasonal range</option><option value="EARTHLIKE">Earth-like</option><option value="EXTREME">Extreme · strong seasons</option></select></label>
                          </div>
                          <label className="control-field" data-tooltip="Control how strongly oceans and lakes moderate temperature, recharge atmospheric vapor, and moisten nearby land."><span>Ocean influence</span><select value={generationOptions.physicalOceanInfluence} onChange={(event) => setGenerationOptions((current) => ({ ...current, physicalOceanInfluence: event.target.value as MapGenerationOptions["physicalOceanInfluence"] }))}><option value="WEAK">Weak · continental extremes</option><option value="NORMAL">Normal</option><option value="STRONG">Strong · maritime climates</option></select></label>
                        </div>
                      )}
                        </div>
                      </details>
                      <fieldset className="terrain-dominance-picker" data-tooltip="Select one or more terrain types to bias the climate result. With none selected, the climate system determines the mix.">
                        <legend>Dominant terrain</legend>
                        <div>
                          {DOMINANT_TERRAINS.map((terrain) => {
                            const selected = (generationOptions.dominantTerrains ?? []).includes(terrain.id);
                            return <button key={terrain.id} type="button" className={selected ? "is-active" : ""} aria-pressed={selected} onClick={() => setGenerationOptions((current) => ({ ...current, dominantTerrains: (current.dominantTerrains ?? []).includes(terrain.id) ? (current.dominantTerrains ?? []).filter((item) => item !== terrain.id) : [...(current.dominantTerrains ?? []), terrain.id] }))}>{terrain.label}</button>;
                          })}
                        </div>
                      </fieldset>
                    </div>
                  </details>

                  <details className="creator-group players-group" name="world-design-step" data-modified={generationOptions.players !== DEFAULT_GENERATION_OPTIONS.players || generationOptions.cityStates !== DEFAULT_GENERATION_OPTIONS.cityStates || generationOptions.balance !== DEFAULT_GENERATION_OPTIONS.balance || generationOptions.startQuality !== DEFAULT_GENERATION_OPTIONS.startQuality}>
                    <summary data-tooltip="Choose major civilizations, city states, multiplayer layout, team geography, start quality, and settlement spacing."><span>4 · Players and starts</span><small>{generationOptions.players} players · {generationOptions.cityStates} city states</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => { const sizePreset = MAP_SIZES.find((item) => item.id === current.size); return { ...current, players: sizePreset?.recommendedPlayers ?? DEFAULT_GENERATION_OPTIONS.players, cityStates: sizePreset?.recommendedCityStates ?? DEFAULT_GENERATION_OPTIONS.cityStates, balance: DEFAULT_GENERATION_OPTIONS.balance, teamSize: DEFAULT_GENERATION_OPTIONS.teamSize, teamLayout: DEFAULT_GENERATION_OPTIONS.teamLayout, startQuality: DEFAULT_GENERATION_OPTIONS.startQuality, strategicBalance: false }; })}>Reset players</button>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
                        <label className="control-field" data-tooltip="Minor powers are optional. Size defaults use roughly one city state per major civilization so the opening world is not overcrowded."><span>City states</span><input type="number" min="0" max="41" value={generationOptions.cityStates} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStates: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Layout</span><select value={generationOptions.balance} onChange={(event) => setGenerationOptions((current) => ({ ...current, balance: event.target.value as MapGenerationOptions["balance"] }))}><option value="STANDARD">Equal separation</option><option value="TOURNAMENT">Tournament</option><option value="TEAMS">Paired teams</option></select></label>
                      </div>
                      <fieldset className="match-intent-controls" data-tooltip="Human and AI counts describe the intended lobby. Unassigned seats remain flexible; civilization ownership is authored in Scenario.">
                        <legend>Match intent</legend>
                        <div className="control-grid three-controls">
                          <label className="control-field"><span>Human seats</span><input type="number" min="0" max={generationOptions.players - matchIntent.aiPlayers} value={matchIntent.humanPlayers} onChange={(event) => setMatchIntent((current) => ({ ...current, humanPlayers: Math.max(0, Math.min(generationOptions.players - current.aiPlayers, Number(event.target.value))) }))} /></label>
                          <label className="control-field"><span>AI seats</span><input type="number" min="0" max={generationOptions.players - matchIntent.humanPlayers} value={matchIntent.aiPlayers} onChange={(event) => setMatchIntent((current) => ({ ...current, aiPlayers: Math.max(0, Math.min(generationOptions.players - current.humanPlayers, Number(event.target.value))) }))} /></label>
                          <label className="control-field"><span>AI accommodation</span><select value={matchIntent.aiAccommodation} onChange={(event) => setMatchIntent((current) => ({ ...current, aiAccommodation: event.target.value as MatchIntent["aiAccommodation"] }))}><option value="NORMAL">Normal</option><option value="STRONG">Strong · wider routes</option></select></label>
                        </div>
                        <small>{Math.max(0, generationOptions.players - matchIntent.humanPlayers - matchIntent.aiPlayers)} flexible seat{Math.max(0, generationOptions.players - matchIntent.humanPlayers - matchIntent.aiPlayers) === 1 ? "" : "s"}</small>
                        <div className="control-grid">
                          <label className="control-field" data-tooltip="Free-for-all leaves each start politically independent. Fixed teams asks Polis to construct coherent team realms; flexible records an ordinary lobby that may be reassigned in Civ V."><span>Team intent</span><select value={matchIntent.teamIntent} onChange={(event) => setMatchIntent((current) => ({ ...current, teamIntent: event.target.value as MatchIntent["teamIntent"] }))}><option value="FREE_FOR_ALL">Free-for-all</option><option value="FIXED_TEAMS">Fixed teams</option><option value="FLEXIBLE">Flexible lobby</option></select></label>
                          <label className="control-field" data-tooltip="Strictness controls how cautiously Review judges role and route equivalence. Unequal Realms remains deliberately asymmetric regardless of this label."><span>Competitive strictness</span><select value={matchIntent.competitiveStrictness} onChange={(event) => setMatchIntent((current) => ({ ...current, competitiveStrictness: event.target.value as MatchIntent["competitiveStrictness"] }))}><option value="CASUAL">Casual</option><option value="BALANCED">Balanced</option><option value="TOURNAMENT">Tournament</option><option value="ASYMMETRIC">Deliberately asymmetric</option></select></label>
                        </div>
                        {generationOptions.engine === "POLIS" && generationOptions.preset === "THREE_REALMS" && <small className="content-note">Three Realms requires at least three players and uses equal three-realm groups. Incompatible totals are reduced with a visible generation relaxation.</small>}
                        {generationOptions.engine === "POLIS" && generationOptions.preset === "UNEQUAL_REALMS" && <small className="content-note">Unequal Realms assigns Tall, Wide, War, and Turtle geographic roles. It is intentionally unbalanced and excluded from Randomise.</small>}
                        <div className="victory-intent-grid">
                          {(["DOMINATION", "SCIENCE", "CULTURE", "DIPLOMACY", "TIME"] as VictoryCondition[]).map((victory) => {
                            const enabled = matchIntent.enabledVictories.includes(victory);
                            const emphasized = matchIntent.emphasizedVictories.includes(victory);
                            return <div key={victory}><strong>{victory.toLowerCase()}</strong><button type="button" className={enabled ? "is-active" : ""} disabled={enabled && matchIntent.enabledVictories.length === 1} onClick={() => setMatchIntent((current) => enabled ? { ...current, enabledVictories: current.enabledVictories.filter((item) => item !== victory), emphasizedVictories: current.emphasizedVictories.filter((item) => item !== victory) } : { ...current, enabledVictories: [...current.enabledVictories, victory] })}>{enabled ? "Enabled" : "Disabled"}</button><button type="button" disabled={!enabled} className={emphasized ? "is-active" : ""} onClick={() => setMatchIntent((current) => ({ ...current, emphasizedVictories: emphasized ? current.emphasizedVictories.filter((item) => item !== victory) : [...current.emphasizedVictories, victory] }))}>{emphasized ? "Emphasized" : "Emphasize"}</button></div>;
                          })}
                        </div>
                        <details className="advanced-controls match-seat-plan">
                          <summary data-tooltip="Optionally bind Human, AI or Flexible control and a team number to each generated Polis start. Civilization identity still belongs to Scenario."><span>Advanced seat plan</span><small>{matchIntent.seats ? `${matchIntent.seats.length} assigned starts` : "composition only"}</small></summary>
                          <div className="seat-plan-actions">
                            <button type="button" onClick={() => setMatchIntent((current) => { const seats = Array.from({ length: generationOptions.players }, (_value, index) => ({ control: index < current.humanPlayers ? "HUMAN" as const : index < current.humanPlayers + current.aiPlayers ? "AI" as const : "FLEXIBLE" as const, team: current.teamIntent === "FIXED_TEAMS" ? Math.floor(index / current.teamSize) : undefined })); return { ...current, seats }; })}>{matchIntent.seats ? "Rebuild from counts" : "Assign starts from counts"}</button>
                            <button type="button" disabled={!matchIntent.seats} onClick={() => setMatchIntent((current) => ({ ...current, seats: undefined }))}>Use composition only</button>
                          </div>
                          {matchIntent.seats && <div className="seat-plan-list">{matchIntent.seats.slice(0, generationOptions.players).map((seat, index) => <div key={index}><strong>Start {index + 1}</strong><select aria-label={`Start ${index + 1} controller`} value={seat.control} onChange={(event) => setMatchIntent((current) => { const seats = [...(current.seats ?? [])]; seats[index] = { ...seats[index], control: event.target.value as typeof seat.control }; return { ...current, seats, humanPlayers: seats.filter((item) => item.control === "HUMAN").length, aiPlayers: seats.filter((item) => item.control === "AI").length, flexiblePlayers: seats.filter((item) => item.control === "FLEXIBLE").length }; })}><option value="HUMAN">Human</option><option value="AI">AI</option><option value="FLEXIBLE">Flexible</option></select><label><span>Team</span><input type="number" min="0" max="21" value={seat.team ?? ""} placeholder="—" onChange={(event) => setMatchIntent((current) => { const seats = [...(current.seats ?? [])]; seats[index] = { ...seats[index], team: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) }; return { ...current, seats }; })} /></label></div>)}</div>}
                        </details>
                      </fieldset>
                      {generationOptions.balance === "TEAMS" && (
                        <div className="team-balance-controls">
                          <label className="control-field"><span>Team size</span><select value={generationOptions.teamSize} onChange={(event) => setGenerationOptions((current) => ({ ...current, teamSize: Number(event.target.value) as 2 | 3 | 4 }))}><option value="2">2v2 teams</option><option value="3">3-player teams</option><option value="4">4-player teams</option></select></label>
                          <label className="control-field"><span>Team geography</span><select value={generationOptions.teamLayout} onChange={(event) => setGenerationOptions((current) => ({ ...current, teamLayout: event.target.value as MapGenerationOptions["teamLayout"] }))}><option value="CLUSTERED">Cluster teammates</option><option value="FRONTLINES">Opposing fronts</option><option value="DISTRIBUTED">Distributed teammates</option></select></label>
                        </div>
                      )}
                      <label className="control-field" data-tooltip={generationOptions.startQuality === "LEGENDARY" ? "Improves nearby terrain and adds six valuable resources." : generationOptions.startQuality === "BALANCED" ? "Places food, iron, and horses near every start." : "Leaves local terrain and resources untouched."}><span>Start quality</span><select value={generationOptions.startQuality} onChange={(event) => setGenerationOptions((current) => ({ ...current, startQuality: event.target.value as MapGenerationOptions["startQuality"], strategicBalance: false }))}><option value="STANDARD">Standard</option><option value="BALANCED">Balanced strategic access</option><option value="LEGENDARY">Legendary Start</option></select></label>
                      <details className="advanced-controls">
                        <summary data-tooltip="Reveal minimum city-state spacing, regional distribution, and coastal preference."><span>More start controls</span><small>city-state placement</small></summary>
                        <div className="control-grid three-controls">
                        <label className="control-field" data-tooltip="Five hexes is the hard minimum between every major and city-state start; larger values reserve still more opening room."><span>City-state spacing</span><input type="number" min="5" max="12" value={generationOptions.cityStateMinSpacing} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateMinSpacing: Math.max(5, Number(event.target.value)) }))} /></label>
                        <label className="control-field"><span>Distribution</span><select value={generationOptions.cityStateDistribution} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateDistribution: event.target.value as MapGenerationOptions["cityStateDistribution"] }))}><option value="EVEN">Even</option><option value="REGIONAL">Regional</option></select></label>
                        <label className="control-field"><span>Coastal preference</span><select value={generationOptions.cityStateCoastalPreference} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateCoastalPreference: event.target.value as MapGenerationOptions["cityStateCoastalPreference"] }))}><option value="ANY">Any</option><option value="PREFER">Prefer coast</option><option value="REQUIRE">Require coast</option></select></label>
                        </div>
                      </details>
                    </div>
                  </details>
                  </div>

                  <div className={`creator-actions${createView === "REFINE" ? " refine-actions" : ""}`}>
                    <div className="generation-summary action-recipe-summary" data-tooltip={generationSummary}><span>{createView === "REFINE" ? "Current refinement" : "Ready to generate"}</span><strong>{generationCompactSummary}</strong></div>
                    {createView === "REFINE" ? (
                      <div className="refinement-action-grid">
                        <button type="button" data-tooltip="Repaint terrain and biome features from the current climate and Archetype settings. A Difference preview opens before the current map is replaced." disabled={generationRunning} onClick={() => void runSelectivePass("CLIMATE")}><strong>Surface &amp; climate</strong><span>Preview <b aria-hidden="true">→</b></span></button>
                        <button type="button" data-tooltip="Regenerate resources, wonders, barbarian camps, ruins and other supported sites while retaining compatible geography, rivers and starts." disabled={generationRunning} onClick={() => void runSelectivePass("CONTENT")}><strong>Resources &amp; sites</strong><span>Regenerate <b aria-hidden="true">→</b></span></button>
                        <button type="button" data-tooltip="Rebuild major and city-state starting positions from the current population, Match Intent and balance settings while retaining the world itself." disabled={generationRunning} onClick={() => void runSelectivePass("STARTS")}><strong>Players &amp; starts</strong><span>Rebalance <b aria-hidden="true">→</b></span></button>
                      </div>
                    ) : generationRunning
                      ? <button className="generate-button" type="button" disabled>Generation in progress</button>
                      : <button className="generate-button" type="button" data-tooltip="Build a deterministic map from the complete recipe shown above, then add it to generation history." onClick={() => void generateNewMap()}>Generate map</button>}
                    <div className="generation-readout"><span>Current map</span><strong>{generationMetrics.water}% water · {generationMetrics.mountains}% mountains</strong></div>
                  </div>
                </>
                )
              ) : createView === "EDIT" ? (
                <div className="tile-editor">
                  <div className="section-title"><h3>Edit map</h3><span>click a hex</span></div>
                  <div className="tool-tabs">
                    <button type="button" data-tooltip="Paint terrain, elevation, features, or resources across a configurable hex radius." className={editTool === "TILE" ? "is-active" : ""} onClick={() => setEditTool("TILE")}>Tile brush</button>
                    <button type="button" data-tooltip="Replace an entire connected region matching the clicked tile using the active brush fields." className={editTool === "FILL" ? "is-active" : ""} onClick={() => setEditTool("FILL")}>Flood fill</button>
                    <button type="button" data-tooltip="Select a rectangular tile region for copy, paste, deletion, or later structural operations." className={editTool === "SELECT" ? "is-active" : ""} onClick={() => setEditTool("SELECT")}>Region</button>
                    <button type="button" data-tooltip="Select geography and protect chosen channels from later selective regeneration." className={editTool === "PRESERVE" ? "is-active" : ""} onClick={() => { setEditTool("PRESERVE"); setIsPasting(false); }}>Drag to Preserve</button>
                    <button type="button" data-tooltip="Apply coherent tectonic, basin, mountain, climate, or watershed changes to a selected region." className={editTool === "STRUCTURE" ? "is-active" : ""} onClick={() => { setEditTool("STRUCTURE"); setIsPasting(false); }}>World structure</button>
                    <button type="button" data-tooltip="Add, remove, or relocate major-civilization and city-state starting positions." className={editTool === "START" ? "is-active" : ""} onClick={() => setEditTool("START")}>Start positions</button>
                  </div>
                  {editTool === "TILE" || editTool === "FILL" ? (
                    <div className="brush-grid">
                      {editTool === "TILE" && <label className="control-field"><span>Brush size</span><select value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))}><option value="1">1 hex</option><option value="2">7 hexes</option><option value="3">19 hexes</option></select></label>}
                      <label className="control-field"><span>Terrain</span><select value={brush.terrain ?? ""} onChange={(event) => setBrush((current) => ({ ...current, terrain: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">No change</option>{map.terrains.map((name, index) => <option key={name} value={index}>{friendlyName(name, "TERRAIN_")}</option>)}</select></label>
                      <label className="control-field"><span>Elevation</span><select value={brush.elevation ?? ""} onChange={(event) => setBrush((current) => ({ ...current, elevation: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">No change</option><option value="0">Flat</option><option value="1">Hills</option><option value="2">Mountain</option></select></label>
                      <label className="control-field"><span>Feature</span><select value={brush.feature ?? ""} onChange={(event) => setBrush((current) => ({ ...current, feature: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">No change</option><option value="255">None</option>{map.features.map((name, index) => <option key={name} value={index}>{friendlyName(name, "FEATURE_")}</option>)}</select></label>
                      <label className="control-field"><span>Resource</span><select value={brush.resource ?? ""} onChange={(event) => setBrush((current) => ({ ...current, resource: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">No change</option><option value="255">None</option>{map.resources.map((name, index) => <option key={name} value={index}>{friendlyName(name, "RESOURCE_")}</option>)}</select></label>
                      {editTool === "FILL" && <p className="editor-note">Click a connected region to replace every matching tile using the active fields.</p>}
                    </div>
                  ) : editTool === "SELECT" ? (
                    <div className="region-tools">
                      <p className="editor-note">Choose two opposite corners to select a rectangular terrain region.</p>
                      {selection && <strong>{selection.maxX - selection.minX + 1} × {selection.maxY - selection.minY + 1} tiles selected</strong>}
                      <div>
                        <button type="button" disabled={!selection} onClick={copySelection}>Copy</button>
                        <button type="button" disabled={!tileClipboard} className={isPasting ? "is-active" : ""} onClick={() => setIsPasting((current) => !current)}>Paste</button>
                        <button type="button" disabled={!selection} onClick={() => { setSelection(null); setSelectionAnchor(null); setIsPasting(false); }}>Clear</button>
                      </div>
                      {isPasting && <small>Click the destination tile for the copied region&apos;s lower-left corner.</small>}
                    </div>
                  ) : editTool === "PRESERVE" ? (
                    <div className="preservation-editor">
                      <p className="editor-note">Paint exact tile channels or preserve the function, shape, or relationships of retained geography. Hard conflicts leave the current map untouched.</p>
                      <div className="protection-toolbar"><label><input type="checkbox" checked={showProtectionOverlay} onChange={(event) => setShowProtectionOverlay(event.target.checked)} /> Show violet overlay</label><div><button type="button" disabled={!pastProtectionStates.length} onClick={undoProtection}>Undo protection</button><button type="button" disabled={!futureProtectionStates.length} onClick={redoProtection}>Redo</button></div></div>
                      {selection ? <strong>{selection.maxX - selection.minX + 1} × {selection.maxY - selection.minY + 1} tiles selected</strong> : <small>No region selected.</small>}
                      <label className="control-field"><span>Region name</span><input value={protectionRegionName} maxLength={80} onChange={(event) => setProtectionRegionName(event.target.value)} /></label>
                      <div className="protection-channel-grid">{PROTECTION_CHANNELS.map((channel) => <label key={channel}><input type="checkbox" checked={preserveChannels.has(channel)} onChange={(event) => setPreserveChannels((current) => { const next = new Set(current); if (event.target.checked) next.add(channel); else next.delete(channel); return next; })} /><span>{channel.toLowerCase().replaceAll("_", " ")}</span></label>)}</div>
                      <div><button type="button" disabled={!selection || !preserveChannels.size} onClick={preserveSelection}>Preserve selected region</button><button type="button" disabled={!selection || !preserveChannels.size || !protectionState.tileMask} onClick={eraseSelectionProtection}>Erase from selection</button><button type="button" onClick={() => commitProtection(emptyProtectionState())} disabled={!protectionState.tileMask && !protectionState.semantic.length}>Clear all</button></div>
                      <div className="semantic-protection-controls">
                        <label className="control-field"><span>Semantic geography</span><select value={semanticProtectionId} onChange={(event) => setSemanticProtectionId(event.target.value)}><option value="">Choose a generated or inferred object</option>{semanticProtectionChoices.map((object) => <option key={object.semanticId} value={object.semanticId}>{object.label} · {object.objectKind.toLowerCase().replaceAll("_", " ")} · {Math.round(object.inference.confidence * 100)}%</option>)}</select></label>
                        <div className="control-grid two-controls"><label className="control-field"><span>Policy</span><select value={semanticProtectionPolicy} onChange={(event) => setSemanticProtectionPolicy(event.target.value as typeof semanticProtectionPolicy)}><option value="EXACT">Exact · retain chosen values</option><option value="SHAPE">Shape · retain footprint</option><option value="FUNCTION">Function · retain geographic job</option><option value="RELATIONSHIP">Relationship · retain connections</option></select></label><label className="checkbox-row"><input type="checkbox" checked={semanticProtectionHard} onChange={(event) => setSemanticProtectionHard(event.target.checked)} /><span><strong>Hard constraint</strong><small>Block rather than degrade</small></span></label></div>
                        {semanticProtectionId && (() => { const selected = semanticProtectionChoices.find((object) => object.semanticId === semanticProtectionId); return selected ? <small>{selected.inference.source === "IMPORTED" ? "Inferred from imported tiles" : "Retained by the generator"} · {Math.round(selected.inference.confidence * 100)}% confidence · {selected.inference.explanation}</small> : null; })()}
                        <button type="button" disabled={!semanticProtectionId} onClick={preserveSemanticSelection}>{semanticProtectionChoices.find((object) => object.semanticId === semanticProtectionId)?.objectKind === "RIVER_SYSTEM" || semanticProtectionChoices.find((object) => object.semanticId === semanticProtectionId)?.objectKind === "WATERSHED" || semanticProtectionChoices.find((object) => object.semanticId === semanticProtectionId)?.objectKind === "RIVER_BASIN" ? "Preserve this watershed" : "Preserve this feature"}</button>
                      </div>
                      {(protectionState.tileMask?.namedRegions.length || protectionState.semantic.length) ? <div className="protection-register">{protectionState.tileMask?.namedRegions.map((region) => <div key={region.id}><span><strong>{region.name}</strong><small>{region.tileIndices.length} tiles · {region.channels.map((channel) => channel.toLowerCase()).join(", ")}</small></span><button type="button" onClick={() => commitProtection(removeProtection(protectionState, region.id))}>Remove</button></div>)}{protectionState.semantic.map((semantic) => <div key={semantic.id}><span><strong>{semantic.label}</strong><small>{semantic.policy.toLowerCase()} · {semantic.hard ? "hard" : "soft"} · {Math.round((semantic.inference?.confidence ?? 0) * 100)}% lineage confidence</small></span><button type="button" onClick={() => commitProtection(removeProtection(protectionState, semantic.id))}>Remove</button></div>)}</div> : <small>No protection constraints yet.</small>}
                      {protectionState.lastReport && <div className="protection-report"><strong>{protectionState.lastReport.summary}</strong><small>{protectionState.lastReport.engineAdapter.toLowerCase().replaceAll("_", " ")} · {protectionState.lastReport.candidateCount} candidates · {protectionState.lastReport.seamRepairs} seam repairs</small>{protectionState.lastReport.findings.map((finding) => <p key={finding.protectionId} data-status={finding.status}>{finding.label}: {Math.round(finding.score * 100)}% · {finding.message}</p>)}</div>}
                    </div>
                  ) : editTool === "STRUCTURE" ? (
                    <div className="structure-editor">
                      <p className="editor-note">Select two corners on the map, then reshape the region as a coherent world structure.</p>
                      {selection ? <strong>{selection.maxX - selection.minX + 1} × {selection.maxY - selection.minY + 1} tiles selected</strong> : <small>No world region selected.</small>}
                      <label className="control-field"><span>Operation</span><select value={structureOperation} onChange={(event) => setStructureOperation(event.target.value as StructureOperation)}><option value="RAISE_PLATE">Raise tectonic plate</option><option value="CARVE_BASIN">Carve sea basin</option><option value="RIDGE">Build mountain chain</option><option value="CLIMATE">Paint climate region</option><option value="WATERSHED">Rebuild watershed</option></select></label>
                      <label className="control-field"><span>Strength</span><select value={structureStrength} onChange={(event) => setStructureStrength(Number(event.target.value) as 1 | 2 | 3)}><option value="1">Subtle</option><option value="2">Pronounced</option><option value="3">Extreme</option></select></label>
                      {structureOperation === "CLIMATE" && <small>Climate painting uses the first dominant terrain selected under Generate, or grassland when none is selected.</small>}
                      <div><button type="button" disabled={!selection} onClick={applyWorldStructure}>Apply to region</button><button type="button" disabled={!selection} onClick={() => { setSelection(null); setSelectionAnchor(null); }}>Clear</button></div>
                    </div>
                  ) : <p className="editor-note">Click a hex to add or remove a numbered major start. Team Mode groups consecutive players using the selected team size.</p>}
                </div>
              ) : (
                <div className="analysis-panel">
                  {map.structure?.evidenceState === "STALE" && (
                    <section className="stale-evidence-notice" role="status">
                      <div><strong>Generated evidence is out of date</strong><span>{map.structure.staleReason ?? "Authored map data changed after the retained generation evidence was calculated."}</span></div>
                      <small>{map.structure.passEvidence?.filter((entry) => entry.state === "STALE").map((entry) => entry.passId.toLowerCase().replaceAll("_", " ")).join(" · ") || "All retained generation evidence must be rebuilt."}</small>
                      <button type="button" disabled={generationRunning} onClick={() => void generateNewMap()}>Regenerate map and evidence</button>
                    </section>
                  )}
                  {narrativeAssessment && (
                    <section className="narrative-assessment">
                      <div className="analysis-summary">
                        <span className={`analysis-grade grade-${narrativeAssessment.grade.toLowerCase()}`}>{narrativeAssessment.grade === "UNASSESSED" ? "—" : narrativeAssessment.grade}</span>
                        <div><h3>{narrativeAssessment.label} recognition</h3><p>{narrativeAssessment.summary}</p></div>
                      </div>
                      <div className="narrative-finding-list">
                        {narrativeAssessment.motifs.map((finding) => <div key={finding.id} className={`narrative-finding status-${finding.status.toLowerCase()}`}><span>{finding.status}</span><div><strong>{finding.label}</strong><small>{finding.evidence}</small></div><b>{finding.status === "UNAVAILABLE" ? "—" : `${finding.score}%`}</b></div>)}
                      </div>
                      {(narrativeAssessment.parameterDeviations.length > 0 || narrativeAssessment.weakened.length > 0) && <details className="narrative-disclosure"><summary>Weakened identity and control conflicts</summary><ul>{[...new Set([...narrativeAssessment.parameterDeviations, ...narrativeAssessment.weakened])].map((item) => <li key={item}>{item}</li>)}</ul></details>}
                      {narrativeAssessment.nearestConfusions.length > 0 && <details className="narrative-disclosure"><summary>Nearest confusions</summary><ul>{narrativeAssessment.nearestConfusions.map((item) => <li key={item.profileId}><strong>{item.label} · {item.risk.toLowerCase()} risk</strong><span>{item.evidence}</span></li>)}</ul></details>}
                    </section>
                  )}
                  {map.structure?.matchAssessment && (
                    <section className="match-feasibility-assessment">
                      <div className="section-title"><h3>Match Intent feasibility</h3><span>{map.structure.matchAssessment.engine.toLowerCase()} evidence</span></div>
                      <p>{map.structure.matchAssessment.summary}</p>
                      <div className="victory-feasibility-list">
                        {map.structure.matchAssessment.victories.map((finding) => <article key={finding.victory} className={`status-${finding.status.toLowerCase()}`}><header><strong>{finding.victory.toLowerCase()}</strong><span>{finding.state.toLowerCase()} · {finding.status.toLowerCase()} · {finding.score}%</span></header>{finding.evidence.map((item) => <small key={item}>{item}</small>)}</article>)}
                      </div>
                      {map.structure.matchAssessment.limitations.map((limitation) => <small key={limitation}>{limitation}</small>)}
                    </section>
                  )}
                  <div className="analysis-summary">
                    <span className={`analysis-grade grade-${balanceReport.grade.toLowerCase()}`}>{balanceReport.grade}</span>
                    <div><h3>Multiplayer balance</h3><p>{balanceReport.summary}</p></div>
                  </div>
                  {map.structure?.strategicGraph && (
                    <section className="polis-audit">
                      <div className="section-title"><h3>Polis strategic audit</h3><span>{map.structure.strategicGraph.relaxations.length ? `${map.structure.strategicGraph.relaxations.length} relaxed` : "hard constraints intact"}</span></div>
                      <p>{map.structure.strategicGraph.pattern.replaceAll("_", " ").toLowerCase()} · {map.structure.strategicGraph.symmetry.toLowerCase()} geometry. The retained graph is the design model used before terrain, not an interpretation reconstructed afterward.</p>
                      <dl>
                        <div><dt>Fronts</dt><dd>{map.structure.strategicGraph.edges.length}</dd></div>
                        <div><dt>Land routes</dt><dd>{map.structure.strategicGraph.metrics.landRoutes ?? 0}</dd></div>
                        <div><dt>Naval routes</dt><dd>{map.structure.strategicGraph.metrics.navalRoutes ?? 0}</dd></div>
                        <div><dt>Protected tiles</dt><dd>{map.structure.strategicGraph.protectedTileIndices.length}</dd></div>
                        <div><dt>Minimum start distance</dt><dd>{map.structure.strategicGraph.metrics.minimumStartDistance ?? 0}</dd></div>
                        <div><dt>Average front length</dt><dd>{map.structure.strategicGraph.metrics.averageFrontLength ?? 0}</dd></div>
                        <div><dt>Route redundancy</dt><dd>{map.structure.strategicGraph.metrics.routeRedundancy ?? 0}</dd></div>
                        <div><dt>City-state contestability</dt><dd>{Math.round((map.structure.strategicGraph.metrics.cityStateContestability ?? 0) * 100)}%</dd></div>
                      </dl>
                      <div className="polis-role-list">{map.structure.strategicGraph.realmRoles.map((role) => <span key={`${role.team}-${role.role}`}><strong>{role.role.toLowerCase().replaceAll("_", " ")}</strong> · {role.playerIds.map((player) => `P${player + 1}`).join(", ")}</span>)}</div>
                      {map.structure.strategicGraph.relaxations.length > 0 && <small>{map.structure.strategicGraph.relaxations.join(" ")}</small>}
                    </section>
                  )}
                  <div className="player-balance-list">
                    {balanceReport.players.map((player) => (
                      <button type="button" key={player.player} className={focusedStart?.player === player.player ? "is-active" : ""} onClick={() => setFocusedStart(map.startLocations.find((start) => !start.cityState && start.player === player.player) ?? null)}>
                        <span className={`player-grade grade-${player.grade.toLowerCase()}`}>{player.grade}</span>
                        <strong>Player {player.player + 1}<small>Score {player.score}</small></strong>
                        <dl><div><dt>Land</dt><dd>{player.workableLand}</dd></div><div><dt>Strategic</dt><dd>{player.strategicResources}</dd></div><div><dt>Luxury</dt><dd>{player.luxuries}</dd></div><div><dt>Opponent</dt><dd>{player.nearestOpponent ?? "—"}</dd></div></dl>
                      </button>
                    ))}
                  </div>
                  <div className="validation-section">
                    <div className="section-title"><h3>Civ5 validation</h3><span>{validationIssues.filter((issue) => issue.severity !== "INFO").length} findings</span></div>
                    <div className="validation-list">
                      {validationIssues.map((issue, index) => <div key={`${issue.category}-${index}`} className={`validation-issue severity-${issue.severity.toLowerCase()}`}><span>{issue.severity}</span><p>{issue.message}</p></div>)}
                    </div>
                  </div>
                </div>
              )}
            </CreateStagePanel>
          )}

          {mode === "SCRIPT" && (
            <div id="lua-workspace-panel" className="script-panel">
              {luaStage === "SCRIPT" && (
                <>
                  <div className="section-title"><h3>Lua script</h3><span>sandboxed</span></div>
                  <p>Load the main Civ V map script and its named dependencies, then edit generator functions or add a repeatable post-process hook.</p>
                  <div className="lua-project-actions">
                    <button type="button" onClick={() => luaInputRef.current?.click()}>{luaSource ? "Replace main script" : "Open main script"}</button>
                    <button type="button" disabled={!luaSource} onClick={() => luaDependencyInputRef.current?.click()}>Add dependencies</button>
                  </div>
                  {luaSource ? (
                    <>
                      <div className="lua-project-file"><span>Main</span><strong>{luaFileName}</strong><small>{luaSource.split("\n").length.toLocaleString()} lines</small></div>
                      <details className="lua-workspace-group" open>
                        <summary><span>Source editor</span><small>Modify generator functions directly</small></summary>
                        <div className="lua-workspace-body"><textarea className="lua-source-editor" aria-label="Lua main script source" spellCheck={false} value={luaSource} onChange={(event) => { setLuaSource(event.target.value); setLuaMetadata(null); }} /></div>
                      </details>
                      <details className="lua-workspace-group" open={luaDependencies.length > 0}>
                        <summary><span>Dependencies</span><small>{luaDependencies.length ? `${luaDependencies.length} supplied` : "Built-in compatibility includes only"}</small></summary>
                        <div className="lua-workspace-body">
                          {luaDependencies.length ? <div className="lua-dependency-list">{luaDependencies.map((dependency) => <div key={dependency.name}><span>{dependency.name}</span><small>{dependency.source.split("\n").length} lines</small><button type="button" aria-label={`Remove ${dependency.name}`} onClick={() => setLuaDependencies((current) => current.filter((item) => item.name !== dependency.name))}>Remove</button></div>)}</div> : <p className="lua-empty-note">Common Civ V helpers such as MapGenerator, bit, vectors, and starting-plot scaffolding are supplied by the runtime. Add mod-specific files here.</p>}
                          <button className="lua-inline-button" type="button" onClick={() => luaDependencyInputRef.current?.click()}>Add .lua files</button>
                        </div>
                      </details>
                      <details className="lua-workspace-group">
                        <summary><span>Post-process hook</span><small>Replay modifications after generation</small></summary>
                        <div className="lua-workspace-body">
                          <textarea className="lua-hook-editor" aria-label="Lua post-process hook" spellCheck={false} placeholder={'-- Runs after the script finishes.\n-- Example:\n-- Map.GetPlot(4, 4):SetTerrainType(TerrainTypes.TERRAIN_DESERT)'} value={luaPostProcess} onChange={(event) => { setLuaPostProcess(event.target.value); setLuaMetadata(null); }} />
                          <p className="lua-empty-note">The hook can call the same Map and plot APIs as the generator. It reruns every time you generate.</p>
                        </div>
                      </details>
                    </>
                  ) : <p className="workspace-empty-state">Open a main `.lua` map script to begin. Excogitare will inspect it before generation and report unsupported APIs separately.</p>}
                </>
              )}

              {luaStage === "GENERATE" && (
                <>
                  <div className="section-title"><h3>Lua generation</h3><span>{luaSource ? "configured" : "script required"}</span></div>
                  <p>Configure script options and fallback runtime values, then execute the project into an ordinary editable Excogitare map.</p>
                  {luaSource ? (
                    <>
                      <div className="lua-project-file"><span>Main</span><strong>{luaFileName}</strong><small>{luaDependencies.length} dependencies</small></div>
                      <div className="lua-generate-panel">
                        <button className="lua-run-button" type="button" disabled={luaIsRunning} onClick={runLuaProject}>{luaIsRunning ? "Generating map from Lua…" : luaMetadata ? "Regenerate map from Lua" : "Generate map from Lua"}</button>
                        <div className={`lua-run-status${luaIsRunning ? " is-running" : ""}`} role="status" aria-live="polite">{luaRunStatus || "Ready to generate an editable map."}</div>
                        <small>Runs the main script, supplied dependencies, selected options, and post-process hook. The result replaces the current map and remains fully editable.</small>
                      </div>
                      {luaCustomOptions.length > 0 && (
                        <details className="lua-workspace-group" open>
                          <summary><span>Script options</span><small>{luaCustomOptions.length} discovered by GetMapScriptInfo()</small></summary>
                          <div className="lua-workspace-body">
                            {luaCustomOptions.map((option) => (
                              <label className="control-field" key={option.index}>
                                <span>{option.name}</span>
                                {option.values.length ? <select value={option.selectedValue} onChange={(event) => setLuaCustomOptions((current) => current.map((item) => item.index === option.index ? { ...item, selectedValue: Number(event.target.value) } : item))}>{option.values.map((value, index) => <option key={`${value}-${index}`} value={index + 1}>{value || `Value ${index + 1}`}</option>)}</select> : <input type="number" min="1" value={option.selectedValue} onChange={(event) => setLuaCustomOptions((current) => current.map((item) => item.index === option.index ? { ...item, selectedValue: Number(event.target.value) } : item))} />}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                      <details className="lua-workspace-group" open>
                        <summary><span>Runtime</span><small>Fallback allocation, seed, and starts</small></summary>
                        <div className="lua-workspace-body">
                          <div className="control-grid">
                            <label className="control-field"><span>Fallback size</span><select value={generationOptions.size} onChange={(event) => setGenerationOptions((current) => ({ ...current, size: event.target.value as MapGenerationOptions["size"] }))}>{MAP_SIZES.filter((item) => allowGameBreakingGeometry || !item.gameBreaking).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}{item.gameBreaking ? " · experimental" : ""}</option>)}</select></label>
                            <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
                          </div>
                          <div className="control-grid">
                            <label className="control-field" data-tooltip="Minor powers are spaced from all other settler starts by at least five hexes."><span>City states</span><input type="number" min="0" max="41" value={generationOptions.cityStates} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStates: Number(event.target.value) }))} /></label>
                            <label className="control-field"><span>Runtime seed</span><input value={generationOptions.seed} onChange={(event) => setGenerationOptions((current) => ({ ...current, seed: event.target.value }))} /></label>
                          </div>
                          <p className="lua-empty-note">GetMapInitData() overrides fallback dimensions and wrap type. Excogitare fills player starts the script leaves unassigned.</p>
                        </div>
                      </details>
                    </>
                  ) : <div className="workspace-empty-state"><p>Generation needs a main Lua script.</p><button className="lua-inline-button" type="button" onClick={() => { setLuaStage("SCRIPT"); luaInputRef.current?.click(); }}>Open main script</button></div>}
                </>
              )}

              {luaStage === "DIAGNOSTICS" && (
                <>
                  <div className="section-title"><h3>Lua diagnostics</h3><span>{luaReport ? "report available" : "not run"}</span></div>
                  <p>Compatibility inspection, execution stages, missing includes, and console output are collected here rather than interrupting script editing.</p>
                  {luaReport && <div className={`lua-report${luaReport.compatible ? " is-compatible" : ""}`}><strong>{luaReport.title}</strong><small>{luaFileName}</small><ul>{luaReport.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>}
                  {luaMetadata && <details className="lua-pipeline" open><summary>Execution pipeline</summary><ol>{luaMetadata.stages.map((stage) => <li key={stage.id} className={stage.status === "COMPLETE" ? "is-complete" : "is-skipped"}><span>{stage.label}</span><small>{stage.detail}</small></li>)}</ol></details>}
                  {luaLogs.length > 0 && <details className="lua-console" open><summary>Script console · {luaLogs.length} lines</summary><pre>{luaLogs.join("\n")}</pre></details>}
                  {!luaReport && !luaMetadata && !luaLogs.length && <p className="workspace-empty-state">Open a script to receive the initial compatibility report, then generate it to record the execution pipeline and console output.</p>}
                </>
              )}
              <div className="script-export-grid">
                <button type="button" onClick={exportLua}>Export map Lua</button>
                <button type="button" onClick={exportModInfo}>Export .modinfo</button>
              </div>
            </div>
          )}
          {mode === "VIEW" && (
          <div className="explore-sidebar-display">
          <dl className="map-stats">
            <div><dt>Dimensions</dt><dd>{map.width} × {map.height}</dd></div>
            <div><dt>World</dt><dd>{friendlyName(map.worldSize, "")}</dd></div>
            <div><dt>Tiles</dt><dd>{map.tiles.length.toLocaleString()}</dd></div>
            <div><dt>Wrap</dt><dd>{map.wraps ? "East / west" : "None"}</dd></div>
          </dl>

          <div className="panel-section">
            <div className="section-title"><h3>Layers</h3><span>{visibleLayerCount} on</span></div>
            <div className="layer-list">
              <label className={`layer-row${politicalAvailable ? "" : " is-disabled"}`}>
                <span><strong>Political</strong><small>{hasScenarioOwnership ? "Scenario territories and borders" : politicalAvailable ? "Projected start influence" : "No ownership data in this map"}</small></span>
                <input
                  type="checkbox"
                  checked={layers.political}
                  disabled={!politicalAvailable}
                  onChange={(event) => setLayers((current) => ({ ...current, political: event.target.checked }))}
                />
                <span className="switch" aria-hidden="true" />
              </label>
              <label className={`layer-row${strategyAvailable ? "" : " is-disabled"}`}>
                <span><strong>Strategy graph</strong><small>{strategyAvailable ? "Polis regions, fronts, and protected routes" : "Available on Polis generations"}</small></span>
                <input type="checkbox" checked={layers.strategy} disabled={!strategyAvailable} onChange={(event) => setLayers((current) => ({ ...current, strategy: event.target.checked }))} />
                <span className="switch" aria-hidden="true" />
              </label>
              {([
                ["grid", "Hex grid", "Map geometry"],
                ["features", "Features", "Forest, jungle, ice"],
                ["resources", "Resources", "Bonus and strategic"],
                ["elevation", "Elevation", "Hills and mountains"],
              ] as const).map(([key, label, note]) => (
                <label className="layer-row" key={key}>
                  <span><strong>{label}</strong><small>{note}</small></span>
                  <input type="checkbox" checked={layers[key]} onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))} />
                  <span className="switch" aria-hidden="true" />
                </label>
              ))}
              <label className={`layer-row${majorStartCount ? "" : " is-disabled"}`}>
                <span><strong>Start locations</strong><small>{majorStartCount ? `${majorStartCount} positions` : "Not stored in this map"}</small></span>
                <input
                  type="checkbox"
                  checked={layers.starts}
                  disabled={!majorStartCount}
                  onChange={(event) => setLayers((current) => ({ ...current, starts: event.target.checked }))}
                />
                <span className="switch" aria-hidden="true" />
              </label>
              <label className={`layer-row${cityStateCount ? "" : " is-disabled"}`}>
                <span><strong>City states</strong><small>{cityStateCount ? `${cityStateCount} positions` : "Not stored in this map"}</small></span>
                <input
                  type="checkbox"
                  checked={layers.cityStates}
                  disabled={!cityStateCount}
                  onChange={(event) => setLayers((current) => ({ ...current, cityStates: event.target.checked }))}
                />
                <span className="switch" aria-hidden="true" />
              </label>
            </div>
          </div>

          <div className="panel-section terrain-section">
            <div className="section-title"><h3>Terrain</h3><span>tile count</span></div>
            <div className="legend-list">
              {terrainBreakdown.map(([name, count]) => (
                <div className="legend-row" key={name}>
                  <span className="legend-swatch" style={{ background: terrainColor(`TERRAIN_${name.toUpperCase()}`) }} />
                  <span>{name}</span><strong>{count.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </div>
          </div>
          )}

          {mode !== "LAB" && <button className="demo-button" type="button" onClick={() => { replaceMap(createDemoMap()); setProjectScenario(null); setShowEditPrompt(false); setIsEditingMetadata(false); setMessage("Demo map loaded"); }}>Reset to sample map</button>}
          <footer className="sidebar-footer">
            <a href="https://github.com/AngelaDMerkel/Excogitare#readme" target="_blank" rel="noreferrer">
              README <span aria-hidden="true">↗</span>
            </a>
          </footer>
        </aside>

        <div
          ref={canvasShellRef}
          className={`canvas-shell${isDraggingFile ? " is-dragging" : ""}${mode === "CREATE" && createView === "EDIT" ? " is-editing" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDraggingFile(false); }}
          onDrop={mode === "LAB" ? undefined : onDrop}
        >
          <canvas
            ref={canvasRef}
            aria-label={mode === "LAB" ? "Interactive blind identity candidate" : `Interactive physical map of ${canvasMap.name}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current = null; preserveDragRef.current = null; setSelectionAnchor(null); }}
            onPointerLeave={() => { if (!dragRef.current) setHovered(null); }}
            onWheel={onWheel}
          />

          {mode !== "LAB" && <div className="mobile-map-actions" aria-label="Mobile map actions">
            <button
              className="mobile-randomise-button"
              type="button"
              disabled={generationRunning}
              aria-busy={generationRunning}
              onClick={() => void randomiseWorld(true)}
            >
              {generationRunning ? "Generating…" : "Randomise & Generate"}
            </button>
            <button
              className="mobile-download-button"
              type="button"
              disabled={generationRunning || isEditingMetadata}
              onClick={exportCiv5Map}
            >
              Download .Civ5Map
            </button>
          </div>}

          <div className="map-toolbar" aria-label="Map controls">
            <button type="button" data-tooltip="Zoom into the map around the centre of the visible canvas." onClick={() => zoomAt(1.2, size.width / 2, size.height / 2)} aria-label="Zoom in">+</button>
            <span>{Math.round(view.zoom * 100)}%</span>
            <button type="button" data-tooltip="Zoom away from the map around the centre of the visible canvas." onClick={() => zoomAt(0.83, size.width / 2, size.height / 2)} aria-label="Zoom out">−</button>
            <i aria-hidden="true" />
            <button className="fit-button" type="button" data-tooltip="Fit the entire map inside the available canvas, including extreme aspect ratios." onClick={() => fitMap(size)}>Fit</button>
            {mode !== "LAB" && <>
            {mode === "CREATE" && <>
            <i aria-hidden="true" />
            <button className="png-export-button" type="button" data-tooltip="Export the current rendered view as a transparent-background PNG at high resolution." onClick={exportView} aria-label="Export PNG">PNG</button>
            </>}
            <i aria-hidden="true" />
            <button className={`projection-button${projection === "ISOMETRIC" ? " is-active" : ""}`} type="button" data-tooltip={projection === "ISOMETRIC" ? "Return to the flat 2D hex rendering." : "Tilt the map into the decorative isometric renderer with raised hills and mountains."} aria-pressed={projection === "ISOMETRIC"} onClick={() => setProjection((current) => current === "FLAT" ? "ISOMETRIC" : "FLAT")}>{projection === "ISOMETRIC" ? "2D" : "ISO 3D"}</button>
            <i aria-hidden="true" />
            <button className={`display-button${showDisplayPanel ? " is-active" : ""}`} type="button" data-tooltip="Show map dimensions, terrain counts, and rendering-layer switches without leaving the canvas." aria-expanded={showDisplayPanel} aria-controls="map-display-panel" aria-label={showDisplayPanel ? "Hide map display controls" : "Show map display controls"} onClick={() => { setShowDisplayPanel((current) => !current); setShowLegend(false); }}>Display</button>
            <button className={`legend-button${showLegend ? " is-active" : ""}`} type="button" data-tooltip="Explain terrain colours, relief, rivers, resources, wonders, starts, city states, camps, ruins, roads, and scenario symbols." aria-expanded={showLegend} aria-controls="map-legend" aria-label={showLegend ? "Hide map legend" : "Show map legend"} onClick={() => { setShowLegend((current) => !current); setShowDisplayPanel(false); }}>Legend</button>
            </>}
          </div>

          {showDisplayPanel && (
            <aside id="map-display-panel" className="map-display-panel" aria-label="Map display controls">
              <header>
                <div><span>Map view</span><h2>Display</h2></div>
                <button type="button" aria-label="Close map display controls" onClick={() => setShowDisplayPanel(false)}>×</button>
              </header>
              <dl className="map-stats">
                <div><dt>Dimensions</dt><dd>{canvasMap.width} × {canvasMap.height}</dd></div>
                <div><dt>World</dt><dd>{friendlyName(canvasMap.worldSize, "")}</dd></div>
                <div><dt>Tiles</dt><dd>{canvasMap.tiles.length.toLocaleString()}</dd></div>
                <div><dt>Wrap</dt><dd>{canvasMap.wraps ? "East / west" : "None"}</dd></div>
              </dl>
              <section>
                <div className="section-title"><h3>Layers</h3><span>{visibleLayerCount} on</span></div>
                <div className="layer-list">
                  <label className={`layer-row${politicalAvailable ? "" : " is-disabled"}`}>
                    <span><strong>Political</strong><small>{hasScenarioOwnership ? "Scenario territories and borders" : politicalAvailable ? "Projected start influence" : "No ownership data in this map"}</small></span>
                    <input type="checkbox" checked={layers.political} disabled={!politicalAvailable} onChange={(event) => setLayers((current) => ({ ...current, political: event.target.checked }))} />
                    <span className="switch" aria-hidden="true" />
                  </label>
                  <label className={`layer-row${strategyAvailable ? "" : " is-disabled"}`}>
                    <span><strong>Strategy graph</strong><small>{strategyAvailable ? "Polis regions, fronts, and protected routes" : "Available on Polis generations"}</small></span>
                    <input type="checkbox" checked={layers.strategy} disabled={!strategyAvailable} onChange={(event) => setLayers((current) => ({ ...current, strategy: event.target.checked }))} />
                    <span className="switch" aria-hidden="true" />
                  </label>
                  {([
                    ["grid", "Hex grid", "Map geometry"],
                    ["features", "Features", "Forest, jungle, ice"],
                    ["resources", "Resources", "Bonus and strategic"],
                    ["elevation", "Elevation", "Hills and mountains"],
                  ] as const).map(([key, label, note]) => (
                    <label className="layer-row" key={key}>
                      <span><strong>{label}</strong><small>{note}</small></span>
                      <input type="checkbox" checked={layers[key]} onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))} />
                      <span className="switch" aria-hidden="true" />
                    </label>
                  ))}
                  <label className={`layer-row${majorStartCount ? "" : " is-disabled"}`}>
                    <span><strong>Start locations</strong><small>{majorStartCount ? `${majorStartCount} positions` : "Not stored in this map"}</small></span>
                    <input type="checkbox" checked={layers.starts} disabled={!majorStartCount} onChange={(event) => setLayers((current) => ({ ...current, starts: event.target.checked }))} />
                    <span className="switch" aria-hidden="true" />
                  </label>
                  <label className={`layer-row${cityStateCount ? "" : " is-disabled"}`}>
                    <span><strong>City states</strong><small>{cityStateCount ? `${cityStateCount} positions` : "Not stored in this map"}</small></span>
                    <input type="checkbox" checked={layers.cityStates} disabled={!cityStateCount} onChange={(event) => setLayers((current) => ({ ...current, cityStates: event.target.checked }))} />
                    <span className="switch" aria-hidden="true" />
                  </label>
                </div>
              </section>
              <details className="display-terrain-breakdown">
                <summary>Terrain counts</summary>
                <div className="legend-list">
                  {terrainBreakdown.map(([name, count]) => (
                    <div className="legend-row" key={name}>
                      <span className="legend-swatch" style={{ background: terrainColor(`TERRAIN_${name.toUpperCase()}`) }} />
                      <span>{name}</span><strong>{count.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </details>
            </aside>
          )}

          {showLegend && (
            <aside id="map-legend" className="map-legend" aria-label="Map icon legend">
              <header>
                <div><span>Map key</span><h2>Legend</h2></div>
                <button type="button" aria-label="Close map legend" onClick={() => setShowLegend(false)}>×</button>
              </header>

              <section>
                <h3>Terrain color</h3>
                <div className="legend-terrain-grid">
                  {canvasMap.terrains.map((terrain, index) => (
                    <div key={`${terrain}-${index}`}><i style={{ background: terrainColor(terrain) }} aria-hidden="true" /><span>{friendlyName(terrain, "TERRAIN_")}</span></div>
                  ))}
                </div>
              </section>

              <section>
                <h3>Relief and waterways</h3>
                <div className="map-symbol-list">
                  <div><i className="legend-icon icon-hill" aria-hidden="true">▲</i><span><strong>Hill</strong><small>Dark, low relief</small></span></div>
                  <div><i className="legend-icon icon-mountain" aria-hidden="true">▲</i><span><strong>Mountain</strong><small>Pale or snow-capped peak</small></span></div>
                  <div><i className="legend-icon icon-river" aria-hidden="true">≈</i><span><strong>River</strong><small>Blue line following hex edges</small></span></div>
                </div>
              </section>

              <section>
                <h3>Features</h3>
                <div className="map-symbol-list compact-symbols">
                  <div><i className="legend-icon icon-forest" aria-hidden="true">▲▲▲</i><span><strong>Forest</strong><small>Three dark trees</small></span></div>
                  <div><i className="legend-icon icon-jungle" aria-hidden="true">●●●</i><span><strong>Jungle</strong><small>Clustered green canopy</small></span></div>
                  <div><i className="legend-icon icon-marsh" aria-hidden="true">〽</i><span><strong>Marsh</strong><small>Dark reeds</small></span></div>
                  <div><i className="legend-icon icon-ice" aria-hidden="true">◆</i><span><strong>Ice</strong><small>Pale angular field</small></span></div>
                  <div><i className="legend-icon icon-fallout" aria-hidden="true">☢</i><span><strong>Fallout</strong><small>Irradiated terrain</small></span></div>
                </div>
              </section>

              <section>
                <h3>Map symbols</h3>
                <div className="map-symbol-list">
                  <div><i className="legend-icon icon-political" aria-hidden="true" /><span><strong>Political territory</strong><small>Civilization color with an ownership border</small></span></div>
                  <div><i className="legend-icon icon-strategy" aria-hidden="true">◇</i><span><strong>Polis strategy graph</strong><small>Safe regions, contested objectives, and intended fronts</small></span></div>
                  <div><i className="legend-icon icon-resource" aria-hidden="true"><b /></i><span><strong>Resource</strong><small>Dark badge with a type-colored center</small></span></div>
                  <div><i className="legend-icon icon-wonder" aria-hidden="true">★</i><span><strong>Natural wonder</strong><small>Gold star</small></span></div>
                  <div><i className="legend-icon icon-major-start" aria-hidden="true">1</i><span><strong>Major start</strong><small>Gold numbered marker</small></span></div>
                  <div><i className="legend-icon icon-city-state" aria-hidden="true">CS</i><span><strong>City-state start</strong><small>Blue CS marker</small></span></div>
                  <div><i className="legend-icon icon-camp" aria-hidden="true">×</i><span><strong>Barbarian camp</strong><small>Red crossed circle</small></span></div>
                  <div><i className="legend-icon icon-ruin" aria-hidden="true">⌂</i><span><strong>Ancient ruin</strong><small>Pale hut</small></span></div>
                  <div><i className="legend-icon icon-road" aria-hidden="true">━</i><span><strong>Abandoned road</strong><small>Broken ochre route</small></span></div>
                  <div><i className="legend-icon icon-city-ruin" aria-hidden="true">▥</i><span><strong>Ruined city</strong><small>Collapsed settlement</small></span></div>
                </div>
              </section>

              {canvasMap.tiles.some((tile) => tile.resource !== 255) && (
                <section>
                  <h3>Resources on this map</h3>
                  <div className="legend-resource-grid">
                    {canvasMap.resources.map((resource, index) => canvasMap.tiles.some((tile) => tile.resource === index) ? (
                      <div key={`${resource}-${index}`}><i style={{ background: resourceColor(resource) }} aria-hidden="true" /><span>{friendlyName(resource, "RESOURCE_")}</span></div>
                    ) : null)}
                  </div>
                </section>
              )}

              <section>
                <h3>Selection and repair</h3>
                <div className="map-symbol-list">
                  <div><i className="legend-icon icon-hover" aria-hidden="true" /><span><strong>Hovered tile</strong><small>Gold outline</small></span></div>
                  <div><i className="legend-icon icon-selection" aria-hidden="true" /><span><strong>Editor selection</strong><small>Cyan fill and outline</small></span></div>
                  <div><i className="legend-icon icon-repair" aria-hidden="true" /><span><strong>Repair finding</strong><small>Orange fill in Difference view</small></span></div>
                  <div><i className="legend-icon icon-focus" aria-hidden="true" /><span><strong>Focused start</strong><small>Cyan ring in balance analysis</small></span></div>
                </div>
              </section>
            </aside>
          )}

          <div className="file-status" role="status">{mode === "LAB" ? labStatus : message}</div>

          {activeTile && hovered ? (
            <div className="tile-card">
              <p className="eyebrow">Tile {hovered.col}, {canvasMap.height - 1 - hovered.row}</p>
              <h3>{friendlyName(canvasMap.terrains[activeTile.terrain], "TERRAIN_")}</h3>
              <div className="tile-details">
                <span>Feature<strong>{friendlyName(canvasMap.features[activeTile.feature], "FEATURE_")}</strong></span>
                <span>Elevation<strong>{["Flat", "Hills", "Mountain"][activeTile.elevation] ?? `Level ${activeTile.elevation}`}</strong></span>
                <span>Resource<strong>{friendlyName(canvasMap.resources[activeTile.resource], "RESOURCE_")}</strong></span>
              </div>
            </div>
          ) : (
            <div className="map-hint">{mode === "CREATE" && createView === "EDIT" ? "Click to edit" : mode === "REPAIR" ? "Review proposed corrections" : mode === "LAB" ? "Judge the unlabeled world" : "Hover for tile data"} <span>·</span> Drag to pan <span>·</span> Scroll to zoom</div>
          )}

          {isDraggingFile && (
            <div className="drop-overlay">
              <div><strong>Drop your Civ5 map</strong><span>It will be rendered entirely in your browser</span></div>
            </div>
          )}
        </div>
      </section>

      {uiTooltip && (
        <div
          className={`ui-tooltip${uiTooltip.above ? " is-above" : ""}`}
          role="tooltip"
          style={{ left: uiTooltip.x, top: uiTooltip.y }}
        >
          {uiTooltip.text}
        </div>
      )}

      {showProjectSaveDialog && (
        <div className="export-confirmation-backdrop project-save-backdrop" onPointerDown={(event) => { if (event.currentTarget === event.target) setShowProjectSaveDialog(false); }}>
          <section className="export-confirmation-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="project-save-title" aria-describedby="project-save-summary">
            <header><span>Durable project download</span><h2 id="project-save-title">Save Excogitare project</h2></header>
            <p id="project-save-summary">The downloaded <code>.excogitare</code> file is the durable copy. Excogitare has no account, cloud save or server project storage.</p>
            <label className="project-name-field"><span>Project name</span><input value={projectName} maxLength={160} autoFocus onChange={(event) => { setProjectName(event.target.value); setProjectDirty(true); }} /></label>
            <fieldset className="project-history-policy"><legend>Generation history</legend>
              <label><input type="radio" name="project-history-policy" checked={projectHistoryPolicy === "FULL"} onChange={() => setProjectHistoryPolicy("FULL")} /><span><strong>Full history</strong><small>Current map, all {generationHistory.length} retained generation{generationHistory.length === 1 ? "" : "s"}, and {checkpoints.length} named checkpoint{checkpoints.length === 1 ? "" : "s"}.</small></span></label>
              <label><input type="radio" name="project-history-policy" checked={projectHistoryPolicy === "CURRENT_AND_CHECKPOINTS"} onChange={() => setProjectHistoryPolicy("CURRENT_AND_CHECKPOINTS")} /><span><strong>Current + checkpoints</strong><small>Smaller bundle containing the current map and named checkpoints, without ordinary generation history.</small></span></label>
            </fieldset>
            <p className="project-integrity-note">The bundle is compressed with DEFLATE. Every payload—including the clean <code>map.civ5map</code> snapshot—is independently protected by SHA-256 before import.</p>
            <div className="export-confirmation-actions"><button type="button" onClick={() => setShowProjectSaveDialog(false)}>Cancel</button><button className="confirm-export" type="button" disabled={!projectName.trim()} onClick={exportProject}>Download project</button></div>
          </section>
        </div>
      )}

      {archetypePreviewMap && archetypePreviewComparison && (
        <div className="export-confirmation-backdrop archetype-preview-backdrop">
          <section className="export-confirmation-modal archetype-preview-modal" role="dialog" aria-modal="true" aria-labelledby="archetype-preview-title" aria-describedby="archetype-preview-summary">
            <header>
              <span>Refine · Difference preview</span>
              <h2 id="archetype-preview-title">Apply {generationArchetype === "EXISTING" ? "the Existing surface" : generationArchetype === "NARRATIVE_DEFAULT" ? "the Narrative Default surface" : ARCHETYPE_PROFILES[generationArchetype].label}?</h2>
            </header>
            <p id="archetype-preview-summary">The candidate changes {archetypePreviewComparison.changedTiles.size.toLocaleString()} tiles: {archetypePreviewCounts.surface.toLocaleString()} surface changes and {archetypePreviewCounts.content.toLocaleString()} resource or wonder changes. Land, water, elevation, rivers, starts, cities and ownership remain fixed.</p>
            {generationArchetypeIntensity === "TRANSFORMATIVE" && <p className="archetype-transformative-warning"><strong>Transformative consequence:</strong> compatible resources and wonders were regenerated against the new ecology. Improvements, routes and scenario ownership were preserved.</p>}
            <div className="archetype-preview-tabs" role="tablist" aria-label="Archetype preview view">
              {(["ORIGINAL", "PREVIEW", "DIFFERENCE"] as const).map((viewOption) => <button key={viewOption} type="button" role="tab" aria-selected={archetypePreviewView === viewOption} className={archetypePreviewView === viewOption ? "is-active" : ""} onClick={() => setArchetypePreviewView(viewOption)}>{viewOption.toLowerCase()}</button>)}
            </div>
            <small className="archetype-preview-help">Original shows the installed map. Preview shows the complete candidate. Difference highlights every changed tile while rendering the candidate underneath.</small>
            <div className="export-confirmation-actions">
              <button ref={archetypePreviewCancelRef} type="button" onClick={cancelArchetypePreview}>Discard preview</button>
              <button className="confirm-export" type="button" onClick={confirmArchetypePreview}>{generationArchetypeIntensity === "TRANSFORMATIVE" ? "Confirm transformative repaint" : "Apply repaint"}</button>
            </div>
          </section>
        </div>
      )}

      {showGameBreakingGeometryConfirmation && (
        <div
          className="export-confirmation-backdrop game-breaking-geometry-backdrop"
          onPointerDown={(event) => { if (event.currentTarget === event.target) setShowGameBreakingGeometryConfirmation(false); }}
        >
          <section className="export-confirmation-modal game-breaking-geometry-modal" role="dialog" aria-modal="true" aria-labelledby="game-breaking-options-title" aria-describedby="game-breaking-options-summary">
            <header>
              <span>Second confirmation</span>
              <h2 id="game-breaking-options-title">Enable game-breaking generation?</h2>
            </header>
            <p id="game-breaking-options-summary">
              Needle, Ribbon, Pin, and String use unreliable aspect ratios. Extreme (180×94 / 16,920 tiles) and Colossal (170×110 / 18,700 tiles) exceed Civ V&apos;s stock Huge dimensions. Any of them may crash the game before the map opens.
            </p>
            <p>WorldBuilder may also reject these files. Enable them only for experiments, and test exports in your own Civ V installation. Randomise will also be permitted to select them.</p>
            <div className="export-confirmation-actions">
              <button ref={gameBreakingGeometryCancelRef} type="button" onClick={() => setShowGameBreakingGeometryConfirmation(false)}>Keep stock limits</button>
              <button className="confirm-export confirm-game-breaking" type="button" onClick={confirmGameBreakingGeometry}>I accept the crash risk</button>
            </div>
          </section>
        </div>
      )}

      {showLuaExperimentalWarning && (
        <div
          className="export-confirmation-backdrop lua-experimental-backdrop"
          onPointerDown={(event) => { if (event.currentTarget === event.target) setShowLuaExperimentalWarning(false); }}
        >
          <section className="export-confirmation-modal lua-experimental-modal" role="dialog" aria-modal="true" aria-labelledby="lua-experimental-title" aria-describedby="lua-experimental-summary">
            <header>
              <span>Experimental workspace</span>
              <h2 id="lua-experimental-title">The Lua workspace is incomplete</h2>
            </header>
            <p id="lua-experimental-summary">
              Lua compatibility is still partial. Many Civ V map scripts depend on engine APIs that Excogitare does not yet reproduce, so generation may fail or produce an incomplete map.
            </p>
            <p>You can inspect compatibility reports, edit scripts, and try supported generators, but do not treat the result as a faithful Civ V execution environment.</p>
            <div className="export-confirmation-actions">
              <button ref={luaExperimentalCancelRef} type="button" onClick={() => setShowLuaExperimentalWarning(false)}>Stay here</button>
              <button className="confirm-export confirm-experimental" type="button" onClick={() => { setShowLuaExperimentalWarning(false); setMode("SCRIPT"); }}>Open experimental Lua</button>
            </div>
          </section>
        </div>
      )}

      {showScenarioExportConfirmation && (
        <div
          className="export-confirmation-backdrop scenario-export-backdrop"
          onPointerDown={(event) => { if (event.currentTarget === event.target) setShowScenarioExportConfirmation(false); }}
        >
          <section className="export-confirmation-modal scenario-export-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-export-title" aria-describedby="scenario-export-summary">
            <header>
              <span>Scenario export boundary</span>
              <h2 id="scenario-export-title">Review this Civ5Map export</h2>
            </header>
            <p id="scenario-export-summary">
              {scenarioExportReport.errors.length || scenarioExportPreflightError
                ? `${scenarioExportReport.errors.length + Number(Boolean(scenarioExportPreflightError))} blocking finding${scenarioExportReport.errors.length + Number(Boolean(scenarioExportPreflightError)) === 1 ? "" : "s"} must be resolved before export.`
                : `The compatible Scenario records are ready to encode with ${scenarioExportReport.warnings.length} warning${scenarioExportReport.warnings.length === 1 ? "" : "s"}.`}
            </p>
            {(scenarioExportPreflightError || scenarioExportReport.errors.length > 0 || scenarioExportReport.warnings.length > 0) && (
              <ul>
                {scenarioExportPreflightError && <li>Binary preflight: {scenarioExportPreflightError}</li>}
                {[...scenarioExportReport.errors, ...scenarioExportReport.warnings].slice(0, 6).map((finding) => <li key={finding.id}>{finding.message}</li>)}
              </ul>
            )}
            <div className="scenario-export-disclosure">
              <strong>Retained only in the Excogitare project</strong>
              <p>Objectives, briefings, Human/AI intent, era, speed, turn, calendar, units, diplomacy and events are not represented as Civ5Map behavior. They will not be silently passed off as game-facing data.</p>
              {scenarioExportReport.projectOnly.length > 0 && <ul>{scenarioExportReport.projectOnly.slice(0, 4).map((finding) => <li key={finding.id}>{finding.message}</li>)}</ul>}
            </div>
            <div className="export-confirmation-actions">
              <button ref={scenarioExportCancelRef} type="button" onClick={() => setShowScenarioExportConfirmation(false)}>Cancel</button>
              <button type="button" onClick={() => { setShowScenarioExportConfirmation(false); sendScenarioToRepair(); }}>Send to Repair</button>
              <button
                className="confirm-export confirm-scenario-export"
                type="button"
                disabled={scenarioExportReport.errors.length > 0 || Boolean(scenarioExportPreflightError)}
                onClick={() => { setShowScenarioExportConfirmation(false); performCiv5MapExport(scenarioPreviewMap); }}
              >
                Export compatible records
              </button>
            </div>
          </section>
        </div>
      )}

      {showExportValidation && (
        <div
          className="export-confirmation-backdrop"
          onPointerDown={(event) => { if (event.currentTarget === event.target) setShowExportValidation(false); }}
        >
          <section className="export-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="export-confirmation-title" aria-describedby="export-confirmation-summary">
            <header>
              <span>Export Civ5Map</span>
              <h2 id="export-confirmation-title">Export despite validation findings?</h2>
            </header>
            <p id="export-confirmation-summary">
              Excogitare found {validationIssues.filter((issue) => issue.severity === "ERROR").length} errors and {validationIssues.filter((issue) => issue.severity === "WARNING").length} warnings. The file may not behave correctly in Civ V.
            </p>
            <ul>{validationIssues.filter((issue) => issue.severity !== "INFO").slice(0, 4).map((issue, index) => <li key={`${issue.category}-${index}`}>{issue.message}</li>)}</ul>
            <div className="export-confirmation-actions">
              <button ref={exportConfirmationCancelRef} type="button" onClick={() => setShowExportValidation(false)}>Cancel</button>
              <button type="button" onClick={() => { setShowExportValidation(false); setMode("CREATE"); setCreateView("ANALYZE"); }}>Open report</button>
              <button className="confirm-export" type="button" disabled={hasBlockingStructureError} title={hasBlockingStructureError ? "A structurally invalid Civ5Map cannot be exported." : "Export after acknowledging the non-structural findings."} onClick={() => { setShowExportValidation(false); performCiv5MapExport(); }}>{hasBlockingStructureError ? "Structural repair required" : "Export anyway"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
