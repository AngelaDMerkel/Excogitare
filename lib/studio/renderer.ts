// Rendering primitives extracted from the legacy viewer; the authoring store is independent.
import type { Civ5Map, Civ5Tile, Civ5StartLocation } from "../civ5-map.ts";
import { politicalColors } from "../political-map.ts";
const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const ISOMETRIC_RELIEF_MARGIN = 52;
export type View = { zoom: number; x: number; y: number };
export type Size = { width: number; height: number };
export type Layers = { political: boolean; strategy: boolean; grid: boolean; features: boolean; resources: boolean; elevation: boolean; starts: boolean; cityStates: boolean };
export type HoveredTile = { tile: Civ5Tile; col: number; row: number } | null;
export type TileSelection = { minX: number; minY: number; maxX: number; maxY: number };
export type Projection = "FLAT" | "ISOMETRIC";
export type ProjectionTransform = { a: number; b: number; c: number; d: number; e: number; f: number; width: number; height: number };
const TERRAIN_COLORS: Record<string, string> = {
  OCEAN: "#83aab3",
  COAST: "#bfd3d0",
  GRASS: "#c1cca9",
  PLAINS: "#d9d1aa",
  DESERT: "#e8d6b1",
  TUNDRA: "#c5c7b3",
  SNOW: "#e6e6d9",
};

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

export function mapBounds(width: number, height: number) {
  return {
    width: HEX_WIDTH * (width + 0.5) + MAP_MARGIN * 2,
    height: HEX_RADIUS * 1.5 * (height - 1) + HEX_RADIUS * 2 + MAP_MARGIN * 2,
  };
}

export function projectionTransform(width: number, height: number, projection: Projection): ProjectionTransform {
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

export function projectPoint(x: number, y: number, transform: ProjectionTransform) {
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

export function tileCenter(col: number, row: number, sourceRow = row) {
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
    { color: "rgba(73, 127, 147, .9)", width: 3.2 },
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

export function drawMap(
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
    context.fillStyle = "#dfdad2";
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
        : layers.elevation && tile.elevation === 2 ? shade(base, -8) : layers.elevation && tile.elevation === 1 ? shade(base, -3) : base;
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
        context.save();
        if (!isometric) context.globalAlpha = .52;
        drawFeature(context, map.features[tile.feature] ?? "", center.x, center.y);
        context.restore();
      }
      if (layers.features && (tile.wonder !== 255 || tile.improvement)) drawMapContent(context, tile, center.x, center.y);

      if (layers.elevation && tile.elevation > 0) {
        if (isometric) drawIsometricRelief(context, center, tile.elevation, projection);
        else {
          context.fillStyle = tile.elevation === 2 ? "rgba(110, 112, 88, .85)" : "rgba(130, 131, 102, .35)";
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

export function closestTile(map: Civ5Map, worldX: number, worldY: number): HoveredTile {
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

export function closestIsometricTile(
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
