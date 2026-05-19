import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServerlessApp } from './serverlessApp.js';
import { injectVercelRequest } from '../api/_handler.js';

describe('Vercel serverless entrypoint', () => {
    beforeAll(() => {
        vi.stubEnv('BYOC_USE_MOCK_BACKEND', 'true');
    });

    it('imports and serves routes without app.listen', async () => {
        const app = await getServerlessApp();

        const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            ok: true,
            service: 'byoc-arrow-backend',
        });
    });

    it('keeps explicit Vercel API route files in server/api', () => {
        const serverRoot = dirname(dirname(fileURLToPath(import.meta.url)));
        expect(existsSync(join(serverRoot, 'api', 'v1', 'health.ts'))).toBe(true);
        expect(existsSync(join(serverRoot, 'api', 'v1', 'byoc', 'chart-data.ts'))).toBe(true);
        expect(existsSync(join(serverRoot, 'api', 'v1', 'byoc', 'cache', 'stats.ts'))).toBe(true);
        expect(existsSync(join(serverRoot, 'api', 'v1', 'byoc', 'cache', 'invalidate.ts'))).toBe(true);
    });

    it('serves health through the shared Vercel handler', async () => {
        const response = await injectVercelRequest({
            method: 'GET',
            url: '/api/v1/health',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            ok: true,
            service: 'byoc-arrow-backend',
        });
    });

    it('serves mock chart-data through the shared Vercel handler', async () => {
        const response = await injectVercelRequest({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                requestId: 'vercel-handler-test',
                chartType: 'bar',
                mode: 'chart',
                dimension: 'location_name',
                metric: 'order_count',
                filters: {},
                sort: { field: 'value', direction: 'desc' },
                limit: 100,
                context: {
                    tenantId: 'dev-tenant',
                    userId: 'dev-user',
                    securityContextHash: 'dev-security',
                },
                returnFormat: 'json',
            }),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            cacheHit: false,
            source: 'mock',
            meta: {
                requestId: 'vercel-handler-test',
            },
        });
    });
});
