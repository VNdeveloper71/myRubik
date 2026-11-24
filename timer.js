const INSPECTION_SECONDS = 15;
const HOLD_SECONDS = 1;
const STORAGE_KEY = "rubik-timer-solves-v1";
const FACES = ["R", "L", "U", "D", "F", "B"];
const SUFFIXES = ["", "’", "2"];
const $ = id => document.getElementById(id);

let storageWarning = "";
let solves = loadSolves();
let phase = "ready";
let currentScramble = makeScramble();
let inspectionStartedAt = 0;
let holdStartedAt = 0;
let solveStartedAt = 0;
let animationFrame = 0;
let pendingPenaltyIndex = -1;

function isValidSolve(solve) {
  return solve &&
    typeof solve.time === "number" &&
    Number.isFinite(solve.time) &&
    solve.time >= 0 &&
    (solve.penalty === null || solve.penalty === "+2" || solve.penalty === "DNF") &&
    typeof solve.scramble === "string" &&
    typeof solve.date === "string";
}

function loadSolves() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isValidSolve)) {
      throw new Error("Dữ liệu lịch sử không đúng định dạng.");
    }
    return parsed;
  } catch (error) {
    console.error("Không thể tải lịch sử timer:", error);
    storageWarning = "Không thể đọc lịch sử timer đã lưu; lịch sử mới sẽ bắt đầu từ trống.";
    return [];
  }
}

function saveSolves() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
    storageWarning = "";
  } catch (error) {
    console.error("Không thể lưu lịch sử timer:", error);
    storageWarning = "Không thể lưu lịch sử trên thiết bị này.";
  }
  render();
}

function makeScramble(length = 20) {
  const moves = [];
  let lastFace = "";
  while (moves.length < length) {
    const face = FACES[Math.floor(Math.random() * FACES.length)];
    if (face === lastFace) continue;
    moves.push(face + SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]);
    lastFace = face;
  }
  return moves.join(" ");
}

function effectiveTime(solve) {
  if (solve.penalty === "DNF") return Infinity;
  return solve.time + (solve.penalty === "+2" ? 2 : 0);
}

function formatTime(seconds) {
  return Number.isFinite(seconds) ? seconds.toFixed(2) : "DNF";
}

function formatSolve(solve) {
  if (solve.penalty === "DNF") return "DNF";
  return formatTime(effectiveTime(solve)) + (solve.penalty === "+2" ? "+" : "");
}

function averageOf(solveSet) {
  if (solveSet.length < 3) return Infinity;
  const times = solveSet.map(effectiveTime).sort((a, b) => a - b);
  const trimmed = times.slice(1, -1);
  if (trimmed.some(time => !Number.isFinite(time))) return Infinity;
  return trimmed.reduce((sum, time) => sum + time, 0) / trimmed.length;
}

function rollingAverage(count) {
  if (solves.length < count) return Infinity;
  return averageOf(solves.slice(-count));
}

function bestAverage(count) {
  let best = Infinity;
  for (let start = 0; start <= solves.length - count; start++) {
    best = Math.min(best, averageOf(solves.slice(start, start + count)));
  }
  return best;
}

function setTimerSurface(state) {
  const surface = $("timerSurface");
  surface.classList.remove("is-inspecting", "is-arming", "is-ready", "is-solving");
  if (state) surface.classList.add("is-" + state);
}

function setTimerText(caption, time, hint) {
  $("timerCaption").textContent = caption;
  $("timerDisplay").textContent = time;
  $("timerHint").textContent = hint;
}

function renderPenalties() {
  const solve = solves[pendingPenaltyIndex];
  const canEdit = phase === "result" && Boolean(solve);
  $("penalties").hidden = !canEdit;
  $("dnfButton").setAttribute("aria-pressed", String(canEdit && solve.penalty === "DNF"));
  $("plusTwoButton").setAttribute("aria-pressed", String(canEdit && solve.penalty === "+2"));
}

function renderHistory() {
  const list = $("solveList");
  list.replaceChildren();
  $("emptyState").hidden = solves.length > 0;

  for (let index = solves.length - 1; index >= 0; index--) {
    const solve = solves[index];
    const item = document.createElement("li");
    item.className = "solve-item";

    const number = document.createElement("span");
    number.className = "solve-number";
    number.textContent = "#" + (index + 1);

    const result = document.createElement("span");
    result.className = "solve-result";
    result.textContent = formatSolve(solve);

    const scramble = document.createElement("span");
    scramble.className = "solve-scramble";
    scramble.textContent = solve.scramble;

    item.append(number, result, scramble);
    list.append(item);
  }
}

function render() {
  $("scramble").textContent = currentScramble;
  $("ao5").textContent = solves.length >= 5 ? formatTime(rollingAverage(5)) : "–";
  $("ao12").textContent = solves.length >= 12 ? formatTime(rollingAverage(12)) : "–";
  $("pbAo5").textContent = solves.length >= 5 ? formatTime(bestAverage(5)) : "–";
  $("pbAo12").textContent = solves.length >= 12 ? formatTime(bestAverage(12)) : "–";
  $("solveCount").textContent = String(solves.length);

  const bestSingle = solves.reduce((best, solve) =>
    !best || effectiveTime(solve) < effectiveTime(best) ? solve : best, null);
  $("pbSingle").textContent = bestSingle ? formatSolve(bestSingle) : "–";
  $("storageStatus").textContent = storageWarning;
  $("storageStatus").hidden = !storageWarning;
  renderPenalties();
  renderHistory();
}

function startInspection() {
  phase = "inspection";
  inspectionStartedAt = performance.now();
  pendingPenaltyIndex = -1;
  $("penalties").hidden = true;
  setTimerSurface("inspecting");
  setTimerText(
    "ĐANG XEM SCRAMBLE",
    String(INSPECTION_SECONDS),
    "Nhấn và giữ Space 1 giây đến khi xanh, rồi thả để bắt đầu"
  );
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(updateTimer);
}

function beginHold() {
  if (phase !== "inspection") return;
  phase = "arming";
  holdStartedAt = performance.now();
  setTimerSurface("arming");
}

function releaseHold() {
  if (phase !== "arming") return;
  const heldFor = (performance.now() - holdStartedAt) / 1000;
  if (heldFor >= HOLD_SECONDS) {
    phase = "solving";
    solveStartedAt = performance.now();
    setTimerSurface("solving");
    setTimerText("ĐANG GIẢI", "0.00", "Nhấn Space để dừng");
  } else {
    phase = "inspection";
    setTimerSurface("inspecting");
  }
}

function stopSolve() {
  const elapsed = (performance.now() - solveStartedAt) / 1000;
  cancelAnimationFrame(animationFrame);
  solves.push({
    time: elapsed,
    penalty: null,
    scramble: currentScramble,
    date: new Date().toISOString()
  });
  pendingPenaltyIndex = solves.length - 1;
  phase = "result";
  currentScramble = makeScramble();
  setTimerSurface("");
  setTimerText("ĐÃ DỪNG", formatTime(elapsed), "Nhấn Space để xem scramble tiếp theo");
  saveSolves();
}

function updateTimer() {
  const now = performance.now();
  if (phase === "inspection" || phase === "arming") {
    const elapsed = (now - inspectionStartedAt) / 1000;
    const remaining = Math.max(0, INSPECTION_SECONDS - elapsed);
    const heldFor = phase === "arming" ? (now - holdStartedAt) / 1000 : 0;
    const isReady = phase === "arming" && heldFor >= HOLD_SECONDS;

    setTimerSurface(isReady ? "ready" : (phase === "arming" ? "arming" : "inspecting"));
    setTimerText(
      isReady ? "SẴN SÀNG — THẢ SPACE" : (phase === "arming" ? "ĐANG GIỮ" : "ĐANG XEM SCRAMBLE"),
      String(Math.ceil(remaining)),
      isReady
        ? "Thả Space để bắt đầu tính giờ"
        : "Nhấn và giữ Space 1 giây đến khi xanh, rồi thả để bắt đầu"
    );
  } else if (phase === "solving") {
    setTimerText("ĐANG GIẢI", formatTime((now - solveStartedAt) / 1000), "Nhấn Space để dừng");
  }

  if (phase === "inspection" || phase === "arming" || phase === "solving") {
    animationFrame = requestAnimationFrame(updateTimer);
  }
}

function togglePenalty(penalty) {
  if (phase !== "result" || pendingPenaltyIndex < 0) return;
  const solve = solves[pendingPenaltyIndex];
  solve.penalty = solve.penalty === penalty ? null : penalty;
  saveSolves();
  $("timerSurface").focus();
}

function handleSpaceDown(event) {
  if (event.code !== "Space") return;
  if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [contenteditable='true']")) return;
  event.preventDefault();
  if (event.repeat) return;

  if (phase === "ready" || phase === "result") {
    startInspection();
  } else if (phase === "inspection") {
    beginHold();
  } else if (phase === "solving") {
    stopSolve();
  }
}

function handleSpaceUp(event) {
  if (event.code !== "Space") return;
  if (phase === "arming") releaseHold();
}

function startPointerAction(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.focus();
  if (phase === "ready" || phase === "result") {
    startInspection();
  } else if (phase === "inspection") {
    beginHold();
  } else if (phase === "solving") {
    stopSolve();
  }
}

function releasePointerAction() {
  releaseHold();
}

document.addEventListener("keydown", handleSpaceDown);
document.addEventListener("keyup", handleSpaceUp);
$("timerSurface").addEventListener("pointerdown", startPointerAction);
$("timerSurface").addEventListener("pointerup", releasePointerAction);
$("timerSurface").addEventListener("pointercancel", releasePointerAction);
$("newScramble").addEventListener("click", () => {
  if (phase !== "ready" && phase !== "result") return;
  currentScramble = makeScramble();
  render();
  $("timerSurface").focus();
});
$("dnfButton").addEventListener("click", () => togglePenalty("DNF"));
$("plusTwoButton").addEventListener("click", () => togglePenalty("+2"));
$("historyToggle").addEventListener("click", () => {
  const isExpanded = $("historyToggle").getAttribute("aria-expanded") === "true";
  $("historyToggle").setAttribute("aria-expanded", String(!isExpanded));
  $("historyContent").hidden = isExpanded;
  $("historyToggle").textContent = isExpanded ? "Hiện lịch sử" : "Ẩn lịch sử";
});

render();
