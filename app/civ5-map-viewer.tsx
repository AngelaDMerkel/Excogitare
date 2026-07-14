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
  serializeCiv5Map,
  updateCiv5Map,
  type Civ5Map,
  type Civ5StartLocation,
  type Civ5Tile,
} from "@/lib/civ5-map";
import { analyzeMultiplayerBalance, validateCiv5Map } from "@/lib/map-analysis";
import {
  DEFAULT_GENERATION_OPTIONS,
  DOMINANT_TERRAINS,
  generateMap,
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

const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const ISOMETRIC_RELIEF_MARGIN = 52;
const APP_VERSION = "0.1.2";

type View = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };
type Layers = { grid: boolean; features: boolean; resources: boolean; elevation: boolean; starts: boolean; cityStates: boolean };
type HoveredTile = { tile: Civ5Tile; col: number; row: number } | null;
type ImportedMapSource = { fileName: string; buffer: ArrayBuffer };
type WorkspaceMode = "VIEW" | "CREATE" | "SCRIPT";
type Brush = { terrain: number | null; elevation: number | null; feature: number | null; resource: number | null };
type TileSelection = { minX: number; minY: number; maxX: number; maxY: number };
type TileClipboard = { width: number; height: number; tiles: Civ5Tile[] };
type Projection = "FLAT" | "ISOMETRIC";
type ProjectionTransform = { a: number; b: number; c: number; d: number; e: number; f: number; width: number; height: number };

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

function mapBounds(map: Civ5Map) {
  return {
    width: HEX_WIDTH * (map.width + 0.5) + MAP_MARGIN * 2,
    height: HEX_RADIUS * 1.5 * (map.height - 1) + HEX_RADIUS * 2 + MAP_MARGIN * 2,
  };
}

function projectionTransform(map: Civ5Map, projection: Projection): ProjectionTransform {
  const bounds = mapBounds(map);
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
  }
}

function drawRiver(context: CanvasRenderingContext2D, river: number, x: number, y: number) {
  if (!(river & 7)) return;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
  });
  const edges = [
    [4, 5, 1],
    [3, 4, 2],
    [2, 3, 4],
  ];
  context.save();
  context.strokeStyle = "rgba(91, 185, 211, .9)";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  for (const [start, end, bit] of edges) {
    if (!(river & bit)) continue;
    context.beginPath();
    context.moveTo(points[start].x, points[start].y);
    context.lineTo(points[end].x, points[end].y);
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
) {
  let paintedTiles = 0;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#10242b";
  context.fillRect(0, 0, size.width, size.height);
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

      const base = terrainColor(map.terrains[tile.terrain]);
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

      if (hovered?.col === col && hovered.row === row) {
        hexPath(context, center.x, center.y);
        context.strokeStyle = "#f1d183";
        context.lineWidth = 2.8 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
      const sourceY = map.height - 1 - row;
      if (selection && col >= selection.minX && col <= selection.maxX && sourceY >= selection.minY && sourceY <= selection.maxY) {
        hexPath(context, center.x, center.y);
        context.fillStyle = "rgba(94, 198, 205, .18)";
        context.fill();
        context.strokeStyle = "rgba(126, 220, 220, .82)";
        context.lineWidth = 1.6 / Math.max(view.zoom, 0.5);
        context.stroke();
      }
  }
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
  const [createView, setCreateView] = useState<"GENERATE" | "EDIT" | "ANALYZE">("GENERATE");
  const [brush, setBrush] = useState<Brush>({ terrain: 2, elevation: 0, feature: null, resource: null });
  const [editTool, setEditTool] = useState<"TILE" | "FILL" | "SELECT" | "START">("TILE");
  const [brushSize, setBrushSize] = useState(1);
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<TileSelection | null>(null);
  const [tileClipboard, setTileClipboard] = useState<TileClipboard | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [focusedStart, setFocusedStart] = useState<Civ5StartLocation | null>(null);
  const [showExportValidation, setShowExportValidation] = useState(false);
  const [luaReport, setLuaReport] = useState<LuaCompatibilityReport | null>(null);
  const [luaFileName, setLuaFileName] = useState("");
  const [size, setSize] = useState<Size>({ width: 900, height: 620 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [layers, setLayers] = useState<Layers>({ grid: true, features: true, resources: true, elevation: true, starts: true, cityStates: true });
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const luaInputRef = useRef<HTMLInputElement>(null);
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

  const undo = () => {
    const previous = pastMaps.at(-1);
    if (!previous) return;
    setFutureMaps((future) => [mapRef.current, ...future].slice(0, 50));
    mapRef.current = previous;
    setMap(previous);
    setPastMaps((past) => past.slice(0, -1));
  };

  const redo = () => {
    const next = futureMaps[0];
    if (!next) return;
    setPastMaps((past) => [...past.slice(-49), mapRef.current]);
    mapRef.current = next;
    setMap(next);
    setFutureMaps((future) => future.slice(1));
  };

  const mapProjection = useMemo(() => projectionTransform(map, projection), [map, projection]);
  const bounds = useMemo(() => ({ width: mapProjection.width, height: mapProjection.height }), [mapProjection]);
  const fitMap = useCallback((targetSize: Size, targetBounds = bounds) => {
    const zoom = Math.max(0.16, Math.min(1.7, Math.min((targetSize.width - 44) / targetBounds.width, (targetSize.height - 44) / targetBounds.height)));
    setView({ zoom, x: (targetSize.width - targetBounds.width * zoom) / 2, y: (targetSize.height - targetBounds.height * zoom) / 2 });
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitMap(size));
    return () => window.cancelAnimationFrame(frame);
  }, [map, size, fitMap]);

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
    const paintedTiles = drawMap(renderContext, map, layers, hovered, view, size, pixelRatio, mapProjection, selection, focusedStart);
    if (map.tiles.length && paintedTiles === 0) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "copy";
    context.drawImage(renderCanvas, 0, 0);
    context.restore();
  }, [map, layers, hovered, view, size, mapProjection, selection, focusedStart]);

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
    return `${styleLabel} · ${presetLabel} · ${sizeLabel} ${dimensions.width}×${dimensions.height} · ${generationOptions.players} players`;
  }, [generationOptions]);
  const validationIssues = useMemo(() => validateCiv5Map(map), [map]);
  const balanceReport = useMemo(() => analyzeMultiplayerBalance(map), [map]);

  const majorStartCount = map.startLocations.filter((start) => !start.cityState).length;
  const cityStateCount = map.startLocations.filter((start) => start.cityState).length;
  const visibleLayerCount = Object.entries(layers).filter(([key, enabled]) => enabled
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
      const parsed = parseCiv5Map(buffer, file.name);
      replaceMap(parsed, { fileName: file.name, buffer });
      setShowEditPrompt(false);
      setIsEditingMetadata(false);
      setMessage(`${file.name} · rendered locally`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That map could not be read.");
    }
  }, [replaceMap]);

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
      setHovered(closestIsometricTile(map, projectedPoint.x, projectedPoint.y, mapProjection, layers.elevation));
    } else {
      const worldPoint = unprojectPoint(projectedPoint.x, projectedPoint.y, mapProjection);
      setHovered(closestTile(map, worldPoint.x, worldPoint.y));
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
    if (editTool === "SELECT") {
      if (isPasting && tileClipboard) {
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
        setMessage("Region selected · copy or edit it");
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
          team: generationOptions.balance === "TEAMS" ? Math.floor(startLocations.length / 2) : startLocations.length,
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
      const zoom = Math.max(0.16, Math.min(4.5, current.zoom * factor));
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${map.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "civ5-map"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
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

  const performCiv5MapExport = () => {
    try {
      const exported = sourceFile ? updateCiv5Map(sourceFile.buffer, map) : serializeCiv5Map(map);
      const baseName = sourceFile?.fileName.replace(/\.civ5map$/i, "") ?? mapExportBaseName(map);
      const downloadName = `${baseName}${sourceFile ? "-edited" : ""}.Civ5Map`;
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

  const generateNewMap = () => {
    const generated = generateMap(generationOptions);
    replaceMap(generated);
    setMode("CREATE");
    setMessage(`${generated.name} · generated from seed ${generationOptions.seed}`);
  };

  const randomiseWorld = () => {
    const options = randomGenerationOptions();
    const generated = generateMap(options);
    setGenerationOptions(options);
    replaceMap(generated);
    setCreateView("GENERATE");
    setMessage(`${generated.name} · every generation option randomised`);
  };

  const randomizeSeed = () => {
    const seed = Math.random().toString(36).slice(2, 10);
    setGenerationOptions((current) => ({ ...current, seed }));
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
    setLuaReport(report);
    if (report.compatible) {
      try {
        const result = mapFromLuaScript(source);
        replaceMap(result.map);
        setGenerationOptions(result.map.generation ?? generationOptions);
        setMessage(`${file.name} · safely regenerated from embedded settings`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The Lua map could not be generated.");
      }
    } else {
      setMessage(`${file.name} · running in the isolated Lua preview…`);
      try {
        const result = await runLuaMapScript(source, file.name, generationOptions);
        replaceMap(result.map);
        setLuaReport({
          compatible: true,
          title: "Generated with the experimental Civ V runtime",
          details: [...report.details, "Executed in an isolated worker with an 8 second function limit", `${result.logs.length} script log lines captured`],
        });
        setMessage(`${file.name} · Lua preview generated`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The Lua script could not be executed.";
        setLuaReport({ ...report, details: [...report.details, detail] });
        setMessage(`${file.name} · ${detail}`);
      }
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
          {(["VIEW", "CREATE", "SCRIPT"] as const).map((item) => (
            <button key={item} type="button" className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>
              {item === "VIEW" ? "Explore" : item === "CREATE" ? "Create" : "Lua"}
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
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Map information and layers">
          {mode === "CREATE" && (
            <button className="randomise-world-button" type="button" onClick={randomiseWorld}>
              <span>Randomise</span><small>New map from every option</small>
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

          {showExportValidation && (
            <div className="edit-mode-prompt validation-prompt" role="dialog" aria-label="Civ5Map validation warnings">
              <strong>Review before export</strong>
              <p>{validationIssues.filter((issue) => issue.severity === "ERROR").length} errors and {validationIssues.filter((issue) => issue.severity === "WARNING").length} warnings were found.</p>
              <ul>{validationIssues.filter((issue) => issue.severity !== "INFO").slice(0, 4).map((issue, index) => <li key={`${issue.category}-${index}`}>{issue.message}</li>)}</ul>
              <div>
                <button type="button" onClick={() => { setShowExportValidation(false); setMode("CREATE"); setCreateView("ANALYZE"); }}>Open report</button>
                <button className="confirm-edit" type="button" onClick={() => { setShowExportValidation(false); performCiv5MapExport(); }}>Export anyway</button>
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
                  <div className="section-title"><h3>Core settings</h3><span>seeded</span></div>
                  <fieldset className="style-picker">
                    <legend>Baseline style</legend>
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
                      setGenerationOptions((current) => ({ ...current, preset: preset.id, waterPercent: preset.water, mountainPercent: current.style === "BRUTAL" ? Math.max(18, preset.mountains) : preset.mountains }));
                    }}>
                      {MAP_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
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

                  <details className="creator-group">
                    <summary><span>World shape</span><small>{generationOptions.waterPercent}% water · {generationOptions.mountainPercent}% mountains</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, modifier: DEFAULT_GENERATION_OPTIONS.modifier, wrapType: DEFAULT_GENERATION_OPTIONS.wrapType, geometry: DEFAULT_GENERATION_OPTIONS.geometry, waterPercent: DEFAULT_GENERATION_OPTIONS.waterPercent, mountainPercent: current.style === "BRUTAL" ? 18 : DEFAULT_GENERATION_OPTIONS.mountainPercent, worldAge: DEFAULT_GENERATION_OPTIONS.worldAge }))}>Reset world shape</button>
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
                          <option value="SQUARE">Perfectly square</option>
                        </select>
                        <small>{(() => { const dimensions = resolveMapDimensions(generationOptions.size, generationOptions.geometry); return `${dimensions.width} × ${dimensions.height} tiles`; })()}</small>
                      </label>
                      <div className="percentage-controls">
                        <label className="control-field percentage-field"><span>Water percent <output>{generationOptions.waterPercent}%</output></span><input type="range" min="0" max="90" step="1" value={generationOptions.waterPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, waterPercent: Number(event.target.value) }))} /></label>
                        <label className="control-field percentage-field"><span>Mountain percent <output>{generationOptions.mountainPercent}%</output></span><input type="range" min={generationOptions.modifier === "STRATEGIC_DEPTH" ? 22 : generationOptions.modifier === "DOOMSDAY" || generationOptions.style === "BRUTAL" ? 18 : 0} max="38" step="1" value={generationOptions.mountainPercent} onChange={(event) => setGenerationOptions((current) => ({ ...current, mountainPercent: Number(event.target.value) }))} /></label>
                      </div>
                      <label className="control-field"><span>World age</span><select value={generationOptions.worldAge} onChange={(event) => setGenerationOptions((current) => ({ ...current, worldAge: event.target.value as MapGenerationOptions["worldAge"] }))}><option value="YOUNG">Young</option><option value="NORMAL">Normal</option><option value="OLD">Old</option></select></label>
                    </div>
                  </details>

                  <details className="creator-group">
                    <summary><span>Resources and wonders</span><small>{generationOptions.wonderCount} wonders · {generationOptions.strategicAbundance.toLowerCase()} strategics</small></summary>
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
                      <small className="content-note">Camps and ruins are scenario improvements. Excogitare previews and analyzes them; geography-only export reports that they cannot yet be embedded.</small>
                    </div>
                  </details>

                  <details className="creator-group">
                    <summary><span>Climate and terrain</span><small>{generationOptions.climate.toLowerCase()} · {generationOptions.rainfall.toLowerCase()}</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => ({ ...current, climate: DEFAULT_GENERATION_OPTIONS.climate, rainfall: DEFAULT_GENERATION_OPTIONS.rainfall, dominantTerrains: [] }))}>Reset climate</button>
                      <div className="control-grid">
                        <label className="control-field"><span>Climate</span><select value={generationOptions.climate} onChange={(event) => setGenerationOptions((current) => ({ ...current, climate: event.target.value as MapGenerationOptions["climate"] }))}><option value="COOL">Cool</option><option value="TEMPERATE">Temperate</option><option value="HOT">Hot</option></select></label>
                        <label className="control-field"><span>Rainfall</span><select value={generationOptions.rainfall} onChange={(event) => setGenerationOptions((current) => ({ ...current, rainfall: event.target.value as MapGenerationOptions["rainfall"] }))}><option value="ARID">Arid</option><option value="NORMAL">Normal</option><option value="WET">Wet</option></select></label>
                      </div>
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

                  <details className="creator-group">
                    <summary><span>Players and starts</span><small>{generationOptions.players} players · {generationOptions.cityStates} city states</small></summary>
                    <div className="creator-group-body">
                      <button className="group-reset" type="button" onClick={() => setGenerationOptions((current) => { const sizePreset = MAP_SIZES.find((item) => item.id === current.size); return { ...current, players: sizePreset?.recommendedPlayers ?? DEFAULT_GENERATION_OPTIONS.players, cityStates: sizePreset?.recommendedCityStates ?? DEFAULT_GENERATION_OPTIONS.cityStates, balance: DEFAULT_GENERATION_OPTIONS.balance, startQuality: DEFAULT_GENERATION_OPTIONS.startQuality, strategicBalance: false }; })}>Reset players</button>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>City states</span><input type="number" min="0" max="41" value={generationOptions.cityStates} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStates: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Layout</span><select value={generationOptions.balance} onChange={(event) => setGenerationOptions((current) => ({ ...current, balance: event.target.value as MapGenerationOptions["balance"] }))}><option value="STANDARD">Equal separation</option><option value="TOURNAMENT">Tournament</option><option value="TEAMS">Paired teams</option></select></label>
                      </div>
                      <label className="control-field"><span>Start quality</span><select value={generationOptions.startQuality} onChange={(event) => setGenerationOptions((current) => ({ ...current, startQuality: event.target.value as MapGenerationOptions["startQuality"], strategicBalance: false }))}><option value="STANDARD">Standard</option><option value="BALANCED">Balanced strategic access</option><option value="LEGENDARY">Legendary Start</option></select><small>{generationOptions.startQuality === "LEGENDARY" ? "Improves nearby terrain and adds six valuable resources." : generationOptions.startQuality === "BALANCED" ? "Places food, iron, and horses near every start." : "Leaves local terrain and resources untouched."}</small></label>
                      <div className="control-grid three-controls">
                        <label className="control-field"><span>City-state spacing</span><input type="number" min="1" max="12" value={generationOptions.cityStateMinSpacing} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateMinSpacing: Number(event.target.value) }))} /></label>
                        <label className="control-field"><span>Distribution</span><select value={generationOptions.cityStateDistribution} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateDistribution: event.target.value as MapGenerationOptions["cityStateDistribution"] }))}><option value="EVEN">Even</option><option value="REGIONAL">Regional</option></select></label>
                        <label className="control-field"><span>Coastal preference</span><select value={generationOptions.cityStateCoastalPreference} onChange={(event) => setGenerationOptions((current) => ({ ...current, cityStateCoastalPreference: event.target.value as MapGenerationOptions["cityStateCoastalPreference"] }))}><option value="ANY">Any</option><option value="PREFER">Prefer coast</option><option value="REQUIRE">Require coast</option></select></label>
                      </div>
                    </div>
                  </details>

                  <div className="creator-actions">
                    <button className="generate-button" type="button" onClick={generateNewMap}>Generate map</button>
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
                  ) : <p className="editor-note">Click a hex to add or remove a numbered major start. Team Mode pairs consecutive players.</p>}
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
              <div className="section-title"><h3>Lua workspace</h3><span>experimental</span></div>
              <p>Round-trip Excogitare scripts or run Civ V map scripts inside an isolated, time-limited browser worker. Unsupported APIs are reported with the script.</p>
              <div className="control-grid">
                <label className="control-field"><span>Preview size</span><select value={generationOptions.size} onChange={(event) => setGenerationOptions((current) => ({ ...current, size: event.target.value as MapGenerationOptions["size"] }))}>{MAP_SIZES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.width}×{item.height}</option>)}</select></label>
                <label className="control-field"><span>Players</span><input type="number" min="2" max="22" value={generationOptions.players} onChange={(event) => setGenerationOptions((current) => ({ ...current, players: Number(event.target.value) }))} /></label>
              </div>
              <label className="control-field"><span>Runtime seed</span><input value={generationOptions.seed} onChange={(event) => setGenerationOptions((current) => ({ ...current, seed: event.target.value }))} /></label>
              <button className="lua-open-button" type="button" onClick={() => luaInputRef.current?.click()}>Open and run Lua script</button>
              {luaReport && (
                <div className={`lua-report${luaReport.compatible ? " is-compatible" : ""}`}>
                  <strong>{luaReport.title}</strong>
                  <small>{luaFileName}</small>
                  <ul>{luaReport.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                </div>
              )}
              <div className="script-export-grid">
                <button type="button" onClick={exportLua}>Export Lua</button>
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
            aria-label={`Interactive physical map of ${map.name}`}
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
          </div>

          <div className="file-status" role="status">{message}</div>

          {activeTile && hovered ? (
            <div className="tile-card">
              <p className="eyebrow">Tile {hovered.col}, {map.height - 1 - hovered.row}</p>
              <h3>{friendlyName(map.terrains[activeTile.terrain], "TERRAIN_")}</h3>
              <div className="tile-details">
                <span>Feature<strong>{friendlyName(map.features[activeTile.feature], "FEATURE_")}</strong></span>
                <span>Elevation<strong>{["Flat", "Hills", "Mountain"][activeTile.elevation] ?? `Level ${activeTile.elevation}`}</strong></span>
                <span>Resource<strong>{friendlyName(map.resources[activeTile.resource], "RESOURCE_")}</strong></span>
              </div>
            </div>
          ) : (
            <div className="map-hint">{mode === "CREATE" && createView === "EDIT" ? "Click to edit" : "Hover for tile data"} <span>·</span> Drag to pan <span>·</span> Scroll to zoom</div>
          )}

          {isDraggingFile && (
            <div className="drop-overlay">
              <div><strong>Drop your Civ5 map</strong><span>It will be rendered entirely in your browser</span></div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
