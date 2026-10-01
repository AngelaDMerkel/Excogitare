# Experimental-option menus

Three isolated dropdown studies using the current V3 interface:

- `grouped.html`: one menu with a separated Experimental section.
- `tagged.html`: one flat list with experimental choices shown in gold text, without badges or an extra guidance footer.
- `folded.html`: an expandable Experimental section; it opens automatically when the selected value is experimental.

`index.html` compares the interactive controls side by side. Each page also has a full application view. Menus are positioned from the actual displayed control rectangle, including sidebar scaling, and remain outside clipped containers. The existing select values and change handlers remain authoritative. Arrow keys, type-ahead, Enter, Escape, Tab and outside dismissal are supported.

All controls use the same form grid and menu styling; Size and Geometry add the experimental treatment. The pages start with Colossal/Ribbon and the Geometry choices open for review. Grouped and Expandable keep a short warning footer. Gold text uses only colour in the visible list, with experimental status and the warning available to assistive technology. Standard and Advanced retain their separate settings, and all review history is session-only. The main interface and production build do not load these study assets.

Approved 02 Gold text is integrated into the active interface through the shared `select-menus.js` and `select-menus.css` assets. These three pages remain design references.
