import { newGame } from './game.mjs';
import { isConnected } from './board.mjs';

/** Pure, bounded configuration generator; no feature flags, UI or global RNG. */
export function createChallenge({ width = 20, height = 20, seed = 1,
  difficulty = 'normal', obstacleCount } = {}) {
  // Bound the quadratic connectivity work before allocating any boards.
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 4 || height < 1 || width * height > 4096) {
    throw new RangeError('Challenge boards require width >= 4, height >= 1, and at most 4096 cells');
  }
  const density = { easy: 0.08, normal: 0.14, hard: 0.20 };
  if (!Object.hasOwn(density, difficulty)) throw new RangeError('Unknown challenge difficulty');
  const count = obstacleCount ?? Math.floor(width * height * density[difficulty]);
  if (!Number.isSafeInteger(count) || count < 0 || count > width * height) {
    throw new RangeError('Obstacle count must be an integer between zero and board area');
  }
  const initial = newGame({ width, height, seed });
  const key = ({ x, y }) => y * width + x;
  const protectedCells = new Set([...initial.snake, initial.food].map(key));
  protectedCells.add(key(initial.snake[0]) + 1);
  const candidates = Array.from({ length: width * height }, (_, i) => i)
    .filter(cell => !protectedCells.has(cell));
  let rng = seed;
  for (let i = candidates.length - 1; i > 0; i--) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(rng / 0x100000000 * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const blocked = new Set();
  for (const cell of candidates) {
    if (blocked.size === count) break;
    blocked.add(cell);
    if (!isConnected(width, height, blocked, key(initial.snake[0]))) blocked.delete(cell);
  }
  const obstacles = Object.freeze([...blocked].sort((a, b) => a - b)
    .map(cell => Object.freeze({ x: cell % width, y: Math.floor(cell / width) })));
  return Object.freeze({ width, height, seed, difficulty, obstacles });
}
