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
import { applyRepairIssues, buildRepairIssues, cloneMap, issueSelectedByProfile, type RepairIssue, type RepairProfile } from "@/lib/map-repair";
import {
  DEFAULT_GENERATION_OPTIONS,
  DOMINANT_TERRAINS,
  MAP_PRESETS,
  MAP_SIZES,
  randomGenerationOptions,
  resolveMapDimensions,
  WORLD_MODIFIERS,
  type MapGenerationOptions,
} from "@/lib/map-generator";
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

const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const ISOMETRIC_RELIEF_MARGIN = 52;
const APP_VERSION = "0.4.8";

type View = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };
type Layers = { political: boolean; grid: boolean; features: boolean; resources: boolean; elevation: boolean; starts: boolean; cityStates: boolean };
type HoveredTile = { tile: Civ5Tile; col: number; row: number } | null;
type ImportedMapSource = { fileName: string; buffer: ArrayBuffer; salvaged?: boolean };
type WorkspaceMode = "VIEW" | "CREATE" | "REPAIR" | "SCRIPT";
type Brush = { terrain: number | null; elevation: number | null; feature: number | null; resource: number | null };
type TileSelection = { minX: number; minY: number; maxX: number; maxY: number };
type TileClipboard = { width: number; height: number; tiles: Civ5Tile[] };
type Projection = "FLAT" | "ISOMETRIC";
type RepairView = "ORIGINAL" | "CORRECTED" | "DIFFERENCE";
type ProjectionTransform = { a: number; b: number; c: number; d: number; e: number; f: number; width: number; height: number };
type GenerationWorkerMessage = { id: number; type: "PROGRESS"; stage: string } | { id: number; type: "COMPLETE"; map: Civ5Map } | { id: number; type: "ERROR"; message: string };

function normalizeGenerationOptions(options: Partial<MapGenerationOptions>): MapGenerationOptions {
  const legacyEngine = String(options.engine ?? "");
  return { ...DEFAULT_GENERATION_OPTIONS, ...options, engine: legacyEngine === "FIELD" ? "EXCOGITARE" : options.engine ?? DEFAULT_GENERATION_OPTIONS.engine, dominantTerrains: [...(options.dominantTerrains ?? DEFAULT_GENERATION_OPTIONS.dominantTerrains)] };
}

function generationEngineStage(engine: MapGenerationOptions["engine"]) {
  if (engine === "REGION_GRAPH") return "Preparing geographic regions";
  if (engine === "PHYSICAL") return "Preparing tectonic simulation";
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
  const [generationOptions, setGenerationOptions] = useState<MapGenerationOptions>(DEFAULT_GENERATION_OPTIONS);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
  const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [createView, setCreateView] = useState<"GENERATE" | "EDIT" | "ANALYZE">("GENERATE");
  const [brush, setBrush] = useState<Brush>({ terrain: 2, elevation: 0, feature: null, resource: null });
  const [editTool, setEditTool] = useState<"TILE" | "FILL" | "SELECT" | "START" | "STRUCTURE">("TILE");
  const [brushSize, setBrushSize] = useState(1);
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [tileClipboard, setTileClipboard] = useState<TileClipboard | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [structureOperation, setStructureOperation] = useState<StructureOperation>("RAISE_PLATE");
  const [structureStrength, setStructureStrength] = useState<1 | 2 | 3>(2);
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
  const [repairBaseline, setRepairBaseline] = useState<Civ5Map | null>(null);
  const [repairIssues, setRepairIssues] = useState<RepairIssue[]>([]);
  const [repairSelected, setRepairSelected] = useState<Set<string>>(new Set());
  const [repairProfile, setRepairProfile] = useState<RepairProfile>("STANDARD");
  const [repairView, setRepairView] = useState<RepairView>("CORRECTED");
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
  const [size, setSize] = useState<Size>({ width: 900, height: 620 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [layers, setLayers] = useState<Layers>({ political: false, grid: true, features: true, resources: true, elevation: true, starts: true, cityStates: true });
  const [showLegend, setShowLegend] = useState(false);
  const [projection, setProjection] = useState<Projection>("FLAT");
  const [hovered, setHovered] = useState<HoveredTile>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [message, setMessage] = useState("Demo map loaded");
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const exportConfirmationCancelRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const luaInputRef = useRef<HTMLInputElement>(null);
  const luaDependencyInputRef = useRef<HTMLInputElement>(null);
  const generationIdRef = useRef(0);
  const generationRequestIdRef = useRef(0);
  const generationWorkerRef = useRef<Worker | null>(null);
  const generationRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const regenerationIdRef = useRef(0);
  const checkpointIdRef = useRef(0);
  const mapRef = useRef(map);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);

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
  }, []);

  const generateMapAsync = useCallback((options: MapGenerationOptions) => new Promise<Civ5Map>((resolve, reject) => {
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
    worker.postMessage({ id, options });
  }), []);

  const regenerateMapAsync = useCallback((source: Civ5Map, options: MapGenerationOptions, stage: RegenerationStage, variation: number) => new Promise<Civ5Map>((resolve, reject) => {
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
    worker.postMessage({ id, kind: "REGENERATE", map: source, options, stage, variation });
  }), []);

  const cancelGeneration = useCallback(() => {
    generationWorkerRef.current?.terminate();
    generationWorkerRef.current = null;
    generationRejectRef.current?.(new DOMException("Generation cancelled", "AbortError"));
    generationRejectRef.current = null;
    setGenerationRunning(false);
    setGenerationStage("");
    setMessage("Map generation cancelled");
  }, []);

  const commitMap = useCallback((next: Civ5Map | ((current: Civ5Map) => Civ5Map)) => {
    const current = mapRef.current;
    const resolved = typeof next === "function" ? next(current) : next;
    if (resolved === current) return;
    mapRef.current = resolved;
    setPastMaps((past) => [...past.slice(-49), current]);
    setFutureMaps([]);
    setMap(resolved);
  }, []);

  const beginRepair = useCallback((target: Civ5Map, diagnostics: string[] = []) => {
    const baseline = cloneMap(target);
    const issues = buildRepairIssues(baseline);
    setRepairBaseline(baseline);
    setRepairIssues(issues);
    setRepairSelected(new Set(issues.filter((issue) => issueSelectedByProfile(issue, "STANDARD")).map((issue) => issue.id)));
    setRepairProfile("STANDARD");
    setRepairView("CORRECTED");
    setRepairDiagnostics(diagnostics);
    setSelection(null);
  }, []);

  const repairPreviewMap = useMemo(() => repairBaseline ? applyRepairIssues(repairBaseline, repairIssues, repairSelected) : map, [repairBaseline, repairIssues, repairSelected, map]);
  const comparisonCheckpoint = useMemo(() => checkpoints.find((checkpoint) => checkpoint.id === comparisonCheckpointId) ?? null, [checkpoints, comparisonCheckpointId]);
  const mapComparison = useMemo(() => comparisonCheckpoint ? compareMaps(map, comparisonCheckpoint.map) : null, [map, comparisonCheckpoint]);
  const canvasMap = mode === "REPAIR" && repairBaseline
    ? repairView === "ORIGINAL" ? repairBaseline : repairPreviewMap
    : mode === "CREATE" && comparisonCheckpoint && comparisonView === "CHECKPOINT" ? comparisonCheckpoint.map : map;
  const repairHighlights = useMemo(() => mode === "REPAIR" && repairView === "DIFFERENCE"
    ? new Set(repairIssues.filter((issue) => repairSelected.has(issue.id) && issue.tileIndex !== undefined).map((issue) => issue.tileIndex!))
    : mode === "CREATE" && comparisonView === "DIFFERENCE" && mapComparison?.dimensionsMatch
      ? mapComparison.changedTiles
      : new Set<number>(), [mode, repairView, repairIssues, repairSelected, comparisonView, mapComparison]);
  const politicalAvailable = hasPoliticalLayer(canvasMap);
  const politicalOwnership = useMemo(() => buildPoliticalOwnership(canvasMap), [canvasMap]);
  const hasScenarioOwnership = canvasMap.tiles.some((tile) => tile.owner !== undefined);

  const undo = () => {
    const previous = pastMaps.at(-1);
    if (!previous) return;
    setFutureMaps((future) => [mapRef.current, ...future].slice(0, 50));
    mapRef.current = previous;
    setMap(previous);
    setPastMaps((past) => past.slice(0, -1));
    if (mode === "REPAIR") beginRepair(previous, repairDiagnostics);
  };

  const redo = () => {
    const next = futureMaps[0];
    if (!next) return;
    setPastMaps((past) => [...past.slice(-49), mapRef.current]);
    mapRef.current = next;
    setMap(next);
    setFutureMaps((future) => future.slice(1));
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
    const paintedTiles = drawMap(renderContext, canvasMap, layers, hovered, view, size, pixelRatio, mapProjection, selection, focusedStart, repairHighlights, politicalOwnership);
    if (canvasMap.tiles.length && paintedTiles === 0) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "copy";
    context.drawImage(renderCanvas, 0, 0);
    context.restore();
  }, [canvasMap, layers, hovered, view, size, mapProjection, selection, focusedStart, repairHighlights, politicalOwnership]);

  const terrainBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tile of map.tiles) {
      const name = friendlyName(map.terrains[tile.terrain], "TERRAIN_");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [map]);

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
    const engineLabel = generationOptions.engine === "REGION_GRAPH" ? "Region-Graph" : generationOptions.engine === "PHYSICAL" ? "Physical" : "Excogitare";
    return `${engineLabel} · ${styleLabel} · ${presetLabel} · ${sizeLabel} ${dimensions.width}×${dimensions.height} · ${generationOptions.players} players`;
  }, [generationOptions]);
  const validationIssues = useMemo(() => validateCiv5Map(map), [map]);
  const balanceReport = useMemo(() => analyzeMultiplayerBalance(map), [map]);

  const majorStartCount = map.startLocations.filter((start) => !start.cityState).length;
  const cityStateCount = map.startLocations.filter((start) => start.cityState).length;
  const visibleLayerCount = Object.entries(layers).filter(([key, enabled]) => enabled
    && (key !== "political" || politicalAvailable)
    && (key !== "starts" || majorStartCount > 0)
    && (key !== "cityStates" || cityStateCount > 0)).length;

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".civ5map")) {
      setMessage("Choose a file ending in .Civ5Map");
      return;
    }
    try {
      setMessage("Reading map…");
      const buffer = await file.arrayBuffer();
      if (mode === "REPAIR") {
        const parsed = parseCiv5MapForRepair(buffer, file.name);
        replaceMap(parsed.map, { fileName: file.name, buffer, salvaged: parsed.salvaged });
        beginRepair(parsed.map, parsed.diagnostics);
        setMessage(parsed.salvaged ? `${file.name} · damaged data recovered for repair` : `${file.name} · repair tests complete`);
      } else {
        const parsed = parseCiv5Map(buffer, file.name);
        replaceMap(parsed, { fileName: file.name, buffer });
        setMessage(`${file.name} · rendered locally`);
      }
      setShowEditPrompt(false);
      setIsEditingMetadata(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That map could not be read.");
    }
  }, [beginRepair, mode, replaceMap]);

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

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
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

  const exportView = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.round(size.width * pixelRatio);
    exportCanvas.height = Math.round(size.height * pixelRatio);
    const context = exportCanvas.getContext("2d", { alpha: true });
    if (!context) return;
    drawMap(context, canvasMap, layers, hovered, view, size, pixelRatio, mapProjection, selection, focusedStart, repairHighlights, politicalOwnership, true);
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
    if (validationIssues.some((issue) => issue.severity !== "INFO")) {
      setShowExportValidation(true);
      return;
    }
    performCiv5MapExport();
  };

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
    const appliedCount = repairIssues.filter((issue) => repairSelected.has(issue.id) && issue.mutation).length;
    commitMap(repaired);
    beginRepair(repaired, repairDiagnostics);
    setMessage(`${appliedCount} automated repairs applied · undo available`);
  };

  const enterRepairMode = () => {
    setMode("REPAIR");
    beginRepair(mapRef.current);
    setMessage("Repair tests complete · review the proposed corrections");
  };

  const selectWorkspaceMode = (nextMode: WorkspaceMode) => {
    setShowLegend(false);
    if (nextMode === "REPAIR") enterRepairMode();
    else setMode(nextMode);
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

  const generateNewMap = async () => {
    setShowLegend(false);
    try {
      const generated = await generateMapAsync(generationOptions);
      replaceMap(generated);
      const id = ++generationIdRef.current;
      setGenerationHistory((history) => addGenerationToHistory(history, generated, id));
      setActiveGenerationId(id);
      setMode("CREATE");
      setMessage(`${generated.name} · generated from seed ${generationOptions.seed}`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Map generation failed.");
    }
  };

  const randomiseWorld = async () => {
    setShowLegend(false);
    const options = randomGenerationOptions();
    setGenerationOptions(options);
    try {
      const generated = await generateMapAsync(options);
      replaceMap(generated);
      const id = ++generationIdRef.current;
      setGenerationHistory((history) => addGenerationToHistory(history, generated, id));
      setActiveGenerationId(id);
      setCreateView("GENERATE");
      setMessage(`${generated.name} · every generation option randomised`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Random generation failed.");
    }
  };

  const openGeneration = (entry: GenerationHistoryEntry) => {
    setShowLegend(false);
    const restored = restoreGeneration(entry);
    replaceMap(restored);
    setActiveGenerationId(entry.id);
    if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation));
    setMode("CREATE");
    setCreateView("GENERATE");
    setMessage(`${restored.name} · restored from generation history`);
  };

  const randomizeSeed = () => {
    const seed = Math.random().toString(36).slice(2, 10);
    setGenerationOptions((current) => ({ ...current, seed }));
  };

  const runSelectivePass = async (stage: RegenerationStage) => {
    const variation = ++regenerationIdRef.current;
    try {
      const regenerated = await regenerateMapAsync(map, generationOptions, stage, variation);
      replaceMap(regenerated);
      if (regenerated.generation) setGenerationOptions(normalizeGenerationOptions(regenerated.generation));
      const id = ++generationIdRef.current;
      setGenerationHistory((history) => addGenerationToHistory(history, regenerated, id));
      setActiveGenerationId(id);
      setComparisonCheckpointId(null);
      setComparisonView("CURRENT");
      const labels: Record<RegenerationStage, string> = { WORLD: "world", CLIMATE: "climate and biomes", RIVERS: "river network", CONTENT: "resources and sites", STARTS: "players and starts" };
      setMessage(`${labels[stage]} regenerated · other compatible layers retained`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Selective regeneration failed.");
    }
  };

  const generateBatch = async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    setBatchCandidates([]);
    setBatchProgress(0);
    const candidates: BatchCandidate[] = [];
    try {
      for (let index = 0; index < batchCount; index += 1) {
        const seed = `${generationOptions.seed}-${String(index + 1).padStart(2, "0")}`;
        const generated = await generateMapAsync({ ...generationOptions, seed });
        candidates.push(scoreBatchCandidate(generated, seed, index + 1));
        candidates.sort((one, two) => two.score - one.score || one.balance.spread - two.balance.spread);
        setBatchCandidates([...candidates]);
        setBatchProgress(index + 1);
      }
      setMessage(`${batchCount} candidates generated and ranked · best score ${candidates[0]?.score ?? 0}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage(`Batch stopped after ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}.`);
      else setMessage(error instanceof Error ? error.message : "Batch generation failed.");
    } finally {
      setBatchRunning(false);
    }
  };

  const openBatchCandidate = (candidate: BatchCandidate) => {
    const restored = cloneMap(candidate.map);
    replaceMap(restored);
    if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation));
    const id = ++generationIdRef.current;
    setGenerationHistory((history) => addGenerationToHistory(history, restored, id));
    setActiveGenerationId(id);
    setMessage(`${candidate.seed} · selected from batch with score ${candidate.score}`);
  };

  const saveCheckpoint = () => {
    const id = ++checkpointIdRef.current;
    const checkpoint = createMapCheckpoint(map, checkpointName, id);
    setCheckpoints((current) => [checkpoint, ...current].slice(0, 30));
    setCheckpointName("");
    setMessage(`${checkpoint.name} · checkpoint saved`);
  };

  const restoreCheckpoint = (checkpoint: MapCheckpoint) => {
    const restored = restoreMapCheckpoint(checkpoint);
    replaceMap(restored);
    if (restored.generation) setGenerationOptions(normalizeGenerationOptions(restored.generation));
    setComparisonCheckpointId(null);
    setComparisonView("CURRENT");
    setMessage(`${checkpoint.name} · checkpoint restored`);
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
        setGenerationOptions(result.map.generation ? normalizeGenerationOptions(result.map.generation) : generationOptions);
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

  const activeTile = hovered?.tile;
  return (
    <main className="viewer-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div>
            <h1>Excogitare</h1>
          </div>
        </div>
        <nav className="mode-tabs" aria-label="Workspace mode">
          {(["VIEW", "CREATE", "REPAIR", "SCRIPT"] as const).map((item) => (
            <button key={item} type="button" className={mode === item ? "is-active" : ""} onClick={() => selectWorkspaceMode(item)}>
              {item === "VIEW" ? "Explore" : item === "CREATE" ? "Create" : item === "REPAIR" ? "Repair" : "Lua"}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <div className="history-actions" aria-label="Edit history">
            <button type="button" onClick={undo} disabled={!pastMaps.length} title="Undo" aria-label="Undo">↶</button>
            <button type="button" onClick={redo} disabled={!futureMaps.length} title="Redo" aria-label="Redo">↷</button>
          </div>
          <button className="button button-secondary button-export-view" type="button" onClick={exportView}>Export view</button>
          {mode === "SCRIPT" && <button className="button button-secondary button-export-script" type="button" onClick={exportLua}>Export Lua</button>}
          {mode === "SCRIPT" && <button className="button button-secondary button-export-script" type="button" onClick={exportModInfo}>Export .modinfo</button>}
          <button
            className="button button-secondary button-export-map"
            type="button"
            onClick={exportCiv5Map}
            disabled={isEditingMetadata}
            title={isEditingMetadata ? "Save your edits before exporting" : "Export the current Civ5Map file"}
          >
            Export Civ5Map
          </button>
          <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}>Open map</button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".civ5map,.Civ5Map,application/octet-stream" onChange={onFileChange} />
          <input ref={luaInputRef} className="visually-hidden" type="file" accept=".lua,text/x-lua,text/plain" onChange={onLuaFileChange} />
          <input ref={luaDependencyInputRef} className="visually-hidden" type="file" multiple accept=".lua,text/x-lua,text/plain" onChange={onLuaDependencyChange} />
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Map information and layers">
          {mode === "CREATE" && (
            <button className="randomise-world-button" type="button" disabled={generationRunning} onClick={() => void randomiseWorld()}>
              <span>Randomise</span><small>{generationRunning ? generationStage : "New map from every option"}</small>
            </button>
          )}
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

          {mode === "REPAIR" && repairBaseline && (
            <div className="repair-panel">
              <div className="section-title"><h3>Automated repair</h3><span>{repairIssues.filter((issue) => issue.severity !== "INFO").length} findings</span></div>
              <p className="repair-intro">Checks file structure, legal terrain content, complete mountain-to-ocean-or-lake river drainage, scenario records, and start locations before export.</p>

              <div className="repair-profile" role="group" aria-label="Repair profile">
                {(["SAFE", "STANDARD", "COMPETITIVE"] as const).map((profile) => (
                  <button key={profile} type="button" className={repairProfile === profile ? "is-active" : ""} onClick={() => selectRepairProfile(profile)}>{profile.toLowerCase()}</button>
                ))}
              </div>
              <small className="repair-profile-note">{repairProfile === "SAFE" ? "Only certain structural and scenario corrections." : repairProfile === "STANDARD" ? "Safe fixes plus guaranteed resource cleanup and complete river-network rebuilding." : "All automated fixes plus competitive start-location review."}</small>

              <div className="repair-view-tabs" role="tablist" aria-label="Repair comparison view">
                {(["ORIGINAL", "CORRECTED", "DIFFERENCE"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={repairView === item} className={repairView === item ? "is-active" : ""} onClick={() => setRepairView(item)}>{item.toLowerCase()}</button>)}
              </div>
              <p className="repair-preview-note"><strong>Corrected is a live preview.</strong> Apply selected to commit the checked fixes, or export the repaired preview directly.</p>

              {repairDiagnostics.length > 0 && (
                <details className="repair-diagnostics">
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
            </div>
          )}

          {mode === "CREATE" && (
            <div className="creator-panel">
              <div className="create-mode-tabs" role="tablist" aria-label="Create tools">
                <button type="button" role="tab" aria-selected={createView === "GENERATE"} className={createView === "GENERATE" ? "is-active" : ""} onClick={() => setCreateView("GENERATE")}>Generate</button>
                <button type="button" role="tab" aria-selected={createView === "EDIT"} className={createView === "EDIT" ? "is-active" : ""} onClick={() => setCreateView("EDIT")}>Edit</button>
                <button type="button" role="tab" aria-selected={createView === "ANALYZE"} className={createView === "ANALYZE" ? "is-active" : ""} onClick={() => setCreateView("ANALYZE")}>Analyze</button>
              </div>

              {createView === "GENERATE" ? (
                <>
                  <div className="creator-advanced-title"><span>After generation</span><small>Revisit, compare, and refine completed worlds</small></div>
                  <details className="generation-history">
                    <summary><span>Generation history</span><small>{generationHistory.length} / {MAX_GENERATION_HISTORY} saved</small></summary>
                    <div className="generation-history-body">
                      {generationHistory.length ? (
                        <div className="generation-history-list">
                          {generationHistory.map((entry) => {
                            const options = entry.map.generation;
                            const preset = options ? MAP_PRESETS.find((item) => item.id === options.preset)?.label ?? options.preset : "Generated map";
                            return (
                              <button key={entry.id} type="button" className={activeGenerationId === entry.id ? "is-active" : ""} onClick={() => openGeneration(entry)}>
                                <span><strong>Generation {entry.id}</strong><small>{options ? `${options.style.toLowerCase()} · ${preset}` : preset}</small></span>
                                <span><em>{entry.map.width} × {entry.map.height}</em><code>{options?.seed ?? "unknown seed"}</code></span>
                              </button>
                            );
                          })}
                        </div>
                      ) : <p>Generated maps will appear here. The newest 30 remain available for this session.</p>}
                    </div>
                  </details>
                  <details className="creator-group iteration-group">
                    <summary><span>Selective regeneration</span><small>rerun one design pass</small></summary>
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
                    <summary><span>Candidate batch</span><small>{batchRunning ? `${batchProgress} / ${batchCount}` : batchCandidates.length ? `${batchCandidates.length} ranked` : "compare seeds"}</small></summary>
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
                    <summary><span>Named checkpoints</span><small>{checkpoints.length ? `${checkpoints.length} saved` : "compare revisions"}</small></summary>
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
                          {checkpoints.map((checkpoint) => <div key={checkpoint.id}><span><strong>{checkpoint.name}</strong><small>{checkpoint.map.width}×{checkpoint.map.height} · {new Date(checkpoint.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span><div><button type="button" onClick={() => compareCheckpoint(checkpoint)}>Compare</button><button type="button" onClick={() => restoreCheckpoint(checkpoint)}>Restore</button><button type="button" aria-label={`Delete ${checkpoint.name}`} onClick={() => { setCheckpoints((current) => current.filter((item) => item.id !== checkpoint.id)); if (comparisonCheckpointId === checkpoint.id) setComparisonCheckpointId(null); }}>×</button></div></div>)}
                        </div>
                      ) : <p className="iteration-note">Save a deliberate revision before a risky generation pass or structural edit.</p>}
                    </div>
                  </details>
                  <div className="world-building-steps">
                  <div className="world-builder-intro">
                    <span>Build order</span>
                    <ol><li>Concept</li><li>Shape</li><li>Climate</li><li>Life</li><li>Players</li></ol>
                    <p>Begin with the kind of world you want. The later sections refine it without asking you to think like the generator.</p>
                  </div>
                  <div className="section-title"><h3>World concept</h3><span>step 1</span></div>
                  <fieldset className="world-model-picker">
                    <legend>Generation engine</legend>
                    <button type="button" className={generationOptions.engine === "EXCOGITARE" ? "is-active" : ""} onClick={() => setGenerationOptions((current) => {
                      const preset = MAP_PRESETS.find((item) => item.id === "WILD_REGIONS")!;
                      return current.engine === "EXCOGITARE" ? current : { ...current, engine: "EXCOGITARE", preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains };
                    })}><strong>Excogitare</strong><small>The native expressive engine: warped fields, dramatic landforms, and the broadest stylistic range.</small></button>
                    <button type="button" className={generationOptions.engine === "REGION_GRAPH" ? "is-active" : ""} onClick={() => setGenerationOptions((current) => {
                      const preset = MAP_PRESETS.find((item) => item.id === "LIVING_WORLD")!;
                      return current.engine === "REGION_GRAPH" ? current : { ...current, engine: "REGION_GRAPH", preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, climateRealism: preset.climateRealism ?? current.climateRealism };
                    })}><strong>Region-Graph</strong><small>The Fantastical-inspired hierarchy: subregions, polygons, realms, ranges, basins, and watersheds.</small></button>
                    <button type="button" className={generationOptions.engine === "PHYSICAL" ? "is-active" : ""} onClick={() => setGenerationOptions((current) => {
                      const preset = MAP_PRESETS.find((item) => item.id === "DYNAMIC_EARTH")!;
                      return current.engine === "PHYSICAL" ? current : { ...current, engine: "PHYSICAL", preset: preset.id, waterPercent: preset.water, mountainPercent: preset.mountains, climateRealism: true, plateActivity: preset.plateActivity ?? current.plateActivity, erosionStrength: preset.erosionStrength ?? current.erosionStrength, worldAge: preset.worldAge ?? current.worldAge };
                    })}><strong>Physical</strong><small>Moving tectonic plates, convergence and rifting, erosion, altitude, atmospheric moisture, and rain shadows.</small></button>
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
                        className={generationOptions.style === value ? "is-active" : ""}
                        onClick={() => setGenerationOptions((current) => value === "BRUTAL"
                          ? { ...current, style: value, balance: "TOURNAMENT", startQuality: "BALANCED", mountainPercent: Math.max(18, current.mountainPercent) }
                          : { ...current, style: value })}
                      >
                        <strong>{label}</strong><small>{note}</small>
                      </button>
                    ))}
                  </fieldset>
                  <label className="control-field">
                    <span>Map type</span>
                    <select value={generationOptions.preset} onChange={(event) => {
                      const preset = MAP_PRESETS.find((item) => item.id === event.target.value);
                      if (!preset) return;
                      setGenerationOptions((current) => ({ ...current, engine: preset.engine, preset: preset.id, waterPercent: preset.water, mountainPercent: current.style === "BRUTAL" ? Math.max(18, preset.mountains) : preset.mountains, climateRealism: preset.climateRealism ?? current.climateRealism, plateActivity: preset.plateActivity ?? current.plateActivity, erosionStrength: preset.erosionStrength ?? current.erosionStrength, worldAge: preset.worldAge ?? current.worldAge }));
                    }}>
                      <optgroup label="Excogitare worlds">{MAP_PRESETS.filter((preset) => preset.engine === "EXCOGITARE").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                      <optgroup label="Region-Graph worlds">{MAP_PRESETS.filter((preset) => preset.engine === "REGION_GRAPH").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                      <optgroup label="Physical worlds">{MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL").map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                    </select>
                    <small>{MAP_PRESETS.find((preset) => preset.id === generationOptions.preset)?.description}</small>
                  </label>
                  <label className="control-field">
                    <span>Map size</span>
                    <select value={generationOptions.size} onChange={(event) => {
                      const nextSize = event.target.value as MapGenerationOptions["size"];
                      const next = MAP_SIZES.find((item) => item.id === nextSize);
                      setGenerationOptions((current) => ({ ...current, size: nextSize, players: next?.recommendedPlayers ?? current.players, cityStates: next?.recommendedCityStates ?? current.cityStates }));
                    }}>
                      {MAP_SIZES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}</option>)}
                    </select>
                  </label>
                  <div className="seed-row">
                    <label className="control-field"><span>Seed</span><input value={generationOptions.seed} maxLength={80} onChange={(event) => setGenerationOptions((current) => ({ ...current, seed: event.target.value }))} /></label>
                    <button type="button" onClick={randomizeSeed}>Shuffle</button>
                  </div>
                  <div className="generation-summary"><span>Configuration</span><strong>{generationSummary}</strong></div>
                  {map.structure && (
                    <details className="world-structure-report">
                      <summary><span>World structure</span><small>{map.structure.engine.replaceAll("_", " ").toLowerCase()} · retained for editing</small></summary>
                      <div>
                        <dl>{Object.entries(map.structure.diagnostics).map(([label, value]) => <div key={label}><dt>{label.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>
                        <p>{map.structure.objects.length} geographic objects, {map.structure.mountainRanges.length} mountain ranges, and {map.structure.riverSystems.length} river systems remain attached to this generation.</p>
                        <small>{map.structure.objects.slice(0, 8).map((object) => object.name).join(" · ")}{map.structure.objects.length > 8 ? " · …" : ""}</small>
                      </div>
                    </details>
                  )}

                  <details className="creator-group" open>
                    <summary><span>2 · World shape</span><small>{generationOptions.waterPercent}% water · {generationOptions.mountainPercent}% mountains</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, modifier: DEFAULT_GENERATION_OPTIONS.modifier, wrapType: DEFAULT_GENERATION_OPTIONS.wrapType, geometry: DEFAULT_GENERATION_OPTIONS.geometry, waterPercent: DEFAULT_GENERATION_OPTIONS.waterPercent, mountainPercent: current.style === "BRUTAL" ? 18 : DEFAULT_GENERATION_OPTIONS.mountainPercent, worldAge: DEFAULT_GENERATION_OPTIONS.worldAge, granularity: DEFAULT_GENERATION_OPTIONS.granularity, oceanBasins: DEFAULT_GENERATION_OPTIONS.oceanBasins, landAtPoles: DEFAULT_GENERATION_OPTIONS.landAtPoles, coastalRangePercent: DEFAULT_GENERATION_OPTIONS.coastalRangePercent, riverDensity: DEFAULT_GENERATION_OPTIONS.riverDensity, plateActivity: DEFAULT_GENERATION_OPTIONS.plateActivity, erosionStrength: DEFAULT_GENERATION_OPTIONS.erosionStrength }))}>Reset world shape</button>
                      <label className="control-field">
                        <span>World modifier</span>
                        <select value={generationOptions.modifier === "FANTASTICAL" ? "NONE" : generationOptions.modifier} onChange={(event) => {
                          const modifier = event.target.value as MapGenerationOptions["modifier"];
                          setGenerationOptions((current) => ({ ...current, modifier, mountainPercent: modifier === "STRATEGIC_DEPTH" ? Math.max(22, current.mountainPercent) : modifier === "DOOMSDAY" ? Math.max(18, current.mountainPercent) : current.mountainPercent }));
                        }}>
                          {WORLD_MODIFIERS.map((modifier) => <option key={modifier.id} value={modifier.id}>{modifier.label}</option>)}
                        </select>
                        <small>{WORLD_MODIFIERS.find((modifier) => modifier.id === (generationOptions.modifier === "FANTASTICAL" ? "NONE" : generationOptions.modifier))?.description}</small>
                      </label>
                      <label className="control-field">
                        <span>Wrap type</span>
                        <select value={generationOptions.wrapType ?? "PRESET"} onChange={(event) => setGenerationOptions((current) => ({ ...current, wrapType: event.target.value as MapGenerationOptions["wrapType"] }))}>
                          <option value="PRESET">Map type default</option>
                          <option value="EAST_WEST">East / west</option>
                          <option value="NONE">No wrapping</option>
                        </select>
                      </label>
                      <label className="control-field">
                        <span>Geometry</span>
                        <select value={generationOptions.geometry} onChange={(event) => setGenerationOptions((current) => ({ ...current, geometry: event.target.value as MapGenerationOptions["geometry"] }))}>
                          <option value="STANDARD">Standard proportions</option>
                          <option value="TALL">Very tall and narrow</option>
                          <option value="WIDE">Very thin and wide</option>
                          <option value="NEEDLE">Needle — extreme vertical</option>
                          <option value="RIBBON">Ribbon — extreme horizontal</option>
                          <option value="PIN">Pin — ultra-extreme vertical</option>
                          <option value="STRING">String — ultra-extreme horizontal</option>
                          <option value="SQUARE">Perfectly square</option>
                        </select>
                        <small>{(() => { const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry); return `${dimensions.width} × ${dimensions.height} tiles`; })()}</small>
                      </label>
                      <div className="percentage-controls">
                        <label className="control-field percentage-field"><span>Water percent <output>{generationOptions.waterPercent}%</output></span><input type="range" min="0" max="90" step="1" value={generationOptions.waterPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, waterPercent: Number(event.target.value) }))} /></label>
                        <label className="control-field percentage-field"><span>Mountain percent <output>{generationOptions.mountainPercent}%</output></span><input type="range" min={generationOptions.modifier === "STRATEGIC_DEPTH" ? 22 : generationOptions.modifier === "DOOMSDAY" || generationOptions.style === "BRUTAL" ? 18 : 0} max="38" step="1" value={generationOptions.mountainPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, mountainPercent: Number(event.target.value) }))} /></label>
                      </div>
                      <label className="control-field"><span>World age</span><select value={generationOptions.worldAge} onChange={(event) => setGenerationOptions((current) => ({ ...current, worldAge: event.target.value as MapGenerationOptions["worldAge"] }))}><option value="YOUNG">Young</option><option value="NORMAL">Normal</option><option value="OLD">Old</option></select></label>
                      {generationOptions.engine === "REGION_GRAPH" && (
                        <div className="region-architecture-controls">
                          <div className="control-grid">
                            <label className="control-field"><span>Geographic granularity</span><select value={generationOptions.granularity} onChange={(event) => setGenerationOptions((current) => ({ ...current, granularity: event.target.value as MapGenerationOptions["granularity"] }))}><option value="LOW">Low · vast forms</option><option value="FAIR">Fair · continental</option><option value="HIGH">High · intricate</option><option value="VERY_HIGH">Very high · fractured</option></select></label>
                            <label className="control-field"><span>Ocean basins</span><input type="number" min="1" max="5" value={generationOptions.oceanBasins} onChange={(event) => setGenerationOptions((current) => ({ ...current, oceanBasins: Math.max(1, Math.min(5, Number(event.target.value))) }))} /></label>
                          </div>
                          <label className="check-row"><input type="checkbox" checked={generationOptions.landAtPoles} onChange={(event) => setGenerationOptions((current) => ({ ...current, landAtPoles: event.target.checked }))} /><span>Permit continents and islands at the poles</span></label>
                          <label className="control-field percentage-field"><span>Coastal mountain ranges <output>{generationOptions.coastalRangePercent}%</output></span><input type="range" min="0" max="100" value={generationOptions.coastalRangePercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, coastalRangePercent: Number(event.target.value) }))} /></label>
                          <label className="control-field"><span>River network</span><select value={generationOptions.riverDensity} onChange={(event) => setGenerationOptions((current) => ({ ...current, riverDensity: event.target.value as MapGenerationOptions["riverDensity"] }))}><option value="SPARSE">Sparse · major systems</option><option value="NORMAL">Normal · rivers and tributaries</option><option value="DENSE">Dense · wet watersheds</option></select></label>
                          <small>Designed regions create the broad geography first. Climate, mountain boundaries, and drainage are then resolved across that structure.</small>
                        </div>
                      )}
                      {generationOptions.engine === "PHYSICAL" && (
                        <div className="region-architecture-controls physical-architecture-controls">
                          <div className="control-grid">
                            <label className="control-field"><span>Plate activity</span><select value={generationOptions.plateActivity} onChange={(event) => setGenerationOptions((current) => ({ ...current, plateActivity: event.target.value as MapGenerationOptions["plateActivity"] }))}><option value="QUIET">Quiet · subdued boundaries</option><option value="NORMAL">Normal · mixed tectonics</option><option value="VIOLENT">Violent · collision belts</option></select></label>
                            <label className="control-field"><span>Erosion</span><select value={generationOptions.erosionStrength} onChange={(event) => setGenerationOptions((current) => ({ ...current, erosionStrength: event.target.value as MapGenerationOptions["erosionStrength"] }))}><option value="LIGHT">Light · young relief</option><option value="MODERATE">Moderate · mature terrain</option><option value="STRONG">Strong · ancient terrain</option></select></label>
                          </div>
                          <label className="control-field"><span>River network</span><select value={generationOptions.riverDensity} onChange={(event) => setGenerationOptions((current) => ({ ...current, riverDensity: event.target.value as MapGenerationOptions["riverDensity"] }))}><option value="SPARSE">Sparse · major systems</option><option value="NORMAL">Normal · rivers and tributaries</option><option value="DENSE">Dense · wet watersheds</option></select></label>
                          <small>Physical worlds retain plate ownership and motion, convergent and divergent boundaries, erosion, continental and ocean-basin objects, altitude cooling, and eastward atmospheric moisture.</small>
                        </div>
                      )}
                    </div>
                  </details>

                  <details className="creator-group content-group">
                    <summary><span>4 · Resources and wonders</span><small>{generationOptions.wonderCount} wonders · {generationOptions.strategicAbundance.toLowerCase()} strategics</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, bonusAbundance: DEFAULT_GENERATION_OPTIONS.bonusAbundance, luxuryAbundance: DEFAULT_GENERATION_OPTIONS.luxuryAbundance, luxuryRegional: DEFAULT_GENERATION_OPTIONS.luxuryRegional, luxuryStartGuarantee: DEFAULT_GENERATION_OPTIONS.luxuryStartGuarantee, strategicAbundance: DEFAULT_GENERATION_OPTIONS.strategicAbundance, strategicDistribution: DEFAULT_GENERATION_OPTIONS.strategicDistribution, strategicStartGuarantee: DEFAULT_GENERATION_OPTIONS.strategicStartGuarantee, offshoreOilPercent: DEFAULT_GENERATION_OPTIONS.offshoreOilPercent, wonderCount: DEFAULT_GENERATION_OPTIONS.wonderCount, wonderMinSpacing: DEFAULT_GENERATION_OPTIONS.wonderMinSpacing, wonderStartBuffer: DEFAULT_GENERATION_OPTIONS.wonderStartBuffer, barbarianAbundance: DEFAULT_GENERATION_OPTIONS.barbarianAbundance, barbarianStartDistance: DEFAULT_GENERATION_OPTIONS.barbarianStartDistance, ruinAbundance: DEFAULT_GENERATION_OPTIONS.ruinAbundance, ruinStartDistance: DEFAULT_GENERATION_OPTIONS.ruinStartDistance }))}>Reset content</button>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Bonus resources</span><select value={generationOptions.bonusAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, bonusAbundance: event.target.value as MapGenerationOptions["bonusAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                        <label className="control-field"><span>Luxuries</span><select value={generationOptions.luxuryAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryAbundance: event.target.value as MapGenerationOptions["luxuryAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                        <label className="control-field"><span>Strategics</span><select value={generationOptions.strategicAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicAbundance: event.target.value as MapGenerationOptions["strategicAbundance"] }))}><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="ABUNDANT">Abundant</option></select></label>
                      </div>
                      <label className="control-field"><span>Strategic distribution</span><select value={generationOptions.strategicDistribution} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicDistribution: event.target.value as MapGenerationOptions["strategicDistribution"] }))}><option value="EVEN">Even</option><option value="REGIONAL">Regional types</option><option value="CLUSTERED">Clustered deposits</option></select></label>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.strategicStartGuarantee} onChange={(event) => setGenerationOptions((current) => ({ ...current, strategicStartGuarantee: event.target.checked }))} /><span>Guarantee iron and horses near every major start</span></label>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.luxuryStartGuarantee} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryStartGuarantee: event.target.checked }))} /><span>Guarantee a luxury near every major start</span></label>
                      <label className="check-row"><input type="checkbox" checked={generationOptions.luxuryRegional} onChange={(event) => setGenerationOptions((current) => ({ ...current, luxuryRegional: event.target.checked }))} /><span>Create regional luxury monopolies</span></label>
                      <label className="control-field percentage-field"><span>Offshore oil <output>{generationOptions.offshoreOilPercent}%</output></span><input type="range" min="0" max="70" value={generationOptions.offshoreOilPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, offshoreOilPercent: Number(event.target.value) }))} /></label>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Natural wonders</span><input type="number" min="0" max="12" value={generationOptions.wonderCount} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderCount: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Wonder spacing</span><input type="number" min="3" max="20" value={generationOptions.wonderMinSpacing} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderMinSpacing: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Start buffer</span><input type="number" min="0" max="15" value={generationOptions.wonderStartBuffer} onChange={(event) => setGenerationOptions((current) => ({ ...current, wonderStartBuffer: Number(event.target.value) }))} /></label>
                      </div>
                      <div className="control-grid">
                        <label className="control-field"><span>Barbarians</span><select value={generationOptions.barbarianAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, barbarianAbundance: event.target.value as MapGenerationOptions["barbarianAbundance"] }))}><option value="NONE">None</option><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="RAGING">Raging</option></select></label>
                        <label className="control-field"><span>Camp start distance</span><input type="number" min="2" max="15" value={generationOptions.barbarianStartDistance} onChange={(event) => setGenerationOptions((current) => ({ ...current, barbarianStartDistance: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Ancient ruins</span><select value={generationOptions.ruinAbundance} onChange={(event) => setGenerationOptions((current) => ({ ...current, ruinAbundance: event.target.value as MapGenerationOptions["ruinAbundance"] }))}><option value="NONE">None</option><option value="SCARCE">Scarce</option><option value="STANDARD">Standard</option><option value="RAGING">Abundant</option></select></label>
                        <label className="control-field"><span>Ruin start distance</span><input type="number" min="1" max="12" value={generationOptions.ruinStartDistance} onChange={(event) => setGenerationOptions((current) => ({ ...current, ruinStartDistance: Number(event.target.value) }))} /></label>
                      </div>
                      <small className="content-note">Camps, ruins, ruined cities, and roads are scenario content. Excogitare previews and analyzes them; geography-only export reports that they cannot yet be embedded.</small>
                    </div>
                  </details>

                  <details className="creator-group climate-group">
                    <summary><span>3 · Climate and terrain</span><small>{generationOptions.climate.toLowerCase()} · {generationOptions.rainfall.toLowerCase()}</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, climate: DEFAULT_GENERATION_OPTIONS.climate, rainfall: DEFAULT_GENERATION_OPTIONS.rainfall, dominantTerrains: [], climateRealism: DEFAULT_GENERATION_OPTIONS.climateRealism, regionContrast: DEFAULT_GENERATION_OPTIONS.regionContrast }))}>Reset climate</button>
                      <div className="control-grid">
                        <label className="control-field"><span>Climate</span><select value={generationOptions.climate} onChange={(event) => setGenerationOptions((current) => ({ ...current, climate: event.target.value as MapGenerationOptions["climate"] }))}><option value="COOL">Cool</option><option value="TEMPERATE">Temperate</option><option value="HOT">Hot</option></select></label>
                        <label className="control-field"><span>Rainfall</span><select value={generationOptions.rainfall} onChange={(event) => setGenerationOptions((current) => ({ ...current, rainfall: event.target.value as MapGenerationOptions["rainfall"] }))}><option value="ARID">Arid</option><option value="NORMAL">Normal</option><option value="WET">Wet</option></select></label>
                      </div>
                      {generationOptions.engine === "REGION_GRAPH" && (
                        <div className="control-grid">
                          <label className="control-field"><span>Climate logic</span><select value={generationOptions.climateRealism ? "LATITUDE" : "MYTHIC"} onChange={(event) => setGenerationOptions((current) => ({ ...current, climateRealism: event.target.value === "LATITUDE" }))}><option value="MYTHIC">Free regional climates</option><option value="LATITUDE">Latitude-informed climates</option></select></label>
                          <label className="control-field"><span>Region contrast</span><select value={generationOptions.regionContrast} onChange={(event) => setGenerationOptions((current) => ({ ...current, regionContrast: event.target.value as MapGenerationOptions["regionContrast"] }))}><option value="BLENDED">Blended borders</option><option value="VARIED">Varied provinces</option><option value="EXTREME">Extreme realms</option></select></label>
                        </div>
                      )}
                      {generationOptions.engine === "PHYSICAL" && <small className="content-note">Physical climate is always coupled to latitude, altitude, ocean moisture, terrain uplift, and west-to-east rain shadows. The climate and rainfall controls shift that simulation rather than replacing it.</small>}
                      <fieldset className="terrain-dominance-picker">
                        <legend>Dominant terrain</legend>
                        <small>Select one or more. With none selected, climate determines the mix.</small>
                        <div>
                          {DOMINANT_TERRAINS.map((terrain) => {
                            const selected = (generationOptions.dominantTerrains ?? []).includes(terrain.id);
                            return <button key={terrain.id} type="button" className={selected ? "is-active" : ""} aria-pressed={selected} onClick={() => setGenerationOptions((current) => ({ ...current, dominantTerrains: (current.dominantTerrains ?? []).includes(terrain.id) ? (current.dominantTerrains ?? []).filter((item) => item !== terrain.id) : [...(current.dominantTerrains ?? []), terrain.id] }))}>{terrain.label}</button>;
                          })}
                        </div>
                      </fieldset>
                    </div>
                  </details>

                  <details className="creator-group players-group">
                    <summary><span>5 · Players and starts</span><small>{generationOptions.players} players · {generationOptions.cityStates} city states</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => { const sizePreset = MAP_SIZES.find((item) => item.id === current.size); return { ...current, players: sizePreset?.recommendedPlayers ?? DEFAULT_GENERATION_OPTIONS.players, cityStates: sizePreset?.recommendedCityStates ?? DEFAULT_GENERATION_OPTIONS.cityStates, balance: DEFAULT_GENERATION_OPTIONS.balance, teamSize: DEFAULT_GENERATION_OPTIONS.teamSize, teamLayout: DEFAULT_GENERATION_OPTIONS.teamLayout, startQuality: DEFAULT_GENERATION_OPTIONS.startQuality, strategicBalance: false }; })}>Reset players</button>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>City states</span><input type="number" min="0" max="41" value={generationOptions.cityStates} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStates: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Layout</span><select value={generationOptions.balance} onChange={(event) => setGenerationOptions((current) => ({ ...current, balance: event.target.value as MapGenerationOptions["balance"] }))}><option value="STANDARD">Equal separation</option><option value="TOURNAMENT">Tournament</option><option value="TEAMS">Paired teams</option></select></label>
                      </div>
                      {generationOptions.balance === "TEAMS" && (
                        <div className="team-balance-controls">
                          <label className="control-field"><span>Team size</span><select value={generationOptions.teamSize} onChange={(event) => setGenerationOptions((current) => ({ ...current, teamSize: Number(event.target.value) as 2 | 3 | 4 }))}><option value="2">2v2 teams</option><option value="3">3-player teams</option><option value="4">4-player teams</option></select></label>
                          <label className="control-field"><span>Team geography</span><select value={generationOptions.teamLayout} onChange={(event) => setGenerationOptions((current) => ({ ...current, teamLayout: event.target.value as MapGenerationOptions["teamLayout"] }))}><option value="CLUSTERED">Cluster teammates</option><option value="FRONTLINES">Opposing fronts</option><option value="DISTRIBUTED">Distributed teammates</option></select></label>
                        </div>
                      )}
                      <label className="control-field"><span>Start quality</span><select value={generationOptions.startQuality} onChange={(event) => setGenerationOptions((current) => ({ ...current, startQuality: event.target.value as MapGenerationOptions["startQuality"], strategicBalance: false }))}><option value="STANDARD">Standard</option><option value="BALANCED">Balanced strategic access</option><option value="LEGENDARY">Legendary Start</option></select><small>{generationOptions.startQuality === "LEGENDARY" ? "Improves nearby terrain and adds six valuable resources." : generationOptions.startQuality === "BALANCED" ? "Places food, iron, and horses near every start." : "Leaves local terrain and resources untouched."}</small></label>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>City-state spacing</span><input type="number" min="1" max="12" value={generationOptions.cityStateMinSpacing} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateMinSpacing: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Distribution</span><select value={generationOptions.cityStateDistribution} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateDistribution: event.target.value as MapGenerationOptions["cityStateDistribution"] }))}><option value="EVEN">Even</option><option value="REGIONAL">Regional</option></select></label>
                        <label className="control-field"><span>Coastal preference</span><select value={generationOptions.cityStateCoastalPreference} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateCoastalPreference: event.target.value as MapGenerationOptions["cityStateCoastalPreference"] }))}><option value="ANY">Any</option><option value="PREFER">Prefer coast</option><option value="REQUIRE">Require coast</option></select></label>
                      </div>
                    </div>
                  </details>
                  </div>

                  <div className="creator-actions">
                    {generationRunning
                      ? <button className="generate-button generation-cancel" type="button" onClick={cancelGeneration}>Cancel · {generationStage}</button>
                      : <button className="generate-button" type="button" onClick={() => void generateNewMap()}>Generate map</button>}
                    <div className="generation-readout"><span>Current map</span><strong>{generationMetrics.water}% water · {generationMetrics.mountains}% mountains</strong></div>
                  </div>
                </>
              ) : createView === "EDIT" ? (
                <div className="tile-editor">
                  <div className="section-title"><h3>Edit map</h3><span>click a hex</span></div>
                  <div className="tool-tabs">
                    <button type="button" className={editTool === "TILE" ? "is-active" : ""} onClick={() => setEditTool("TILE")}>Tile brush</button>
                    <button type="button" className={editTool === "FILL" ? "is-active" : ""} onClick={() => setEditTool("FILL")}>Flood fill</button>
                    <button type="button" className={editTool === "SELECT" ? "is-active" : ""} onClick={() => setEditTool("SELECT")}>Region</button>
                    <button type="button" className={editTool === "STRUCTURE" ? "is-active" : ""} onClick={() => { setEditTool("STRUCTURE"); setIsPasting(false); }}>World structure</button>
                    <button type="button" className={editTool === "START" ? "is-active" : ""} onClick={() => setEditTool("START")}>Start positions</button>
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
                  <div className="analysis-summary">
                    <span className={`analysis-grade grade-${balanceReport.grade.toLowerCase()}`}>{balanceReport.grade}</span>
                    <div><h3>Multiplayer balance</h3><p>{balanceReport.summary}</p></div>
                  </div>
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
            </div>
          )}

          {mode === "SCRIPT" && (
            <div className="script-panel">
              <div className="section-title"><h3>Lua project</h3><span>sandboxed</span></div>
              <p>Load a main Civ V map script, supply its named Lua dependencies, edit the source, and replay a post-generation hook. A successful run becomes an ordinary editable map.</p>
              <div className="lua-project-actions">
                <button type="button" onClick={() => luaInputRef.current?.click()}>{luaSource ? "Replace main script" : "Open main script"}</button>
                <button type="button" disabled={!luaSource} onClick={() => luaDependencyInputRef.current?.click()}>Add dependencies</button>
              </div>
              {luaSource && (
                <>
                  <div className="lua-project-file">
                    <span>Main</span><strong>{luaFileName}</strong><small>{luaSource.split("\n").length.toLocaleString()} lines</small>
                  </div>
                  <div className="lua-generate-panel">
                    <button className="lua-run-button" type="button" disabled={luaIsRunning} onClick={runLuaProject}>{luaIsRunning ? "Generating map from Lua…" : luaMetadata ? "Regenerate map from Lua" : "Generate map from Lua"}</button>
                    <div className={`lua-run-status${luaIsRunning ? " is-running" : ""}`} role="status" aria-live="polite">
                      {luaRunStatus || "Ready to generate an editable map."}
                    </div>
                    <small>Runs the main script, supplied dependencies, selected options, and post-process hook. The result replaces the current map and remains fully editable.</small>
                  </div>
                  <details className="lua-workspace-group" open>
                    <summary><span>Source editor</span><small>Modify generator functions directly</small></summary>
                    <div className="lua-workspace-body">
                      <textarea className="lua-source-editor" aria-label="Lua main script source" spellCheck={false} value={luaSource} onChange={(event) => { setLuaSource(event.target.value); setLuaMetadata(null); }} />
                    </div>
                  </details>

                  <details className="lua-workspace-group" open={luaDependencies.length > 0}>
                    <summary><span>Dependencies</span><small>{luaDependencies.length ? `${luaDependencies.length} supplied` : "Built-in compatibility includes only"}</small></summary>
                    <div className="lua-workspace-body">
                      {luaDependencies.length ? (
                        <div className="lua-dependency-list">
                          {luaDependencies.map((dependency) => (
                            <div key={dependency.name}><span>{dependency.name}</span><small>{dependency.source.split("\n").length} lines</small><button type="button" aria-label={`Remove ${dependency.name}`} onClick={() => setLuaDependencies((current) => current.filter((item) => item.name !== dependency.name))}>Remove</button></div>
                          ))}
                        </div>
                      ) : <p className="lua-empty-note">Common Civ V helpers such as MapGenerator, bit, vectors, and starting-plot scaffolding are supplied by the runtime. Add mod-specific files here.</p>}
                      <button className="lua-inline-button" type="button" onClick={() => luaDependencyInputRef.current?.click()}>Add .lua files</button>
                    </div>
                  </details>

                  {luaCustomOptions.length > 0 && (
                    <details className="lua-workspace-group" open>
                      <summary><span>Script options</span><small>{luaCustomOptions.length} discovered by GetMapScriptInfo()</small></summary>
                      <div className="lua-workspace-body">
                        {luaCustomOptions.map((option) => (
                          <label className="control-field" key={option.index}>
                            <span>{option.name}</span>
                            {option.values.length ? (
                              <select value={option.selectedValue} onChange={(event) => setLuaCustomOptions((current) => current.map((item) => item.index === option.index ? { ...item, selectedValue: Number(event.target.value) } : item))}>
                                {option.values.map((value, index) => <option key={`${value}-${index}`} value={index + 1}>{value || `Value ${index + 1}`}</option>)}
                              </select>
                            ) : (
                              <input type="number" min="1" value={option.selectedValue} onChange={(event) => setLuaCustomOptions((current) => current.map((item) => item.index === option.index ? { ...item, selectedValue: Number(event.target.value) } : item))} />
                            )}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}

                  <details className="lua-workspace-group">
                    <summary><span>Runtime</span><small>Fallback allocation, seed, and starts</small></summary>
                    <div className="lua-workspace-body">
                      <div className="control-grid">
                        <label className="control-field"><span>Fallback size</span><select value={generationOptions.size} onChange={(event) => setGenerationOptions((current) => ({ ...current, size: event.target.value as MapGenerationOptions["size"] }))}>{MAP_SIZES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}</option>)}</select></label>
                        <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
                      </div>
                      <div className="control-grid">
                        <label className="control-field"><span>City states</span><input type="number" min="0" max="41" value={generationOptions.cityStates} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStates: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Runtime seed</span><input value={generationOptions.seed} onChange={(event) => setGenerationOptions((current) => ({ ...current, seed: event.target.value }))} /></label>
                      </div>
                      <p className="lua-empty-note">GetMapInitData() overrides the fallback dimensions and wrap type. Excogitare fills any player starts the script leaves unassigned.</p>
                    </div>
                  </details>

                  <details className="lua-workspace-group">
                    <summary><span>Post-process hook</span><small>Replay modifications after generation</small></summary>
                    <div className="lua-workspace-body">
                      <textarea className="lua-hook-editor" aria-label="Lua post-process hook" spellCheck={false} placeholder={'-- Runs after the script finishes.\n-- Example:\n-- Map.GetPlot(4, 4):SetTerrainType(TerrainTypes.TERRAIN_DESERT)'} value={luaPostProcess} onChange={(event) => { setLuaPostProcess(event.target.value); setLuaMetadata(null); }} />
                      <p className="lua-empty-note">The hook can call the same Map and plot APIs as the generator. It is stored in this workspace and reruns every time you generate.</p>
                    </div>
                  </details>
                </>
              )}
              {luaReport && (
                <div className={`lua-report${luaReport.compatible ? " is-compatible" : ""}`}>
                  <strong>{luaReport.title}</strong>
                  <small>{luaFileName}</small>
                  <ul>{luaReport.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                </div>
              )}
              {luaMetadata && (
                <details className="lua-pipeline" open>
                  <summary>Execution pipeline</summary>
                  <ol>{luaMetadata.stages.map((stage) => <li key={stage.id} className={stage.status === "COMPLETE" ? "is-complete" : "is-skipped"}><span>{stage.label}</span><small>{stage.detail}</small></li>)}</ol>
                </details>
              )}
              {luaLogs.length > 0 && (
                <details className="lua-console">
                  <summary>Script console · {luaLogs.length} lines</summary>
                  <pre>{luaLogs.join("\n")}</pre>
                </details>
              )}
              <div className="script-export-grid">
                <button type="button" onClick={exportLua}>Export map Lua</button>
                <button type="button" onClick={exportModInfo}>Export .modinfo</button>
              </div>
            </div>
          )}
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

          <button className="demo-button" type="button" onClick={() => { replaceMap(createDemoMap()); setShowEditPrompt(false); setIsEditingMetadata(false); setMessage("Demo map loaded"); }}>Reset to sample map</button>
        </aside>

        <div
          ref={canvasShellRef}
          className={`canvas-shell${isDraggingFile ? " is-dragging" : ""}${mode === "CREATE" && createView === "EDIT" ? " is-editing" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDraggingFile(false); }}
          onDrop={onDrop}
        >
          <canvas
            ref={canvasRef}
            aria-label={`Interactive physical map of ${canvasMap.name}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            onPointerLeave={() => { if (!dragRef.current) setHovered(null); }}
            onWheel={onWheel}
          />

          <div className="map-toolbar" aria-label="Map controls">
            <button type="button" onClick={() => zoomAt(1.2, size.width / 2, size.height / 2)} aria-label="Zoom in">+</button>
            <span>{Math.round(view.zoom * 100)}%</span>
            <button type="button" onClick={() => zoomAt(0.83, size.width / 2, size.height / 2)} aria-label="Zoom out">−</button>
            <i aria-hidden="true" />
            <button className="fit-button" type="button" onClick={() => fitMap(size)}>Fit</button>
            <i aria-hidden="true" />
            <button className={`projection-button${projection === "ISOMETRIC" ? " is-active" : ""}`} type="button" aria-pressed={projection === "ISOMETRIC"} title={projection === "ISOMETRIC" ? "Return to 2D view" : "Switch to 3D isometric view"} onClick={() => setProjection((current) => current === "FLAT" ? "ISOMETRIC" : "FLAT")}>{projection === "ISOMETRIC" ? "2D" : "ISO 3D"}</button>
            <i aria-hidden="true" />
            <button className={`legend-button${showLegend ? " is-active" : ""}`} type="button" aria-expanded={showLegend} aria-controls="map-legend" aria-label={showLegend ? "Hide map legend" : "Show map legend"} onClick={() => setShowLegend((current) => !current)}>Legend</button>
          </div>

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

          <div className="file-status" role="status">{message}</div>

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
            <div className="map-hint">{mode === "CREATE" && createView === "EDIT" ? "Click to edit" : mode === "REPAIR" ? "Review proposed corrections" : "Hover for tile data"} <span>·</span> Drag to pan <span>·</span> Scroll to zoom</div>
          )}

          {isDraggingFile && (
            <div className="drop-overlay">
              <div><strong>Drop your Civ5 map</strong><span>It will be rendered entirely in your browser</span></div>
            </div>
          )}
        </div>
      </section>

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
              <button className="confirm-export" type="button" onClick={() => { setShowExportValidation(false); performCiv5MapExport(); }}>Export anyway</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
