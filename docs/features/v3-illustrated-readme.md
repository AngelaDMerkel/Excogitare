# Illustrated V3 user guide

Status: **Verified** for the documentation scope.

## Contract

Expand the concise README into a practical illustrated guide. Use screenshots of the current interface to support feature descriptions, with useful captions and alt text. Explain Standard generation, Advanced controls, local edits and terrain corrections, map layers, history and export. Retain setup, credits and the link to the original-interface guide. Avoid presenting legacy-only or planned features as available in V3.

## Completion gates

- Capture current, representative UI states without changing the user's saved maps; use session-only samples for edits and generation.
- Verify wording against the application, including generation controls, planned-start limits, correction previews and local history retention.
- Check local image/link targets, inspect screenshots and review the rendered guide for readability.
- This task changes documentation and screenshots only. Data model, workers, determinism, domain behavior, actual editing/history, import/export implementation and Repair implementation are inapplicable. No runtime or deployment changes are required; builds, domain tests and Alpine checks are inapplicable.
- Reconcile the feature record, register and final diff. Preserve existing Layers changes. Make semantic commits; do not push.

## Evidence

- Expanded the README with descriptions of all eleven Standard controls, the Advanced groups and Automatic/reset behavior, selected edits, terrain findings and correction previews, five display layers, 100-snapshot history, mobile, export and compatibility. Setup, credits and the original-interface guide remain.
- Captured six current screenshots in `docs/images/`: Generate, Advanced, a 33-tile woodland preview, the built-in repair example with three findings and two changed tiles, Layers/history and mobile. Captures used a session-only copy of the current application, real generation and native UI actions; the user's persistent history was untouched.
- Desktop captures are 1280×720; mobile is 390×844 and displayed at 260px in the guide. The six JPEGs total 404,869 bytes. Every image has descriptive alt text; desktop workflow images have captions.
- Verified wording against `mockups/v3/app.js`, `generation-controls.js`, the V3 planning/surface code and the documented export boundaries. The repair image is explicitly described as a deliberate example, and planned starts are distinguished from Civ V's assigned starts.
- All local image/document links and section anchors resolve. A local Marked rendering displayed all six images, eleven control rows and no horizontal overflow. The overview and illustrated Refine section were visually reviewed; each source screenshot was also inspected.
- `git diff --check` passes. This change is documentation only, so no runtime/domain builds or tests were rerun. Existing Layers changes remain intact; the completed work is being recorded in semantic commits.
