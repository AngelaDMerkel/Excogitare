# Brand identity

## Contract

Explore a recognizable visual identity for Excogitare, including its wordmark, standalone mark, app icon and favicon. The first deliverable is a comparison of original vector directions, with large lockups, light and dark treatments, a compact studio header and actual 16/32 px favicon samples. The current studio uses warm paper, burgundy and a Georgia wordmark with a diamond placeholder.

Status: **Groundwork**. The user requested all three proposed directions for comparison: scholarly cartography, geometric worldbuilder and mythic strategy. The initial comparison is ready; no final visual direction has been selected yet.

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
| 1. Contract | Initial exploration contract and acceptance criteria above. Final identity choice remains open. |
| 2. Model, defaults, workers | Inapplicable: branding does not change map or project state. |
| 3. Domain behavior | Inapplicable: no geographic behavior changes. |
| 4. Interface | Each direction shows a compact studio header, app tile, browser tab and palette. Production placement remains open. |
| 5. Rendering | All three directions inspected at 736 px; mobile reflow and exact 16/32 px sizes checked at 320 px. Inverse samples are included. Production raster and browser integration checks remain open. |
| 6. Editing/history | Inapplicable: no editing or history changes. |
| 7. Import/export | Authoring and Civ5Map files are unaffected. Twelve SVG concept assets and three 512 px PNG proofs are included. Final asset packaging remains open. |
| 8. Validation/Repair | Inapplicable: no map validation or repair changes. |
| 9. Checks | Chrome comparison checks passed for all three variants at 736/320 px, including navigation, zero horizontal overflow or measured label clipping, exact favicon dimensions and no page errors. SVG XML and PNG dimensions checked. App regression, lint, type, build and Alpine checks are inapplicable to these design-only files; they apply to later runtime integration. |
| 10. Documentation | This record and the exploration README explain concepts, palette, provisional font samples, regeneration and remaining production work. |
| 11. Reconciliation | The register, this record and the diff agree: this is a comparison of three directions with reusable concept assets. Application branding remains open. |

## Boundaries

Design exploration is groundwork for an identity, not a claim that branding is implemented or verified in the application. Font samples are provisional until the direction is selected and production font packaging is settled.

## Delivered exploration — 2026-09-27

See [the exploration files](../../mockups/branding/README.md) and [editable comparison](../../mockups/branding/comparison.html).

- **Atlas:** an engraved E seal, Baskerville sample and burgundy/paper palette.
- **Strata:** a geometric E cut into a hexagonal tile, Avenir Next sample and teal/chalk palette.
- **Worldforge:** a compass-like spark within a diamond, Optima sample and gold/night palette.

Small versions simplify Atlas's serif and Worldforge's internal aperture. Preview tracking and main colors can be adjusted through the host's design controls. The local Chrome review also covered the host's dark appearance. This checks presentation mechanics; the user's aesthetic choice and production integration remain open.
