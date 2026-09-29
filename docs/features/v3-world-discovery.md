# V3 world discovery

## Contract

Status: **Implemented**. The approved visual foundation now runs the V3 generator in a cancellable worker. The historical mockup evidence below records the design review. Current engine work is tracked in [V3 generation pipeline](v3-generation-pipeline.md).

The user requested a separate V3 branch, a mockup derived from V2's basic design cues, and a flow prioritizing randomness with small tweaks. The completed design review established the visual foundation for engine integration. No commit or push is authorized by the conversation's working agreement.

Branch: `codex/v3-world-discovery`, in a managed worktree based on `v2/map-studio` at `d410e27`. The original checkout contains pending V2 work and remains untouched. The design began with prepared native-engine illustrations. The current application adds the V3 worker pipeline while preserving the original checkout and legacy callers.

## User flow

1. Two primary views: **Generate** and **Refine**. Open on a world in Generate, with **Generate** as the primary action.
2. Generate exposes eleven categorical dropdowns. Its Advanced accordion replaces the basic fields with original engine, map type, geography, climate, resource and match controls. Collapsing restores the retained basic draft.
3. Explore the map. Browse a right-side carousel, with the newest snapshots at the top. The latest 100 accepted snapshots persist locally across reloads.
4. Refine accepts the current world or a local `.Civ5Map` import. Preview small geographic tweaks and selected illegal terrain/content corrections. Compare against the accepted world; keep or discard the preview.
5. **Save .Civ5Map** sits below the sidebar; **Layers** sits above the snapshots, matching their width and the sidebar top. History remains reachable while rerolling.

Wayfinder gold/night branding, warm paper, navy actions, rounded floating controls, a full rear canvas and borderless right-side history carry forward V2's design cues. A quiet Map details disclosure shows generation seed, premise and assessment limits. No invented balance percentages or successful game exports.

## Acceptance

- A locally served browser application loads its bundled generator and assets without a backend or remote services.
- Generate runs the active Standard or Advanced request, accepts a checked map and records its seed, plan and assessment. Initial/example maps remain labelled examples. Generate and Refine remain the only primary views.
- Refine imports existing Civ5Map files using the existing parser and previews narrow placement corrections using existing rule verdicts. All checking is explicitly scoped to supported tile placement; unsupported structural recovery and full Repair are deferred.
- All eleven Standard dropdowns have four or five choices. Advanced uses the v1 catalogue; mode and engine drafts remain stable until changed.
- Small tweaks produce a visible preview with explicit acceptance/discard and a comparison control.
- Restoring worlds works across reloads. The latest-100 limit evicts the oldest snapshot; Keep/Kept and saved-state markers are removed.
- Layers, map zoom, pan and Fit work. Fit accounts for visible controls and spacing; manual pan/zoom remains free across the rear canvas. Essential controls are keyboard accessible.
- Desktop and narrow layouts preserve access to map and controls without page overflow.

## Completion gates

| Gate | This phase |
|---|---|
| 1. Contract | Recorded above before implementation. |
| 2. Model, defaults, Randomise, determinism, workers | Implemented seeded requests, plans and cancellable workers; verification is recorded in the V3 generator feature. |
| 3. Domain behavior | Actual generation, climate, content and starting-resource normalization implemented. Planned-start/resource proxies and export boundaries are explicit. |
| 4. Interface | Desktop/mobile review, reversible tweaks and a clear primary random action required. |
| 5. Rendering | Atlas-inspired sample rendering and overlays required; no geographic correctness claim. |
| 6. Editing/history | Local latest-100 history, selected map and preview acceptance are implemented. Existing tile corrections and local terrain tweaks are supported; accepted edits invalidate the generation assessment. Selective pass regeneration remains separate work. |
| 7. Persistence/export | Browser-local history retains snapshots and imported source bytes across reloads. Mobile Save reuses the existing Civ5Map writer; serialization/parse checks pass, while browser download delivery remains unverified. Portable project files and new game-compatibility guarantees are deferred. |
| 8. Validation/Repair | Preview/discard/accept selected tile corrections, disclose removed content, and recheck supported placement rules. No full repair, game compatibility or fairness claims. |
| 9. Checks | Generator tests, regression suite, types/lint, production/Pages and browser interaction checks pass. Alpine is unavailable; see the generator record. |
| 10. Documentation | Adjacent README documents launch, interactions, samples and limitations. |
| 11. Reconciliation | Final record must match files and actual checks. |

## Later engine contract

Compile premise and match settings into homeland, expansion, route and objective obligations with controlled variation. Realize them through engine-native geography, coupled climate/drainage and regional ecology; place ecological and contested content; select starting regions and normalize opening opportunities; independently assess finished tiles and retain varied viable candidates. Preserve place identities and limit corrective changes. Ordinary Civ5Map output cannot guarantee exact multiplayer starts; a separate proven start-placement transport is required for that claim.

## Verification — 27 September 2026

- Saved a standalone HTML/CSS/JavaScript prototype with six prepared map illustrations from existing engines. No production application route, engine or dependency was changed.
- Reused the existing Civ5Map parser and feature/resource/wonder verdicts through a 7.5 KB standalone bundle. Source is retained in `mockups/v3/rules.ts`.
- Eleven browser check groups passed: pinned-premise variation and preference retention; keep/filter/restore; tweak preview/compare/accept; discard preservation; selected repair/recheck; remaining corrections; actual Civ5Map import; malformed import preserving the accepted map; layers/Escape/zoom/fit; responsive bounds; no runtime errors.
- Actual import used the existing V2 watershed binary fixture. The correction example deliberately places a forest and relief on water and wheat on a hill. Only checked corrections are applied, then supported placement rules are rerun.
- Inspected 1440×950 Generate and correction-preview screens, and the 390px Refine/Generate layouts. Checked horizontal overflow at 320, 390, 768 and 1280 pixels; the mobile map and control panel do not overlap.
- JavaScript syntax and `git diff --check` pass. Application builds, domain regression suite and Alpine are inapplicable: this phase adds only a standalone mockup and documentation.
- Preview captures: `mockups/v3/generate-preview.png`, `refine-preview.png`, `mobile-preview.png`. Start with `mockups/v3/index.html`, served locally as documented in its README.
- Reconciled the register and delivered scope: Generate and Refine are the two primary views. Random sample exploration, session history, narrow actual import/placement correction and reversible illustrative tweaks work. Future settings, engine simulation, complete Repair, durable saving, game export and start fairness remain explicitly outside this mockup.
- No commits or pushes were made. Pending V2 changes remain in the original checkout.

## Design review revision — direct controls

The user requested less superfluous text and more focus on real use. The revised mockup removes the slogans, introductions, map story, descriptive tags, repeated guidance and duplicate Keep action. Generate opens directly on players, size, premise and Generate. Refine opens on Import, Edit terrain and Tile legality. A compact Mockup disclosure retains the prototype boundaries and repair example. Destructive repair actions remain explicit beside each finding.

The Generate panel now sizes to its controls; the map has more space. Recent worlds use smaller thumbnails. Refine adds an explicit Select area/Clear interaction. Rectangle selection targets Add woodland and Lower mountains, followed by Original/Discard/Apply. Without a selection, an automatic small area is used. Selection resets when changing worlds.

Verification: JS syntax and whitespace checks pass. Browser checks covered switching views, auto-area preview and discard, selecting 396 tiles and previewing woodland changes on 94 eligible tiles, loading the repair example and rendering compact correction disclosures. Also checked pinned-premise generation and applying two selected corrections while leaving the unselected finding intact. Inspected 1440×900 and 390×844 layouts; no horizontal overflow or map/control overlap. Updated Generate, Refine and mobile preview captures. Browser runtime error log was clear. This remains a mockup; the V3 engine is deferred.

## Standard and Advanced generation — superseded first interpretation

Requested eight Standard parameters: Players, Size, Geometry, Mobility, Isolation, Water, Mountains and Challenge. This phase remains the interactive mockup; choosing controls does not generate new geography.

- Standard uses one shared request and derives automatic choices. Default: 4 players, Standard size, Standard geometry, 60 mobility, 45 isolation, 50% water, 18% mountains and 40 challenge. Water means total map share; mountains means land share.
- Mobility controls local travel friction through forest/jungle cover, wetlands, hills and passage design. It does not overwrite the mountain percentage. High mountains and high mobility should mean useful routes through mountainous land.
- Isolation controls inter-region contact and access. The later planner may use wide deep water, dry interiors, mountain barriers or combinations. High mobility with high isolation means easy internal travel but difficult travel between regions. Low isolation should preserve multiple viable connections.
- Challenge controls abundance and useful settlement capacity. It is separate from fairness. A harsh world must still have sufficient viable openings and expansion capacity for the requested roster; infeasible requests must be disclosed instead of silently starving some players.
- Advanced retains the shared eight parameters and allows explicit forest/jungle, wetland, hill, passage, isolation mechanism, resource and settlement-land choices. Auto values follow Standard settings; explicit overrides remain stable. Standard ignores Advanced overrides and premise pinning, without deleting the saved Advanced draft. Returning to Advanced restores the draft. Reset overrides is explicit.
- Generate snapshots the selected mode, shared parameters, resolved automatic decisions and active overrides with the illustrated sample. The existing sample catalogue remains disclosed; no quality, balance or gameplay outcome is inferred from those settings.
- UI acceptance: concise Standard/Advanced switch inside Generate; all eight Standard parameters; live value labels; inspectable automatic choices in Advanced; preserved drafts and override reset; existing Refine/import/corrections unaffected; keyboard and narrow layout checks.
- Domain implementation, global resource guarantees, exports and Civ V runtime verification remain deferred to the engine phase. Current status remains Groundwork.

### Standard/Advanced verification

- Added `generation-controls.js` as the shared mockup request controller. Generate captures the selected mode, eight parameters, automatic choices, active overrides and premise alongside each prepared sample.
- Standard shows all eight controls without a premise selector or manual overrides. Advanced folds the shared targets under Standard settings and presents compact Movement, Isolation and Challenge controls.
- Browser checks: high mobility plus 60% mountains retained the mountain target and selected broad passages/light woodland; high isolation chose mountain passes at 50% water, deep water at 90%, and dry interiors at zero water/zero mountains. High challenge selected scarce resources and limited settlement land.
- An explicit Dense woodland override survived Standard/Advanced switching. Reset restored Auto. Geometry remained Wide during sample generation. The request controller is illustrative; no relationship between these settings and the prepared sample's actual tiles is claimed.
- Standard and Advanced desktop screens inspected at 1440×900. At 390×844, Standard had no horizontal overflow and controls remained below the map. Browser runtime errors were absent; both JavaScript syntax checks and whitespace checks passed.
- Updated `generate-preview.png`, `advanced-preview.png` and `mobile-preview.png`. The mockup remains Groundwork; real generation, capacity enforcement and balance verification are future engine work.

## Review correction — abstract Standard, v1-style Advanced

This section supersedes the previous Standard/Advanced contract and its component-override interpretation. The user's clarified request: Standard abstracts physical decisions into eight dropdowns, each with four or five choices. Advanced exposes many controls already present in the original production Excogitare interface. Advanced must not be a decomposition of Mobility, Isolation and Challenge into new component controls.

Before implementation: Standard has Players (2/3/4/6/8), Size (Tiny/Small/Standard/Large/Huge), Geometry (Standard/Wide/Tall/Square), Mobility (Very slow/Slow/Moderate/Fast/Very fast), Isolation (Open/Low/Moderate/High/Extreme), Water (Minimal/Low/Moderate/High/Vast oceans), Mountains (None/Few/Moderate/Many/Extreme), Challenge (Gentle/Moderate/Demanding/Harsh). No Standard sliders, percentages or physical decomposition.

Advanced uses the existing v1 categories and actual option IDs: engine and map type, character, scale/modifier, geometry/wrap/projection, numeric water/mountain targets, climate/rainfall/rivers/age/archetypes, resource abundance/distribution, population/starts/teams/city states, wonders/sites, and engine-specific Eccentric/Physical/Polis parameters. The 33-map-type catalogue is copied from committed production source `85040b8` for this mockup. Advanced and Standard have independent preserved drafts. Engine changes filter valid map types and reveal only the appropriate engine-specific controls. No automatic translation between the two drafts is implied.

Acceptance: eight Standard dropdowns with 4–5 options each; compact grouped Advanced controls from v1; engine/map-type consistency; preserved mode and engine drafts; selected values captured with samples; no stale component-override UI. Refine/import/corrections remain functional. All settings remain mockup requests; real V3 generation is deferred.

### Verification of the corrected modes

- Standard has exactly eight select controls; each has four or five options. It has zero sliders and no numeric water/mountain percentages.
- Advanced exposes 51 controls with Eccentric selected, including engine, map type, world character, scale, modifier, shape, climate/archetypes, resources, population/starts, wonders/sites and seed/effort. Engine-specific fields are replaced appropriately. The original catalogue contains all 33 map types and 13 authored archetypes plus the two pass-through choices.
- Browser checks confirmed that switching Excogitare → Eccentric → Physical filters Map type to its owner engine. Eccentric remembered Great Watersheds after returning from Physical. Physical exposed plate activity, erosion, rotation, seasonality and ocean influence. Standard retained Very fast mobility through the mode switches.
- All rendered Advanced selects had valid selections. Sample generation and returning to Refine worked with no browser runtime errors. The sample remains an illustration, independent of its captured recipe.
- Inspected Standard and Advanced at 1440×900; checked Standard at 390×844 without horizontal overflow or map/control overlap. Updated preview captures. JS syntax and whitespace checks pass. V3 engine work remains deferred.

## Navigation comparison — three mockups

Requested: three different approaches to replace the clumsy Generate/Refine → Standard/Advanced hierarchy. Preserve the eleven categorical Standard controls and v1-style Advanced catalogue. Preserve actual prototype import, selection, correction previews and session history. No V3 engine work.

Before implementation, the comparison contracts are:

1. **One workspace:** basic generation settings are always on the left; edit/import/check tools are directly available on the right. Advanced generation opens a separate dialog. No workspace tabs.
2. **Three peers:** Generate, Custom and Refine are three peers on one navigation row. Generate contains the eight intent controls; Custom contains the v1 controls. No nested Standard/Advanced switch.
3. **Editor first:** permanent map editor and tools; New map opens a transient dialog with a single setup-choice dropdown. Import goes directly to the editor. Generation does not occupy a permanent workspace.

Deliver separate interactive pages and a comparison index under `mockups/v3/alternatives/`, leaving the current baseline available. Use shared map rendering, controls and fixtures. Expose only minimal navigation hooks from the shared mockup scripts. Native dialogs must support close/Escape, preserve drafts and leave the accepted map unchanged on cancellation. Generated samples and imported maps must remain usable in the applicable editing surface after dialogs close or views change.

Acceptance includes testing each alternative's navigation, access to the v1 catalogue and Refine tools, generation-dialog cancellation, preview/apply/discard behavior, and desktop/narrow layouts. Capture each design for the comparison page. Status remains Groundwork for V3, with no claims about real generation or game balance.

### Added Standard controls

The user approved Regional Variety, Competition and Climate during the three-mockup comparison. All three alternatives and the baseline now share eleven Standard controls. Regional variety uses Uniform/Subtle/Varied/Dramatic and describes differences between regions. Competition uses Low/Moderate/High/Intense and describes how much desirable territory is shared by rivals, independently of Challenge's scarcity. Climate uses Cold/Cool/Temperate/Warm/Hot. These remain abstract requests; their physical realization belongs to the future engine.

### Verification of the three alternatives

- Three standalone interactive concepts and the comparison page are implemented under `mockups/v3/alternatives/`. The original mockup remains accessible.
- One workspace: advanced dialog opens, Escape closes without changing the accepted map, saved custom settings remain available, Generate returns its button to the main panel and both generation/editing remain visible.
- Three peers: one three-button navigation row; the nested switches are hidden. Custom opens the v1 catalogue directly. Refine opens editing/import/check tools. An edit preview can be discarded, and returning to Generate preserves Regional variety = Dramatic.
- Editor first: New map opens eleven quick controls; Custom setup exposes the v1 catalogue. Cancel retains the accepted map and the Competition draft. Generate closes the dialog and returns to editing. Reroll is directly available. There is one visible Import action.
- Actual local import through the editor's Import action loaded `v2-watersheds-reference.Civ5Map`, showed its filename, retained editing access, kept the generation dialog closed and ran tile-placement checks successfully.
- Desktop screens inspected and captured at 1440×900. All three checked at 390×844 with no horizontal overflow; stacked controls/tools do not overlap the map. The editor's New map dialog stays within the narrow viewport and exposes all eleven controls.
- No browser runtime errors observed. Syntax checks cover shared controls, shared app hooks and alternative orchestration; whitespace checks pass. Production engine code and dependencies were not changed, so application builds and Alpine are inapplicable to this mockup revision.
- All pages use the approved Regional Variety, Competition and Climate additions. All Standard controls retain four or five choices. No new generation, resource fairness, game compatibility or durable-save claim is made.

The comparison index and all three preview images loaded successfully. Editor Reroll replaced the sample without opening its setup dialog. The completed comparison is available at `/alternatives/`; no commits or pushes were made.

## Advanced expands Generate — current contract

The user's latest direction supersedes the peer-mode designs: Advanced is an expansion within Generate, never a peer workspace or separate generation mode. Apply this consistently to the baseline and all three alternatives before further engine work.

- Keep the eleven broad generation dropdowns visible and add one collapsed Advanced disclosure beneath them, exposing the existing v1 controls.
- Opening or collapsing the disclosure changes visibility only. Explicit advanced choices remain active while collapsed; untouched fields are Automatic. A concise count and Reset make active overrides visible and reversible.
- Capture one generation request containing broad parameters and explicit advanced overrides. Exact advanced values take precedence over the corresponding broad controls; indicate such overrides beside affected controls. No full V3 generation behavior is claimed.
- Engine and map-type choices remain compatible. Selecting an explicit map type selects its owner; returning Engine to Automatic clears its map-type override. Relevant engine controls appear only for a chosen engine.
- Revise alternatives to One workspace (Generate plus edit tools), Two workspaces (Generate and Refine), and Editor first (New map dialog with expandable Advanced). Remove Custom peers, the separate advanced-generation dialog, and Quick/Custom setup mode selection.
- Preserve accepted maps, editing/import/repair, user-entered drafts, and the original no-commit/no-push instruction. Verify expansion/collapse, active override persistence/reset, sample generation and responsive layouts; update comparison copy and previews.

### Verification of Advanced expansion

- Baseline and all three alternatives use one Generate form containing eleven basic dropdowns and an Advanced disclosure. There is no Standard/Advanced mode switch, Custom peer, separate advanced-generation dialog, or Quick/Custom selector.
- Two workspaces has exactly Generate and Refine as peers. One workspace keeps both generation and editing visible. Editor first expands Advanced inside the New map dialog.
- Collapsing Advanced retained an explicit Physical engine choice and its `1 set` count; generating another sample retained that choice. Basic controls remained available. Choosing Great Watersheds directly selected Eccentric and produced two explicit settings; Reset advanced returned them to Automatic.
- The 390×844 New map dialog remained within the viewport when expanded, retained all eleven basic controls and had no setup-mode selector. Generation closed the dialog, kept Refine available and retained the explicit advanced setting. No browser runtime errors were observed.
- Desktop captures updated for One workspace, Two workspaces and the New map form. Comparison descriptions and README now match the expansion model. JavaScript syntax and whitespace checks pass. No production engine or dependency changes; application builds and Alpine remain inapplicable to this standalone mockup.

## Advanced replacement and mobile boundary — current contract

The latest user correction supersedes the previous expansion behavior. Within Generate, opening Advanced replaces the eleven basic controls. Returning to Standard restores the basic draft. Advanced remains subordinate to Generate and is never a peer workspace. Only the visible editor supplies the next generation request; inactive draft values remain saved without silently affecting it.

Mobile must match the original app's reduced workflow: map plus **Randomise** and **Save** only. Hide generation forms, Refine/import tools, history, layer/zoom controls and comparison navigation on each mobile mockup. Close a desktop dialog when entering mobile. Keep accepted maps and generation drafts intact. A pending preview is not silently applied or exported.

Randomise in this mockup chooses a prepared safe sample; it must not inherit hidden Advanced settings. Save downloads the accepted map as Civ5Map through the existing writer, checks supported placements, inspects the binary and reparses the physical channels. Preserve original bytes for imported maps and use the existing update writer when available. This is reuse of the existing export boundary, not a new engine or game-compatibility claim.

Verify desktop replacement/restoration, independent requests, the same two-action boundary across baseline and all alternatives, mobile portrait and landscape rules, accepted-state export and a representative Save round trip. Preserve all unrelated changes and do not commit or push.

### Verification of replacement and mobile boundary

- Advanced hides the basic fields in the same Generate view; Standard options restores them. Warm climate and a Physical engine draft survived switching. The visible editor determines the request; saved inactive choices are not applied.
- All three app mockups expose exactly Randomise and Save at 390×844, with no horizontal overflow and no open desktop dialog. Randomise changed the sample while hidden desktop settings were ignored. The responsive rule also covers coarse-pointer devices up to 1000px wide; actual coarse-pointer landscape was not emulated.
- The existing map writer was bundled through the mockup adapter. All six sample maps exported and reparsed with 4,160 tiles and zero scenario starts. Eight physical channels were compared inside the save helper. An existing V2 map also passed the original-bytes update/export round trip.
- The browser Save action prepared a Blob download and filename without a runtime error. The in-app download-event waiter timed out twice; no completed download was located in the checked download/temp locations. Browser delivery remains unverified and is not reported as successful.
- Refine keeps original imported bytes for loss-preserving updates. Mobile renders and saves accepted state, not pending previews. No V3 engine, fixed-start guarantee or new game compatibility claim is made.
- Syntax and whitespace checks pass. Only standalone mockup files and documentation changed; production builds, full domain regression and Alpine are inapplicable to this phase. No commits or pushes.

## Accordion label correction

The Advanced toggle must use the same accordion label in both states. Remove the back-arrow/Standard-options label. Keep the native details/summary interaction and rotating chevron; expanding still replaces Standard fields, and collapsing restores them without losing either draft. This is a shared mockup label correction only.

## Selected direction — Two Workspaces only

The user selected 02 Two Workspaces as the sole design focus. Promote its Generate/Refine structure as the active mockup. Remove comparison navigation and route the comparison entry to the selected design. Retain the other two files as historical references only, without active links or further development. Keep the existing mobile Randomise/Save boundary. Complete the consistent Advanced-options accordion label in the selected design and verify both states. No new engine work, commits or pushes.

Verification: the selected root preview showed `Advanced options` in both states. Expanded state hid Standard and rotated the chevron 180 degrees; collapsed state restored Standard. There were no comparison links in the selected interface. The shared asset reference was refreshed to avoid stale open previews. Syntax and whitespace checks passed.

## Full rear canvas and visual history

Before implementation: the selected Two Workspaces mockup must render the map across the entire rear workspace, with floating controls above it. Pan and zoom may move the map beneath the sidebar, header and history; only the outer viewport clips the map. Wheel zoom should follow the pointer. Retain a usable Fit action and prevent resizing/normal panel interaction from unexpectedly resetting a zoomed camera.

History becomes an unlabeled thumbnail strip spanning the desktop's bottom width. Remove the Recent heading, counts and visible snapshot names. Retain accessible names, keyboard operation, selection outlines, kept-state marks and restore behavior. Keep controls clear of the strip. Mobile remains map + Randomise + Save, with no history/editor controls. Work is confined to the selected mockup; no engine changes, commits or pushes.

### Verification of rear canvas and visual history

- At 1440×900, the canvas measured (0,0)–(1440,900). Zooming to 246% visibly drew terrain behind the sidebar, header and bottom strip; dragging into the sidebar region continued under pointer capture.
- Resizing to 1280×800 retained the zoomed camera (277% relative to the new Fit scale), and Fit returned to 100%. The sidebar cleared the bottom strip.
- The history strip measured x=16 through x=1424. Eleven snapshots had no visible text, retained accessible restore labels and one current selection. Kept-only filtering returned one snapshot, and restoring the first returned The Verdant Divide.
- Refine selection still selected 30 tiles with the full-canvas origin. At 390×844, only Randomise and Save remained visible; history was hidden and the canvas filled the width.
- Browser runtime log, JS syntax and whitespace checks were clean. Updated `rear-canvas-preview.png` and `generate-preview.png`. No engine changes, commits or pushes.

## History placement comparison

The user requests two mockups within the selected Two Workspaces design. Interpret “don't pass the left sidebar” as a bottom strip whose left edge starts beyond the sidebar's right edge. The second variant stacks snapshots vertically along the right edge. Keep the full rear canvas, unlabeled thumbnails, eleven generation controls, Advanced replacement, Refine and mobile two-action boundary. Do not revive other navigation designs or replace the active baseline before a choice is made.

Before implementation: produce `history-layouts/bottom.html` and `right.html` plus a comparison index. Both use the same prepared sample history so density can be compared. The bottom variant scrolls horizontally and clears the sidebar. The right variant scrolls vertically; Layers, zoom and preview controls must avoid it. Both restore snapshots and preserve accessible names/current/kept marks. Check bounds, overflow, restore/filter behavior and the unchanged mobile boundary; save matching desktop previews.

### History-placement verification

- Bottom strip begins at x=316, beyond the sidebar's x=294 right edge at 1440×900. Horizontal overflow scrolls with the wheel without changing map zoom. Restoring the last sample and filtering to one kept snapshot worked.
- Right column overflows vertically and scrolls without zooming the map. The Layers popover and zoom controls do not intersect the column. Restoring the last snapshot keeps it visible.
- Both variants render the canvas at the full viewport bounds and have no visible history text. Each begins with the same twelve prepared snapshot records.
- Both retain only Randomise and Save at 390×844. Browser error logs, JS syntax and whitespace checks are clean.
- Saved matching desktop captures and a comparison index at `/history-layouts/`. These are placement studies of Two Workspaces only; the baseline is not changed to either candidate. No engine changes, commits or pushes.

## Fit within unobscured space

Before implementation: Fit must choose a clear area between the currently visible floating UI, with comfortable spacing. It must account for the sidebar, title, history placement, map controls, open popovers and preview bar. Use 32px desktop and 20px mobile spacing where the viewport permits. The map renderer remains full-canvas; manual pan/zoom can still move beneath UI.

Measure actual rendered bounds rather than hard-code one history layout. Choose a large unobscured rectangle for the map's aspect ratio and center the map within it. If a fitted camera's available area changes, keep it fitted; preserve manually panned/zoomed cameras. No-space cases must not silently report a successful fit. Validate geometry with representative layouts/aspect ratios and inspect baseline/bottom/right/mobile framing. No engine changes, commits or pushes.

### Selected history: right column

The user selected the right column and requested removal of the white snapshot frames. Make it the default in Two Workspaces. Use bare thumbnails with a restrained current-selection marker and keyboard focus feedback. Keep Fit aware of the right column and its spacing. Retain comparison files as references; the active design is the right-column layout.

### Carousel, title and history capacity

The user further requests a carousel-like vertical history, fading at the lower edge of the left menu; up to 100 snapshots in browser history; and removal of the map title's white box. Keep the selected right-column design. Align the carousel to measured sidebar bounds, hide the scrollbar, allow wheel/keyboard scrolling and keep the selected thumbnail above the fade. Preserve the full rear canvas and control-aware Fit. Use transparent title styling.

History is bounded to 100 accepted snapshots. Prefer evicting the oldest unkept record; if all 100 are kept, retain the existing map/preview and ask the user to unkeep a record through a concise status message. Cache/lazily draw thumbnails so the full history does not redraw every map on each interaction. The user explicitly confirmed that history should survive reload and remain local to this browser. Store complete accepted snapshots, imported source bytes, kept markers and selected identity in IndexedDB. Keep generation drafts and pending previews session-only. Report storage failures; if storage is unavailable at startup, disclose a session-only fallback. Browser-local history is distinct from portable project files and the browser navigation stack.


### Verification of Fit, carousel and persistent history

- Pure Fit checks covered nine layout/aspect-ratio combinations (bottom, right and mobile; normal, wide and tall maps). Every result cleared the padded controls and viewport bounds. Empty, fully blocked and invalid inputs also passed.
- Inspected the selected desktop interface at 1440×900: full rear canvas, transparent title, zero-width snapshot borders, a lower fade and comfortable map/control gaps. Standard sidebar/carousel bottoms both measured 760.5px, Advanced 856.5px and Refine 453px. Manual 120% zoom survived Advanced expansion; Fit returned to 100%. Open Layers was also accounted for by Fit.
- The isolated browser harness passed five IndexedDB check groups: 100-record cap with oldest-unkept eviction; reopen/selection/imported-ArrayBuffer preservation; all-kept rejection without data loss; concurrent insertion with unique identities and the hard cap; and selected-map persistence. The disposable test database was removed after verification.
- The active UI generated ten prepared snapshots, retained a kept marker and restored the first map. Reload preserved all ten, the selected title and kept state. This confirms actual mockup integration in addition to the isolated storage checks.
- Thumbnail rendering is cached and lazy. Capacity behavior is tested with small IndexedDB fixtures; ten full map snapshots were exercised in the UI. No benchmark with 100 maximum-size imported maps is claimed. Other tabs receive stored changes on reload.
- Browser runtime errors were absent. JavaScript syntax and whitespace checks pass. Screenshot: `mockups/v3/fit-carousel-preview.png` (also the current Generate capture). Production builds, full domain regression and Alpine remain inapplicable to these isolated mockup files.
- Current contract, README and feature register were reconciled. The mockup interactions above are implemented and verified within the stated checks. V3 generation remains **Groundwork**; engine simulation, balance guarantees, portable projects and new game-export compatibility remain deferred. No commits or pushes.


## Smaller history thumbnails and earlier fade

Before implementation: reduce the selected right-column thumbnails from 112×68px to 88×52px and narrow their rail. Finish the fade 32px above the measured bottom of the left sidebar, with a gradual 96px fade. Keep the active snapshot above the fading area when restoring it, retain borderless styling and keyboard access, and let Fit use the newly available canvas width. This is a presentation correction to the mockup; history storage and engine behavior are unchanged. Verify actual card bounds and sidebar/fade separation in Generate, Advanced and Refine, plus scrolling/restoration.


Verification: at the normal 1280×720 preview size, thumbnails measured 88×52px. Standard and Advanced had a sidebar bottom of 686px and fade end of 654px; Refine measured 453px and 421px. The 32px gap held in each state. End/Enter restored the last snapshot; its bottom stayed 12px above the fade start, including after switching to Refine. The narrower column is included automatically by Fit. Browser errors were absent and whitespace checks passed. Saved `mockups/v3/compact-carousel-preview.png` and refreshed the current preview captures. This presentation correction is verified; the overall V3 feature remains Groundwork. No production runtime changes, commits or pushes.


## Explicit map Save below the sidebar

Before implementation: replace the icon-only history bookmark filter with a text-labelled Save action directly below the left sidebar in Generate and Refine. Reserve space so it stays visible on shorter windows; Fit must account for it. Reuse the existing accepted-map download path and error handling. Keep the existing text-labelled history Keep action available, without a bookmark icon, so previously retained snapshots remain manageable. Mobile still has only Randomise and Save. The requested `civ6map` spelling is being clarified against the app's supported `.Civ5Map` writer; do not mislabel Civ V bytes as a Civ VI file. Verify placement, clear labelling, current-map filename and download setup, errors and the mobile boundary.


Verification: at 1280×720 the sidebar ended at 628px; Save occupied y=640–680, leaving a 12px gap and remaining within the window. In Refine the same gap held (Save ended at 505px), and history still faded 32px before the sidebar bottom. The icon-only filter is absent; Keep/Kept remains text-labelled. Clicking desktop Save prepared a Blob link named `The Verdant Divide.Civ5Map` without errors, through the same previously checked serialization/parse path. No browser download event arrived within five seconds, so delivery remains unverified. At 390×844 only Randomise and Save were exposed; the desktop Save was hidden. Restored the normal viewport and captured `mockups/v3/sidebar-save-preview.png`. JS syntax and whitespace pass; no production runtime changes, commits or pushes.

The format question remains unanswered. The mockup uses `.Civ5Map`, the existing supported format, and makes no Civ VI export claim.


## Remove map dimensions and camera controls

Before implementation: remove the displayed map dimensions and the floating zoom/Fit toolbar from the selected desktop mockup and its aliases. Keep the existing full-canvas pan/zoom interaction and internal automatic framing. Show the map-status area only when Refine needs a selection hint, with no empty background left behind. Verify Generate and Refine, sample restoration, and browser errors. This is a small presentation change; engine, storage and export behavior are unaffected.


Verification: browser inspection confirmed that the active mockup has no dimension node, zoom/Fit toolbar or empty metadata badge. Refine's Select area still reveals its selection hint, and returning to Generate hides it. Existing stored history and the selected map loaded successfully. No browser errors; JS syntax and whitespace checks passed. Saved `mockups/v3/clean-canvas-preview.png` and refreshed the current Generate capture. Presentation change verified; V3 engine remains Groundwork. No commits or pushes.


## Newest snapshots first

Before implementation: display history in reverse chronological order, with each newly accepted snapshot at the top. Keep stored history in chronological order for oldest-unkept eviction. Restoring a snapshot must preserve its original position in history. Check existing records after reload, insertion at the top, and restoration.


Verification: the 19 existing snapshots appeared in the exact reverse of their previous display order. Generating another snapshot added it at index zero and returned the carousel to scroll position zero. Restoring an older snapshot preserved the display order; reloading preserved it again. No browser errors; JS syntax and whitespace checks passed. Saved `mockups/v3/newest-history-preview.png` and refreshed the Generate capture. No storage migration, commits or pushes.


## Remove Keep and group map actions

Before implementation: remove Keep/Kept and saved-state marks from the selected design. History becomes the latest 100 accepted snapshots, newest first, with the oldest replaced at capacity. Existing records remain intact; legacy kept flags no longer affect retention. Place Layers beside Save in a compact row 12px below the left sidebar, available in Generate and Refine. Its menu opens upward and is included in automatic framing. Keep mobile limited to Randomise and Save. Verify layer toggles/Escape, row placement, no Keep UI or markers, persistence, and the revised capacity behavior using the disposable storage harness.


Verification: the selected interface has no Keep/Kept control or saved-state thumbnail markers. Layers and Save align in a row 12px below the sidebar in Generate and Refine. The Layers menu opens above the row within the viewport; Resources toggles successfully and Escape closes the menu and resets its expanded state. At 390×844 only Randomise and Save remain visible. Existing history restored across reloads.

The updated disposable IndexedDB harness passed five groups: latest-100 replacement including legacy kept records; reopen, selected map and source-byte round trip; an entirely legacy-kept history accepting new snapshots; concurrent insertion retaining the hard cap; and remembered selection. The harness initially loaded an older cached storage asset; after aligning its asset version with the app, all groups passed. Browser errors were absent, JS syntax and whitespace checks passed, and the normal viewport was restored. Saved `mockups/v3/map-actions-preview.png`. No production runtime changes, commits or pushes.


## Atlas title typography

Before implementation: apply the approved typography direction to the map title: a sharper serif, approximately 30px desktop size, medium weight, slightly tighter tracking and warm charcoal. Give the heading more breathing room while preserving its unboxed presentation. Use locally available Baskerville with serif fallbacks, and a 26px mobile treatment. Keep names and behavior unchanged. Check computed styling and desktop/mobile bounds, then save a visual preview.


Verification: desktop computed styling is Baskerville with serif fallbacks, 30px, weight 500, −0.65px letter spacing and warm charcoal (#35372f). The heading sits at x=326/y=24 with a 44px header, transparent background and no clipping at 1280×720. At 390×844 it uses 26px, remains within the viewport without clipping, and mobile still exposes only Randomise and Save. Restored the normal viewport. Saved `mockups/v3/atlas-title-preview.png` and refreshed the Generate capture. Whitespace checks passed; this CSS-only mockup change needs no application build. No commits or pushes.


## Unobtrusive Layers over the canvas

Before implementation: move Layers from the sidebar action row to a compact translucent control at the canvas's lower-right, below the history. Its popover opens to the left so it does not cover the snapshot column. Save returns to the full sidebar width beneath the menu. Preserve automatic framing, layer toggles and the mobile two-action boundary. Other layout improvements remain recommendations for review.


Verification: at 1280×720, Layers is 24px from the lower and right viewport edges, below the history. Its open menu clears the history column and remains inside the viewport; Escape closes it. Save again spans 278px below the sidebar. Saved `mockups/v3/canvas-layers-preview.png`. Whitespace checks pass. Further recommendations are denser Standard rows to expose Competition/Climate/Advanced, a stable camera while transient menus open, and concise hover/focus explanations for abstract controls. These recommendations are not implemented in this revision. No commits or pushes.


## Layers aligned above history

Before implementation: move Layers directly above the snapshot column, align its top edge with the left sidebar, and give it the same 88px width as a thumbnail. Restore an opaque paper background and normal text contrast for visibility. Open the menu to the left and downward so it remains in the viewport and clear of history. Verify exact alignment, dimensions, contrast and menu bounds; preserve the existing mobile boundary.


Verification: at 1280×720, both Layers and the sidebar begin at y=16. Layers and the thumbnail cards are each 88px wide with matching left and right edges. The button background is opaque paper (#fffcf7). Its menu opens within the viewport and clears the history column. Saved `mockups/v3/history-layers-preview.png` and refreshed the Generate capture. Whitespace checks pass. This is a CSS placement change; no storage, engine, commits or pushes.


## Consistent Layers-to-history spacing

Before implementation: reduce the gap between the Layers button and the first snapshot to 12px. Move the carousel start upward and increase its height by the same amount so the lower fade still finishes 32px above the sidebar bottom. Verify the measured gap and preserved lower boundary.


Verification: the Layers-to-first-snapshot gap measures exactly 12px; both remain 88px wide. The carousel still ends 32px above the sidebar bottom. Saved `mockups/v3/history-gap-preview.png` and refreshed the Generate capture. Whitespace checks pass. No commits or pushes.


## Approved Wayfinder theme

Before implementation: the user requests the approved theme from the other thread. The **Branding** thread explicitly selected Wayfinder, and `docs/branding.md` plus the current production assets define the approved implementation: compass rose and outlined uppercase wordmark in gold (#d9b678) on night (#252c40), with a warm paper studio around it. Use the production small-size mark and outlined wordmark without redrawing or substituting fonts. Copy the browser icons locally for the standalone preview. Match the production studio's paper/canvas/ink/line colors and navy action accents. Preserve the selected V3 layout, controls, history spacing, map rendering and recently approved map-title typography.

Scope is confined to this mockup and its two active aliases. The other checkout is read-only source material; no production or engine files are changed. Verify local asset equality/loading, brand accessibility, desktop and mobile layout, control colors and a representative Advanced/Refine interaction. Application builds/Alpine are inapplicable to static mockup theming.


### Wayfinder theme verification

- Copied the approved small-size compass, outlined wordmark, SVG/ICO favicons and Apple touch icon byte-for-byte from the production assets. All copied SVGs parse successfully. No font substitution or external font request is involved in the brand identity.
- At 1280×720 the mark and wordmark load inside the header with accessible naming. Header and primary buttons use night (#252c40), the workspace uses #dfdad2 and paper surfaces use #fffdf9. The menu and history retain their exact 12px spacing.
- Advanced still replaces Standard; Refine and the 12px Save-to-sidebar gap work. At 390×844 only Randomise and Save are visible, there is no horizontal overflow, and the primary button uses the navy palette. Browser icon links use local copied files. No browser errors were observed.
- Saved `mockups/v3/wayfinder-theme-preview.jpg` and `wayfinder-mobile-preview.jpg`, and refreshed the Generate/mobile captures. Restored the normal viewport. Whitespace checks pass; application builds and Alpine remain inapplicable to this standalone theme.
- README, source provenance and the feature register now reflect the selected Wayfinder identity. The mockup theme is implemented and visually verified; the V3 engine remains Groundwork. The production checkout was read only. No commits or pushes.


## Lighter canvas and navy map title

Before implementation: apply the approved refinement: canvas #ECEBE7 and map title in Wayfinder night #252c40. Preserve the gold/navy brand header, warm paper controls, title typography and current layout. Check the rendered colors and save a preview.


Verification: computed canvas color is rgb(236,235,231) (#ECEBE7), and the map title is rgb(37,44,64) (#252c40). The header remains navy and controls remain warm paper (#fffdf9). Inspected the desktop preview and saved `mockups/v3/neutral-canvas-preview.jpg`; refreshed the Generate capture. Whitespace checks pass. No commits or pushes.


## Generator integration

The approved interface now generates actual V3 maps. Generate/Randomise run the worker, progress changes the same primary action to Cancel, and failures preserve the accepted map. Map details replaces the old mockup disclosure and records the seed and assessment boundary. Layers adds optional Planned starts. Imports, Refine, local history, theming and the agreed placement/spacing remain in place. [Implementation and verification](v3-generation-pipeline.md). The design revisions above are historical.


## Adaptive Standard sidebar

The Standard editor now reduces spacing with the viewport height and proportionally scales the whole panel when needed. All eleven dropdowns, the Advanced disclosure, Generate and Randomise stay visible without scrolling. Save follows the visible panel width and sits 12px below it; the history fade remains 32px above the panel bottom. The longer Advanced/Refine editors retain scrolling, and mobile retains its two actions. See [implementation and evidence](v3-adaptive-sidebar.md).
