import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    buildBackendRequestFromChartContext,
    buildNativeDataSignature,
    backendPathFromResponse,
    fetchBackendChartData,
    getBackendRequestContext,
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

        expect(chartData.labels).toEqual(['A-0']);
        expect(chartData.values).toEqual([12.34]);
        expect(chartData.datasetLabel).toBe('revenue');
        expect(chartData.rowsRendered).toBe(1);
    });

    it('uses native row count as backend limit for filtered ThoughtSpot windows', () => {
        const config = getByocRuntimeConfig({
            VITE_BYOC_QUERY_SIZE: '1000',
            VITE_BYOC_MAX_BARS: '1000',
        });
        const ctx = createContextWithRows(5);
        const request = buildBackendRequestFromChartContext(ctx, 'r-top-5', config);

        expect(request.limit).toBe(5);
        expect(request.filters.extra.nativeRowsInput).toBe(5);
        expect(request.filters.extra.thoughtSpotResultWindowLimit).toBe(5);
        expect(typeof request.filters.extra.nativeDataSignature).toBe('string');
    });

    it('changes native signature when visible rows change', () => {
        const first = createContextWithRows(5).getChartModel();
        const second = createContextWithRows(5, 'changed-label').getChartModel();

        expect(buildNativeDataSignature(first)).not.toBe(buildNativeDataSignature(second));
    });

    it('clamps backend response rows to native row count', () => {
        const response = createResponse(false, 'mock', 12);
        const chartData = normalizeBackendRowsToChartData(response, 'revenue', 5);

        expect(chartData.rowsRendered).toBe(5);
        expect(chartData.sourceRowCount).toBe(5);
        expect(chartData.truncated).toBe(true);
        expect(chartData.labels).toHaveLength(5);
    });

    it('exposes flat backend request context fields', () => {
        const context = getBackendRequestContext(createContextWithRows(5).getChartModel(), getByocRuntimeConfig({}));

        expect(context).toMatchObject({
            nativeRowsInput: 5,
            effectiveBackendLimit: 5,
        });
        expect(context.nativeDataSignatureShort).toHaveLength(12);
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

function createResponse(
    cacheHit: boolean,
    source: BackendChartDataResponse['source'],
    rowCount = 1,
): BackendChartDataResponse {
    return {
        cacheHit,
        source,
        formatUsed: source === 'databricks-arrow' ? 'arrow-backend' : 'chart-json',
        rows: Array.from({ length: rowCount }, (_value, index) => ({
            label: `A-${index}`,
            value: 12.34 + index,
        })),
        meta: {
            rowCount,
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

function createContextWithRows(rowCount: number, firstLabel = 'label-0') {
    const labels = Array.from({ length: rowCount }, (_value, index) =>
        index === 0 ? firstLabel : `label-${index}`,
    );
    return {
        getChartModel: () => ({
            columns: [
                { id: 'location_name', name: 'location_name', type: 'ATTRIBUTE' },
                { id: 'revenue', name: 'revenue', type: 'MEASURE' },
            ],
            config: {
                chartConfig: [
                    {
                        dimensions: [
                            { key: 'x', columns: [{ id: 'location_name', name: 'location_name' }] },
                            { key: 'y', columns: [{ id: 'revenue', name: 'revenue' }] },
                        ],
                    },
                ],
            },
            data: [
                {
                    data: {
                        columns: ['location_name', 'revenue'],
                        dataValue: labels.map((label, index) => [label, index + 1]),
                    },
                },
            ],
        }),
    } as any;
}
