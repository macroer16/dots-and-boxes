# Research

Checked 23 November 2026.

## The model: GridClash

The Build Pack lists [GridClash](https://gridclashweb.vercel.app/) (Dots & Boxes with an AI) as the thing to copy. Its page needed an approval that wasn't given while I was building, so I couldn't study it directly. Everything below comes from strategy sources, and the game's own ideas are mine.

## How strong players think

| Idea | What it means | Source |
| --- | --- | --- |
| **Avoid the third side** | Beginners just connect dots and avoid putting a third side on any box. Medium plays this way. | [Wikipedia](https://en.wikipedia.org/wiki/Dots_and_boxes) |
| **Long chains** | A chain of 3+ boxes is "long". If your opponent has to open one, you take all but two and sacrifice the last two, so they must open the next chain. | [UCLA, Tom Ferguson](https://www.math.ucla.edu/~tom/Games/dots&boxes_hints.html) |
| **The player who opens the first long chain usually loses** | So the middle game is really a fight over who is forced to open first. | [Wikipedia](https://en.wikipedia.org/wiki/Dots_and_boxes) |
| **Double-dealing** | Sacrifice 2 boxes in a chain (or 4 in a loop) to pass the turn back. The reply is a "double-cross", where one line closes two boxes. | [Dots & Boxes is PSPACE-complete (arXiv)](https://arxiv.org/pdf/2105.02837) |
| **The long chain rule** | Berlekamp's parity rule: the first player wants (starting dots + long chains) to be even, and the second player wants it odd. | [Science News on Berlekamp](https://www.sciencenews.org/?p=25622) |
| **Keep control** | Once you have control, decline two boxes of every long chain except the last. | [Science News](https://www.sciencenews.org/article/dots-and-boxes) |

## What I took from this

1. **Three levels that match the stages of learning.** Easy is greedy. Medium avoids the third side and then gives away the smallest chain. Hard does what experts do.
2. **Hard doesn't hard-code the rules above. It searches.** Coding the long chain rule and double-dealing by hand is fiddly and easy to get wrong. An exact game-tree search discovers both on its own, and the tests show it beats Medium on every board size.
3. **Explain the AI.** A "What the AI is thinking" panel shows why it moved and how many positions it looked at. When it declines free boxes, it says that's a double-deal.
4. **The game is provably hard,** so search has limits. Dots & Boxes is PSPACE-complete in general ([arXiv](https://arxiv.org/pdf/2105.02837)), so Hard only searches to the end once the board is small enough. The thresholds were tuned by measuring (see ARCHITECTURE.md).
