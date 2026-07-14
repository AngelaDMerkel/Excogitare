import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Civ5 map viewer shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Excogitare — Civ5 Map Viewer &amp; Editor<\/title>/i);
  assert.match(html, /Excogitare/);
  assert.match(html, /v0\.4\.8/);
  assert.match(html, /The Twin Continents/);
  assert.match(html, /Start locations/);
  assert.match(html, /4 positions/);
  assert.match(html, /Export Civ5Map/);
  assert.match(html, /Show map legend/);
  assert.match(html, />Explore</);
  assert.match(html, />Create</);
  assert.match(html, />Repair</);
  assert.match(html, />Lua</);
  assert.match(html, /Edit map name and description/);
  assert.doesNotMatch(html, /Files stay on this device/);
  assert.match(html, /Open map/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("social artwork is a high-resolution render of a generated Excogitare map", async () => {
  const [editorArtwork, fallbackArtwork, layout, renderer] = await Promise.all([
    readFile(new URL("../public/og-editor.png", import.meta.url)),
    readFile(new URL("../public/og.png", import.meta.url)),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/render-social-art.mjs", import.meta.url), "utf8"),
  ]);

  assert.equal(editorArtwork.subarray(1, 4).toString(), "PNG");
  assert.equal(editorArtwork.readUInt32BE(16), 2400);
  assert.equal(editorArtwork.readUInt32BE(20), 1260);
  assert.deepEqual(editorArtwork, fallbackArtwork);
  assert.match(layout, /width: 2400, height: 1260/);
  assert.match(layout, /High-resolution isometric map rendered by Excogitare/);
  assert.match(renderer, /generateMap\(options\)/);
  assert.match(renderer, /preset: "WILD_REGIONS"/);
  assert.match(renderer, /const PROJECTION = \{ a: 0\.86, b: 0\.25, c: -0\.52, d: 0\.38 \}/);
});

test("layer redraws preserve the existing canvas backing buffer", async () => {
  const source = await readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8");
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /if \(canvas\.width !== backingWidth\) canvas\.width = backingWidth/);
  assert.match(source, /if \(canvas\.height !== backingHeight\) canvas\.height = backingHeight/);
  assert.match(source, /renderCanvasRef = useRef<HTMLCanvasElement \| null>\(null\)/);
  assert.match(source, /const paintedTiles = drawMap\(renderContext/);
  assert.match(source, /if \(canvasMap\.tiles\.length && paintedTiles === 0\) return/);
  assert.match(source, /context\.drawImage\(renderCanvas, 0, 0\)/);
  assert.match(source, /transparentBackground = false/);
  assert.match(source, /getContext\("2d", \{ alpha: true \}\)/);
  assert.match(source, /repairHighlights, politicalOwnership, true\)/);
  assert.match(source, /exported with transparent background/);
  assert.match(source, /const baseName = mapExportBaseName\(targetMap\)/);
  assert.doesNotMatch(source, /sourceFile\?\.fileName\.replace\(\/\\\.civ5map/);
  assert.match(source, /\[4, 5, 1\]/);
  assert.match(source, /\[3, 4, 2\]/);
  assert.match(source, /\[2, 3, 4\]/);
  assert.match(source, /tileCenter\(col, row, map\.height - 1 - row\)/);
  assert.match(source, />Randomise</);
  assert.match(source, /Generation history/);
  assert.match(source, /MAX_GENERATION_HISTORY/);
  assert.match(source, /openGeneration/);
  assert.match(source, /aria-label="Create tools"/);
  assert.match(source, /World shape/);
  assert.match(source, /Climate and terrain/);
  assert.match(source, /Players and starts/);
  assert.match(source, /Resources and wonders/);
  assert.match(source, />Analyze</);
  assert.match(source, /Multiplayer balance/);
  assert.match(source, /Civ5 validation/);
  assert.match(source, /Automated repair/);
  assert.match(source, /Start-location tests included/);
  assert.match(source, /Bounds · land access · mountain safety · duplicates · spacing · player count · city-state flags/);
  assert.match(source, /ORIGINAL", "CORRECTED", "DIFFERENCE/);
  assert.match(source, /parseCiv5MapForRepair/);
  assert.match(source, /Flood fill/);
  assert.match(source, /Region/);
  assert.match(source, /Barbarians/);
  assert.match(source, /Ancient ruins/);
  assert.match(source, /Abandoned road/);
  assert.match(source, /Ruined city/);
  assert.match(source, /Fallout/);
  assert.match(source, /<span>Wrap type<\/span>/);
  assert.match(source, /<span>Geometry<\/span>/);
  assert.match(source, /Needle — extreme vertical/);
  assert.match(source, /Ribbon — extreme horizontal/);
  assert.match(source, /<span>City states<\/span>/);
  assert.match(source, /projection-button/);
  assert.match(source, /unprojectPoint/);
  assert.match(source, /drawIsometricSidewalls/);
  assert.match(source, /drawIsometricRelief/);
  assert.match(source, /closestIsometricTile/);
  assert.match(source, /ISO 3D/);
  assert.match(source, /aria-controls="map-legend"/);
  assert.match(source, /<strong>Political<\/strong>/);
  assert.match(source, /Scenario territories and borders/);
  assert.match(source, /buildPoliticalOwnership/);
  assert.match(source, /drawPoliticalBorders/);
  assert.match(source, /drawPoliticalCities/);
  assert.match(source, /Resources on this map/);
  assert.match(source, /Repair finding/);
  assert.doesNotMatch(source, /canvas\.width = Math\.round\(size\.width \* pixelRatio\)/);
  assert.doesNotMatch(source, /canvas\.height = Math\.round\(size\.height \* pixelRatio\)/);
  assert.match(source, /\[canvasMap\.width, canvasMap\.height, projection\]/);
  assert.match(source, /\}, \[size, fitMap\]\);/);
  assert.doesNotMatch(source, /\}, \[canvasMap, size, fitMap\]\);/);
});

test("the map legend cannot capture Create controls", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const selectWorkspaceMode = \(nextMode: WorkspaceMode\) => \{\s*setShowLegend\(false\)/);
  assert.match(source, /const generateNewMap = \(\) => \{\s*setShowLegend\(false\)/);
  assert.match(source, /const randomiseWorld = \(\) => \{\s*setShowLegend\(false\)/);
  assert.match(css, /\.sidebar \{\s*position: relative;\s*z-index: 2;/);
  assert.match(css, /\.canvas-shell \{[^}]*z-index: 1;[^}]*isolation: isolate;/);
});

test("export confirmation is a modal rather than a sidebar prompt", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(source, /edit-mode-prompt validation-prompt/);
  assert.match(source, /className="export-confirmation-backdrop"/);
  assert.match(source, /className="export-confirmation-modal" role="dialog" aria-modal="true"/);
  assert.match(source, /Export despite validation findings\?/);
  assert.match(source, /exportConfirmationCancelRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, />Cancel<\/button>/);
  assert.match(source, />Open report<\/button>/);
  assert.match(source, />Export anyway<\/button>/);
  assert.match(css, /\.export-confirmation-backdrop \{\s*position: fixed;\s*inset: 0;\s*z-index: 100;/);
});

test("Lua uses an editable, staged, multi-file project workspace", async () => {
  const [source, worker, runtime, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lua-map.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/lua-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /<h3>Lua project<\/h3><span>sandboxed<\/span>/);
  assert.match(source, /Replace main script/);
  assert.match(source, /Add dependencies/);
  assert.match(source, /className="lua-source-editor"/);
  assert.match(source, /Script options/);
  assert.match(source, /GetMapInitData\(\) overrides the fallback dimensions/);
  assert.match(source, /className="lua-hook-editor"/);
  assert.match(source, /Generate map from Lua/);
  assert.match(source, /Regenerate map from Lua/);
  assert.match(source, /className=\{`lua-run-status/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /The result replaces the current map and remains fully editable/);
  assert.match(source, /Execution pipeline/);
  assert.match(worker, /type\(GetMapScriptInfo\)=="function"/);
  assert.match(worker, /type\(GetMapInitData\)=="function"/);
  assert.match(worker, /__set_route/);
  assert.match(worker, /__set_improvement/);
  assert.match(worker, /__set_start/);
  assert.match(worker, /request\.postProcessSource/);
  assert.match(worker, /let lua: LuaEngine \| null = null;\s+try \{\s+const wasmUrl/);
  assert.match(worker, /lua\?\.global\.close\(\)/);
  assert.match(runtime, /mergeScriptStarts/);
  assert.match(runtime, /worker\.onmessageerror/);
  assert.match(css, /\.lua-source-editor,/);
  assert.match(css, /\.lua-pipeline li\.is-complete::before/);
});
