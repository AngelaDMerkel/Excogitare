# Brand identity

## Contract

Adopt Wayfinder as Excogitare's recognizable visual identity, including its wordmark, standalone mark, app icon and favicon. The original comparison explored large lockups, light/dark treatments, a compact studio header and actual 16/32 px favicon samples. Production replaces the studio's diamond placeholder and the legacy V emblem with the selected compass rose.

Status: **Implemented**. The user selected **Wayfinder** as Excogitare's branding. Its compass rose, outlined uppercase wordmark and gold/night palette are integrated in production, with a legible one-color treatment on paper. Automated and Chrome verification passes; the Alpine runtime check is unavailable because Docker's daemon is stopped. The exploration sections below are historical.

## Acceptance criteria

- Use the exact spelling Excogitare.
- Make each proposed mark work in one color and remain identifiable at favicon sizes.
- Show how the wordmark and icon relate, with clear type and palette choices.
- Keep historical exploration files separate from the selected production identity.
- Preserve unrelated pending work and record the difference between exploration and integrated branding.

Production includes final SVG lockups, a small-size mark, favicon SVG/ICO, Apple touch and application PNG icons, browser links, social artwork and usage guidance. No naming change or new map behavior is implied.

## Production acceptance

- The studio and retained legacy header use the same Wayfinder mark and wordmark, with accessible Excogitare naming and no clipped controls at supported widths.
- The wordmark uses outlines so its appearance is stable without downloading or bundling system fonts.
- Provide master and small-size marks, light/dark lockups, SVG and ICO favicons, 180 px Apple touch, 192/512 px application icons and a correctly scoped web manifest.
- Metadata and asset references work on both the root deployment and GitHub Pages under `/Excogitare`; shared/social images use the selected identity.
- The gold/night brand treatment meets readable contrast in the header; surrounding map and authoring workflows remain usable.
- Brand files can be regenerated from versioned source assets. No font files or network font requests are needed.

## Completion gates

| Gate | Applicability and evidence |
|---|---|
| 1. Contract | Wayfinder explicitly selected by the user. The production acceptance criteria above are met. |
| 2. Model, defaults, workers | Inapplicable: branding does not change map or project state. |
| 3. Domain behavior | Inapplicable: no geographic behavior changes. |
| 4. Interface | Shared accessible components serve the studio and legacy header. Gold/night brand headers and navy studio accents are integrated. Chrome checked the studio at 1440/1024/768/390/320 px and legacy at 1440/1200 px; wordmarks and controls do not overlap or clip. Hide/show controls still work. |
| 5. Rendering | Canonical JSON geometry drives both components and exported assets. Wordmark outlines require no font file or network request. Favicon XML, 16/32/48 px ICO entries, 180/192/512 px PNG dimensions, inverse treatments and the social card were checked. Gold/night contrast is 7.21:1; paper/night is 11.43:1. |
| 6. Editing/history | Inapplicable: no editing or history changes. |
| 7. Import/export | Authoring and Civ5Map files are unaffected. Production exports include master/small vectors, wordmarks, lockups, a banner, favicon SVG/ICO, Apple/app/maskable PNGs and social images. The manifest stays within either the root deployment or `/Excogitare/`. |
| 8. Validation/Repair | Inapplicable: no map validation or repair changes. |
| 9. Checks | 313 domain tests and 26 rendered-interface tests pass, as do repository lint, TypeScript, Vinext production build and Next/Pages export verification. Chrome reports no page errors; icon/manifest requests return 200 from the app's host. Alpine could not run: Docker's daemon/socket is unavailable. |
| 10. Documentation | The brand guide records files, palette, contrast, accessible naming, clear space, font provenance and regeneration. README banner, studio screenshot and social imagery show Wayfinder. Exploration files remain historical. |
| 11. Reconciliation | Request, register, canonical geometry, assets, app components and documentation agree on Wayfinder. Unrelated pending changes are preserved. Validation ran against the shared working tree; only branding changes and their required import are staged. |

## Boundaries

The historical exploration was groundwork. The selected identity is now implemented, with its stated browser and automated checks verified. Alpine compatibility is not claimed. The manifest uses ordinary browser display and does not add offline caching, accounts or standalone app behavior.

## Production evidence — 2026-09-27

See [brand assets and usage](../branding.md). `branding/identity.json` preserves the selected Wayfinder geometry; `branding/wordmark.json` stores the approved Optima sample as outlines. Both React headers and the export generators consume these sources.

Browser links are emitted directly in the root head so Vinext cannot resolve them against the default social metadata URL. The production browser check used port 4318 and confirmed all four icon/manifest requests stayed on that origin. The Pages export checked all links under `/Excogitare/`, icon file presence and relative manifest scope.

The `pnpm test` wrapper attempted an automatic dependency reinstall because the pre-existing dependency tree differs from the pending package changes. No reinstall was performed. The same build, rendered-test and domain-test commands from `package.json` were run directly with the installed Node 24 dependencies: 26 + 313 tests passed. Lint and type checking passed, as did production and Pages builds. Docker reported a missing daemon socket, so no Alpine result is claimed.

## Delivered exploration — 2026-09-27

See [the exploration files](../../mockups/branding/README.md) and [editable comparison](../../mockups/branding/comparison.html).

- **Atlas:** an engraved E seal, Baskerville sample and burgundy/paper palette.
- **Strata:** a geometric E cut into a hexagonal tile, Avenir Next sample and teal/chalk palette.
- **Worldforge:** a compass-like spark within a diamond, Optima sample and gold/night palette.

Small versions simplify Atlas's serif and Worldforge's internal aperture. Preview tracking and main colors can be adjusted through the host's design controls. The local Chrome review also covered the host's dark appearance. At this stage the user's aesthetic choice and production integration were still open.

## Mythic icon refinement — 2026-09-27

The user preferred mythic and requested new icon versions. [The second comparison](../../mockups/branding/mythic-icons.html) keeps Optima, the uppercase wordmark, the gold/night palette and the sample tagline consistent across five proofs:

- **Wayfinder:** an elongated compass rose within a circular ring. Its tiny version removes the center aperture.
- **Rift:** a diamond split into two landforms by a winding negative-space river. Its tiny version widens the river.
- **Worldseed:** a globe with curved meridians and a star at its crown. Its tiny version reduces the internal lines.
- **Runestone:** a pointed, carved E monogram with the same shape at every size.
- **Original reference:** the unchanged diamond-and-spark geometry from Worldforge.

The comparison's symbols are the authoritative vector source for this historical round. `generate-mythic-assets.mjs` extracts them into the standalone SVG samples, so export geometry matches the preview. The optional design control switches the main proof onto paper. The user subsequently chose Wayfinder; its production source is recorded above.
