# V3 · Generate and Refine

The approved V3 browser application, using the Wayfinder visual foundation. Its source remains in this directory; the production build copies it to `public/v3`.

## Open

From the repository root, run `pnpm run build:v3` to build the worker and copy the application to `public/v3`. Production and Pages builds include this step. V3 is the homepage at `/`; `/v3/index.html` is also available (both under `/Excogitare` for Pages). For the existing standalone preview, serve this directory with `python3 -m http.server 3033 --bind 127.0.0.1` after building. All generation runs locally in a dedicated browser worker.

## Theme

Wayfinder uses the approved compass rose and outlined uppercase wordmark in gold (#d9b678) on a night header (#252c40). The surrounding studio uses warm paper controls, a lighter neutral canvas (#ECEBE7), and navy actions and selection accents. The map title retains its approved Baskerville treatment. Brand SVGs and browser icons are copied unchanged from the production assets; no font file or remote asset is needed. See `brand/README.md` for source and usage details.

## Generate

**Randomise all** sits directly below Generate inside the sidebar. It chooses fresh settings across all eleven Standard controls, including Tiny–Huge sizes, and generates a map. Once the result is accepted, Standard displays the chosen settings for further tweaks. The independent Advanced draft is retained; cancelled/failed requests leave the previous settings intact.

The basic editor contains eleven broad dropdowns. Size includes the complete native Duel–Colossal range. Geometry adds Needle, Ribbon, Pin and String; the extended choices are grouped as Experimental in both Standard and Advanced. They require explicit selection; Randomise all keeps its existing Tiny–Huge/four-geometry pool, and mobile keeps compact sizes. Its spacing adapts to window height, and the complete sidebar scales down further on short desktop windows so all eleven fields and both generation actions stay visible. Save follows the scaled panel, with the history fade still ending 32px above it. Advanced uses the same sidebar dimensions, scale, 11px text and side-by-side label/control grid as Standard, and scrolls inside that shared frame. Refine uses that same Generate reference frame and scrolls its content within it. All workspaces load the shared `sidebar.css` rules. Opening **Advanced options** replaces them with the v1 controls within Generate. Collapsing **Advanced options** restores the basic editor. Both drafts are retained; only the visible editor supplies the generation request. There is no separate Custom workspace.

Generate now runs the V3 pipeline: seeded gameplay plan → native engine geography → climate and movement → starting regions and content → resource normalization → final assessment. The Standard controls affect actual maps. Advanced uses the four native engines and the original map-type catalogue. A fresh seed is used unless an Advanced seed is entered. Map details retains the seed, premise and assessment warnings. Experimental Size and Geometry choices also show the approved amber icon inside their dropdown, before the arrow. Hover, keyboard focus or click opens the explanation; Escape or clicking outside dismisses it. Both editors use the same treatment.

Standard normalizes each planned opening to the same bonus/luxury/early-strategic resource budget and favors comparable reachable land. Challenge sets the bonus budget. Native Advanced settings retain their own starts and content policy. Native population restrictions can make explicit requests infeasible; Automatic resolves Three Realms to three majors and Lonely Oceans to no city states.

Generate becomes Cancel generation while a worker is running. Progress uses the existing Randomise-all slot, keeping the sidebar, controls and Save button the same size and position throughout the job. Failed or cancelled jobs preserve the accepted map and history. The initial sample and repair example remain demonstrations.

## Save

Desktop **Save .Civ5Map** sits 12px below the left sidebar in Generate and Refine. **Layers** sits above the snapshots, aligned with the sidebar top and matching the 88px thumbnail width, with a 12px gap before the first snapshot. An opaque paper background keeps it visible. The approved checklist opens over the canvas with Relief, Vegetation, Resources, Hex grid and Planned starts controls. It stays outside map-fit calculations, so opening or closing it preserves map position and zoom. Close, Escape and outside clicks dismiss it; the menu repositions within smaller desktop windows and closes on mobile. Planned-start markers make the evaluated regions inspectable; ordinary game-map exports still let Civ V assign starts. It downloads the accepted map through the existing writer and blocks supported placement or binary errors. Keep/Kept, bookmark filtering and saved-state markers are removed.

Save uses the existing `.Civ5Map` format. Civ VI export is not implemented. Ordinary Civ5Map output does not carry the planned starting positions; Civ V assigns starts at game creation.

## Mobile

The mobile application shows the accepted map and exactly **Randomise** and **Save**. It hides editing, imports, history, layers, zoom buttons and configuration panels, and closes an open desktop dialog when entering mobile. Mobile Randomise chooses a new compact-size Standard request and runs the real generator, independently of hidden Advanced settings. Save prepares the accepted `.Civ5Map` using the existing writer; files with supported placement or binary errors are blocked. Imported maps retain original bytes for the existing update writer. Pending previews are not exported.

Shared desktop/mobile Save export/parse checks passed for all six samples and an imported map. The in-app browser download-event waiter timed out for both controls, and download delivery has not been independently confirmed. The link receives the verified Blob and filename. No successful browser delivery is inferred from serialization alone.

## Refine

Import a local `.Civ5Map`, select a map area, preview Add woodland or Lower mountains, or check tile legality. Choose corrections and compare original/proposed before applying. Map details includes an example with illegal placements. The original remains in map history.

Import uses the existing parser. Checks reuse feature/resource/wonder placement rules plus flat-water validation. Corrections remove incompatible items or flatten raised water. Full structural recovery, hydrology repair, exhaustive mod compatibility and game validation are outside this V3 implementation.

## Boundaries

The latest 100 accepted snapshots and the selected map are stored locally in this browser using IndexedDB and restored after reload. Imported source bytes are retained with each snapshot. Generated snapshots retain the request, seed, plan, climate evidence and final assessment. Refine marks that assessment stale after accepted edits. Generation drafts, pending previews and view settings remain session-only. Mobile Save provides the accepted game map; a portable project file is not provided. Resource-budget equality applies to the planned starting areas. Terrain opportunity is an estimate, and remaining differences are reported. Exact multiplayer starts and human gameplay fairness are not guaranteed. Nothing is uploaded. Failed imports and discarded previews preserve the accepted map.

## Files

- `index.html`, `style.css`, `app.js`: isolated interface, map preview, history and Refine interactions.
- `theme.css`, `brand/`: approved Wayfinder theme, outlined identity and browser icons.
- `dimensions.js`: generated native size/geometry catalogue shared with request validation.
- `generation-controls.js`: retained basic and Advanced drafts; the visible editor supplies the request.
- `generation-client.js`: worker lifecycle, progress, cancellation, timeout and stale-message protection.
- `../../lib/v3/`: validated requests, gameplay plan, climate, starting regions, resource balancing and independent final-map assessment.
- `../../scripts/build-v3.mjs`: worker/parser bundling and production static-asset packaging.
- `map-fit.js`: fits the map into a clear rectangle between measured controls.
- `history-carousel.js`: aligns the history fade with the sidebar bottom.
- `sidebar.css`: shared panel width, spacing, control grid, frame scaling and action/progress layout for Generate, Advanced and Refine.
- `layers.css`, `layers.js`: approved checklist overlay, shared by Generate and Refine; keeps existing native layer inputs and rendering handlers.
- `sidebar-fit.js`: measures the Standard Generate reference for every desktop workspace; updates canvas/history alignment.
- `dimension-warnings.js`, `dimension-warnings.css`: approved inside-control warnings for experimental dimensions in both editors.
- `snapshot-store.js`: local snapshot storage, selection and the latest-100 limit.
- `check-history.html`, `check-history.js`: browser checks using a disposable IndexedDB database.
- `v1-catalogue.js`: map types, defaults and archetypes extracted from original production source.
- `samples.js`, `prepare-fixtures.mjs`: reduced existing-engine map illustrations and optional preparation script.
- `rules.ts`, `rules.js`: adapter and bundled existing parser, placement checks and map writer. Bundle with esbuild using `--bundle --format=iife --global-name=V3ExistingRules --outfile=rules.js`.

The branch starts from the committed native-foundation base. Pending V2 application changes remain in their original checkout. V3 is the homepage and is also packaged at `/v3/index.html`; the original application remains available at `/legacy`. The native generator exposes one candidate-construction entry point for V3, while legacy generation callers retain their original contract.

## Selected design

**Two Workspaces** is the only active design: Generate and Refine. Open `/` or the retained `/alternatives/peers.html` link. The former comparison page redirects to the selected design. `workspace.html` and `editor.html` remain historical files and are no longer linked or maintained.

Advanced uses a stable accordion label and rotating chevron. Expanding replaces Standard fields; collapsing restores them. Mobile remains map + Randomise + Save only.

## Canvas and history

The selected desktop design uses the entire window as the map canvas. Controls float above it. Drag to pan under the controls; scroll to zoom at the pointer. Horizontal or Shift-wheel motion pans. Automatic framing chooses unobscured space between the visible controls, with a 32px desktop gap (20px on mobile). Dimensions and the zoom/Fit toolbar are omitted. Fitted maps follow layout changes; manually zoomed cameras retain their position and scale.

The unboxed map title uses a 30px Baskerville serif treatment (26px on mobile), medium weight, tighter tracking and Wayfinder navy. Local serif fallbacks are used on other systems. History uses compact 88×52px borderless thumbnails in a 104px column on the right. Its 96px fade finishes 32px above the sidebar's lower edge. Newest snapshots appear at the top; restoring an older map keeps its place in history. The column scrolls by wheel or keyboard. The current snapshot stays above the fade. Accessible names, keyboard restoration and the current-snapshot marker remain available. Mobile keeps Randomise and Save and hides history.

The browser retains up to **100 accepted snapshots** across reloads. Adding another replaces the oldest snapshot. Legacy kept flags no longer affect retention; existing records are retained until they age out at the limit. Storage failures are reported without replacing the accepted map. If storage is unavailable on initial load, the app reports a session-only fallback.

History is local to this browser and site address. Clearing site data removes it. Other open tabs see newly stored records after reload. This is convenient local history; portable `.excogitare` projects remain future work for V3.

## Previous history studies

The right column is selected. `/history-layouts/` redirects to the active design; `right.html` and `/alternatives/peers.html` remain aliases. `history-layouts/bottom.html` retains the earlier comparison with twelve prepared, session-only snapshots. It is no longer the active design.

## Latest verification

Fit geometry passed nine layout/aspect-ratio cases and empty/blocked/invalid cases. The real browser restored history and the selected map after reload. Isolated IndexedDB checks passed the latest-100 limit, oldest-first replacement regardless of legacy kept flags, concurrent additions and imported-byte preservation. Desktop inspection confirmed transparent title styling, borderless thumbnails and the carousel ending 32px above the sidebar in Standard, Advanced and Refine. Keyboard restoration keeps the active thumbnail clear of the fade. Save placement and the canvas Layers menu were checked; mobile still exposes only Randomise and Save. The latest functional capture is `live-generation-preview.jpg`, with Planned starts and Resources enabled. Earlier images record the visual design process.


## Native coastlines

Generator version **3** builds connected landforms with curved branching interiors, varying widths and broad bays before sea-level selection. That structure contributes to relief; bounded land/water influence passes through native refinement. Independent finished-map checks reject large or repeated unexplained oval islands. Supported volcanic islands and hollow atolls remain possible.

Existing history and imports keep their original geography. Map details marks earlier generator snapshots; Generate or Randomise creates maps with the new construction. The check targets geometric island silhouettes and does not score every aspect of appearance.

Version 3 generates local geography in physical hex space. Rotation, widths, source areas, field warping and path distances share one length scale instead of stretching separately with width and height. Connected growth uses only the available grid; it keeps its area budget when a narrow boundary changes where it can grow. Latitude still describes the whole world. The same coordinate contract reaches all four native engines through their shared influences, while their existing native construction remains in place.

See [generation within the canvas](../../docs/features/v3-canvas-generation.md) for tests, comparisons and limits. Earlier saved maps retain their original geography.

[Same-seed comparison](coastline-construction-preview.jpg) · [Implementation and verification](../../docs/features/v3-landform-construction.md)

## Generator verification

`pnpm run test:v3` checks deterministic replay, invalid requests, actual Standard behavior, reachable resource budgets, four-engine Advanced generation, map round trips, cancellation and infeasible requests. `pnpm run audit:v3` checks all 33 map types with compatible populations and twelve seeded Randomise requests. See `../../docs/features/v3-generation-pipeline.md` for the full evidence and limits.

`pnpm run audit:v3-landforms` expands this to 109 catalogue, Excogitare geometry/wrap and Randomise cases. Landform tests include reproduced seeds, shape fixtures, map-family topology and resolution behavior. The native comparison can be regenerated with `node --experimental-strip-types scripts/render-v3-landform-review.mjs --single`.

Extended dimensions are covered by `tests/v3-dimensions.test.ts`, included in `pnpm run test:v3`. See [extended-dimension evidence and limits](../../docs/features/v3-extended-dimensions.md).
