// Moving between the agents of the diagram with the keys: from the box the focus is on, the nearest box in the
// chosen direction. centers is [{ x, y }] (the middle of every box); the result is an index, or -1 when there is none.
const EPS = 4;

export function pickNeighbour(centers, from, direction) {
  const here = centers[from];
  if (!here) return -1;
  let best = -1;
  let bestScore = Infinity;
  centers.forEach((c, i) => {
    if (i === from) return;
    const dx = c.x - here.x;
    const dy = c.y - here.y;
    const along = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= EPS) return;
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
