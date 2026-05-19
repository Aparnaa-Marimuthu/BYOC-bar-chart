import { ChartToTSEvent, getChartContext } from '@thoughtspot/ts-chart-sdk';
import type {
    ChartConfig,
    ChartModel,
    CustomChartContext,
    Query,
} from '@thoughtspot/ts-chart-sdk';
import './style.css';
import { byocRuntimeConfig } from './config';
import {
    createBarChart,
    getChartUpdateMode,
    updateExistingChart,
} from './chartRenderer';
import type { NativeBarChart } from './chartRenderer';
import {
    createNativeDataMemo,
    transformNativeData,
} from './nativeData';
import type { NativeChartData } from './nativeData';
import {
    debugLog,
    debugWarn,
    installDebugHelper,
    logSafeError,
    setLastRenderSummary,
    toSafeErrorDetails,
} from './debug';
import type {
    ByocErrorPhase,
    LastRenderSummary,
} from './debug';
import {
    elapsedMs,
    nextRenderId,
    nowMs,
    TRUNCATION_WARNING_MESSAGE,
} from './performance';
import { setChartUiState } from './uiState';
import {
    chartConfigEditorDefinition,
    getDefaultBarChartConfig,
    getQueriesFromBarChartConfig,
    visualPropEditorDefinition,
} from './thoughtspotConfig';
import { attachRightClickHandler } from './thoughtspotInteractions';
import type {
    ThoughtSpotEventEmitter,
    ThoughtSpotInteractionState,
} from './thoughtspotInteractions';
import {
    backendPathFromResponse,
    buildBackendRequestFromChartContext,
    fetchBackendChartData,
    normalizeBackendRowsToChartData,
} from './services/backendDataClient';
import type { BackendChartDataResponse, BackendDataError } from './services/backendDataClient';

let chartInstance: NativeBarChart | null = null;
let initialRenderGuardUsed = false;
let lastInteractionRenderId: string | undefined;
let latestBackendRequestSequence = 0;
let activeBackendController: AbortController | null = null;

const nativeDataMemo = createNativeDataMemo();
const interactionState: ThoughtSpotInteractionState = {
    chart: null,
    rawData: null,
    ctx: null,
};

installDebugHelper(byocRuntimeConfig);

class ByocPhaseError extends Error {
    phase: ByocErrorPhase;
    rowCount?: number;
    originalError: unknown;

    constructor(error: unknown, phase: ByocErrorPhase, rowCount?: number) {
        super(error instanceof Error ? error.message : String(error));
        this.name = error instanceof Error ? error.name : 'Error';
        this.phase = phase;
        this.rowCount = rowCount;
        this.originalError = error;
    }
}

interface RenderOutcome {
    emitRenderError: boolean;
    errorMessage?: string;
    summary: LastRenderSummary;
}

function render(ctx: CustomChartContext, renderId: string): RenderOutcome {
    const renderStartMs = nowMs();
    const canvas = document.getElementById('chart') as HTMLCanvasElement | null;
    const chartModel = ctx.getChartModel();
    const rowsBeforeTransform = getDetectedRowCount(chartModel);

    if (byocRuntimeConfig.debug && byocRuntimeConfig.debugData) {
        debugLog(byocRuntimeConfig.debug, '[BYOC:render:data]', {
            renderId,
            debugDataEnabled: true,
            chartModelData: chartModel.data,
        });
    }

    if (!canvas) {
        setChartUiState('missing-canvas');
        const summary = buildRenderSummary({
            renderId,
            rowsInput: rowsBeforeTransform,
            rowsRendered: 0,
            truncated: false,
            memoCacheHit: false,
            chartAction: chartInstance ? 'update' : 'create',
            updateMode: 'default',
            nativeDataTransformMs: 0,
            chartUpdateMs: 0,
            renderTotalMs: elapsedMs(renderStartMs),
        });
        setLastRenderSummary(summary);
        debugLog(byocRuntimeConfig.debug, '[BYOC:perf]', summary);
        logSafeError(
            byocRuntimeConfig.debug,
            toSafeErrorDetails(
                new Error('Chart canvas was not found.'),
                'chart-update',
                renderId,
                rowsBeforeTransform,
            ),
        );
        return {
            emitRenderError: true,
            errorMessage: 'Chart canvas was not found.',
            summary,
        };
    }

    const transformStartMs = nowMs();
    let transformResult: ReturnType<typeof transformNativeData>;
    try {
        transformResult = transformNativeData(
            chartModel,
            byocRuntimeConfig.maxBars,
            nativeDataMemo,
        );
    } catch (error: unknown) {
        throw new ByocPhaseError(error, 'transform', rowsBeforeTransform);
    }
    const nativeDataTransformMs = elapsedMs(transformStartMs);

    if (transformResult.status !== 'ready') {
        interactionState.rawData = null;
        interactionState.ctx = ctx as unknown as ThoughtSpotEventEmitter;
        setChartUiState(transformResult.status, transformResult.message);
        debugLog(byocRuntimeConfig.debug, '[BYOC:render:data]', {
            renderId,
            state: transformResult.status,
            message: transformResult.message,
            rowsInput: rowsBeforeTransform,
            rowsRendered: 0,
            truncated: false,
            memoCacheHit: false,
        });

        const summary = buildRenderSummary({
            renderId,
            rowsInput: rowsBeforeTransform,
            rowsRendered: 0,
            truncated: false,
            memoCacheHit: false,
            chartAction: chartInstance ? 'update' : 'create',
            updateMode: 'default',
            nativeDataTransformMs,
            chartUpdateMs: 0,
            renderTotalMs: elapsedMs(renderStartMs),
        });
        setLastRenderSummary(summary);
        debugLog(byocRuntimeConfig.debug, '[BYOC:perf]', summary);
        return { emitRenderError: false, summary };
    }

    const chartData = transformResult.data;
    const labelColumnName = getColumnName(chartModel, chartData.rawData.columns[0]);
    const valueColumnName = getColumnName(chartModel, chartData.rawData.columns[1]);

    debugLog(byocRuntimeConfig.debug, '[BYOC:render:data]', {
        renderId,
        rowsInput: chartData.sourceRowCount,
        rowsRendered: chartData.rowsRendered,
        truncated: chartData.truncated,
        memoCacheHit: transformResult.fromMemo,
        labelColumnName,
        valueColumnName,
    });

    if (chartData.truncated) {
        debugWarn(byocRuntimeConfig.debug, '[BYOC:render:data]', {
            message: TRUNCATION_WARNING_MESSAGE,
            rowsInput: chartData.sourceRowCount,
            rowsRendered: chartData.rowsRendered,
            maxBars: byocRuntimeConfig.maxBars,
        });
    }

    setChartUiState('ready');
    interactionState.rawData = chartData.rawData;
    interactionState.ctx = ctx as unknown as ThoughtSpotEventEmitter;

    const chartAction: 'create' | 'update' = chartInstance ? 'update' : 'create';
    const updateModeValue = getChartUpdateMode(
        chartData,
        byocRuntimeConfig.animationFreeRowThreshold,
    );
    const updateMode = updateModeValue === 'none' ? 'none' : 'default';
    const chartUpdateStartMs = nowMs();

    try {
        if (chartInstance) {
            updateExistingChart(
                chartInstance,
                chartData,
                byocRuntimeConfig.animationFreeRowThreshold,
            );
        } else {
            chartInstance = createBarChart(
                canvas,
                chartData,
                byocRuntimeConfig.animationFreeRowThreshold,
            );
        }
    } catch (error: unknown) {
        throw new ByocPhaseError(error, 'chart-update', chartData.sourceRowCount);
    }

    interactionState.chart = chartInstance;
    const chartUpdateMs = elapsedMs(chartUpdateStartMs);
    debugLog(byocRuntimeConfig.debug, '[BYOC:render:chart]', {
        renderId,
        chartAction,
        updateMode,
        chartInstanceDestroyUsed: false,
    });

    const rightClickAttached = attachRightClickHandler(canvas, interactionState, {
        enableCustomDrill: byocRuntimeConfig.enableCustomDrill,
        onError: (error, rowCount) => {
            logSafeError(
                byocRuntimeConfig.debug,
                toSafeErrorDetails(
                    error,
                    'context-menu',
                    lastInteractionRenderId,
                    rowCount,
                ),
            );
        },
    });
    lastInteractionRenderId = renderId;
    debugLog(byocRuntimeConfig.debug, '[BYOC:context-menu]', {
        renderId,
        rightClickHandlerAttached: rightClickAttached,
        enableCustomDrill: byocRuntimeConfig.enableCustomDrill,
    });

    const summary = buildRenderSummary({
        renderId,
        rowsInput: chartData.sourceRowCount,
        rowsRendered: chartData.rowsRendered,
        truncated: chartData.truncated,
        memoCacheHit: transformResult.fromMemo,
        chartAction,
        updateMode,
        nativeDataTransformMs,
        chartUpdateMs,
        renderTotalMs: elapsedMs(renderStartMs),
    });
    setLastRenderSummary(summary);
    debugLog(byocRuntimeConfig.debug, '[BYOC:perf]', summary);

    return { emitRenderError: false, summary };
}

async function renderChart(ctx: CustomChartContext): Promise<void> {
    const renderId = nextRenderId();
    const chartModel = ctx.getChartModel();
    debugLog(byocRuntimeConfig.debug, '[BYOC:render:start]', {
        renderId,
        dataMode: byocRuntimeConfig.dataMode,
        chartModelExists: Boolean(chartModel),
        chartModelDataExists: Boolean(chartModel?.data?.[0]?.data),
        rowsInput: getDetectedRowCount(chartModel),
    });

    try {
        await ctx.emitEvent(ChartToTSEvent.RenderStart);
        const outcome = byocRuntimeConfig.dataMode === 'backend'
            ? await renderBackendChart(ctx, renderId)
            : render(ctx, renderId);

        if (outcome.emitRenderError) {
            await ctx.emitEvent(ChartToTSEvent.RenderError, {
                hasError: true,
                error: outcome.errorMessage ?? 'Unable to render chart.',
            });
            return;
        }

        await ctx.emitEvent(ChartToTSEvent.RenderComplete);
        debugLog(byocRuntimeConfig.debug, '[BYOC:render:done]', {
            renderId,
            rowsRendered: outcome.summary.rowsRendered,
            truncated: outcome.summary.truncated,
        });
    } catch (error: unknown) {
        const phaseError = error instanceof ByocPhaseError ? error : null;
        const sourceError = phaseError?.originalError ?? error;
        const phase = phaseError?.phase ?? 'chart-update';
        const rowCount = phaseError?.rowCount ?? getDetectedRowCount(chartModel);

        setChartUiState('error');
        logSafeError(
            byocRuntimeConfig.debug,
            toSafeErrorDetails(sourceError, phase, renderId, rowCount),
        );
        await emitRenderErrorSafely(ctx, sourceError);
    }
}

async function renderBackendChart(
    ctx: CustomChartContext,
    renderId: string,
): Promise<RenderOutcome> {
    const renderStartMs = nowMs();
    const canvas = document.getElementById('chart') as HTMLCanvasElement | null;

    if (!canvas) {
        setChartUiState('missing-canvas');
        const summary = buildRenderSummary({
            renderId,
            rowsInput: 0,
            rowsRendered: 0,
            truncated: false,
            memoCacheHit: false,
            chartAction: chartInstance ? 'update' : 'create',
            updateMode: 'default',
            nativeDataTransformMs: 0,
            chartUpdateMs: 0,
            renderTotalMs: elapsedMs(renderStartMs),
        }, 'backend-mock');
        setLastRenderSummary(summary);
        return {
            emitRenderError: true,
            errorMessage: 'Chart canvas was not found.',
            summary,
        };
    }

    setChartUiState('loading');
    activeBackendController?.abort();
    const backendController = new AbortController();
    activeBackendController = backendController;
    latestBackendRequestSequence += 1;
    const requestSequence = latestBackendRequestSequence;

    const request = buildBackendRequestFromChartContext(ctx, renderId, byocRuntimeConfig);
    debugLog(byocRuntimeConfig.debug, '[BYOC:backend:request]', {
        requestId: request.requestId,
        mode: byocRuntimeConfig.dataMode,
        dimension: request.dimension,
        metric: request.metric,
        limit: request.limit,
    });

    let response: BackendChartDataResponse;
    const backendRequestStartMs = nowMs();
    try {
        response = await fetchBackendChartData(request, byocRuntimeConfig, backendController.signal);
    } catch (error: unknown) {
        const backendError = error as BackendDataError;
        if (backendError.code === 'ABORTED') {
            const summary = buildRenderSummary({
                renderId,
                rowsInput: 0,
                rowsRendered: 0,
                truncated: false,
                memoCacheHit: false,
                chartAction: chartInstance ? 'update' : 'create',
                updateMode: 'default',
                nativeDataTransformMs: 0,
                chartUpdateMs: 0,
                renderTotalMs: elapsedMs(renderStartMs),
            }, 'backend-mock');
            return { emitRenderError: false, summary };
        }

        debugLog(byocRuntimeConfig.debug, '[BYOC:backend:error]', {
            requestId: backendError.requestId || request.requestId,
            code: backendError.code || 'BACKEND_ERROR',
            message: backendError.message || 'Backend chart data request failed.',
        });
        setChartUiState('error', 'Backend chart data request failed.');
        throw new ByocPhaseError(error, 'backend');
    }

    if (requestSequence !== latestBackendRequestSequence) {
        debugLog(byocRuntimeConfig.debug, '[BYOC:backend:fallback]', {
            requestId: request.requestId,
            reason: 'stale-response',
        });
        const summary = buildRenderSummary({
            renderId,
            rowsInput: response.meta.rowCount,
            rowsRendered: 0,
            truncated: response.meta.truncated,
            memoCacheHit: response.cacheHit,
            chartAction: chartInstance ? 'update' : 'create',
            updateMode: 'default',
            nativeDataTransformMs: 0,
            chartUpdateMs: 0,
            renderTotalMs: elapsedMs(renderStartMs),
        }, backendPathFromResponse(response));
        return { emitRenderError: false, summary };
    }

    debugLog(byocRuntimeConfig.debug, '[BYOC:backend:response]', {
        requestId: response.meta.requestId,
        cacheHit: response.cacheHit,
        source: response.source,
        rowsReturned: response.rows.length,
        totalMs: response.timing.totalMs,
        cacheLookupMs: response.timing.cacheLookupMs,
        databricksWaitMs: response.timing.databricksWaitMs,
        arrowDownloadMs: response.timing.arrowDownloadMs,
        arrowParseMs: response.timing.arrowParseMs,
    });

    const chartData = normalizeBackendRowsToChartData(response, request.metric);
    if (chartData.rowsRendered === 0) {
        setChartUiState('empty', 'Backend returned no data to display.');
        const summary = buildRenderSummary({
            renderId,
            rowsInput: chartData.sourceRowCount,
            rowsRendered: 0,
            truncated: chartData.truncated,
            memoCacheHit: response.cacheHit,
            chartAction: chartInstance ? 'update' : 'create',
            updateMode: 'default',
            nativeDataTransformMs: 0,
            chartUpdateMs: 0,
            renderTotalMs: elapsedMs(renderStartMs),
        }, backendPathFromResponse(response));
        setLastRenderSummary(summary);
        return { emitRenderError: false, summary };
    }

    const chartResult = renderChartData(canvas, chartData, renderId);
    interactionState.rawData = null;
    interactionState.ctx = ctx as unknown as ThoughtSpotEventEmitter;
    interactionState.chart = chartInstance;

    const summary = buildRenderSummary({
        renderId,
        rowsInput: chartData.sourceRowCount,
        rowsRendered: chartData.rowsRendered,
        truncated: chartData.truncated,
        memoCacheHit: response.cacheHit,
        chartAction: chartResult.chartAction,
        updateMode: chartResult.updateMode,
        nativeDataTransformMs: 0,
        chartUpdateMs: chartResult.chartUpdateMs,
        renderTotalMs: elapsedMs(renderStartMs),
    }, backendPathFromResponse(response));

    debugLog(byocRuntimeConfig.debug, '[BYOC:perf]', {
        ...summary,
        backendRequestMs: elapsedMs(backendRequestStartMs),
    });
    setLastRenderSummary(summary);
    return { emitRenderError: false, summary };
}

async function emitRenderErrorSafely(
    ctx: CustomChartContext,
    error: unknown,
): Promise<void> {
    try {
        await ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: error instanceof Error ? error.message : 'Unable to render chart.',
        });
    } catch {
        // The SDK host may be unavailable outside ThoughtSpot.
    }
}

function getDefaultChartConfigWithDebug(chartModel: ChartModel): ChartConfig[] {
    try {
        debugLog(byocRuntimeConfig.debug, '[BYOC:config]', {
            event: 'getDefaultChartConfig',
            columnsCount: chartModel.columns.length,
            columnNames: chartModel.columns.map((column) => column.name),
        });
        const chartConfig = getDefaultBarChartConfig(chartModel);
        debugLog(byocRuntimeConfig.debug, '[BYOC:config]', {
            event: 'selectedChartConfigDimensions',
            dimensions: summarizeChartConfig(chartConfig),
        });
        return chartConfig;
    } catch (error: unknown) {
        logSafeError(
            byocRuntimeConfig.debug,
            toSafeErrorDetails(error, 'config'),
        );
        throw error;
    }
}

function getQueriesFromChartConfigWithDebug(chartConfig: ChartConfig[]): Query[] {
    try {
        const queries = getQueriesFromBarChartConfig(
            chartConfig,
            byocRuntimeConfig.querySize,
        );
        const firstQueryParams = queries[0]?.queryParams;
        debugLog(byocRuntimeConfig.debug, '[BYOC:query]', {
            event: 'getQueriesFromChartConfig',
            queryColumnsCount: queries.reduce(
                (count, query) => count + query.queryColumns.length,
                0,
            ),
            queryParamOffset: firstQueryParams?.offset ?? 0,
            queryParamSize: firstQueryParams?.size ?? 0,
            chartConfigCount: chartConfig.length,
            dimensionKeys: flattenDimensionKeys(chartConfig),
            columnNames: flattenColumnNames(chartConfig),
        });
        return queries;
    } catch (error: unknown) {
        logSafeError(
            byocRuntimeConfig.debug,
            toSafeErrorDetails(error, 'query'),
        );
        throw error;
    }
}

function hasInitialNativeData(ctx: CustomChartContext): boolean {
    return Boolean(ctx.getChartModel()?.data?.[0]?.data);
}

async function bootstrapChart(): Promise<void> {
    debugLog(byocRuntimeConfig.debug, '[BYOC:init]', {
        event: 'starting',
        debug: byocRuntimeConfig.debug,
        version: `${byocRuntimeConfig.appVersion}@${byocRuntimeConfig.buildTime}`,
    });

    const ctx = await getChartContext({
        getDefaultChartConfig: getDefaultChartConfigWithDebug,
        getQueriesFromChartConfig: getQueriesFromChartConfigWithDebug,
        chartConfigEditorDefinition,
        visualPropEditorDefinition,
        renderChart,
    });

    const hasInitialData = hasInitialNativeData(ctx);
    debugLog(byocRuntimeConfig.debug, '[BYOC:init]', {
        event: 'complete',
        hasInitialData,
        oneShotInitialRenderGuardUsed: false,
    });

    if (!initialRenderGuardUsed && hasInitialData) {
        initialRenderGuardUsed = true;
        debugLog(byocRuntimeConfig.debug, '[BYOC:init]', {
            event: 'oneShotInitialRenderGuard',
            used: true,
        });
        await renderChart(ctx);
    }
}

function buildRenderSummary(
    summary: Omit<LastRenderSummary, 'path'>,
    path: LastRenderSummary['path'] = 'native-thoughtspot',
): LastRenderSummary {
    return {
        path,
        ...summary,
    };
}

function renderChartData(
    canvas: HTMLCanvasElement,
    chartData: NativeChartData,
    renderId: string,
): { chartAction: 'create' | 'update'; updateMode: 'default' | 'none'; chartUpdateMs: number } {
    setChartUiState('ready');
    const chartAction: 'create' | 'update' = chartInstance ? 'update' : 'create';
    const updateModeValue = getChartUpdateMode(
        chartData,
        byocRuntimeConfig.animationFreeRowThreshold,
    );
    const updateMode = updateModeValue === 'none' ? 'none' : 'default';
    const chartUpdateStartMs = nowMs();

    if (chartInstance) {
        updateExistingChart(
            chartInstance,
            chartData,
            byocRuntimeConfig.animationFreeRowThreshold,
        );
    } else {
        chartInstance = createBarChart(
            canvas,
            chartData,
            byocRuntimeConfig.animationFreeRowThreshold,
        );
    }

    const chartUpdateMs = elapsedMs(chartUpdateStartMs);
    debugLog(byocRuntimeConfig.debug, '[BYOC:render:chart]', {
        renderId,
        chartAction,
        updateMode,
        chartInstanceDestroyUsed: false,
    });

    return { chartAction, updateMode, chartUpdateMs };
}

function getDetectedRowCount(chartModel: ChartModel | null | undefined): number {
    const rows = chartModel?.data?.[0]?.data?.dataValue;
    return Array.isArray(rows) ? rows.length : 0;
}

function getColumnName(chartModel: ChartModel, columnId: string | undefined): string {
    if (!columnId) return 'unknown';
    return chartModel.columns.find((column) => column.id === columnId)?.name ?? 'unknown';
}

function summarizeChartConfig(chartConfig: ChartConfig[]) {
    return chartConfig.map((config) => ({
        key: config.key,
        dimensions: config.dimensions.map((dimension) => ({
            key: dimension.key,
            columnCount: dimension.columns.length,
            columnNames: dimension.columns.map((column) => column.name),
        })),
    }));
}

function flattenDimensionKeys(chartConfig: ChartConfig[]): string {
    return chartConfig
        .flatMap((config) => config.dimensions.map((dimension) => dimension.key))
        .join(',');
}

function flattenColumnNames(chartConfig: ChartConfig[]): string {
    return chartConfig
        .flatMap((config) =>
            config.dimensions.flatMap((dimension) =>
                dimension.columns.map((column) => column.name),
            ),
        )
        .join(',');
}

void bootstrapChart().catch((error: unknown) => {
    setChartUiState(
        'error',
        'ThoughtSpot chart context is not available. Open this chart inside ThoughtSpot to render live data.',
    );
    logSafeError(
        byocRuntimeConfig.debug,
        toSafeErrorDetails(error, 'init'),
    );
});
