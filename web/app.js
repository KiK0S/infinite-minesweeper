const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const resetButton = document.getElementById("reset-button");
const flagButton = document.getElementById("flag-mode");
const densitySlider = document.getElementById("density");
const densityValue = document.getElementById("density-value");

const camera = {
  offsetX: 0,
  offsetY: 0,
  scale: 48,
};

const MIN_SCALE = 16;
const MAX_SCALE = 96;

const board = new Map();
let moduleInstance = null;
let game = null;
let alive = true;
let hoverCell = null;
let dpr = window.devicePixelRatio || 1;

const pointerState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  button: 0,
  dragging: false,
  longPress: false,
  timer: null,
};

const activePointers = new Map();
let pinchState = null;
let flagMode = false;

function randomSeed() {
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  const high = buffer[0] & 0x1fffff; // keep within 53-bit precision
  return high * 0x100000000 + buffer[1];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(text, danger = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("danger", danger);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function keyFor(x, y) {
  return `${x},${y}`;
}

function applyUpdates(updates) {
  if (!updates || updates.length === 0) {
    render();
    return;
  }
  let detonated = false;
  for (const update of updates) {
    board.set(keyFor(update.x, update.y), {
      x: update.x,
      y: update.y,
      revealed: update.revealed,
      flagged: update.flagged,
      mine: update.mine,
      adjacent: update.adjacent,
      detonated: update.detonated,
    });
    detonated ||= update.detonated;
  }
  if (detonated) {
    alive = false;
    setStatus("Boom!", true);
  } else if (alive) {
    setStatus("Playing", false);
  }
  render();
}

function revealCell(x, y) {
  if (!game || !alive) return;
  const updates = game.reveal(x, y);
  applyUpdates(updates);
  alive = game.isAlive();
  if (!alive) {
    setStatus("Boom!", true);
  }
}

function toggleFlag(x, y) {
  if (!game) return;
  const updates = game.toggleFlag(x, y);
  applyUpdates(updates);
}

function resetBoard(seed = randomSeed()) {
  board.clear();
  if (!game) {
    game = new moduleInstance.GameSession(seed);
  } else {
    game.reset(seed);
  }
  game.setMineProbability(Number(densitySlider.value) / 100);
  alive = true;
  setStatus("Ready", false);
  camera.offsetX = 0;
  camera.offsetY = 0;
  render();
}

function updateDensity() {
  const value = Number(densitySlider.value);
  densityValue.textContent = `${value}%`;
  if (game) {
    game.setMineProbability(value / 100);
    board.clear();
    alive = true;
    setStatus("Ready", false);
    render();
  }
}

densitySlider.addEventListener("input", updateDensity);

function worldFromScreen(clientX, clientY, scale = camera.scale, offsetX = camera.offsetX, offsetY = camera.offsetY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - rect.width / 2) / scale + offsetX;
  const y = (clientY - rect.top - rect.height / 2) / scale + offsetY;
  return { x, y };
}

function cellFromClient(clientX, clientY) {
  const { x, y } = worldFromScreen(clientX, clientY);
  return { x: Math.floor(x), y: Math.floor(y) };
}

function onPointerDown(event) {
  if (event.pointerType === "mouse" && event.button === 1) {
    return;
  }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size >= 2) {
    const points = Array.from(activePointers.values());
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    pinchState = {
      distance,
      scale: camera.scale,
    };
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  pointerState.active = true;
  pointerState.pointerId = event.pointerId;
  pointerState.startX = event.clientX;
  pointerState.startY = event.clientY;
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  pointerState.button = event.button;
  pointerState.dragging = false;
  pointerState.longPress = false;

  if (event.pointerType === "touch" || event.button === 0) {
    pointerState.timer = window.setTimeout(() => {
      pointerState.longPress = true;
    }, 450);
  }
}

function onPointerMove(event) {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pinchState && activePointers.size >= 2) {
    const points = Array.from(activePointers.values());
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    const before = worldFromScreen(centerX, centerY);
    const newScale = clamp((pinchState.scale * distance) / pinchState.distance, MIN_SCALE, MAX_SCALE);
    camera.scale = newScale;
    const after = worldFromScreen(centerX, centerY);
    camera.offsetX += before.x - after.x;
    camera.offsetY += before.y - after.y;
    render();
    return;
  }

  if (!pointerState.active || pointerState.pointerId !== event.pointerId) {
    hoverCell = cellFromClient(event.clientX, event.clientY);
    render();
    return;
  }

  const dx = event.clientX - pointerState.lastX;
  const dy = event.clientY - pointerState.lastY;

  if (!pointerState.dragging) {
    const distance = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY);
    if (distance > 5) {
      pointerState.dragging = true;
      if (pointerState.timer) {
        window.clearTimeout(pointerState.timer);
        pointerState.timer = null;
      }
    }
  }

  if (pointerState.dragging) {
    camera.offsetX -= dx / camera.scale;
    camera.offsetY -= dy / camera.scale;
    render();
  } else {
    hoverCell = cellFromClient(event.clientX, event.clientY);
    render();
  }

  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
}

function onPointerUp(event) {
  activePointers.delete(event.pointerId);
  if (pointerState.timer) {
    window.clearTimeout(pointerState.timer);
    pointerState.timer = null;
  }

  if (pinchState && activePointers.size < 2) {
    pinchState = null;
  }

  if (!pointerState.active || pointerState.pointerId !== event.pointerId) {
    render();
    return;
  }

  canvas.releasePointerCapture(event.pointerId);

  if (!pointerState.dragging) {
    const cell = cellFromClient(event.clientX, event.clientY);
    const shouldFlag =
      pointerState.button === 2 || flagMode || pointerState.longPress || event.ctrlKey;
    if (shouldFlag) {
      toggleFlag(cell.x, cell.y);
    } else {
      revealCell(cell.x, cell.y);
    }
  }

  pointerState.active = false;
  pointerState.pointerId = null;
  pointerState.dragging = false;
  pointerState.longPress = false;
  hoverCell = null;
  render();
}

function onPointerCancel(event) {
  activePointers.delete(event.pointerId);
  if (pointerState.active && pointerState.pointerId === event.pointerId) {
    pointerState.active = false;
    pointerState.pointerId = null;
  }
  if (pointerState.timer) {
    window.clearTimeout(pointerState.timer);
    pointerState.timer = null;
  }
  pinchState = null;
  hoverCell = null;
  render();
}

function onWheel(event) {
  event.preventDefault();
  const before = worldFromScreen(event.clientX, event.clientY);
  const zoomFactor = Math.pow(2, -event.deltaY / 600);
  const newScale = clamp(camera.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
  camera.scale = newScale;
  const after = worldFromScreen(event.clientX, event.clientY);
  camera.offsetX += before.x - after.x;
  camera.offsetY += before.y - after.y;
  render();
}

function drawCellBackground(x, y, cell, size) {
  if (cell && cell.revealed) {
    if (cell.mine) {
      ctx.fillStyle = cell.detonated ? "#ff4757" : "#b33939";
    } else if (cell.adjacent === 0) {
      ctx.fillStyle = "#1f2d3d";
    } else {
      ctx.fillStyle = "#223a5f";
    }
  } else {
    ctx.fillStyle = "#0d1725";
  }
  ctx.fillRect(x, y, size, size);
}

const numberColors = [
  "#000000",
  "#8de0ff",
  "#6febae",
  "#f7b267",
  "#f76c6c",
  "#c77dff",
  "#56cfe1",
  "#ff9f1c",
  "#f8f9fa",
];

function drawCellContent(x, y, cell, size) {
  if (!cell) {
    return;
  }
  if (cell.revealed) {
    if (cell.mine) {
      ctx.fillStyle = "#ffeb3b";
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (cell.adjacent > 0) {
      ctx.fillStyle = numberColors[Math.min(cell.adjacent, numberColors.length - 1)];
      ctx.font = `${Math.floor(size * 0.55)}px "JetBrains Mono", "Fira Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(cell.adjacent), x + size / 2, y + size / 2 + 1);
    }
  } else if (cell.flagged) {
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    ctx.moveTo(x + size * 0.3, y + size * 0.2);
    ctx.lineTo(x + size * 0.7, y + size * 0.4);
    ctx.lineTo(x + size * 0.3, y + size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + size * 0.3, y + size * 0.2, size * 0.08, size * 0.6);
  }
}

function render() {
  if (!canvas.clientWidth || !canvas.clientHeight) {
    return;
  }
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const cols = Math.ceil(width / camera.scale) + 4;
  const rows = Math.ceil(height / camera.scale) + 4;
  const startX = Math.floor(camera.offsetX - cols / 2);
  const startY = Math.floor(camera.offsetY - rows / 2);

  ctx.fillStyle = "#08101d";
  ctx.fillRect(0, 0, width, height);

  for (let gx = 0; gx <= cols; gx += 1) {
    const px = ((startX + gx) - camera.offsetX) * camera.scale + width / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let gy = 0; gy <= rows; gy += 1) {
    const py = ((startY + gy) - camera.offsetY) * camera.scale + height / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }

  for (let x = startX; x < startX + cols; x += 1) {
    for (let y = startY; y < startY + rows; y += 1) {
      const cell = board.get(keyFor(x, y));
      const px = (x - camera.offsetX) * camera.scale + width / 2;
      const py = (y - camera.offsetY) * camera.scale + height / 2;
      drawCellBackground(px + 1, py + 1, cell, camera.scale - 2);
      drawCellContent(px + 1, py + 1, cell, camera.scale - 2);
      if (hoverCell && hoverCell.x === x && hoverCell.y === y && !pointerState.dragging) {
        ctx.strokeStyle = "rgba(255, 214, 102, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, camera.scale - 2, camera.scale - 2);
      }
    }
  }
}

function toggleFlagMode() {
  flagMode = !flagMode;
  flagButton.classList.toggle("active", flagMode);
}

resetButton.addEventListener("click", () => resetBoard(randomSeed()));
flagButton.addEventListener("click", toggleFlagMode);

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
canvas.addEventListener("pointerleave", () => {
  hoverCell = null;
  render();
});
canvas.addEventListener("wheel", onWheel, { passive: false });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("resize", resizeCanvas);
window.addEventListener("blur", () => {
  activePointers.clear();
  pinchState = null;
  if (pointerState.timer) {
    window.clearTimeout(pointerState.timer);
    pointerState.timer = null;
  }
  pointerState.active = false;
  pointerState.pointerId = null;
});

resizeCanvas();

densityValue.textContent = `${densitySlider.value}%`;

createMinesweeperModule().then((mod) => {
  moduleInstance = mod;
  resetBoard(randomSeed());
});
