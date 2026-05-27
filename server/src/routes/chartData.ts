import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { BackendConfig } from '../config.js';
import { isDatabricksConfigured } from '../config.js';
import { buildCacheKey } from '../services/cache/cacheKey.js';
import type { CacheProvider } from '../services/cache/cacheProvider.js';
import { parseArrowChunksToRows } from '../services/arrow/arrowParser.js';
import { executeDatabricksArrowQuery } from '../services/databricks/databricksClient.js';
import { buildChartSql } from '../services/databricks/sqlBuilder.js';
import { createTiming, elapsedMs, nowMs } from '../services/metrics/timings.js';
import type { ChartDataRequest, ChartDataResponse, ChartRow } from '../types/chart.js';
import { ApiError } from '../types/errors.js';
import { validateChartDataRequest } from '../utils/validation.js';

export async function registerChartDataRoute(
    app: FastifyInstance,
    config: BackendConfig,
    cache: CacheProvider<ChartDataResponse>,
): Promise<void> {
    app.post('/api/v1/byoc/chart-data', async (request) => {
        const totalStartMs = nowMs();
        const timing = createTiming();
        const validatedRequest = validateChartDataRequest(request.body, config);
        const headerRequestId = request.headers['x-request-id'];
        const requestId = validatedRequest.requestId ||
            (typeof headerRequestId === 'string' ? headerRequestId : undefined) ||
            randomUUID();
        const cacheKey = buildCacheKey(validatedRequest);

        const cacheLookupStartMs = nowMs();
        const cachedResponse = config.cacheEnabled ? await cache.get(cacheKey) : null;
        timing.cacheLookupMs = elapsedMs(cacheLookupStartMs);

        if (cachedResponse) {
            return {
                ...cachedResponse,
                cacheHit: true,
                source: 'cache',
                meta: {
                    ...cachedResponse.meta,
                    requestId,
                    cacheKey,
                },
                timing: {
                    ...cachedResponse.timing,
                    cacheLookupMs: timing.cacheLookupMs,
                    totalMs: elapsedMs(totalStartMs),
                },
            } satisfies ChartDataResponse;
        }

        let rows: ChartRow[];
        let source: ChartDataResponse['source'];
        let formatUsed: ChartDataResponse['formatUsed'];

        if (config.useMockBackend) {
            const transformStartMs = nowMs();
            rows = createMockRows(validatedRequest);
            timing.transformMs = elapsedMs(transformStartMs);
            source = 'mock';
            formatUsed = 'chart-json';
        } else {
            if (!validatedRequest.resolvedDimension || !validatedRequest.resolvedMetric) {
                throw new ApiError(
                    'FIELD_UNRESOLVED',
                    'Backend could not safely resolve the selected fields.',
                    400,
                );
            }
            if (!isDatabricksConfigured(config)) {
                throw new ApiError('CONFIG_ERROR', 'Databricks configuration is missing.', 500);
            }
            const sqlBuildStartMs = nowMs();
            const sql = buildChartSql(validatedRequest, config);
            timing.sqlBuildMs = elapsedMs(sqlBuildStartMs);
            const databricksResult = await executeDatabricksArrowQuery(sql, config, requestId);
            timing.databricksSubmitMs = databricksResult.databricksSubmitMs;
            timing.databricksWaitMs = databricksResult.databricksWaitMs;
            timing.arrowDownloadMs = databricksResult.arrowDownloadMs;
            const arrowParseStartMs = nowMs();
            rows = parseArrowChunksToRows(databricksResult.arrowChunks, validatedRequest.limit ?? 100);
            timing.arrowParseMs = elapsedMs(arrowParseStartMs);
            source = 'databricks-arrow';
            formatUsed = 'arrow-backend';
        }

        const response: ChartDataResponse = {
            cacheHit: false,
            source,
            formatUsed,
            rows,
            meta: {
                rowCount: rows.length,
                truncated: rows.length >= (validatedRequest.limit ?? 100),
                cacheKey,
                dataVersion: validatedRequest.context.dataVersion,
                requestId,
                requestedDimension: validatedRequest.dimension,
                canonicalDimension: validatedRequest.resolvedDimension?.canonicalDimension,
                resolvedDimension: validatedRequest.resolvedDimension
                    ? {
                          columnName: validatedRequest.resolvedDimension.columnName,
                      }
                    : undefined,
                requestedMetric: validatedRequest.metric,
                canonicalMetric: validatedRequest.resolvedMetric?.canonicalMetric,
                resolvedMetric: validatedRequest.resolvedMetric
                    ? {
                          columnName: validatedRequest.resolvedMetric.columnName,
                          aggregation: validatedRequest.resolvedMetric.aggregation,
                      }
                    : undefined,
                fallbackEligible: !config.useMockBackend &&
                    (!validatedRequest.resolvedDimension || !validatedRequest.resolvedMetric),
            },
            timing: {
                ...timing,
                totalMs: 0,
            },
        };

        if (config.cacheEnabled) {
            const cacheWriteStartMs = nowMs();
            await cache.set(cacheKey, response, config.cacheTtlSeconds);
            response.timing.cacheWriteMs = elapsedMs(cacheWriteStartMs);
        }
        response.timing.totalMs = elapsedMs(totalStartMs);
        return response;
    });
}

function createMockRows(request: ChartDataRequest): ChartRow[] {
    const limit = request.limit ?? 100;
    const seed = `${request.dimension}:${request.metric}:${JSON.stringify(request.filters ?? {})}`;
    const baseValue = Array.from(seed).reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const labelPrefix = request.fields?.dimension?.displayName || request.dimension;

    return Array.from({ length: limit }, (_, index) => ({
        label: `${labelPrefix}-${index + 1}`,
        value: Math.round((baseValue + index * 37) * 100) / 100,
    }));
}
