import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, turn, tick, togglePause } from '../game.mjs';
import { resolveFeatures } from '../features.mjs';
import { createRecording, recordDirection, stepRecording, finishRecording, validateReplay,
  playbackReplay, MAX_RECORD_LENGTH, MAX_TICKS, MAX_INPUTS, MAX_CELLS, MAX_WORK } from '../replay.mjs';

function run({ pauses = false } = {}) {
  let session = createRecording();
  let original = newGame();
  const turns = new Map([[0, 'up'], [6, 'right'], [9, 'down'], [10, 'left']]);
  while (original.status === 'running') {
    const direction = turns.get(session.ticks);
    if (direction) {
      original = turn(original, direction);
      session = recordDirection(session, direction);
    }
    if (pauses) {
      original = togglePause(original);
      for (let i = 0; i < 100; i++) original = tick(original);
      original = togglePause(original);
    }
    original = tick(original);
    session = stepRecording(session);
    assert.deepEqual(session.state, original);
  }
  return { session, original, raw: finishRecording(session) };
}

test('recorded turns, food, score and wall game-over reproduce the entire engine state', () => {
  const { session, original, raw } = run();
  assert.equal(original.score, 1);
  assert.equal(original.status, 'gameover');
  assert.deepEqual(playbackReplay(raw), { ok: true, state: original, ticks: session.ticks });
  assert.deepEqual(JSON.parse(raw).inputs, [
    { tick: 0, direction: 'up' }, { tick: 6, direction: 'right' },
    { tick: 9, direction: 'down' }, { tick: 10, direction: 'left' },
  ]);
  assert.equal(stepRecording(session), session);
  assert.equal(recordDirection(session, 'up'), session);
  assert.equal(run({ pauses: true }).raw, raw, 'Pause duration never enters the record');
});

test('pure recording preserves previous sessions and uses controller turn latch semantics', () => {
  const initial = createRecording({ width: 8, height: 5, seed: 0 });
  assert.equal(recordDirection(initial, 'left'), initial);
  assert.equal(recordDirection(initial, 'right'), initial);
  assert.equal(recordDirection(initial, 'bogus'), initial);
  const up = recordDirection(initial, 'up');
  assert.equal(recordDirection(up, 'left'), up);
  assert.equal(initial.inputs.length, 0);
  assert.equal(initial.state.direction, 'right');
  assert.ok(Object.isFrozen(up.inputs[0]));
  assert.throws(() => finishRecording(up), /pending/);
  const stepped = stepRecording(up);
  assert.deepEqual(playbackReplay(finishRecording(stepped)).state, stepped.state);
  assert.deepEqual(playbackReplay(finishRecording(initial)).state, initial.state);
});

test('full-board terminal state replays including final growth and seed zero', () => {
  // Width four, height one starts with exactly one free cell to the right.
  const session = stepRecording(createRecording({ width: 4, height: 1, seed: 0 }));
  assert.equal(session.state.status, 'gameover');
  assert.equal(session.state.score, 1);
  assert.equal(session.state.food, null);
  assert.deepEqual(playbackReplay(finishRecording(session)).state, session.state);
});

test('bounded validation rejects malformed, oversized and incompatible payloads with useful codes', () => {
  const valid = JSON.parse(run().raw);
  const check = (record, code) => {
    const raw = typeof record === 'string' ? record : JSON.stringify(record);
    assert.equal(validateReplay(raw).code, code);
    assert.equal(playbackReplay(raw).code, code);
  };
  for (const raw of ['{', 'null', '[]', '42']) check(raw, 'malformed');
  assert.equal(validateReplay(valid).code, 'malformed', 'Object inputs are not an untrusted boundary');
  check({ ...valid, version: 99 }, 'unsupported');
  check(' '.repeat(MAX_RECORD_LENGTH + 1), 'oversized');
  check({ ...valid, ticks: MAX_TICKS + 1 }, 'oversized');
  check({ ...valid, inputs: Array(MAX_INPUTS + 1).fill({ tick: 0, direction: 'up' }) }, 'oversized');
  check({ ...valid, options: { ...valid.options, width: MAX_CELLS, height: 2 } }, 'oversized');
  check({ ...valid, options: { ...valid.options, width: 4000, height: 1 }, ticks: Math.floor(MAX_WORK / 4000) }, 'oversized');
  for (const options of [{ width: 3, height: 20, seed: 1 }, { width: 20, height: 0, seed: 1 },
    { width: 20, height: 20, seed: -1 }, { width: 20, height: 20, seed: 2 ** 32 }]) {
    check({ ...valid, options }, 'malformed');
    assert.throws(() => createRecording(options), RangeError);
  }
  for (const inputs of [[{ tick: -1, direction: 'up' }], [{ tick: 0.5, direction: 'up' }],
    [{ tick: valid.ticks, direction: 'up' }], [{ tick: 0, direction: 'north' }],
    [{ tick: 0, direction: 'up' }, { tick: 0, direction: 'left' }],
    [{ tick: 1, direction: 'up' }, { tick: 0, direction: 'left' }]]) check({ ...valid, inputs }, 'malformed');
  check({ ...valid, expected: { score: 0, status: 'paused' } }, 'malformed');
  check({ ...valid, extra: true }, 'malformed');
  assert.equal(playbackReplay(JSON.stringify({ ...valid, expected: { score: 0, status: 'gameover' } })).code, 'mismatch');
  assert.equal(playbackReplay(JSON.stringify({ ...valid, ticks: valid.ticks + 1 })).code, 'incompatible');
  assert.equal(playbackReplay(JSON.stringify({ ...valid, inputs: [{ tick: 0, direction: 'left' }] })).code, 'incompatible');
  const result = validateReplay(JSON.stringify(valid));
  assert.ok(result.ok);
  assert.ok(Object.isFrozen(result.record.options));
  assert.ok(Object.isFrozen(result.record.inputs[0]));
});

test('recording work budget is enforced before stepping or accepting another input', () => {
  let session = createRecording({ width: 4, height: 4 });
  // A perimeter loop runs indefinitely without relying on wall-clock timing.
  const turns = ['up', 'left', 'down', 'right'];
  for (let i = 0; i < MAX_TICKS; i++) {
    if (i % 2 === 0) session = recordDirection(session, turns[(i / 2) % 4]);
    session = stepRecording(session);
    assert.equal(session.state.status, 'running');
  }
  assert.ok(playbackReplay(finishRecording(session)).ok);
  assert.throws(() => stepRecording(session), /budget/);
  assert.throws(() => recordDirection(session, 'up'), /budget/);
});

test('replay stays default disabled and explicit imports do not alter feature resolution', () => {
  assert.equal(resolveFeatures().replay, false);
  assert.equal(resolveFeatures('none').replay, false);
  assert.equal(resolveFeatures('all').replay, true);
  assert.ok(playbackReplay(run().raw).ok);
  assert.equal(resolveFeatures().replay, false);
});
