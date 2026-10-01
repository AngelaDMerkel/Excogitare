# V3 Advanced disclosure arrows

Status: **Verified**.

## Contract

The Advanced options accordion shows an up-facing caret when collapsed and a down-facing caret when expanded, as clarified by the user. Its inner sections point right when collapsed and down when expanded. Centre the caret vertically on the text line in either state. Use shared CSS for the active application and the approved mockup; retain native disclosure behavior and sidebar sizing.

## Applicable gates

This is a CSS-only direction and alignment correction. Check expanded/collapsed rendering, section switching, shared asset packaging and whitespace. Data models, generation, randomness, workers, history, editing, import/export, Repair and confirmations are unchanged. No new domain tests or user-guide changes are needed. Reconcile the diff and register after visual verification, then make a semantic commit. Do not push without an explicit request.

## Evidence

- Shared `style.css` uses a centred 12px vector caret instead of the baseline-dependent text glyph. It rotates 180° for the closed Advanced options accordion, −90° for closed inner sections and 0° when expanded. Open-state selectors target only the section's own summary.
- Browser measurements place the caret centre within 0.0001px of the Advanced label's line centre when closed and exactly at its centre when expanded. The up/down directions are preserved.
- Browser verification confirmed Advanced options points up when closed and down when open. Inner sections point right when closed and down when open; switching from World to Shape updated both indicators correctly. [Screenshot](../../mockups/v3/advanced-carets-preview.png).
- Active entry points and the approved Gold text study use an updated stylesheet version to avoid cached arrows. The V3 asset build and `git diff --check` pass. The diff is limited to presentation and its documentation; no new runtime-code/container or domain-suite checks apply.
