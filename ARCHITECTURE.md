# Architecture

```
src/
  game.ts     rules: geometry, play(), legal moves, scoring — pure, no DOM
  ai.ts       Easy / Medium / Hard + the Searcher (negamax, alpha-beta, transposition table)
  worker.ts   runs ai.ts in a Web Worker so the page never freezes
  main.ts     SVG board, input (mouse, touch, keyboard), turn flow, hint, undo, record
  style.css   chalkboard look; the chalk texture is an SVG turbulence filter
tests/        rules, AI behaviour, tournaments
scripts/      speed and strength benchmarks (npm run bench)
```

## The board as numbers

An R×C board has (R+1)×C horizontal and R×(C+1) vertical edges, numbered horizontals first. `geometry()` precomputes, once per size, the 4 edges of every box and the 1–2 boxes on every edge. After that, every rule is an array lookup:

- `play(e)` adds 1 to `sides[b]` for each box `b` on edge `e`. A box that reaches 4 is won, and the same player moves again.
- `completes(e)` counts adjacent boxes that have 3 sides. `givesAway(e)` checks whether any adjacent box has 2.

## Turn flow

```
human click ─► play() ─► paint()
                 │
                 └─ AI's turn? ─► worker.postMessage(moves) ─► decide() ─► reply
                                    ▲                                     │
                                    └──── AI captured a box: ask again ◄──┘
```

The worker gets the move list and replays it, so it never shares memory with the page.

## Hard: the search

Value of a position = **(boxes the player to move will still win) − (boxes the opponent will still win)**. Boxes already won don't change the best future play, so a position is identified **by its set of drawn edges alone**. That's what makes the transposition table work.

```
value(pos, α, β):
  for each line e (captures first, then safe lines, then sacrifices):
     made = make(e)                      # mutate one shared board
     v = made > 0 ?  made + value(α−made, β−made)   # same player goes again
                  : −value(−β, −α)                  # turn passes: negate
     unmake(e)
     α-β cut-off
  store exact / lower / upper bound under the edge-set key
```

- **Make/unmake instead of copying.** The first version cloned the board at every node: a 3×3 game took about 7 s. Updating one board in place, with an edge-set key updated as it goes, made it about **5× faster**.
- **Move ordering** (captures → safe → sacrifices) gives alpha-beta early cut-offs.
- **The key** is a number: edges 0–29 in one 30-bit part and 30–59 in another. It's exact up to 52 edges (4×4). On 5×5 the high part is hashed into the number.
- **Node budget** of 1.5 million positions. If a search runs out, Hard falls back to Medium's move rather than freezing.

### When Hard starts searching

Measured with `npm run bench` (Hard vs Medium, 4 games per size):

| Board | Starts exact search at | Slowest move | Average move |
| --- | --- | --- | --- |
| 3×3 (24 lines) | 22 lines left | ~0.9 s | ~50 ms |
| 4×4 (40 lines) | 28 lines left | ~1 s | ~40 ms |
| 5×5 (60 lines) | 30 lines left, or once no safe lines remain | ~30 ms | ~1 ms |

### Strength

| Match (alternating who starts) | Result |
| --- | --- |
| Hard vs Medium, 3×3 | **20–0** |
| Hard vs Medium, 4×4 | **11–0**, 1 draw |
| Hard vs Medium, 5×5 | **9–3** |
| Medium vs Easy, 3×3 | Medium wins more than 3 games for every one it loses (tested) |

## Interview notes

- **Game loop:** there's no frame loop. The game is event-driven: a click causes a state change and then a repaint. The only animation is CSS on newly drawn lines.
- **Why negamax:** Dots & Boxes is zero-sum, so one function scores both players by flipping the sign. The twist is that capturing a box doesn't pass the turn, so that branch adds the boxes made and *doesn't* negate.
- **Why the transposition table is valid:** the future depends only on which edges are drawn, not on who drew them or the current score.
