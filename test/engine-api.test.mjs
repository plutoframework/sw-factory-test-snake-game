import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../game.mjs';
import { createChallenge } from '../challenges.mjs';
import { resolveFeatures } from '../features.mjs';

// Public surface + golden classic values guard compatibility independently of
// browser flags and challenge/replay integration. No DOM or global randomness.
test('complete engine API stays compatible in default, none and all profiles', () => {
  assert.deepEqual(Object.keys(engine).sort(),
    ['getTickMs', 'newGame', 'restart', 'tick', 'togglePause', 'turn']);
  const { newGame, turn, tick, togglePause, restart, getTickMs } = engine;
  for (const profile of [undefined, 'none', 'all']) {
    resolveFeatures(profile);
    const initial = newGame();
    assert.deepEqual(initial, {
      width: 20, height: 20, seed: 1, rngState: 1015568748,
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: 'right', score: 0, status: 'running', food: { x: 13, y: 4 },
    });
    assert.equal(getTickMs(initial), 150); // browser classic clock is separately 160ms
    assert.deepEqual(newGame({ difficulty: 'classic', safeStart: false }), initial);
    let state = turn(initial, 'up');
    assert.equal(turn(state, 'down'), state);
    const paused = togglePause(state);
    assert.equal(tick(paused), paused);
    assert.equal(turn(paused, 'left'), paused);
    state = togglePause(paused);
    for (let i = 0; i < 6; i++) state = tick(state);
    state = turn(state, 'right');
    for (let i = 0; i < 3; i++) state = tick(state);
    assert.equal(state.score, 1);
    assert.equal(state.snake.length, 4);
    assert.deepEqual(state.food, { x: 10, y: 7 });
    while (state.status === 'running') state = tick(state);
    assert.equal(state.status, 'gameover');
    assert.equal(tick(state), state);
    assert.equal(togglePause(state), state);
    assert.deepEqual(restart(state), initial);

    for (const difficulty of ['easy', 'normal', 'hard']) {
      const options = createChallenge({ width: 8, height: 6, seed: 0, difficulty });
      const game = newGame(options);
      assert.equal(game.difficulty, difficulty);
      assert.equal(game.safeStart, true);
      assert.deepEqual(game.obstacles, options.obstacles);
      assert.equal(getTickMs(game), { easy: 200, normal: 150, hard: 100 }[difficulty]);
      assert.deepEqual(restart(tick(game)), game);
      assert.ok(Object.isFrozen(game.obstacles));
      assert.ok(game.obstacles.every(Object.isFrozen));
    }
  }
});
