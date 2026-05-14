import Chart from 'chart.js/auto';
import {
    ChartToTSEvent,
    ColumnType,
    CustomChartContext,
    getChartContext,
} from '@thoughtspot/ts-chart-sdk';
import type {
    ChartColumn,
    ChartConfig,
    ChartModel,
    Query,
} from '@thoughtspot/ts-chart-sdk';

let chartInstance: Chart | null = null;

function render(ctx: CustomChartContext): void {
    const chartModel = ctx.getChartModel();
    const canvas = document.getElementById('chart') as HTMLCanvasElement;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (!chartModel.data || !chartModel.data[0] || !chartModel.data[0].data) {
        console.warn('No data received yet');
        return;
    }

    const dataColumns = chartModel.data[0].data as unknown as Array<{
        columnId: string;
        dataValue: any[];
    }>;

    if (!dataColumns || dataColumns.length === 0) {
        console.warn('Empty data received');
        return;
    }

    const labelColumn = dataColumns[0];
    const valueColumn = dataColumns[1];

    const labels = labelColumn.dataValue.map((val: any) => String(val));
    const values = valueColumn.dataValue.map((val: any) => Number(val));

    const matchedColumn = chartModel.columns.find(
        (col) => col.id === valueColumn.columnId
    );
    const datasetLabel = matchedColumn?.name ?? 'Value';

    chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: datasetLabel,
                    data: values,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                },
            },
        },
    });
}

// RenderStart, RenderError, RenderComplete all inside renderChart
const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (e) {
        ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: e,
        });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

(async () => {
    await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            const cols = chartModel.columns;
            const dimensionColumns = cols.filter(
                (col: ChartColumn) => col.type === ColumnType.ATTRIBUTE
            );
            const measureColumns = cols.filter(
                (col: ChartColumn) => col.type === ColumnType.MEASURE
            );
            return [
                {
                    key: 'default',
                    dimensions: [
                        {
                            key: 'x',
                            columns: dimensionColumns.slice(0, 1),
                        },
                        {
                            key: 'y',
                            columns: measureColumns.slice(0, 1),
                        },
                    ],
                },
            ];
        },

        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Query[] => {
            return chartConfig.map((config: ChartConfig) => ({
                queryColumns: config.dimensions.flatMap(
                    (dim) => dim.columns
                ),
            }));
        },

        visualPropEditorDefinition: {
            elements: [],
        },

        renderChart,
    });
})();