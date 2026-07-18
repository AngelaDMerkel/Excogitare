# Scenario Workspace

## Contract

- **Status:** Specified.
- **User outcome:** A user can turn generated or imported geography into an authored fixed Scenario through **Setup → Factions → World → Objectives → Validate**, while clearly seeing which data can actually survive a Civ5Map export.
- **Scope:** Workspace navigation, ScenarioDraft, faction/entity authoring, semantic objectives, compatibility labels, validation, Repair handoff and confirmed export.
- **Dependencies:** [`excogitare-project-files.md`](excogitare-project-files.md), Civ5Map parsing/writing, start correctness, validation/Repair and semantic objects.
- **Exclusions:** Unsupported units, diplomacy, events and rule fields remain Project only. Lua/modinfo compilation is a separate future compatibility claim.

## Stage ownership

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

- [ ] Scenario workspace and five stages preserve state and view.
- [ ] ScenarioDraft and compatibility schemas migrate and round-trip in projects.
- [ ] Imported records initialize the draft without mutating source bytes.
- [ ] Every family exposes honest Read/Edit/Write/Game-verified capability.
- [ ] First-boundary faction, start, city, ownership, improvement and route editing works.
- [ ] Project-only data is retained and disclosed rather than silently discarded.
- [ ] Validators cover slots, links, identifiers, starts, objectives and record sizes.
- [ ] Repair handoff is explicit and export confirmation is modal.
- [ ] Representative exports preserve unrelated bytes and load in Civ V.
- [ ] Existing import, Repair, generation, project and export regressions pass.
- [ ] Documentation, builds, Alpine runtime and final claims reconcile.
