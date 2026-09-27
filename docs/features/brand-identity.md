# Brand identity

## Contract

Explore a recognizable visual identity for Excogitare, including its wordmark, standalone mark, app icon and favicon. The first deliverable is a comparison of original vector directions, with large lockups, light and dark treatments, a compact studio header and actual 16/32 px favicon samples. The current studio uses warm paper, burgundy and a Georgia wordmark with a diamond placeholder.

Status: **Groundwork**. The user selected the mythic strategy direction as the base and requested new icon versions. Retain its wordmark and gold/night palette during this round so the icon alternatives can be judged consistently. The final icon and production identity remain open.

## Acceptance criteria

- Use the exact spelling Excogitare.
- Make each proposed mark work in one color and remain identifiable at favicon sizes.
- Show how the wordmark and icon relate, with clear type and palette choices.
- Keep exploration assets separate from production assets until a direction is selected.
- Preserve unrelated pending work and record the difference between exploration and integrated branding.

Production follow-through includes final SVG lockups, a small-size mark, favicon SVG/ICO, Apple touch and application PNG icons, metadata integration, and usage guidance. Final typography, palette and imagery will follow the selected direction. No naming change or new product behavior is implied.

## Completion gates

| Gate | Applicability and evidence |
|---|---|
| 1. Contract | The mythic direction is selected. Compare new icon versions against the original with a consistent wordmark and palette. Final icon choice remains open. |
| 2. Model, defaults, workers | Inapplicable: branding does not change map or project state. |
| 3. Domain behavior | Inapplicable: no geographic behavior changes. |
| 4. Interface | The initial directions and mythic refinements show wordmarks, compact studio placement, app tiles and browser context. Production placement remains open. |
| 5. Rendering | Initial directions and all five mythic proofs inspected at 736 px; mobile reflow and exact 16/32 px sizes checked at 320 px. Inverse samples are included. Production raster and browser integration checks remain open. |
| 6. Editing/history | Inapplicable: no editing or history changes. |
| 7. Import/export | Authoring and Civ5Map files are unaffected. The initial round includes twelve SVGs and three 512 px PNGs. The mythic round adds fifteen SVGs and five 512 px PNGs, including its original reference. Final asset packaging remains open. |
| 8. Validation/Repair | Inapplicable: no map validation or repair changes. |
| 9. Checks | Chrome comparison checks passed for the initial three variants and all five mythic proofs at 736/320 px, including navigation, zero horizontal overflow or measured label clipping, exact favicon dimensions and no page errors. Mythic symbol references all resolve. SVG XML and PNG dimensions checked. App regression, lint, type, build and Alpine checks are inapplicable to these design-only files; they apply to later runtime integration. |
| 10. Documentation | This record and the exploration README explain concepts, palette, provisional font samples, regeneration and remaining production work. |
| 11. Reconciliation | The register, this record and the diff agree: the mythic base is selected and four icon alternatives are ready to compare against the original. Application branding remains open. |

## Boundaries

Design exploration is groundwork for an identity, not a claim that branding is implemented or verified in the application. Font samples are provisional until the direction is selected and production font packaging is settled.

## Delivered exploration — 2026-09-27

See [the exploration files](../../mockups/branding/README.md) and [editable comparison](../../mockups/branding/comparison.html).

- **Atlas:** an engraved E seal, Baskerville sample and burgundy/paper palette.
- **Strata:** a geometric E cut into a hexagonal tile, Avenir Next sample and teal/chalk palette.
- **Worldforge:** a compass-like spark within a diamond, Optima sample and gold/night palette.

Small versions simplify Atlas's serif and Worldforge's internal aperture. Preview tracking and main colors can be adjusted through the host's design controls. The local Chrome review also covered the host's dark appearance. This checks presentation mechanics; the user's aesthetic choice and production integration remain open.

## Mythic icon refinement — 2026-09-27

The user preferred mythic and requested new icon versions. [The second comparison](../../mockups/branding/mythic-icons.html) keeps Optima, the uppercase wordmark, the gold/night palette and the sample tagline consistent across five proofs:

- **Wayfinder:** an elongated compass rose within a circular ring. Its tiny version removes the center aperture.
- **Rift:** a diamond split into two landforms by a winding negative-space river. Its tiny version widens the river.
- **Worldseed:** a globe with curved meridians and a star at its crown. Its tiny version reduces the internal lines.
- **Runestone:** a pointed, carved E monogram with the same shape at every size.
- **Original reference:** the unchanged diamond-and-spark geometry from Worldforge.

The comparison's symbols are the authoritative vector source for this round. `generate-mythic-assets.mjs` extracts them into the standalone SVG samples, so export geometry matches the preview. The optional design control switches the main proof onto paper. These are icon proposals; none has been selected or installed as the app's identity.
