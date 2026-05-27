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

    it('respects request limit in mock mode', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload: createPayload({ limit: 5 }),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            cacheHit: false,
            source: 'mock',
            meta: {
                rowCount: 5,
            },
        });
        expect(response.json().rows).toHaveLength(5);

        await app.close();
    });

    it('accepts metric aliases in mock mode', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload: createPayload({
                dimension: 'product_category',
                metric: 'total_revenue',
                limit: 7,
            }),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            cacheHit: false,
            source: 'mock',
            meta: {
                requestedMetric: 'total_revenue',
                canonicalMetric: 'revenue',
                resolvedMetric: {
                    columnName: 'revenue',
                    aggregation: 'SUM',
                },
            },
        });
        expect(response.json().rows).toHaveLength(7);

        await app.close();
    });

    it('accepts unknown but safe metric names in mock mode', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'true' }));

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload: createPayload({ metric: 'new_model_measure', limit: 3 }),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            cacheHit: false,
            source: 'mock',
            meta: {
                requestedDimension: 'location_name',
                requestedMetric: 'new_model_measure',
            },
        });
        expect(response.json().meta).not.toHaveProperty('canonicalMetric');
        expect(response.json().rows).toHaveLength(3);

        await app.close();
    });

    it('returns FIELD_UNRESOLVED for unresolved Databricks fields', async () => {
        const app = await createApp(loadConfig({ BYOC_USE_MOCK_BACKEND: 'false' }));

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/byoc/chart-data',
            payload: createPayload({ metric: 'new_model_measure' }),
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: {
                code: 'FIELD_UNRESOLVED',
                message: 'Backend could not safely resolve the selected fields.',
            },
        });

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

function createPayload(overrides: Record<string, unknown> = {}) {
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
        ...overrides,
    };
}
