# Excogitare Project Files

## Contract

- **Status:** Partial. A versioned checksummed monolithic project file is downloadable and transactionally reimportable; compression, migrations and warning/history-policy UX remain open.
- **User outcome:** A user can download the complete authoring state as `.excogitare`, close the application, and safely reimport it in a later clean session without losing recipe, history, protection or Scenario work.
- **Scope:** Bundle layout, manifest, ownership, optional history, migrations, transactional import, safety limits, unsaved warnings and imported-map promotion.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), protection, history and Scenario schemas.
- **Exclusions:** The release provides no account, cloud save, server persistence or durable browser-storage promise. Civ5Map is not a project file.

## Ownership and bundle

`ExcogitareProject` is the aggregate root. `GenerationRecipe` owns nested Match Intent; no duplicate payload may claim it. The bundle contains a manifest, clean Civ5Map snapshot, recipe, derived structures/assessments, protection, Scenario draft/compatibility, history index/snapshots and optional thumbnails.

Every persisted root uses `schemaVersion`. The manifest records Excogitare version, payload hashes, compression, required capabilities and included-history policy. Derived caches include generator/pass versions and input hashes and may be invalidated after import.

## User workflow

- **New Project** begins from generated geography, imported Civ5Map or an empty safe map.
- **Save Project** downloads the bundle and states whether all history or current plus named checkpoints is included.
- **Open Project** validates and imports `.excogitare`; **Open Map** remains a separate Civ5Map action.
- Reload/close with unsaved changes warns that work will not persist unless downloaded.
- Project name and map name are separate, related fields.

Downloaded files are the only durable persistence contract. Any future browser recovery cache is best effort, disposable and never described as saved work.

## Safety and migrations

Import rejects path traversal, executable content, duplicate entries, checksum failures, oversized payloads, missing required data and unsupported future schemas before replacing the active project. Migrations are pure version-to-version transforms with fixtures. Unknown optional data survives where safe; missing required data is never guessed.

History snapshots use structural sharing or compressed deltas only where recovery remains straightforward. Corruption in an optional thumbnail cannot authorize accepting corrupt authored state.

## Completion gates

- [x] Manifest, payload schemas and ownership match the frozen contract at schema version 1.
- [ ] Save downloads a complete bundle with selectable history policy. The current monolithic file includes all thirty generations; policy choice and compression remain open.
- [x] A later clean session imports the project without browser/server state.
- [x] Import parses and verifies before replacing the active project.
- [ ] Size, entry, compression, checksum and traversal limits are tested. The 64 MB, thirty-history, checksum and monolithic-format boundaries are tested; archive-entry/compression/traversal gates are inapplicable until a compressed container is introduced.
- [ ] Schema migrations have forward fixtures and honest future-version rejection.
- [ ] Unknown optional fields survive safe load/save paths.
- [ ] Unsaved warnings and project/map identity are clear and accessible.
- [x] Civ5Map exports remain independent and contain no private Excogitare payload.
- [ ] Large-map/history performance, builds, Pages and Alpine runtime pass.
- [x] README/help and completion claims clearly explain file-based persistence and the current monolithic-file limitation.
