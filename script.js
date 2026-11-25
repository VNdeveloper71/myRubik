const FACES = ["R", "L", "U", "D", "F", "B"], SUF = ["", "’", "2"], INSP = 15;
const MATCH_HISTORY_KEY = "monkey-league-match-history-v1";
const SETTINGS_KEY = "monkey-league-settings-v1";
const DEFAULT_SETTINGS = { mean: 32, sigma: 4, min: 15, pointsToWin: 3, setsToWin: 3 };
const $ = id => document.getElementById(id);
let ps, bs, pp, bp, pT, bT, phase, t0, target, raf, starter, round, bInsp, pen = 0;
let currentLog = [], matchHistory = loadMatchHistory(), roundScramble = "", playerRoundTime = "";
let settings = loadSettings(), activeSettings = { ...settings }, matchStarted = false;

function isValidSettings(value) {
  return value &&
    Number.isFinite(value.mean) && value.mean >= 5 &&
    Number.isFinite(value.sigma) && value.sigma >= 0.5 &&
    Number.isFinite(value.min) && value.min >= 5 &&
    Number.isInteger(value.pointsToWin) && value.pointsToWin >= 1 &&
    Number.isInteger(value.setsToWin) && value.setsToWin >= 1;
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(saved);
    if (!isValidSettings(parsed)) throw new Error("Thiết lập không đúng định dạng.");
    return parsed;
  } catch (error) {
    console.error("Không thể tải thiết lập Monkey League:", error);
    $("settingsError").textContent = "Không thể đọc thiết lập đã lưu; đang dùng giá trị mặc định.";
    $("settingsError").hidden = false;
    return { ...DEFAULT_SETTINGS };
  }
}

function populateSettings() {
  $("mean").value = settings.mean;
  $("sigma").value = settings.sigma;
  $("min").value = settings.min;
  $("pointsToWin").value = settings.pointsToWin;
  $("setsToWin").value = settings.setsToWin;
  updateMatchFormat();
}

function updateMatchFormat() {
  $("matchFormat").textContent =
    "S6 Swiss R3: bo" + (settings.setsToWin * 2 - 1) + " · " + settings.pointsToWin + " điểm/set";
}

function readSettings() {
  return {
    mean: Number($("mean").value),
    sigma: Number($("sigma").value),
    min: Number($("min").value),
    pointsToWin: Number($("pointsToWin").value),
    setsToWin: Number($("setsToWin").value)
  };
}

function saveSettings() {
  const updated = readSettings();
  if (!isValidSettings(updated)) {
    $("settingsError").textContent = "Vui lòng nhập giá trị hợp lệ: Bot/Min từ 5 giây, Sigma từ 0,5 và điểm/set từ 1.";
    $("settingsError").hidden = false;
    return;
  }

  settings = updated;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    $("settingsError").hidden = true;
  } catch (error) {
    console.error("Không thể lưu thiết lập Monkey League:", error);
    $("settingsError").textContent = "Không thể lưu thiết lập trên thiết bị này.";
    $("settingsError").hidden = false;
  }

  updateMatchFormat();
  if (!matchStarted && phase === "ready") {
    activeSettings = { ...settings };
    target = botTime();
  }
}

function setSettingsLocked(locked) {
  ["mean", "sigma", "min", "pointsToWin", "setsToWin"].forEach(id => {
    $(id).disabled = locked;
  });
  $("settingsNote").textContent = locked
    ? "Thiết lập đang khóa trong trận; thay đổi được áp dụng từ trận tiếp theo."
    : "Thiết lập mới áp dụng từ trận tiếp theo.";
}

function loadMatchHistory() {
  try {
    const saved = localStorage.getItem(MATCH_HISTORY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(match =>
      match &&
      Number.isInteger(match.setsPlayer) && match.setsPlayer >= 0 &&
      Number.isInteger(match.setsBot) && match.setsBot >= 0 &&
      typeof match.medianPlayer === "string" &&
      typeof match.medianBot === "string" &&
      typeof match.date === "string" && Number.isFinite(Date.parse(match.date))
    )) {
      throw new Error("Dữ liệu lịch sử trận không đúng định dạng.");
    }
    return parsed;
  } catch (error) {
    console.error("Không thể tải lịch sử Monkey League:", error);
    $("historyError").textContent = "Không thể đọc lịch sử trận đã lưu.";
    $("historyError").hidden = false;
    return [];
  }
}

function saveMatchHistory() {
  try {
    localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(matchHistory));
    $("historyError").hidden = true;
  } catch (error) {
    console.error("Không thể lưu lịch sử Monkey League:", error);
    $("historyError").textContent = "Không thể lưu lịch sử trận trên thiết bị này.";
    $("historyError").hidden = false;
  }
  renderMatchHistory();
}

function renderCurrentLog() {
  $("matchLog").textContent = currentLog.join("\n");
  $("logEmpty").hidden = currentLog.length > 0;
  $("downloadLog").disabled = currentLog.length === 0;
}

function renderMatchHistory() {
  const list = $("matchHistoryList");
  list.replaceChildren();
  $("historyEmpty").hidden = matchHistory.length > 0;

  matchHistory.forEach((match, index) => {
    const item = document.createElement("li");
    item.className = "match-history-item";

    const number = document.createElement("span");
    number.className = "match-history-number";
    number.textContent = "Lần " + (index + 1);

    const score = document.createElement("span");
    score.className = "match-history-score";
    score.textContent = match.setsPlayer + " - " + match.setsBot;

    const medians = document.createElement("span");
    medians.className = "match-history-medians";
    medians.textContent = "Median của bạn: " + match.medianPlayer + " | của Bot: " + match.medianBot;

    const date = document.createElement("time");
    date.className = "match-history-date";
    date.dateTime = match.date;
    date.textContent = new Date(match.date).toLocaleDateString("vi-VN");

    item.append(number, score, medians, date);
    list.append(item);
  });
}

function recordCompletedMatch() {
  matchHistory.push({
    setsPlayer: ps,
    setsBot: bs,
    medianPlayer: median(pT),
    medianBot: median(bT),
    date: new Date().toISOString()
  });
  saveMatchHistory();
}

function clearCurrentLog() {
  currentLog = [];
  renderCurrentLog();
}

function downloadCurrentLog() {
  if (!currentLog.length) return;
  const blob = new Blob([currentLog.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "monkey-league-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateOrientationNotice() {
  $("orientationNotice").hidden =
    !window.matchMedia("(orientation: portrait) and (max-width: 900px)").matches;
}

async function requestLandscapeMode() {
  let lockError;
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      lockError = error;
    }
  }

  if (screen.orientation && typeof screen.orientation.lock === "function") {
    try {
      await screen.orientation.lock("landscape");
      $("orientationStatus").textContent = "Đã yêu cầu khóa màn hình ngang.";
      return;
    } catch (error) {
      lockError = error;
    }
  } else {
    lockError = new Error("Screen Orientation API không được trình duyệt hỗ trợ.");
  }

  console.warn("Trình duyệt không thể khóa hướng màn hình:", lockError);
  $("orientationStatus").textContent =
    "Trình duyệt không hỗ trợ tự khóa hướng màn hình. Hãy xoay điện thoại nằm ngang để chơi.";
}

function scramble(n = 20) {
  const m = []; let last = null;
  while (m.length < n) {
    const f = FACES[Math.floor(Math.random() * 6)];
    if (f === last) continue;
    m.push(f + SUF[Math.floor(Math.random() * 3)]); last = f;
  }
  return m.join(" ");
}
function gauss() {
  let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function botTime() {
  let t = activeSettings.mean + gauss() * activeSettings.sigma;
  if (Math.random() < 0.05) t += 5 + Math.random() * 10;
  return Math.max(activeSettings.min, t);
}
function median(a) {
  if (!a.length) return "–"; const s = [...a].sort((x, y) => x - y), k = s.length >> 1;
  return f2(s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2);
}
const f2 = x => isFinite(x) ? x.toFixed(2) : "DNF";
function render() {
  $("setP").textContent = ps; $("setB").textContent = bs;
  $("ptsP").textContent = pp; $("ptsB").textContent = bp;
  $("medP").textContent = median(pT); $("medB").textContent = median(bT);
}
function setP(t) { $("bigP").textContent = $("timeP").textContent = t; }
function setB(t) { $("bigB").textContent = $("timeB").textContent = t; }
function tags(p, b) { $("tagP").textContent = p; $("tagB").textContent = b; }
function msg(t) { $("msg").textContent = t; }
function who() { return starter === "bot" ? "Bot" : "Bạn"; }

function newRound() {
  target = botTime(); phase = "ready";
  roundScramble = scramble();
  $("scr").textContent = roundScramble;
  playerRoundTime = "";
  setP("0.00"); setB("0.00"); tags("Bạn", "Bot");
  msg("Ván " + round + ": " + who() + " giải trước. Nhấn Space để bắt đầu");
}
function resetMatch() {
  ps = bs = pp = bp = 0; pT = []; bT = []; round = 1;
  activeSettings = { ...settings };
  matchStarted = false;
  setSettingsLocked(false);
  clearCurrentLog();
  starter = Math.random() < 0.5 ? "bot" : "player";
  render(); newRound();
}
function begin(p) { phase = p; t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
function startInsp() { tags("Bạn · xem scramble", "Bot"); msg("Nhấn Space khi sẵn sàng giải"); setP(String(INSP)); begin("insp"); }
function startBot() { bInsp = 8 + Math.random() * 7; tags("Bạn", "Bot · xem scramble"); msg(""); setB(String(INSP)); begin("binsp"); }
function afterPlayer() { if (starter === "player") startBot(); else resolve(); }
function dnf() {
  cancelAnimationFrame(raf); phase = "stopped"; pT.push(Infinity);
  playerRoundTime = "DNF";
  setP("DNF"); afterPlayer();
}

function loop() {
  const e = (performance.now() - t0) / 1000;
  if (phase === "insp") {
    if (e >= INSP + 2) { dnf(); return; }
    setP(e >= INSP ? "+2" : String(Math.ceil(INSP - e)));
  } else if (phase === "psolve") {
    setP(f2(e + pen) + (pen ? "+" : ""));
  } else if (phase === "binsp") {
    if (e >= bInsp) { begin("bsolve"); tags("Bạn", "Bot · đang giải"); return; }
    setB(String(Math.ceil(INSP - e)));
  } else if (phase === "bsolve") {
    if (e >= target) {
      setB(f2(target)); bT.push(target);
      if (starter === "bot") {
        phase = "wait"; tags("Bạn", "Bot");
        msg("Tới lượt bạn. Nhấn Space để bắt đầu xem scramble (15 giây)");
      } else resolve();
      return;
    }
    setB(f2(e));
  }
  raf = requestAnimationFrame(loop);
}
function resolve() {
  const p = pT[pT.length - 1];
  let text;
  phase = "done"; tags("Bạn", "Bot");
  const playerWon = p < target;
  if (playerWon) { pp++; text = "Bạn thắng ván này!"; }
  else { bp++; text = "Bot thắng ván này!"; }
  if (pp + bp === 1) currentLog.push("<===== SET " + (ps + bs + 1) + " =====>");
  currentLog.push(
    roundScramble,
    "Bạn: " + playerRoundTime + " | Bot: " + f2(target),
    (playerWon ? "Bạn" : "Bot") + " thắng ván này, tỉ số " + pp + " - " + bp
  );
  if (pp === activeSettings.pointsToWin || bp === activeSettings.pointsToWin) {
    const pw = pp === activeSettings.pointsToWin;
    pw ? ps++ : bs++;
    text = (pw ? "Bạn" : "Bot") + " thắng set!";
    currentLog.push("Tỉ số sets: " + ps + " - " + bs);
    pp = bp = 0;
    if (ps === activeSettings.setsToWin || bs === activeSettings.setsToWin) {
      phase = "over";
      const champion = ps === activeSettings.setsToWin ? "BẠN" : "BOT";
      text = champion + " ĐÃ VÔ ĐỊCH GIẢI MONKEY LEAGUE🏆 Space để chơi lại";
      currentLog.push(champion + " ĐÃ VÔ ĐỊCH GIẢI MONKEY LEAGUE🏆");
      recordCompletedMatch();
      setSettingsLocked(false);
    }
  }
  renderCurrentLog();
  render();
  msg(phase === "over" ? text : text + " Space để sang ván tiếp");
}
function act() {
  if (phase === "ready") {
    matchStarted = true;
    setSettingsLocked(true);
    starter === "bot" ? startBot() : startInsp();
  }
  else if (phase === "wait") startInsp();
  else if (phase === "insp") { pen = (performance.now() - t0) / 1000 >= INSP ? 2 : 0; begin("psolve"); tags("Bạn · đang giải", "Bot"); msg(""); }
  else if (phase === "psolve") {
    const p = (performance.now() - t0) / 1000 + pen;
    cancelAnimationFrame(raf); phase = "stopped";
    playerRoundTime = f2(p) + (pen ? "+" : "");
    setP(playerRoundTime); pT.push(p);
    afterPlayer();
  }
  else if (phase === "done") { starter = starter === "bot" ? "player" : "bot"; round++; newRound(); }
  else if (phase === "over") resetMatch();
}
document.addEventListener("keydown", e => {
  if (e.code === "Space") {
    if (e.target instanceof HTMLElement && e.target.closest("button, input, summary")) return;
    e.preventDefault();
    if (!e.repeat) act();
  }
});
$("stage").addEventListener("click", act);
$("downloadLog").addEventListener("click", downloadCurrentLog);
$("leaveMatch").addEventListener("click", () => {
  if (window.confirm("Bạn có muốn rời khỏi trận đấu này không?")) {
    clearCurrentLog();
    window.location.href = "index.html";
  }
});
$("enableLandscape").addEventListener("click", requestLandscapeMode);
window.addEventListener("resize", updateOrientationNotice);
if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
  screen.orientation.addEventListener("change", updateOrientationNotice);
}
populateSettings();
["mean", "sigma", "min", "pointsToWin", "setsToWin"].forEach(id => {
  $(id).addEventListener("change", saveSettings);
});
renderMatchHistory();
resetMatch();
updateOrientationNotice();
