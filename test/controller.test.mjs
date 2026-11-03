import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, STEP_MS } from '../controller.mjs';

function setup() {
  let state, step, schedules = 0, cancels = 0;
  const controller = createController(next => { state = next; }, {
    schedule(callback, delay) { step = callback; schedules++; assert.equal(delay, STEP_MS); return 7; },
    cancel(id) { assert.equal(id, 7); cancels++; },
  });
  return { controller, step: () => step(), get state() { return state; }, get schedules() { return schedules; }, get cancels() { return cancels; } };
}

test('input latch prevents multi-key reversal within a step, including across pause', () => {
  const game = setup();
  const { controller: c } = game;
  c.direction('left'); // invalid reversal must not consume the turn
  c.direction('up');
  c.pause(); game.step(); c.pause();
  c.direction('left');
  assert.equal(game.state.direction, 'up');
  game.step();
  assert.deepEqual(game.state.snake[0], { x: 10, y: 9 });
  c.direction('left'); game.step();
  assert.deepEqual(game.state.snake[0], { x: 9, y: 9 });
  c.dispose();
});

test('pause, collision, restart and disposal preserve a single steady clock', () => {
  const game = setup();
  const { controller: c } = game;
  const initial = game.state;
  c.pause(); const paused = game.state;
  game.step(); c.direction('up');
  assert.deepEqual(game.state, paused);
  c.pause();
  for (let i = 0; i < 10; i++) game.step();
  assert.equal(game.state.status, 'gameover');
  const ended = game.state;
  c.pause(); c.direction('up'); game.step();
  assert.deepEqual(game.state, ended);
  for (let i = 0; i < 20; i++) c.restart();
  assert.deepEqual(game.state, initial);
  assert.equal(game.schedules, 1);
  game.step();
  assert.equal(game.state.snake[0].x, initial.snake[0].x + 1);
  c.dispose();
  const disposed = game.state;
  c.restart(); c.pause(); c.direction('up'); game.step();
  assert.deepEqual(game.state, disposed);
  assert.equal(game.cancels, 1);
});
