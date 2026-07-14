# Excogitare

A platform-agnostic, browser-based viewer and basic map editor for Civilization V `.Civ5Map` files. Excogitare parses, renders, generates and edits physical maps directly in the browser.

## Current features

- Open local `.Civ5Map` files
- Render terrain, coasts, rivers, features, resources, hills, and mountains
- Edit map metadata and individual terrain, elevation, feature, resource, and start-location tiles
- Generate deterministic maps from six landmass presets and the six standard Civ V sizes
- Equal-separation, tournament-normalized, and paired-team multiplayer start layouts
- Undo and redo map edits
- Export imported or generated `.Civ5Map` files, map Lua, `.modinfo`, and the visible canvas as PNG
- Re-open Excogitare-generated Lua scripts and preview other Civ V scripts in a time-limited WebAssembly Lua worker
- Built-in sample map so the interface is useful before a file is selected
- Multi-stage Alpine Linux container

I owe the greatest thanks to [samuelyuan/Civ5MapImage](https://github.com/samuelyuan/Civ5MapImage) who did all the real research and provided all the documentation necessary for me to produce this tool. The native generator's presets take high-level inspiration from [mirror's Fantastical Map Script](https://steamcommunity.com/sharedfiles/filedetails/?id=310024314) broad range of world shapes while using an independent implementation. Lua previews run in an isolated worker with a strict timeout and a growing compatibility layer for `Map`, `GameInfo`, plot mutation, enums, database iteration, and common map-generator helpers. Scripts that depend on unsupported Civ V internals receive a compatibility report.

## Docker

`docker-compose` is the recommended deployment method for Excogitare.
