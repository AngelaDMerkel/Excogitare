"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExcogitareWordmark, WayfinderMark } from "../brand";
import type { ExcogitareProject } from "../../lib/authoring-schema";
import { mapExportBaseName } from "../../lib/map-file-name";
import { acceptWorld, hash, redo, undo, type Job, type Session, type Stroke, type StudioRecipe, type World } from "../../lib/studio/model";
import { exportMap, importMap, migrateWorld } from "../../lib/studio/operations";
import { parseSession, serializeSession, validateWorldRecord } from "../../lib/studio/project";
import type { Layers } from "../../lib/studio/renderer";
import { MapCanvas, WorldThumbnail, type CanvasTool } from "./map-canvas";
import { Field, RecipePanel } from "./recipe-panel";
import { DevelopPanel, ReviewPanel } from "./world-panels";
import starterWorld from "./starter-world.json";
import "./studio.css";

const initialLayers: Layers = { political: false, strategy: false, grid: false, features: true, resources: false, elevation: true, starts: false, cityStates: false };
function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function changedTiles(a: World, b: World) {
  if (a.map.width !== b.map.width || a.map.height !== b.map.height) return b.map.tiles.map((_, i) => i);
  return b.map.tiles.flatMap((tile, i) => JSON.stringify(tile) !== JSON.stringify(a.map.tiles[i]) ? [i] : []);
}

type Preview = { world: World; label: string };
export function MapStudio() {
  const [session, setSession] = useState<Session>(() => { const current = migrateWorld(starterWorld); validateWorldRecord(current); return { current, past: [], future: [] }; });
  const [createRecipe, setCreateRecipe] = useState<StudioRecipe>(() => structuredClone(session.current.recipe));
  const [developmentRecipe, setDevelopmentRecipe] = useState<StudioRecipe>(() => structuredClone(session.current.recipe));
  const [projectName, setProjectName] = useState("Watershed study"), [legacy, setLegacy] = useState<ExcogitareProject>();
  const [dirty, setDirty] = useState(false), [mode, setMode] = useState<"CREATE" | "DEVELOP" | "REVIEW">("CREATE");
  const [selected, setSelected] = useState<number[]>([]), [hovered, setHovered] = useState<number | null>(null);
  const [tool, setTool] = useState<CanvasTool>("FEATURE"), [brush, setBrush] = useState(2);
  const [operation, setOperation] = useState<Stroke["kind"]>("RIDGE"), [strength, setStrength] = useState(65);
  const [paint, setPaint] = useState({ terrain: 2, elevation: 0, feature: 255, resource: 255 });
  const [layers, setLayers] = useState(initialLayers), [isometric, setIsometric] = useState(false);
  const [showLayers, setShowLayers] = useState(false), [showControls, setShowControls] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null), [previewView, setPreviewView] = useState<"RESULT" | "ORIGINAL" | "DIFFERENCE">("RESULT");
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState({ label: "", completed: 0, total: 1 });
  const [error, setError] = useState(""), [message, setMessage] = useState("A retained watershed world is ready to explore.");
  const [dialog, setDialog] = useState<"SAVE" | "EXPORT" | null>(null), [saveHistory, setSaveHistory] = useState<"FULL" | "CHECKPOINTS">("FULL");
  const [protection, setProtection] = useState<"EXACT" | "SHAPE" | "FUNCTION">("FUNCTION");
  const fileRef = useRef<HTMLInputElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const jobRef = useRef<{ id: number; worker: Worker } | null>(null), sequence = useRef(0);
  const world = session.current, display = preview && previewView !== "ORIGINAL" ? preview.world : world;
  const recipe = mode === "CREATE" ? createRecipe : developmentRecipe;
  const pendingDevelopment = JSON.stringify(developmentRecipe) !== JSON.stringify(world.recipe);
  const differences = useMemo(() => preview && previewView === "DIFFERENCE" ? changedTiles(world, preview.world) : [], [world, preview, previewView]);
  const selectedFeature = useMemo(() => selected.length ? world.features.find(f => f.tiles.length === selected.length && f.tiles.every((tile, i) => tile === selected[i])) : undefined, [selected, world.features]);
  const tileIndex = hovered ?? selected[0], tile = tileIndex === undefined || tileIndex === null ? null : display.map.tiles[tileIndex];
  const blocked = busy || !!preview;
  const install = useCallback((next: World, label: string, newWorld = false) => {
    setSession(current => acceptWorld(current, next, label));
    setDevelopmentRecipe(draft => !newWorld && JSON.stringify(next.recipe) === JSON.stringify(world.recipe) && JSON.stringify(draft) !== JSON.stringify(world.recipe) ? draft : structuredClone(next.recipe));
    setCreateRecipe(draft => newWorld || JSON.stringify(draft) === JSON.stringify(world.recipe) ? structuredClone(next.recipe) : draft);
    setDirty(true); setPreview(null); setMessage(label); setError("");
  }, [world.recipe]);
  const run = (job: Job, label: string) => {
    if (jobRef.current) return;
    if (pendingDevelopment && ["STROKE", "DEVELOP", "REBALANCE"].includes(job.kind)) { setError("Preview or discard the unapplied development settings before requesting another local change."); return; }
    setBusy(true); setError(""); setProgress({ label: "Preparing world operation…", completed: 0, total: 1 });
    const id = ++sequence.current, worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
    jobRef.current = { id, worker };
    const finish = () => { worker.terminate(); jobRef.current = null; setBusy(false); };
    worker.onmessage = (event: MessageEvent<{ id: number; kind: string; label: string; completed: number; total: number; world: World; message: string }>) => {
      const data = event.data; if (jobRef.current?.id !== id || data.id !== id) return;
      if (data.kind === "PROGRESS") { setProgress({ label: data.label, completed: data.completed, total: data.total }); return; }
      finish();
      if (data.kind === "ERROR") { setError(data.message); return; }
      if (job.kind === "GENERATE" || job.kind === "RANDOMISE") { install(data.world, label, true); setSelected([]); setHovered(null); setMode("DEVELOP"); }
      else if (job.kind === "DEVELOP" && !job.proposalId) {
        setSession(s => ({ ...s, current: { ...s.current, development: data.world.development } })); setDirty(true);
        setMessage(data.world.development.proposals.length ? "Local developments are ready to compare." : "No local proposal improved the screened opportunities. Try another place or shape a change directly.");
      } else { setPreview({ world: data.world, label }); setPreviewView("DIFFERENCE"); setMessage("Compare the proposed geography before keeping it."); }
    };
    worker.onerror = () => { if (jobRef.current?.id !== id) return; finish(); setError("The operation stopped unexpectedly. The accepted world is retained."); };
    worker.postMessage({ id, job });
  };
  const cancel = () => { jobRef.current?.worker.terminate(); jobRef.current = null; sequence.current++; setBusy(false); setMessage("Operation cancelled; accepted world retained."); };
  useEffect(() => () => jobRef.current?.worker.terminate(), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (busy || preview || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || (event.target as HTMLElement)?.closest("input,textarea,select")) return;
      event.preventDefault(); const next = event.shiftKey ? redo(session) : undo(session);
      setSession(next); setDevelopmentRecipe(next.current.recipe); setSelected([]); setDirty(true);
    };
    window.addEventListener("keydown", navigate); return () => window.removeEventListener("keydown", navigate);
  }, [busy, preview, session]);
  const changeRecipe = (next: StudioRecipe) => { if (mode === "CREATE") setCreateRecipe(next); else setDevelopmentRecipe(next); setDirty(true); };
  const openFile = async (file: File) => {
    if (busy) return;
    if (dirty && !window.confirm("Open another file? Download this project first to keep its unsaved changes.")) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("Files must be smaller than 64 MB.");
      const bytes = await file.arrayBuffer();
      if (file.name.toLowerCase().endsWith(".excogitare")) {
        const parsed = parseSession(bytes); setSession(parsed.session); setCreateRecipe(parsed.session.draft ?? parsed.session.current.recipe); setDevelopmentRecipe(parsed.session.developmentDraft ?? parsed.session.current.recipe); setProjectName(parsed.name); setLegacy(parsed.legacy); setDirty(false);
      } else { const next = importMap(bytes, file.name); setSession({ current: next, past: [], future: [] }); setCreateRecipe(next.recipe); setDevelopmentRecipe(next.recipe); setProjectName(next.map.name); setLegacy(undefined); setDirty(true); setMode("REVIEW"); }
      setPreview(null); setSelected([]); setHovered(null); setError(""); setMessage(`${file.name} opened`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be opened."); }
  };
  const save = () => {
    try {
      const savedSession = { ...session, past: saveHistory === "FULL" ? session.past : session.past.filter(e => e.checkpoint), future: saveHistory === "FULL" ? session.future : [], draft: createRecipe, developmentDraft: developmentRecipe };
      download(serializeSession(savedSession, projectName, legacy), `${mapExportBaseName({ name: projectName })}.excogitare`, "application/vnd.excogitare.project+zip");
      setDirty(false); setDialog(null); setMessage("Project downloaded with its geography, edits and snapshots.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be saved."); }
  };
  const exportCurrent = () => {
    try { download(exportMap(world), `${mapExportBaseName(world.map)}.Civ5Map`, "application/octet-stream"); setDialog(null); setMessage("Civ5Map downloaded. Share the same file with every player."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
  };
  const stroke = (tiles: number[]) => run({ kind: "STROKE", world, stroke: { kind: operation, tiles, strength: strength / 100, ...(operation === "PAINT" ? paint : {}) } }, `${operation.toLowerCase()} · ${tiles.length} tiles`);
  const protect = () => {
    const id = selectedFeature?.id ?? `selection:${hash(selected.join(","))}`;
    const next = structuredClone(world);
    if (protection === "EXACT") next.locked = [...new Set([...next.locked, ...selected])];
    else next.protections = [...next.protections.filter(p => p.id !== id), { id, policy: protection, tiles: [...selected], kind: selectedFeature?.kind ?? "LAND" }];
    install(next, `Protected ${selectedFeature?.name ?? "selection"}`);
  };
  const release = () => { const indices = new Set(selected); install({ ...world, locked: world.locked.filter(i => !indices.has(i)), protections: world.protections.filter(p => !p.tiles.some(i => indices.has(i))) }, "Released place protection"); };
  const checkpoint = () => { setSession(s => ({ ...s, past: [...s.past, { id: s.current.revision, label: `Snapshot ${s.past.filter(p => p.checkpoint).length + 1}`, checkpoint: true, world: structuredClone(s.current) }] })); setDirty(true); };
  const features = useMemo(() => world.features.filter(f => ["RIVER", "BASIN", "WATER", "RANGE"].includes(f.kind)), [world.features]);
  return <main className={`studio${showControls ? "" : " recipe-hidden"}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void openFile(file); }}>
    <input ref={fileRef} hidden type="file" accept=".Civ5Map,.civ5map,.excogitare" onChange={e => { const file = e.target.files?.[0]; if (file) void openFile(file); e.target.value = ""; }} />
    <MapCanvas world={display} tool={tool} brush={brush} layers={layers} selected={selected} differences={differences} isometric={isometric} disabled={blocked} onSelection={setSelected} onHover={setHovered} onSketch={stroke} canvasRef={canvasRef} />
    <aside className="studio-left studio-sheet" aria-label="World design">
      <div className="studio-brand"><WayfinderMark /><div><h1><ExcogitareWordmark /></h1><span>{world.map.name}</span></div><button className="studio-icon-button" aria-label="Hide controls" onClick={() => setShowControls(false)}>‹</button></div>
      <nav className="studio-modes" aria-label="Authoring tasks">{(["CREATE", "DEVELOP", "REVIEW"] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "CREATE" ? "Create" : value === "DEVELOP" ? "Develop" : "Review"}</button>)}</nav>
      <div className="studio-scroll">
        {mode === "CREATE" && <RecipePanel recipe={recipe} onChange={changeRecipe} disabled={blocked} />}
        {mode === "DEVELOP" && <>{pendingDevelopment && <div className="studio-draft-note"><p>Development settings have unapplied changes.</p><button disabled={blocked} onClick={() => run({ kind: "REFINE", world, recipe: developmentRecipe }, "Developed world settings")}>Preview settings</button><button disabled={blocked} onClick={() => setDevelopmentRecipe(structuredClone(world.recipe))}>Discard settings</button></div>}<Field label="Place"><select aria-label="Select a geographic place" value={selectedFeature?.id ?? ""} onChange={e => { const place = world.features.find(f => f.id === e.target.value); if (place) setSelected(place.tiles); }}><option value="">Whole world</option>{features.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field><DevelopPanel world={world} recipe={recipe} onRecipe={changeRecipe} selection={selected} busy={blocked} run={run} operation={operation} onOperation={setOperation} strength={strength} onStrength={setStrength} brush={brush} onBrush={setBrush} paint={paint} onPaint={setPaint} onSketch={() => stroke(selected)} onMetadata={change => install({ ...world, map: { ...world.map, ...change } }, "Updated map description")} /></>}
        {mode === "REVIEW" && <ReviewPanel world={display} busy={blocked} run={run} />}
      </div>
      {mode === "CREATE" && <div className="studio-create-actions"><button className="studio-primary" disabled={blocked} onClick={() => run({ kind: "GENERATE", recipe }, "New world generated")}>Generate new world</button><button disabled={blocked} onClick={() => run({ kind: "RANDOMISE", seed: Math.random().toString(36).slice(2) }, "Randomised world")}>⚄ Randomise everything</button></div>}
    </aside>
    <div className="studio-canvas-toolbar">{!showControls && <button onClick={() => setShowControls(true)}>Show controls</button>}<div className="studio-tools studio-sheet" aria-label="Map tools">{([["FEATURE", "Select", "↖"], ["PAN", "Move", "↔"], ["REGION", "Region", "▧"], ["SKETCH", "Sketch", "⌁"]] as const).map(([id, label, icon]) => <button key={id} aria-label={label} aria-pressed={tool === id} disabled={blocked} onClick={() => { setTool(id); if (id === "SKETCH") setMode("DEVELOP"); }}><span aria-hidden="true">{icon}</span><small>{label}</small></button>)}</div></div>
    <div className="studio-view-tools"><button aria-expanded={showLayers} onClick={() => setShowLayers(v => !v)}>Layers</button>{showLayers && <section className="studio-layers studio-sheet" aria-label="Map layers">{([["grid", "Hex grid"], ["features", "Vegetation & features"], ["resources", "Resources"], ["elevation", "Relief"], ["starts", "Analytical sites"]] as const).map(([key, label]) => <label className="studio-check" key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers({ ...layers, [key]: e.target.checked })} />{label}</label>)}<label className="studio-check"><input type="checkbox" checked={isometric} onChange={e => setIsometric(e.target.checked)} />Isometric view</label><button onClick={() => canvasRef.current?.toBlob(blob => { if (blob) download(blob, `${mapExportBaseName(world.map)}.png`, "image/png"); })}>Save map image</button></section>}</div>
    {!!selected.length && <aside className="studio-selection studio-sheet" aria-label="Map inspector"><button className="studio-close" aria-label="Clear selection" onClick={() => setSelected([])}>×</button><span className="studio-eyebrow">SELECTED PLACE</span><h2>{selectedFeature?.name ?? `${selected.length} tiles`}</h2><p>{selectedFeature?.cause ?? "A selected part of the retained landscape."}</p><span className="studio-caption">{selected.length} tiles{selectedFeature?.inferred ? " · inferred identity" : ""}</span><div className="studio-two-buttons"><button disabled={blocked} onClick={() => { setMode("DEVELOP"); setShowControls(true); }}>Develop place</button><button disabled={blocked} onClick={protect}>Protect</button></div><Field label="Preserve"><select value={protection} onChange={e => setProtection(e.target.value as typeof protection)}><option value="FUNCTION">Function</option><option value="SHAPE">Shape</option><option value="EXACT">Exact tiles</option></select></Field><button className="studio-text-button" disabled={blocked} onClick={release}>Release protection</button></aside>}
    {tile && !selected.length && <div className="studio-tile-readout">{display.map.terrains[tile.terrain]?.replace("TERRAIN_", "").toLowerCase()} · {["flat", "hills", "mountains"][tile.elevation]}{tile.resource !== 255 ? ` · ${display.map.resources[tile.resource]?.replace("RESOURCE_", "").toLowerCase()}` : ""}</div>}
    <div className="studio-file-actions"><button disabled={busy} onClick={() => fileRef.current?.click()}>Open</button><button disabled={blocked} onClick={() => setDialog("SAVE")}>Save project</button><button className="studio-primary" disabled={blocked} onClick={() => setDialog("EXPORT")}>Export map</button></div>
    <div className="studio-bottom"><div className="studio-filmstrip" aria-label="World snapshots">{session.past.map((entry, i) => <button className="studio-thumbnail" key={`${entry.id}-${i}`} disabled={busy} onClick={() => { setPreview({ world: entry.world, label: entry.checkpoint ? entry.label : `Return to ${entry.label}` }); setPreviewView("RESULT"); }} aria-label={entry.label}><WorldThumbnail world={entry.world} /><span>{entry.checkpoint ? "◆ " : ""}{entry.label}</span></button>)}<div className="studio-thumbnail is-current"><WorldThumbnail world={world} /><span>Current world</span></div>{preview && <div className="studio-thumbnail is-preview"><WorldThumbnail world={preview.world} /><span>Proposed</span></div>}</div><button className="studio-snapshot-button" disabled={blocked} onClick={checkpoint}>Keep snapshot</button></div>
    {(busy || error || preview) && <div className={`studio-operation studio-sheet ${error ? "has-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
      {busy ? <><span className="studio-spinner" /><div><strong>Developing your world</strong><span>{progress.label}</span><progress value={progress.completed} max={progress.total} /></div><button onClick={cancel}>Cancel</button></> : error ? <><div><strong>This change needs attention</strong><span>{error}</span></div><button aria-label="Dismiss error" onClick={() => setError("")}>×</button></> : preview && <><div><strong>{preview.label}</strong><span>{changedTiles(world, preview.world).length.toLocaleString()} tiles would change</span>{preview.world.development.changes.explanation.slice(-1).map(text => <span key={text}>{text}</span>)}</div><select aria-label="Preview comparison" value={previewView} onChange={e => setPreviewView(e.target.value as typeof previewView)}><option value="RESULT">Result</option><option value="ORIGINAL">Original</option><option value="DIFFERENCE">Difference</option></select><button onClick={() => setPreview(null)}>Discard</button><button className="studio-primary" onClick={() => install(preview.world, preview.label)}>Keep changes</button></>}
    </div>}
    <div className="studio-status" role="status">{message}</div>
    {dialog && <div className="studio-modal-backdrop"><dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setDialog(null)} className="studio-modal studio-sheet" aria-labelledby="studio-dialog-title">
      <span className="studio-eyebrow">{dialog === "SAVE" ? "PORTABLE PROJECT" : "CIVILIZATION V"}</span><h2 id="studio-dialog-title">{dialog === "SAVE" ? "Keep this world and its revisions." : "Take this world into a game."}</h2>
      {dialog === "SAVE" ? <><Field label="Project name"><input value={projectName} onChange={e => setProjectName(e.target.value)} /></Field><Field label="Snapshots"><select value={saveHistory} onChange={e => setSaveHistory(e.target.value as typeof saveHistory)}><option value="FULL">All retained revisions</option><option value="CHECKPOINTS">Current + kept snapshots</option></select></Field><p>The project keeps native geography, inferred or retained fields, edits, protected places, proposals and your selected snapshots.</p></> : <><p>Share the identical .Civ5Map file with every player. It contains terrain, rivers, resources, natural wonders and map metadata.</p><p>Civ V assigns multiplayer starts. Analytical sites are not exported as fixed positions.</p><p>Save an Excogitare project to retain the editable world and its revisions.</p>{world.source && <p>{world.source.salvaged ? "Recovered geography is exported; unparsed scenario records cannot be preserved." : "Supported imported records are preserved against the original file."}</p>}</>}
      {error && <p className="studio-modal-error" role="alert">{error}</p>}<div className="studio-modal-actions"><button onClick={() => setDialog(null)}>Cancel</button><button className="studio-primary" onClick={dialog === "SAVE" ? save : exportCurrent}>{dialog === "SAVE" ? "Download project" : "Download .Civ5Map"}</button></div>
    </dialog></div>}
  </main>;
}
