# Match Intent and Polis

## Contract

- **Status:** Partial. Match Intent is authored and persisted in Refine; strategic consumption and feasibility reporting remain open.
- **User outcome:** A user can describe who is expected to play and which victory paths deserve emphasis, and Polis turns that intent into meaningful strategic geography while every engine explains likely suitability.
- **Scope:** Human/AI/Flexible counts, advanced seats, teams, victory states, competitive strictness, AI accommodation, feasibility reports and all seven Polis Narrative Map Types.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), [`create-authoring-workflow.md`](create-authoring-workflow.md), Narrative Profiles, start correctness and Scenario handoff.
- **Exclusions:** Match Intent cannot change Civ V AI behavior or actual victory rules. Those rules change only through Game-verified Scenario support.

## Approved intent model

Ordinary Refine records Human, AI and Flexible counts. Advanced controls assign individual Human, AI or Flexible seats and teams. Randomise uses counts and Flexible seats only; it never silently chooses who receives a particular start.

Each victory is Disabled, Enabled or Emphasized. Emphasized is a subset of Enabled, and at least one victory remains enabled. Defaults enable all and emphasize none. Ordinary Randomise may emphasize one or two but never disables any. Emphasis changes candidate preference without making another enabled victory structurally impossible.

## Geographic consequences

Polis consumes Match Intent while constructing strategic nodes, routes, territories and objectives. AI accommodation favors legible expansion basins, wider primary corridors, route redundancy, reachable strategic resources and fewer plans dependent on one-tile tricks. Human seats receive demanding geography only through explicit seat assignment.

Excogitare, Eccentric and Physical consume Match Intent for start/content placement and assessment without pretending to be strategic-graph engines. Review reports Domination, Science, Culture, Diplomacy and Time feasibility separately rather than collapsing them into one balance number.

## Polis catalogue

Imperial Ring, Opposing Fronts, Contested Heartland and Rival Continents are rebuilt against Match Intent. Three Realms, Thalassic League and Unequal Realms enter runtime as distinct types. Team-count and role requirements are hard, disclosed contracts. Unequal Realms is intentionally asymmetric and cannot enter ordinary competitive Randomise without confirmation.

## Failure and persistence

Impossible counts or team contracts block generation or offer a disclosed adjustment. Protected terrain, Scale or geometry conflicts identify the exact failed route or role. Explicit seat assignments persist in `.excogitare`; Civ5Map receives them only through verified Scenario records.

## Completion gates

- [ ] Match Intent schema, normalization and migrations implemented.
- [ ] Refine exposes simple counts and clearly separated advanced seats.
- [ ] Victory defaults, invariants and Randomise behavior verified.
- [ ] Polis topology responds directionally to Human/AI, teams and victories.
- [ ] AI accommodation changes geography without hidden yield bonuses.
- [ ] All seven Polis types have distinct runtime programs and diagnostics.
- [ ] Every engine produces explanatory victory feasibility reports.
- [ ] City-state contestability, capital reachability and route redundancy validate.
- [ ] Scenario/project persistence and Civ5Map boundaries are honest.
- [ ] Determinism, protection, history, validation, builds and Alpine runtime pass.
- [ ] README/help, feature register and final completion claims reconcile.
