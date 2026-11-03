import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './server.mjs';
import { resolveFeatures } from '../features.mjs';

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
    const page = await browser.newPage({ viewport });
    const errors = [];
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
      await page.goto(`${server.url}/${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      assert.equal(await page.title(), 'Snake Arcade');
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Small snake.Big ambitions.');
      assert.ok(await page.getByText('Gameplay is coming soon.', { exact: true }).isVisible());
      assert.ok(await page.getByRole('heading', { name: 'On the drawing board' }).isVisible());
      assert.equal(await page.locator('button, canvas').count(), 0, 'No gameplay UI yet');
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.features)), resolveFeatures(query === `?features=${profile}` ? profile : undefined));
      assert.deepEqual(await page.evaluate(() => JSON.parse(document.documentElement.dataset.availableFeatures)), resolveFeatures());
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
