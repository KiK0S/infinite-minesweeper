import * as PIXI from "https://cdn.jsdelivr.net/npm/pixi.js@7.3.3/dist/pixi.mjs";

const DEVICE_RESOLUTION = Math.min(window.devicePixelRatio || 1, 3);
const TEXT_RESOLUTION = Math.max(DEVICE_RESOLUTION, 2);
PIXI.Text.defaultResolution = TEXT_RESOLUTION;

const CELL_SIZE = 24;
const CHUNK_SIZE = 8;
const BLOCK_SIZE = 20;
const MIN_SCALE = 0.35;
const MAX_SCALE = 3.2;
const GROUPING_THRESHOLD = 0.65;
const BACKGROUND_COLOR = 0xe2e8f0;
const REVEALED_COLOR = 0xf8fafc;
const EXPLODED_COLOR = 0xfca5a5;

const NUMBER_COLORS = {
  1: "#1d4ed8",
  2: "#15803d",
  3: "#dc2626",
  4: "#7c3aed",
  5: "#b45309",
  6: "#0f766e",
  7: "#be123c",
  8: "#334155",
};

const styles = {
  flag: new PIXI.TextStyle({
    fill: "#dc2626",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
    resolution: TEXT_RESOLUTION,
  }),
  mine: new PIXI.TextStyle({
    fill: "#b91c1c",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
    resolution: TEXT_RESOLUTION,
  }),
  empty: new PIXI.TextStyle({
    fill: "#475569",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
    resolution: TEXT_RESOLUTION,
  }),
  lock: new PIXI.TextStyle({
    fill: "#b45309",
    fontSize: 18,
    fontWeight: "600",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
    resolution: TEXT_RESOLUTION,
  }),
};

const numberStyles = new Map();
function styleForNumber(value) {
  if (!numberStyles.has(value)) {
    numberStyles.set(
      value,
      new PIXI.TextStyle({
        fill: NUMBER_COLORS[value] ?? "#1f2937",
        fontSize: 18,
        fontWeight: "700",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        resolution: TEXT_RESOLUTION,
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
  autoDensity: true,
  resolution: DEVICE_RESOLUTION,
});

document.body.appendChild(app.view);

const board = new PIXI.Container();
board.scale.set(1);
board.sortableChildren = true;
app.stage.addChild(board);

const chunkLayer = new PIXI.Container();
chunkLayer.zIndex = 0;
chunkLayer.eventMode = "none";
chunkLayer.visible = false;
board.addChild(chunkLayer);

const cellLayer = new PIXI.Container();
cellLayer.zIndex = 1;
cellLayer.eventMode = "none";
board.addChild(cellLayer);

const interactionLayer = new PIXI.Graphics();
interactionLayer.beginFill(0x000000, 0.001);
interactionLayer.drawRect(-200000, -200000, 400000, 400000);
interactionLayer.endFill();
interactionLayer.zIndex = 2;
interactionLayer.eventMode = "static";
interactionLayer.cursor = "pointer";
board.addChild(interactionLayer);

const hud = {
  shell: document.getElementById("hud-shell"),
  panel: document.getElementById("hud"),
  toggleButton: document.getElementById("hud-toggle"),
  seedInput: document.getElementById("seed"),
  randomSeedButton: document.getElementById("random-seed"),
  resetButton: document.getElementById("reset"),
  densityInput: document.getElementById("density"),
  densityValue: document.getElementById("density-value"),
  status: document.getElementById("status"),
};

const overlays = {
  targetIndicator: document.getElementById("target-indicator"),
  actionWarning: document.getElementById("action-warning"),
};

const STORAGE_KEY = "infinite-minesweeper-save-v2";
const SAVE_DEBOUNCE = 250;
const START_REGION_SIZE = 30;
const LONG_PRESS_DURATION = 450;

const forcedSafeCells = new Set();
let warningTimeoutId = null;
let pendingSaveId = null;
let lastSavedSnapshot = "";

const state = {
  seed: randomSeedString(),
  seedValue: 1,
  mineDensity: parseFloat(hud.densityInput.value),
  scale: 1,
  pointer: {
    pointerId: null,
    secondaryId: null,
    button: 0,
    pointerType: "mouse",
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    secondLastX: 0,
    secondLastY: 0,
    startCellX: 0,
    startCellY: 0,
    dragging: false,
    longPressTimeout: null,
    longPressTriggered: false,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    pinchCenterX: 0,
    pinchCenterY: 0,
    pinchActive: false,
  },
  needsRender: true,
  revealedSafe: 0,
  exploded: false,
  startRegionGenerated: false,
  startRegionOrigin: null,
  restoring: false,
  hudCollapsed: false,
};

const mineCache = new Map();
const cellStates = new Map();
const cellGraphics = new Map();
const chunkGraphics = new Map();
const blockStates = new Map();

const CHUNK_WORLD_SIZE = CHUNK_SIZE * CELL_SIZE;

const chunkStyles = {
  untouched: { fill: 0xffffff, alpha: 0.35, border: 0x94a3b8, borderAlpha: 0.45 },
  interesting: { fill: 0xbae6fd, alpha: 0.4, border: 0x38bdf8, borderAlpha: 0.6 },
  danger: { fill: EXPLODED_COLOR, alpha: 0.45, border: 0xf87171, borderAlpha: 0.7 },
};

function setHudCollapsed(collapsed) {
  state.hudCollapsed = collapsed;
  if (hud.shell) {
    hud.shell.classList.toggle("is-collapsed", collapsed);
  }
  if (hud.panel) {
    hud.panel.setAttribute("aria-hidden", collapsed.toString());
  }
  if (hud.toggleButton) {
    const label = collapsed ? "Show controls" : "Hide controls";
    hud.toggleButton.setAttribute("aria-expanded", (!collapsed).toString());
    hud.toggleButton.setAttribute("aria-label", label);
    const hiddenLabel = hud.toggleButton.querySelector(".visually-hidden");
    if (hiddenLabel) {
      hiddenLabel.textContent = label;
    }
  }
}

setHudCollapsed(state.hudCollapsed);

function cellKey(x, y) {
  return `${x},${y}`;
}

function parseCellKey(key) {
  const [sx, sy] = key.split(",");
  return { x: Number(sx), y: Number(sy) };
}

function chunkKey(x, y) {
  return `${x},${y}`;
}

function blockKey(x, y) {
  return `${x},${y}`;
}

function parseBlockKey(key) {
  const [sx, sy] = key.split(",");
  return { bx: Number(sx), by: Number(sy) };
}

function pointToBlock(x, y) {
  return {
    bx: Math.floor(x / BLOCK_SIZE),
    by: Math.floor(y / BLOCK_SIZE),
  };
}

function forEachCellInBlock(bx, by, callback) {
  const startX = bx * BLOCK_SIZE;
  const startY = by * BLOCK_SIZE;
  for (let x = startX; x < startX + BLOCK_SIZE; x += 1) {
    for (let y = startY; y < startY + BLOCK_SIZE; y += 1) {
      callback(x, y);
    }
  }
}

function peekBlockState(bx, by) {
  return blockStates.get(blockKey(bx, by)) ?? null;
}

function getBlockState(bx, by) {
  const key = blockKey(bx, by);
  let block = blockStates.get(key);
  if (!block) {
    const minePositions = new Set();
    forEachCellInBlock(bx, by, (x, y) => {
      if (mineAt(x, y)) {
        minePositions.add(cellKey(x, y));
      }
    });
    const safeCells = BLOCK_SIZE * BLOCK_SIZE - minePositions.size;
    block = {
      bx,
      by,
      key,
      mineCount: minePositions.size,
      minePositions,
      safeCells,
      revealedSafe: 0,
      locked: false,
      completed: safeCells === 0,
    };
    blockStates.set(key, block);
  }
  return block;
}

function refreshBlockGraphics(bx, by) {
  const startX = bx * BLOCK_SIZE;
  const startY = by * BLOCK_SIZE;
  for (let x = startX; x < startX + BLOCK_SIZE; x += 1) {
    for (let y = startY; y < startY + BLOCK_SIZE; y += 1) {
      const key = cellKey(x, y);
      if (cellGraphics.has(key)) {
        syncCellGraphic(x, y);
      }
    }
  }
}

function blockSafeCellsLeft(block) {
  return Math.max(block.safeCells - block.revealedSafe, 0);
}

function registerRevealedCell(x, y) {
  const cell = getCellState(x, y);
  if (cell.mine || cell.blockCounted) {
    return;
  }
  const { bx, by } = pointToBlock(x, y);
  const block = getBlockState(bx, by);
  cell.blockCounted = true;
  block.revealedSafe += 1;
  if (!block.completed && block.revealedSafe >= block.safeCells) {
    handleBlockCompletion(block);
  }
}

function handleBlockCompletion(block) {
  if (block.completed) {
    return;
  }
  block.completed = true;
  block.locked = false;
  refreshBlockGraphics(block.bx, block.by);
  state.needsRender = true;
  scheduleSave();

  const visited = new Set();
  unlockRegionIfPossible(block.bx, block.by, visited);
  for (const [dx, dy] of neighborOffsets) {
    unlockRegionIfPossible(block.bx + dx, block.by + dy, visited);
  }
}

function lockBlock(bx, by) {
  const block = getBlockState(bx, by);
  if (block.completed || block.locked) {
    return block;
  }
  block.locked = true;
  refreshBlockGraphics(bx, by);
  state.needsRender = true;
  scheduleSave();
  return block;
}

function unlockRegionIfPossible(startBx, startBy, visited) {
  const startKey = blockKey(startBx, startBy);
  if (visited.has(startKey)) {
    return false;
  }
  const startBlock = peekBlockState(startBx, startBy);
  if (!startBlock || !startBlock.locked || startBlock.completed) {
    return false;
  }

  const region = [];
  const regionSet = new Set();
  const stack = [[startBx, startBy]];

  while (stack.length > 0) {
    const [bx, by] = stack.pop();
    const key = blockKey(bx, by);
    if (regionSet.has(key)) {
      continue;
    }
    const block = peekBlockState(bx, by);
    if (!block || !block.locked || block.completed) {
      continue;
    }
    region.push(block);
    regionSet.add(key);
    visited.add(key);
    for (const [dx, dy] of neighborOffsets) {
      stack.push([bx + dx, by + dy]);
    }
  }

  if (region.length === 0) {
    return false;
  }

  let allNeighborsComplete = true;
  for (const block of region) {
    for (const [dx, dy] of neighborOffsets) {
      const nbx = block.bx + dx;
      const nby = block.by + dy;
      const neighborKey = blockKey(nbx, nby);
      if (regionSet.has(neighborKey)) {
        continue;
      }
      const neighborBlock = peekBlockState(nbx, nby);
      if (!neighborBlock || !neighborBlock.completed) {
        allNeighborsComplete = false;
      }
    }
  }

  if (!allNeighborsComplete) {
    return false;
  }

  for (const block of region) {
    block.locked = false;
    refreshBlockGraphics(block.bx, block.by);
  }
  state.needsRender = true;
  scheduleSave();
  return true;
}

function isCellLocked(x, y) {
  const { bx, by } = pointToBlock(x, y);
  const block = peekBlockState(bx, by);
  return Boolean(block?.locked && !block.completed);
}

function autoCompleteBlock(block) {
  let changed = false;
  forEachCellInBlock(block.bx, block.by, (x, y) => {
    const cell = getCellState(x, y);
    if (!cell.mine && !cell.revealed) {
      cell.revealed = true;
      state.revealedSafe += 1;
      registerRevealedCell(x, y);
      syncCellGraphic(x, y);
      changed = true;
    }
  });

  if (changed) {
    updateStatus();
    state.needsRender = true;
    scheduleSave();
  }

  if (!block.completed) {
    handleBlockCompletion(block);
  }
}

function checkBlockAutoComplete(bx, by) {
  const block = getBlockState(bx, by);
  if (block.completed || block.locked) {
    return;
  }

  let flaggedCorrect = true;
  let flaggedCount = 0;

  forEachCellInBlock(bx, by, (x, y) => {
    const key = cellKey(x, y);
    const cell = getCellState(x, y);
    const isMine = block.minePositions.has(key);
    if (cell.flagged) {
      flaggedCount += 1;
      if (!isMine) {
        flaggedCorrect = false;
      }
    } else if (isMine) {
      flaggedCorrect = false;
    }
  });

  if (flaggedCorrect && flaggedCount === block.mineCount) {
    autoCompleteBlock(block);
  }
}

function evaluateAllLockedBlocks() {
  const visited = new Set();
  for (const block of blockStates.values()) {
    if (block.locked && !block.completed) {
      unlockRegionIfPossible(block.bx, block.by, visited);
    }
  }
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
  if (forcedSafeCells.has(key)) {
    mineCache.set(key, false);
    return false;
  }
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
      blockCounted: false,
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

  for (const graphic of chunkGraphics.values()) {
    graphic.destroy();
  }
  chunkGraphics.clear();
  chunkLayer.removeChildren();
}

function hasActiveProgress() {
  if (state.revealedSafe > 0 || state.exploded) {
    return true;
  }
  for (const cell of cellStates.values()) {
    if (cell.flagged) {
      return true;
    }
  }
  return false;
}

function confirmReset() {
  if (!hasActiveProgress()) {
    return true;
  }
  return window.confirm("Reset the current seed? Revealed tiles and flags will be cleared.");
}

function resetGame({ newSeed, newDensity, preserveView = false, skipSaveClear = false } = {}) {
  if (!skipSaveClear) {
    clearSavedGame();
  }
  cancelPendingSave();
  hideWarning();
  hideTargetIndicator();
  forcedSafeCells.clear();
  state.startRegionGenerated = false;
  state.startRegionOrigin = null;
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
  blockStates.clear();
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
    hud.status.style.color = "#b91c1c";
  } else if (state.revealedSafe > 0) {
    hud.status.textContent = `Safe tiles revealed: ${state.revealedSafe}`;
    hud.status.style.color = "#166534";
  } else {
    hud.status.textContent = "";
    hud.status.style.color = "#b91c1c";
  }
}

function showWarning(message, duration = 1600) {
  const warning = overlays.actionWarning;
  if (!warning) {
    return;
  }
  warning.textContent = message;
  warning.classList.add("is-visible");
  if (warningTimeoutId) {
    clearTimeout(warningTimeoutId);
  }
  warningTimeoutId = window.setTimeout(() => {
    warning.classList.remove("is-visible");
    warningTimeoutId = null;
  }, duration);
}

function hideWarning() {
  const warning = overlays.actionWarning;
  if (!warning) {
    return;
  }
  warning.classList.remove("is-visible");
  if (warningTimeoutId) {
    clearTimeout(warningTimeoutId);
    warningTimeoutId = null;
  }
}

function updateTargetIndicator(screenX, screenY) {
  const indicator = overlays.targetIndicator;
  if (!indicator) {
    return;
  }
  const world = screenToWorld(screenX, screenY);
  const cx = Math.floor(world.x / CELL_SIZE);
  const cy = Math.floor(world.y / CELL_SIZE);
  const centerWorldX = (cx + 0.5) * CELL_SIZE;
  const centerWorldY = (cy + 0.5) * CELL_SIZE;
  const centerScreenX = board.position.x + centerWorldX * state.scale;
  const centerScreenY = board.position.y + centerWorldY * state.scale;
  const dx = centerScreenX - screenX;
  const dy = centerScreenY - screenY;
  const threshold = CELL_SIZE * state.scale * 0.4;
  if (Math.hypot(dx, dy) <= threshold) {
    const { bx, by } = pointToBlock(cx, cy);
    const block = getBlockState(bx, by);
    const safeLeft = blockSafeCellsLeft(block);
    const statusLabel = block.locked && !block.completed
      ? "Locked"
      : block.completed
      ? "Completed"
      : `${safeLeft} safe left`;
    indicator.textContent =
      `Targeting (${cx}, ${cy}) • Block (${bx}, ${by}) • Mines: ${block.mineCount} • ${statusLabel}`;
    indicator.classList.add("is-visible");
  } else {
    indicator.classList.remove("is-visible");
  }
}

function hideTargetIndicator() {
  const indicator = overlays.targetIndicator;
  if (!indicator) {
    return;
  }
  indicator.classList.remove("is-visible");
  cancelLongPressTimer();
}

function cancelPendingSave() {
  if (pendingSaveId !== null) {
    clearTimeout(pendingSaveId);
    pendingSaveId = null;
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    lastSavedSnapshot = "";
  } catch (error) {
    console.warn("Failed to clear saved game", error);
  }
}

function loadSavedGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to load saved game", error);
    return null;
  }
}

function scheduleSave() {
  if (state.restoring) {
    return;
  }
  if (pendingSaveId !== null) {
    clearTimeout(pendingSaveId);
  }
  pendingSaveId = window.setTimeout(() => {
    pendingSaveId = null;
    saveGame();
  }, SAVE_DEBOUNCE);
}

function saveGame() {
  if (state.restoring) {
    return;
  }
  try {
    const revealed = [];
    const flagged = [];
    for (const cell of cellStates.values()) {
      if (cell.revealed) {
        revealed.push([cell.x, cell.y]);
      } else if (cell.flagged) {
        flagged.push([cell.x, cell.y]);
      }
    }

    const data = {
      seed: state.seed,
      mineDensity: state.mineDensity,
      scale: state.scale,
      boardPosition: { x: board.position.x, y: board.position.y },
      hudCollapsed: state.hudCollapsed,
      revealed,
      flagged,
      forcedSafe: Array.from(forcedSafeCells),
      startRegionGenerated: state.startRegionGenerated,
      startRegionOrigin: state.startRegionOrigin,
      revealedSafe: state.revealedSafe,
      exploded: state.exploded,
      timestamp: Date.now(),
      lockedBlocks: Array.from(blockStates.values())
        .filter((block) => block.locked && !block.completed)
        .map((block) => [block.bx, block.by]),
    };

    const snapshot = JSON.stringify(data);
    if (snapshot === lastSavedSnapshot) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, snapshot);
    lastSavedSnapshot = snapshot;
  } catch (error) {
    console.warn("Failed to save game", error);
  }
}

function applySavedGame(data) {
  if (!data || typeof data !== "object") {
    return;
  }

  state.restoring = true;
  try {
    forcedSafeCells.clear();
    if (Array.isArray(data.forcedSafe)) {
      for (const key of data.forcedSafe) {
        if (typeof key === "string") {
          forcedSafeCells.add(key);
        }
      }
    }

    mineCache.clear();
    cellStates.clear();
    blockStates.clear();
    clearBoardGraphics();

    if (typeof data.scale === "number" && Number.isFinite(data.scale)) {
      state.scale = clamp(data.scale, MIN_SCALE, MAX_SCALE);
      board.scale.set(state.scale);
    }
    if (
      data.boardPosition &&
      typeof data.boardPosition.x === "number" &&
      typeof data.boardPosition.y === "number"
    ) {
      board.position.set(data.boardPosition.x, data.boardPosition.y);
    }

    setHudCollapsed(Boolean(data.hudCollapsed));

    state.startRegionGenerated = Boolean(data.startRegionGenerated) || forcedSafeCells.size > 0;
    if (
      data.startRegionOrigin &&
      typeof data.startRegionOrigin.x === "number" &&
      typeof data.startRegionOrigin.y === "number"
    ) {
      state.startRegionOrigin = {
        x: Math.trunc(data.startRegionOrigin.x),
        y: Math.trunc(data.startRegionOrigin.y),
      };
    } else {
      state.startRegionOrigin = null;
    }
    state.revealedSafe = 0;
    state.exploded = false;

    const revealedList = Array.isArray(data.revealed) ? data.revealed : [];
    for (const entry of revealedList) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const [x, y] = entry;
      const cell = getCellState(x, y);
      cell.revealed = true;
      if (!cell.mine) {
        state.revealedSafe += 1;
      }
      registerRevealedCell(x, y);
      syncCellGraphic(x, y);
    }

    const flaggedList = Array.isArray(data.flagged) ? data.flagged : [];
    for (const entry of flaggedList) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const [x, y] = entry;
      const cell = getCellState(x, y);
      if (!cell.revealed) {
        cell.flagged = true;
      }
      syncCellGraphic(x, y);
    }

    if (typeof data.revealedSafe === "number" && Number.isFinite(data.revealedSafe)) {
      state.revealedSafe = data.revealedSafe;
    }

    const lockedList = Array.isArray(data.lockedBlocks) ? data.lockedBlocks : [];
    for (const entry of lockedList) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const [bx, by] = entry;
      const block = getBlockState(bx, by);
      if (!block.completed) {
        block.locked = true;
        refreshBlockGraphics(bx, by);
      }
    }

    evaluateAllLockedBlocks();

    updateStatus();
    state.needsRender = true;
    lastSavedSnapshot = JSON.stringify(data);
  } finally {
    state.restoring = false;
  }
  scheduleSave();
}

function createCellGraphic(x, y) {
  const container = new PIXI.Container();
  container.position.set(x * CELL_SIZE, y * CELL_SIZE);

  const background = new PIXI.Graphics();
  container.addChild(background);

  const label = new PIXI.Text("", styles.empty);
  label.anchor.set(0.5);
  label.position.set(CELL_SIZE / 2, CELL_SIZE / 2);
  label.resolution = TEXT_RESOLUTION;
  label.roundPixels = true;
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
  const locked = isCellLocked(x, y);

  background.clear();
  const borderColor = locked ? 0xf97316 : 0x94a3b8;
  background.lineStyle(1, borderColor, revealed ? 0.35 : locked ? 0.8 : 0.55);
  const fillColor = revealed
    ? mine
      ? EXPLODED_COLOR
      : REVEALED_COLOR
    : locked
    ? 0xfef3c7
    : BACKGROUND_COLOR;
  const fillAlpha = revealed ? 1 : locked ? 1 : 0.95;
  background.beginFill(fillColor, fillAlpha);
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
  } else if (locked) {
    label.text = "🔒";
    label.style = styles.lock;
  } else {
    label.text = "";
  }
}

function determineChunkStatus(chunkX, chunkY) {
  const startX = chunkX * CHUNK_SIZE;
  const startY = chunkY * CHUNK_SIZE;
  const endX = startX + CHUNK_SIZE;
  const endY = startY + CHUNK_SIZE;
  let hasInteraction = false;

  for (let x = startX; x < endX; x += 1) {
    for (let y = startY; y < endY; y += 1) {
      const cell = cellStates.get(cellKey(x, y));
      if (!cell) {
        continue;
      }
      if (cell.revealed && cell.mine) {
        return "danger";
      }
      if (cell.revealed || cell.flagged) {
        hasInteraction = true;
      }
    }
  }

  return hasInteraction ? "interesting" : "untouched";
}

function syncChunkGraphic(chunkX, chunkY) {
  const key = chunkKey(chunkX, chunkY);
  let graphic = chunkGraphics.get(key);
  if (!graphic) {
    graphic = new PIXI.Graphics();
    graphic.eventMode = "none";
    chunkGraphics.set(key, graphic);
    chunkLayer.addChild(graphic);
  }

  const style = chunkStyles[determineChunkStatus(chunkX, chunkY)];
  const { fill, alpha, border, borderAlpha } = style;

  graphic.clear();
  graphic.lineStyle(1, border, borderAlpha);
  graphic.beginFill(fill, alpha);
  graphic.drawRect(0, 0, CHUNK_WORLD_SIZE, CHUNK_WORLD_SIZE);
  graphic.endFill();
  graphic.position.set(chunkX * CHUNK_WORLD_SIZE, chunkY * CHUNK_WORLD_SIZE);
}

function updateChunkLayer(minCellX, maxCellX, minCellY, maxCellY) {
  const minChunkX = Math.floor(minCellX / CHUNK_SIZE);
  const maxChunkX = Math.floor(maxCellX / CHUNK_SIZE);
  const minChunkY = Math.floor(minCellY / CHUNK_SIZE);
  const maxChunkY = Math.floor(maxCellY / CHUNK_SIZE);

  const needed = new Set();

  for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
    for (let cy = minChunkY; cy <= maxChunkY; cy += 1) {
      const key = chunkKey(cx, cy);
      needed.add(key);
      syncChunkGraphic(cx, cy);
    }
  }

  for (const [key, graphic] of chunkGraphics.entries()) {
    if (!needed.has(key)) {
      graphic.destroy();
      chunkGraphics.delete(key);
    }
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

  if (state.scale < GROUPING_THRESHOLD) {
    chunkLayer.visible = true;
    cellLayer.visible = false;
    updateChunkLayer(minCellX, maxCellX, minCellY, maxCellY);
    return;
  }

  chunkLayer.visible = false;
  cellLayer.visible = true;

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

function ensureStartingRegion(x, y) {
  if (state.startRegionGenerated) {
    return;
  }

  state.startRegionGenerated = true;
  state.startRegionOrigin = { x, y };

  const region = new Set();
  const queue = [[x, y]];
  const visited = new Set();
  const impactedBlocks = new Set();

  while (region.size < START_REGION_SIZE && queue.length > 0) {
    const idx = Math.floor(Math.random() * queue.length);
    const [cx, cy] = queue.splice(idx, 1)[0];
    const key = cellKey(cx, cy);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    region.add(key);
    for (const [dx, dy] of neighborOffsets) {
      queue.push([cx + dx, cy + dy]);
    }
  }

  if (region.size < START_REGION_SIZE) {
    const regionArray = Array.from(region).map((key) => parseCellKey(key));
    let attempts = 0;
    while (region.size < START_REGION_SIZE && attempts < START_REGION_SIZE * 8) {
      const base = regionArray[Math.floor(Math.random() * regionArray.length)] ?? { x, y };
      const [dx, dy] = neighborOffsets[Math.floor(Math.random() * neighborOffsets.length)];
      const nx = base.x + dx;
      const ny = base.y + dy;
      const key = cellKey(nx, ny);
      if (!region.has(key)) {
        region.add(key);
        regionArray.push({ x: nx, y: ny });
      }
      attempts += 1;
    }
  }

  const impacted = new Set();
  for (const key of region) {
    forcedSafeCells.add(key);
    mineCache.set(key, false);
    impacted.add(key);
    const { x: cx, y: cy } = parseCellKey(key);
    const { bx, by } = pointToBlock(cx, cy);
    impactedBlocks.add(blockKey(bx, by));
    const block = peekBlockState(bx, by);
    if (block && block.minePositions.delete(key)) {
      block.mineCount = Math.max(0, block.mineCount - 1);
      block.safeCells += 1;
      if (block.safeCells > 0 && block.completed) {
        block.completed = false;
      }
    }
    for (const [dx, dy] of neighborOffsets) {
      impacted.add(cellKey(cx + dx, cy + dy));
    }
  }

  for (const key of impacted) {
    cellStates.delete(key);
    if (cellGraphics.has(key)) {
      const { x: gx, y: gy } = parseCellKey(key);
      const cell = getCellState(gx, gy);
      if (cell) {
        syncCellGraphic(gx, gy);
      }
    }
  }

  for (const bKey of impactedBlocks) {
    const { bx, by } = parseBlockKey(bKey);
    refreshBlockGraphics(bx, by);
  }
  state.needsRender = true;
}

function revealCell(x, y) {
  if (state.exploded) {
    return false;
  }
  ensureStartingRegion(x, y);
  const { bx, by } = pointToBlock(x, y);
  const block = getBlockState(bx, by);
  if (block.locked && !block.completed) {
    showWarning("This block is locked. Complete surrounding blocks to unlock it.");
    return false;
  }
  const start = getCellState(x, y);
  if (start.flagged) {
    return false;
  }

  if (start.revealed) {
    if (start.adjacent > 0) {
      return revealNeighborsOfNumber(x, y);
    }
    return false;
  }

  let anyRevealed = false;

  if (start.mine) {
    lockBlock(bx, by);
    showWarning("Block locked! Solve the surrounding blocks to unlock it.");
    return false;
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
    if (cell.revealed || cell.flagged || cell.mine || isCellLocked(cx, cy)) {
      continue;
    }

    cell.revealed = true;
    state.revealedSafe += 1;
    syncCellGraphic(cx, cy);
    registerRevealedCell(cx, cy);
    anyRevealed = true;

    if (cell.adjacent === 0) {
      for (const [dx, dy] of neighborOffsets) {
        const nx = cx + dx;
        const ny = cy + dy;
        const neighbor = getCellState(nx, ny);
        if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine && !isCellLocked(nx, ny)) {
          stack.push([nx, ny]);
        }
      }
    }
  }

  updateStatus();
  if (anyRevealed) {
    state.needsRender = true;
    scheduleSave();
  }
  return anyRevealed;
}

function warnIfOverFlagged(x, y) {
  for (const [dx, dy] of neighborOffsets) {
    const neighbor = cellStates.get(cellKey(x + dx, y + dy));
    if (!neighbor || !neighbor.revealed || neighbor.adjacent === 0) {
      continue;
    }
    let flaggedNeighbors = 0;
    for (const [ndx, ndy] of neighborOffsets) {
      const around = cellStates.get(cellKey(x + dx + ndx, y + dy + ndy));
      if (around?.flagged) {
        flaggedNeighbors += 1;
      }
    }
    if (flaggedNeighbors > neighbor.adjacent) {
      showWarning("Too many flags are marked around this number.");
      return;
    }
  }
}

function toggleFlag(x, y) {
  if (state.exploded) {
    return false;
  }
  const cell = getCellState(x, y);
  if (cell.revealed) {
    return false;
  }
  if (isCellLocked(x, y)) {
    showWarning("This block is locked. Complete surrounding blocks to unlock it.");
    return false;
  }
  const { bx, by } = pointToBlock(x, y);
  cell.flagged = !cell.flagged;
  if (cell.flagged) {
    warnIfOverFlagged(x, y);
  }
  syncCellGraphic(x, y);
  checkBlockAutoComplete(bx, by);
  state.needsRender = true;
  scheduleSave();
  return true;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function revealNeighborsOfNumber(x, y) {
  const center = getCellState(x, y);
  if (!center.revealed || center.adjacent === 0) {
    return false;
  }

  let flaggedNeighbors = 0;
  let hiddenNeighbors = 0;
  for (const [dx, dy] of neighborOffsets) {
    const neighbor = getCellState(x + dx, y + dy);
    if (neighbor.flagged) {
      flaggedNeighbors += 1;
    }
    if (!neighbor.revealed) {
      hiddenNeighbors += 1;
    }
  }

  if (hiddenNeighbors > 0 && flaggedNeighbors < center.adjacent) {
    const remaining = center.adjacent - flaggedNeighbors;
    showWarning(
      remaining === 1
        ? "Place 1 more flag before chording this number."
        : `Place ${remaining} more flags before chording this number.`
    );
    return false;
  }

  if (flaggedNeighbors > center.adjacent) {
    showWarning("Too many flags are marked around this number.");
    return false;
  }

  let changed = false;

  for (const [dx, dy] of neighborOffsets) {
    const nx = x + dx;
    const ny = y + dy;
    const neighbor = getCellState(nx, ny);
    if (neighbor.flagged || neighbor.revealed || isCellLocked(nx, ny)) {
      continue;
    }
    if (revealCell(nx, ny)) {
      changed = true;
    }
    if (state.exploded) {
      break;
    }
  }

  return changed;
}

function resetPinchTracking() {
  state.pointer.pinchActive = false;
  state.pointer.pinchStartDistance = 0;
  state.pointer.pinchCenterX = 0;
  state.pointer.pinchCenterY = 0;
  state.pointer.pinchStartScale = state.scale;
}

function applyPinchGesture() {
  if (!state.pointer.pinchActive || state.pointer.secondaryId === null) {
    return;
  }

  const primaryX = state.pointer.lastX;
  const primaryY = state.pointer.lastY;
  const secondaryX = state.pointer.secondLastX;
  const secondaryY = state.pointer.secondLastY;

  const centerX = (primaryX + secondaryX) / 2;
  const centerY = (primaryY + secondaryY) / 2;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
    return;
  }

  const previousCenterX = state.pointer.pinchCenterX;
  const previousCenterY = state.pointer.pinchCenterY;
  if (Number.isFinite(previousCenterX) && Number.isFinite(previousCenterY)) {
    board.position.x += centerX - previousCenterX;
    board.position.y += centerY - previousCenterY;
  }

  const distance = Math.hypot(secondaryX - primaryX, secondaryY - primaryY);
  if (distance > 0 && state.pointer.pinchStartDistance > 0) {
    const scaleFactor = distance / state.pointer.pinchStartDistance;
    const newScale = clamp(state.pointer.pinchStartScale * scaleFactor, MIN_SCALE, MAX_SCALE);
    const worldCenter = screenToWorld(centerX, centerY);
    state.scale = newScale;
    board.scale.set(newScale);
    board.position.set(centerX - worldCenter.x * newScale, centerY - worldCenter.y * newScale);
  }

  state.pointer.pinchCenterX = centerX;
  state.pointer.pinchCenterY = centerY;
  state.pointer.pinchStartDistance = distance > 0 ? distance : state.pointer.pinchStartDistance;
  state.pointer.pinchStartScale = state.scale;
  state.needsRender = true;
  scheduleSave();
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
  scheduleSave();
}

function cancelLongPressTimer() {
  if (state.pointer.longPressTimeout !== null) {
    clearTimeout(state.pointer.longPressTimeout);
    state.pointer.longPressTimeout = null;
  }
}

function scheduleLongPress(event) {
  cancelLongPressTimer();
  if (state.pointer.pointerType === "mouse") {
    return;
  }
  const { cx, cy } = screenToCell(event.global.x, event.global.y);
  state.pointer.startCellX = cx;
  state.pointer.startCellY = cy;
  state.pointer.longPressTimeout = window.setTimeout(() => {
    state.pointer.longPressTimeout = null;
    state.pointer.longPressTriggered = true;
    toggleFlag(state.pointer.startCellX, state.pointer.startCellY);
  }, LONG_PRESS_DURATION);
}

function onPointerDown(event) {
  const pointerId = event.pointerId;
  if (state.pointer.pointerId === null) {
    state.pointer.pointerId = pointerId;
    state.pointer.button = typeof event.button === "number" ? event.button : 0;
    state.pointer.pointerType = event.pointerType ?? event.data?.pointerType ?? "mouse";
    state.pointer.startX = event.global.x;
    state.pointer.startY = event.global.y;
    state.pointer.lastX = event.global.x;
    state.pointer.lastY = event.global.y;
    state.pointer.secondLastX = event.global.x;
    state.pointer.secondLastY = event.global.y;
    state.pointer.dragging = false;
    state.pointer.longPressTriggered = false;
    state.pointer.secondaryId = null;
    resetPinchTracking();
    state.pointer.pinchCenterX = event.global.x;
    state.pointer.pinchCenterY = event.global.y;
    updateTargetIndicator(event.global.x, event.global.y);
    scheduleLongPress(event);
    return;
  }

  if (state.pointer.secondaryId === null && pointerId !== state.pointer.pointerId) {
    state.pointer.secondaryId = pointerId;
    state.pointer.secondLastX = event.global.x;
    state.pointer.secondLastY = event.global.y;
    state.pointer.startX = state.pointer.lastX;
    state.pointer.startY = state.pointer.lastY;
    state.pointer.pinchStartDistance = Math.hypot(
      state.pointer.secondLastX - state.pointer.lastX,
      state.pointer.secondLastY - state.pointer.lastY
    );
    state.pointer.pinchStartScale = state.scale;
    state.pointer.pinchCenterX = (state.pointer.lastX + state.pointer.secondLastX) / 2;
    state.pointer.pinchCenterY = (state.pointer.lastY + state.pointer.secondLastY) / 2;
    state.pointer.pinchActive = true;
    state.pointer.dragging = false;
    state.pointer.longPressTriggered = false;
    cancelLongPressTimer();
    hideTargetIndicator();
  }
}

function onPointerMove(event) {
  const pointerId = event.pointerId;
  const isPrimary = pointerId === state.pointer.pointerId;
  const isSecondary = pointerId === state.pointer.secondaryId;

  if (!isPrimary && !isSecondary) {
    return;
  }

  const { global } = event;

  if (isSecondary) {
    state.pointer.secondLastX = global.x;
    state.pointer.secondLastY = global.y;
    hideTargetIndicator();
    if (state.pointer.pinchActive) {
      applyPinchGesture();
    }
    return;
  }

  const previousX = state.pointer.lastX;
  const previousY = state.pointer.lastY;
  state.pointer.lastX = global.x;
  state.pointer.lastY = global.y;

  if (state.pointer.secondaryId !== null && state.pointer.pinchActive) {
    hideTargetIndicator();
    applyPinchGesture();
    return;
  }

  if (state.pointer.button !== 0 && state.pointer.button !== 1) {
    return;
  }

  const dx = global.x - previousX;
  const dy = global.y - previousY;

  const distanceSq =
    (global.x - state.pointer.startX) ** 2 +
    (global.y - state.pointer.startY) ** 2;
  if (!state.pointer.dragging && distanceSq > 16) {
    state.pointer.dragging = true;
    cancelLongPressTimer();
    hideTargetIndicator();
  }

  if (state.pointer.dragging) {
    board.position.x += dx;
    board.position.y += dy;
    state.needsRender = true;
    scheduleSave();
    hideTargetIndicator();
  } else {
    updateTargetIndicator(global.x, global.y);
  }
}

function finishPointer(event) {
  const pointerId = event.pointerId;
  const isPrimary = pointerId === state.pointer.pointerId;
  const isSecondary = pointerId === state.pointer.secondaryId;

  if (!isPrimary && !isSecondary) {
    return;
  }

  cancelLongPressTimer();

  if (isSecondary) {
    state.pointer.secondaryId = null;
    resetPinchTracking();
    return;
  }

  const { button } = state.pointer;
  const globalX = event.global.x;
  const globalY = event.global.y;
  const wasDragging = state.pointer.dragging;

  if (state.pointer.secondaryId !== null) {
    state.pointer.pointerId = state.pointer.secondaryId;
    state.pointer.secondaryId = null;
    state.pointer.lastX = state.pointer.secondLastX;
    state.pointer.lastY = state.pointer.secondLastY;
    state.pointer.startX = state.pointer.lastX;
    state.pointer.startY = state.pointer.lastY;
    state.pointer.button = 0;
    state.pointer.pointerType = "touch";
    state.pointer.dragging = true;
    state.pointer.longPressTriggered = false;
    resetPinchTracking();
    hideTargetIndicator();
    return;
  }

  state.pointer.pointerId = null;
  state.pointer.dragging = false;

  if (state.pointer.longPressTriggered) {
    state.pointer.longPressTriggered = false;
    resetPinchTracking();
    return;
  }

  resetPinchTracking();

  if (wasDragging) {
    hideTargetIndicator();
    return;
  }

  updateTargetIndicator(globalX, globalY);

  if (button === 0) {
    const { cx, cy } = screenToCell(globalX, globalY);
    revealCell(cx, cy);
  } else if (button === 2) {
    const { cx, cy } = screenToCell(globalX, globalY);
    toggleFlag(cx, cy);
  }
}

interactionLayer.on("pointerdown", onPointerDown);
interactionLayer.on("pointermove", onPointerMove);
interactionLayer.on("pointerup", finishPointer);
interactionLayer.on("pointerupoutside", finishPointer);
interactionLayer.on("pointercancel", finishPointer);
interactionLayer.on("pointerout", hideTargetIndicator);
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

if (hud.toggleButton) {
  hud.toggleButton.addEventListener("click", () => {
    setHudCollapsed(!state.hudCollapsed);
    scheduleSave();
  });
}

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
  if (event.defaultPrevented) {
    return;
  }
  if (event.key.toLowerCase() !== "r") {
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (event.repeat) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target && target.isContentEditable)
  ) {
    return;
  }

  event.preventDefault();
  if (confirmReset()) {
    resetGame({ preserveView: false });
  }
});

const savedGame = loadSavedGame();
if (savedGame) {
  try {
    const seedToUse =
      typeof savedGame.seed === "string" && savedGame.seed.trim().length > 0
        ? savedGame.seed.trim()
        : state.seed;
    const densityToUse =
      typeof savedGame.mineDensity === "number" && Number.isFinite(savedGame.mineDensity)
        ? savedGame.mineDensity
        : state.mineDensity;

    state.restoring = true;
    resetGame({
      newSeed: seedToUse,
      newDensity: densityToUse,
      preserveView: true,
      skipSaveClear: true,
    });
    state.restoring = false;
    applySavedGame(savedGame);
  } catch (error) {
    state.restoring = false;
    console.warn("Failed to restore saved game. Clearing corrupted snapshot.", error);
    clearSavedGame();
    resetGame({ preserveView: false });
  }
} else {
  resetGame({ preserveView: false });
}
