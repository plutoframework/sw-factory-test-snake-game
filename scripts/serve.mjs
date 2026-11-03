import { startServer } from './server.mjs';

const server = await startServer(Number(process.env.PORT ?? 3000));
console.log(`Snake Arcade: ${server.url}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
