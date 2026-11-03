import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/server.mjs';

test('static server serves ES modules and only public assets; closes cleanly', async () => {
  const server = await startServer();
  try {
    for (const [path, type] of [['/', 'text/html'], ['/styles.css', 'text/css'], ['/app.mjs', 'text/javascript'], ['/features.mjs', 'text/javascript'], ['/game.mjs', 'text/javascript'], ['/controller.mjs', 'text/javascript'], ['/gameplay.mjs', 'text/javascript']]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(type));
      assert.ok((await response.text()).length > 0);
    }
    for (const path of ['/package.json', '/scripts/qa.mjs', '/.git/config', '/storage.mjs']) {
      assert.equal((await fetch(`${server.url}${path}`)).status, 404);
    }
    assert.equal((await fetch(server.url, { method: 'POST' })).status, 405);
    const head = await fetch(server.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await server.close();
  }
  await assert.rejects(fetch(server.url));
});
