import { decide, mulberry32 } from "../src/ai";
import { isOver, newGame, play } from "../src/game";
for (const n of [3, 4, 5]) {
  let worst = 0, total = 0, moves = 0, fallbacks = 0;
  for (let g = 0; g < 4; g++) {
    const rng = mulberry32(50 + g);
    const s = newGame(n, n, (g % 2) as 0 | 1);
    while (!isOver(s)) {
      const level = s.turn === 0 ? "hard" : "medium";
      const t0 = performance.now();
      const d = decide(s, level, rng);
      const dt = performance.now() - t0;
      if (level === "hard") { worst = Math.max(worst, dt); total += dt; moves++; if (/too big/.test(d.why)) fallbacks++; }
      play(s, d.move);
    }
  }
  console.log(`${n}x${n}: worst ${worst.toFixed(0)} ms, avg ${(total / moves).toFixed(0)} ms, medium-style moves ${fallbacks}/${moves}`);
}
