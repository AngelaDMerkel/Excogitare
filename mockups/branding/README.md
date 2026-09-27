# Excogitare brand exploration

Three original vector directions for review. These files are **groundwork**, not the application's production identity.

| Direction | Idea | Wordmark sample | Palette |
|---|---|---|---|
| Atlas | An engraved E in a circular publisher's seal; a scholarly, editorial identity. | Baskerville, with Georgia fallback | Burgundy `#6e3f47`, paper `#f6f0e6`, ink `#302b27` |
| Strata | An E cut into a hexagonal land tile; a compact, geometric identity. | Avenir Next, with Avenir/Arial fallback | Deep teal `#214e50`, chalk `#eef2eb`, mint `#b9d7c6` |
| Worldforge | A four-point spark inside a diamond; a dramatic compass-like emblem. | Optima, with Palatino/Georgia fallback | Gold `#d9b678`, night `#252c40`, vellum `#f2e8d6` |

`comparison.html` is the editable inline comparison. Each direction shows a large wordmark, compact studio placement, inverse treatment, app icon and actual 16/32 px favicon samples. Use the carousel to compare the directions. The optional design controls adjust preview tracking and switch each main proof between its paper and ink treatments.

`generate-assets.mjs` is the source for the twelve standalone SVG samples in `assets/`. Run it with Node to regenerate them. `*-mark.svg` is the full-detail mark, `*-favicon.svg` is the simplified small-size treatment, `*-app.svg` is the inverse app tile, and `*-lockup.svg` pairs the mark with a live-text wordmark. `*-app-512.png` is a raster proof generated from the app SVG.

Typeface samples rely on installed system fonts; fonts are not redistributed. Wordmark outlines, optical kerning, final licenses/font packaging, icon pixel adjustments, ICO/Apple/PWA production files, social imagery and application integration follow the choice of direction. The final app does not need to adopt these sample typefaces or taglines.

The comparison and the assets use fixed brand palettes intentionally, including both light and dark examples. Current application files and metadata are unchanged.

## Round 2: mythic icons

The user selected mythic as the base. `mythic-icons.html` compares **Wayfinder**, **Rift**, **Worldseed** and **Runestone** with the **Original reference**. The original wordmark style, palette and tagline are held constant while the icon geometry changes. Each proof includes the main lockup, an inverse app tile, small-size variants and one-color placement on paper.

The symbols inside this comparison are the authoritative source for this round. Run `node mockups/branding/generate-mythic-assets.mjs` to export fifteen SVG proofs to `assets/mythic/`. Each option has a full mark, favicon and app SVG. The five `*-app-512.png` files are rasterized app-icon proofs. They are review assets, not a final browser or application icon package.

All five proofs passed Chrome layout checks at 736/320 px, including carousel navigation, resolved symbol references, exact 16/32 px favicon dimensions and no measured clipping or page errors. SVG XML and 512 px PNG dimensions were checked. A final icon choice and production integration remain open.
