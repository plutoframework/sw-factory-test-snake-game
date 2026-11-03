import { newGame, turn, tick, togglePause, getTickMs } from './game.mjs';

export const STEP_MS = 160;

/** One active clock, with optional challenge and replay module dependencies. */
export function createController(render, { schedule = setInterval, cancel = clearInterval,
  options = {}, challengeFactory, replay } = {}) {
  let state, session, turned = false, disposed = false, lastReplay;
  let mode = 'live', record, replayTick = 0, inputIndex = 0, timer, delay;
  let recordingAvailable = Boolean(replay);
  const configured = value => value.difficulty && challengeFactory ? challengeFactory(value) : value;
  const reset = () => {
    state = newGame(configured(options));
    session = replay?.createRecording(options);
    recordingAvailable = Boolean(replay);
    turned = false;
    mode = 'live';
  };
  const publish = () => render(state, { mode, canReplay: Boolean(lastReplay), recordingAvailable });
  const clock = () => {
    const nextDelay = (mode === 'live' ? options.difficulty : record?.options.difficulty) ? getTickMs(state) : STEP_MS;
    if (timer !== undefined && delay === nextDelay) return;
    if (timer !== undefined) cancel(timer);
    delay = nextDelay;
    timer = schedule(step, delay);
  };
  const step = () => {
    if (disposed) return;
    if (state.status === 'running' && mode !== 'replay-ended') {
      if (mode === 'replay') {
        const input = record.inputs[inputIndex];
        if (input?.tick === replayTick) { state = turn(state, input.direction); inputIndex++; }
        state = tick(state);
        replayTick++;
        if (replayTick === record.ticks) mode = 'replay-ended';
      } else {
        // Recording budgets must not interrupt a live game or save a partial replay.
        if (session) {
          try { session = replay.stepRecording(session); state = session.state; }
          catch (error) { if (!(error instanceof RangeError)) throw error; session = undefined; recordingAvailable = false; state = tick(state); }
        } else state = tick(state);
        if (state.status === 'gameover' && session) {
          const raw = replay.finishRecording(session);
          if (replay.playbackReplay(raw).ok) lastReplay = raw;
        }
      }
      turned = false;
    }
    clock();
    publish();
  };
  reset(); clock(); publish();
  return {
    direction(direction) {
      if (disposed || turned || mode !== 'live') return;
      const next = turn(state, direction);
      if (next !== state && session) {
        try { session = replay.recordDirection(session, direction); }
        catch (error) { if (!(error instanceof RangeError)) throw error; session = undefined; recordingAvailable = false; }
      }
      turned = next !== state;
      state = next;
      publish();
    },
    pause() {
      if (disposed || mode === 'replay-ended') return;
      state = togglePause(state);
      publish();
    },
    restart(nextOptions = options) {
      if (disposed) return;
      // Validate before replacing the current run.
      newGame(configured(nextOptions));
      options = { ...nextOptions };
      reset(); clock(); publish();
    },
    replayLast() {
      if (disposed || !lastReplay) return false;
      const result = replay.playbackReplay(lastReplay);
      if (!result.ok) return false;
      record = replay.validateReplay(lastReplay).record;
      state = newGame(configured(record.options));
      replayTick = 0; inputIndex = 0; turned = false; session = undefined;
      mode = record.ticks ? 'replay' : 'replay-ended';
      clock(); publish();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel(timer);
    },
  };
}
