import { createController } from './controller.mjs';

export function mountGameplay({ progress } = {}) {
  document.querySelector('.notice').lastChild.textContent = ' Cabinet ready';
  document.querySelector('.description').textContent = 'Eat the orange squares. Keep moving, and don’t hit the walls or your own tail.';
  document.querySelector('.availability').textContent = 'Arrows or WASD to steer.';
  document.querySelector('.subtext').textContent = 'Space to pause. Or use the controls below the board.';
  document.querySelector('.up-next li').remove();
  document.querySelector('#build-status').textContent = 'Classic gameplay · No coins needed';
  const cabinet = document.querySelector('.poster');
  cabinet.removeAttribute('role');
  cabinet.removeAttribute('aria-label');
  cabinet.classList.add('playable');
  cabinet.innerHTML = `
    <div class="game-heading"><span class="poster-label">Snake / Arcade</span><span>Score <strong id="score">0</strong></span></div>
    <canvas id="board" width="600" height="600" role="img" aria-label="Snake game board" aria-describedby="game-status"></canvas>
    <p id="game-status" role="status" aria-live="polite"></p>
    <div class="game-actions"><button id="pause" type="button">Pause</button><button id="restart" type="button">Restart</button></div>
    <div class="directions" role="group" aria-label="Steer snake">
      <button type="button" data-direction="up" aria-label="Move up">↑</button>
      <button type="button" data-direction="left" aria-label="Move left">←</button>
      <button type="button" data-direction="down" aria-label="Move down">↓</button>
      <button type="button" data-direction="right" aria-label="Move right">→</button>
    </div>`;
  const board = document.querySelector('#board');
  const ctx = board.getContext('2d');
  const score = document.querySelector('#score');
  const status = document.querySelector('#game-status');
  const pause = document.querySelector('#pause');
  let renderProgress = () => {};
  if (progress) {
    document.querySelector('.up-next li').remove();
    const panel = document.createElement('section');
    panel.id = 'saved-progress';
    panel.setAttribute('aria-labelledby', 'scores-title');
    panel.innerHTML = `<h2 id="scores-title">Local high scores</h2>
      <ol id="high-scores"></ol><p id="scores-empty">Finish a game to post your first score.</p>
      <label class="sound-setting"><input id="sound" type="checkbox"> Sound preference</label>
      <label class="difficulty-setting" for="difficulty">Difficulty preference <select id="difficulty"><option value="classic">Classic</option><option value="easy">Easy</option><option value="hard">Hard</option></select></label>
      <p class="save-note">Saved on this browser when available. Sound is not yet available; all games use classic difficulty.</p>`;
    document.querySelector('.intro').append(panel);
    const sound = panel.querySelector('#sound');
    const difficulty = panel.querySelector('#difficulty');
    renderProgress = () => {
      const saved = progress.read();
      panel.querySelector('#high-scores').replaceChildren(...saved.scores.map(value => {
        const item = document.createElement('li');
        item.textContent = String(value);
        return item;
      }));
      panel.querySelector('#scores-empty').hidden = saved.scores.length > 0;
      sound.checked = saved.settings.sound;
      difficulty.value = saved.settings.difficulty;
    };
    const saveSettings = () => {
      progress.setSettings({ sound: sound.checked, difficulty: difficulty.value });
      renderProgress();
    };
    sound.addEventListener('change', saveSettings);
    difficulty.addEventListener('change', saveSettings);
    renderProgress();
  }
  let previousStatus;
  const controller = createController(state => {
    if (state.status === 'gameover' && previousStatus !== 'gameover' && progress) {
      progress.addScore(state.score);
      renderProgress();
    }
    previousStatus = state.status;
    const size = board.width / state.width;
    ctx.fillStyle = '#fff9e9';
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.strokeStyle = '#14246018';
    ctx.lineWidth = 1;
    for (let i = 0; i <= state.width; i++) {
      ctx.beginPath(); ctx.moveTo(i * size, 0); ctx.lineTo(i * size, board.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size); ctx.lineTo(board.width, i * size); ctx.stroke();
    }
    const cell = ({ x, y }, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    };
    if (state.food) cell(state.food, '#fa6335');
    state.snake.forEach((part, index) => cell(part, index ? '#2146d9' : '#142460'));
    score.textContent = String(state.score);
    board.dataset.status = state.status;
    pause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    pause.disabled = state.status === 'gameover';
    status.textContent = state.status === 'gameover' ? 'Game over. Press Restart to play again.'
      : state.status === 'paused' ? 'Paused. Resume when you’re ready.' : 'Eat, turn, repeat. Stay inside the board.';
  });
  pause.addEventListener('click', () => controller.pause());
  document.querySelector('#restart').addEventListener('click', () => controller.restart());
  cabinet.querySelectorAll('[data-direction]').forEach(button => {
    button.addEventListener('click', () => controller.direction(button.dataset.direction));
  });
  const keys = { ArrowUp: 'up', w: 'up', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left' };
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
    if (direction || event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      if (direction) controller.direction(direction);
      else controller.pause();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && board.dataset.status === 'running') controller.pause();
  });
}
