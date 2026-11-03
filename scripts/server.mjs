import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/features.mjs', ['features.mjs', 'text/javascript; charset=utf-8']],
  ...['game.mjs', 'board.mjs', 'controller.mjs', 'gameplay.mjs', 'storage.mjs'].map(file => [`/${file}`, [file, 'text/javascript; charset=utf-8']]),
]);

/** A local static server with an explicit public-file allowlist. */
export async function startServer(port = 0) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = files.get(pathname);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(fileURLToPath(new URL(file[0], root)));
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500).end('Unable to read static asset');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
