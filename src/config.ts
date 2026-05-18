export interface ByocRuntimeConfig {
    querySize: number;
    maxBars: number;
    debug: boolean;
    debugData: boolean;
    enableCustomDrill: boolean;
    animationFreeRowThreshold: number;
    appVersion: string;
    buildTime: string;
}

export const THOUGHTSPOT_QUERY_HARD_LIMIT = 100_000;
export const DEFAULT_QUERY_SIZE = 1_000;
export const DEFAULT_MAX_BARS = 1_000;
export const MAX_BARS_HARD_LIMIT = 5_000;
export const ANIMATION_FREE_ROW_THRESHOLD = 500;

type RuntimeEnv = Record<string, string | boolean | undefined>;

export function parseBooleanEnv(value: string | boolean | undefined): boolean {
    if (typeof value === 'boolean') return value;
    return String(value ?? '').trim().toLowerCase() === 'true';
}

export function parseClampedInteger(
    value: string | boolean | undefined,
    defaultValue: number,
    minValue: number,
    maxValue: number,
): number {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsedValue)) {
        return defaultValue;
    }
    return Math.min(Math.max(parsedValue, minValue), maxValue);
}

export function getByocRuntimeConfig(
    env: RuntimeEnv = import.meta.env,
): ByocRuntimeConfig {
    return {
        querySize: parseClampedInteger(
            env.VITE_BYOC_QUERY_SIZE,
            DEFAULT_QUERY_SIZE,
            1,
            THOUGHTSPOT_QUERY_HARD_LIMIT,
        ),
        maxBars: parseClampedInteger(
            env.VITE_BYOC_MAX_BARS,
            DEFAULT_MAX_BARS,
            1,
            MAX_BARS_HARD_LIMIT,
        ),
        debug: parseBooleanEnv(env.VITE_BYOC_DEBUG),
        debugData: parseBooleanEnv(env.VITE_BYOC_DEBUG_DATA),
        enableCustomDrill: parseBooleanEnv(env.VITE_BYOC_ENABLE_CUSTOM_DRILL),
        animationFreeRowThreshold: ANIMATION_FREE_ROW_THRESHOLD,
        appVersion: String(env.VITE_BYOC_APP_VERSION || '0.0.0'),
        buildTime: String(env.VITE_BYOC_BUILD_TIME || 'local'),
    };
}

export const byocRuntimeConfig = getByocRuntimeConfig();
