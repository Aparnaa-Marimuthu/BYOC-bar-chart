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

let chartInstance: NativeBarChart | null = null;
let initialRenderGuardUsed = false;
let lastInteractionRenderId: string | undefined;

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
        chartModelExists: Boolean(chartModel),
        chartModelDataExists: Boolean(chartModel?.data?.[0]?.data),
        rowsInput: getDetectedRowCount(chartModel),
    });

    try {
        await ctx.emitEvent(ChartToTSEvent.RenderStart);
        const outcome = render(ctx, renderId);

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
        debugLog(byocRuntimeConfig.debug, '[BYOC:query]', {
            chartConfigDimensions: summarizeChartConfig(chartConfig),
            queryColumnsCount: queries.reduce(
                (count, query) => count + query.queryColumns.length,
                0,
            ),
            queryParams: queries[0]?.queryParams ?? null,
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
): LastRenderSummary {
    return {
        path: 'native-thoughtspot',
        ...summary,
    };
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
