// Dots & Boxes rules. Pure and immutable-ish: the UI, the AI and the tests all use this.
//
// A board of R×C boxes has (R+1)×C horizontal edges and R×(C+1) vertical edges.
// Edges are numbered: all horizontals first (row by row), then all verticals.

export type Player = 0 | 1;

export type Geometry = {
  rows: number; // boxes down
  cols: number; // boxes across
  edgeCount: number;
  boxEdges: number[][]; // box → its 4 edges [top, bottom, left, right]
  edgeBoxes: number[][]; // edge → the 1 or 2 boxes it borders
};

export type State = {
  g: Geometry;
  drawn: Uint8Array; // edge → 0/1
  owner: Int8Array; // box → -1 / 0 / 1
  sides: Uint8Array; // box → number of drawn sides (cached)
  turn: Player;
  score: [number, number];
  moves: number[]; // history of edges, in order
};

const cache = new Map<string, Geometry>();

export function geometry(rows: number, cols: number): Geometry {
  const key = `${rows}x${cols}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const H = (r: number, c: number) => r * cols + c; // r ∈ 0..rows, c ∈ 0..cols-1
  const nH = (rows + 1) * cols;
  const V = (r: number, c: number) => nH + r * (cols + 1) + c; // r ∈ 0..rows-1, c ∈ 0..cols
  const edgeCount = nH + rows * (cols + 1);
  const boxEdges: number[][] = [];
  const edgeBoxes: number[][] = Array.from({ length: edgeCount }, () => []);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const b = r * cols + c;
      const e = [H(r, c), H(r + 1, c), V(r, c), V(r, c + 1)];
      boxEdges.push(e);
      for (const x of e) edgeBoxes[x].push(b);
    }
  const g = { rows, cols, edgeCount, boxEdges, edgeBoxes };
  cache.set(key, g);
  return g;
}

/** Where an edge sits, for drawing: from dot (r1,c1) to dot (r2,c2). */
export function edgeEnds(g: Geometry, e: number): [number, number, number, number] {
  const nH = (g.rows + 1) * g.cols;
  if (e < nH) {
    const r = Math.floor(e / g.cols);
    const c = e % g.cols;
    return [r, c, r, c + 1];
  }
  const k = e - nH;
  const r = Math.floor(k / (g.cols + 1));
  const c = k % (g.cols + 1);
  return [r, c, r + 1, c];
}

export function isHorizontal(g: Geometry, e: number): boolean {
  return e < (g.rows + 1) * g.cols;
}

export function newGame(rows: number, cols: number, first: Player = 0): State {
  const g = geometry(rows, cols);
  return {
    g,
    drawn: new Uint8Array(g.edgeCount),
    owner: new Int8Array(rows * cols).fill(-1),
    sides: new Uint8Array(rows * cols),
    turn: first,
    score: [0, 0],
    moves: [],
  };
}

export function clone(s: State): State {
  return {
    g: s.g,
    drawn: s.drawn.slice(),
    owner: s.owner.slice(),
    sides: s.sides.slice(),
    turn: s.turn,
    score: [s.score[0], s.score[1]],
    moves: s.moves.slice(),
  };
}

export const isOver = (s: State) => s.moves.length === s.g.edgeCount;

export function legalMoves(s: State): number[] {
  const out: number[] = [];
  for (let e = 0; e < s.g.edgeCount; e++) if (!s.drawn[e]) out.push(e);
  return out;
}

/** How many boxes drawing this edge would complete right now (0, 1 or 2). */
export function completes(s: State, e: number): number {
  let n = 0;
  for (const b of s.g.edgeBoxes[e]) if (s.sides[b] === 3) n++;
  return n;
}

/** Would drawing this edge give the opponent a box (put a 3rd side on one)? */
export function givesAway(s: State, e: number): boolean {
  for (const b of s.g.edgeBoxes[e]) if (s.sides[b] === 2) return true;
  return false;
}

/** Draws an edge in place. Returns boxes completed. The same player moves again if > 0. */
export function play(s: State, e: number): number {
  if (s.drawn[e]) throw new Error(`edge ${e} already drawn`);
  s.drawn[e] = 1;
  s.moves.push(e);
  let made = 0;
  for (const b of s.g.edgeBoxes[e]) {
    s.sides[b]++;
    if (s.sides[b] === 4) {
      s.owner[b] = s.turn;
      made++;
    }
  }
  if (made) s.score[s.turn] += made;
  else s.turn = (1 - s.turn) as Player;
  return made;
}

/** Rebuild a state from a move list (used by undo). */
export function replay(rows: number, cols: number, first: Player, moves: number[]): State {
  const s = newGame(rows, cols, first);
  for (const m of moves) play(s, m);
  return s;
}

export function winner(s: State): Player | "draw" | null {
  if (!isOver(s)) return null;
  if (s.score[0] === s.score[1]) return "draw";
  return s.score[0] > s.score[1] ? 0 : 1;
}
