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
    };
    timing: ChartDataTiming;
}
