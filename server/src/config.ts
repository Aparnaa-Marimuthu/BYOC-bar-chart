export interface BackendConfig {
    port: number;
    nodeEnv: string;
    debug: boolean;
    useMockBackend: boolean;
    cacheEnabled: boolean;
    cacheProvider: 'memory' | 'redis';
    cacheTtlSeconds: number;
    cacheMaxItems: number;
    requestTimeoutMs: number;
    allowedOrigins: string[];
    allowedDimensions: string[];
    allowedMetrics: string[];
    rateLimitEnabled: boolean;
    rateLimitMax: number;
    rateLimitWindowMs: number;
    databricks: {
        host: string;
        token: string;
        warehouseId: string;
        catalog: string;
        schema: string;
        table: string;
        waitTimeout: string;
        pollIntervalMs: number;
        maxWaitMs: number;
    };
    arrowDownloadConcurrency: number;
    authMode: 'dev';
    devApiKey: string;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): BackendConfig {
    return {
        port: parseInteger(env.PORT, 8787, 1, 65535),
        nodeEnv: env.NODE_ENV || 'development',
        debug: parseBoolean(env.BYOC_BACKEND_DEBUG, true),
        useMockBackend: parseBoolean(env.BYOC_USE_MOCK_BACKEND, false),
        cacheEnabled: parseBoolean(env.BYOC_CACHE_ENABLED, true),
        cacheProvider: parseCacheProvider(env.BYOC_CACHE_PROVIDER),
        cacheTtlSeconds: parseInteger(env.BYOC_CACHE_TTL_SECONDS, 300, 1, 86_400),
        cacheMaxItems: parseInteger(env.BYOC_CACHE_MAX_ITEMS, 500, 1, 100_000),
        requestTimeoutMs: parseInteger(env.BYOC_REQUEST_TIMEOUT_MS, 60_000, 1_000, 300_000),
        allowedOrigins: parseList(env.BYOC_ALLOWED_ORIGINS, ['http://localhost:5173']),
        allowedDimensions: parseList(env.BYOC_ALLOWED_DIMENSIONS, [
            'product_category',
            'product_name',
            'region',
            'channel',
            'location_name',
            'base',
        ]),
        allowedMetrics: parseList(env.BYOC_ALLOWED_METRICS, [
            'revenue',
            'units_sold',
            'order_count',
            'first_ninety_day_attrition_rate',
            'average_turn_time',
            'average_turnaround_time_min',
        ]),
        rateLimitEnabled: parseBoolean(env.BYOC_RATE_LIMIT_ENABLED, false),
        rateLimitMax: parseInteger(env.BYOC_RATE_LIMIT_MAX, 120, 1, 10_000),
        rateLimitWindowMs: parseInteger(env.BYOC_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
        databricks: {
            host: trimTrailingSlash(env.DATABRICKS_HOST || ''),
            token: env.DATABRICKS_TOKEN || '',
            warehouseId: env.DATABRICKS_WAREHOUSE_ID || '',
            catalog: env.DATABRICKS_CATALOG || '',
            schema: env.DATABRICKS_SCHEMA || '',
            table: env.DATABRICKS_TABLE || '',
            waitTimeout: env.DATABRICKS_WAIT_TIMEOUT || '50s',
            pollIntervalMs: parseInteger(env.DATABRICKS_POLL_INTERVAL_MS, 1_000, 100, 30_000),
            maxWaitMs: parseInteger(env.DATABRICKS_MAX_WAIT_MS, 60_000, 1_000, 300_000),
        },
        arrowDownloadConcurrency: parseInteger(env.ARROW_DOWNLOAD_CONCURRENCY, 4, 1, 16),
        authMode: 'dev',
        devApiKey: env.BACKEND_DEV_API_KEY || '',
    };
}

export function isDatabricksConfigured(config: BackendConfig): boolean {
    return Boolean(
        config.databricks.host &&
            config.databricks.token &&
            config.databricks.warehouseId &&
            config.databricks.catalog &&
            config.databricks.schema &&
            config.databricks.table,
    );
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === '') return defaultValue;
    return value.trim().toLowerCase() === 'true';
}

function parseInteger(
    value: string | undefined,
    defaultValue: number,
    minValue: number,
    maxValue: number,
): number {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsedValue)) return defaultValue;
    return Math.min(Math.max(parsedValue, minValue), maxValue);
}

function parseList(value: string | undefined, defaultValue: string[]): string[] {
    if (!value) return defaultValue;
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseCacheProvider(value: string | undefined): 'memory' | 'redis' {
    return value === 'redis' ? 'redis' : 'memory';
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

export const config = loadConfig();
