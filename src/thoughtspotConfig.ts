import type {
    ChartColumn,
    ChartConfig,
    ChartConfigEditorDefinition,
    ChartModel,
    Query,
    VisualPropEditorDefinition,
} from '@thoughtspot/ts-chart-sdk';
import { THOUGHTSPOT_COLUMN_TYPE } from './thoughtspotConstants';

export function getDefaultBarChartConfig(chartModel: ChartModel): ChartConfig[] {
    const dimensionColumns = chartModel.columns.filter(
        (column: ChartColumn) => column.type === THOUGHTSPOT_COLUMN_TYPE.ATTRIBUTE,
    );
    const measureColumns = chartModel.columns.filter(
        (column: ChartColumn) => column.type === THOUGHTSPOT_COLUMN_TYPE.MEASURE,
    );

    return [
        {
            key: 'default',
            dimensions: [
                { key: 'x', columns: dimensionColumns.slice(0, 1) },
                { key: 'y', columns: measureColumns.slice(0, 1) },
            ],
        },
    ];
}

export function getQueriesFromBarChartConfig(
    chartConfig: ChartConfig[],
    querySize: number,
): Query[] {
    return chartConfig.map((config: ChartConfig) => ({
        queryColumns: config.dimensions.flatMap((dimension) => dimension.columns),
        queryParams: {
            offset: 0,
            size: querySize,
        },
    }));
}

export const chartConfigEditorDefinition: ChartConfigEditorDefinition[] = [
    {
        key: 'default',
        label: 'Bar Chart Configuration',
        descriptionText: 'X Axis accepts text or date columns. Y Axis accepts number columns only.',
        columnSections: [
            {
                key: 'x',
                label: 'X Axis - Categories / Labels',
                allowAttributeColumns: true,
                allowMeasureColumns: false,
                allowTimeSeriesColumns: true,
                maxColumnCount: 1,
            },
            {
                key: 'y',
                label: 'Y Axis - Values / Numbers',
                allowAttributeColumns: false,
                allowMeasureColumns: true,
                allowTimeSeriesColumns: false,
                maxColumnCount: 1,
            },
        ],
    },
];

export const visualPropEditorDefinition: VisualPropEditorDefinition = {
    elements: [],
};
