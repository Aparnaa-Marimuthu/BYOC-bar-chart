import type { ChartDataTiming } from '../../types/chart.js';

export function nowMs(): number {
    return performance.now();
}

export function elapsedMs(startMs: number): number {
    return Math.round((performance.now() - startMs) * 100) / 100;
}

export function createTiming(): ChartDataTiming {
    return {
        totalMs: 0,
        cacheLookupMs: 0,
        sqlBuildMs: 0,
        databricksSubmitMs: 0,
        databricksWaitMs: 0,
        arrowDownloadMs: 0,
        arrowParseMs: 0,
        transformMs: 0,
        cacheWriteMs: 0,
    };
}
