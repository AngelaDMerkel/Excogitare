# V3 integrated Layers studies

Status: **Verified** for the desktop interface studies. Approved 01 is integrated separately in [V3 Layers palette](v3-layers-palette.md); these pages remain design references.

## Contract

Create three interactive mockups for a more integrated Layers experience, using the approved V3 palette, typography, Generate/Refine sidebar and rear canvas. Include the approved Landscape, Water, Resources, Starts & landmarks and Guides groups; counts and distinct resource symbols; tile details; and Normal, Movement, Freshwater, Settlement potential and Starting balance views.

Compare **01 Map palette**, **02 Canvas toolbar** and **03 Map dock**. Opening or closing controls must not move or resize the map. Keep text brief, preserve keyboard access, and use session-only history. Existing production pages and earlier mockups remain intact.

The user requested a refinement of 01: match the existing interface more closely and make it a true toggle menu. Attach it beneath Layers, replace the accordion counters with simple group headings and switches, and show tile details separately when inspecting the canvas.

Align that separate popup's bottom edge with the rendered Save Map button, including after sidebar scaling or window resizing.

01's popup appears while hovering over the map and disappears over empty canvas or other controls. Remove its pin action and pinning instructions. Cancel pending hover updates when leaving so they cannot reopen it.

## Gates and boundaries

- These are interface studies. Grouped visibility, sample counts, tile inspection and dismissal must work; analytical colours demonstrate the proposed interaction and are labelled illustrative, without gameplay or balance claims.
- The existing sample tile data is authoritative for the mockup's item counts and inspector. Missing data must appear as absent, not invented findings or city-state starts.
- No new generation, import/export, saved-history, worker, Repair or selective-regeneration behavior is promised. The normal application remains separate from study-only code.
- Check all three in a desktop browser, relevant keyboard/dismissal and view/toggle interactions, stable map framing and compact desktop placement. Run syntax/lint and whitespace checks. Production/Alpine builds are inapplicable to unshipped mockup assets.
- Record screenshots, reconcile the register and code, and make semantic commits as checked changes are completed. Do not push without an explicit request.

## Evidence and reconciliation

- 01's popup bottom is positioned from the Save button's rendered bounds and recalculated on resize/sidebar-fit events. Browser measurement: both bottom edges at 816.4296875px, a 0px difference. [Alignment screenshot](../../mockups/v3/layer-integration/palette-inspector-alignment.png). Syntax/lint and whitespace checks pass for this adjustment.
- All three pages render with the existing Generate/Refine controls, sample map and history. The refined 01 uses native checkbox inputs with switch semantics, five plain group headings, the existing paper/navy styling and an 8px gap beneath Layers. Its tile inspector is separate and initially hidden.
- Keyboard switching changes resource visibility; Escape closes the menu and restores focus to Layers. Reopening preserves the settings. 01's tile details now follow hover without a pin control or pinning instructions; the other studies retain click-to-pin.
- Browser verification confirmed the popup is visible over a map tile and disappears over empty canvas. Pending animation frames are cancelled on leaving, dragging or window blur. The Save-button alignment is preserved. [Hover details screenshot](../../mockups/v3/layer-integration/palette-hover-details.png). Syntax/lint and whitespace checks pass.
- For refined 01 at 1105×853, the unobscured map rectangle (320,350)–(650,550) has zero changed pixels between menu-open and menu-closed screenshots. Disabling Luxury changes 4,842 pixels in that same region. The earlier palette's Movement selection changed the map and displayed the Illustrative legend.
- Toolbar group switching and dock Display/History switching were exercised in the browser. All three were visually reviewed on desktop; the initial layouts were also inspected at 1280×720. Dedicated mobile interaction and a full breakpoint matrix were not run; the established mobile boundary hides these desktop controls.
- JavaScript syntax, scoped ESLint and whitespace checks pass. No browser runtime errors were reported in the checked session. No production build is needed: the build manifest is unchanged and excludes these study assets.
- Screenshots: [01 Map palette](../../mockups/v3/layer-integration/palette-preview.png), [02 Canvas toolbar](../../mockups/v3/layer-integration/toolbar-preview.png), [03 Map dock](../../mockups/v3/layer-integration/dock-preview.png). The comparison page links to each live mockup.
- Analytical colours and inferred lake classification are illustrative; resource symbols demonstrate categories and selected examples. These studies do not claim completed game analysis or a complete resource-icon catalogue. Sample counts and tile findings are real; absent city-state data remains unavailable.
