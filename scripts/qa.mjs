import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './server.mjs';
import { resolveFeatures } from '../features.mjs';

// Read the actual painted head rather than exposing mutable engine state to QA.
async function head(page) {
  return page.locator('#board').evaluate(board => {
    const ctx = board.getContext('2d');
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const pixel = ctx.getImageData(x * 30 + 15, y * 30 + 15, 1, 1).data;
      if (pixel[0] === 20 && pixel[1] === 36 && pixel[2] === 96) return { x, y };
    }
  });
}
async function checkGameplay(page, name) {
  const board = page.locator('#board');
  const pause = page.locator('#pause');
  const restart = page.locator('#restart');
  const steer = async direction => {
    const button = page.locator(`[data-direction="${direction}"]`);
    if (name === 'mobile') await button.tap(); else await button.click();
  };
  assert.ok(await board.isVisible());
  assert.equal(await page.locator('#score').textContent(), '0');
  assert.deepEqual(await head(page), { x: 10, y: 10 });
  await page.keyboard.press('ArrowLeft'); // reversal ignored
  await page.clock.runFor(160);
  assert.deepEqual(await head(page), { x: 11, y: 10 });
  await page.keyboard.press('w');
  await page.keyboard.press('a'); // second turn in a tick ignored
  await page.clock.runFor(160);
  assert.deepEqual(await head(page), { x: 11, y: 9 });
  await restart.click();
  await steer('up');
  await page.clock.runFor(960); // six cells up
  await steer('right');
  await page.clock.runFor(480); // three right, seeded food at (13,4)
  assert.equal(await page.locator('#score').textContent(), '1');
  await steer('down'); await page.clock.runFor(160);
  assert.deepEqual(await head(page), { x: 13, y: 5 });
  await steer('left'); await page.clock.runFor(160);
  assert.deepEqual(await head(page), { x: 12, y: 5 });
  await pause.click();
  assert.match(await pause.textContent(), /Resume/);
  const frozen = await board.evaluate(canvas => canvas.toDataURL());
  await page.clock.runFor(1600);
  assert.equal(await board.evaluate(canvas => canvas.toDataURL()), frozen);
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => scrollY), scroll, 'Space must not scroll or activate focused pause twice');
  assert.equal(await board.getAttribute('data-status'), 'running');
  await restart.click();
  for (let i = 0; i < 8; i++) await restart.click();
  await page.clock.runFor(160);
  assert.deepEqual(await head(page), { x: 11, y: 10 }, 'Restarts must not multiply the simulation rate');
  await page.clock.runFor(1440);
  assert.equal(await board.getAttribute('data-status'), 'gameover');
  assert.match(await page.locator('#game-status').textContent(), /Game over.*Restart/);
  assert.ok(await pause.isDisabled());
  await restart.click();
  assert.equal(await board.getAttribute('data-status'), 'running');
  assert.equal(await page.locator('#score').textContent(), '0');
  await pause.click(); // stable screenshot
  await restart.focus();
  await page.keyboard.press('Tab');
  assert.notEqual(await page.locator('[data-direction="up"]').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  for (const button of await page.locator('button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'Usable touch target');
  }
}

async function checkPersistence(page) {
  assert.deepEqual(await page.locator('#high-scores li').allTextContents(), ['0']);
  const writes = await page.evaluate(() => window.storageCalls.writes);
  await page.clock.runFor(1600);
  assert.equal(await page.evaluate(() => window.storageCalls.writes), writes, 'Paused games must not be saved');
  await page.locator('#sound').check();
  await page.locator('#difficulty').selectOption('hard');
  await page.locator('#restart').click();
  await page.locator('[data-direction="up"]').click(); await page.clock.runFor(960);
  await page.locator('[data-direction="right"]').click(); await page.clock.runFor(1600);
  assert.equal(await page.locator('#board').getAttribute('data-status'), 'gameover');
  assert.deepEqual(await page.locator('#high-scores li').allTextContents(), ['1', '0']);
  const completedWrites = await page.evaluate(() => window.storageCalls.writes);
  await page.clock.runFor(1600);
  assert.equal(await page.evaluate(() => window.storageCalls.writes), completedWrites, 'Save each completed game exactly once');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  assert.deepEqual(await page.locator('#high-scores li').allTextContents(), ['1', '0']);
  assert.ok(await page.locator('#sound').isChecked());
  assert.equal(await page.locator('#difficulty').inputValue(), 'hard');
  assert.equal(await page.locator('#score').textContent(), '0', 'Reload starts a fresh game, not a snapshot');
  await page.locator('#pause').click();
}

const profile = process.env.SNAKE_FEATURES ?? 'none';
assert.ok(['none', 'all'].includes(profile), 'SNAKE_FEATURES must be none or all');
const modulePath = process.env.PLUTO_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const artifacts = resolve(process.env.PLUTO_QA_ARTIFACT_DIR ?? `artifacts/qa/${profile}`);
await mkdir(artifacts, { recursive: true });
const server = await startServer();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLUTO_BROWSER_CHANNEL ? { channel: process.env.PLUTO_BROWSER_CHANNEL } : {}),
  });
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
    await page.addInitScript(() => {
      window.storageCalls = { reads: 0, writes: 0 };
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (...args) { window.storageCalls.reads++; return get.apply(this, args); };
      Storage.prototype.setItem = function (...args) { window.storageCalls.writes++; return set.apply(this, args); };
    });
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const errors = [];
    const engineRequests = [];
    const replayRequests = [];
    page.on('request', request => {
      if (['/game.mjs', '/challenges.mjs', '/board.mjs'].includes(new URL(request.url()).pathname)) {
        engineRequests.push(request.url());
      }
      if (new URL(request.url()).pathname === '/replay.mjs') replayRequests.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => errors.push(`Request failed: ${request.url()}`));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== server.url) {
        errors.push(`Unexpected network dependency: ${route.request().url()}`);
        return route.abort();
      }
      return route.continue();
    });
    // Check the actual default as well as explicit override and unknown-name safety.
    for (const query of ['', `?features=${profile}`, '?features=unknown']) {
      engineRequests.length = 0;
      replayRequests.length = 0;
      await page.goto(`${server.url}/${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      assert.equal(await page.title(), 'Snake Arcade');
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Small snake.Big ambitions.');
      const enabled = profile === 'all' && query === '?features=all';
      assert.ok(await page.getByRole('heading', { name: 'On the drawing board' }).isVisible());
      assert.ok(!engineRequests.some(url => new URL(url).pathname === '/challenges.mjs'),
        'Challenge API must not be wired into the shell');
      if (enabled) {
        assert.deepEqual(engineRequests.map(url => new URL(url).pathname).sort(),
          ['/board.mjs', '/game.mjs'], 'Enabled gameplay loads the classic engine and topology helper only');
        await checkGameplay(page, name);
        await checkPersistence(page);
      } else {
        assert.ok(await page.getByText('Gameplay is coming soon.', { exact: true }).isVisible());
        assert.equal(await page.locator('button, canvas').count(), 0, 'Disabled mode preserves shell');
        assert.deepEqual(engineRequests, [], 'Disabled shell must not load engine');
        assert.equal(await page.locator('#saved-progress').count(), 0);
        assert.deepEqual(await page.evaluate(() => window.storageCalls), { reads: 0, writes: 0 }, 'Disabled mode never reads or writes storage');
      }
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.features)), resolveFeatures(query === `?features=${profile}` ? profile : undefined));
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.availableFeatures)), resolveFeatures({ gameplay: enabled, savedProgress: enabled }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
      assert.deepEqual(replayRequests, [], 'Replay UI integration remains off, even under all');
      assert.deepEqual(errors, [], `${name}: browser errors`);
      if (query === `?features=${profile}`) {
        const path = join(artifacts, `${name}.png`);
        await page.screenshot({ path, fullPage: true });
        console.log(`Screenshot: ${path}`);
      }
    }
    await page.close();
  }
  // Explicit module opt-in only: no UI, storage, timers or network services needed.
  {
    const page = await browser.newPage();
    await page.goto(`${server.url}/?features=${profile}`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(async () => {
      const replay = await import('./replay.mjs');
      let session = replay.createRecording();
      session = replay.recordDirection(session, 'up');
      for (let i = 0; i < 6; i++) session = replay.stepRecording(session);
      session = replay.recordDirection(session, 'right');
      while (session.state.status === 'running') session = replay.stepRecording(session);
      const raw = replay.finishRecording(session);
      const played = replay.playbackReplay(raw);
      return {
        ok: played.ok,
        identical: JSON.stringify(played.state) === JSON.stringify(session.state),
        score: played.state?.score, status: played.state?.status,
        malformed: replay.playbackReplay('{').code,
        oversized: replay.validateReplay(' '.repeat(replay.MAX_RECORD_LENGTH + 1)).code,
      };
    });
    assert.deepEqual(result, { ok: true, identical: true, score: 1, status: 'gameover', malformed: 'malformed', oversized: 'oversized' });
    await page.close();
  }
  // Exercise the independent module seam: gameplay on, savedProgress off.
  {
    const page = await browser.newPage();
    const storageRequests = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/storage.mjs') storageRequests.push(request.url());
    });
    await page.addInitScript(() => {
      window.storageAccesses = 0;
      Object.defineProperty(window, 'localStorage', { get() {
        window.storageAccesses++; throw Error('Disabled storage must not be accessed');
      } });
    });
    await page.clock.install(); await page.clock.pauseAt(new Date());
    await page.goto(`${server.url}/?features=none`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.evaluate(async () => { const { mountGameplay } = await import('./gameplay.mjs'); mountGameplay(); });
    await checkGameplay(page, 'desktop');
    assert.equal(await page.locator('#saved-progress').count(), 0);
    assert.equal(await page.evaluate(() => window.storageAccesses), 0);
    assert.deepEqual(storageRequests, [], 'Gameplay alone must not import storage');
    await page.close();
  }
  if (profile === 'all') {
    for (const failure of ['corrupt', 'unknown', 'access', 'read', 'write']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(failure => {
        if (failure === 'corrupt' || failure === 'unknown') {
          localStorage.setItem('snake-arcade.progress', failure === 'corrupt' ? '{' : JSON.stringify({ version: 99 }));
        } else if (failure === 'access') {
          Object.defineProperty(window, 'localStorage', { get() { throw Error('blocked'); } });
        } else {
          Storage.prototype[failure === 'read' ? 'getItem' : 'setItem'] = () => { throw Error('blocked'); };
        }
      }, failure);
      await page.clock.install(); await page.clock.pauseAt(new Date());
      await page.goto(`${server.url}/?features=all`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      assert.ok(await page.locator('#scores-empty').isVisible());
      await page.locator('#sound').check();
      await page.clock.runFor(1600);
      assert.equal(await page.locator('#board').getAttribute('data-status'), 'gameover');
      assert.deepEqual(await page.locator('#high-scores li').allTextContents(), ['0']);
      assert.ok(await page.locator('#sound').isChecked());
      await page.locator('#restart').click();
      assert.equal(await page.locator('#board').getAttribute('data-status'), 'running');
      assert.deepEqual(errors, [], `${failure}: gameplay survives storage failure`);
      await page.close();
    }
  }
  console.log(`QA passed (${profile}): desktop + 390px mobile`);
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
