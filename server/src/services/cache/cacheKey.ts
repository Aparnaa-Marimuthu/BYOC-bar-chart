import type { ChartDataRequest } from '../../types/chart.js';
import { sha256 } from '../../utils/hash.js';
import { normalizeJson } from '../../utils/safeJson.js';

export const QUERY_VERSION = 'byoc-chart-v1';

export function buildCacheKey(request: ChartDataRequest): string {
    const resolvedDimension = request.resolvedDimension;
    const resolvedMetric = request.resolvedMetric;
    const payload = {
        queryVersion: QUERY_VERSION,
        dataVersion: request.context.dataVersion ?? null,
        tenantId: request.context.tenantId,
        securityContext: request.context.securityContextHash || request.context.userId,
        chartType: request.chartType,
        dimension: request.dimension,
        requestedDimension: request.dimension,
        resolvedDimension: resolvedDimension?.columnName ?? null,
        metric: resolvedMetric?.canonicalMetric ?? request.metric,
        requestedMetric: resolvedMetric?.requestedMetric ?? request.metric,
        canonicalMetric: resolvedMetric?.canonicalMetric ?? null,
        resolvedMetric: resolvedMetric?.columnName ?? null,
        aggregation: resolvedMetric?.aggregation ?? null,
        filters: request.filters ?? {},
        sort: request.sort ?? {},
        limit: request.limit ?? 100,
        returnFormat: request.returnFormat,
    };

    return sha256(normalizeJson(payload));
}
