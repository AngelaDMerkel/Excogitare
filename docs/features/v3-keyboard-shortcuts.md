# V3 keyboard shortcuts

Status: **Verified** for the shortcut workflow.

## Contract and gates

- R invokes Randomise all on desktop (Randomise on mobile), G invokes Generate on desktop, F fits the map and D invokes the existing Save action.
- Ignore text/select/editable fields, Ctrl/Command/Alt combinations, composition, repeated keydown and open modal dialogs. Uppercase and lowercase letters both work. Do not let G cancel an in-progress job; preserve the existing preview guards and disabled download behavior.
- Reuse existing generation, fitting and download actions. Add accessible key metadata and concise button tooltips without new toolbar controls. Document the keys.
- Verify actual browser actions, field typing, modifier handling, fit restoration and download initiation. Generator data, history format, import/export serialization and Repair rules are unchanged; existing regression evidence applies to those boundaries.
- Run relevant UI checks, lint/types, builds and packaged-browser checks. Reconcile the record/register and make a semantic commit; do not push.

## Delivered behavior and verification

- Desktop R/G switch to Generate and invoke the existing actions. F calls the shared fit function. D activates the existing desktop/mobile Save link. Mobile R uses compact generation; G does not invoke hidden desktop settings.
- Buttons expose concise key tooltips and `aria-keyshortcuts`; the canvas exposes F. Running generation removes the Generate/Randomise key hint from the temporary Cancel action. Existing plus/minus/zero controls remain.
- In the browser, R created a snapshot and revealed the randomised Standard settings. Uppercase G created another snapshot. G pressed while generation was running left the job running. R/G during a Refine preview preserved both the preview and workspace and showed the existing Apply/Discard guidance.
- Typing `rgfd` in the seed input retained all four letters, with no generation or download. Pixel comparisons confirm that typing did not reset a manually moved map, and F restored the exact fitted map image after panning. Alt+G did not invoke generation. Repeat/composition/modal checks are explicit handler guards.
- Desktop D produced `Sable Marches.Civ5Map` (90×22, 16,872 bytes). Mobile R created a compact map and mobile D produced `Orin Reach.Civ5Map` (28×72, 17,153 bytes). Both downloaded files were found on disk, parsed successfully and matched the seeds displayed in Map details. The browser download-event waiter did not report the Blob download, so delivery was checked against the actual files.
- The packaged page exposes all four shortcuts and F works after reload without browser errors. TypeScript, lint, **29 UI/fit checks**, production and Pages builds pass. The existing generator regression corpus was not rerun for these bindings. Alpine remains unavailable because the Docker daemon is not running.
- [Verification results](../verification/v3-keyboard-shortcuts.json) retain the pixel and download evidence. README/help and the register match the implementation. This work is scoped to a separate semantic commit; no map format or game-compatibility claim is added.
