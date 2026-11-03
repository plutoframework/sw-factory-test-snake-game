import { newGame, turn, tick, togglePause, restart } from './game.mjs';

export const STEP_MS = 160;

/** One clock per mounted game; restarts never create timers. */
export function createController(render, { schedule = setInterval, cancel = clearInterval } = {}) {
  let state = newGame();
  let turned = false;
  let disposed = false;
  const publish = () => render(state);
  const timer = schedule(() => {
    if (disposed) return;
    if (state.status === 'running') {
      state = tick(state);
      turned = false;
    }
    publish();
  }, STEP_MS);
  publish();
  return {
    direction(direction) {
      if (disposed || turned) return;
      const next = turn(state, direction);
      turned = next !== state;
      state = next;
      publish();
    },
    pause() {
      if (disposed) return;
      state = togglePause(state);
      publish();
    },
    restart() {
      if (disposed) return;
      state = restart(state);
      turned = false;
      publish();
    },
    dispose() {
      disposed = true;
      cancel(timer);
    },
  };
}
