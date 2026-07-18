# Create Authoring Workflow

## Contract

- **Status:** Verified.
- **User outcome:** A user can move deliberately through **Design → Refine → Iterate → Edit → Review** without actions unexpectedly navigating to another stage or losing map view, authoring state or history context.
- **Scope:** Stage ownership, interface decomposition, stage-local state, continuous history browsing, primary actions, density, accessibility and the approved mobile boundary.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), existing workspace navigation and generation history.
- **Exclusions:** This record positions controls but does not claim the underlying Scale, Archetype, Match Intent, protection or narrative algorithms.

## Stage ownership

- **Design:** engine, Narrative Map Type, Scale, world shape and projection. Existing Design sections 2, 3 and 4 do not remain here.
- **Refine:** World Character, Archetype, World Modifier, climate/content, players, Match Intent, advanced engine controls and selective-pass choices.
- **Iterate:** generation, candidates, thirty-map history, branches, comparisons and explicit “Use as Design recipe.”
- **Edit:** tile tools, region tools, Drag to Preserve, semantic-object selection, undo and copy/paste.
- **Review:** narrative evidence, Match Intent feasibility, balance, validation, compatibility and export actions.

No operation changes stage implicitly. Selecting any number of history entries remains in Iterate. Applying Refine remains in Refine. Workspace switching retains the active Create stage, expanded sections, scroll position where practical and canvas view.

## Interface architecture

Create's stage navigation, tab panel, operation status and branching history cards are focused components backed by one authoritative viewer store. Domain state is not duplicated inside the components: switching stages changes presentation while the recipe, editor, review, history and canvas state remain mounted. Each stage has a clear principal action, shallow progressive disclosure and compact summaries. Tooltips may add detail but never contain the only warning or blocked consequence.

Generation progress and cancellation remain visible without replacing the current map. Export confirmation remains a modal. Unsaved project state is distinct from unsaved tile edits.

## Mobile boundary

The simplified mobile surface contains Randomise/Generate, the rendered map and Civ5Map download. It uses Standard effort and safe budgets/geometries only. It does not expose the full five-stage editor, Thorough/Exhaustive, Game-Breaking choices or silent recipe normalization. Higher-effort maps may be viewed and downloaded but not regenerated through the simplified flow.

## Failure behavior

Failed generation, refinement, protection or history restoration leaves the current map and stage unchanged. Invalid stage state migrates to the nearest lawful stage with a disclosed recovery message; it is never reset merely because a component remounted.

## Completion gates

- [x] Five stages are accessible and expose their approved principal controls.
- [x] Existing Climate, Content and Players sections move intact from Design to Refine.
- [x] Create is decomposed into focused components with one normalized state boundary.
- [x] Randomise, history restore and Refine operations no longer change stage implicitly.
- [x] Repeated history browsing stays in Iterate and preserves the canvas view.
- [x] Refine, Edit and Review retain their local state across workspace switching; each stage also retains scroll and disclosure state.
- [x] Progress, cancellation, errors and export confirmation remain clear and atomic.
- [x] Keyboard, focus, hover-help and responsive behavior are verified.
- [x] Mobile exposes only the approved three-action safe workflow and Randomise resets to Standard effort and safe budgets.
- [x] Existing Explore, Repair, Lua, Lab and Civ5Map automated regressions pass at the current boundary.
- [x] Documentation, production/Pages builds, Alpine runtime and partial-claim reconciliation pass.

## Verification evidence

- `app/create-workspace.tsx` owns the roving-tab keyboard pattern, stage panel, live operation status and branch-aware history card without creating a second authoring store.
- History snapshots record `parentId`, operation and creation time; selecting one remains in Iterate, while **Use as Design recipe** is the only history action that deliberately moves to Design.
- `.excogitare` round trips preserve the active stage, canvas view, expanded sections, per-stage scroll positions and history provenance. Unknown stages recover to Design with a disclosed message.
- Generation, selective regeneration, semantic-protection conflicts, history restoration and checkpoint restoration report failures without installing a partial result or changing stage. Worker completion remains the atomic installation boundary.
- The rendered-shell suite verifies keyboard semantics, focusable tabs, live status, hover/focus help, responsive mobile limits and component wiring. The project/history domain tests verify immutable snapshots and persistence.
- TypeScript, ESLint, the 18 rendered-shell tests and 99 domain/regression tests pass. Both the vinext production build and GitHub Pages static export pass. The Node 24 Alpine image builds, runs as `excogitare:1.3.0` on local port 3001 and returns HTTP 200.

## Explicit boundaries

This phase verifies the Create workflow itself. It does not promote the separate Scale, complete Narrative Map Type, Match Intent-aware Polis, continuous Lab, full semantic-protection or Scenario features beyond the statuses in their own records. Browser reload still clears unsaved in-memory state; durable continuation requires downloading and later reopening an `.excogitare` project.
