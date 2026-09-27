import type { World } from "./model.ts";
import { tileCenter, type Layers, type Size, type View } from "./renderer.ts";
import { adjacentCoordinates } from "../civ5-rules.ts";

const colors = { OCEAN: "#83aab3", COAST: "#bfd3d0", GRASS: "#c1cca9", PLAINS: "#d9d1aa", DESERT: "#e8d6b1", TUNDRA: "#c5c7b3", SNOW: "#e6e6d9" };
const vertices = Array.from({ length: 6 }, (_, side) => { const angle = (side * 60 - 90) * Math.PI / 180; return [Math.cos(angle) * 20, Math.sin(angle) * 20]; });
function hex(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath(); vertices.forEach(([dx, dy], i) => { if (i) ctx.lineTo(x + dx, y + dy); else ctx.moveTo(x + dx, y + dy); }); ctx.closePath();
}
function peak(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath(); ctx.moveTo(x - size, y + size * .6); ctx.lineTo(x, y - size); ctx.lineTo(x + size, y + size * .6); ctx.closePath(); ctx.fill();
}
/** Flat cartography is independent of the legacy isometric renderer. Each mark
 * expresses a stored Civ V channel; display styling never changes geography. */
export function drawAtlas(ctx: CanvasRenderingContext2D, world: World, layers: Layers, view: View, size: Size, ratio: number, selected: readonly number[], differences: readonly number[]) {
  const { map } = world, selection = new Set(selected), changed = new Set(differences), locked = new Set([...world.locked, ...world.protections.flatMap(p => p.tiles)]);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.width, size.height);
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.zoom, view.zoom);
  const visible: Array<{ i: number; x: number; y: number }> = [];
  for (let i = 0; i < map.tiles.length; i++) {
    const tile = map.tiles[i], row = Math.floor(i / map.width), center = tileCenter(i % map.width, map.height - 1 - row, row);
    const sx = view.x + center.x * view.zoom, sy = view.y + center.y * view.zoom;
    if (sx < -25 || sy < -25 || sx > size.width + 25 || sy > size.height + 25) continue;
    visible.push({ i, ...center });
    const key = Object.keys(colors).find(k => map.terrains[tile.terrain]?.includes(k)) as keyof typeof colors | undefined;
    ctx.fillStyle = key ? colors[key] : "#c6c2b3"; hex(ctx, center.x, center.y); ctx.fill();
    if (layers.grid) { ctx.strokeStyle = "#655f5130"; ctx.lineWidth = .65 / Math.max(.2, view.zoom); ctx.stroke(); }
  }
  for (const { i, x, y } of visible) {
    const tile = map.tiles[i], feature = map.features[tile.feature] ?? "";
    if (layers.features && tile.route) {
      ctx.strokeStyle = "#a88f697f"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath();
      for (const [nx, ny] of adjacentCoordinates(i % map.width, Math.floor(i / map.width), map.width, map.height, map.wraps)) if (map.tiles[ny * map.width + nx].route) {
        if (Math.abs(nx - i % map.width) > 1) continue;
        const next = tileCenter(nx, map.height - 1 - ny, ny); ctx.moveTo(x, y); ctx.lineTo((x + next.x) / 2, (y + next.y) / 2);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (layers.elevation && tile.elevation === 2) {
      ctx.fillStyle = "#85836b"; peak(ctx, x, y + 2, 10);
      ctx.fillStyle = "#aaa68b"; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x + 1, y + 5); ctx.closePath(); ctx.fill();
      if (/SNOW|TUNDRA/.test(map.terrains[tile.terrain] ?? "")) { ctx.fillStyle = "#f1eddf"; peak(ctx, x, y - 3, 4); }
    } else if (layers.elevation && tile.elevation === 1) {
      ctx.strokeStyle = "#99977365"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 9, y + 4); ctx.quadraticCurveTo(x - 4, y - 6, x + 1, y + 2); ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y + 4); ctx.stroke();
    }
    if (layers.features && tile.elevation !== 2) {
      if (/FOREST|JUNGLE/.test(feature)) { ctx.fillStyle = /JUNGLE/.test(feature) ? "#72946b7d" : "#788d6e80"; for (const [dx, dy] of [[-6, 2], [1, -3], [7, 3]]) peak(ctx, x + dx, y + dy, 3.5); }
      else if (/MARSH|FLOOD_PLAINS/.test(feature)) { ctx.strokeStyle = "#76978770"; ctx.lineWidth = 1.2; for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(x + dx - 1, y + 4); ctx.lineTo(x + dx, y - 3); ctx.stroke(); } }
      else if (/ICE/.test(feature)) { ctx.fillStyle = "#edf0e2c0"; peak(ctx, x - 4, y + 2, 7); peak(ctx, x + 5, y, 5); }
      else if (/OASIS/.test(feature)) { ctx.fillStyle = "#84a89a"; ctx.beginPath(); ctx.ellipse(x, y, 7, 4, -.3, 0, Math.PI * 2); ctx.fill(); }
    }
    if (tile.river & 7) {
      ctx.strokeStyle = "#497f93"; ctx.lineWidth = Math.max(2.4, 1 / view.zoom); ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      for (const [a, b, bit] of [[1, 2, 1], [2, 3, 2], [3, 4, 4]]) if (tile.river & bit) { ctx.moveTo(x + vertices[a][0], y + vertices[a][1]); ctx.lineTo(x + vertices[b][0], y + vertices[b][1]); }
      ctx.stroke();
    }
    if (layers.resources && tile.resource !== 255) {
      const resource = map.resources[tile.resource] ?? "";
      ctx.fillStyle = /IRON|HORSE|COAL|OIL|ALUMINUM|URANIUM/.test(resource) ? "#675b6d" : /WHEAT|COW|SHEEP|DEER|FISH|BANANA|STONE/.test(resource) ? "#667548" : "#a58249";
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (layers.features && tile.wonder !== 255) { ctx.strokeStyle = "#987650"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.stroke(); }
    if (layers.features && tile.improvement) { ctx.strokeStyle = "#8e7b6488"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 4, 8, 8); }
    if (locked.has(i) || selection.has(i) || changed.has(i)) {
      hex(ctx, x, y); ctx.fillStyle = changed.has(i) ? "#b8754266" : selection.has(i) ? "#6e3f4755" : "#6e3f471c"; ctx.fill();
      ctx.strokeStyle = changed.has(i) ? "#ab6e45" : "#6e3f4799"; ctx.lineWidth = .8 / Math.max(.2, view.zoom); ctx.stroke();
    }
  }
  if (layers.starts) for (const [number, i] of (world.assessment.layouts[0]?.sites ?? []).entries()) {
    const row = Math.floor(i / map.width), { x, y } = tileCenter(i % map.width, map.height - 1 - row, row);
    ctx.fillStyle = "#fffdf9"; ctx.strokeStyle = "#6e3f47"; ctx.lineWidth = 2 / view.zoom; ctx.beginPath(); ctx.arc(x, y, 10 / view.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6e3f47"; ctx.font = `${11 / view.zoom}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(number + 1), x, y);
  }
  if (layers.features) for (const city of map.cities ?? []) {
    if (!city.recordValid || city.x < 0 || city.y < 0 || city.x >= map.width || city.y >= map.height) continue;
    const { x, y } = tileCenter(city.x, map.height - 1 - city.y, city.y);
    ctx.fillStyle = "#6e3f47"; ctx.fillRect(x - 5, y - 5, 10, 10);
    if (view.zoom > .25) { ctx.font = `${11 / view.zoom}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(city.name, x, y + 8); }
  }
  ctx.restore();
}
