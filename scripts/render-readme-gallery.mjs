import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CLIMATE_PROJECTIONS } from "../lib/climate-projection.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, MAP_PRESETS, polisPatternForPreset } from "../lib/map-generator.ts";

const PROJECTION = { a: 0.86, b: 0.25, c: -0.52, d: 0.38 };
const HEX_RADIUS = 18;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const COLORS = {
  background: "#07191e",
  panel: "#0c242a",
  line: "#244047",
  gold: "#d9b96f",
  cream: "#efe9dc",
  text: "#b8c8c3",
  muted: "#718a84",
  teal: "#70a7a4",
};
const TERRAIN_COLORS = {
  OCEAN: "#183d50",
  COAST: "#2e7180",
  GRASS: "#76955a",
  PLAINS: "#ae9656",
  DESERT: "#c9a963",
  TUNDRA: "#7d8d83",
  SNOW: "#d7dfdc",
};

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch (error) {
  if (!process.env.SHARP_MODULE) throw new Error("Set SHARP_MODULE to an installed sharp package.", { cause: error });
  sharp = require(process.env.SHARP_MODULE);
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (channel) => Math.max(0, Math.min(255, channel + amount));
  return `rgb(${clamp(value >> 16)}, ${clamp((value >> 8) & 0xff)}, ${clamp(value & 0xff)})`;
}

function terrainColor(map, tile) {
  const name = map.terrains[tile.terrain] ?? "";
  const key = Object.keys(TERRAIN_COLORS).find((candidate) => name.includes(candidate));
  return key ? TERRAIN_COLORS[key] : "#667a65";
}

function tileCenter(col, displayRow, sourceRow) {
  return { x: HEX_WIDTH / 2 + HEX_WIDTH * (col + (sourceRow % 2 ? 0.5 : 0)), y: HEX_RADIUS + displayRow * HEX_RADIUS * 1.5 };
}

function reliefHeight(tile) {
  if (tile.terrain < 2) return 0;
  return tile.elevation === 2 ? 22 : tile.elevation === 1 ? 9 : 0;
}

function lift(point, height) {
  if (!height) return point;
  const determinant = PROJECTION.a * PROJECTION.d - PROJECTION.b * PROJECTION.c;
  return { x: point.x + (PROJECTION.c * height) / determinant, y: point.y - (PROJECTION.a * height) / determinant };
}

function project(point) {
  return { x: PROJECTION.a * point.x + PROJECTION.c * point.y, y: PROJECTION.b * point.x + PROJECTION.d * point.y };
}

function hex(center) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: center.x + HEX_RADIUS * Math.cos(angle), y: center.y + HEX_RADIUS * Math.sin(angle) };
  });
}

function points(items) {
  return items.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function renderMap(map, frame) {
  const tiles = [];
  for (let displayRow = 0; displayRow < map.height; displayRow += 1) {
    const sourceRow = map.height - 1 - displayRow;
    for (let col = 0; col < map.width; col += 1) {
      const tile = map.tiles[sourceRow * map.width + col];
      const base = tileCenter(col, displayRow, sourceRow);
      const top = lift(base, reliefHeight(tile));
      tiles.push({ tile, base, top, projected: project(top) });
    }
  }
  tiles.sort((one, two) => one.projected.y - two.projected.y || one.projected.x - two.projected.x);
  const allPoints = tiles.flatMap(({ base, top }) => [...hex(base), ...hex(top)].map(project));
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const scale = Math.min(frame.width / (maxX - minX), frame.height / (maxY - minY));
  const offsetX = frame.x + (frame.width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = frame.y + (frame.height - (maxY - minY) * scale) / 2 - minY * scale;
  const screen = (point) => { const projected = project(point); return { x: projected.x * scale + offsetX, y: projected.y * scale + offsetY }; };
  const markup = [];

  for (const { tile, base, top } of tiles) {
    const baseHex = hex(base).map(screen);
    const topHex = hex(top).map(screen);
    const center = screen(top);
    const color = terrainColor(map, tile);
    if (reliefHeight(tile)) {
      for (let edge = 0; edge < 6; edge += 1) {
        const next = (edge + 1) % 6;
        const midpointY = (topHex[edge].y + topHex[next].y) / 2;
        if (midpointY < center.y) continue;
        markup.push(`<polygon points="${points([topHex[edge], topHex[next], baseHex[next], baseHex[edge]])}" fill="${shade(color, edge < 3 ? -52 : -36)}" stroke="#061417" stroke-opacity=".42" stroke-width=".7"/>`);
      }
    }
    markup.push(`<polygon points="${points(topHex)}" fill="${shade(color, tile.elevation === 2 ? -10 : 0)}" stroke="#061417" stroke-opacity=".56" stroke-width="${Math.max(0.45, scale * 0.5)}"/>`);

    const radius = HEX_RADIUS * scale;
    if (tile.elevation === 2) {
      markup.push(`<path d="M ${center.x - radius * 0.52} ${center.y + radius * 0.32} L ${center.x - radius * 0.1} ${center.y - radius * 0.9} L ${center.x + radius * 0.55} ${center.y + radius * 0.32} Z" fill="#626055" stroke="#202826" stroke-width=".6"/><path d="M ${center.x - radius * 0.1} ${center.y - radius * 0.9} L ${center.x - radius * 0.28} ${center.y - radius * 0.35} L ${center.x + radius * 0.14} ${center.y - radius * 0.4} Z" fill="#e8e7da" fill-opacity=".9"/>`);
    } else if (tile.feature !== 255 && map.features[tile.feature]?.includes("FOREST")) {
      markup.push(`<circle cx="${center.x}" cy="${center.y}" r="${Math.max(1.2, radius * 0.18)}" fill="#17462d"/>`);
    }
    if (tile.river & 7) {
      for (const [start, end, bit] of [[4, 5, 1], [3, 4, 2], [2, 3, 4]]) {
        if (!(tile.river & bit)) continue;
        markup.push(`<line x1="${topHex[start].x}" y1="${topHex[start].y}" x2="${topHex[end].x}" y2="${topHex[end].y}" stroke="#75c5db" stroke-width="${Math.max(1.1, scale * 1.45)}" stroke-linecap="round"/>`);
      }
    }
    if (tile.resource !== 255) markup.push(`<circle cx="${center.x}" cy="${center.y}" r="${Math.max(1.6, scale * 2.5)}" fill="#f0cf75" stroke="#102326" stroke-width="1"/>`);
    if (tile.wonder !== 255) markup.push(`<circle cx="${center.x}" cy="${center.y}" r="${Math.max(2.3, scale * 3.8)}" fill="none" stroke="#f0cf75" stroke-width="${Math.max(1, scale)}"/>`);
  }
  return markup.join("");
}

function svgShell(width, height, content) {
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06171c"/><stop offset="1" stop-color="#103038"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#02090b" flood-opacity=".48"/></filter></defs><rect width="${width}" height="${height}" fill="url(#bg)"/>${content}</svg>`;
}

function engineLabel(engine) {
  return engine === "ECCENTRIC" ? "ECCENTRIC" : engine;
}

function makePresetMap(preset, projectionType = "NORTH_SOUTH") {
  const style = preset.engine === "PHYSICAL" ? "REALISTIC" : preset.id === "MYTHIC_REGIONS" ? "FANTASTICAL" : preset.engine === "ECCENTRIC" ? "REALISTIC" : "FANTASTICAL";
  return generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: preset.engine,
    preset: preset.id,
    size: "DUEL",
    players: 4,
    cityStates: 6,
    seed: `readme-${preset.id.toLowerCase()}-${projectionType.toLowerCase()}`,
    style,
    projectionType,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    climateRealism: preset.climateRealism ?? style === "REALISTIC",
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalRotation: preset.physicalRotation ?? DEFAULT_GENERATION_OPTIONS.physicalRotation,
    physicalSeasonality: preset.physicalSeasonality ?? DEFAULT_GENERATION_OPTIONS.physicalSeasonality,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
    polisConflictPattern: polisPatternForPreset(preset.id),
  });
}

function renderPresetCell(preset, map, x, y, width, height) {
  const mapFrame = { x: x + 18, y: y + 84, width: width - 36, height: height - 102 };
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${COLORS.panel}" stroke="${COLORS.line}" filter="url(#shadow)"/><text x="${x + 28}" y="${y + 40}" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700">${escapeXml(preset.label)}</text><text x="${x + 28}" y="${y + 67}" fill="${COLORS.gold}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2">${engineLabel(preset.engine)} · ${preset.water}% WATER · ${preset.mountains}% MOUNTAINS</text>${renderMap(map, mapFrame)}</g>`;
}

async function renderPresetSheet(fileName, title, presets, columns) {
  const width = 2400;
  const rows = Math.ceil(presets.length / columns);
  const headerHeight = 132;
  const gap = 24;
  const cellWidth = (width - 96 - gap * (columns - 1)) / columns;
  const cellHeight = columns === 3 ? 430 : 390;
  const height = headerHeight + rows * cellHeight + (rows - 1) * gap + 54;
  const parts = [`<text x="48" y="64" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="3">${escapeXml(title)}</text><text x="50" y="100" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">Deterministic samples rendered from the actual generation engine.</text>`];
  for (let index = 0; index < presets.length; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = 48 + col * (cellWidth + gap);
    const y = headerHeight + row * (cellHeight + gap);
    parts.push(renderPresetCell(presets[index], makePresetMap(presets[index]), x, y, cellWidth, cellHeight));
  }
  await writePng(fileName, svgShell(width, height, parts.join("")));
}

async function renderProjectionSheet() {
  const width = 2400;
  const height = 650;
  const gap = 24;
  const cellWidth = (width - 96 - gap * 2) / 3;
  const preset = MAP_PRESETS.find((item) => item.id === "DYNAMIC_EARTH");
  const parts = [`<text x="48" y="64" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="3">PROJECTION TYPE</text><text x="50" y="100" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">The grid stays rectangular; the climate coordinate system moves the poles.</text>`];
  CLIMATE_PROJECTIONS.forEach((projection, index) => {
    const x = 48 + index * (cellWidth + gap);
    const y = 132;
    const map = makePresetMap(preset, projection.id);
    parts.push(`<g><rect x="${x}" y="${y}" width="${cellWidth}" height="460" rx="18" fill="${COLORS.panel}" stroke="${COLORS.line}"/><text x="${x + 26}" y="${y + 40}" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700">${escapeXml(projection.label)}</text><text x="${x + 26}" y="${y + 67}" fill="${COLORS.gold}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2">DYNAMIC EARTH · SAME BASE SETTINGS</text>${renderMap(map, { x: x + 18, y: y + 86, width: cellWidth - 36, height: 350 })}</g>`);
  });
  await writePng("projection-types.png", svgShell(width, height, parts.join("")));
}

function button(x, y, width, label, active = false, danger = false) {
  const fill = danger ? "#8f352f" : active ? "#1d4449" : "#102d33";
  const stroke = danger ? "#d36e60" : active ? COLORS.gold : COLORS.line;
  const color = danger ? "#ffe3dd" : active ? "#f0d99f" : COLORS.text;
  return `<rect x="${x}" y="${y}" width="${width}" height="42" rx="6" fill="${fill}" stroke="${stroke}"/><text x="${x + width / 2}" y="${y + 27}" text-anchor="middle" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing=".5">${escapeXml(label)}</text>`;
}

function field(x, y, width, label, value) {
  return `<text x="${x}" y="${y}" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" letter-spacing="1">${escapeXml(label.toUpperCase())}</text><rect x="${x}" y="${y + 10}" width="${width}" height="42" rx="5" fill="#091d22" stroke="${COLORS.line}"/><text x="${x + 14}" y="${y + 37}" fill="${COLORS.text}" font-family="Arial, Helvetica, sans-serif" font-size="14">${escapeXml(value)}</text><path d="M ${x + width - 22} ${y + 28} l 5 6 5 -6" fill="none" stroke="${COLORS.muted}" stroke-width="2"/>`;
}

function workspacePanel(x, y, width, height, title, kicker, content) {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${COLORS.panel}" stroke="${COLORS.line}" filter="url(#shadow)"/><text x="${x + 28}" y="${y + 42}" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(title)}</text><text x="${x + width - 28}" y="${y + 40}" text-anchor="end" fill="${COLORS.gold}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" letter-spacing="2">${escapeXml(kicker)}</text><line x1="${x + 28}" y1="${y + 62}" x2="${x + width - 28}" y2="${y + 62}" stroke="${COLORS.line}"/>${content}</g>`;
}

async function renderInterfaceSheet() {
  const width = 2400;
  const height = 1480;
  const panelWidth = 1138;
  const panelHeight = 610;
  const left = 48;
  const right = 1214;
  const top = 142;
  const bottom = 780;
  const parts = [`<text x="48" y="64" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="3">WORKSPACE CONTROLS</text><text x="50" y="100" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">The principal controls, reproduced from the live Excogitare interface.</text>`];

  const generate = [
    button(left + 28, top + 86, 150, "Generate", true), button(left + 190, top + 86, 120, "Edit"), button(left + 322, top + 86, 130, "Analyze"),
    field(left + 28, top + 166, 500, "Projection Type", "Polar centered"),
    `<text x="${left + 28}" y="${top + 252}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1">GENERATION ENGINE</text>`,
    button(left + 28, top + 270, 240, "Excogitare", true), button(left + 280, top + 270, 240, "Eccentric"), button(left + 532, top + 270, 240, "Physical"),
    field(left + 28, top + 348, 360, "Map type", "Fantastical Regions"), field(left + 408, top + 348, 270, "Map size", "Standard · 80×52"),
    `<text x="${left + 28}" y="${top + 455}" fill="${COLORS.text}" font-family="Arial" font-size="15">World shape</text><rect x="${left + 28}" y="${top + 474}" width="720" height="8" rx="4" fill="#16363c"/><rect x="${left + 28}" y="${top + 474}" width="390" height="8" rx="4" fill="${COLORS.gold}"/><circle cx="${left + 418}" cy="${top + 478}" r="10" fill="${COLORS.gold}"/>`,
  ].join("");
  parts.push(workspacePanel(left, top, panelWidth, panelHeight, "Create · Generate", "DETERMINISTIC", generate));

  const edit = [
    button(right + 28, top + 86, 150, "Tile brush", true), button(right + 190, top + 86, 140, "Flood fill"), button(right + 342, top + 86, 120, "Region"), button(right + 474, top + 86, 190, "World structure"), button(right + 676, top + 86, 160, "Starts"),
    field(right + 28, top + 170, 270, "Brush size", "7 hexes"), field(right + 318, top + 170, 330, "Terrain", "Grassland"),
    field(right + 28, top + 260, 270, "Elevation", "Hills"), field(right + 318, top + 260, 330, "Feature", "Forest"),
    field(right + 28, top + 350, 270, "Resource", "Iron"),
    `<g transform="translate(${right + 710} ${top + 184})"><polygon points="90,0 168,45 168,135 90,180 12,135 12,45" fill="#76955a" stroke="#d9b96f" stroke-width="5"/><polygon points="90,28 142,58 142,118 90,148 38,118 38,58" fill="#648449" stroke="#183438" stroke-width="3"/><circle cx="90" cy="88" r="12" fill="#f0cf75"/><text x="90" y="222" text-anchor="middle" fill="${COLORS.muted}" font-family="Arial" font-size="13">LIVE HEX PREVIEW</text></g>`,
    button(right + 28, top + 466, 190, "Undo"), button(right + 230, top + 466, 190, "Redo"),
  ].join("");
  parts.push(workspacePanel(right, top, panelWidth, panelHeight, "Create · Edit", "REVERSIBLE", edit));

  const repair = [
    button(left + 28, bottom + 86, 160, "safe"), button(left + 200, bottom + 86, 180, "standard", true), button(left + 392, bottom + 86, 190, "competitive"),
    button(left + 28, bottom + 148, 180, "original"), button(left + 220, bottom + 148, 190, "corrected", true), button(left + 422, bottom + 148, 180, "difference"),
    `<rect x="${left + 28}" y="${bottom + 228}" width="770" height="102" rx="8" fill="#0a1d22" stroke="#8c5448"/><circle cx="${left + 54}" cy="${bottom + 258}" r="9" fill="#c86f5d"/><text x="${left + 78}" y="${bottom + 260}" fill="${COLORS.cream}" font-family="Arial" font-size="16" font-weight="700">Illogical river network</text><text x="${left + 78}" y="${bottom + 288}" fill="${COLORS.muted}" font-family="Arial" font-size="13">Rebuild continuous mountain-to-water drainage.</text><text x="${left + 78}" y="${bottom + 312}" fill="#c28b79" font-family="Arial" font-size="11" letter-spacing="1">RIVERS · HIGH CONFIDENCE</text>`,
    `<rect x="${left + 28}" y="${bottom + 348}" width="770" height="102" rx="8" fill="#0a1d22" stroke="${COLORS.line}"/><circle cx="${left + 54}" cy="${bottom + 378}" r="9" fill="${COLORS.gold}"/><text x="${left + 78}" y="${bottom + 380}" fill="${COLORS.cream}" font-family="Arial" font-size="16" font-weight="700">Illegal resource placement</text><text x="${left + 78}" y="${bottom + 408}" fill="${COLORS.muted}" font-family="Arial" font-size="13">Relocate to a legal tile or remove it.</text>`,
    button(left + 28, bottom + 486, 250, "Apply selected (2)", true), button(left + 294, bottom + 486, 290, "Export repaired Civ5Map"),
  ].join("");
  parts.push(workspacePanel(left, bottom, panelWidth, panelHeight, "Repair", "LIVE CORRECTED PREVIEW", repair));

  const lua = [
    button(right + 28, bottom + 86, 160, "Explore"), button(right + 200, bottom + 86, 150, "Create"), button(right + 362, bottom + 86, 150, "Repair"), button(right + 524, bottom + 86, 130, "Lua", true),
    `<rect x="${right + 585}" y="${bottom + 74}" width="104" height="24" rx="4" fill="#9f3028" stroke="#e17e72"/><text x="${right + 637}" y="${bottom + 90}" text-anchor="middle" fill="#ffe3dd" font-family="Arial" font-size="9" font-weight="700" letter-spacing="1">EXPERIMENTAL</text>`,
    `<rect x="${right + 130}" y="${bottom + 174}" width="820" height="314" rx="12" fill="#0a2025" stroke="#b95b50" filter="url(#shadow)"/><text x="${right + 170}" y="${bottom + 218}" fill="#df7c70" font-family="Arial" font-size="11" font-weight="700" letter-spacing="2">EXPERIMENTAL WORKSPACE</text><text x="${right + 170}" y="${bottom + 264}" fill="${COLORS.cream}" font-family="Arial" font-size="28" font-weight="700">The Lua workspace is incomplete</text><text x="${right + 170}" y="${bottom + 308}" fill="${COLORS.text}" font-family="Arial" font-size="15">Many Civ V scripts depend on engine APIs that Excogitare</text><text x="${right + 170}" y="${bottom + 332}" fill="${COLORS.text}" font-family="Arial" font-size="15">does not yet reproduce. Generation may fail or be incomplete.</text>${button(right + 170, bottom + 392, 180, "Stay here")}${button(right + 370, bottom + 392, 270, "Open experimental Lua", false, true)}`,
  ].join("");
  parts.push(workspacePanel(right, bottom, panelWidth, panelHeight, "Lua entry", "EXPLICIT WARNING", lua));

  await writePng("workspace-controls.png", svgShell(width, height, parts.join("")));
}

function toggle(x, y, label, detail, active = true) {
  return `<text x="${x}" y="${y}" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700">${escapeXml(label)}</text><text x="${x}" y="${y + 22}" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="12">${escapeXml(detail)}</text><rect x="${x + 420}" y="${y - 18}" width="54" height="28" rx="14" fill="${active ? COLORS.gold : "#18343a"}" stroke="${active ? "#eed48f" : COLORS.line}"/><circle cx="${x + (active ? 461 : 433)}" cy="${y - 4}" r="10" fill="${active ? "#fff1c8" : "#6f8580"}"/>`;
}

function workflowRow(x, y, width, title, detail, badge = "+") {
  return `<rect x="${x}" y="${y}" width="${width}" height="74" rx="8" fill="#0a1f24" stroke="${COLORS.line}"/><text x="${x + 20}" y="${y + 30}" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">${escapeXml(title)}</text><text x="${x + 20}" y="${y + 52}" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="12">${escapeXml(detail)}</text><text x="${x + width - 24}" y="${y + 43}" text-anchor="middle" fill="${COLORS.gold}" font-family="Arial, Helvetica, sans-serif" font-size="20">${escapeXml(badge)}</text>`;
}

async function renderCreateWorkflowSheet() {
  const width = 2400;
  const height = 1040;
  const top = 142;
  const panelWidth = 748;
  const panelHeight = 840;
  const x1 = 48;
  const x2 = 826;
  const x3 = 1604;
  const parts = [`<text x="48" y="64" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="3">CREATE WORKFLOW</text><text x="50" y="100" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">Design a recipe, revisit its generations, and learn dense controls without surrendering the map.</text>`];

  const design = [
    `<text x="${x1 + 28}" y="${top + 98}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">GENERATION ENGINE · 1 / 4</text>`,
    button(x1 + 28, top + 120, 44, "‹"), button(x1 + 648, top + 120, 44, "›"),
    `<rect x="${x1 + 88}" y="${top + 112}" width="544" height="126" rx="10" fill="#102f35" stroke="${COLORS.gold}"/><text x="${x1 + 112}" y="${top + 150}" fill="${COLORS.cream}" font-family="Georgia, serif" font-size="25" font-weight="700">Excogitare</text><text x="${x1 + 112}" y="${top + 182}" fill="${COLORS.text}" font-family="Arial" font-size="14">Warped fields, expressive landforms, and the</text><text x="${x1 + 112}" y="${top + 204}" fill="${COLORS.text}" font-family="Arial" font-size="14">widest stylistic range.</text>`,
    `<text x="${x1 + 28}" y="${top + 278}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">WORLD CHARACTER</text>`,
    button(x1 + 28, top + 296, 150, "Realistic"), button(x1 + 188, top + 296, 150, "Fantastical", true), button(x1 + 348, top + 296, 150, "Mundane"), button(x1 + 508, top + 296, 150, "Brutal"),
    field(x1 + 28, top + 370, 320, "Map type", "Fantastical Regions"), field(x1 + 370, top + 370, 322, "Map size", "Standard · 80×52"),
    field(x1 + 28, top + 458, 664, "Seed", "readme-world-031"),
    workflowRow(x1 + 28, top + 548, 664, "World shape", "East / west wrap · 48% water · Standard geometry", "1"),
    workflowRow(x1 + 28, top + 632, 664, "Climate and terrain", "Temperate · Normal rainfall · Lawless climate logic", "2"),
    button(x1 + 28, top + 730, 664, "Generate map", true),
  ].join("");
  parts.push(workspacePanel(x1, top, panelWidth, panelHeight, "Design", "START WITH A RECIPE", design));

  const iterate = [
    workflowRow(x2 + 28, top + 92, 692, "Generation history", "12 / 30 saved · reopen any exact snapshot", "12"),
    `<text x="${x2 + 28}" y="${top + 210}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">SELECTIVE REGENERATION</text>`,
    button(x2 + 28, top + 230, 126, "World"), button(x2 + 166, top + 230, 126, "Climate"), button(x2 + 304, top + 230, 126, "Rivers", true), button(x2 + 442, top + 230, 126, "Content"), button(x2 + 580, top + 230, 140, "Starts"),
    `<rect x="${x2 + 28}" y="${top + 298}" width="692" height="132" rx="10" fill="#0a1f24" stroke="${COLORS.line}"/><text x="${x2 + 50}" y="${top + 332}" fill="${COLORS.cream}" font-family="Arial" font-size="16" font-weight="700">Candidate batch</text><text x="${x2 + 50}" y="${top + 356}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Generate related seeds, validate them, and rank balance.</text>${button(x2 + 50, top + 374, 136, "4 quick")}${button(x2 + 198, top + 374, 156, "8 standard", true)}${button(x2 + 366, top + 374, 160, "12 thorough")}${button(x2 + 538, top + 374, 160, "20 tournament")}`,
    workflowRow(x2 + 28, top + 452, 692, "Gran Pulse · before rivers", "Checkpoint · compare against the current map", "↗"),
    workflowRow(x2 + 28, top + 538, 692, "Seed 031 · balance 84", "Candidate · strong strategic access", "1"),
    workflowRow(x2 + 28, top + 624, 692, "Seed 044 · balance 79", "Candidate · better coastal distribution", "2"),
    button(x2 + 28, top + 730, 220, "Restore selected"), button(x2 + 262, top + 730, 220, "Compare difference", true),
  ].join("");
  parts.push(workspacePanel(x2, top, panelWidth, panelHeight, "Iterate", "REVISIT, COMPARE, REFINE", iterate));

  const help = [
    `<rect x="${x3 + 28}" y="${top + 92}" width="692" height="98" rx="10" fill="#101f22" stroke="${COLORS.gold}" filter="url(#shadow)"/><text x="${x3 + 50}" y="${top + 124}" fill="${COLORS.gold}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">CONTEXTUAL HELP</text><text x="${x3 + 50}" y="${top + 152}" fill="${COLORS.cream}" font-family="Arial" font-size="15">Design a generated world, iterate on it, edit tiles and</text><text x="${x3 + 50}" y="${top + 174}" fill="${COLORS.cream}" font-family="Arial" font-size="15">structures, then review balance and validity.</text>`,
    `<path d="M ${x3 + 130} ${top + 190} L ${x3 + 170} ${top + 236} L ${x3 + 210} ${top + 190}" fill="#101f22" stroke="${COLORS.gold}"/>`,
    button(x3 + 28, top + 238, 156, "Design", true), button(x3 + 196, top + 238, 156, "Iterate"), button(x3 + 364, top + 238, 156, "Edit"), button(x3 + 532, top + 238, 156, "Review"),
    `<text x="${x3 + 28}" y="${top + 346}" fill="${COLORS.cream}" font-family="Georgia, serif" font-size="26" font-weight="700">Help where it is needed</text><text x="${x3 + 28}" y="${top + 382}" fill="${COLORS.text}" font-family="Arial" font-size="14">Hover and keyboard focus explain consequences,</text><text x="${x3 + 28}" y="${top + 406}" fill="${COLORS.text}" font-family="Arial" font-size="14">scope, and risk without expanding every control.</text>`,
    workflowRow(x3 + 28, top + 448, 692, "World modifier · Strategic Depth", "Adds long ranges, narrow passes, and defended basins", "?"),
    workflowRow(x3 + 28, top + 534, 692, "Show game-breaking geometry", "Reveals Needle, Ribbon, Pin, and String after confirmation", "!"),
    workflowRow(x3 + 28, top + 620, 692, "Export Civ5Map", "Validates first; material problems require confirmation", "?"),
    `<text x="${x3 + 28}" y="${top + 766}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Touch devices omit the tooltip layer.</text>`,
  ].join("");
  parts.push(workspacePanel(x3, top, panelWidth, panelHeight, "Guidance", "HOVER + KEYBOARD FOCUS", help));

  await writePng("create-workflow.png", svgShell(width, height, parts.join("")));
}

async function renderExploreSheet() {
  const width = 2400;
  const height = 1080;
  const top = 142;
  const panelHeight = 880;
  const map = makePresetMap(MAP_PRESETS.find((preset) => preset.id === "LIVING_WORLD"));
  const parts = [`<text x="48" y="64" fill="${COLORS.cream}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" letter-spacing="3">EXPLORE + MAP LEGEND</text><text x="50" y="100" fill="${COLORS.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17">Inspection remains detailed; the legend makes the renderer's compressed iconography legible.</text>`];

  const sidebarX = 48;
  const sidebarWidth = 560;
  const sidebar = [
    `<text x="${sidebarX + 28}" y="${top + 104}" fill="${COLORS.gold}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">IMPORTED MAP</text><text x="${sidebarX + 28}" y="${top + 146}" fill="${COLORS.cream}" font-family="Georgia, serif" font-size="26" font-weight="700">The Twin Continents</text><text x="${sidebarX + 28}" y="${top + 176}" fill="${COLORS.muted}" font-family="Arial" font-size="13">A map remains inspectable while it is rendered.</text>`,
    field(sidebarX + 28, top + 220, 236, "Dimensions", "80 × 52"), field(sidebarX + 280, top + 220, 236, "Wrap", "East / west"),
    `<text x="${sidebarX + 28}" y="${top + 326}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">LAYERS · 5 ON</text>`,
    toggle(sidebarX + 28, top + 366, "Political", "Projected start influence", false),
    toggle(sidebarX + 28, top + 430, "Hex grid", "Map geometry"),
    toggle(sidebarX + 28, top + 494, "Features", "Forest, jungle, ice"),
    toggle(sidebarX + 28, top + 558, "Resources", "Bonus and strategic"),
    toggle(sidebarX + 28, top + 622, "Elevation", "Hills and mountains"),
    toggle(sidebarX + 28, top + 686, "Start locations", "8 major positions"),
    `<text x="${sidebarX + 28}" y="${top + 786}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">TERRAIN CENSUS</text><text x="${sidebarX + 28}" y="${top + 816}" fill="${COLORS.text}" font-family="Arial" font-size="13">Ocean 1,964 · Coast 508 · Grassland 644</text>`,
  ].join("");
  parts.push(workspacePanel(sidebarX, top, sidebarWidth, panelHeight, "Explore", "MAP FACTS + LAYERS", sidebar));

  const mapX = 632;
  const mapWidth = 1112;
  parts.push(`<g><rect x="${mapX}" y="${top}" width="${mapWidth}" height="${panelHeight}" rx="18" fill="#081b20" stroke="${COLORS.line}" filter="url(#shadow)"/><text x="${mapX + 28}" y="${top + 42}" fill="${COLORS.cream}" font-family="Arial" font-size="18" font-weight="700">Live renderer</text><text x="${mapX + mapWidth - 28}" y="${top + 40}" text-anchor="end" fill="${COLORS.gold}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">FIT · ISO 3D · DISPLAY · LEGEND</text>${renderMap(map, { x: mapX + 28, y: top + 82, width: mapWidth - 56, height: panelHeight - 134 })}<text x="${mapX + mapWidth / 2}" y="${top + panelHeight - 24}" text-anchor="middle" fill="${COLORS.muted}" font-family="Arial" font-size="12">Drag to pan · Scroll to zoom · Hover for tile data</text></g>`);

  const legendX = 1768;
  const legendWidth = 584;
  const swatch = (x, y, color, label) => `<rect x="${x}" y="${y - 14}" width="20" height="20" rx="3" fill="${color}" stroke="#9cafaa" stroke-opacity=".3"/><text x="${x + 34}" y="${y + 1}" fill="${COLORS.text}" font-family="Arial" font-size="13">${escapeXml(label)}</text>`;
  const legend = [
    `<text x="${legendX + 28}" y="${top + 102}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">TERRAIN COLOR</text>`,
    swatch(legendX + 28, top + 138, TERRAIN_COLORS.OCEAN, "Ocean"), swatch(legendX + 290, top + 138, TERRAIN_COLORS.COAST, "Coast"),
    swatch(legendX + 28, top + 174, TERRAIN_COLORS.GRASS, "Grass"), swatch(legendX + 290, top + 174, TERRAIN_COLORS.PLAINS, "Plains"),
    swatch(legendX + 28, top + 210, TERRAIN_COLORS.DESERT, "Desert"), swatch(legendX + 290, top + 210, TERRAIN_COLORS.TUNDRA, "Tundra"),
    `<line x1="${legendX + 28}" y1="${top + 250}" x2="${legendX + legendWidth - 28}" y2="${top + 250}" stroke="${COLORS.line}"/><text x="${legendX + 28}" y="${top + 288}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">RELIEF + WATERWAYS</text><text x="${legendX + 40}" y="${top + 332}" fill="${COLORS.gold}" font-family="Arial" font-size="28">▲</text><text x="${legendX + 82}" y="${top + 324}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">Mountain</text><text x="${legendX + 82}" y="${top + 344}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Pale or snow-capped peak</text><path d="M ${legendX + 300} ${top + 326} q 22 -18 44 0 t 44 0" fill="none" stroke="#75c5db" stroke-width="5"/><text x="${legendX + 404}" y="${top + 324}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">River</text><text x="${legendX + 404}" y="${top + 344}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Blue line on hex edges</text>`,
    `<line x1="${legendX + 28}" y1="${top + 382}" x2="${legendX + legendWidth - 28}" y2="${top + 382}" stroke="${COLORS.line}"/><text x="${legendX + 28}" y="${top + 420}" fill="${COLORS.muted}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5">MAP SYMBOLS</text>`,
    `<circle cx="${legendX + 46}" cy="${top + 462}" r="13" fill="${COLORS.gold}"/><text x="${legendX + 42}" y="${top + 467}" fill="#102326" font-family="Arial" font-size="12" font-weight="700">1</text><text x="${legendX + 78}" y="${top + 458}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">Major start</text><text x="${legendX + 78}" y="${top + 478}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Gold numbered marker</text>`,
    `<circle cx="${legendX + 46}" cy="${top + 522}" r="16" fill="#a8c8d0"/><text x="${legendX + 37}" y="${top + 527}" fill="#102326" font-family="Arial" font-size="10" font-weight="700">CS</text><text x="${legendX + 78}" y="${top + 518}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">City-state start</text><text x="${legendX + 78}" y="${top + 538}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Blue CS marker</text>`,
    `<text x="${legendX + 32}" y="${top + 586}" fill="${COLORS.gold}" font-family="Arial" font-size="26">★</text><text x="${legendX + 78}" y="${top + 578}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">Natural wonder</text><text x="${legendX + 78}" y="${top + 598}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Gold star</text>`,
    `<rect x="${legendX + 30}" y="${top + 630}" width="32" height="24" fill="#b65f88" stroke="#efbad2"/><text x="${legendX + 78}" y="${top + 642}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">Political territory</text><text x="${legendX + 78}" y="${top + 662}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Civilization colour with border</text>`,
    `<circle cx="${legendX + 46}" cy="${top + 712}" r="12" fill="#f0cf75" stroke="#102326" stroke-width="3"/><text x="${legendX + 78}" y="${top + 708}" fill="${COLORS.cream}" font-family="Arial" font-size="14" font-weight="700">Resource</text><text x="${legendX + 78}" y="${top + 728}" fill="${COLORS.muted}" font-family="Arial" font-size="12">Type-coloured centre</text>`,
    `<rect x="${legendX + 28}" y="${top + 770}" width="528" height="66" rx="8" fill="#102d33" stroke="${COLORS.gold}"/><text x="${legendX + 48}" y="${top + 798}" fill="${COLORS.gold}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.4">DISPLAY IS NOT EDITING</text><text x="${legendX + 48}" y="${top + 820}" fill="${COLORS.text}" font-family="Arial" font-size="12">Layer switches hide marks; they do not delete map data.</text>`,
  ].join("");
  parts.push(workspacePanel(legendX, top, legendWidth, panelHeight, "Legend", "ICONOGRAPHY", legend));

  await writePng("explore-and-legend.png", svgShell(width, height, parts.join("")));
}

async function writePng(fileName, svg) {
  const output = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 100 }).toBuffer();
  await writeFile(resolve("public/readme", fileName), output);
  console.log(`${fileName}: ${(output.byteLength / 1024).toFixed(0)} KiB`);
}

await mkdir(resolve("public/readme"), { recursive: true });
await renderPresetSheet("excogitare-presets.png", "EXCOGITARE PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "EXCOGITARE"), 2);
await renderPresetSheet("eccentric-presets.png", "ECCENTRIC PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "ECCENTRIC"), 2);
await renderPresetSheet("physical-presets.png", "PHYSICAL PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL"), 4);
await renderPresetSheet("polis-presets.png", "POLIS PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "POLIS"), 2);
await renderProjectionSheet();
await renderInterfaceSheet();
await renderCreateWorkflowSheet();
await renderExploreSheet();
