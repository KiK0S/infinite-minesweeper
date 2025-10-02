# Infinite Minesweeper (PixiJS Edition)

A browser-native reimagining of Minesweeper where the world stretches forever. The grid is rendered with [PixiJS](https://pixijs.com/) and every cell is generated on-demand from a deterministic hash so you can pan or zoom to any coordinate without ever running out of terrain.

## Features

- Infinite play field created by a seeded hash function – the same seed always produces the same mines.
- Smooth mouse-driven panning and scroll-wheel zooming with cell snapping that keeps the current focus point in view.
- Familiar Minesweeper interactions: left click to reveal, right click to flag, and automatic flood fill for empty cells.
- Adjustable mine density slider and seed selector so you can explore different worlds instantly.

## Development

The project is a simple static site located inside the `web/` directory. To build a distributable copy run:

```sh
make build
```

This copies the web assets into the `dist/` folder. During development you can serve the game locally with:

```sh
make serve
```

Then open <http://localhost:8080> in your browser.

Have fun exploring the endless field!
