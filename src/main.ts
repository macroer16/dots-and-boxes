import "./style.css";
import type { Level } from "./ai";
import { completes, edgeEnds, isOver, newGame, play, replay, winner, type Player, type State } from "./game";
import type { AIReply, AskAI } from "./worker";

// ------------------------------------------------------------------ setup

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = $("board") as unknown as SVGSVGElement;
const SVG = "http://www.w3.org/2000/svg";
const GAP = 100; // distance between dots in SVG units
const PAD = 30;

type Opp = Level | "friend";
let rows = 4;
let cols = 4;
let opponent: Opp = "hard";
let first: Player = 0;
let s: State = newGame(rows, cols, first);
let by: Player[] = []; // who drew each move (for colouring lines and for undo)
let cursor = -1; // keyboard-selected edge
let hintEdge = -1;
let lastAnimated = -1;
let thinking = false;
let askId = 0;
let over = false;

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const pending = new Map<number, (r: AIReply) => void>();
worker.onmessage = (e: MessageEvent<AIReply>) => {
  pending.get(e.data.id)?.(e.data);
  pending.delete(e.data.id);
};

function ask(level: Level): Promise<AIReply> {
  const id = ++askId;
  const msg: AskAI = { id, rows, cols, first, moves: s.moves.slice(), level, seed: (Math.random() * 2 ** 31) | 0 };
  return new Promise((res) => {
    pending.set(id, res);
    worker.postMessage(msg);
  });
}

const vsAI = () => opponent !== "friend";
const names = (): [string, string] => (vsAI() ? ["You", `AI (${opponent[0].toUpperCase()}${opponent.slice(1)})`] : ["Player 1", "Player 2"]);
const humanTurn = () => !vsAI() || s.turn === 0;

// ------------------------------------------------------------------ drawing

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

const xy = (r: number, c: number) => [PAD + c * GAP, PAD + r * GAP];

let edgeEls: SVGLineElement[] = [];
let hitEls: SVGLineElement[] = [];
let boxEls: SVGRectElement[] = [];
let labelEls: SVGTextElement[] = [];
let previewEdge = -1;

function build() {
  board.replaceChildren();
  board.setAttribute("viewBox", `0 0 ${PAD * 2 + cols * GAP} ${PAD * 2 + rows * GAP}`);
  const gBoxes = el("g", {}, board);
  const gEdges = el("g", {}, board);
  const gHits = el("g", {}, board);
  const gDots = el("g", {}, board);
  boxEls = [];
  labelEls = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const [x, y] = xy(r, c);
      boxEls.push(el("rect", { class: "box", x: x + 8, y: y + 8, width: GAP - 16, height: GAP - 16, rx: 6 }, gBoxes));
      labelEls.push(el("text", { class: "box-label", x: x + GAP / 2, y: y + GAP / 2 + 2 }, gBoxes));
    }
  edgeEls = [];
  hitEls = [];
  for (let e = 0; e < s.g.edgeCount; e++) {
    const [r1, c1, r2, c2] = edgeEnds(s.g, e);
    const [x1, y1] = xy(r1, c1);
    const [x2, y2] = xy(r2, c2);
    const inset = 12;
    const h = r1 === r2;
    const coords = h ? { x1: x1 + inset, y1, x2: x2 - inset, y2 } : { x1, y1: y1 + inset, x2, y2: y2 - inset };
    edgeEls.push(el("line", { class: "edge empty", ...coords }, gEdges));
    const hit = el("line", { class: "hit", ...coords, "data-e": e }, gHits);
    hit.addEventListener("pointerenter", () => {
      previewEdge = e;
      paint();
    });
    hit.addEventListener("pointerleave", () => {
      if (previewEdge === e) previewEdge = -1;
      paint();
    });
    hit.addEventListener("click", () => humanMove(e));
    hitEls.push(hit);
  }
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c <= cols; c++) {
      const [x, y] = xy(r, c);
      el("circle", { class: "dot", cx: x, cy: y, r: 7, filter: "url(#chalk)" }, gDots);
    }
}

function paint() {
  const last = s.moves[s.moves.length - 1];
  const mover = new Map<number, Player>();
  s.moves.forEach((m, i) => mover.set(m, by[i]));
  for (let e = 0; e < s.g.edgeCount; e++) {
    const line = edgeEls[e];
    const cls = ["edge"];
    if (s.drawn[e]) {
      cls.push("drawn", `p${mover.get(e)}`);
      if (e === last) cls.push("last");
      if (e === last && lastAnimated !== s.moves.length) cls.push("new");
    } else if (e === hintEdge) cls.push("hint");
    else if (e === previewEdge && humanTurn() && !thinking && !over) cls.push(`p${s.turn}`, "preview");
    else if (e === cursor && document.activeElement === board) cls.push("cursor");
    else cls.push("empty");
    line.setAttribute("class", cls.join(" "));
    hitEls[e].setAttribute("class", s.drawn[e] || !humanTurn() || thinking || over ? "hit off" : "hit");
  }
  lastAnimated = s.moves.length;
  s.owner.forEach((o, b) => {
    boxEls[b].setAttribute("class", o >= 0 ? "box won" : "box");
    if (o >= 0) boxEls[b].setAttribute("fill", `url(#hatch-${o})`);
    labelEls[b].setAttribute("class", o >= 0 ? `box-label won p${o}` : "box-label");
    labelEls[b].textContent = o >= 0 ? names()[o][0] : "";
  });
  const [n0, n1] = names();
  $("name0").textContent = n0;
  $("name1").textContent = n1;
  $("score0").textContent = String(s.score[0]);
  $("score1").textContent = String(s.score[1]);
  $("score0").parentElement!.classList.toggle("turn", !over && s.turn === 0);
  $("score1").parentElement!.classList.toggle("turn", !over && s.turn === 1);
  ($("undo") as HTMLButtonElement).disabled = thinking || !s.moves.length || (vsAI() && !by.includes(0));
  ($("hint") as HTMLButtonElement).disabled = thinking || over || !humanTurn();
  status();
}

function status(extra = "") {
  const box = $("status");
  const [n0, n1] = names();
  box.replaceChildren();
  const span = (text: string, cls = "") => {
    const sp = document.createElement("span");
    sp.textContent = text;
    if (cls) sp.className = cls;
    box.append(sp);
  };
  if (over) {
    const w = winner(s);
    if (w === "draw") span(`A draw, ${s.score[0]}–${s.score[1]}.`);
    else span(`${w === 0 ? n0 : n1} ${w === 0 && vsAI() ? "win" : "wins"} ${Math.max(...s.score)}–${Math.min(...s.score)}!`, `p${w}`);
    return;
  }
  if (thinking) return span(`${n1} is thinking…`, "p1");
  if (extra) span(extra + " ", `p${s.turn}`);
  span(vsAI() ? "Your turn." : `${s.turn === 0 ? n0 : n1}'s turn.`, `p${s.turn}`);
}

// ------------------------------------------------------------------ moves

function apply(e: number, who: Player): number {
  const made = play(s, e);
  by.push(who);
  hintEdge = -1;
  previewEdge = -1;
  if (isOver(s)) finish();
  return made;
}

function humanMove(e: number) {
  if (over || thinking || !humanTurn() || s.drawn[e]) return;
  const made = apply(e, s.turn);
  paint();
  if (made && !over) status(`+${made}! Go again.`);
  if (!over && vsAI() && s.turn === 1) aiTurn();
}

async function aiTurn() {
  if (!vsAI() || over) return;
  thinking = true;
  paint();
  const level = opponent as Level;
  while (!over && s.turn === 1) {
    const started = performance.now();
    const { decision, ms } = await ask(level);
    // small pause so you can follow the AI's moves
    await new Promise((r) => setTimeout(r, Math.max(0, 380 - (performance.now() - started))));
    if (!thinking) return; // a new game was started meanwhile
    const took = completes(s, decision.move);
    apply(decision.move, 1);
    $("why").textContent = decision.why;
    $("stats").textContent =
      decision.searched !== undefined
        ? `Looked at ${decision.searched.toLocaleString("en-GB")} position${decision.searched === 1 ? "" : "s"} in ${Math.round(ms)} ms.`
        : took
          ? `Took ${took} box${took > 1 ? "es" : ""}.`
          : "";
    paint();
  }
  thinking = false;
  paint();
}

async function hint() {
  if (thinking || over || !humanTurn()) return;
  ($("hint") as HTMLButtonElement).disabled = true;
  const { decision } = await ask("hard");
  hintEdge = decision.move;
  $("why").textContent = `Hint: ${decision.why}`;
  paint();
}

function undo() {
  if (thinking || !s.moves.length) return;
  // Against the AI: go back to just before your last line (skipping the AI's replies).
  let n = s.moves.length;
  if (vsAI()) {
    while (n > 0 && by[n - 1] === 1) n--;
    if (n === 0) return;
    n--;
  } else n--;
  by = by.slice(0, n);
  s = replay(rows, cols, first, s.moves.slice(0, n));
  over = false;
  hintEdge = -1;
  lastAnimated = s.moves.length;
  $("why").textContent = "Undone.";
  $("stats").textContent = "";
  paint();
}

function finish() {
  over = true;
  if (!vsAI()) return;
  const rec = record();
  const key = opponent as string;
  const w = winner(s);
  rec[key] ??= { w: 0, l: 0, d: 0 };
  if (w === 0) rec[key].w++;
  else if (w === 1) rec[key].l++;
  else rec[key].d++;
  try {
    localStorage.setItem("dab-record", JSON.stringify(rec));
  } catch {}
  showRecord();
}

type Rec = Record<string, { w: number; l: number; d: number }>;
function record(): Rec {
  try {
    return JSON.parse(localStorage.getItem("dab-record") ?? "{}");
  } catch {
    return {};
  }
}
function showRecord() {
  const r = record();
  const parts = (["easy", "medium", "hard"] as const).filter((k) => r[k]).map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${r[k].w} won, ${r[k].l} lost${r[k].d ? `, ${r[k].d} drawn` : ""}`);
  $("record").textContent = parts.length ? parts.join(" · ") : "No games finished yet. Can you beat Hard?";
}

function newRound() {
  rows = cols = Number(($("size") as HTMLSelectElement).value);
  opponent = ($("opponent") as HTMLSelectElement).value as Opp;
  first = Number(($("first") as HTMLSelectElement).value) as Player;
  s = newGame(rows, cols, first);
  by = [];
  over = false;
  thinking = false;
  hintEdge = -1;
  cursor = -1;
  lastAnimated = 0;
  $("why").textContent = vsAI() ? "Waiting for the first move." : "Two players, one screen. No AI.";
  $("stats").textContent = "";
  ($("first").querySelector('option[value="1"]') as HTMLOptionElement).textContent = vsAI() ? "The AI" : "Player 2";
  ($("first").querySelector('option[value="0"]') as HTMLOptionElement).textContent = vsAI() ? "You" : "Player 1";
  build();
  paint();
  if (vsAI() && s.turn === 1) aiTurn();
}

// ------------------------------------------------------------------ keyboard

function centre(e: number): [number, number] {
  const [r1, c1, r2, c2] = edgeEnds(s.g, e);
  return [(c1 + c2) / 2, (r1 + r2) / 2];
}

function moveCursor(dx: number, dy: number) {
  if (cursor < 0) {
    cursor = 0;
    return;
  }
  const [x, y] = centre(cursor);
  let best = -1;
  let bestD = Infinity;
  for (let e = 0; e < s.g.edgeCount; e++) {
    if (e === cursor) continue;
    const [ex, ey] = centre(e);
    const along = (ex - x) * dx + (ey - y) * dy;
    if (along <= 0.01) continue;
    const across = Math.abs((ex - x) * dy) + Math.abs((ey - y) * dx);
    const d = along + across * 2;
    if (d < bestD) [best, bestD] = [e, d];
  }
  if (best >= 0) cursor = best;
}

board.addEventListener("keydown", (ev) => {
  const k = ev.key;
  const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (dirs[k]) {
    ev.preventDefault();
    moveCursor(...dirs[k]);
    paint();
  } else if ((k === "Enter" || k === " ") && cursor >= 0) {
    ev.preventDefault();
    humanMove(cursor);
  }
});
board.addEventListener("focus", () => {
  if (cursor < 0) cursor = 0;
  paint();
});
board.addEventListener("blur", paint);
document.addEventListener("keydown", (ev) => {
  if ((ev.target as HTMLElement).tagName === "SELECT") return;
  if (ev.key === "h" || ev.key === "H") hint();
  if (ev.key === "u" || ev.key === "U") undo();
});

$("new").addEventListener("click", newRound);
$("hint").addEventListener("click", hint);
$("undo").addEventListener("click", undo);
for (const id of ["size", "opponent", "first"]) $(id).addEventListener("change", newRound);

showRecord();
newRound();
