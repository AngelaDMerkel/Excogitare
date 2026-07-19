# Match Intent and Polis

## Contract

- **Status:** Verified for the approved Phase 6 boundary.
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

- [x] Match Intent schema, normalization and migrations implemented.
- [x] Refine exposes simple Human/AI counts and derives Flexible seats without assigning specific civilizations.
- [x] Team intent, competitive strictness and optional start-by-start Human/AI/Flexible/team planning are visible in Refine; civilization identity remains a disclosed Scenario concern.
- [x] Victory defaults, invariants and Randomise behavior verified, including the Unequal Realms exclusion.
- [x] Polis topology responds directionally to Human/AI, teams and victories.
- [x] AI accommodation changes geography without hidden yield bonuses.
- [x] All seven Polis types have distinct runtime programs and diagnostics.
- [x] Polis produces explanatory structural feasibility for every victory; Excogitare, Eccentric and Physical report final-map opportunity without claiming a strategic graph.
- [x] City-state contestability, capital reachability and route redundancy validate.
- [x] Project persistence and Civ5Map/Scenario boundaries are honest.
- [x] Determinism, protection, history, validation, builds and Alpine runtime pass.
- [x] README/help, feature register and final completion claims reconcile.

## Phase 6 implementation evidence

The active implementation must retain the following evidence in `StrategicGraph` and clone it through workers, history and project files: the authoritative Map Type, normalized Match Intent summary, seat/realm roles, route-width and redundancy metrics, city-state contestability, five separate victory findings and disclosed contract relaxations. Review must show these findings without presenting them as guarantees of Civ V AI behavior.

Runtime contracts:

- **Imperial Ring:** a complete lateral ring, shared central objectives and more than one route toward the interior.
- **Opposing Fronts:** two coherent sides and several breaches; Strong AI widens primary routes and adds redundancy.
- **Contested Heartland:** many-to-many approaches to a valuable centre rather than radial single-file spokes.
- **Rival Continents:** two blocs with plural expensive naval or highland hinges.
- **Three Realms:** exactly three realms and graph contact from each realm to both rivals; incompatible player counts are disclosed and normalized downward, never silently disguised.
- **Thalassic League:** redundant naval lanes, port starts and contestable city-state diplomacy.
- **Unequal Realms:** explicit Tall, Wide, War and Turtle geographic roles; it is excluded from ordinary Randomise because its imbalance is intentional.

Final verification passes 119 TypeScript domain tests and 20 rendered-shell tests, TypeScript `--noEmit`, ESLint, `git diff --check`, the vinext production build, the Next.js static Pages build and its export verifier. The rebuilt `node:24-alpine` image `excogitare:1.3.0` is running locally on port 3001 and returns HTTP 200. No manual Civ V load was performed during Phase 6; Civ V remains the final authority for game behavior.
