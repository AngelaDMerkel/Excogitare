# Game export targets

## Contract

- **Status:** Specified.
- **User outcome:** One authored Excogitare world can leave the application as a Standard Map, a Fixed-Starts Map, or a packaged Scenario Mod. The three products have different installation locations, validation rules and compatibility claims.
- **Scope:** Create, Explore, Repair, Scenario, export confirmation, binary serialization, deterministic map-script fallback, ZIP packaging, `.modinfo`, installation instructions, multiplayer evidence and project persistence.
- **Exclusions:** A binary self-parse, a `SupportsMultiplayer` property or successful single-player load does not prove multiplayer behavior. Steam Workshop publication, DLC repackaging, multiplayer-mod patches and automatic writes into the user's Civ V folders remain out of scope.

## Product boundary

### Standard Map

- Download: `<map-name>.Civ5Map`.
- Installation: the user's Civilization V `Maps` folder.
- Carries: geography, rivers, resources, natural wonders, map metadata and supported physical-map flags.
- Omits: fixed player/city-state starts, factions, cities, ownership, improvements, routes, units and authored rules.
- Lobby behavior: ordinary single-player or multiplayer map selection; Civ V assigns players and starts.

### Fixed-Starts Map

- Download: an explicitly labelled fixed-start map artifact for installation through the Civilization V maps path.
- Carries: the complete Standard Map plus Excogitare's validated major and city-state start plan, with lobby seats mapped to start slots rather than hard-wiring civilizations unless the author explicitly requests true-start factions.
- Multiplayer requirement: the same deterministic artifact must be installed by every participant; host and clients must agree on dimensions, geography, resources, start-slot order and checksum.
- Compatibility rule: Excogitare must not call a fixed-start artifact multiplayer-ready until a real Civ V multiplayer lobby loads it and all participating seats begin on the encoded coordinates. If native `.Civ5Map` player records are ignored in multiplayer, the implementation must use a deterministic map-script transport or disclose and block the multiplayer claim rather than silently falling back to random starts.
- Installation instructions must distinguish the user Maps directory from application `Assets/Maps` if Civ V requires the latter for a map script.

### Scenario Mod

- Download: `<scenario-name>.zip` containing one versioned mod folder.
- Installation: extract the contained folder into Civilization V `MODS`.
- Minimum contents: a stable `.modinfo`, the scenario `.Civ5Map`, installation/readme text and every referenced Lua/XML asset. The manifest must enumerate exact relative paths and checksums and must not reference files absent from the archive.
- Carries: supported factions, fixed starts, teams, cities, ownership, improvements, routes and explicitly compatible rules. Unsupported objectives, briefings, diplomacy, events and units remain disclosed as project-only until separately implemented.
- `SupportsMultiplayer` is emitted as `0` until the packaged scenario has passed an actual multiplayer scenario/mod test. It may never be inferred from structural validation alone.

## Required interface

1. **Export Civ5Map** becomes an export chooser with Standard Map and Fixed-Starts Map; Scenario Mod remains available from Scenario → Validate.
2. Each choice shows its installation folder, retained content, omitted content, multiplayer status and any manual confirmation before download.
3. Mobile retains its simple Standard Map download. Fixed starts and Scenario Mod require the full interface because their validation and installation disclosures cannot be safely compressed into the mobile boundary.
4. Repair preserves the source product type by default and may convert a legacy Excogitare synthetic scenario only to Standard Map unless the user explicitly selects a separately validated fixed-start target.

## Data and validation

1. Export target is explicit operation state and must not mutate the map, recipe, project or history.
2. Fixed-start validation requires at least one major start, exact active-slot counts, five-hex global spacing, legal passable plots, accessibility, unique coordinates, city-state separation and deterministic seat ordering.
3. Scenario validation additionally covers faction identities, teams, cities, ownership, improvement/route tables, rules, manifest paths and package checksums.
4. Every product is parsed from its produced bytes/archive and compared with the authoritative authored state appropriate to that product.
5. Unknown WorldBuilder blocks are preserved when editing imports and never guessed when generating a new product.

## Multiplayer acceptance matrix

The Fixed-Starts Map remains **implemented, not multiplayer verified** until all of the following have recorded evidence:

- two human seats in a native LAN/Internet lobby;
- human plus AI seats;
- city states present;
- non-team and team arrangements;
- host and non-host start-coordinate agreement;
- restart determinism;
- all clients using the same artifact from the documented installation path;
- no red-map/checksum mismatch, load crash, immediate desynchronization or random-start fallback.

Standard Map multiplayer compatibility and Scenario Mod multiplayer compatibility are separate claims and separate matrices.

## Completion gates

- [x] Contract, product boundary, failure behavior and exclusions recorded.
- [ ] Known-good Firaxis and community fixtures catalogued by product type.
- [ ] Export-target data model and chooser implemented without map mutation.
- [ ] Standard Map remains structurally and behaviorally verified.
- [ ] Fixed-Starts Map writer or deterministic map-script transport implemented and round-tripped.
- [ ] Scenario Mod ZIP, `.modinfo`, paths and checksums implemented and round-tripped.
- [ ] Repair and imported-file preservation behavior covered.
- [ ] Full tests, lint, type checking, production/Pages builds and Alpine runtime pass.
- [ ] README and in-product installation guidance reconciled.
- [ ] Manual Civ V single-player, fixed-start multiplayer and packaged Scenario Mod matrices recorded independently.

## Current evidence

- Civ5MapImage documents start coordinates inside the 436-byte player record in the extended game-description portion of a `.Civ5Map`; there is no start-coordinate field in the eight-byte physical geography tile.
- Installed Firaxis geography/map-pack files either end after geography or contain zero player records. Installed Firaxis files with player records are tutorials or scenarios.
- Installed map-script mods such as Fantastical and PerfectWorld3 declare a `MapScript` entry point and `SupportsMultiplayer=1`; their starts are assigned at deterministic generation time rather than read from a geography-only tile grid.
- The installed Tatooine map is marked as multiplayer-capable but contains zero player records despite its description discussing stable slot behavior. This demonstrates why package metadata and prose are not proof of encoded fixed starts.
- Community reports consistently distinguish ordinary custom-map multiplayer from `Load Scenario` start behavior. These reports guide the risk model but do not replace the required local multiplayer matrix.

