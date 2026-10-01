# Layers integration studies

Open `/layer-integration/` on the V3 preview server to compare:

- **01 Map palette** (`palette.html`): refined at the user's request into an attached dropdown with direct switches, simple group headings and a separate tile inspector shown while inspecting the canvas.
- **02 Canvas toolbar** (`toolbar.html`): view selection and layer categories beneath the map title, with one open category at a time.
- **03 Map dock** (`dock.html`): display settings and session history share a right-hand panel.

The prototypes use the approved V3 styling and session-only samples. Visibility toggles redraw the map, resource counts use sample data, and tile details show terrain, features, resource quantities and placement findings. In 01, details appear only while hovering over the map and disappear outside it; the popup aligns with the Save button's bottom edge. The other two studies retain click-to-pin. Zero-count city states and issues are shown as unavailable rather than populated with invented records.

Movement, Freshwater, Settlement potential and Starting balance colours are labelled **Illustrative**. They demonstrate presentation, not validated game calculations. Lake classification uses small enclosed water components; river counts are river-bearing tiles. Resource artwork demonstrates category symbols and several distinct examples, not a finished icon catalogue. Coordinates appear when zoomed in.

These studies remain isolated design references. Approved 01 is now integrated through the main `layers.js` and `layers.css`, with map-derived analysis replacing the illustrative study colours. The other two layouts remain alternatives.
