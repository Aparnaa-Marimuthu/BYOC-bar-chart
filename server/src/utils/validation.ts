import type { BackendConfig } from '../config.js';
import type { ChartDataRequest } from '../types/chart.js';
import { ApiError } from '../types/errors.js';

export function validateChartDataRequest(
    body: unknown,
    config: BackendConfig,
): ChartDataRequest {
    if (!body || typeof body !== 'object') {
        throw new ApiError('BAD_REQUEST', 'Request body must be a JSON object.', 400);
    }

    const request = body as Partial<ChartDataRequest>;
    if (request.chartType !== 'bar') {
        throw new ApiError('BAD_REQUEST', 'Only bar charts are supported.', 400);
    }
    if (request.mode !== 'chart') {
        throw new ApiError('BAD_REQUEST', 'Only chart mode is supported.', 400);
    }
    if (request.returnFormat !== 'json') {
        throw new ApiError('BAD_REQUEST', 'Only JSON responses are supported.', 400);
    }
    if (!request.dimension || !config.allowedDimensions.includes(request.dimension)) {
        throw new ApiError('BAD_REQUEST', 'Unsupported dimension.', 400);
    }
    if (!request.metric || !config.allowedMetrics.includes(request.metric)) {
        throw new ApiError('BAD_REQUEST', 'Unsupported metric.', 400);
    }
    if (!request.context?.tenantId || (!request.context.userId && !request.context.securityContextHash)) {
        throw new ApiError('BAD_REQUEST', 'Tenant and user or security context are required.', 400);
    }
    if (request.filters !== undefined && (!request.filters || typeof request.filters !== 'object')) {
        throw new ApiError('BAD_REQUEST', 'Filters must be an object.', 400);
    }

    const filters = request.filters ?? {};
    if (filters.dateRange) {
        const [startDate, endDate] = filters.dateRange;
        if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
            throw new ApiError('BAD_REQUEST', 'dateRange values must be ISO dates.', 400);
        }
    }
    if (filters.parentDimension && !config.allowedDimensions.includes(filters.parentDimension)) {
        throw new ApiError('BAD_REQUEST', 'Unsupported parent dimension.', 400);
    }

    if (request.sort && (request.sort.field !== 'value' || !['asc', 'desc'].includes(request.sort.direction))) {
        throw new ApiError('BAD_REQUEST', 'Sort must use value with asc or desc direction.', 400);
    }

    const limit = clampLimit(request.limit);

    return {
        requestId: typeof request.requestId === 'string' ? request.requestId : undefined,
        chartType: 'bar',
        mode: 'chart',
        dimension: request.dimension,
        metric: request.metric,
        filters,
        sort: request.sort ?? { field: 'value', direction: 'desc' },
        limit,
        context: request.context,
        returnFormat: 'json',
    };
}

export function clampLimit(limit: unknown): number {
    const parsedLimit = Number.parseInt(String(limit ?? '100'), 10);
    if (!Number.isFinite(parsedLimit)) return 100;
    return Math.min(Math.max(parsedLimit, 1), 1000);
}

function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
