"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDemoMap,
  parseCiv5Map,
  updateCiv5MapMetadata,
  type Civ5Map,
  type Civ5Tile,
} from "@/lib/civ5-map";

const HEX_RADIUS = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const MAP_MARGIN = 16;
const APP_VERSION = "0.1.2";

type View = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };
type Layers = { grid: boolean; features: boolean; resources: boolean; elevation: boolean; starts: boolean };
type HoveredTile = { tile: Civ5Tile; col: number; row: number } | null;
type ImportedMapSource = { fileName: string; buffer: ArrayBuffer };

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

function tileCenter(col: number, row: number) {
  return {
    x: MAP_MARGIN + HEX_WIDTH / 2 + HEX_WIDTH * (col + (row % 2 ? 0.5 : 0)),
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

function drawRiver(context: CanvasRenderingContext2D, river: number, x: number, y: number) {
  if (!(river & 7)) return;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 90) * Math.PI) / 180;
    return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
  });
  const edges = [
    [1, 2, 1],
    [2, 3, 2],
    [3, 4, 4],
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

function drawStartLocations(context: CanvasRenderingContext2D, map: Civ5Map, view: View) {
  const scale = Math.max(view.zoom, 0.35);
  const radius = 9 / scale;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const start of map.startLocations) {
    const displayRow = map.height - 1 - start.y;
    const center = tileCenter(start.x, displayRow);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = start.cityState ? "#7cb5c3" : "#f0ce79";
    context.fill();
    context.strokeStyle = "rgba(8, 24, 27, .92)";
    context.lineWidth = 2.4 / scale;
    context.stroke();
    context.fillStyle = "#173036";
    context.font = `700 ${10 / scale}px "Geist Mono", monospace`;
    context.fillText(String(start.player + 1), center.x, center.y + 0.5 / scale);
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
) {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#10242b";
  context.fillRect(0, 0, size.width, size.height);
  context.save();
  context.translate(view.x, view.y);
  context.scale(view.zoom, view.zoom);

  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const tile = tileAtDisplayPosition(map, col, row);
      if (!tile) continue;
      const center = tileCenter(col, row);
      const screenX = view.x + center.x * view.zoom;
      const screenY = view.y + center.y * view.zoom;
      if (screenX < -35 || screenY < -35 || screenX > size.width + 35 || screenY > size.height + 35) continue;

      const base = terrainColor(map.terrains[tile.terrain]);
      context.fillStyle = layers.elevation && tile.elevation === 2 ? shade(base, -34) : layers.elevation && tile.elevation === 1 ? shade(base, -15) : base;
      hexPath(context, center.x, center.y);
      context.fill();

      if (layers.grid) {
        context.strokeStyle = "rgba(6, 22, 25, .34)";
        context.lineWidth = 1 / Math.max(view.zoom, 0.55);
        context.stroke();
      }

      if (layers.features && tile.feature !== 255) {
        drawFeature(context, map.features[tile.feature] ?? "", center.x, center.y);
      }

      if (layers.elevation && tile.elevation > 0) {
        context.fillStyle = tile.elevation === 2 ? "rgba(238, 232, 213, .76)" : "rgba(64, 55, 41, .5)";
        context.beginPath();
        context.moveTo(center.x - 7, center.y + 7);
        context.lineTo(center.x, center.y - (tile.elevation === 2 ? 10 : 6));
        context.lineTo(center.x + 8, center.y + 7);
        context.closePath();
        context.fill();
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
    }
  }
  if (layers.starts && map.startLocations.length) drawStartLocations(context, map, view);
  context.restore();
}

function closestTile(map: Civ5Map, worldX: number, worldY: number): HoveredTile {
  const estimatedRow = Math.round((worldY - MAP_MARGIN - HEX_RADIUS) / (HEX_RADIUS * 1.5));
  let closest: HoveredTile = null;
  let distance = Number.POSITIVE_INFINITY;
  for (let row = estimatedRow - 1; row <= estimatedRow + 1; row += 1) {
    const estimatedCol = Math.round((worldX - MAP_MARGIN - HEX_WIDTH / 2) / HEX_WIDTH - (row % 2 ? 0.5 : 0));
    for (let col = estimatedCol - 1; col <= estimatedCol + 1; col += 1) {
      const tile = tileAtDisplayPosition(map, col, row);
      if (!tile) continue;
      const center = tileCenter(col, row);
      const candidate = Math.hypot(center.x - worldX, center.y - worldY);
      if (candidate < distance && candidate <= HEX_RADIUS) {
        closest = { tile, col, row };
        distance = candidate;
      }
    }
  }
  return closest;
}

export function Civ5MapViewer() {
  const [map, setMap] = useState<Civ5Map>(() => createDemoMap());
  const [sourceFile, setSourceFile] = useState<ImportedMapSource | null>(null);
  const [size, setSize] = useState<Size>({ width: 900, height: 620 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [layers, setLayers] = useState<Layers>({ grid: true, features: true, resources: true, elevation: true, starts: true });
  const [hovered, setHovered] = useState<HoveredTile>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [message, setMessage] = useState("Demo map loaded");
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);

  const bounds = useMemo(() => mapBounds(map), [map]);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * pixelRatio);
    canvas.height = Math.round(size.height * pixelRatio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext("2d");
    if (context) drawMap(context, map, layers, hovered, view, size, pixelRatio);
  }, [map, layers, hovered, view, size]);

  const terrainBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tile of map.tiles) {
      const name = friendlyName(map.terrains[tile.terrain], "TERRAIN_");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [map]);

  const visibleLayerCount = Object.entries(layers).filter(([key, enabled]) => enabled && (key !== "starts" || map.startLocations.length > 0)).length;

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".civ5map")) {
      setMessage("Choose a file ending in .Civ5Map");
      return;
    }
    try {
      setMessage("Reading map…");
      const buffer = await file.arrayBuffer();
      const parsed = parseCiv5Map(buffer, file.name);
      setMap(parsed);
      setSourceFile({ fileName: file.name, buffer });
      setHovered(null);
      setShowEditPrompt(false);
      setIsEditingMetadata(false);
      setMessage(`${file.name} · rendered locally`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That map could not be read.");
    }
  }, []);

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
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      setView((current) => ({ ...current, x: drag.viewX + event.clientX - drag.x, y: drag.viewY + event.clientY - drag.y }));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHovered(closestTile(map, (event.clientX - rect.left - view.x) / view.zoom, (event.clientY - rect.top - view.y) / view.zoom));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
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
    setMap((current) => ({ ...current, name, description: draftDescription }));
    setIsEditingMetadata(false);
    setMessage(sourceFile ? "Map details edited · ready to export" : "Demo map details edited");
  };

  const exportCiv5Map = () => {
    if (!sourceFile || isEditingMetadata) return;
    try {
      const exported = updateCiv5MapMetadata(sourceFile.buffer, map.name, map.description);
      const blobUrl = URL.createObjectURL(new Blob([exported], { type: "application/octet-stream" }));
      const baseName = sourceFile.fileName.replace(/\.civ5map$/i, "");
      const downloadName = `${baseName}-edited.Civ5Map`;
      const link = document.createElement("a");
      link.download = downloadName;
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      setMessage(`${downloadName} · exported`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The edited map could not be exported.");
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
        <div className="topbar-actions">
          <button className="button button-secondary button-export-view" type="button" onClick={exportView}>Export view</button>
          <button
            className="button button-secondary button-export-map"
            type="button"
            onClick={exportCiv5Map}
            disabled={!sourceFile || isEditingMetadata}
            title={!sourceFile ? "Open a Civ5Map file before exporting" : isEditingMetadata ? "Save your edits before exporting" : "Export an edited Civ5Map file"}
          >
            Export Civ5Map
          </button>
          <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}>Open map</button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".civ5map,.Civ5Map,application/octet-stream" onChange={onFileChange} />
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Map information and layers">
          <div className="map-heading">
            {isEditingMetadata ? (
              <label className="metadata-field metadata-name-field">
                <span>Name</span>
                <input value={draftName} maxLength={160} onChange={(event) => setDraftName(event.target.value)} autoFocus />
              </label>
            ) : (
              <div>
                <p className="eyebrow">{map.source === "demo" ? "Sample map" : "Open map"}</p>
                <button className="editable-map-name" type="button" onClick={requestEditMode} aria-haspopup="dialog" title="Edit map name and description">
                  <h2>{map.name}</h2>
                </button>
              </div>
            )}
            <span className="version-badge" aria-label={`Excogitare version ${APP_VERSION}`}>{`v${APP_VERSION}`}</span>
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
              <label className={`layer-row${map.startLocations.length ? "" : " is-disabled"}`}>
                <span><strong>Start locations</strong><small>{map.startLocations.length ? `${map.startLocations.length} positions` : "Not stored in this map"}</small></span>
                <input
                  type="checkbox"
                  checked={layers.starts}
                  disabled={!map.startLocations.length}
                  onChange={(event) => setLayers((current) => ({ ...current, starts: event.target.checked }))}
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

          <button className="demo-button" type="button" onClick={() => { setMap(createDemoMap()); setSourceFile(null); setShowEditPrompt(false); setIsEditingMetadata(false); setMessage("Demo map loaded"); }}>Reset to sample map</button>
        </aside>

        <div
          ref={canvasShellRef}
          className={`canvas-shell${isDraggingFile ? " is-dragging" : ""}`}
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
            <div className="map-hint">Drag to pan <span>·</span> Scroll to zoom <span>·</span> Hover for tile data</div>
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
