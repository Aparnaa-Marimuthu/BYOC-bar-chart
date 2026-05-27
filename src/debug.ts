import type { ByocRuntimeConfig } from './config';

export type ByocLogPrefix =
    | '[BYOC:init]'
    | '[BYOC:config]'
    | '[BYOC:query]'
    | '[BYOC:render:start]'
    | '[BYOC:render:data]'
    | '[BYOC:render:chart]'
    | '[BYOC:render:done]'
    | '[BYOC:render:error]'
    | '[BYOC:context-menu]'
    | '[BYOC:perf]'
    | '[BYOC:backend:request]'
    | '[BYOC:backend:response]'
    | '[BYOC:backend:error]'
    | '[BYOC:backend:fallback]';

export type ByocErrorPhase =
    | 'init'
    | 'config'
    | 'query'
    | 'transform'
    | 'backend'
    | 'chart-update'
    | 'context-menu';

export interface LastRenderSummary {
    renderId: string;
    path: 'native-thoughtspot' | 'backend-cache' | 'backend-databricks-arrow' | 'backend-mock' | 'backend-fallback-native';
    rowsInput: number;
    rowsRendered: number;
    truncated: boolean;
    memoCacheHit: boolean;
    chartAction: 'create' | 'update';
    updateMode: 'default' | 'none';
    nativeDataTransformMs: number;
    chartUpdateMs: number;
    renderTotalMs: number;
}

export interface SafeErrorDetails {
    name: string;
    message: string;
    stack?: string;
    renderId?: string;
    phase: ByocErrorPhase;
    rowCount?: number;
}

export interface SafeDebugConfig {
    querySize: number;
    maxBars: number;
    debug: boolean;
    debugData: boolean;
    enableCustomDrill: boolean;
    dataMode: string;
    backendUrl: string;
    backendTimeoutMs: number;
    backendCacheDebug: boolean;
    animationFreeRowThreshold: number;
}

let lastRenderSummary: LastRenderSummary | null = null;
let lastError: SafeErrorDetails | null = null;
let safeConfig: SafeDebugConfig | null = null;
let version = '0.0.0';

declare global {
    interface Window {
        __BYOC_DEBUG__?: {
            getLastRenderSummary: () => LastRenderSummary | null;
            getLastError: () => SafeErrorDetails | null;
            getConfig: () => SafeDebugConfig | null;
            getVersion: () => string;
        };
    }
}

export function debugLog(
    debugEnabled: boolean,
    prefix: ByocLogPrefix,
    payload?: unknown,
): void {
    if (!debugEnabled) return;
    if (payload === undefined) {
        console.info(prefix);
        return;
    }
    console.info(prefix, payload);
}

export function debugWarn(
    debugEnabled: boolean,
    prefix: ByocLogPrefix,
    payload: unknown,
): void {
    if (!debugEnabled) return;
    console.warn(prefix, payload);
}

export function logSafeError(
    debugEnabled: boolean,
    errorDetails: SafeErrorDetails,
    critical = true,
): void {
    lastError = errorDetails;
    if (debugEnabled) {
        console.error('[BYOC:render:error]', errorDetails);
        return;
    }
    if (critical) {
        console.error('[BYOC:render:error]', {
            name: errorDetails.name,
            message: errorDetails.message,
            phase: errorDetails.phase,
            renderId: errorDetails.renderId,
        });
    }
}

export function toSafeErrorDetails(
    error: unknown,
    phase: ByocErrorPhase,
    renderId?: string,
    rowCount?: number,
): SafeErrorDetails {
    if (error instanceof Error) {
        return {
            name: redactSensitiveText(error.name || 'Error'),
            message: redactSensitiveText(error.message || 'Unknown error'),
            stack: error.stack ? redactSensitiveText(trimStack(error.stack)) : undefined,
            renderId,
            phase,
            rowCount,
        };
    }

    return {
        name: 'Error',
        message: redactSensitiveText(String(error || 'Unknown error')),
        renderId,
        phase,
        rowCount,
    };
}

export function setLastRenderSummary(summary: LastRenderSummary): void {
    lastRenderSummary = summary;
}

export function installDebugHelper(config: ByocRuntimeConfig): void {
    safeConfig = {
        querySize: config.querySize,
        maxBars: config.maxBars,
        debug: config.debug,
        debugData: config.debugData,
        enableCustomDrill: config.enableCustomDrill,
        dataMode: config.dataMode,
        backendUrl: config.backendUrl,
        backendTimeoutMs: config.backendTimeoutMs,
        backendCacheDebug: config.backendCacheDebug,
        animationFreeRowThreshold: config.animationFreeRowThreshold,
    };
    version = `${config.appVersion}@${config.buildTime}`;

    if (!config.debug || typeof window === 'undefined') return;

    window.__BYOC_DEBUG__ = {
        getLastRenderSummary: () => lastRenderSummary,
        getLastError: () => lastError,
        getConfig: () => safeConfig,
        getVersion: () => version,
    };
}

function trimStack(stack: string): string {
    return stack.split('\n').slice(0, 8).join('\n');
}

function redactSensitiveText(value: string): string {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/(authorization|cookie|token|password|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
}
