# V3 generation pipeline

Status: **Implemented**. Generation, integration and the corrected native landform construction pass the recorded automated/browser checks. The user approved the V3 visual foundation and authorized the previously specified generator change on `codex/v3-world-discovery`.

## Contract

Generate actual maps from a seeded plan: gameplay premise and broad preferences → native engine geography → climate/ecology and movement → content and starting-opportunity normalization → independent acceptance checks. Standard preserves eleven abstract categorical controls. Advanced replaces Standard, uses the original catalogue, and honors explicit settings; inactive drafts do not influence a request. Fresh seeds produce variation; the same request and seed reproduce the same accepted map.

The gameplay plan records homeland and expansion capacity, connection/isolation intent, competition and resource opportunities. Isolation can be expressed by water, dry interiors or mountain access; Mobility controls local traversal friction independently of mountain abundance. Challenge affects abundance and settlement quality without deliberately giving one player an unusable opening. Climate and Regional variety affect actual terrain and vegetation. Reuse the four existing native engines and Civ5Map rules through explicit adapters, with no changes to their legacy callers.

Acceptance must inspect finished tiles: large/repeated geometric coastlines, requested dimensions and major-player count, passable/spaced starts, reachable opening land and resources, content legality and measured opportunity spread. Record bounded corrective edits and disclose remaining opportunity differences. These are geographic proxies; no exact multiplayer starts or Civ V outcome guarantee is implied. Standard Map exports still let Civ V assign starts.

## Integration and failures

- Use a dedicated worker with progress, cancellation and stale-response guards. A failed/cancelled request preserves the accepted map and history.
- Generate, accepted Refine edits and imports retain browser-local snapshots, newest first, capped at 100. Store request, seed, plan and assessment with generated snapshots.
- Save uses the existing Civ5Map writer. Terrain/resource round trips are required; retain original imported bytes.
- Existing prepared examples may remain as initial/demo records, but Generate and mobile Randomise must run the real pipeline.
- Keep the approved Wayfinder layout; use compact progress and error feedback, not new configuration hierarchies.

## Completion gates

| Gate | Status and evidence |
|---|---|
| Contract/model | Verified validated requests, independent stage seeds, preserved drafts, explicit automatic defaults and a retained gameplay plan. |
| Domain | Verified directional Standard outputs, all 33 Advanced map types with compatible populations, reachable equal early-resource budgets, final supported placement checks and independent coastline acceptance. See the landform record for the expanded audit. |
| Interface/rendering | Verified worker-backed desktop/mobile generation, progress/cancellation, failure preservation, and optional Planned starts/Resources overlays in the approved layout. |
| Editing/history | Verified accepted-only history insertion, reload persistence of seed/assessment, and stale assessment marking after accepted Refine edits. |
| Export | Generated geography serialization/parse checks pass. Actual import and preparation of its Save link pass; browser download delivery and in-game compatibility remain unverified. No synthetic scenario starts. |
| Repair | Actual import and generated-map placement inspection pass. Existing selected placement corrections are retained; exhaustive mod/structural recovery is excluded. |
| Verification | Latest 305-test full regression run, 24 final V3 tests, 23 rendered-interface tests, 109-case landform/catalogue/random audit, types, lint, production and Pages checks pass. See the landform record for chronology and Huge-map smoke checks. Alpine unavailable: Docker daemon is stopped. |
| Documentation/reconciliation | README, register, pipeline record, build scripts and UI wording reconciled with actual generation and its limits. |

## Boundaries

Portable V3 project bundles and representative Civ V play are separate work. Existing engine evidence that becomes stale after V3 climate, content or start changes must be marked stale. Browser persistence retains V3 provenance; Civ5Map is geography-only. Do not commit or push under the user's working agreement.


## Native planning adjustment

The first visual check exposed small circular islands caused by hard, tiny homeland land masks. Replace those with broad, irregular semantic hints consumed by native scalar fields, plate centers and strategic anchors. Starting regions are selected from realized passable geography; no particular tile is promised as a start. Recheck the control and capacity matrix after this change.


## Competition output check

Homeland spacing alone did not consistently create stronger competition in the final geography. Standard's content pass now relocates existing luxury and late-strategic deposits outside the opening regions toward private hinterlands or shared frontiers according to Competition. It preserves deposit counts/amounts and supported placement legality. Starting-resource normalization remains confined to reachable opening areas. Shared access is a geometric proxy, not a claim about actual Civ V movement or AI behavior.


## Delivered implementation — 28 September 2026

- `lib/v3/request.ts` validates Standard/Advanced input and produces replayable seeded requests. Standard and Advanced retain separate drafts. Advanced numeric/text input is committed when Generate is pressed, including input that has not blurred.
- `plan.ts` resolves gameplay intent, native map type, homeland hints, isolation mechanism and opening budgets. The four engines receive their own normal controls and native constraint adapters. `generateMapFoundation` exposes a single candidate construction path while all legacy callers retain their existing generation/proof contract. V3 supplies its own acceptance policy; it does not claim the legacy narrative proof.
- `surface.ts` derives climate and regional ecology from retained native fields where available, handles five climate bands, adjusts local movement friction, preserves requested mountain abundance and controls coastal/deep-water separation. These remain cartographic approximations.
- `balance.ts` chooses viable starting regions, compares reachable opening terrain, places requested city states, moves non-opening wealth according to Competition, and normalizes Standard opening resource budgets. Normalization is confined to the reachable three-step opening neighborhoods; the independently measured report retains residual terrain differences. Advanced retains its native starts and explicit resource policy.
- `assessment.ts` checks dimensions, requested populations, spacing, reachable land, actual resource budgets and supported tile legality. Candidate selection favors smaller opportunity differences. Standard tries up to three candidates; Thorough and Exhaustive permit four and six respectively. Failures preserve the previous accepted world.
- `generate.ts` records request, seed, plan, climate evidence, correction counts, final assessment and pass seeds. The same normalized request/seed is deterministic. Legacy evidence is marked stale after V3 development, and Refine marks the V3 assessment stale after edits.
- A dedicated worker runs Generate and mobile Randomise. Cancellation terminates the worker, and job identity prevents stale responses from being applied. The worker has a two-minute timeout. Browser storage keeps the newest 100 accepted maps; a failed save does not replace the accepted map.
- The optional Planned starts layer displays the evaluated major starting locations; it is not a claim that Civ V will use those positions after ordinary map export.
- `scripts/build-v3.mjs` bundles the worker/parser and packages the application at `/v3/index.html`. The existing root application remains available. Relative asset paths also work below the Pages deployment prefix.

## Verification evidence

- The complete TypeScript test corpus passed **293/293** before the final V3 refinements; all **12/12** final V3 behavioral tests then passed after those refinements. The additional checks independently inspect actual resource tiles within reachable starting neighborhoods. Legacy generation behavior was changed only by the additive native-construction export.
- The final reproducible audit passed **33/33** native map types with compatible populations and **12/12** seeded Randomise requests. [Audit results](../verification/v3-generation-audit.json). Three Realms and Lonely Oceans retain their native population/capacity limits; explicit incompatible requests fail rather than silently changing the request.
- Repository TypeScript and ESLint pass with no warnings. Vinext production, Next/webpack static export and the Pages asset verifier pass. The latter checks V3's page, worker, parser, scripts, styles and branding. All **23/23** existing rendered-interface tests pass.
- Actual production-host browser generation produced a new map and history record. Desktop cancellation preserved the title and history count; an impossible 41-city-state request also preserved both and showed a useful error. Reload retained a generated map's seed, plan summary and history count.
- Refine inspected a generated map with clear supported placement checks; accepting woodland changes marked the assessment stale. A generated Civ5Map file was imported through the actual chooser, inspected successfully and prepared for Save with its expected filename.
- At 390px, only Randomise and Save remain visible. Randomise ran the real worker and produced a new generated snapshot. Planned starts and Resources were visually inspected on a four-player desktop world. No browser runtime errors were observed.
- Docker could not connect to its daemon socket, so Alpine was unavailable. Browser download delivery, real Civ V play and actual multiplayer fairness are not claimed. Ordinary map exports still allow Civ V to select starts independently of the evaluated regions.
- The approved design remains on `codex/v3-world-discovery`. Unrelated V2 work was preserved. No commits or pushes.


## Desktop Randomise all

Before implementation: add a secondary **Randomise all** action directly below Generate inside the fixed sidebar footer. It chooses fresh values for all eleven Standard controls and a new seed, including the full supported Tiny–Huge size range, then generates a map. On successful acceptance, show those values in Standard so the user can tweak them; retain the independent Advanced draft. Failure, cancellation or storage failure preserves the previous settings and map. The existing Generate button supplies cancellation while a job runs. Mobile Randomise retains its compact-size policy and two-action UI. Verify placement, real generation, reflected controls, and preserved draft behavior.


Verification: Randomise all is below Generate within the sidebar footer, with a 4px gap. Activating it from Advanced generated a new Standard map, closed Advanced, and populated all eleven dropdowns from the accepted request; the Physical Advanced draft remained saved. The displayed Players value matched the evaluated starting-region count. The secondary action is disabled while generation runs, with cancellation available through the primary action. All 13 V3 tests, the type check, scoped lint, JS syntax and whitespace checks passed; the application bundle was rebuilt. The new size-policy check confirms Large/Huge are available to desktop Randomise all while mobile retains compact sizes. No commits or pushes.

Preview capture: `mockups/v3/randomise-below-preview.jpg`.


## Coastline shape audit — resolved in generator version 2

The user reported frequent circular and near-perfect oval islands. This is not the intended general appearance. A read-only audit reproduced regular oval landmasses in the native Excogitare constructors with V3 homeland hints disabled. For `round-islands-1` (EARTHSEA), a 334-tile oval had the same measured outline with and without the V3 hints. `round-native-only` also produced a smooth 354-tile oval without V3 planning constraints. These samples establish a native contributor; they do not attribute every circular island in history to one cause.

`rasterFieldSource` in `lib/map-generator.ts` converts field sources directly into ellipses. Their land/water priorities can then force scalar-field values beyond the ordinary range after the noise/refinement stage, preserving the geometric outline. The earlier removal of hard V3 homeland patches therefore did not eliminate this broader cause.

At the time of diagnosis, V3's final assessment checked dimensions, populations, starting opportunities and supported placement legality, but not repeated geometric coastlines. The subsequent correction replaces literal source ellipses with connected branching construction, feeds bounded influence into refinement, removes V3's hard post-refinement footprint override and independently checks finished shapes. Current worker output records generator version 2. Existing history is preserved and earlier records are identified in Map details. See [V3 landform construction](v3-landform-construction.md) for the complete contract, 109-case audit, regression/build/browser evidence and limits.


## Full native dimension catalogue

Standard and Advanced now expose all eight native sizes and eight geometries, including Extreme/Colossal and Needle/Ribbon/Pin/String. They use the native dimension solver and shared validation/catalogue, preserve dimensions through generation and binary export, and retain the existing random pools. See [extended dimensions](v3-extended-dimensions.md) for the 28-test V3 regression, real browser generation and compatibility boundaries.
