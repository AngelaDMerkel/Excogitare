# V3 reuse snapshot settings

Status: **Implemented**. Browser behavior and V3 packaging pass; fresh full builds/type checking are blocked by a pre-existing deleted hosting configuration.

## Contract

Add **Use this map's settings** in Map details for generated snapshots with retained V3 requests. Loading history alone continues to preserve the user's current draft. Explicit reuse loads the corresponding Standard or Advanced editor, clears the source seed for a fresh roll, and preserves both previous drafts for **Undo settings change**. The inactive editor is retained. Source controls do not represent subsequent Refine edits.

## Completion gates

- Validate the complete source request against supported UI fields before changing any values. Reject unknown or invalid settings without partial changes.
- Restore dynamic engine controls, map type, booleans, numeric controls and recipe options. Commit pending text/numeric input before saving the previous draft. Undo restores both drafts and the previous editor.
- Imported/prepared maps without retained source settings do not offer reuse. Generated snapshots and their Refine descendants use the stored original request. Do not guess settings from geography or treat generated engine recipe seeds as the original UI draft.
- Busy storage/generation or a pending Refine preview prevents replacement. Reuse/Undo must not generate a map, mutate history, move the camera or discard a preview. Keep the sidebar frame fixed.
- No generator, map-schema, persistence, repair or export behavior changes. Run browser restoration/Undo/unsupported-state checks, relevant regressions, lint/types and production/Pages packaging. Alpine only if available.
- Update help/register and commit checked work without pushing. Preserve unrelated `.openai/hosting.json` deletion.

## Evidence

- Added Use this map’s settings and Undo settings change to Map details in the main page and active aliases. No source action appears on prepared/imported maps without retained requests. Main browser history exposed the action on an existing generated snapshot.
- Browser tests restore all eleven Standard values, then Undo returns the previous Standard draft. Advanced restoration covers a Physical map type, dynamic plate activity, numeric fields, numeric team-size selection, a false guarantee flag and recipe options; the source seed is cleared.
- Undo preserves a pending, not-yet-blurred Water % input of 33. Unsupported geometry fails before any controls change. A pending Refine preview disables reuse. Changing controls invalidates the one-level settings undo; unchanged input commits do not.
- A real worker generation after Standard reuse produced Harrow Reach with the exact restored two-player/Tiny/Wide controls and a fresh UUID seed. No console errors were observed. The source snapshot itself is unchanged by reuse.
- Scoped ESLint, JavaScript syntax, V3 packaging and 29 existing rendered/fit checks pass. The rendered checks use the preceding server artifact because fresh production, Pages/type checks stop at `vite.config.ts:3`: the already-deleted `.openai/hosting.json` cannot be resolved. Its deletion is preserved. No hosting or deployment configuration was changed, and Alpine was not attempted with that build prerequisite missing.
- Updated the user guide and captured [Map details](../images/v3-reuse-settings.png). The feature register records the outstanding external build blocker rather than claiming full verification.
