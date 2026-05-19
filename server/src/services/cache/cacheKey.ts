import type { ChartDataRequest } from '../../types/chart.js';
import { sha256 } from '../../utils/hash.js';
import { normalizeJson } from '../../utils/safeJson.js';

export const QUERY_VERSION = 'byoc-chart-v1';

export function buildCacheKey(request: ChartDataRequest): string {
    const payload = {
        queryVersion: QUERY_VERSION,
        dataVersion: request.context.dataVersion ?? null,
        tenantId: request.context.tenantId,
        securityContext: request.context.securityContextHash || request.context.userId,
        chartType: request.chartType,
        dimension: request.dimension,
        metric: request.metric,
        filters: request.filters ?? {},
        sort: request.sort ?? {},
        limit: request.limit ?? 100,
        returnFormat: request.returnFormat,
    };

    return sha256(normalizeJson(payload));
}
