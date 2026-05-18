import type { ChartColumn, ChartConfig } from '@thoughtspot/ts-chart-sdk';
import { describe, expect, it } from 'vitest';
import { getQueriesFromBarChartConfig } from './thoughtspotConfig';
import { THOUGHTSPOT_COLUMN_TYPE, THOUGHTSPOT_DATA_TYPE } from './thoughtspotConstants';

describe('ThoughtSpot query config', () => {
    it('uses queryParams with offset and clamped size value from runtime config', () => {
        const labelColumn = createColumn('label', THOUGHTSPOT_COLUMN_TYPE.ATTRIBUTE);
        const valueColumn = createColumn('value', THOUGHTSPOT_COLUMN_TYPE.MEASURE);
        const chartConfig: ChartConfig[] = [
            {
                key: 'default',
                dimensions: [
                    { key: 'x', columns: [labelColumn] },
                    { key: 'y', columns: [valueColumn] },
                ],
            },
        ];

        const queries = getQueriesFromBarChartConfig(chartConfig, 123);

        expect(queries).toHaveLength(1);
        expect(queries[0].queryColumns).toEqual([labelColumn, valueColumn]);
        expect(queries[0].queryParams).toEqual({ offset: 0, size: 123 });
        expect(queries[0]).not.toHaveProperty('queryOptions');
    });
});

function createColumn(id: string, type: number): ChartColumn {
    return {
        id,
        name: id,
        type,
        dataType: THOUGHTSPOT_DATA_TYPE.CHAR,
        timeBucket: 0,
    } as ChartColumn;
}
