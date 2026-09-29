# Warning-placement studies

Open `http://127.0.0.1:3033/warnings/` and use the comparison bar to switch between:

1. **Aligned icons** — `rail.html`: both symbols occupy the right edge of the fixed label column.
2. **Inside controls** — `control.html`: each symbol sits before the dropdown arrow; selected values keep their normal left edge.
3. **Shared notice** — `notice.html`: one full-width notice below Size/Geometry opens an explanation of both selected risks.

All three start with Colossal/Ribbon and an explanation visible. Normal selections remove the corresponding warning. Hover/focus reveals the explanation; click pins or toggles it, and Escape/outside click dismisses it. Advanced offers the same treatment. The explanations use matching borders on all four sides. The third version opens beside the form so it does not enlarge the sidebar.

These pages use session-only samples and are excluded from the main application and production package. The earlier proposal remains at `original.html`. Screenshots: `rail-preview.jpg`, `control-preview.jpg`, `notice-preview.jpg`. Study 02 is approved and integrated through the main `dimension-warnings.js`/`.css` component; these pages remain design references.
