import { config } from './config.js';
import { createApp } from './app.js';

const app = await createApp();

await app.listen({ port: config.port, host: '0.0.0.0' });

console.info('[BYOC:backend:init]', {
    port: config.port,
    cacheProvider: config.cacheProvider,
    mockBackend: config.useMockBackend,
});
