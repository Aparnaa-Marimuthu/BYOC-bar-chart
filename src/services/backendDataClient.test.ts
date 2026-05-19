import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    backendPathFromResponse,
    fetchBackendChartData,
    normalizeBackendRowsToChartData,
} from './backendDataClient';
import type { BackendChartDataRequest, BackendChartDataResponse } from './backendDataClient';
import { getByocRuntimeConfig } from '../config';

describe('backend data client', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches backend chart data successfully', async () => {
        const response = createResponse(false, 'mock');
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

        await expect(
            fetchBackendChartData(
                createRequest(),
                getByocRuntimeConfig({ VITE_BYOC_BACKEND_URL: 'http://localhost:8787' }),
                new AbortController().signal,
            ),
        ).resolves.toMatchObject({ source: 'mock', cacheHit: false });
    });

    it('throws a safe backend error response', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: { code: 'CONFIG_ERROR', message: 'Databricks configuration is missing.', requestId: 'r-1' },
                }),
                { status: 500 },
            ),
        );

        await expect(
            fetchBackendChartData(createRequest(), getByocRuntimeConfig({}), new AbortController().signal),
        ).rejects.toMatchObject({ code: 'CONFIG_ERROR', requestId: 'r-1' });
    });

    it('returns an aborted error when the caller aborts', async () => {
        vi.mocked(fetch).mockImplementation((_input, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            }),
        );
        const controller = new AbortController();
        const pending = fetchBackendChartData(createRequest(), getByocRuntimeConfig({}), controller.signal);

        controller.abort();

        await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    });

    it('normalizes backend rows for the chart renderer', () => {
        const chartData = normalizeBackendRowsToChartData(createResponse(true, 'cache'), 'revenue');

        expect(chartData.labels).toEqual(['A']);
        expect(chartData.values).toEqual([12.34]);
        expect(chartData.datasetLabel).toBe('revenue');
        expect(chartData.rowsRendered).toBe(1);
    });

    it('maps backend response source to perf path', () => {
        expect(backendPathFromResponse(createResponse(true, 'cache'))).toBe('backend-cache');
        expect(backendPathFromResponse(createResponse(false, 'mock'))).toBe('backend-mock');
        expect(backendPathFromResponse(createResponse(false, 'databricks-arrow'))).toBe('backend-databricks-arrow');
    });
});

function createRequest(): BackendChartDataRequest {
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

function createResponse(cacheHit: boolean, source: BackendChartDataResponse['source']): BackendChartDataResponse {
    return {
        cacheHit,
        source,
        formatUsed: source === 'databricks-arrow' ? 'arrow-backend' : 'chart-json',
        rows: [{ label: 'A', value: 12.34 }],
        meta: {
            rowCount: 1,
            truncated: false,
            cacheKey: 'cache-key',
            requestId: 'r-1',
        },
        timing: {
            totalMs: 1,
            cacheLookupMs: 1,
            sqlBuildMs: 0,
            databricksSubmitMs: 0,
            databricksWaitMs: 0,
            arrowDownloadMs: 0,
            arrowParseMs: 0,
            transformMs: 0,
            cacheWriteMs: 0,
        },
    };
}
