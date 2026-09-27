# V2 world development

**Direction corrected on 27 September:** [Geography before narrative](geography-before-narrative.md) supersedes this record's ordered events, fictional-history controls and comet/thaw transformations. Players infer possible histories from geography. The former implementation and its verification below are retained as historical evidence. Native foundations, physical development, gameplay assessment and the floating Atlas workspace remain in use.

## Contract

Status: **Implemented**. Automated domain, interface, type, lint, production and static-export checks pass. Desktop and 390×844 layouts have been inspected. Real Civ V multiplayer loads, human recognition/enjoyment and the unavailable Alpine runtime remain unverified; the whole outcome is not called Verified.

The accepted [evaluation](../v2-generation-foundations-evaluation.md) replaces the initial V2 architecture wherever necessary. The user authorizes rewriting legacy code to serve the intended outcome. Existing behavior is evidence rather than a requirement to preserve inferior architecture. Preserve unrelated working-tree changes. The user's 27 September instruction authorizes semantic commits on the development branch; pushes still require an explicit request.

The user can generate a coherent world, develop recognizable places through local changes and ordered histories, compare proposals, assess likely geographic opportunities for 2–4 humans, save/reopen the complete world, repair imported maps, and export ordinary Civ V geography. Exact multiplayer starts and runtime scenario scripting remain excluded. Geographic and gameplay priorities work with the same retained world.

## Requirements and acceptance

| ID | Requirement | Acceptance evidence | Status |
|---|---|---|---|
| DEV-01 | Native output and continuous fields survive the foundation boundary without generic repainting; authoritative causes and stale derived evidence are distinct. | Exact tile and native-plan preservation across all four constructors in `studio-development.test.ts`; raw process fields survive projects. | Implemented |
| DEV-02 | Versioned worlds retain place identities, causal history, relationships and locally scoped edits; older V2/legacy projects migrate explicitly. | Project/history/protection and separate Create/Develop draft round trips; old snapshots retain former authoring data; malformed field records are rejected. | Implemented |
| DEV-03 | Great Watersheds, comet seas and polar thaw are meaningful geographic premises with actual transformations and physical consequences. Additional supported foundations retain their distinctive capabilities. | All nine premises pass the focused matrix. Comet seas now uses old Physical continental shields, automatic inland placement and local water negotiation; a border-wall regression check guards the observed visual failure. | Implemented |
| DEV-04 | Local changes preserve unrelated terrain and protected identities, recomputing dependent drainage and legal content. Conflicts fail atomically. | No-op equality, unrelated-tile preservation, reversible events, acyclic drainage, function/shape protection and immutable-foundation repair tests. | Implemented |
| DEV-05 | Gameplay analysis considers multiple plausible settlement layouts, weighted movement at different technological capabilities, resources, expansion, alternatives and tactical space. | Synthetic ocean-barrier and river-edge tests, contact/clearance sensitivity and free-for-all/team comparisons. Review explains each assumption and limit. | Implemented |
| DEV-06 | Search keeps diverse viable candidates and improves selected foundations through interpretable local operations. User proposals include effects and trade-offs. | Saved author seeds reproduce selected searches. Alternative recipes/strokes/fingerprints survive projects and replay exactly. Desktop proposal preview/acceptance and worker cancellation exercised. | Implemented |
| DEV-07 | Map-centred Atlas rendering, rounded floating controls, range sliders, rich premise descriptions and contextual development replace superficial gameplay checkboxes. Snapshots supply history controls; no top bar or blue workspace backdrop. | Separate flat Atlas renderer; desktop inspection, slider synchronization, separate drafts, snapshots and measured 390×844 map/control separation. | Implemented |
| DEV-08 | Imports, selected repair and geography-only exports preserve supported data, keep inference honest and revalidate final tile channels. | Existing binary preservation regression retained. Browser-downloaded project reopened cleanly; downloaded map matched all eight physical channels and had zero structural errors or scenario starts. | Implemented |

## Completion gates

- [x] Contract, acceptance, failure behavior and exclusions recorded before implementation.
- [x] Authoritative model, defaults, full Randomise, determinism, worker transport and cloning.
- [x] Actual geographic, narrative and strategic behavior with edge cases.
- [x] Interface placement, explanations, safe reset and atomic preview acceptance.
- [x] Atlas rendering, overlays, contextual selection and range controls.
- [x] Local editing, preserved places, snapshots and dependent regeneration.
- [x] Project migration, import/export and round-trip fidelity.
- [x] Validation, selected Repair and disclosed destructive effects.
- [x] Feature tests, complete regression, lint, types, production and Pages builds.
- [ ] Alpine runtime: Docker CLI exists, but the daemon socket is unavailable. No container result is claimed.
- [x] README/help, limitations and register reconciled.
- [x] Final request/contract/code/evidence comparison.
- [ ] Representative Civ V multiplayer loads, human narrative recognition and enjoyment.

## Failure behavior and empirical boundaries

Failed or cancelled jobs retain the accepted world. A constraint conflict identifies the affected place or requirement. Hard protections cannot be silently relaxed. Search must disclose infeasibility instead of inventing success. Imported physical causes are inferred, and stale native proof cannot be shown as current verification.

Automatic checks establish legality, preservation and measured geographic properties. Human visual recognition, multiplayer enjoyment and actual Civ V placement/game behavior require empirical review; they are not inferred from scores or a passing build.

## Implementation map

- `model.ts` defines version 3 world records, premises, persistent causes, protections, development reports and replayable candidate recipes.
- `foundations.ts` captures the selected constructors' native stage fields and plans. It retains raw fields alongside working relief calibrated to the final Civ V classes. Imports and earlier snapshots carry inferred confidence.
- `geography.ts` replaces the generic repainting pipeline with replayable local interventions, age-dependent changes, drainage-guided erosion, bounded climate response and affected river-system reconstruction. Unrelated shores are preserved when an intervention must fit its water range.
- `assessment.ts` and `spatial.ts` provide sampled settlement layouts, resource and expansion comparisons, movement-cost scenarios, route/clearance findings and a stable drainage tree.
- `development.ts` and `operations.ts` evaluate local alternatives, retain source identity, keep nondominated foundation candidates, and preview saved alternatives with a reproduction fingerprint check.
- `content.ts`, `validation.ts`, `export.ts` and `project.ts` separate placement, legality, binary transport and persistence. Selected repairs become authored corrections instead of rewriting the foundation.
- `app/studio/` contains Create, Develop and Review, separately retained drafts, ordered histories, the floating inspector and snapshot navigation. `atlas-renderer.ts` is the new flat renderer; the optional isometric projection retains its existing implementation.

## Verification — 26–27 September 2026

- Complete TypeScript corpus: **311/311** passing in two full runs after the domain rewrite. The final focused V2 suites pass **30/30**, including 17 new development-contract tests, after the comparison-report and retained-assessment corrections. The remaining native/legacy modules were unchanged by those corrections.
- Rendered interface: **25/25** passing, including the default studio route, range controls and absence of the retired top bar, visible undo/redo buttons and gameplay-idea panel.
- TypeScript, repository ESLint and `git diff --check` pass.
- Vinext production and Next/webpack Pages builds pass. The independent Pages verifier reports **3 public files and 27 JavaScript bundles**. The production build retains a large-bundle advisory.
- Desktop checks exercised range synchronization, separate Create/Develop drafts, a five-tile saddle preview and acceptance, comet-world generation, project/map downloads, clean-session reopening, and active-worker cancellation retaining the accepted map and snapshots.
- The browser-downloaded project reparsed with a Physical comet foundation, 4,160 raw relief values, one history event, three alternative foundations, a past revision and both drafts. Its exported Civ5Map reparsed with **4,160 matching tiles across eight physical channels**, zero scenario starts and zero structural errors.
- Three-human probes of Great Watersheds, comet seas and polar thaw each produced four sampled three-site arrangements, zero placement errors and a 2,016-tile geography-only export with no scenario starts.
- A Huge-world alternative was replayed successfully through the production worker and reached its comparison preview. Alternative-foundation previews disclose that acceptance replaces the current geography while retaining a snapshot.
- Project reopening recomputes identity and fidelity from retained records; explicit rotational arenas invalidate native proof, record their authored cause and recompute their working drainage tree.
- Responsive inspection measured **390×844**. With controls open, the map ends at y=333.88 and the panel begins at y=345.88; the map remains visible above the panel. The primary-button hover contrast was corrected. The temporary viewport override was reset.
- A native download-event waiter timed out, but the actual downloaded files were located, parsed and reopened. No download success is inferred from the waiter.
- Docker reported a missing daemon socket at `/Users/duffy/.docker/run/docker.sock`; the conditional Alpine check could not run.

## Semantic commit verification — 27 September 2026

The user's updated workflow records native-generation prerequisites separately from the V2 studio. Lua removal and unrelated legacy-workspace changes remain pending. Commit contents were exported to a temporary directory and checked independently of those pending files.

- The native prerequisite snapshot passes **283 domain checks** across the full run and a focused rerun, plus TypeScript and repository ESLint. One Lua check initially lacked its declared Wasmoon dependency in the temporary directory; both Lua checks passed after restoring that dependency there.
- The V2 snapshot passes **30/30 V2 domain tests**, **24/24 rendered-interface tests**, TypeScript and lint. Vinext production and Next/webpack Pages builds pass; the Pages verifier reports **4 public files and 30 JavaScript bundles**.
- These totals differ from the full working-tree results above because the committed legacy application still contains Lua. The live working tree and its unrelated pending changes are preserved. No push was made.

## Explicit limits

- These are deterministic cartographic processes, not a full Earth-system or fluid simulation. Lower erosion settings sharpen retained relief; higher settings transport and deposit material along the working drainage tree. They do not reconstruct an independently simulated geological past.
- Native basin/plate plans remain source records after development. Connected tile/river features are updated and matched to persistent identities; native regional outlines remain authoring regions with stale proof, rather than claims that every original native diagnostic has been re-proven.
- Opportunity and variety scores screen candidate trade-offs. They do not measure enjoyment, predict victory or guarantee actual Civ V starts. Mobility scenarios omit civilization abilities, promotions, roads, tactical combat and diplomacy.
- The application develops maps up to 20,000 tiles. Project archives retain the existing 64 MB limits. Current + kept snapshots is available when a complete history is too large.
- The existing Civ V binary and placement rules remain the compatibility boundary. This work does not claim a newly exhaustive all-DLC/mod rule database or new generated-scenario support.
- Development uses semantic commits on `v2/map-studio`. Unrelated working-tree changes are preserved; pushes require an explicit user request.
