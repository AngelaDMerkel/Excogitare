# Excogitare Project Files

## Contract

- **Status:** Verified.
- **User outcome:** A user can download the complete authoring state as `.excogitare`, close Excogitare, and safely reimport that file in a later clean session without losing the active recipe, map, history choice, named checkpoints, protection, Scenario draft, derived evidence or editor continuity.
- **Scope:** Bundle layout, manifest, ownership, selectable history, legacy migration, transactional import, archive safety, project identity, unsaved warnings and imported-map promotion.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), [`protection-and-selective-regeneration.md`](protection-and-selective-regeneration.md), history and Scenario schemas.
- **Exclusions:** The release provides no account, cloud save, server persistence or durable browser-storage promise. Civ5Map is not a project file. Unit/event scripting and other future Scenario data remain governed by the Scenario feature boundary.

## Ownership

`ExcogitareProject` is the aggregate root. `GenerationRecipe` owns engine, Map Type, Scale, Archetype, World Character, explicit controls, Generation Effort and nested Match Intent. `Civ5Map` owns the current game-facing tile/scenario snapshot. `ProtectionState`, `ScenarioDraft`, `ProjectHistory` and `ProjectEditorState` each own their corresponding authored or continuity state. Derived structures and assessments retain the generator/pass versions and input hash that produced them; they do not override authored state.

Project name and map name are deliberately separate. Opening a Civ5Map promotes that imported geography into a new unsaved project without changing the source file. Exporting Civ5Map continues to write a clean game file without recipe, protection, project history or private Excogitare fields.

## Bundle contract

Schema-v2 `.excogitare` files are real ZIP containers compressed with DEFLATE. The current layout is:

```text
project.excogitare
├── manifest.json
├── project.json
├── map.json
├── map.civ5map
├── recipe.json
├── protection/state.json
├── scenario/draft.json
├── history/index.json
├── history/snapshots/*.json
├── history/checkpoints/*.json
├── editor/state.json              (optional)
├── derived/evidence.json          (optional)
└── extensions/**/*.json           (optional, safe namespace)
```

The readable manifest records bundle version, Excogitare version, compression, required capabilities, history policy and a SHA-256 digest plus expanded byte count for every payload. Required payloads are explicitly marked. The embedded `map.civ5map` is serialized through the ordinary Civ5Map writer and reparsed during import to confirm that it is a structurally readable map of the declared dimensions.

Two export policies are supported:

- **Full history** retains the current map, up to thirty ordinary generation entries, all named checkpoints and each snapshot's recipe, structure and provenance.
- **Current + checkpoints** omits ordinary generation entries while retaining the current map, active recipe, protection, Scenario draft, editor state, evidence and named checkpoints.

DEFLATE naturally deduplicates repeated JSON structure within the archive without introducing a fragile custom delta format. The compact policy is separately tested to be materially smaller than a thirty-generation full-history bundle.

## Transactional import and safety

Import performs archive inspection and complete parse/validation before calling the application's map replacement boundary. A failed import leaves the active project untouched. The reader rejects:

- compressed files or expanded payload totals above 64 MB;
- more than 160 entries or more than thirty history entries/checkpoints;
- encrypted entries, unsupported ZIP methods and dangerous compression ratios;
- absolute paths, parent traversal, backslashes, control characters, overlong names and duplicate central-directory paths;
- executable extensions and unrecognized content outside the `extensions/` namespace;
- missing required entries or entries not authorized by the manifest;
- byte-count or SHA-256 mismatches;
- malformed project, recipe, map, protection, history, Scenario or editor schemas;
- unsupported required capabilities; and
- unsupported future bundle or legacy schema versions.

Safe unknown root fields, manifest fields, extension metadata and `extensions/**/*.json` payloads survive load and resave. Unknown required data is never guessed. The former monolithic schema-v1 JSON format remains importable through a pure checksum-verifying migration fixture; the next save always writes schema v2.

## Interface lifecycle

- **New project** begins a distinct unsaved authoring document from the current generated or imported map and clears prior history, checkpoints, protection and project-only state after warning about unsaved work.
- **Save project** opens a modal that separates the project name from the map name, explains file-only durability, offers both history policies and downloads a `.excogitare` ZIP.
- **Open project** accepts current ZIP bundles and legacy JSON, validates transactionally, then restores recipe, map, game-breaking permission where necessary, history, checkpoints, protection, Scenario draft, view, Create stage and disclosure state.
- **Open map** remains a separate Civ5Map import and promotes the result to a new unsaved project.
- The top bar identifies the active project and reports **Unsaved**, **Downloaded** or **Local session** state.
- Closing or reloading with authored unsaved changes invokes the browser's unload warning.

Downloaded files are the only durable persistence contract. No part of this implementation relies on localStorage, IndexedDB, an account, a server or a cloud save. Browser download success is the handoff boundary; users must retain and later reimport the downloaded file.

## Failure behavior and limits

Import errors are reported in the existing status surface and do not install any partially decoded state. Export refuses malformed projects and reports the 64 MB boundary, recommending the compact history policy where appropriate. Optional extensions may contain JSON data only; arbitrary files and executable content are intentionally unsupported. Civ V itself remains the final runtime authority for the embedded clean map even after structural reparse and application validation pass.

## Completion gates

- [x] Contract, ownership, failure behavior and exclusions match the approved Phase 9 decision.
- [x] Schema-v2 ZIP/DEFLATE bundle has a readable manifest, independently replaceable payloads and standard SHA-256 integrity.
- [x] Save downloads a complete bundle with Full history or Current + checkpoints policy.
- [x] A later clean session can import without browser/server state.
- [x] Import parses and verifies the entire bundle before replacing the active project.
- [x] Size, entry-count, compression-ratio, capability, checksum, executable, duplicate and traversal limits have direct tests.
- [x] Pure v1 migration has a forward fixture and future bundle/legacy schemas reject honestly.
- [x] Safe unknown root, manifest and extension data survives load/save.
- [x] Unsaved warnings, project/map identity, New, Save, Open and imported-map promotion are explicit.
- [x] History and checkpoint snapshots retain recipe, structure and provenance; compact export materially reduces a thirty-generation project.
- [x] Civ5Map exports remain independent and contain no private Excogitare payload.
- [x] Full regression, type checking, lint, production build, Pages build, Alpine image and live interface pass.
- [x] README/help accurately explains ZIP contents, risks, policies and file-only durability.

## Evidence

- Direct project tests: `tests/generation-substrate.test.ts`.
- Legacy migration fixture: `tests/fixtures/excogitare-project-v1-migration.json`.
- Interface/document contract regression: `tests/rendered-html.test.mjs`.
- Implementation: `lib/excogitare-project.ts`, `lib/authoring-schema.ts`, `app/civ5-map-viewer.tsx` and `app/globals.css`.
- Verification: 135 domain tests and 22 rendered-shell tests pass; TypeScript and repository ESLint pass; Vinext production and GitHub Pages builds pass; the static verifier reports 25 correctly based JavaScript bundles; `node:24-alpine` image `excogitare:1.3.0` responds at port 3001. Live checks cover the non-overlapping 1280px/1024px header, save modal, both history policies, project naming, Unsaved status, Escape dismissal and zero browser console errors.
