import type { BackendConfig } from '../config.js';

export type MetricAggregation = 'SUM' | 'AVG' | 'COUNT';

export interface RequestFieldMetadata {
    displayName?: string;
    normalizedName?: string;
    columnId?: string;
    columnType?: string | number;
    dataType?: string | number;
    aggregationLabel?: string;
}

export interface RequestFieldMetadataSet {
    dimension?: RequestFieldMetadata;
    metric?: RequestFieldMetadata;
}

export interface ResolvedDimension {
    requestedDimension: string;
    canonicalDimension: string;
    columnName: string;
}

export interface ResolvedMetric {
    requestedMetric: string;
    canonicalMetric: string;
    columnName: string;
    aggregation: MetricAggregation;
}

export function resolveDimension(
    dimension: unknown,
    config: BackendConfig,
    field?: RequestFieldMetadata,
): ResolvedDimension | null {
    const requestedDimension = normalizeFieldName(
        field?.normalizedName || dimension || field?.displayName || field?.columnId,
    );
    if (!isSafeFieldName(requestedDimension)) return null;

    const columnName = resolveAllowedFieldName(
        [requestedDimension, field?.columnId, field?.displayName],
        config.allowedDimensions,
    );
    if (!columnName) return null;

    return {
        requestedDimension,
        canonicalDimension: columnName,
        columnName,
    };
}

export function resolveMetric(
    metric: unknown,
    config: BackendConfig,
    field?: RequestFieldMetadata,
): ResolvedMetric | null {
    const requestedMetric = normalizeFieldName(
        field?.normalizedName || metric || field?.displayName || field?.columnId,
    );
    if (!isSafeFieldName(requestedMetric)) return null;

    const parsedMetric = parseMetricName(requestedMetric);
    const columnName = resolveAllowedFieldName(
        getMetricCandidateNames(parsedMetric.baseName, requestedMetric, field),
        config.allowedMetrics,
    );
    if (!columnName) return null;

    return {
        requestedMetric,
        canonicalMetric: getCanonicalMetric(columnName, parsedMetric.aggregation),
        columnName,
        aggregation: parsedMetric.aggregation,
    };
}

export function normalizeFieldName(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value)
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

export function isSafeFieldName(value: string): boolean {
    return /^[a-z][a-z0-9_]{0,127}$/.test(value);
}

function parseMetricName(metric: string): { baseName: string; aggregation: MetricAggregation } {
    if (metric.startsWith('count_distinct_')) {
        return { baseName: metric.slice('count_distinct_'.length), aggregation: 'COUNT' };
    }
    if (metric.startsWith('count_')) {
        return { baseName: metric.slice('count_'.length), aggregation: 'COUNT' };
    }
    if (metric.startsWith('average_')) {
        return { baseName: metric.slice('average_'.length), aggregation: 'AVG' };
    }
    if (metric.startsWith('avg_')) {
        return { baseName: metric.slice('avg_'.length), aggregation: 'AVG' };
    }
    if (metric.startsWith('total_')) {
        return { baseName: metric.slice('total_'.length), aggregation: 'SUM' };
    }
    if (metric.startsWith('sum_')) {
        return { baseName: metric.slice('sum_'.length), aggregation: 'SUM' };
    }

    return {
        baseName: metric,
        aggregation: inferDefaultAggregation(metric),
    };
}

function inferDefaultAggregation(metric: string): MetricAggregation {
    if (metric.endsWith('_pct') || metric.endsWith('_rate')) return 'AVG';
    if (metric.endsWith('_id') || metric.endsWith('_count')) return 'COUNT';
    return 'SUM';
}

function resolveAllowedFieldName(
    candidates: Array<unknown>,
    allowedFields: string[],
): string | null {
    const allowedFieldNames = new Set(
        allowedFields
            .map((field) => normalizeFieldName(field))
            .filter(isSafeFieldName),
    );

    for (const candidate of candidates) {
        const fieldName = normalizeFieldName(candidate);
        if (allowedFieldNames.has(fieldName)) {
            return fieldName;
        }
    }

    return null;
}

function getMetricCandidateNames(
    baseName: string,
    requestedMetric: string,
    field?: RequestFieldMetadata,
): Array<unknown> {
    const candidates: Array<unknown> = [
        baseName,
        requestedMetric,
        field?.columnId,
        field?.displayName,
    ];

    if (['order_count', 'transaction_count', 'count_transaction'].includes(requestedMetric)) {
        candidates.push('txn_id');
    }
    if (['sales', 'total_sales'].includes(requestedMetric)) {
        candidates.push('revenue');
    }

    return candidates;
}

function getCanonicalMetric(columnName: string, aggregation: MetricAggregation): string {
    if (aggregation === 'COUNT') return `${columnName}_count`;
    return columnName;
}
