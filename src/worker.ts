// Runs the AI off the main thread so the board never freezes while Hard is searching.
import { decide, mulberry32, type Decision, type Level } from "./ai";
import { replay, type Player } from "./game";

export type AskAI = { id: number; rows: number; cols: number; first: Player; moves: number[]; level: Level; seed: number };
export type AIReply = { id: number; decision: Decision; ms: number };

self.onmessage = (e: MessageEvent<AskAI>) => {
  const { id, rows, cols, first, moves, level, seed } = e.data;
  const t0 = performance.now();
  const s = replay(rows, cols, first, moves);
  const decision = decide(s, level, mulberry32(seed));
  (self as unknown as Worker).postMessage({ id, decision, ms: performance.now() - t0 } satisfies AIReply);
};
