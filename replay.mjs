import { newGame, turn, tick } from './game.mjs';
import { createChallenge } from './challenges.mjs';

export const CHALLENGE_REPLAY_VERSION = 2;
const engineOptions = options => options.difficulty ? createChallenge(options) : options;

export const REPLAY_VERSION = 1;
export const MAX_RECORD_LENGTH = 524288;
export const MAX_TICKS = 10000;
export const MAX_INPUTS = 10000;
export const MAX_CELLS = 4096;
export const MAX_WORK = 4000000; // cells * (ticks + 1), including initial food placement
const directions = ['up', 'right', 'down', 'left'];
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const keys = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const fail = (code, message) => ({ ok: false, code, message });
const freeze = record => Object.freeze({
  ...record,
  options: Object.freeze({ ...record.options }),
  inputs: Object.freeze(record.inputs.map(input => Object.freeze({ ...input }))),
  expected: Object.freeze({ ...record.expected }),
});

/** Untrusted boundary: JSON text only. No simulation occurs during validation. */
export function validateReplay(raw) {
  if (typeof raw !== 'string') return fail('malformed', 'Replay must be JSON text');
  if (raw.length > MAX_RECORD_LENGTH) return fail('oversized', `Replay exceeds ${MAX_RECORD_LENGTH} characters`);
  let record;
  try { record = JSON.parse(raw); } catch { return fail('malformed', 'Replay is not valid JSON'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return fail('malformed', 'Expected a replay object');
  if (![REPLAY_VERSION, CHALLENGE_REPLAY_VERSION].includes(record.version)) return fail('unsupported', 'Unsupported replay version');
  if (!keys(record, ['version', 'options', 'ticks', 'inputs', 'expected']) ||
      !keys(record.options, record.version === 2 ? ['width', 'height', 'seed', 'difficulty'] : ['width', 'height', 'seed']) ||
      !keys(record.expected, ['score', 'status'])) return fail('malformed', 'Unexpected replay fields');
  if (record.version === 2 && !['easy', 'normal', 'hard'].includes(record.options.difficulty)) return fail('malformed', 'Invalid challenge difficulty');
  const { width, height, seed } = record.options;
  if (!integer(width, 4, MAX_CELLS) || !integer(height, 1, MAX_CELLS) ||
      !integer(seed, 0, 0xffffffff)) return fail('malformed', 'Invalid board options or seed');
  if (!integer(record.ticks, 0, MAX_TICKS) || width * height > MAX_CELLS ||
      width * height * (record.ticks + 1) > MAX_WORK) return fail('oversized', 'Replay exceeds simulation work budget');
  if (!Array.isArray(record.inputs)) return fail('malformed', 'Inputs must be an array');
  if (record.inputs.length > MAX_INPUTS) return fail('oversized', 'Too many direction inputs');
  if (!integer(record.expected.score, 0, width * height - 3) ||
      !['running', 'gameover'].includes(record.expected.status)) return fail('malformed', 'Invalid expected score or status');
  let previous = -1;
  for (const input of record.inputs) {
    if (!keys(input, ['tick', 'direction']) || !integer(input.tick, 0, record.ticks - 1) ||
        input.tick <= previous || !directions.includes(input.direction)) {
      return fail('malformed', 'Inputs require increasing unique ticks within the run and cardinal directions');
    }
    previous = input.tick;
  }
  return { ok: true, record: freeze(record) };
}

/** Replays at most the validated budget. Semantic errors never return a trusted state. */
export function playbackReplay(raw) {
  const result = validateReplay(raw);
  if (!result.ok) return result;
  const { record } = result;
  let state = newGame(engineOptions(record.options));
  let index = 0;
  for (let simulationTick = 0; simulationTick < record.ticks; simulationTick++) {
    if (state.status !== 'running') return fail('incompatible', 'Replay continues after game over');
    const input = record.inputs[index];
    if (input?.tick === simulationTick) {
      const next = turn(state, input.direction);
      if (next === state) return fail('incompatible', `Ignored direction input at tick ${simulationTick}`);
      state = next;
      index++;
    }
    state = tick(state);
  }
  if (state.score !== record.expected.score || state.status !== record.expected.status) {
    return fail('mismatch', 'Reproduced score or terminal status does not match the recording');
  }
  return { ok: true, state, ticks: record.ticks };
}

/** Trusted functional recording session. Retain each returned session; nothing is mutated. */
export function createRecording({ width = 20, height = 20, seed = 1, difficulty } = {}) {
  if (!integer(width, 4, MAX_CELLS) || !integer(height, 1, MAX_CELLS) || width * height > MAX_CELLS) {
    throw new RangeError('Replay board exceeds supported dimensions');
  }
  const options = Object.freeze({ width, height, seed, ...(difficulty ? { difficulty } : {}) });
  const state = newGame(engineOptions(options));
  return Object.freeze({ state, options, ticks: 0, inputs: Object.freeze([]) });
}

export function recordDirection(session, direction) {
  if (session.inputs.at(-1)?.tick === session.ticks) return session; // one accepted turn per tick
  const state = turn(session.state, direction);
  if (state === session.state) return session;
  checkBudget(session);
  if (session.inputs.length >= MAX_INPUTS) throw new RangeError('Too many replay inputs');
  return Object.freeze({ ...session, state, inputs: Object.freeze([
    ...session.inputs, Object.freeze({ tick: session.ticks, direction }),
  ]) });
}

function checkBudget(session) {
  if (session.ticks >= MAX_TICKS || session.state.width * session.state.height * (session.ticks + 2) > MAX_WORK) {
    throw new RangeError('Replay exceeds simulation work budget');
  }
}

/** Call only for a simulation step, never for paused/display frames. */
export function stepRecording(session) {
  if (session.state.status !== 'running') return session;
  checkBudget(session);
  return Object.freeze({ ...session, state: tick(session.state), ticks: session.ticks + 1 });
}

/** Export JSON; running prefixes and completed games are both supported. */
export function finishRecording(session) {
  if (session.inputs.at(-1)?.tick === session.ticks) throw new RangeError('Step the pending direction before exporting');
  const { score, status } = session.state;
  const raw = JSON.stringify({ version: session.options.difficulty ? CHALLENGE_REPLAY_VERSION : REPLAY_VERSION, options: session.options,
    ticks: session.ticks, inputs: session.inputs, expected: { score, status } });
  const result = validateReplay(raw);
  if (!result.ok) throw new RangeError(result.message);
  return raw;
}
