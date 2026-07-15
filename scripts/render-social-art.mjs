import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";

const WIDTH = 2400;
const HEIGHT = 1260;
const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const PROJECTION = { a: 0.86, b: 0.25, c: -0.52, d: 0.38 };
const TERRAIN_COLORS = {
  OCEAN: "#183d50",
  COAST: "#2e7180",
  GRASS: "#76955a",
  PLAINS: "#ae9656",
  DESERT: "#c9a963",
  TUNDRA: "#7d8d83",
  SNOW: "#d7dfdc",
};

const options = {
  ...DEFAULT_GENERATION_OPTIONS,
  size: "SMALL",
  seed: "excogitare-social-isometric",
  preset: "WILD_REGIONS",
  style: "FANTASTICAL",
  modifier: "STRATEGIC_DEPTH",
  waterPercent: 54,
  mountainPercent: 21,
  rainfall: "WET",
  startQuality: "LEGENDARY",
  wonderCount: 6,
};
const map = generateMap(options);

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function terrainColor(name) {
  const key = Object.keys(TERRAIN_COLORS).find((candidate) => name?.includes(candidate));
  return key ? TERRAIN_COLORS[key] : "#6f8068";
}

function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (channel) => Math.max(0, Math.min(255, channel + amount));
  return `rgb(${clamp(value >> 16)}, ${clamp((value >> 8) & 0xff)}, ${clamp(value & 0xff)})`;
}

function worldCenter(col, displayRow, sourceRow) {
  return {
    x: MAP_MARGIN + HEX_WIDTH / 2 + HEX_WIDTH * (col + (sourceRow % 2 ? 0.5 : 0)),
    y: MAP_MARGIN + HEX_RADIUS + displayRow * HEX_RADIUS * 1.5,
  };
}

function reliefHeight(tile) {
  if (tile.terrain < 2) return 0;
  return tile.elevation === 2 ? 24 : tile.elevation === 1 ? 10 : 0;
}

function lift(point, height) {
  if (!height) return point;
  const determinant = PROJECTION.a * PROJECTION.d - PROJECTION.b * PROJECTION.c;
  return {
    x: point.x + (PROJECTION.c * height) / determinant,
    y: point.y - (PROJECTION.a * height) / determinant,
  };
}

function project(point) {
  return {
    x: PROJECTION.a * point.x + PROJECTION.c * point.y,
    y: PROJECTION.b * point.x + PROJECTION.d * point.y,
  };
}

function worldHex(center) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: center.x + HEX_RADIUS * Math.cos(angle), y: center.y + HEX_RADIUS * Math.sin(angle) };
  });
}

const tiles = [];
for (let displayRow = 0; displayRow < map.height; displayRow += 1) {
  const sourceRow = map.height - 1 - displayRow;
  for (let col = 0; col < map.width; col += 1) {
    const tile = map.tiles[sourceRow * map.width + col];
    const baseCenter = worldCenter(col, displayRow, sourceRow);
    const topCenter = lift(baseCenter, reliefHeight(tile));
    tiles.push({ col, displayRow, sourceRow, tile, baseCenter, topCenter, projected: project(topCenter) });
  }
}
tiles.sort((one, two) => one.projected.y - two.projected.y || one.projected.x - two.projected.x);

const projectedPoints = tiles.flatMap(({ baseCenter, topCenter }) => [...worldHex(baseCenter), ...worldHex(topCenter)].map(project));
const minX = Math.min(...projectedPoints.map((point) => point.x));
const maxX = Math.max(...projectedPoints.map((point) => point.x));
const minY = Math.min(...projectedPoints.map((point) => point.y));
const maxY = Math.max(...projectedPoints.map((point) => point.y));
// Render the genuine map larger than the card, then reveal only a narrow crop.
// The social card remains a brand object first and a renderer specimen second.
const frame = { x: 1080, y: -250, width: 2620, height: 1780 };
const scale = Math.min(frame.width / (maxX - minX), frame.height / (maxY - minY));
const offsetX = frame.x + (frame.width - (maxX - minX) * scale) / 2 - minX * scale;
const offsetY = frame.y + (frame.height - (maxY - minY) * scale) / 2 - minY * scale;

function screen(point) {
  const projected = project(point);
  return { x: projected.x * scale + offsetX, y: projected.y * scale + offsetY };
}

function points(pointsToDraw) {
  return pointsToDraw.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function line(one, two, attributes) {
  return `<line x1="${one.x.toFixed(2)}" y1="${one.y.toFixed(2)}" x2="${two.x.toFixed(2)}" y2="${two.y.toFixed(2)}" ${attributes}/>`;
}

function resourceColor(name) {
  if (name.includes("GOLD")) return "#f4cf5d";
  if (name.includes("IRON")) return "#83909a";
  if (name.includes("FISH") || name.includes("WHALE") || name.includes("PEARLS")) return "#72b5d1";
  if (name.includes("WHEAT")) return "#e8bd63";
  if (name.includes("DEER") || name.includes("CATTLE") || name.includes("SHEEP")) return "#a8764d";
  if (name.includes("GEMS")) return "#9ed5c7";
  return "#e8d7a3";
}

function renderFeature(name, center) {
  const radius = HEX_RADIUS * scale;
  if (name.includes("FOREST")) {
    return [-0.36, 0, 0.36].map((dx) => {
      const x = center.x + dx * radius;
      return `<polygon points="${x},${center.y - radius * 0.47} ${x - radius * 0.23},${center.y + radius * 0.2} ${x + radius * 0.23},${center.y + radius * 0.2}" fill="#19412b" fill-opacity=".82"/>`;
    }).join("");
  }
  if (name.includes("JUNGLE")) {
    return [[-0.3, -0.08], [0.08, -0.22], [0.34, 0.12], [-0.1, 0.26]].map(([dx, dy]) =>
      `<circle cx="${center.x + dx * radius}" cy="${center.y + dy * radius}" r="${radius * 0.23}" fill="#165334" fill-opacity=".86"/>`).join("");
  }
  if (name.includes("MARSH")) {
    return [-0.32, 0, 0.32].map((dx) => {
      const x = center.x + dx * radius;
      return `<path d="M ${x} ${center.y + radius * 0.34} Q ${x - radius * 0.18} ${center.y} ${x + radius * 0.05} ${center.y - radius * 0.36}" fill="none" stroke="#2b5241" stroke-width="${Math.max(1.2, scale * 1.6)}" stroke-linecap="round"/>`;
    }).join("");
  }
  if (name.includes("ICE")) {
    return `<polygon points="${center.x - radius * 0.5},${center.y + radius * 0.3} ${center.x - radius * 0.18},${center.y - radius * 0.46} ${center.x + radius * 0.04},${center.y - radius * 0.1} ${center.x + radius * 0.32},${center.y - radius * 0.48} ${center.x + radius * 0.52},${center.y + radius * 0.3}" fill="#e8f4f2" fill-opacity=".74"/>`;
  }
  return "";
}

function renderRelief(tile, center) {
  if (!tile.elevation) return "";
  const radius = HEX_RADIUS * scale;
  const mountain = tile.elevation === 2;
  const peak = { x: center.x - radius * 0.18, y: center.y - radius * (mountain ? 1.02 : 0.45) };
  const left = { x: center.x - radius * (mountain ? 0.54 : 0.42), y: center.y + radius * 0.34 };
  const right = { x: center.x + radius * (mountain ? 0.56 : 0.46), y: center.y + radius * 0.34 };
  const back = { x: center.x, y: center.y - radius * (mountain ? 0.4 : 0.25) };
  let output = `<polygon points="${points([back, peak, left])}" fill="${mountain ? "#353733" : "#484535"}" fill-opacity="${mountain ? ".96" : ".62"}"/>`;
  output += `<polygon points="${points([back, right, peak])}" fill="${mountain ? "#7e7a6b" : "#85774b"}" fill-opacity="${mountain ? ".97" : ".58"}"/>`;
  output += `<polygon points="${points([left, peak, right])}" fill="${mountain ? "#5b584c" : "#655b3f"}" fill-opacity="${mountain ? ".96" : ".54"}"/>`;
  if (mountain) {
    const snowLeft = { x: peak.x + (left.x - peak.x) * 0.28, y: peak.y + (left.y - peak.y) * 0.28 };
    const snowRight = { x: peak.x + (right.x - peak.x) * 0.28, y: peak.y + (right.y - peak.y) * 0.28 };
    output += `<polygon points="${points([peak, snowLeft, snowRight])}" fill="#ebebdc" fill-opacity=".92"/>`;
  }
  return output;
}

const tileMarkup = [];
for (const { tile, baseCenter, topCenter } of tiles) {
  const terrainName = map.terrains[tile.terrain] ?? "";
  const baseColor = terrainColor(terrainName);
  const baseHex = worldHex(baseCenter).map(screen);
  const topHex = worldHex(topCenter).map(screen);
  const topCenterScreen = screen(topCenter);

  if (reliefHeight(tile)) {
    for (let index = 0; index < 6; index += 1) {
      const next = (index + 1) % 6;
      const midpoint = { x: (topHex[index].x + topHex[next].x) / 2, y: (topHex[index].y + topHex[next].y) / 2 };
      if (midpoint.y < topCenterScreen.y - 0.1) continue;
      tileMarkup.push(`<polygon points="${points([topHex[index], topHex[next], baseHex[next], baseHex[index]])}" fill="${shade(baseColor, midpoint.x < topCenterScreen.x ? -55 : -38)}" stroke="#051114" stroke-opacity=".28" stroke-width=".75"/>`);
    }
  }

  const fill = reliefHeight(tile) ? shade(baseColor, tile.elevation === 2 ? -12 : -5) : baseColor;
  tileMarkup.push(`<polygon points="${points(topHex)}" fill="${fill}" stroke="#061619" stroke-opacity=".42" stroke-width="${Math.max(0.6, scale * 0.75)}"/>`);

  if (tile.feature !== 255) tileMarkup.push(renderFeature(map.features[tile.feature] ?? "", topCenterScreen));
  tileMarkup.push(renderRelief(tile, topCenterScreen));

  if (tile.river & 7) {
    const edges = [[4, 5, 1], [3, 4, 2], [2, 3, 4]];
    for (const [start, end, bit] of edges) {
      if (!(tile.river & bit)) continue;
      tileMarkup.push(line(topHex[start], topHex[end], `stroke="#5bb9d3" stroke-opacity=".96" stroke-width="${Math.max(1.8, scale * 2.4)}" stroke-linecap="round"`));
      tileMarkup.push(line(topHex[start], topHex[end], `stroke="#b8e6e9" stroke-opacity=".46" stroke-width="${Math.max(0.5, scale * 0.7)}" stroke-linecap="round"`));
    }
  }

  if (tile.resource !== 255) {
    const resource = map.resources[tile.resource] ?? "RESOURCE";
    const outer = Math.max(3.2, scale * 6.3);
    const inner = Math.max(1.9, scale * 3.8);
    tileMarkup.push(`<circle cx="${topCenterScreen.x}" cy="${topCenterScreen.y}" r="${outer}" fill="#0d1a1b" fill-opacity=".86"/><circle cx="${topCenterScreen.x}" cy="${topCenterScreen.y}" r="${inner}" fill="${resourceColor(resource)}"/>`);
  }

  if (tile.wonder !== 255) {
    const outer = Math.max(5, scale * 9);
    const inner = outer * 0.45;
    const star = Array.from({ length: 10 }, (_, point) => {
      const radius = point % 2 ? inner : outer;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      return { x: topCenterScreen.x + Math.cos(angle) * radius, y: topCenterScreen.y + Math.sin(angle) * radius };
    });
    tileMarkup.push(`<polygon points="${points(star)}" fill="#f2d17f" stroke="#142322" stroke-width="1.4"/>`);
  }

  if (tile.improvement === "IMPROVEMENT_GOODY_HUT") {
    tileMarkup.push(`<rect x="${topCenterScreen.x - 4}" y="${topCenterScreen.y - 2}" width="8" height="7" rx="1" fill="#d8c08a" stroke="#4d493a"/><path d="M ${topCenterScreen.x - 6} ${topCenterScreen.y - 2} L ${topCenterScreen.x} ${topCenterScreen.y - 8} L ${topCenterScreen.x + 6} ${topCenterScreen.y - 2} Z" fill="#d8c08a" stroke="#4d493a"/>`);
  }
}

const startsMarkup = map.startLocations.map((start) => {
  const tile = map.tiles[start.y * map.width + start.x];
  const base = worldCenter(start.x, map.height - 1 - start.y, start.y);
  const center = screen(lift(base, reliefHeight(tile) + 5));
  const color = start.cityState ? "#78c7d6" : "#f1d183";
  const radius = start.cityState ? 7 : 10;
  return `<g filter="url(#markerShadow)"><circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="#10242b" fill-opacity=".9" stroke="${color}" stroke-width="3"/><circle cx="${center.x}" cy="${center.y}" r="${start.cityState ? 2.4 : 3.4}" fill="${color}"/></g>`;
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06161b"/><stop offset=".58" stop-color="#0b242a"/><stop offset="1" stop-color="#0e2e34"/></linearGradient>
    <radialGradient id="mapGlow" cx="76%" cy="44%" r="62%"><stop offset="0" stop-color="#8ec2b2" stop-opacity=".22"/><stop offset="1" stop-color="#8ec2b2" stop-opacity="0"/></radialGradient>
    <linearGradient id="sliceShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06161b" stop-opacity=".35"/><stop offset=".18" stop-color="#06161b" stop-opacity="0"/><stop offset="1" stop-color="#06161b" stop-opacity=".08"/></linearGradient>
    <pattern id="quietGrid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M 72 0 L 0 0 0 72" fill="none" stroke="#86a7a0" stroke-opacity=".035" stroke-width="1"/></pattern>
    <clipPath id="mapSlice"><path d="M 1788 0 H 2400 V 1260 H 1978 Z"/></clipPath>
    <filter id="mapShadow" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="markerShadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#051014" flood-opacity=".75"/></filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#quietGrid)"/>
  <g clip-path="url(#mapSlice)">
    <rect x="1720" width="680" height="${HEIGHT}" fill="#12363d"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#mapGlow)"/>
    <ellipse cx="2290" cy="1120" rx="780" ry="116" fill="#020b0e" fill-opacity=".55" filter="url(#mapShadow)"/>
    <g>${tileMarkup.join("")}${startsMarkup}</g>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sliceShade)"/>
  </g>
  <path d="M 1788 0 L 1978 1260" fill="none" stroke="#d9b96f" stroke-opacity=".78" stroke-width="4"/>
  <path d="M 1770 0 L 1960 1260" fill="none" stroke="#8bb3a7" stroke-opacity=".14" stroke-width="1"/>

  <g transform="translate(118 112)">
    <path d="M 0 0 H 86" stroke="#d9b96f" stroke-width="8"/>
    <text x="0" y="126" fill="#f3eee3" font-family="Arial, Helvetica, sans-serif" font-size="112" font-weight="700" letter-spacing="9">EXCOGITARE</text>
    <text x="3" y="190" fill="#d9b96f" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="6">CIVILIZATION V MAP VIEWER &amp; EDITOR</text>

    <text x="0" y="408" fill="#dce7e3" font-family="Arial, Helvetica, sans-serif" font-size="66" font-weight="400" letter-spacing="1">SEE THE WORLD.</text>
    <text x="0" y="492" fill="#dce7e3" font-family="Arial, Helvetica, sans-serif" font-size="66" font-weight="700" letter-spacing="1">THEN CHANGE IT.</text>
    <text x="3" y="568" fill="#92aaa5" font-family="Arial, Helvetica, sans-serif" font-size="26">Generate, inspect, repair, and export Civilization V maps.</text>

    <g transform="translate(2 664)">
      <rect width="188" height="48" rx="24" fill="#d9b96f" fill-opacity=".11" stroke="#d9b96f" stroke-opacity=".58"/>
      <text x="94" y="32" text-anchor="middle" fill="#ead69f" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="2">BROWSER-NATIVE</text>
      <rect x="208" width="184" height="48" rx="24" fill="#76a788" fill-opacity=".1" stroke="#86b89b" stroke-opacity=".46"/>
      <text x="300" y="32" text-anchor="middle" fill="#b7d5c0" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="2">DETERMINISTIC</text>
      <rect x="412" width="146" height="48" rx="24" fill="#76a788" fill-opacity=".1" stroke="#86b89b" stroke-opacity=".46"/>
      <text x="485" y="32" text-anchor="middle" fill="#b7d5c0" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="2">CIV5MAP</text>
    </g>

    <g transform="translate(2 982)">
      <text x="0" y="0" fill="#738e88" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="3">REAL EXCOGITARE RENDER</text>
      <text x="0" y="38" fill="#56716c" font-family="Arial, Helvetica, sans-serif" font-size="16" letter-spacing="1">${escapeXml(map.width)} × ${escapeXml(map.height)} · FANTASTICAL · STRATEGIC DEPTH</text>
    </g>
  </g>
</svg>`;

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch (error) {
  if (!process.env.SHARP_MODULE) {
    throw new Error("Rendering PNG artwork requires sharp. Set SHARP_MODULE to an installed sharp package directory.", { cause: error });
  }
  sharp = require(process.env.SHARP_MODULE);
}

const output = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 100 }).toBuffer();
const editorPath = resolve("public/og-editor.png");
const fallbackPath = resolve("public/og.png");
await Promise.all([writeFile(editorPath, output), writeFile(fallbackPath, output)]);
console.log(`Rendered ${map.name} as ${WIDTH}×${HEIGHT} social artwork (${(output.byteLength / 1024).toFixed(0)} KiB).`);
