// Internal bounded flood fill. The start is included even when in blocked.
export function reachableCells(width, height, blocked, start) {
  const seen = new Uint8Array(width * height);
  const queue = [start];
  seen[start] = 1;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const x = cell % width;
    for (const next of [x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
      cell - width, cell + width]) {
      if (next >= 0 && next < seen.length && !seen[next] && !blocked.has(next)) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return queue;
}

// Static topology: snake cells are traversable, only permanent walls count.
export function isConnected(width, height, blocked, start) {
  return reachableCells(width, height, blocked, start).length === width * height - blocked.size;
}
