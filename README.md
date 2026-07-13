# Civ5 Atlas Viewer

A platform-agnostic, browser-based viewer for Civilization V `.Civ5Map` files. The current first version parses a map's physical terrain directly in the browser and renders it to an interactive canvas. No uploaded map data is sent to a server.

## Current features

- Open local `.Civ5Map` files
- Render terrain, coasts, rivers, features, resources, hills, and mountains
- Pan, zoom, inspect tiles, toggle layers, and export the visible canvas as PNG
- Built-in sample map so the interface is useful before a file is selected
- Multi-stage Alpine Linux container

The binary parser follows the format documented by [samuelyuan/Civ5MapImage](https://github.com/samuelyuan/Civ5MapImage). Political borders, city labels, scenario data, and replay files are natural follow-up slices.

## Local development

Requires Node.js 22.13 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Production build

```bash
pnpm build
pnpm start
```

## Alpine Docker container

```bash
docker build -t civ5-atlas-viewer .
docker run --rm -p 3000:3000 civ5-atlas-viewer
```

Open `http://localhost:3000`. Files are still parsed locally by the visitor's browser; the container only serves the application.
