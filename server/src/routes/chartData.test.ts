import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createApp } from '../app.js';

describe('chart-data routes', () => {
    it('returns health without exposing secrets', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));

        const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            ok: true,
            service: 'byoc-arrow-backend',
            databricksConfigured: false,
        });
        expect(response.body).not.toContain('token');

        await app.close();
    });

    it('uses mock backend cache miss then hit', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));
        const payload = createPayload();

        const first = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload,
        });
        const second = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload,
        });

        expect(first.statusCode).toBe(200);
        expect(first.json()).toMatchObject({ cacheHit: false, source: 'mock' });
        expect(second.statusCode).toBe(200);
        expect(second.json()).toMatchObject({ cacheHit: true, source: 'cache' });

        const stats = await app.inject({ method: 'GET', url: '/api/v1/byoc/cache/stats' });
        expect(stats.json()).toMatchObject({ provider: 'memory', enabled: true, items: 1 });

        const invalidate = await app.inject({ method: 'POST', url: '/api/v1/byoc/cache/invalidate' });
        expect(invalidate.json()).toMatchObject({ ok: true, invalidated: 'all' });

        await app.close();
    });

    it('returns CONFIG_ERROR when Databricks is missing and mock mode is disabled', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'false' }));

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload: createPayload(),
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toMatchObject({
            error: {
                code: 'CONFIG_ERROR',
                message: 'Databricks configuration is missing.',
            },
        });

        await app.close();
    });
});

function createPayload() {
    return {
        requestId: 'r-1',
        chartType: 'bar',
        mode: 'chart',
        dimension: 'location_name',
        metric: 'revenue',
        filters: { extra: {} },
        sort: { field: 'value', direction: 'desc' },
        limit: 100,
        context: {
            tenantId: 'dev-tenant',
            userId: 'dev-user',
            securityContextHash: 'dev-security',
        },
        returnFormat: 'json',
    };
}
