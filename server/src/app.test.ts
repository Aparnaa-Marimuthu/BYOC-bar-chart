import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

describe('createApp', () => {
    it('builds the Fastify app without listening', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));

        const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true });

        await app.close();
    });
});
