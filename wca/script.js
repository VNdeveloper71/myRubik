const FACES = ["R", "L", "U", "D", "F", "B"], SUF = ["", "’", "2"], INSP = 15, PTS = 3, SETS = 3;
const $ = id => document.getElementById(id);
let ps, bs, pp, bp, pT, bT, phase, t0, target, raf, starter, round, bInsp, pen = 0;

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
  const mean = +$("mean").value || 32, sigma = +$("sigma").value || 4, min = +$("min").value || 15;
  let t = mean + gauss() * sigma;
  if (Math.random() < 0.05) t += 5 + Math.random() * 10;
  return Math.max(min, t);
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
  $("scr").textContent = scramble();
  setP("0.00"); setB("0.00"); tags("Bạn", "Bot");
  msg("Ván " + round + ": " + who() + " giải trước. Nhấn Space để bắt đầu");
}
function resetMatch() {
  ps = bs = pp = bp = 0; pT = []; bT = []; round = 1;
  starter = Math.random() < 0.5 ? "bot" : "player";
  render(); newRound();
}
function begin(p) { phase = p; t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
function startInsp() { tags("Bạn · xem scramble", "Bot"); msg("Nhấn Space khi sẵn sàng giải"); setP(String(INSP)); begin("insp"); }
function startBot() { bInsp = 8 + Math.random() * 7; tags("Bạn", "Bot · xem scramble"); msg(""); setB(String(INSP)); begin("binsp"); }
function afterPlayer() { if (starter === "player") startBot(); else resolve(); }
function dnf() { cancelAnimationFrame(raf); phase = "stopped"; pT.push(Infinity); setP("DNF"); afterPlayer(); }

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
  if (p < target) { pp++; text = "Bạn thắng ván này!"; }
  else { bp++; text = "Bot thắng ván này!"; }
  if (pp === PTS || bp === PTS) {
    const pw = pp === PTS;
    pw ? ps++ : bs++;
    text = (pw ? "Bạn" : "Bot") + " thắng set!";
    pp = bp = 0;
    if (ps === SETS || bs === SETS) { phase = "over"; text = (ps === SETS ? "BẠN VÔ ĐỊCH!" : "BOT THẮNG TRẬN!") + " Space để chơi lại"; }
  }
  render();
  msg(phase === "over" ? text : text + " Space để sang ván tiếp");
}
function act() {
  if (phase === "ready") { starter === "bot" ? startBot() : startInsp(); }
  else if (phase === "wait") startInsp();
  else if (phase === "insp") { pen = (performance.now() - t0) / 1000 >= INSP ? 2 : 0; begin("psolve"); tags("Bạn · đang giải", "Bot"); msg(""); }
  else if (phase === "psolve") {
    const p = (performance.now() - t0) / 1000 + pen;
    cancelAnimationFrame(raf); phase = "stopped";
    setP(f2(p) + (pen ? "+" : "")); pT.push(p);
    afterPlayer();
  }
  else if (phase === "done") { starter = starter === "bot" ? "player" : "bot"; round++; newRound(); }
  else if (phase === "over") resetMatch();
}
document.addEventListener("keydown", e => {
  if (e.code === "Space") {
    if (e.target instanceof HTMLElement && e.target.closest("button, input")) return;
    e.preventDefault();
    if (!e.repeat) act();
  }
});
$("stage").addEventListener("click", act);
$("leaveMatch").addEventListener("click", () => {
  if (window.confirm("Bạn có muốn rời khỏi trận đấu này không?")) {
    window.location.href = "index.html";
  }
});
resetMatch();
