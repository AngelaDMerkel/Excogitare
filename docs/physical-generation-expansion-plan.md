# Physical generation expansion plan

This is the working plan for expanding Physical with a deliberately comprehensible Earth-system approximation. It borrows broad physical ideas, not implementation code or numeric parity, from the referenced Space Calc climate simulator and Mythcreants climate-cartography guide.

## Retained nine-pass model

1. **Plate field** — distribute continental and oceanic plates, retain motion vectors and resolve convergent and divergent boundaries.
2. **Hypsometry** — combine crust, boundary uplift, rifting and multi-scale relief; derive exact sea level from the requested tile budget.
3. **Erosion** — diffuse old relief while retaining active ranges and calculate coast/ocean distance as continentality.
4. **Thermal field** — calculate projected annual insolation, altitude cooling, maritime moderation and axial seasonal range, then spatially smooth temperature.
5. **Atmospheric cells** — construct continuous tropical, temperate and polar wind fields; rotate them with the selected projection and reverse the zonal component for retrograde worlds.
6. **Moisture transport** — iteratively advect vapor, evaporate ocean/lake water, recycle wet-land moisture, mix neighboring air and condense through convergence and orographic lift.
7. **Water balance and biomes** — compare precipitation and recycled moisture with temperature-driven evaporation demand; use the result for continuous Civ V terrain and feature selection.
8. **Drainage** — priority-flood land toward real water outlets, accumulate runoff and expose major/minor drainage guidance to the shared legal river encoder.
9. **Retained geography** — record climate cells, contiguous biome regions, rain shadows, glacial regions and outlet-based watersheds alongside plates, continents and ocean basins.

## Physical preset family

| Preset | Intended signature |
|---|---|
| Dynamic Earth | Balanced plates, seasons, maritime influence and circulation. |
| Colliding Plates | Young high ranges, strong uplift, wet windward slopes and hard rain shadows. |
| Ancient Continental Shields | Quiet old relief, mature drainage and broad continental climates. |
| Volcanic Island Arcs | Oceanic plate boundaries, maritime climates, wet volcanic arcs and small watersheds. |
| Inland Supercontinent | Low sea share, severe continentality, dry interiors and long outlet paths. |
| Monsoon Continents | Strong seasonality, warm coastal moisture and wet subtropical margins. |
| Glacial World | Cool mean climate, strong seasonal range, expanded tundra and glacial regions. |

## Controls

- **Rotation:** prograde or retrograde prevailing circulation.
- **Axial seasonality:** mild, Earth-like or extreme.
- **Ocean influence:** weak, normal or strong maritime heat and moisture exchange.
- Existing plate activity, erosion, climate, rainfall, projection and river density remain authoritative.

## Verification matrix

- Determinism and material preset differences.
- Exact water targets at 0, 35, 55, 75 and 90 percent.
- Wind reversal and smoothly varying cell boundaries.
- Stronger annual range inland than along coasts.
- Wetter windward slopes and measurable leeward rain shadows.
- Island Arc maritime humidity; Supercontinent continental aridity; Icehouse cold coverage.
- Outlet-directed watershed guidance and Repair-clean rivers.
- All safe sizes, wraps and projections; representative extreme geometries.
- Unchanged engine identity and legality for Excogitare, Eccentric and Polis.

## Known scientific boundary

The browser must generate a Civ V map quickly and deterministically. The model therefore approximates atmospheric circulation and steady-state moisture on the existing hex grid. It does not solve pressure, ocean currents or fluid dynamics, and its seasonal range affects the generated biome rather than adding seasons to Civ V.

## Completion reconciliation

- [x] All nine retained passes are implemented in the authoritative Physical path.
- [x] All seven presets are selectable, materially distinct and represented in the README gallery.
- [x] Rotation, axial seasonality and ocean influence are authoritative options with defaults, preset values, Randomise behavior, controls and reset behavior.
- [x] Atmospheric cells, climate regions, rain shadows, glacial regions and watersheds survive in `GenerationStructure`.
- [x] Shared legality, starts, accessibility, resources, rivers, Repair, history, selective regeneration and export remain intact.
- [x] Scientific limits and source relationships are disclosed without claiming source-code or numerical parity.
- [x] Full regression, production, static and Alpine checks pass.
