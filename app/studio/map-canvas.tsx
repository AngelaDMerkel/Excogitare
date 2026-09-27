"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { World } from "../../lib/studio/model";
import { adjacency } from "../../lib/studio/geography";
import { closestIsometricTile, closestTile, drawMap, mapBounds, projectionTransform, type Layers, type View } from "../../lib/studio/renderer";
import { drawAtlas } from "../../lib/studio/atlas-renderer";

export type CanvasTool = "PAN" | "REGION" | "FEATURE" | "SKETCH";
export function MapCanvas({ world, tool, brush, layers, selected, differences, isometric, disabled, onSelection, onHover, onSketch, canvasRef }: {
  world: World; tool: CanvasTool; brush: number; layers: Layers; selected: number[]; differences: number[]; isometric: boolean; disabled: boolean;
  onSelection: (indices: number[]) => void; onHover: (index: number | null) => void; onSketch: (indices: number[]) => void; canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const container = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ width: 600, height: 500 });
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: .3 });
  const drag = useRef<{ x: number; y: number; view: View; anchor: number | null; tiles: Set<number> } | null>(null);
  const projection = projectionTransform(world.map.width, world.map.height, isometric ? "ISOMETRIC" : "FLAT");
  const fit = useCallback(() => {
    const p = projectionTransform(world.map.width, world.map.height, isometric ? "ISOMETRIC" : "FLAT");
    const b = isometric ? { width: p.width, height: p.height } : mapBounds(world.map.width, world.map.height);
    const zoom = Math.min((size.width - 40) / b.width, (size.height - 40) / b.height);
    setView({ zoom, x: (size.width - b.width * zoom) / 2, y: (size.height - b.height * zoom) / 2 });
  }, [world.map.width, world.map.height, isometric, size]);
  useLayoutEffect(() => { const el = container.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => { const frame = requestAnimationFrame(fit); return () => cancelAnimationFrame(frame); }, [fit]);
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio);
    if (!isometric) { drawAtlas(ctx, world, layers, view, size, ratio, selected, differences); return; }
    const drawnMap = layers.starts ? { ...world.map, startLocations: (world.assessment.layouts[0]?.sites ?? []).map((i, player) => ({ x: i % world.map.width, y: Math.floor(i / world.map.width), player, team: player, civilization: "", leader: "", playable: true, cityState: false })) } : world.map;
    drawMap(ctx, drawnMap, layers, null, view, size, ratio, projectionTransform(world.map.width, world.map.height, isometric ? "ISOMETRIC" : "FLAT"), null, null, new Set([...selected, ...differences]), new Set(world.locked), new Int16Array(world.map.tiles.length).fill(-1), true);
  }, [world, selected, differences, view, size, layers, isometric, canvasRef]);
  const tileAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left - view.x) / view.zoom, y = (event.clientY - rect.top - view.y) / view.zoom;
    const tile = isometric ? closestIsometricTile(world.map, x, y, projection, layers.elevation) : closestTile(world.map, x, y);
    return tile ? (world.map.height - 1 - tile.row) * world.map.width + tile.col : null;
  };
  const brushTiles = (index: number) => {
    const graph = adjacency(world.map); const seen = new Set([index]); let frontier = [index];
    for (let n = 1; n < brush; n++) { const next: number[] = []; for (const i of frontier) for (const j of graph[i]) if (!seen.has(j)) { seen.add(j); next.push(j); } frontier = next; }
    return [...seen];
  };
  const zoom = (factor: number) => setView(v => { const z = Math.max(.03, Math.min(3, v.zoom * factor)); return { zoom: z, x: size.width / 2 - (size.width / 2 - v.x) * z / v.zoom, y: size.height / 2 - (size.height / 2 - v.y) * z / v.zoom }; });
  return <div className={`studio-map tool-${tool.toLowerCase()}`} ref={container}>
    <canvas ref={canvasRef} role="img" aria-label={`Interactive map of ${world.map.name}`} tabIndex={0}
      onKeyDown={e => { if (e.key === "+" || e.key === "=") zoom(1.2); if (e.key === "-") zoom(.8); if (e.key === "0") fit(); }}
      onWheel={e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : .89); }}
      onPointerDown={e => {
        if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); const index = tileAt(e);
        drag.current = { x: e.clientX, y: e.clientY, view, anchor: index, tiles: new Set(index === null ? [] : brushTiles(index)) };
        if (tool === "FEATURE" && index !== null) { const order = ["RIVER", "PASS", "WATER", "RANGE", "BASIN", "REFUGE", "LAND", "CLIMATE", "PLATE"]; const feature = world.features.filter(f => f.tiles.includes(index)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.tiles.length - b.tiles.length)[0]; onSelection(feature?.tiles ?? [index]); }
        if (tool === "REGION" || tool === "SKETCH") onSelection([...drag.current.tiles]);
      }}
      onPointerMove={e => {
        const index = tileAt(e); onHover(index); const active = drag.current; if (!active || disabled) return;
        if (tool === "PAN") setView({ ...active.view, x: active.view.x + e.clientX - active.x, y: active.view.y + e.clientY - active.y });
        else if (tool === "REGION" && index !== null && active.anchor !== null) {
          const x0 = Math.min(index % world.map.width, active.anchor % world.map.width), x1 = Math.max(index % world.map.width, active.anchor % world.map.width);
          const y0 = Math.min(Math.floor(index / world.map.width), Math.floor(active.anchor / world.map.width)), y1 = Math.max(Math.floor(index / world.map.width), Math.floor(active.anchor / world.map.width));
          const indices = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) indices.push(y * world.map.width + x); active.tiles = new Set(indices); onSelection(indices);
        } else if (tool === "SKETCH" && index !== null) { for (const i of brushTiles(index)) active.tiles.add(i); onSelection([...active.tiles]); }
      }}
      onPointerUp={() => { const active = drag.current; drag.current = null; if (active && tool === "SKETCH" && active.tiles.size) onSketch([...active.tiles]); }}
      onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { if (!drag.current) onHover(null); }} />
    <div className="studio-zoom"><button aria-label="Zoom out" onClick={() => zoom(.8)}>−</button><span>{Math.round(view.zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button><button onClick={fit}>Fit</button></div>
    <div className="studio-map-hint">{tool === "PAN" ? "Drag to explore · scroll to zoom" : tool === "REGION" ? "Drag a rectangle to select a region" : tool === "FEATURE" ? "Select a river, highland, lake or landmass" : "Draw on the map · release to preview"}</div>
  </div>;
}

export function WorldThumbnail({ world }: { world: World }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; const ctx = c?.getContext("2d"); if (!c || !ctx) return;
    c.width = world.map.width; c.height = world.map.height;
    const colors = ["#83aab3", "#bfd3d0", "#c1cca9", "#d9d1aa", "#e8d6b1", "#c5c7b3", "#e6e6d9"];
    world.map.tiles.forEach((t, i) => { const name = world.map.terrains[t.terrain] || ""; const n = ["OCEAN", "COAST", "GRASS", "PLAINS", "DESERT", "TUNDRA", "SNOW"].findIndex(v => name.includes(v)); ctx.fillStyle = t.elevation === 2 ? "#777764" : colors[n] || "#b4b4a0"; ctx.fillRect(i % c.width, c.height - 1 - Math.floor(i / c.width), 1, 1); });
  }, [world]);
  return <canvas ref={ref} aria-hidden="true" />;
}
