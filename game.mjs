// Pure deterministic engine. The browser adapter owns input and scheduling.
const vectors = Object.freeze({
  up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0],
});
const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' };
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

function immutable(state) {
  return Object.freeze({
    ...state,
    snake: Object.freeze(state.snake.map(cell => Object.freeze({ ...cell }))),
    food: state.food === null ? null : Object.freeze({ ...state.food }),
  });
}

function placeFood(state) {
  const occupied = new Set(state.snake.map(({ x, y }) => y * state.width + x));
  const freeCount = state.width * state.height - occupied.size;
  if (freeCount === 0) return { ...state, food: null, status: 'gameover' };
  // One unsigned 32-bit LCG step per placement, including the initial food.
  const rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
  let index = Math.floor((rngState / 0x100000000) * freeCount);
  for (let cell = 0; cell < state.width * state.height; cell++) {
    if (!occupied.has(cell) && index-- === 0) {
      return { ...state, rngState, food: { x: cell % state.width, y: Math.floor(cell / state.width) } };
    }
  }
}

export function newGame({ width = 20, height = 20, seed = 1 } = {}) {
  if (!Number.isSafeInteger(width) || width < 4 ||
      !Number.isSafeInteger(height) || height < 1 || width * height > 1_000_000) {
    throw new RangeError('Board requires width >= 4, height >= 1, and at most 1000000 cells');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an unsigned 32-bit integer');
  }
  const x = Math.max(2, Math.floor(width / 2));
  const y = Math.floor(height / 2);
  return immutable(placeFood({
    width, height, seed, rngState: seed,
    snake: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
    direction: 'right', score: 0, status: 'running', food: null,
  }));
}

export function turn(state, direction) {
  if (state.status !== 'running' || !Object.hasOwn(vectors, direction) ||
      direction === opposite[state.direction] || direction === state.direction) return state;
  return immutable({ ...state, direction });
}

export function tick(state) {
  if (state.status !== 'running') return state;
  const [dx, dy] = vectors[state.direction];
  const head = { x: state.snake[0].x + dx, y: state.snake[0].y + dy };
  const eating = state.food !== null && sameCell(head, state.food);
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (head.x < 0 || head.x >= state.width || head.y < 0 || head.y >= state.height ||
      body.some(cell => sameCell(head, cell))) {
    return immutable({ ...state, status: 'gameover' });
  }
  const next = { ...state, snake: [head, ...body], score: state.score + (eating ? 1 : 0) };
  return immutable(eating ? placeFood(next) : next);
}

export function togglePause(state) {
  if (state.status === 'gameover') return state;
  return immutable({ ...state, status: state.status === 'paused' ? 'running' : 'paused' });
}

export function restart(state) {
  return newGame({ width: state.width, height: state.height, seed: state.seed });
}
