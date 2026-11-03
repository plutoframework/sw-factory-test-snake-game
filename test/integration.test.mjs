import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../controller.mjs';
import { createChallenge } from '../challenges.mjs';
import * as replay from '../replay.mjs';
import { createProgress } from '../storage.mjs';

function harness(options = {}) {
  let state, meta, step, nextId = 0;
  const timers = new Map();
  const game = createController((s, m) => { state = s; meta = m; }, {
    ...options,
    schedule(fn, delay) { const id = ++nextId; step = fn; timers.set(id, delay); return id; },
    cancel(id) { assert.ok(timers.delete(id)); },
  });
  return { game, timers, step: () => step(), get state() { return state; }, get meta() { return meta; } };
}

test('challenge recording, validated playback, pause and live restart share one clock without saving replay scores', () => {
  const h = harness({ options: { seed: 42, difficulty: 'hard' }, challengeFactory: createChallenge, replay });
  assert.deepEqual([...h.timers.values()], [100]);
  const initial = h.state;
  const progress = createProgress();
  while (h.state.status === 'running') h.step();
  progress.addScore(h.state.score);
  const terminal = h.state;
  assert.equal(h.meta.canReplay, true);
  assert.equal(h.game.replayLast(), true);
  h.game.direction('up');
  h.game.pause(); const paused = h.state;
  h.step(); assert.deepEqual(h.state, paused);
  h.game.pause();
  for (let i = 0; i < 20 && h.meta.mode === 'replay'; i++) h.step();
  assert.equal(h.meta.mode, 'replay-ended');
  assert.deepEqual(h.state, terminal);
  h.step(); assert.deepEqual(h.state, terminal);
  h.game.replayLast(); h.game.pause(); h.game.restart();
  assert.deepEqual(h.state, initial);
  assert.equal(h.meta.mode, 'live');
  assert.equal(h.timers.size, 1);
  h.game.direction('up');
  assert.equal(h.state.direction, 'up', 'Input latch is cleared on replay exit');
  assert.equal(progress.read().scores.length, 1);
  h.game.restart({ seed: 0 });
  assert.deepEqual([...h.timers.values()], [160]);
  h.game.dispose(); h.game.dispose(); assert.equal(h.timers.size, 0);
  h.step(); assert.equal(h.game.replayLast(), false);
});

test('independent challenge/replay flags leave classic gameplay and storage untouched', () => {
  for (const deps of [{}, { replay }, { challengeFactory: createChallenge }]) {
    const h = harness(deps);
    assert.equal(h.state.obstacles, undefined);
    h.step(); assert.deepEqual(h.state.snake[0], { x: 11, y: 10 });
    for (let i = 0; i < 9; i++) h.step();
    assert.equal(h.meta.canReplay, Boolean(deps.replay));
    h.game.restart(); assert.equal(h.timers.size, 1);
    h.game.dispose();
  }
});

test('recording limits keep live controls working and retain only the previous valid completed replay', () => {
  let limited = false;
  const boundedReplay = { ...replay, stepRecording(session) {
    if (limited && session.ticks >= 2) throw new RangeError('Recording budget exhausted');
    return replay.stepRecording(session);
  } };
  const h = harness({ replay: boundedReplay });
  while (h.state.status === 'running') h.step();
  const recordedTerminal = h.state;
  limited = true;
  h.game.restart({ seed: 42 });
  h.step(); h.step(); h.step();
  assert.equal(h.meta.recordingAvailable, false);
  assert.equal(h.state.snake[0].x, 13, 'Budget failure still advances exactly one tick');
  h.game.direction('up');
  h.game.pause(); h.step();
  assert.equal(h.state.status, 'paused');
  h.game.pause();
  while (h.state.status === 'running') h.step();
  assert.equal(h.state.seed, 42);
  assert.equal(h.game.replayLast(), true);
  while (h.meta.mode === 'replay') h.step();
  assert.deepEqual(h.state, recordedTerminal, 'Incomplete recording never replaces last valid run');
  assert.equal(h.timers.size, 1);
  h.game.restart();
  assert.equal(h.state.seed, 42, 'Replay exit restores live configuration, not replay options');
  h.game.dispose();
});

test('versioned challenge replays regenerate deterministic layouts and reject invalid difficulty', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let session = replay.createRecording({ seed: 0, difficulty });
    session = replay.recordDirection(session, 'up');
    session = replay.stepRecording(session);
    const raw = replay.finishRecording(session);
    assert.equal(JSON.parse(raw).version, replay.CHALLENGE_REPLAY_VERSION);
    assert.deepEqual(replay.playbackReplay(raw).state, session.state);
    const invalid = JSON.parse(raw); invalid.options.difficulty = 'impossible';
    assert.equal(replay.playbackReplay(JSON.stringify(invalid)).ok, false);
  }
  const progress = createProgress();
  progress.setSettings({ sound: false, difficulty: 'normal' });
  assert.equal(progress.read().settings.difficulty, 'normal');
});
