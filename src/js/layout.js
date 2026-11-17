const STORAGE_KEY = "chatgame-layout";
const POSITIONS = ["left", "right", "top", "bottom"];
const MIN_SIZE = 20;
const MAX_SIZE = 80;
const KEYBOARD_STEP = 5;

const app = document.getElementById("app");
const splitter = document.getElementById("splitter");
const positionButtons = document.querySelectorAll("#position-control [data-position]");

const layout = { position: "right", size: 50 };

function isVertical() {
  return layout.position === "top" || layout.position === "bottom";
}

function clampSize(size) {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (POSITIONS.includes(saved?.position)) layout.position = saved.position;
    if (Number.isFinite(saved?.size)) layout.size = clampSize(saved.size);
  } catch {
    // Storage unavailable or corrupt: keep defaults
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage unavailable: layout just won't persist
  }
}

function apply() {
  app.dataset.chatPosition = layout.position;
  app.style.setProperty("--chat-size", `${layout.size}%`);
  splitter.setAttribute("aria-orientation", isVertical() ? "horizontal" : "vertical");
  splitter.setAttribute("aria-valuenow", Math.round(layout.size));
  for (const button of positionButtons) {
    button.setAttribute("aria-pressed", button.dataset.position === layout.position);
  }
}

function setSize(size) {
  layout.size = clampSize(size);
  apply();
}

// Chat size as a percentage of the app, measured from the edge the chat is docked to
function sizeFromPointer(event) {
  const rect = app.getBoundingClientRect();
  switch (layout.position) {
    case "left":
      return ((event.clientX - rect.left) / rect.width) * 100;
    case "right":
      return ((rect.right - event.clientX) / rect.width) * 100;
    case "top":
      return ((event.clientY - rect.top) / rect.height) * 100;
    case "bottom":
      return ((rect.bottom - event.clientY) / rect.height) * 100;
  }
}

function onPointerMove(event) {
  setSize(sizeFromPointer(event));
}

function onPointerUp(event) {
  splitter.releasePointerCapture(event.pointerId);
  splitter.removeEventListener("pointermove", onPointerMove);
  splitter.removeEventListener("pointerup", onPointerUp);
  app.classList.remove("is-resizing");
  save();
}

function onPointerDown(event) {
  event.preventDefault();
  splitter.setPointerCapture(event.pointerId);
  splitter.addEventListener("pointermove", onPointerMove);
  splitter.addEventListener("pointerup", onPointerUp);
  app.classList.add("is-resizing");
}

// Arrow keys move the splitter in the direction of the arrow
function onKeyDown(event) {
  const growKeys = {
    left: "ArrowRight",
    right: "ArrowLeft",
    top: "ArrowDown",
    bottom: "ArrowUp",
  };
  const shrinkKeys = {
    left: "ArrowLeft",
    right: "ArrowRight",
    top: "ArrowUp",
    bottom: "ArrowDown",
  };

  if (event.key === growKeys[layout.position]) {
    setSize(layout.size + KEYBOARD_STEP);
  } else if (event.key === shrinkKeys[layout.position]) {
    setSize(layout.size - KEYBOARD_STEP);
  } else {
    return;
  }
  event.preventDefault();
  save();
}

export function initLayout() {
  load();
  apply();

  splitter.addEventListener("pointerdown", onPointerDown);
  splitter.addEventListener("keydown", onKeyDown);

  for (const button of positionButtons) {
    button.addEventListener("click", () => {
      layout.position = button.dataset.position;
      apply();
      save();
    });
  }
}
