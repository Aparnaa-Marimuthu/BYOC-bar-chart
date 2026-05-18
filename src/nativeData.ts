import type { ChartModel } from '@thoughtspot/ts-chart-sdk';
import { THOUGHTSPOT_COLUMN_TYPE, THOUGHTSPOT_DATA_TYPE } from './thoughtspotConstants';

export interface RawThoughtSpotData {
    columns: string[];
    dataValue: unknown[][];
}

export interface NativeChartData {
    labels: string[];
    values: number[];
    datasetLabel: string;
    rowsRendered: number;
    sourceRowCount: number;
    truncated: boolean;
    signature: string;
    rawData: RawThoughtSpotData;
}

export interface NativeDataMemo {
    lastSignature: string | null;
    lastData: NativeChartData | null;
}

export type NativeDataTransformResult =
    | {
          status: 'ready';
          data: NativeChartData;
          fromMemo: boolean;
      }
    | {
          status: 'empty' | 'invalid-config' | 'unsupported-columns';
          message: string;
          rowsRendered: 0;
          truncated: false;
      };

const SAMPLE_SIZE = 24;

export function createNativeDataMemo(): NativeDataMemo {
    return {
        lastSignature: null,
        lastData: null,
    };
}

export function transformNativeData(
    chartModel: ChartModel,
    maxBars: number,
    memo?: NativeDataMemo,
): NativeDataTransformResult {
    const configError = validateChartConfig(chartModel);
    if (configError) {
        return stateResult('invalid-config', configError);
    }

    const rawData = getRawThoughtSpotData(chartModel);
    if (!rawData || !Array.isArray(rawData.dataValue) || rawData.dataValue.length === 0) {
        return stateResult('empty', 'No data to display.');
    }

    if (rawData.columns.length < 2) {
        return stateResult(
            'unsupported-columns',
            'This chart needs one label column and one numeric value column.',
        );
    }

    const labelColumnId = rawData.columns[0];
    const valueColumnId = rawData.columns[1];
    const labelColumn = chartModel.columns.find((column) => column.id === labelColumnId);
    const valueColumn = chartModel.columns.find((column) => column.id === valueColumnId);

    if (!labelColumn || !valueColumn || valueColumn.type !== THOUGHTSPOT_COLUMN_TYPE.MEASURE) {
        return stateResult(
            'unsupported-columns',
            'This chart needs a supported label column and a measure value column.',
        );
    }

    const renderRowCount = Math.min(rawData.dataValue.length, maxBars);
    const truncated = rawData.dataValue.length > renderRowCount;
    const signature = buildDataSignature(chartModel, rawData, renderRowCount, maxBars);

    if (memo?.lastSignature === signature && memo.lastData) {
        return {
            status: 'ready',
            data: memo.lastData,
            fromMemo: true,
        };
    }

    const labels: string[] = [];
    const values: number[] = [];
    const isLabelDate = labelColumn.dataType === THOUGHTSPOT_DATA_TYPE.DATE;

    for (let index = 0; index < renderRowCount; index += 1) {
        const row = rawData.dataValue[index] ?? [];
        labels.push(formatLabel(row[0], isLabelDate));
        values.push(toChartNumber(row[1]));
    }

    const data: NativeChartData = {
        labels,
        values,
        datasetLabel: valueColumn.name || 'Value',
        rowsRendered: renderRowCount,
        sourceRowCount: rawData.dataValue.length,
        truncated,
        signature,
        rawData,
    };

    if (memo) {
        memo.lastSignature = signature;
        memo.lastData = data;
    }

    return {
        status: 'ready',
        data,
        fromMemo: false,
    };
}

export function getRawThoughtSpotData(chartModel: ChartModel): RawThoughtSpotData | null {
    const rawData = chartModel.data?.[0]?.data as RawThoughtSpotData | undefined;
    if (!rawData || !Array.isArray(rawData.columns) || !Array.isArray(rawData.dataValue)) {
        return null;
    }
    return rawData;
}

export function formatLabel(value: unknown, isDate: boolean): string {
    if (!isDate) {
        return String(value ?? '');
    }

    const unixSeconds = Number(value);
    if (!Number.isFinite(unixSeconds)) {
        return String(value ?? '');
    }

    return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
    });
}

export function buildDataSignature(
    chartModel: ChartModel,
    rawData: RawThoughtSpotData,
    renderRowCount: number,
    maxBars: number,
): string {
    const labelColumn = chartModel.columns.find((column) => column.id === rawData.columns[0]);
    const isLabelDate = labelColumn?.dataType === THOUGHTSPOT_DATA_TYPE.DATE;
    const signatureParts = [
        `columns:${rawData.columns.join(',')}`,
        `sourceRows:${rawData.dataValue.length}`,
        `renderRows:${renderRowCount}`,
        `maxBars:${maxBars}`,
    ];

    const renderedPairParts: string[] = [];
    for (let index = 0; index < renderRowCount; index += 1) {
        renderedPairParts.push(formatPair(rawData.dataValue[index], isLabelDate));
    }
    signatureParts.push(`rendered:${hashStrings(renderedPairParts)}`);

    if (rawData.dataValue.length > maxBars) {
        signatureParts.push(`sampled:${hashStrings(getSampledRows(rawData.dataValue).map((row) => formatPair(row, isLabelDate)))}`);
    }

    return hashStrings(signatureParts);
}

function validateChartConfig(chartModel: ChartModel): string | null {
    const chartConfig = chartModel.config?.chartConfig?.[0];
    if (!chartConfig) {
        return null;
    }

    const labelDimension = chartConfig.dimensions.find((dimension) => dimension.key === 'x');
    const valueDimension = chartConfig.dimensions.find((dimension) => dimension.key === 'y');

    if (labelDimension?.columns.length !== 1 || valueDimension?.columns.length !== 1) {
        return 'Configure exactly one label column and one measure column.';
    }

    return null;
}

function stateResult(
    status: 'empty' | 'invalid-config' | 'unsupported-columns',
    message: string,
): NativeDataTransformResult {
    return {
        status,
        message,
        rowsRendered: 0,
        truncated: false,
    };
}

function toChartNumber(value: unknown): number {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatPair(row: unknown[] | undefined, isLabelDate: boolean): string {
    return `${formatLabel(row?.[0], isLabelDate)}\u001f${toChartNumber(row?.[1])}`;
}

function getSampledRows(rows: unknown[][]): unknown[][] {
    if (rows.length <= SAMPLE_SIZE) {
        return rows;
    }

    const sampledRows: unknown[][] = [];
    const lastIndex = rows.length - 1;

    for (let sampleIndex = 0; sampleIndex < SAMPLE_SIZE; sampleIndex += 1) {
        const rowIndex = Math.round((sampleIndex / (SAMPLE_SIZE - 1)) * lastIndex);
        sampledRows.push(rows[rowIndex]);
    }

    return sampledRows;
}

function hashStrings(parts: string[]): string {
    let hash = 2166136261;
    for (const part of parts) {
        for (let index = 0; index < part.length; index += 1) {
            hash ^= part.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        hash ^= 31;
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
