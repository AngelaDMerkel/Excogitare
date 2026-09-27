# Excogitare — Wayfinder

Wayfinder is Excogitare's selected identity: an elongated compass rose within a ring, paired with the uppercase mythic wordmark. Use the same silhouette and proportions across the product.

## Palette and contrast

| Color | Value | Use |
|---|---|---|
| Gold | `#d9b678` | Mark and wordmark on night; app icon background |
| Night | `#252c40` | Brand headers, favicon background, ink on paper |
| Paper | `#f2e8d6` | Light brand surfaces and supporting text on night |

Use gold on night, night on gold, or night on paper. On ordinary white/paper UI, use the ink assets. Gold is a decorative accent on light surfaces, not a small-text color. The studio retains its map-first paper workspace around the night brand header.

## Files

- [Wayfinder master](../public/brand/wayfinder.svg) and [ink master](../public/brand/wayfinder-ink.svg).
- [Small-size mark](../public/brand/wayfinder-small.svg): a thicker ring and closed central aperture, intended for 16–32 px.
- [Wordmark](../public/brand/wordmark.svg), [ink wordmark](../public/brand/wordmark-ink.svg), [horizontal lockup](../public/brand/lockup.svg) and [ink lockup](../public/brand/lockup-ink.svg).
- [README banner](../public/brand/banner.svg) and [social artwork](../public/og-editor.png).
- [SVG favicon](../public/favicon.svg), [ICO favicon](../public/favicon.ico) with native 16/32/48 px entries, and [180 px Apple touch icon](../public/apple-touch-icon.png).
- [192 px application icon](../public/brand/icon-192.png), [512 px application icon](../public/brand/icon-512.png), and [maskable icon](../public/brand/icon-maskable-512.png) with extra safe-area padding.

Keep at least one quarter of the mark's width clear around standalone uses. Retain the wordmark's letter spacing and aspect ratio. Use the small-size symbol at favicon scale; its simplification is intentional. Do not substitute a font for the production wordmark. Supply “Excogitare” as its accessible name, and hide a neighboring decorative compass from screen readers.

## Source and regeneration

[`branding/identity.json`](../branding/identity.json) defines the approved geometry and palette. [`branding/wordmark.json`](../branding/wordmark.json) freezes the approved uppercase Optima Regular sample at 0.10 em tracking as vector outlines. No font file is distributed or downloaded. The application and asset generator both use these sources.

Run `node scripts/generate-brand-assets.mjs` with `sharp` available, or set `SHARP_MODULE` to an installed sharp package directory. This rebuilds the SVGs, PNGs, ICO and manifest. Run `node --experimental-strip-types scripts/render-social-art.mjs` with the same sharp configuration to regenerate both social images from an actual generated map and the production brand vectors.

The manifest uses relative URLs so its start page, scope and icons stay within either `/` or `/Excogitare/`. It advertises the application in ordinary browser mode; branding adds no offline caching or standalone app behavior. Layout metadata supplies the correct deployment prefix for all browser icons.

The files under `mockups/branding/` are the historical design exploration. Production branding is under `branding/` and `public/brand/`.
