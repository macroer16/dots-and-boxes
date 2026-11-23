// The three AI levels.
//
//  Easy   – takes any box it can, otherwise plays anywhere (it will hand you boxes).
//  Medium – takes boxes; otherwise plays a "safe" edge (one that doesn't put a 3rd side on a box);
//           when no safe edge is left, it gives away the smallest chain it can.
//  Hard   – Medium's opening, then once the board is small enough it searches the whole
//           rest of the game with negamax + alpha-beta + a transposition table. Search
//           discovers expert tricks on its own: the long chain rule and "double-dealing"
//           (declining the last 2 boxes of a chain to keep control).

import { clone, completes, givesAway, legalMoves, play, type State } from "./game";

export type Level = "easy" | "medium" | "hard";

export type Decision = {
  move: number;
  why: string; // one line shown in the "What the AI is thinking" panel
  searched?: number; // positions examined (hard only)
  expected?: number; // expected final margin for the AI from here (hard, exact search only)
};

export type Rng = () => number;

const pick = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

/** Seedable RNG so games and tests are repeatable. */
export function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function decide(s: State, level: Level, rng: Rng = Math.random): Decision {
  if (level === "easy") return easy(s, rng);
  if (level === "medium") return medium(s, rng);
  return hard(s, rng);
}

function easy(s: State, rng: Rng): Decision {
  const moves = legalMoves(s);
  const takes = moves.filter((e) => completes(s, e) > 0);
  if (takes.length && rng() < 0.8) return { move: pick(takes, rng), why: "Took a box." };
  return { move: pick(moves, rng), why: "Played anywhere." };
}

/** How many boxes the opponent could grab, one after another, if we play e. */
export function sacrificeSize(s: State, e: number): number {
  const t = clone(s);
  play(t, e);
  let n = 0;
  for (;;) {
    const take = legalMoves(t).find((x) => completes(t, x) > 0);
    if (take === undefined) return n;
    n += play(t, take);
  }
}

function medium(s: State, rng: Rng): Decision {
  const moves = legalMoves(s);
  const takes = moves.filter((e) => completes(s, e) > 0);
  if (takes.length) return { move: pick(takes, rng), why: "Took a box." };
  const safe = moves.filter((e) => !givesAway(s, e));
  if (safe.length) return { move: pick(safe, rng), why: `Played a safe line (${safe.length} safe lines left).` };
  let best = moves[0];
  let bestN = Infinity;
  for (const e of moves) {
    const n = sacrificeSize(s, e);
    if (n < bestN) [best, bestN] = [e, n];
  }
  return { move: best, why: `No safe lines left, so it gave away the smallest chain (${bestN} box${bestN === 1 ? "" : "es"}).` };
}

// ---------------------------------------------------------------------------- hard

/** Start the exact search once this few lines are left (larger boards take longer per node). */
export function searchThreshold(boxes: number): number {
  return boxes <= 9 ? 22 : boxes <= 16 ? 28 : 30;
}
const NODE_BUDGET = 1_500_000;

class Budget extends Error {}

/**
 * Negamax with alpha-beta and a transposition table, on one mutable board (make / unmake),
 * so there are no allocations per node. Value = (future boxes for the player to move) −
 * (future boxes for the opponent). Boxes already won don't affect the future, so a position
 * is keyed by its set of drawn edges alone.
 */
export class Searcher {
  nodes = 0;
  private drawn: Uint8Array;
  private sides: Uint8Array;
  private edgeBoxes: number[][];
  private n: number;
  private free: number;
  private lo = 0; // edges 0..29 as a bitmask number
  private hi = 0; // edges 30..59
  private exact = new Map<number, number>(); // key → exact value
  private lower = new Map<number, number>();
  private upper = new Map<number, number>();
  private wide = false;

  constructor(s: State, private budget = NODE_BUDGET) {
    this.drawn = s.drawn.slice();
    this.sides = s.sides.slice();
    this.edgeBoxes = s.g.edgeBoxes;
    this.n = s.g.edgeCount;
    this.free = s.g.edgeCount - s.moves.length;
    this.wide = this.n > 52;
    for (let i = 0; i < this.n; i++) if (this.drawn[i]) this.flip(i);
  }

  /** Keep the key in step with drawn[i] (call after changing it). */
  private flip(i: number) {
    const sign = this.drawn[i] ? 1 : -1;
    if (i < 30) this.lo += sign * 2 ** i;
    else this.hi += sign * 2 ** (i - 30);
  }

  private key(): number {
    // Exact for up to 52 edges (4×4 boards); larger boards fold the high bits (rare collisions are harmless
    // for play strength and never affect smaller boards).
    return this.wide ? this.lo + ((this.hi * 2654435761) % 4194304) * 1073741824 : this.lo + this.hi * 1073741824;
  }

  private make(e: number): number {
    this.drawn[e] = 1;
    this.flip(e);
    this.free--;
    let made = 0;
    for (const b of this.edgeBoxes[e]) if (++this.sides[b] === 4) made++;
    return made;
  }

  private unmake(e: number) {
    for (const b of this.edgeBoxes[e]) this.sides[b]--;
    this.drawn[e] = 0;
    this.flip(e);
    this.free++;
  }

  private order(): number[] {
    const caps: number[] = [];
    const safe: number[] = [];
    const rest: number[] = [];
    for (let e = 0; e < this.n; e++) {
      if (this.drawn[e]) continue;
      let cap = false;
      let gives = false;
      for (const b of this.edgeBoxes[e]) {
        if (this.sides[b] === 3) cap = true;
        else if (this.sides[b] === 2) gives = true;
      }
      if (cap) caps.push(e);
      else if (!gives) safe.push(e);
      else rest.push(e);
    }
    return caps.length ? caps.concat(safe, rest) : safe.concat(rest);
  }

  value(alpha: number, beta: number): number {
    if (++this.nodes > this.budget) throw new Budget();
    if (this.free === 0) return 0;
    const k = this.key();
    const ex = this.exact.get(k);
    if (ex !== undefined) return ex;
    const lb = this.lower.get(k);
    if (lb !== undefined && lb > alpha) alpha = lb;
    const ub = this.upper.get(k);
    if (ub !== undefined && ub < beta) beta = ub;
    if (alpha >= beta) return alpha;
    const a0 = alpha;
    const b0 = beta;
    let best = -Infinity;
    for (const e of this.order()) {
      const made = this.make(e);
      const v = made ? made + this.value(alpha - made, beta - made) : -this.value(-beta, -alpha);
      this.unmake(e);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (best <= a0) this.upper.set(k, best);
    else if (best >= b0) this.lower.set(k, best);
    else this.exact.set(k, best);
    return best;
  }

  /** Best move and its exact value for the player to move, or null if the node budget ran out. */
  bestMove(): { move: number; value: number } | null {
    try {
      const boxesLeft = this.free; // loose bound: can't win more boxes than lines left
      let best = -Infinity;
      let move = -1;
      let alpha = -boxesLeft - 1;
      for (const e of this.order()) {
        const made = this.make(e);
        const v = made ? made + this.value(alpha - made, boxesLeft + 1 - made) : -this.value(-boxesLeft - 1, -alpha);
        this.unmake(e);
        if (v > best) [best, move] = [v, e];
        if (best > alpha) alpha = best;
      }
      return { move, value: best };
    } catch (e) {
      if (e instanceof Budget) return null;
      throw e;
    }
  }
}

function hard(s: State, rng: Rng): Decision {
  const remaining = s.g.edgeCount - s.moves.length;
  const boxes = s.g.rows * s.g.cols;
  const moves = legalMoves(s);
  const safe = moves.filter((e) => !givesAway(s, e) && !completes(s, e));
  if (remaining <= searchThreshold(boxes) || safe.length === 0) {
    const searcher = new Searcher(s);
    const r = searcher.bestMove();
    if (r) {
      const margin = s.score[s.turn] - s.score[1 - s.turn] + r.value;
      const declined = completes(s, r.move) === 0 && moves.some((e) => completes(s, e) > 0);
      const why = declined
        ? "Declined free boxes on purpose (a double-deal) to keep control of the next chain."
        : r.value > 0
          ? `Searched the rest of the game. Expects to win the remaining boxes by ${r.value}.`
          : r.value === 0
            ? "Searched the rest of the game. The remaining boxes split evenly with best play."
            : `Searched the rest of the game. Best play still loses the remaining boxes by ${-r.value}.`;
      return { move: r.move, why, searched: searcher.nodes, expected: margin };
    }
  }
  // Too early (or too big) to search to the end: play like Medium for now.
  const d = medium(s, rng);
  return { ...d, why: d.why + (remaining > searchThreshold(boxes) ? " (Board still too big to search to the end.)" : "") };
}
