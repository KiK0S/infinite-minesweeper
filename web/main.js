import * as PIXI from "https://cdn.jsdelivr.net/npm/pixi.js@7.3.3/dist/pixi.mjs";

const CELL_SIZE = 48;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.8;
const BACKGROUND_COLOR = 0x0f172a;
const REVEALED_COLOR = 0x1e293b;
const EXPLODED_COLOR = 0xb91c1c;

const NUMBER_COLORS = {
  1: "#38bdf8",
  2: "#4ade80",
  3: "#f87171",
  4: "#a855f7",
  5: "#f97316",
  6: "#0ea5e9",
  7: "#fbbf24",
  8: "#cbd5f5",
};

const styles = {
  flag: new PIXI.TextStyle({
    fill: "#fb7185",
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  }),
  mine: new PIXI.TextStyle({
    fill: "#facc15",
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  }),
  empty: new PIXI.TextStyle({
    fill: "#f8fafc",
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  }),
};

const numberStyles = new Map();
function styleForNumber(value) {
  if (!numberStyles.has(value)) {
    numberStyles.set(
      value,
      new PIXI.TextStyle({
        fill: NUMBER_COLORS[value] ?? "#e2e8f0",
        fontSize: 24,
        fontWeight: "700",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
      })
    );
  }
  return numberStyles.get(value);
}

const neighborOffsets = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const app = new PIXI.Application({
  backgroundAlpha: 0,
  antialias: true,
  resizeTo: window,
});

document.body.appendChild(app.view);

const board = new PIXI.Container();
board.scale.set(1);
app.stage.addChild(board);

const interactionLayer = new PIXI.Graphics();
interactionLayer.beginFill(0x000000, 0.001);
interactionLayer.drawRect(-200000, -200000, 400000, 400000);
interactionLayer.endFill();
interactionLayer.eventMode = "static";
interactionLayer.cursor = "pointer";
board.addChild(interactionLayer);

const cellLayer = new PIXI.Container();
board.addChild(cellLayer);

const hud = {
  seedInput: document.getElementById("seed"),
  randomSeedButton: document.getElementById("random-seed"),
  resetButton: document.getElementById("reset"),
  densityInput: document.getElementById("density"),
  densityValue: document.getElementById("density-value"),
  status: document.getElementById("status"),
};

const state = {
  seed: randomSeedString(),
  seedValue: 1,
  mineDensity: parseFloat(hud.densityInput.value),
  scale: 1,
  pointer: {
    pointerId: null,
    button: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragging: false,
  },
  needsRender: true,
  revealedSafe: 0,
  exploded: false,
};

const mineCache = new Map();
const cellStates = new Map();
const cellGraphics = new Map();

function cellKey(x, y) {
  return `${x},${y}`;
}

function randomSeedString() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 8; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash >>>= 0;
  return hash === 0 ? 1 : hash;
}

function hashPoint(x, y, seedValue) {
  let h = seedValue >>> 0;
  h ^= Math.imul(x, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mineAt(x, y) {
  const key = cellKey(x, y);
  if (mineCache.has(key)) {
    return mineCache.get(key);
  }
  const chance = hashPoint(x, y, state.seedValue);
  const mine = chance < state.mineDensity;
  mineCache.set(key, mine);
  return mine;
}

function getCellState(x, y) {
  const key = cellKey(x, y);
  if (!cellStates.has(key)) {
    const mine = mineAt(x, y);
    let adjacent = 0;
    if (!mine) {
      for (const [dx, dy] of neighborOffsets) {
        if (mineAt(x + dx, y + dy)) {
          adjacent += 1;
        }
      }
    }
    cellStates.set(key, {
      x,
      y,
      mine,
      adjacent,
      revealed: false,
      flagged: false,
    });
  }
  return cellStates.get(key);
}

function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - board.position.x) / state.scale,
    y: (screenY - board.position.y) / state.scale,
  };
}

function screenToCell(screenX, screenY) {
  const world = screenToWorld(screenX, screenY);
  return {
    cx: Math.floor(world.x / CELL_SIZE),
    cy: Math.floor(world.y / CELL_SIZE),
  };
}

function clearBoardGraphics() {
  for (const { container } of cellGraphics.values()) {
    container.destroy({ children: true });
  }
  cellGraphics.clear();
  cellLayer.removeChildren();
}

function resetGame({ newSeed, newDensity, preserveView = false } = {}) {
  if (typeof newSeed === "string" && newSeed.trim().length > 0) {
    state.seed = newSeed.trim();
  }
  if (typeof newDensity === "number" && Number.isFinite(newDensity)) {
    state.mineDensity = Math.min(Math.max(newDensity, 0.01), 0.6);
  }
  state.seedValue = hashString(state.seed);
  hud.seedInput.value = state.seed;
  hud.densityInput.value = state.mineDensity.toFixed(2);
  hud.densityValue.textContent = `${Math.round(state.mineDensity * 100)}%`;

  if (!preserveView) {
    state.scale = 1;
    board.scale.set(state.scale);
    board.position.set(app.renderer.width / 2, app.renderer.height / 2);
  }

  state.revealedSafe = 0;
  state.exploded = false;
  updateStatus();

  mineCache.clear();
  cellStates.clear();
  clearBoardGraphics();
  state.needsRender = true;
}

function updateStatus(message, color) {
  if (typeof message === "string") {
    hud.status.textContent = message;
    if (color) {
      hud.status.style.color = color;
    }
    return;
  }

  if (state.exploded) {
    hud.status.textContent = "Boom! That was a mine. Reset or try a new seed.";
    hud.status.style.color = "#fca5a5";
  } else if (state.revealedSafe > 0) {
    hud.status.textContent = `Safe tiles revealed: ${state.revealedSafe}`;
    hud.status.style.color = "#bbf7d0";
  } else {
    hud.status.textContent = "";
    hud.status.style.color = "#fca5a5";
  }
}

function createCellGraphic(x, y) {
  const container = new PIXI.Container();
  container.position.set(x * CELL_SIZE, y * CELL_SIZE);

  const background = new PIXI.Graphics();
  container.addChild(background);

  const label = new PIXI.Text("", styles.empty);
  label.anchor.set(0.5);
  label.position.set(CELL_SIZE / 2, CELL_SIZE / 2);
  container.addChild(label);

  cellLayer.addChild(container);
  cellGraphics.set(cellKey(x, y), { container, background, label });
  syncCellGraphic(x, y);
}

function syncCellGraphic(x, y) {
  const key = cellKey(x, y);
  const graphic = cellGraphics.get(key);
  if (!graphic) {
    return;
  }
  const { background, label } = graphic;
  const stateForCell = cellStates.get(key);
  const revealed = stateForCell?.revealed ?? false;
  const flagged = stateForCell?.flagged ?? false;
  const mine = stateForCell?.mine ?? false;
  const adjacent = stateForCell?.adjacent ?? 0;

  background.clear();
  background.lineStyle(1, 0x000000, revealed ? 0.25 : 0.45);
  const fillColor = revealed ? (mine ? EXPLODED_COLOR : REVEALED_COLOR) : BACKGROUND_COLOR;
  background.beginFill(fillColor, revealed ? 0.95 : 0.92);
  background.drawRoundedRect(0, 0, CELL_SIZE, CELL_SIZE, Math.min(10, CELL_SIZE / 4));
  background.endFill();

  if (revealed) {
    if (mine) {
      label.text = "💣";
      label.style = styles.mine;
    } else if (adjacent > 0) {
      label.text = String(adjacent);
      label.style = styleForNumber(adjacent);
    } else {
      label.text = "";
    }
  } else if (flagged) {
    label.text = "⚑";
    label.style = styles.flag;
  } else {
    label.text = "";
  }
}

function refreshVisibleCells() {
  const width = app.renderer.width;
  const height = app.renderer.height;
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(width, height);
  const minCellX = Math.floor(topLeft.x / CELL_SIZE) - 1;
  const maxCellX = Math.floor(bottomRight.x / CELL_SIZE) + 1;
  const minCellY = Math.floor(topLeft.y / CELL_SIZE) - 1;
  const maxCellY = Math.floor(bottomRight.y / CELL_SIZE) + 1;

  const needed = new Set();

  for (let x = minCellX; x <= maxCellX; x += 1) {
    for (let y = minCellY; y <= maxCellY; y += 1) {
      const key = cellKey(x, y);
      needed.add(key);
      if (!cellGraphics.has(key)) {
        createCellGraphic(x, y);
      }
    }
  }

  const toRemove = [];
  for (const key of cellGraphics.keys()) {
    if (!needed.has(key)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    const graphic = cellGraphics.get(key);
    if (graphic) {
      graphic.container.destroy({ children: true });
    }
    cellGraphics.delete(key);
  }
}

function revealCell(x, y) {
  if (state.exploded) {
    return;
  }
  const start = getCellState(x, y);
  if (start.flagged || start.revealed) {
    return;
  }

  if (start.mine) {
    start.revealed = true;
    syncCellGraphic(x, y);
    state.exploded = true;
    updateStatus();
    return;
  }

  const stack = [[x, y]];
  const visited = new Set();

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = cellKey(cx, cy);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    const cell = getCellState(cx, cy);
    if (cell.revealed || cell.flagged || cell.mine) {
      continue;
    }

    cell.revealed = true;
    state.revealedSafe += 1;
    syncCellGraphic(cx, cy);

    if (cell.adjacent === 0) {
      for (const [dx, dy] of neighborOffsets) {
        const nx = cx + dx;
        const ny = cy + dy;
        const neighbor = getCellState(nx, ny);
        if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) {
          stack.push([nx, ny]);
        }
      }
    }
  }

  updateStatus();
}

function toggleFlag(x, y) {
  if (state.exploded) {
    return;
  }
  const cell = getCellState(x, y);
  if (cell.revealed) {
    return;
  }
  cell.flagged = !cell.flagged;
  syncCellGraphic(x, y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function handleWheel(event) {
  event.preventDefault();
  const { offsetX, offsetY, deltaY } = event;
  const scaleFactor = deltaY > 0 ? 0.9 : 1.1;
  const newScale = clamp(state.scale * scaleFactor, MIN_SCALE, MAX_SCALE);
  const worldBefore = screenToWorld(offsetX, offsetY);
  state.scale = newScale;
  board.scale.set(state.scale);
  board.position.set(
    offsetX - worldBefore.x * state.scale,
    offsetY - worldBefore.y * state.scale
  );
  state.needsRender = true;
}

function onPointerDown(event) {
  if (state.pointer.pointerId !== null) {
    return;
  }
  state.pointer.pointerId = event.pointerId;
  state.pointer.button = event.button;
  state.pointer.startX = event.global.x;
  state.pointer.startY = event.global.y;
  state.pointer.lastX = event.global.x;
  state.pointer.lastY = event.global.y;
  state.pointer.dragging = false;
}

function onPointerMove(event) {
  if (state.pointer.pointerId !== event.pointerId) {
    return;
  }
  const { global } = event;
  const dx = global.x - state.pointer.lastX;
  const dy = global.y - state.pointer.lastY;

  if (state.pointer.button !== 0 && state.pointer.button !== 1) {
    state.pointer.lastX = global.x;
    state.pointer.lastY = global.y;
    return;
  }

  const distanceSq =
    (global.x - state.pointer.startX) ** 2 +
    (global.y - state.pointer.startY) ** 2;
  if (!state.pointer.dragging && distanceSq > 16) {
    state.pointer.dragging = true;
  }

  if (state.pointer.dragging) {
    board.position.x += dx;
    board.position.y += dy;
    state.needsRender = true;
  }

  state.pointer.lastX = global.x;
  state.pointer.lastY = global.y;
}

function finishPointer(event) {
  if (state.pointer.pointerId !== event.pointerId) {
    return;
  }

  const { button } = state.pointer;
  const globalX = event.global.x;
  const globalY = event.global.y;
  const wasDragging = state.pointer.dragging;

  state.pointer.pointerId = null;
  state.pointer.dragging = false;

  if (button === 0 && !wasDragging) {
    const { cx, cy } = screenToCell(globalX, globalY);
    revealCell(cx, cy);
  } else if (button === 2 && !wasDragging) {
    const { cx, cy } = screenToCell(globalX, globalY);
    toggleFlag(cx, cy);
  }
}

interactionLayer.on("pointerdown", onPointerDown);
interactionLayer.on("pointermove", onPointerMove);
interactionLayer.on("pointerup", finishPointer);
interactionLayer.on("pointerupoutside", finishPointer);
interactionLayer.on("rightdown", (event) => {
  event.preventDefault();
});

app.view.addEventListener("contextmenu", (event) => event.preventDefault());
app.view.addEventListener("wheel", handleWheel, { passive: false });

app.ticker.add(() => {
  if (state.needsRender) {
    refreshVisibleCells();
    state.needsRender = false;
  }
});

window.addEventListener("resize", () => {
  state.needsRender = true;
});

hud.randomSeedButton.addEventListener("click", () => {
  resetGame({ newSeed: randomSeedString() });
});

hud.resetButton.addEventListener("click", () => {
  resetGame({ preserveView: false });
});

hud.seedInput.addEventListener("change", (event) => {
  const value = event.target.value.trim();
  if (value.length > 0) {
    resetGame({ newSeed: value });
  }
});

hud.seedInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const value = hud.seedInput.value.trim();
    if (value.length > 0) {
      resetGame({ newSeed: value });
    }
  }
});

hud.densityInput.addEventListener("input", (event) => {
  const value = parseFloat(event.target.value);
  hud.densityValue.textContent = `${Math.round(value * 100)}%`;
});

hud.densityInput.addEventListener("change", (event) => {
  const value = parseFloat(event.target.value);
  if (!Number.isNaN(value)) {
    resetGame({ newDensity: value });
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    resetGame({ preserveView: false });
  }
});

resetGame({ preserveView: false });
