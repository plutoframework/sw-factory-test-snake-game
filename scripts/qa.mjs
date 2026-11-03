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
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const errors = [];
    const engineRequests = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/game.mjs') engineRequests.push(request.url());
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
      await page.goto(`${server.url}/${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      assert.equal(await page.title(), 'Snake Arcade');
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Small snake.Big ambitions.');
      const enabled = profile === 'all' && query === '?features=all';
      assert.ok(await page.getByRole('heading', { name: 'On the drawing board' }).isVisible());
      if (enabled) {
        assert.equal(engineRequests.length, 1, 'Enabled gameplay loads the existing engine');
        await checkGameplay(page, name);
      } else {
        assert.ok(await page.getByText('Gameplay is coming soon.', { exact: true }).isVisible());
        assert.equal(await page.locator('button, canvas').count(), 0, 'Disabled mode preserves shell');
        assert.deepEqual(engineRequests, [], 'Disabled shell must not load engine');
      }
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.features)), resolveFeatures(query === `?features=${profile}` ? profile : undefined));
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.availableFeatures)), resolveFeatures({ gameplay: enabled }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
      assert.deepEqual(errors, [], `${name}: browser errors`);
      if (query === `?features=${profile}`) {
        const path = join(artifacts, `${name}.png`);
        await page.screenshot({ path, fullPage: true });
        console.log(`Screenshot: ${path}`);
      }
    }
    await page.close();
  }
  console.log(`QA passed (${profile}): desktop + 390px mobile`);
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
