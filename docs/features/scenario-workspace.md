# Scenario Workspace

## Contract

- **Status:** Partial. The five-stage workspace, map-linked authoring model, project round trip, compatibility ledger, validation and Repair handoff exist. Generated scenario Civ5Map writing is withdrawn after representative files failed to load in Civilization V.
- **User outcome:** A user can author and retain a Scenario draft in an `.excogitare` project and conservatively edit records already present in an imported scenario. New fixed scenarios are not offered as game-ready Civ5Map files.
- **Scope:** Workspace navigation, ScenarioDraft, faction/entity authoring, semantic objectives, compatibility labels, validation, Repair handoff and confirmed export.
- **Dependencies:** [`excogitare-project-files.md`](excogitare-project-files.md), Civ5Map parsing/writing, start correctness, validation/Repair and semantic objects.
- **Exclusions:** Unsupported units, diplomacy, events and rule fields remain Project only. Lua/modinfo compilation is a separate future compatibility claim.

## Stage ownership

The workspace follows **Setup → Factions → World → Objectives → Validate**.

- **Setup:** name, description, ruleset/mod profile, fixed/flexible intent, slot capacity and source-format compatibility.
- **Factions:** civilization, leader, major/city-state status, playable/Human/AI/Flexible intent, team/color, start or starting city and slot ordering.
- **World:** cities, tile ownership, borders, improvements, routes, starts and layer-based batch editing.
- **Objectives:** intended victories, faction/team goals, protected sites, semantic regions and Project-only briefings.
- **Validate:** export readiness, unsupported-field disclosure, shared map validation and Repair handoff.

Switching workspace or stage preserves map, view, Create/Repair state and ScenarioDraft. Scenario assignments may supersede generated Match Intent for export without erasing the recipe that created the geography.

## Compatibility levels

Every record family advances independently through Read, Edit, Write and Game verified. A parsed field is not writable evidence, and a round trip is not Game verification. The interface labels each capability and blocks required incompatible exports rather than silently omitting them.

## First Game-verified boundary

The first claim requires metadata; major/city-state slots; civilization, leader, team, team color and playable status; starts; city name/owner/population/location; tile ownership/borders; improvements; roads/railroads; and byte-safe preservation of unrelated records.

Units, diplomacy, wars, scripted triggers/events, custom victory-rule mutation, era/game-speed/turn/calendar mutation, briefings and faction objectives remain Project only until independently promoted.

## Validation and Repair

Validate covers slots, teams, identifiers, start legality and five-hex separation, cities and entity references, ownership, objectives, reachability, scenario markers, record sizes, round trip and shared terrain/river/resource rules. **Send fixable findings to Repair** is explicit; Validate never silently mutates the Scenario. Export uses a modal listing blockers, warnings and Project-only omissions.

## Completion gates

- [x] Scenario workspace and five stages preserve state and view.
- [x] ScenarioDraft and compatibility schemas migrate and round-trip in projects.
- [x] Imported records initialize the draft without mutating source bytes.
- [x] Every family exposes honest Read/Edit/Write/Game-verified capability.
- [ ] New-scenario faction, start, city, ownership, improvement and route writing loads successfully in Civ V. Existing imported records remain editable in place.
- [x] Project-only data is retained and disclosed rather than silently discarded.
- [x] Validators cover slots, links, identifiers, starts, objectives and record sizes.
- [x] Repair handoff is explicit and export confirmation is modal.
- [ ] Representative exports preserve unrelated bytes and load in Civ V.
- [x] Existing import, Repair, generation, project and export regressions pass.
- [x] Documentation, builds, Alpine runtime and final claims reconcile.

## Implemented evidence

- Violet peer-workspace navigation and Setup, Factions, World, Objectives and Validate stages operate against one persistent ScenarioDraft without resetting the viewport.
- Generated and imported maps initialize project-side factions, starts, existing cities, ownership, declared improvements and routes. Imported fixed player/city/type blocks cannot be resized through the interface or exporter.
- Generated Scenario drafts remain project-only at the game-file boundary. The former compact writer omitted required Firaxis type dictionaries and opaque victory/game-option payloads; its self-round-trip tests were not game compatibility evidence.
- The World layer brush can apply or clear ownership, improvement and route families independently across a bounded hex radius; individual sparse records remain directly editable.
- Fixed imported player records update civilization, leader, team colour, team, playable state and coordinates in place. Existing city records update name, owner, population and tile link. Tile metadata updates ownership, declared improvements and roads/railroads.
- Export preflights the actual imported source buffer when one exists, structurally inspects and reparses the encoded result, blocks errors, and discloses Project-only omissions in a modal.
- Scenario and project tests, the complete typed regression suite, rendered-shell checks, lint, type checking, production build, GitHub Pages export and Node 24 Alpine container pass. These prove implementation integrity, not Civilization V runtime acceptance.
