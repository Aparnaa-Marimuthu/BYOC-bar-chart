import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServerlessApp } from './serverlessApp.js';

describe('Vercel serverless entrypoint', () => {
    it('imports and serves routes without app.listen', async () => {
        const app = await getServerlessApp();

        const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            ok: true,
            service: 'byoc-arrow-backend',
        });
    });

    it('keeps the Vercel catch-all function in server/api', () => {
        const serverRoot = dirname(dirname(fileURLToPath(import.meta.url)));
        expect(existsSync(join(serverRoot, 'api', '[...path].ts'))).toBe(true);
    });
});
