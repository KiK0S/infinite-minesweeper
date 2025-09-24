# Infinite Minesweeper

A WebAssembly powered take on Minesweeper where the board is infinite and procedurally generated. The core game logic is implemented in modern C++ and compiled to WebAssembly with Emscripten, while the UI is rendered on an HTML5 canvas with responsive controls for mouse, touch and keyboard users.

## Features

- Deterministic procedural generation that produces the same mine layout for a given seed.
- Infinite play field with instant reveal flood fill for empty areas.
- Adjustable mine density that immediately regenerates the world.
- Smooth pan and zoom controls that work on desktop (mouse/trackpad) and mobile (touch + pinch).
- Flag mode toggle and long-press support for convenient mobile play.

## Building

You will need a recent version of [Emscripten](https://emscripten.org) available in your shell (`em++`). If you have the SDK installed, activate it with `source /path/to/emsdk_env.sh` before building.

```sh
make build
```

The compiled artifacts (JavaScript glue code, WebAssembly binary and static assets) are emitted into the `dist/` directory. During development you can serve the folder locally:

```sh
make serve
```

Then open <http://localhost:8080> in your browser.

## Continuous Integration & Deployment

Every push and pull request is validated by a GitHub Actions workflow that builds the WebAssembly bundle inside the official `emscripten/emsdk` container image. Successful builds upload the contents of `dist/` as an artifact so you can inspect what will be shipped.

When changes land on `main`, an additional workflow reuses the same build pipeline and publishes the generated site to GitHub Pages. To enable deployments on a new clone of this repository:

1. Open **Settings → Pages** in GitHub and choose **GitHub Actions** as the source.
2. Ensure the repository has the `pages` and `id-token` permissions (enabled by default for public repositories).
3. Merge to `main` and the workflow will take care of the rest.

## Controls

- **Reveal** – Left click or tap a cell.
- **Flag** – Right click, enable *Flag Mode*, press <kbd>Ctrl</kbd> while clicking, or long-press on touch.
- **Pan** – Drag anywhere on the board.
- **Zoom** – Mouse wheel, trackpad pinch, or touch pinch gesture.
- **Reset** – Use the *New Seed* button to start a fresh infinite world.

## Project Structure

```
├── src/           # C++ core and Embind bindings
├── web/           # Static front-end assets (HTML, CSS, JS)
├── dist/          # Generated build output (ignored until you run `make build`)
└── Makefile       # Convenience targets for building & serving
```

Have fun exploring the endless field!
