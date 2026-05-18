import { describe, expect, it, vi } from 'vitest';
import { updateExistingChart } from './chartRenderer';
import type { NativeBarChart } from './chartRenderer';
import type { NativeChartData } from './nativeData';

describe('Chart.js renderer', () => {
    it('updates an existing chart without destroying it', () => {
        const destroy = vi.fn();
        const update = vi.fn();
        const chart = {
            data: {
                labels: ['old'],
                datasets: [{ label: 'Old', data: [1] }],
            },
            destroy,
            update,
        } as unknown as NativeBarChart;

        updateExistingChart(chart, createChartData(2), 500);

        expect(chart.data.labels).toEqual(['label-0', 'label-1']);
        expect(chart.data.datasets[0].label).toBe('Revenue');
        expect(chart.data.datasets[0].data).toEqual([0, 1]);
        expect(update).toHaveBeenCalledWith(undefined);
        expect(destroy).not.toHaveBeenCalled();
    });

    it("uses update('none') for larger row counts", () => {
        const update = vi.fn();
        const chart = {
            data: {
                labels: [],
                datasets: [{ label: '', data: [] }],
            },
            update,
        } as unknown as NativeBarChart;

        const updateMode = updateExistingChart(chart, createChartData(600), 500);

        expect(updateMode).toBe('none');
        expect(update).toHaveBeenCalledWith('none');
    });
});

function createChartData(rowCount: number): NativeChartData {
    return {
        labels: Array.from({ length: rowCount }, (_value, index) => `label-${index}`),
        values: Array.from({ length: rowCount }, (_value, index) => index),
        datasetLabel: 'Revenue',
        rowsRendered: rowCount,
        sourceRowCount: rowCount,
        truncated: false,
        signature: `signature-${rowCount}`,
        rawData: {
            columns: ['label', 'value'],
            dataValue: [],
        },
    };
}
