# Refine studies

Open `/refine-studies/` on the V3 preview server:

- **01 Compact form** — Category, Change and Strength fields.
- **02 Category toolbox** — expandable tool families.
- **03 Quick actions** — common adjustments in a short list.
- **04 Generate style** — labelled Selection, Category, Change and Strength dropdowns with Generate’s exact field geometry; text Import, Undo, Redo and Clear selection actions.

04's Selection dropdown explicitly separates **Region**, **Area** and **Single tile**. Region reveals its geographic type; Area reveals Rectangle or Custom boundary. Single tile selects one hex and omits Strength. Changing modes clears the previous target; preview stays unavailable until a new target is selected.

All four separate **Global changes** from **Local refinement**. Global changes combine map-wide climate, relief, vegetation and resource adjustments; Local refinement retains its own tool settings and selected region. The shared footer previews the active section, and switching sections preserves both drafts. Global transformations are illustrative prototype operations, not a completed climate or balancing engine.

Local refinement supports **Region** and **Outline**, following the user's preference for region selection rather than brushing:

- Region selects a connected landmass, terrain region, woodland, highland or water body. Shift-click adds a region; Alt-click removes one.
- Outline places boundary corners with clicks. Use **Finish boundary** or Enter to select enclosed tile centres. Backspace removes the last point; Escape cancels the unfinished outline. Dragging still pans the map.
- Local refinement with no selected region disables editing. Only Global changes operates across the whole map.

The fixed footer previews changes, compares Original/Proposed and offers Discard/Apply. Apply creates a session snapshot; Undo/Redo restores accepted edits. Check map groups the three deliberate fixture findings and uses the same footer to preview corrections. Review balance opens the existing Starting balance view.

These are isolated interface studies with representative edits. They use sample data and existing placement rules; resource redistribution is not a new balancing engine. Import and Save retain the existing handlers. Production, durable browser history and the generator are unchanged.

**04 is approved and integrated into the main Refine pane.** These pages remain design references. The main application uses separately tested editing/selection functions and normal map history.
