import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CLIMATE_PROJECTIONS } from "../lib/climate-projection.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, MAP_PRESETS } from "../lib/map-generator.ts";

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
  return engine === "REGION_GRAPH" ? "REGION-GRAPH" : engine;
}

function makePresetMap(preset, projectionType = "NORTH_SOUTH") {
  const style = preset.engine === "PHYSICAL" ? "REALISTIC" : preset.id === "MYTHIC_REGIONS" ? "FANTASTICAL" : preset.engine === "REGION_GRAPH" ? "REALISTIC" : "FANTASTICAL";
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
    button(left + 28, top + 270, 240, "Excogitare", true), button(left + 280, top + 270, 240, "Region-Graph"), button(left + 532, top + 270, 240, "Physical"),
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

async function writePng(fileName, svg) {
  const output = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 100 }).toBuffer();
  await writeFile(resolve("public/readme", fileName), output);
  console.log(`${fileName}: ${(output.byteLength / 1024).toFixed(0)} KiB`);
}

await mkdir(resolve("public/readme"), { recursive: true });
await renderPresetSheet("excogitare-presets.png", "EXCOGITARE PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "EXCOGITARE"), 2);
await renderPresetSheet("region-graph-presets.png", "REGION-GRAPH PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "REGION_GRAPH"), 2);
await renderPresetSheet("physical-presets.png", "PHYSICAL PRESETS", MAP_PRESETS.filter((preset) => preset.engine === "PHYSICAL"), 3);
await renderProjectionSheet();
await renderInterfaceSheet();
