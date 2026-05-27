import type { ChartModel, CustomChartContext } from '@thoughtspot/ts-chart-sdk';
import type { ByocRuntimeConfig } from '../config';
import { getRawThoughtSpotData } from '../nativeData';
import type { NativeChartData } from '../nativeData';

export type BackendSource = 'cache' | 'databricks-arrow' | 'mock';

export interface BackendChartDataRequest {
    requestId: string;
    chartType: 'bar';
    mode: 'chart';
    dimension: string;
    metric: string;
    filters: {
        extra: {
            nativeDataSignature?: string;
            nativeRowsInput?: number;
            thoughtSpotResultWindowLimit?: number;
            [key: string]: unknown;
        };
    };
    fields: {
        dimension: BackendFieldMetadata;
        metric: BackendFieldMetadata & {
            aggregationLabel?: string;
        };
    };
    sort: {
        field: 'value';
        direction: 'desc';
    };
    limit: number;
    context: {
        tenantId: string;
        userId: string;
        securityContextHash: string;
        answerId?: string;
        worksheetId?: string;
        chartId?: string;
    };
    returnFormat: 'json';
}

export interface BackendChartDataResponse {
    cacheHit: boolean;
    source: BackendSource;
    formatUsed: 'chart-json' | 'arrow-backend';
    rows: Array<{ label: string; value: number }>;
    meta: {
        rowCount: number;
        truncated: boolean;
        cacheKey: string;
        dataVersion?: string;
        requestId: string;
        requestedDimension?: string;
        canonicalDimension?: string;
        resolvedDimension?: {
            columnName: string;
        };
        requestedMetric?: string;
        canonicalMetric?: string;
        resolvedMetric?: {
            columnName: string;
            aggregation: 'SUM' | 'AVG' | 'COUNT';
        };
        fallbackEligible?: boolean;
    };
    timing: {
        totalMs: number;
        cacheLookupMs: number;
        sqlBuildMs: number;
        databricksSubmitMs: number;
        databricksWaitMs: number;
        arrowDownloadMs: number;
        arrowParseMs: number;
        transformMs: number;
        cacheWriteMs: number;
    };
}

export interface BackendRequestContext {
    nativeRowsInput: number;
    effectiveBackendLimit: number;
    nativeDataSignature: string;
    nativeDataSignatureShort: string;
}

export class BackendDataError extends Error {
    code: string;
    requestId: string;
    statusCode: number;

    constructor(code: string, message: string, requestId: string, statusCode = 0) {
        super(message);
        this.name = 'BackendDataError';
        this.code = code;
        this.requestId = requestId;
        this.statusCode = statusCode;
    }
}

export interface BackendFieldMetadata {
    displayName: string;
    normalizedName: string;
    columnId: string;
    columnType: string | number;
    dataType: string | number;
}

export async function fetchBackendChartData(
    request: BackendChartDataRequest,
    config: ByocRuntimeConfig,
    signal: AbortSignal,
): Promise<BackendChartDataResponse> {
    const timeoutController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
        timeoutController.abort();
    }, config.backendTimeoutMs);

    const abortHandler = () => timeoutController.abort();
    signal.addEventListener('abort', abortHandler, { once: true });

    try {
        const response = await fetch(`${config.backendUrl}/api/v1/byoc/chart-data`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
            signal: timeoutController.signal,
        });

        const body = await response.json();
        if (!response.ok || body?.error) {
            throw new BackendDataError(
                String(body?.error?.code || 'BACKEND_ERROR'),
                String(body?.error?.message || 'Backend chart data request failed.'),
                String(body?.error?.requestId || request.requestId),
                response.status,
            );
        }

        return body as BackendChartDataResponse;
    } catch (error: unknown) {
        if (error instanceof BackendDataError) throw error;
        if (timeoutController.signal.aborted) {
            if (signal.aborted) {
                throw new BackendDataError('ABORTED', 'Backend chart data request was aborted.', request.requestId);
            }
            throw new BackendDataError('TIMEOUT', 'Backend chart data request timed out.', request.requestId);
        }
        throw new BackendDataError('BACKEND_ERROR', 'Backend chart data request failed.', request.requestId);
    } finally {
        globalThis.clearTimeout(timeoutId);
        signal.removeEventListener('abort', abortHandler);
    }
}

export function buildBackendRequestFromChartContext(
    ctx: CustomChartContext,
    requestId: string,
    config: ByocRuntimeConfig,
): BackendChartDataRequest {
    const chartModel = ctx.getChartModel();
    const chartConfig = chartModel.config?.chartConfig?.[0];
    const dimensionColumn = chartConfig?.dimensions
        .find((dimension) => dimension.key === 'x')
        ?.columns[0] ?? chartModel.columns[0];
    const metricColumn = chartConfig?.dimensions
        .find((dimension) => dimension.key === 'y')
        ?.columns[0] ?? chartModel.columns[1];
    const requestContext = getBackendRequestContext(chartModel, config);

    return {
        requestId,
        chartType: 'bar',
        mode: 'chart',
        dimension: normalizeBackendFieldName(dimensionColumn?.name || dimensionColumn?.id || 'location_name'),
        metric: normalizeBackendFieldName(metricColumn?.name || metricColumn?.id || 'first_ninety_day_attrition_rate'),
        fields: {
            dimension: buildBackendFieldMetadata(dimensionColumn),
            metric: {
                ...buildBackendFieldMetadata(metricColumn),
                aggregationLabel: metricColumn?.name || metricColumn?.id || '',
            },
        },
        filters: {
            extra: {
                nativeDataSignature: requestContext.nativeDataSignature,
                nativeRowsInput: requestContext.nativeRowsInput,
                thoughtSpotResultWindowLimit: requestContext.effectiveBackendLimit,
            },
        },
        sort: {
            field: 'value',
            direction: 'desc',
        },
        limit: requestContext.effectiveBackendLimit,
        context: {
            tenantId: 'dev-tenant',
            userId: 'dev-user',
            securityContextHash: 'dev-security',
        },
        returnFormat: 'json',
    };
}

export function shouldFallbackToNative(error: BackendDataError): boolean {
    return error.statusCode === 400 ||
        ['BAD_REQUEST', 'FIELD_UNRESOLVED'].includes(error.code) ||
        /Unsupported (metric|dimension)/i.test(error.message);
}

export function normalizeBackendRowsToChartData(
    response: BackendChartDataResponse,
    datasetLabel: string,
    maxRows?: number,
): NativeChartData {
    const rowLimit = maxRows && maxRows > 0 ? maxRows : undefined;
    const rows = response.rows
        .filter((row) => Number.isFinite(Number(row.value)))
        .slice(0, rowLimit);
    return {
        labels: rows.map((row) => String(row.label)),
        values: rows.map((row) => Number(row.value)),
        datasetLabel,
        rowsRendered: rows.length,
        sourceRowCount: rowLimit ? Math.min(response.meta.rowCount, rowLimit) : response.meta.rowCount,
        truncated: response.meta.truncated || rows.length < response.rows.length,
        signature: response.meta.cacheKey,
        rawData: {
            columns: ['label', 'value'],
            dataValue: rows.map((row) => [row.label, row.value]),
        },
    };
}

export function getBackendRequestContext(
    chartModel: ChartModel,
    config: ByocRuntimeConfig,
): BackendRequestContext {
    const nativeRowsInput = getNativeRowsInput(chartModel);
    const effectiveBackendLimit = nativeRowsInput > 0
        ? Math.min(nativeRowsInput, config.maxBars, config.querySize)
        : Math.min(config.maxBars, config.querySize);
    const nativeDataSignature = buildNativeDataSignature(chartModel, nativeRowsInput);

    return {
        nativeRowsInput,
        effectiveBackendLimit,
        nativeDataSignature,
        nativeDataSignatureShort: nativeDataSignature.padEnd(12, '0').slice(0, 12),
    };
}

export function buildNativeDataSignature(chartModel: ChartModel, nativeRowsInput = getNativeRowsInput(chartModel)): string {
    const rawData = getRawThoughtSpotData(chartModel);
    const chartConfig = chartModel.config?.chartConfig?.[0];
    const dimensionColumn = chartConfig?.dimensions.find((dimension) => dimension.key === 'x')?.columns[0];
    const metricColumn = chartConfig?.dimensions.find((dimension) => dimension.key === 'y')?.columns[0];

    const signatureParts = [
        `dimension:${dimensionColumn?.id || dimensionColumn?.name || rawData?.columns[0] || 'unknown'}`,
        `metric:${metricColumn?.id || metricColumn?.name || rawData?.columns[1] || 'unknown'}`,
        `rows:${nativeRowsInput}`,
    ];

    if (rawData) {
        for (const row of rawData.dataValue.slice(0, nativeRowsInput)) {
            signatureParts.push(`${String(row?.[0] ?? '')}\u001f${String(row?.[1] ?? '')}`);
        }
    }

    return hashStrings(signatureParts);
}

function getNativeRowsInput(chartModel: ChartModel): number {
    const rowCount = getRawThoughtSpotData(chartModel)?.dataValue.length;
    return typeof rowCount === 'number' ? rowCount : 0;
}

function buildBackendFieldMetadata(column: { id?: string; name?: string; type?: unknown; dataType?: unknown } | undefined): BackendFieldMetadata {
    const displayName = column?.name || column?.id || '';
    return {
        displayName,
        normalizedName: normalizeBackendFieldName(displayName || column?.id || ''),
        columnId: column?.id || '',
        columnType: String(column?.type ?? ''),
        dataType: String(column?.dataType ?? ''),
    };
}

export function backendPathFromResponse(
    response: BackendChartDataResponse,
): 'backend-cache' | 'backend-databricks-arrow' | 'backend-mock' {
    if (response.cacheHit || response.source === 'cache') return 'backend-cache';
    if (response.source === 'mock') return 'backend-mock';
    return 'backend-databricks-arrow';
}

function normalizeBackendFieldName(value: string): string {
    return value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function hashStrings(parts: string[]): string {
    let hash = 2166136261;
    for (const part of parts) {
        for (let index = 0; index < part.length; index += 1) {
            hash ^= part.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        hash ^= 31;
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
