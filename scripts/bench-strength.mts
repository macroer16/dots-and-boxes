import { decide, mulberry32, type Level } from "../src/ai";
import { isOver, newGame, play, winner } from "../src/game";
for (const n of [4, 5]) {
  let h = 0, m = 0, d = 0;
  for (let i = 0; i < 12; i++) {
    const rng = mulberry32(900 + i);
    const s = newGame(n, n, (i % 2) as 0 | 1);
    const lv: Record<number, Level> = { 0: "hard", 1: "medium" };
    while (!isOver(s)) play(s, decide(s, lv[s.turn], rng).move);
    const w = winner(s); w === 0 ? h++ : w === 1 ? m++ : d++;
  }
  console.log(`${n}x${n} hard vs medium: hard ${h}, medium ${m}, draws ${d}`);
}
