# Excogitare

A platform-agnostic, browser-based viewer and basic map editor for Civilization V `.Civ5Map` files. Excogitare parses, renders, generates and edits physical maps directly in the browser.

## Current features

- Open local `.Civ5Map` files
- Render terrain, coasts, rivers, features, resources, hills, and mountains
- Edit map metadata and individual terrain, elevation, feature, resource, and start-location tiles
- Generate deterministic maps from eight landmass presets, Realistic/Fantastical/Mundane/Brutal baseline styles, and the six standard Civ V sizes
- Control water from entirely dry worlds through ocean maps, set mountain percentages and dominant terrain types, tune start quality, and apply modifiers such as Strategic Depth, Fractured World, and Doomsday
- Preserve overland accessibility by carving narrow hill passes through any mountain system that would otherwise isolate territory
- Equal-separation, tournament-normalized, and paired-team multiplayer start layouts
- Undo and redo map edits
- Export imported or generated `.Civ5Map` files, map Lua, `.modinfo`, and the visible canvas as PNG
- Re-open Excogitare-generated Lua scripts and preview other Civ V scripts in a time-limited WebAssembly Lua worker
- Built-in sample map so the interface is useful before a file is selected
- Multi-stage Alpine Linux container

I owe the greatest thanks to [samuelyuan/Civ5MapImage](https://github.com/samuelyuan/Civ5MapImage) who did all the real research and provided all the documentation necessary for me to produce this tool. The native generator's presets take high-level inspiration from [mirror's Fantastical Map Script](https://steamcommunity.com/sharedfiles/filedetails/?id=310024314) broad range of world shapes while using an independent implementation. Lua previews run in an isolated worker with a strict timeout and a growing compatibility layer for `Map`, `GameInfo`, plot mutation, enums, database iteration, and common map-generator helpers. Scripts that depend on unsupported Civ V internals receive a compatibility report.

Realistic generation adapts [terrain-diffusion](https://github.com/xandergos/terrain-diffusion)'s coarse-conditioning and refinement structure into a lightweight deterministic browser implementation with coupled elevation, temperature, and precipitation fields. Its climate model uses softened regional temperature variation and west-to-east wind carrying moisture over terrain to create windward precipitation and persistent eastern rain shadows. It does not bundle or claim to run the repository's pretrained neural diffusion models.

## Docker

`docker-compose` is the recommended deployment method for Excogitare.

## ToDo

- Isometric map viewer
- Emulated API endpoints for Civ5 to read and generate maps based on the Lua
- Modal popup with generation walkthough(?)
