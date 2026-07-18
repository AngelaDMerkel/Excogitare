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
  assert.match(html, /v1\.3\.0/);
  assert.match(html, /The Twin Continents/);
  assert.match(html, /Start locations/);
  assert.match(html, /4 positions/);
  assert.match(html, /Export Civ5Map/);
  assert.match(html, /Export PNG/);
  assert.match(html, /Show map legend/);
  assert.match(html, />Explore</);
  assert.match(html, />Create</);
  assert.match(html, />Repair</);
  assert.match(html, />Lab</);
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
  assert.match(layout, /Excogitare social card with a cropped isometric Civilization V map render/);
  assert.match(renderer, /generateMap\(options\)/);
  assert.match(renderer, /preset: "WILD_REGIONS"/);
  assert.match(renderer, /const PROJECTION = \{ a: 0\.86, b: 0\.25, c: -0\.52, d: 0\.38 \}/);
  assert.match(renderer, /clipPath id="mapSlice"/);
  assert.match(renderer, /SEE THE WORLD\./);
  assert.match(renderer, /THEN CHANGE IT\./);
});

test("README visual guide includes every generation engine and the principal workspaces", async () => {
  const [
    readme,
    renderer,
    excogitare,
    eccentric,
    physical,
    polis,
    projection,
    workspaces,
    createWorkflow,
    exploreLegend,
  ] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/render-readme-gallery.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/readme/excogitare-presets.png", import.meta.url)),
    readFile(new URL("../public/readme/eccentric-presets.png", import.meta.url)),
    readFile(new URL("../public/readme/physical-presets.png", import.meta.url)),
    readFile(new URL("../public/readme/polis-presets.png", import.meta.url)),
    readFile(new URL("../public/readme/projection-types.png", import.meta.url)),
    readFile(new URL("../public/readme/workspace-controls.png", import.meta.url)),
    readFile(new URL("../public/readme/create-workflow.png", import.meta.url)),
    readFile(new URL("../public/readme/explore-and-legend.png", import.meta.url)),
  ]);
  for (const image of [excogitare, eccentric, physical, polis, projection, workspaces, createWorkflow, exploreLegend]) {
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), 2400);
  }
  assert.match(readme, /public\/readme\/excogitare-presets\.png/);
  assert.match(readme, /public\/readme\/eccentric-presets\.png/);
  assert.match(readme, /public\/readme\/physical-presets\.png/);
  assert.match(readme, /public\/readme\/polis-presets\.png/);
  assert.match(readme, /public\/readme\/projection-types\.png/);
  assert.match(readme, /public\/readme\/workspace-controls\.png/);
  assert.match(readme, /public\/readme\/create-workflow\.png/);
  assert.match(readme, /public\/readme\/explore-and-legend\.png/);
  assert.match(renderer, /MAP_PRESETS\.filter\(\(preset\) => preset\.engine === "EXCOGITARE"\)/);
  assert.match(renderer, /MAP_PRESETS\.filter\(\(preset\) => preset\.engine === "ECCENTRIC"\)/);
  assert.match(renderer, /MAP_PRESETS\.filter\(\(preset\) => preset\.engine === "PHYSICAL"\)/);
  assert.match(renderer, /MAP_PRESETS\.filter\(\(preset\) => preset\.engine === "POLIS"\)/);
  assert.match(renderer, /renderCreateWorkflowSheet\(\)/);
  assert.match(renderer, /renderExploreSheet\(\)/);
});

test("site chrome links to the GitHub README", async () => {
  const source = await readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8");
  assert.match(source, /href="https:\/\/github\.com\/AngelaDMerkel\/Excogitare#readme"/);
  assert.match(source, />\s*README\s*<span aria-hidden="true">↗<\/span>/);
  assert.match(source, /target="_blank" rel="noreferrer"/);
  assert.match(source, /<footer className="sidebar-footer">[\s\S]*README[\s\S]*<\/footer>\s*<\/aside>/);
});

test("phone-sized screens reduce the application to generation, map, and download", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /className="mobile-map-actions" aria-label="Mobile map actions"/);
  assert.match(source, /generationRunning \? "Generating…" : "Randomise & Generate"/);
  assert.match(source, /className="mobile-download-button"[\s\S]{0,300}onClick=\{exportCiv5Map\}/);
  assert.match(source, />\s*Download \.Civ5Map\s*<\/button>/);
  assert.match(css, /\.mobile-map-actions \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 640px\), \(pointer: coarse\) and \(max-height: 520px\)/);
  assert.match(css, /\.topbar,[\s\S]{0,240}\.sidebar,[\s\S]{0,320}display: none !important;/);
  assert.match(css, /\.mobile-map-actions \{[\s\S]{0,500}display: grid;/);
});

test("GitHub Pages has an independent static export and deployment workflow", async () => {
  const [nextConfig, packageJson, workflow, verifier] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-pages-build.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(nextConfig, /output: pagesBuild \? "export" : undefined/);
  assert.match(nextConfig, /pagesBasePath = "\/Excogitare"/);
  assert.match(packageJson, /"test:pages": "pnpm run build:pages && node scripts\/verify-pages-build\.mjs"/);
  assert.match(workflow, /pnpm\/action-setup@v6/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /run: pnpm run test:pages/);
  assert.match(verifier, /No Next asset may escape to the github\.io origin root/);
});

test("layer redraws preserve the existing canvas backing buffer", async () => {
  const [source, climateProjection, generator] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/climate-projection.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/map-generator.ts", import.meta.url), "utf8"),
  ]);
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
  assert.match(source, /\[1, 2, 1\]/);
  assert.match(source, /\[2, 3, 2\]/);
  assert.match(source, /\[3, 4, 4\]/);
  assert.match(source, /tileCenter\(col, row, map\.height - 1 - row\)/);
  assert.match(source, />Randomise</);
  assert.match(source, /Generation history/);
  assert.match(source, /MAX_GENERATION_HISTORY/);
  assert.match(source, /openGeneration/);
  assert.match(source, /aria-label="Create workspace"/);
  assert.match(source, /World shape/);
  assert.match(source, /Climate and terrain/);
  assert.match(source, /Players and starts/);
  assert.match(source, /Resources and wonders/);
  assert.match(source, /label: "Excogitare"/);
  assert.match(source, /label: "Eccentric"/);
  assert.match(source, /label: "Physical"/);
  assert.match(source, /label: "Polis"/);
  assert.match(source, /Excogitare worlds/);
  assert.match(source, /Eccentric worlds/);
  assert.match(source, /Physical worlds/);
  assert.match(source, /Polis worlds/);
  assert.match(source, /Geographic granularity/);
  assert.match(source, /Ocean basins/);
  assert.match(source, /Fantasticality/);
  assert.match(source, /Climate logic/);
  assert.match(source, /Lawless · latitude ignored/);
  assert.match(source, /Unbound · geographic delirium/);
  assert.match(source, /Region contrast/);
  assert.match(source, /World extreme/);
  assert.match(source, /Snowball · frozen world/);
  assert.match(source, /Arborea · forest world/);
  assert.match(source, /Plate activity/);
  assert.match(source, /Erosion/);
  assert.match(generator, /Volcanic Island Arcs/);
  assert.match(generator, /Inland Supercontinent/);
  assert.match(generator, /Monsoon Continents/);
  assert.match(generator, /Glacial World/);
  assert.match(source, /Rotation/);
  assert.match(source, /Retrograde · reversed winds/);
  assert.match(source, /Axial seasonality/);
  assert.match(source, /Ocean influence/);
  assert.match(source, /Physical system:/);
  assert.match(source, /Conflict pattern/);
  assert.match(source, /Balance geometry/);
  assert.match(source, /Expansion pressure/);
  assert.match(source, /Naval importance/);
  assert.match(source, /Chokepoint density/);
  assert.match(source, /Contested resources/);
  assert.match(source, /Polis strategic audit/);
  assert.match(source, /hard constraints intact/);
  assert.match(source, /protectedTileIndices\.length/);
  assert.match(source, /Strategy graph/);
  assert.match(source, /Polis strategy graph/);
  assert.match(source, /World structure/);
  assert.match(source, /retained for editing/);
  assert.match(source, /Iteration tools/);
  assert.match(source, /map-generation\.worker/);
  assert.match(source, /kind: "REGENERATE"/);
  assert.match(source, /Cancel · \{generationStage\}/);
  assert.match(source, />Review</);
  assert.match(source, /Multiplayer balance/);
  assert.match(source, /Civ5 validation/);
  assert.match(source, /<h3>Inspect map<\/h3>/);
  assert.match(source, /<h3>Correct map<\/h3>/);
  assert.match(source, /<h3>Validate result<\/h3>/);
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
  assert.match(source, /<span>Pole orientation<\/span>/);
  assert.match(climateProjection, /North \/ south poles/);
  assert.match(climateProjection, /Polar centered/);
  assert.match(climateProjection, /Equatorial pole/);
  assert.ok(source.indexOf("World recipe") < source.indexOf("Pole orientation"));
  assert.doesNotMatch(source, /Build order/);
  assert.match(source, />Export PNG<\/button>/);
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

test("workspace navigation separates Create, Repair, Lab, and Lua stages", async () => {
  const [source, css, readme] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(source, />Design<\/button>[\s\S]{0,700}>Refine<\/button>[\s\S]{0,700}>Iterate<\/button>[\s\S]{0,700}>Edit<\/button>[\s\S]{0,700}>Review<\/button>/);
  assert.match(source, /aria-label="Workspaces"/);
  assert.match(source, /className="workspace-context-bar"/);
  assert.match(source, /className="workspace-context-identity"/);
  assert.match(source, /className="workspace-context-status" role="status"/);
  assert.match(source, /className="workspace-masthead"/);
  assert.match(source, /className="current-map-disclosure"/);
  assert.match(source, /mode === "VIEW" \? \([\s\S]{0,180}className="explore-map-identity"/);
  assert.ok(source.indexOf("</header>") < source.indexOf('className="workspace-context-bar"'));
  assert.match(source, /aria-label="Repair workspace"[\s\S]{0,900}>Inspect<\/button>[\s\S]{0,900}>Correct<\/button>[\s\S]{0,900}>Validate<\/button>/);
  assert.match(source, /aria-label="Lab workspace"[\s\S]{0,900}>Review<\/button>[\s\S]{0,900}>Results<\/button>[\s\S]{0,900}>Guide<\/button>/);
  assert.match(source, /aria-label="Lua workspace"[\s\S]{0,900}>Script<\/button>[\s\S]{0,900}>Generate<\/button>[\s\S]{0,900}>Diagnostics<\/button>/);
  assert.match(source, /const \[repairStage, setRepairStage\] = useState<RepairStage>\("INSPECT"\)/);
  assert.match(source, /const \[luaStage, setLuaStage\] = useState<LuaStage>\("SCRIPT"\)/);
  assert.match(source, /repairSourceMapRef\.current !== mapRef\.current/);
  assert.match(source, /Repair workspace restored · corrections and validation preserved/);
  assert.match(source, /aria-controls="create-workspace-panel"/);
  assert.match(source, /aria-controls="repair-workspace-panel"/);
  assert.match(source, /aria-controls="lab-workspace-panel"/);
  assert.match(source, /aria-controls="lua-workspace-panel"/);
  assert.match(source, /createView === "ITERATE"[\s\S]{0,500}className="iteration-workspace"/);
  assert.match(source, /<h3>\{createView === "REFINE" \? "Refinement recipe" : "World recipe"\}<\/h3>/);
  assert.match(source, /className="engine-carousel-controls"/);
  assert.match(source, /className="engine-carousel" aria-label="Generation engines"/);
  assert.match(source, /aria-label="Previous generation engine"/);
  assert.match(source, /aria-label="Next generation engine"/);
  assert.match(source, /<span>\{engine\.label\}<\/span><small>\{engine\.description\}<\/small>/);
  assert.match(source, /<span>Pole orientation<\/span>/);
  assert.match(source, /name="world-design-step"/);
  assert.match(source, /className="advanced-controls"/);
  assert.match(source, /className="generation-summary action-recipe-summary"/);
  assert.match(source, /id="map-display-panel"/);
  assert.match(source, />Display<\/button>/);
  assert.match(css, /\.workspace-navigation \{[\s\S]{0,180}position: absolute/);
  assert.match(css, /\.workspace-stage-tabs \{[\s\S]{0,220}display: flex/);
  assert.match(css, /\.viewer-app\.workspace-create \{ --workspace-accent: #dfbe72/);
  assert.match(css, /\.viewer-app\.workspace-repair \{ --workspace-accent: #d18a68/);
  assert.match(css, /\.viewer-app\.workspace-lab \{ --workspace-accent: #69aee8/);
  assert.match(css, /\.viewer-app\.workspace-lua \{ --workspace-accent: #d76b60/);
  assert.match(css, /\.workspace-context-bar \{[\s\S]{0,180}height: 42px/);
  assert.match(css, /\.workspace-masthead \{[\s\S]{0,180}border-left: 2px solid var\(--workspace-accent\)/);
  assert.match(css, /\.current-map-disclosure \{/);
  assert.doesNotMatch(source, /className="create-mode-tabs"/);
  assert.match(source, /\{mode === "VIEW" && \([\s\S]{0,120}<div className="explore-sidebar-display">/);
  assert.match(css, /\.advanced-controls/);
  assert.match(css, /\.engine-carousel > button \{[\s\S]{0,180}flex: 0 0 100%/);
  assert.match(css, /\.world-recipe-card \{ display: grid; gap: 8px; \}/);
  assert.doesNotMatch(css, /\.world-model-picker button:not\(\.is-active\) small/);
  assert.equal((source.match(/className="generation-summary/g) ?? []).length, 1);
  assert.match(readme, /## Workspaces[\s\S]{0,2000}Design[\s\S]{0,100}Iterate[\s\S]{0,100}Edit[\s\S]{0,100}Review/);
  assert.match(readme, /Repair separates \*\*Inspect\*\*, \*\*Correct\*\* and \*\*Validate\*\*/);
  assert.match(readme, /Lab separates \*\*Review\*\*, \*\*Results\*\* and \*\*Guide\*\*/);
  assert.match(readme, /Lua separates \*\*Script\*\*, \*\*Generate\*\* and \*\*Diagnostics\*\*/);
  assert.match(readme, /dedicated contextual strip beneath the primary header/);
  assert.match(readme, /compact \*\*Current map\*\* disclosure/);
});

test("Identity Lab retains blind reviews and documents its narrative JSON handoff", async () => {
  const [source, css, model, readme, feature, narratives] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/identity-lab.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/features/identity-lab.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/features/map-type-narrative-identities.md", import.meta.url), "utf8"),
  ]);
  assert.match(source, /className="development-badge">Development<\/span>/);
  assert.match(css, /\.development-badge \{[^}]*background: #245f91;/);
  assert.match(source, /Identity hidden/);
  assert.match(source, /Submit guess and reveal/);
  assert.match(source, /mode === "LAB" \? "Interactive blind identity candidate"/);
  assert.match(source, /mode !== "LAB" && <div className="mobile-map-actions"/);
  assert.match(source, /IDENTITY_LAB_STORAGE_KEY/);
  assert.match(source, /Export JSON/);
  assert.match(source, /Import JSON/);
  assert.match(source, /How to read the JSON/);
  for (const preset of ["LONELY_OCEANS", "SHATTERED_ARCHIPELAGO", "GREAT_WATERSHEDS", "ICEHOUSE_EARTH"]) assert.match(model, new RegExp(`preset: "${preset}"`));
  assert.match(model, /excogitare\.identity-lab/);
  assert.match(model, /docs\/features\/map-type-narrative-identities\.md/);
  assert.match(readme, /## Lab[\s\S]*### Reading Identity Lab JSON/);
  assert.match(readme, /summary\.confusions/);
  assert.match(feature, /Evidence-to-implementation loop/);
  assert.match(narratives, /## Lonely Oceans/);
  assert.match(narratives, /## Broken Island Chains/);
  assert.match(narratives, /## Great Watersheds/);
  assert.match(narratives, /## Glacial World/);
});

test("dense controls expose unclipped contextual help on hover and focus", async () => {
  const [source, css, readme] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const \[uiTooltip, setUiTooltip\] = useState<UiTooltip \| null>\(null\)/);
  assert.match(source, /closest<HTMLElement>\("\[data-tooltip\]"\)/);
  assert.match(source, /document\.addEventListener\("pointerover", onPointerOver\)/);
  assert.match(source, /document\.addEventListener\("focusin", onFocusIn\)/);
  assert.match(source, /className=\{`ui-tooltip\$\{uiTooltip\.above/);
  assert.match(source, /role="tooltip"/);
  assert.ok((source.match(/data-tooltip=/g) ?? []).length >= 30);
  assert.match(css, /\.ui-tooltip \{[\s\S]{0,120}position: fixed;[\s\S]{0,200}z-index: 30/);
  assert.match(css, /\.ui-tooltip \{[\s\S]{0,700}pointer-events: none/);
  assert.match(css, /\.ui-tooltip,[\s\S]{0,180}display: none !important/);
  assert.match(readme, /contextual help on hover and keyboard focus/);
});

test("World Character explains its selected engine-specific consequences", async () => {
  const [source, profiles, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/world-character.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /<legend>World character<\/legend>/);
  assert.match(source, /className="world-character-explanation" aria-live="polite"/);
  assert.match(source, /describeWorldCharacter\(generationOptions\.engine, generationOptions\.style\)/);
  for (const engine of ["EXCOGITARE", "ECCENTRIC", "PHYSICAL", "POLIS"]) assert.match(profiles, new RegExp(`${engine}: \\{`));
  for (const style of ["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"]) assert.match(profiles, new RegExp(`${style}:`));
  assert.match(css, /\.world-character-explanation \{/);
});

test("the map legend cannot capture Create controls", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const selectWorkspaceMode = \(nextMode: WorkspaceMode\) => \{\s*setShowLegend\(false\)/);
  assert.match(source, /const generateNewMap = async \(\) => \{\s*setShowLegend\(false\)/);
  assert.match(source, /const randomiseWorld = async \(\) => \{\s*setShowLegend\(false\)/);
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

test("game-breaking geometry and tile budgets require one checkbox and second modal confirmation", async () => {
  const [source, generator, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/map-generator.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /Show game-breaking options/);
  assert.match(source, /GEOMETRY_OPTIONS\.filter\(\(option\) => allowGameBreakingGeometry \|\| !option\.gameBreaking\)/);
  assert.match(source, /MAP_SIZES\.filter\(\(item\) => allowGameBreakingGeometry \|\| !item\.gameBreaking\)/);
  assert.match(source, /showGameBreakingGeometryConfirmation/);
  assert.match(source, /className="export-confirmation-modal game-breaking-geometry-modal" role="dialog" aria-modal="true"/);
  assert.match(source, /Second confirmation/);
  assert.match(source, /Enable game-breaking generation\?/);
  assert.match(source, /Extreme \(180×94 \/ 16,920 tiles\)/);
  assert.match(source, /Colossal \(170×110 \/ 18,700 tiles\)/);
  assert.match(source, /I accept the crash risk/);
  assert.match(source, /gameBreakingGeometryCancelRef\.current\?\.focus\(\)/);
  assert.match(source, /randomGenerationOptions\(Math\.random, allowGameBreakingGeometry\)/);
  assert.match(generator, /includeGameBreakingOptions \? \[\.\.\.SAFE_MAP_GEOMETRIES, \.\.\.GAME_BREAKING_GEOMETRIES\] : SAFE_MAP_GEOMETRIES/);
  assert.match(generator, /MAP_SIZES\.filter\(\(size\) => includeGameBreakingOptions \|\| !size\.gameBreaking\)/);
  assert.match(source, /size: isGameBreakingMapSize\(normalized\.size\) \? "HUGE" : normalized\.size/);
  assert.match(css, /\.game-breaking-geometry-toggle/);
  assert.match(css, /\.game-breaking-geometry-modal/);
});

test("Lua is visibly experimental and requires entry confirmation", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /className="experimental-badge">Experimental<\/span>/);
  assert.match(source, /nextMode === "SCRIPT" && mode !== "SCRIPT"/);
  assert.match(source, /showLuaExperimentalWarning/);
  assert.match(source, /The Lua workspace is incomplete/);
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="lua-experimental-title"/);
  assert.match(source, /luaExperimentalCancelRef\.current\?\.focus\(\)/);
  assert.match(source, />Stay here<\/button>/);
  assert.match(source, />Open experimental Lua<\/button>/);
  assert.match(css, /\.experimental-badge \{[^}]*background: #9f3028;/);
  assert.match(css, /\.lua-experimental-modal/);
});

test("Lua uses an editable, staged, multi-file project workspace", async () => {
  const [source, worker, runtime, css] = await Promise.all([
    readFile(new URL("../app/civ5-map-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lua-map.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/lua-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /<h3>Lua script<\/h3><span>sandboxed<\/span>/);
  assert.match(source, /Replace main script/);
  assert.match(source, /Add dependencies/);
  assert.match(source, /className="lua-source-editor"/);
  assert.match(source, /Script options/);
  assert.match(source, /GetMapInitData\(\) overrides fallback dimensions/);
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
  assert.match(worker, /let lua: LuaEngine \| null = null;\s+try \{\s+const nextAssetMarker[\s\S]{0,400}const wasmUrl/);
  assert.match(worker, /lua\?\.global\.close\(\)/);
  assert.match(runtime, /mergeScriptStarts/);
  assert.match(runtime, /worker\.onmessageerror/);
  assert.match(css, /\.lua-source-editor,/);
  assert.match(css, /\.lua-pipeline li\.is-complete::before/);
});
