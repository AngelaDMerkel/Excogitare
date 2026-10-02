# V3 iteration workflow studies

## Contract

Create one interactive mockup for each requested workflow:

1. **Selective regeneration:** select a region/area/tile or work globally, choose what to reroll, and retain named elements such as coastlines, relief, climate and starts. Use the approved Refine field language, preview and Apply flow.
2. **History and projects:** find bookmarked versions, compare two snapshots, and show where project import/export would fit. Retain the compact history carousel and per-snapshot controls.

## Completion gates

- Isolated pages with prepared maps and session-only history; production behavior and stored maps remain unchanged.
- Reuse approved fields, typography, navy selection and gold bookmarks. Give interactive control feedback and meaningful illustrative previews.
- Explicitly label prototype regeneration and project-file behavior. Do not claim a new selective generator or interoperable project format is implemented.
- Check selection, controls, compare/dismissal, focus and preserved layout; capture screenshots and provide an overview.
- No domain/worker/repair/export changes. Scoped syntax/lint and browser checks are sufficient; reconcile the register and make a semantic commit.

## Evidence

- Added two linked live studies and an illustrated overview. Each runs on prepared, session-only maps through the approved production shell.
- Selective regeneration retains region/area/tile targeting and adds Reroll/Variation plus Keep checkboxes. A protected target blocks the preview until its Keep box is cleared. The default 2,369-tile landmass example relocated 102 deposits across 204 changed tiles; Original/Proposed and Apply worked and created a second session snapshot. The example uses existing lawful local adjustments, not a newly implemented constrained generator.
- History filtering shows two bookmarked versions, and searching “mountains” finds one. Comparing Original with Lower mountains shows 173 changed tiles; Original/Version/Changes and Use version work. Same-dimension comparison is the explicit prototype boundary. The history opener leaves a 13px gap to the first thumbnail and retains the lower fade 32px above the sidebar bottom.
- Open/Save project dialogs display the proposed flow and contents and explicitly state that no project file is read or written. Cancel returns to the comparison. These dialogs do not create an export format.
- Browser review, no-console-error checks, JavaScript syntax, scoped ESLint and whitespace checks pass. Screenshots: [regeneration](../../mockups/v3/iteration-studies/regenerate-preview.png), [history comparison](../../mockups/v3/iteration-studies/history-preview.png), [project dialog](../../mockups/v3/iteration-studies/project-preview.png). No production regeneration, history or project behavior changed.
