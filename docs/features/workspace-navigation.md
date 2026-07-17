# Workspace navigation

## Status

**Verified.**

## Contract

Excogitare presents Explore, Create, Repair and Lua as peer workspaces rather than flat modes. The active workspace expands in the primary navigation to reveal its own stages:

- Create: Design, Iterate, Edit and Review.
- Repair: Inspect, Correct and Validate.
- Lua: Script, Generate and Diagnostics.

Explore has no nested stages. Lua remains visibly Experimental and retains its entry warning. Switching workspaces must preserve the current map, canvas position, generation state, edits and the last selected stage in every workspace. Create remains non-linear: its stages are navigation, not mandatory wizard gates. Randomise and Generate remain available within the Create workflow.

The workspace switcher and stage navigation must also be visually unmistakable. The four workspaces retain written labels and receive restrained identity accents: teal for Explore, gold for Create, copper for Repair and red for Lua. Stages live in a dedicated contextual strip beneath the primary header rather than a miniature row inside the workspace capsule. The sidebar begins with the current workspace and task; full map metadata remains prominent in Explore and becomes a compact disclosure elsewhere.

## Acceptance criteria

1. The navigation identifies the four top-level choices as workspaces and exposes only the active workspace's nested stages.
2. Activating Create, Repair or Lua restores that workspace's last selected stage; first entry uses Design, Inspect and Script respectively.
3. Create stage navigation drives the existing Design, Iterate, Edit and Review content without duplicating a second tab bar.
4. Repair stages separate inspection, correction selection/application and final validation while retaining Original, Corrected and Difference map previews where relevant.
5. Lua stages separate project source/dependencies, generation/runtime controls and compatibility diagnostics while retaining the Experimental warning.
6. Workspace and stage buttons expose selected/expanded state to assistive technology, remain keyboard-operable and degrade cleanly at existing desktop/tablet breakpoints.
7. Switching workspace or stage does not reset map, history, zoom, pan, layers, selection or generation options.
8. README wording accurately describes the workspace model and identifies Repair and Lua stage coverage without overstating Lua compatibility.
9. The active workspace has more visual weight than inactive peers, the contextual strip names the workspace and current stage, and status text conveys useful state without depending upon colour alone.
10. Create, Repair and Lua use task-specific sidebar mastheads and do not repeat the full Explore map heading and description above their working controls.

## Failure behavior and exclusions

- A blocked Lua entry leaves the current workspace untouched until the user accepts the Experimental warning.
- Repair cannot invent writable binary scenario records; the workspace reorganization does not expand the repair engine's domain rules.
- Lua Script, Generate and Diagnostics reorganize the existing compatibility workspace. They do not constitute complete Civ V Lua-host compatibility.
- This feature does not change map generation, repair algorithms, file formats, rendering or export behavior.

## Completion gates

1. Contract, acceptance criteria, failures and exclusions: **verified**.
2. Navigation state/defaults: **verified**; each workspace retains its own stage, Repair avoids rerunning an unchanged session, and Randomise, deterministic generation, workers and cloning are behaviorally unchanged.
3. Domain behavior: **verified**; existing Create, Repair and Lua operations remain connected, and Repair Validate reruns the repair rules against the selected corrected preview.
4. Interface placement and modal behavior: **verified**; the top-level switcher has distinct labelled workspace identities, the contextual stage strip is physically separate beneath the header, each sidebar begins with a task masthead, full map metadata remains in Explore, working spaces use a compact disclosure, duplicate Create tabs remain removed, and Lua retains its confirmation modal.
5. Rendering/layers: not applicable except preservation during navigation.
6. Editing/history/selective regeneration: **verified**; navigation state is independent of the map, view, layers, history and editor selection, and returning to an unchanged Repair session preserves its correction state.
7. Import/export/round trip: no format change; existing actions must remain available.
8. Validation and Repair: **verified**; Inspect is read-only, Correct owns profiles/mutations/comparison, and Validate tests and exports the corrected preview.
9. Tests, lint, type checking, builds and Alpine runtime: **verified** with TypeScript, ESLint, the production build, 85 automated checks, the GitHub Pages static build, a clean `node:24-alpine` image build and an HTTP 200 response from the replacement container after the visual-hierarchy revision.
10. README/help: **verified**; the workspace hierarchy, identity accents, contextual strip, task mastheads, compact map disclosure, stage responsibilities and limitations are documented.
11. Request/register/diff/code reconciliation: **verified** on 2026-07-16.

## Evidence

- `app/civ5-map-viewer.tsx` owns workspace/stage state, the distinct top-level switcher, contextual stage/status strip, task mastheads, compact map disclosure, Repair stage behavior, Lua stage behavior, accessible selection state and unchanged-session restoration.
- `app/globals.css` supplies labelled workspace identity accents, the full-width contextual strip, task hierarchy, responsive geometry, selected/focus treatment, validation summaries and empty states without reintroducing the removed Create sidebar tab strip.
- `tests/rendered-html.test.mjs` checks hierarchy, identity accents, contextual-strip placement, stage labels, mastheads, compact map disclosure, state defaults, panel relationships, restoration wiring, documentation and the absence of the duplicate Create tabs.
- `pnpm exec tsc --noEmit`, `pnpm run lint`, `pnpm run test` and `pnpm run test:pages` passed on 2026-07-16.
- `excogitare:0.4.8` built from the repository Dockerfile and replaced the local `excogitare` container on port 3001 after the visual revision; Vinext started successfully and `/` returned HTTP 200 on 2026-07-16.
