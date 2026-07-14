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
  assert.match(html, /v0\.1\.2/);
  assert.match(html, /The Twin Continents/);
  assert.match(html, /Start locations/);
  assert.match(html, /4 positions/);
  assert.match(html, /Export Civ5Map/);
  assert.match(html, />Explore</);
  assert.match(html, />Create</);
  assert.match(html, />Lua</);
  assert.match(html, /Edit map name and description/);
  assert.doesNotMatch(html, /Files stay on this device/);
  assert.match(html, /Open map/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("layer redraws preserve the existing canvas backing buffer", async () => {
  const source = await readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8");
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /if \(canvas\.width !== backingWidth\) canvas\.width = backingWidth/);
  assert.match(source, /if \(canvas\.height !== backingHeight\) canvas\.height = backingHeight/);
  assert.match(source, /renderCanvasRef = useRef<HTMLCanvasElement \| null>\(null\)/);
  assert.match(source, /const paintedTiles = drawMap\(renderContext/);
  assert.match(source, /if \(map\.tiles\.length && paintedTiles === 0\) return/);
  assert.match(source, /context\.drawImage\(renderCanvas, 0, 0\)/);
  assert.match(source, /\[4, 5, 1\]/);
  assert.match(source, /\[3, 4, 2\]/);
  assert.match(source, /\[2, 3, 4\]/);
  assert.match(source, /tileCenter\(col, row, map\.height - 1 - row\)/);
  assert.match(source, />Randomise</);
  assert.match(source, /aria-label="Create tools"/);
  assert.match(source, /World shape/);
  assert.match(source, /Climate and terrain/);
  assert.match(source, /Players and starts/);
  assert.match(source, /<span>Wrap type<\/span>/);
  assert.match(source, /<span>Geometry<\/span>/);
  assert.match(source, /<span>City states<\/span>/);
  assert.match(source, /projection-button/);
  assert.match(source, /unprojectPoint/);
  assert.match(source, /drawIsometricSidewalls/);
  assert.match(source, /drawIsometricRelief/);
  assert.match(source, /closestIsometricTile/);
  assert.match(source, /ISO 3D/);
  assert.doesNotMatch(source, /canvas\.width = Math\.round\(size\.width \* pixelRatio\)/);
  assert.doesNotMatch(source, /canvas\.height = Math\.round\(size\.height \* pixelRatio\)/);
});
