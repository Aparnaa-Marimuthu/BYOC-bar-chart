import type { ChartColumn, ChartModel } from '@thoughtspot/ts-chart-sdk';
import { describe, expect, it } from 'vitest';
import {
    createNativeDataMemo,
    transformNativeData,
} from './nativeData';
import { THOUGHTSPOT_COLUMN_TYPE, THOUGHTSPOT_DATA_TYPE } from './thoughtspotConstants';

describe('native ThoughtSpot data transform', () => {
    it('transforms ThoughtSpot rows to Chart.js labels and values', () => {
        const result = transformNativeData(
            createChartModel([
                ['Monitor', 8270799.59],
                ['Keyboard', '42'],
            ]),
            1000,
        );

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.data.labels).toEqual(['Monitor', 'Keyboard']);
        expect(result.data.values).toEqual([8270799.59, 42]);
        expect(result.data.datasetLabel).toBe('Revenue');
        expect(result.data.truncated).toBe(false);
    });

    it('formats date labels from ThoughtSpot unix seconds', () => {
        const result = transformNativeData(
            createChartModel([[1746057600, 100]], THOUGHTSPOT_DATA_TYPE.DATE),
            1000,
        );

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.data.labels).toEqual(['May 2025']);
    });

    it('truncates rendered bars without changing incoming order', () => {
        const result = transformNativeData(
            createChartModel([
                ['b', 2],
                ['a', 1],
                ['c', 3],
            ]),
            2,
        );

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.data.labels).toEqual(['b', 'a']);
        expect(result.data.sourceRowCount).toBe(3);
        expect(result.data.rowsRendered).toBe(2);
        expect(result.data.truncated).toBe(true);
    });

    it('memoizes unchanged small datasets and invalidates on rendered value changes', () => {
        const chartModel = createChartModel([
            ['Monitor', 10],
            ['Keyboard', 20],
        ]);
        const memo = createNativeDataMemo();

        const firstResult = transformNativeData(chartModel, 1000, memo);
        const secondResult = transformNativeData(chartModel, 1000, memo);

        expect(firstResult.status).toBe('ready');
        expect(secondResult.status).toBe('ready');
        if (firstResult.status !== 'ready' || secondResult.status !== 'ready') return;
        expect(secondResult.fromMemo).toBe(true);
        expect(secondResult.data).toBe(firstResult.data);

        chartModel.data?.[0]?.data.dataValue[1].splice(1, 1, 99);
        const changedResult = transformNativeData(chartModel, 1000, memo);

        expect(changedResult.status).toBe('ready');
        if (changedResult.status !== 'ready') return;
        expect(changedResult.fromMemo).toBe(false);
        expect(changedResult.data.values).toEqual([10, 99]);
    });

    it('memoizes large datasets with row metadata, rendered hash, and sampled hash', () => {
        const rows = Array.from({ length: 1100 }, (_value, index) => [`label-${index}`, index]);
        const chartModel = createChartModel(rows);
        const memo = createNativeDataMemo();

        const firstResult = transformNativeData(chartModel, 1000, memo);
        const secondResult = transformNativeData(chartModel, 1000, memo);

        expect(firstResult.status).toBe('ready');
        expect(secondResult.status).toBe('ready');
        if (firstResult.status !== 'ready' || secondResult.status !== 'ready') return;
        expect(secondResult.fromMemo).toBe(true);

        chartModel.data?.[0]?.data.dataValue.push(['new-row', 1100]);
        const changedResult = transformNativeData(chartModel, 1000, memo);

        expect(changedResult.status).toBe('ready');
        if (changedResult.status !== 'ready') return;
        expect(changedResult.fromMemo).toBe(false);
        expect(changedResult.data.sourceRowCount).toBe(1101);
    });

    it('returns explicit non-ready states', () => {
        expect(
            transformNativeData(createChartModel([], THOUGHTSPOT_DATA_TYPE.CHAR, false), 1000)
                .status,
        ).toBe('empty');
        expect(transformNativeData(createInvalidConfigChartModel(), 1000).status).toBe(
            'invalid-config',
        );
        expect(transformNativeData(createUnsupportedValueChartModel(), 1000).status).toBe(
            'unsupported-columns',
        );
    });
});

function createChartModel(
    rows: unknown[][],
    labelDataType: number = THOUGHTSPOT_DATA_TYPE.CHAR,
    includeData = true,
): ChartModel {
    const labelColumn = createColumn(
        'label',
        'Product',
        THOUGHTSPOT_COLUMN_TYPE.ATTRIBUTE,
        labelDataType,
    );
    const valueColumn = createColumn(
        'value',
        'Revenue',
        THOUGHTSPOT_COLUMN_TYPE.MEASURE,
        THOUGHTSPOT_DATA_TYPE.DOUBLE,
    );

    return {
        columns: [labelColumn, valueColumn],
        config: {
            chartConfig: [
                {
                    key: 'default',
                    dimensions: [
                        { key: 'x', columns: [labelColumn] },
                        { key: 'y', columns: [valueColumn] },
                    ],
                },
            ],
        },
        data: includeData
            ? [
                  {
                      data: {
                          columns: ['label', 'value'],
                          dataValue: rows,
                      },
                      totalRowCount: rows.length,
                  },
              ]
            : undefined,
    };
}

function createInvalidConfigChartModel(): ChartModel {
    const chartModel = createChartModel([['Monitor', 10]]);
    chartModel.config.chartConfig = [
        {
            key: 'default',
            dimensions: [
                { key: 'x', columns: [] },
                { key: 'y', columns: [chartModel.columns[1]] },
            ],
        },
    ];
    return chartModel;
}

function createUnsupportedValueChartModel(): ChartModel {
    const chartModel = createChartModel([['Monitor', 10]]);
    chartModel.columns[1] = createColumn(
        'value',
        'Revenue',
        THOUGHTSPOT_COLUMN_TYPE.ATTRIBUTE,
        THOUGHTSPOT_DATA_TYPE.CHAR,
    );
    return chartModel;
}

function createColumn(
    id: string,
    name: string,
    type: number,
    dataType: number,
): ChartColumn {
    return {
        id,
        name,
        type,
        dataType,
        timeBucket: 0,
    } as ChartColumn;
}
