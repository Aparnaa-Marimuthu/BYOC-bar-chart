export interface NativeRenderPerformance {
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

export const TRUNCATION_WARNING_MESSAGE =
    'Rendered rows were truncated to protect browser responsiveness. The visible rows preserve incoming order; sort state is not assumed.';

let renderCounter = 0;

export function nextRenderId(): string {
    renderCounter += 1;
    return `native-render-${renderCounter}`;
}

export function nowMs(): number {
    return globalThis.performance?.now() ?? Date.now();
}

export function elapsedMs(startMs: number): number {
    return Math.round((nowMs() - startMs) * 100) / 100;
}

export function logPerformance(
    debugEnabled: boolean,
    performanceRecord: NativeRenderPerformance,
): void {
    if (!debugEnabled) return;
    console.info('[BYOC:perf]', performanceRecord);
}

export function logDebugWarning(
    debugEnabled: boolean,
    message: string,
    details: Record<string, unknown> = {},
): void {
    if (!debugEnabled) return;
    console.warn('[BYOC:render:data]', { message, ...details });
}
