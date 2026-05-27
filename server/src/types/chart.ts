export type ChartDataSource = 'cache' | 'databricks-arrow' | 'mock';
export type ChartDataFormat = 'chart-json' | 'arrow-backend';

export interface ChartRow {
    label: string;
    value: number;
}

export interface ChartDataRequest {
    requestId?: string;
    chartType: 'bar';
    mode: 'chart';
    dimension: string;
    metric: string;
    filters?: {
        dateRange?: [string, string];
        parentDimension?: string;
        parentValue?: string;
        extra?: Record<string, unknown>;
    };
    fields?: {
        dimension?: {
            displayName?: string;
            normalizedName?: string;
            columnId?: string;
            columnType?: string | number;
            dataType?: string | number;
        };
        metric?: {
            displayName?: string;
            normalizedName?: string;
            columnId?: string;
            columnType?: string | number;
            dataType?: string | number;
            aggregationLabel?: string;
        };
    };
    sort?: {
        field: 'value';
        direction: 'asc' | 'desc';
    };
    limit?: number;
    context: {
        tenantId: string;
        userId?: string;
        answerId?: string;
        worksheetId?: string;
        chartId?: string;
        securityContextHash?: string;
        dataVersion?: string;
    };
    resolvedDimension?: {
        requestedDimension: string;
        canonicalDimension: string;
        columnName: string;
    };
    resolvedMetric?: {
        requestedMetric: string;
        canonicalMetric: string;
        columnName: string;
        aggregation: 'SUM' | 'AVG' | 'COUNT';
    };
    returnFormat: 'json';
}

export interface ChartDataTiming {
    totalMs: number;
    cacheLookupMs: number;
    sqlBuildMs: number;
    databricksSubmitMs: number;
    databricksWaitMs: number;
    arrowDownloadMs: number;
    arrowParseMs: number;
    transformMs: number;
    cacheWriteMs: number;
}

export interface ChartDataResponse {
    cacheHit: boolean;
    source: ChartDataSource;
    formatUsed: ChartDataFormat;
    rows: ChartRow[];
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
    timing: ChartDataTiming;
}
