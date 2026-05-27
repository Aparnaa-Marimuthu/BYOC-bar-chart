import { describe, expect, it } from 'vitest';
import { buildCacheKey, QUERY_VERSION } from './cacheKey.js';
import type { ChartDataRequest } from '../../types/chart.js';

describe('cache key', () => {
    it('is stable and opaque', () => {
        const key = buildCacheKey(createRequest());

        expect(key).toBe(buildCacheKey(createRequest()));
        expect(key).toMatch(/^[a-f0-9]{64}$/);
        expect(key).not.toContain('dev-user');
        expect(QUERY_VERSION).toBe('byoc-chart-v1');
    });

    it('changes for filters and security context', () => {
        const base = createRequest();
        const changedFilter = createRequest({ filters: { dateRange: ['2026-01-01', '2026-12-31'], extra: {} } });
        const changedUser = createRequest({
            context: { ...base.context, userId: 'another-user', securityContextHash: 'another-security' },
        });

        expect(buildCacheKey(base)).not.toBe(buildCacheKey(changedFilter));
        expect(buildCacheKey(base)).not.toBe(buildCacheKey(changedUser));
    });

    it('changes when native ThoughtSpot result signature changes', () => {
        const first = createRequest({
            filters: {
                extra: {
                    nativeRowsInput: 5,
                    nativeDataSignature: 'signature-a',
                    thoughtSpotResultWindowLimit: 5,
                },
            },
            limit: 5,
        });
        const second = createRequest({
            filters: {
                extra: {
                    nativeRowsInput: 5,
                    nativeDataSignature: 'signature-b',
                    thoughtSpotResultWindowLimit: 5,
                },
            },
            limit: 5,
        });

        expect(buildCacheKey(first)).not.toBe(buildCacheKey(second));
    });

    it('keeps requested metric aliases distinct while resolving the canonical metric', () => {
        expect(buildCacheKey(createRequest({ metric: 'revenue' }))).not.toBe(
            buildCacheKey(createRequest({ metric: 'total_revenue' })),
        );
        expect(buildCacheKey(createRequest({ metric: 'total_revenue' }))).not.toBe(
            buildCacheKey(createRequest({ metric: 'sum_revenue' })),
        );
    });
});

function createRequest(overrides: Partial<ChartDataRequest> = {}): ChartDataRequest {
    return {
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
            dataVersion: 'v1',
        },
        returnFormat: 'json',
        ...overrides,
    };
}
