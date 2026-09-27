# V2 map studio

## Status and approved contract

**Superseded architecture:** The subsequent [V2 world development](v2-world-development.md) implementation replaces the initial reconstruction pipeline, simplified recipe panel and extracted flat renderer described below. Its record is authoritative for current behavior and verification. The original verification log is retained as historical evidence, not evidence for the rewrite.

**Implemented.** V2 is on `v2/map-studio`, preserving the existing working tree. The [discovery proposal](../multiplayer-map-studio-rebuild-proposal.md) supplies the product direction, with two explicit amendments: exact multiplayer starts are omitted, and the visual reference is [inSANE](https://github.com/AngelaDMerkel/inSANE). Automated checks and the desktop workflow are exercised below. Real-game, user aesthetic, phone-layout and Alpine verification remain open; the whole feature is not called Verified.

The outcome is a map-centred browser studio for generating, refining, sketching, inspecting, repairing, rebalancing, saving and exporting Civ V maps. Great Watersheds is the default positive reference. Recipes can combine gameplay intentions, coherent geography and narrative transformations. Full Randomise changes all supported configuration. Numeric geography controls accept ranges. Refinement retains the existing landscape and recomputes affected systems. Detailed controls remain accessible.

Export is ordinary geography-only `.Civ5Map`. Any modeled start layout is an assessment aid, never an exported multiplayer-start guarantee. Scenario authoring is deferred; legacy tools remain available separately during migration. Real Civ V multiplayer loads and human aesthetic/play review remain empirical verification.

## Completion gates

- [x] Versioned world document, recipes, deterministic generation, worker jobs and atomic cancellation.
- [x] Retained elevation/water state; climate, hydrology, content and legal placement recomputation on refinement.
- [x] Geographic/gameplay recipe composition, bounded candidate search and transparent failure behavior.
- [x] Narrative flooding, crater, thaw and abandoned-engineering transformations with retained causes.
- [x] Region/feature selection, sketches, exact tile edits and preservation constraints.
- [x] Map-centred inSANE-inspired interface, deep controls, layer inspection, history, preview and errors; desktop runtime checked.
- [x] Import, selected repair and optional rebalancing with conservative binary preservation.
- [x] Downloaded project round trip, retained authoring state, drafts, history and legacy-project migration.
- [x] Geography-only export, structural preflight, physical-channel reparse and visible start limitations.
- [x] Domain/regression tests, rendered interface, types, lint, production and Pages checks; see the verification record.
- [ ] Alpine runtime: Docker CLI exists, but its daemon socket is unavailable. No container result is claimed.
- [ ] Phone-layout visual check: responsive CSS and the reduced generation/download surface are implemented; the browser's viewport override left the measured viewport at 1280×720, so phone rendering remains unverified.
- [ ] Representative real Civ V multiplayer loads and user review of the generated geography.
- [x] Documentation/register reconciliation and explicit empirical limitations.

## Failure and preservation rules

Failed or cancelled operations retain the current accepted document. Hard locks and invalid combinations produce a concrete conflict. Preview acceptance is atomic and undoable. Imported maps retain original bytes for supported conservative export; inferred geography is labelled. Unsupported game definitions are disclosed. The user's 27 September instruction authorizes semantic commits on the development branch; pushes still require an explicit request.

## Implementation

- `lib/studio/model.ts` owns the V2 recipe, world, history, geographic edits and job contracts.
- `lib/studio/geography.ts` retains the base surface and river guidance, applies ordered narrative events and sketches, and recomputes moisture, temperature, terrain, legal river edges and selectable geographic objects.
- `lib/studio/operations.ts` adapts existing landform constructors, searches candidates, applies revisions, repairs selected findings, rebalances modeled opportunities and verifies exported physical tile channels. Gameplay construction uses the strategic constructor; geography construction uses the selected geographic family.
- `lib/studio/project.ts` validates and stores V2 state in the existing checked `.excogitare` archive. Legacy authoring data is retained. Imported original bytes survive V2 project handoff.
- `app/studio/` contains the new canvas, recipe controls, contextual inspector, worker and warm-paper visual system. A generated starter world opens immediately. The old application is retained under `/legacy`.
- `tests/fixtures/v2-watersheds-reference.Civ5Map` and its JSON recipe/hash preserve a representative existing-generator reference. This is not a claim to reproduce a specific favourite seed supplied by the user.

## Verification record — 2026-09-26

- The full TypeScript corpus passed 293 tests at the first complete matrix (281 existing tests and the first 12 V2 tests). After final V2 refinements, the focused suite passes **13/13**, including the additional opening-rebalance outcome test. The existing generation modules were not changed by V2 work.
- **25/25** rendered-interface tests cover the retained legacy surface and the V2 default route.
- TypeScript `--noEmit`, repository ESLint and whitespace checks pass. Vinext production and Next/webpack Pages builds and the Pages artifact verifier pass; the production build retains its existing large-bundle advisory.
- Desktop browser checks exercised generation, rainfall refinement, Difference preview, acceptance, undo/redo, a 51-tile range sketch, cancellation without replacing the current map, project download, clean-session reopening and Civ5Map download.
- The browser-downloaded project reparsed with its 80×52 map, rainfall value 100, geographic fields and two prior revisions. The downloaded map reparsed with 4,160 tiles, zero scenario start records and no structural errors.
- The bundled starter has no repair findings beyond the informational “No repairs required” result. An opening rebalance reduces its modeled-site score spread from approximately 97% to 32%; this measures the implemented heuristic, not actual Civ V spawn fairness.
- The native browser download-event waiter timed out, but the actual downloaded file was found, parsed and reopened successfully. The final screenshot is `public/readme/v2-studio.png`.

## Explicit limits

- Existing engines supply initial landforms. V2 reconstructs a continuous surface from their tile relief and retains that surface for further work; it does not retain or claim a complete planetary simulation. Narrative and climate processes are deterministic approximations.
- Review exposes opening quality, reachable expansion, early and later strategic-resource access, coastal access and land contact separately. These are geographic opportunity metrics around modeled sites. They do not prove multiplayer balance, civilization-specific yields, or the locations Civ V will actually choose.
- Exact multiplayer starts and new Scenario construction are excluded. Generated exports omit project-only history, sketches and analytic starts. The legacy workspace retains its original experimental/deferred capabilities separately.
- The current shared placement rules are reused; a comprehensive all-DLC/mod resource-rule database is not newly claimed. Unknown imported definitions and absent original scenario bytes must not be guessed into a compatible file.
- Project archives retain the existing 64 MB compressed/expanded limits. Current + checkpoints is available when full retained history is too large. Browser sessions become durable only through downloaded project files.
- Human recognition, visual preference, real Civ V play, phone rendering and the unavailable Alpine check remain separate verification work.
