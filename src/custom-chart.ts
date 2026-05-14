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

const log = (...msg: any[]) => console.log('[BAR-CHART]', ...msg);

function render(ctx: CustomChartContext): void {
    log('render() called');
    const chartModel = ctx.getChartModel();
    const canvas = document.getElementById('chart') as HTMLCanvasElement;

    if (chartInstance) {
        log('Destroying existing chart instance');
        chartInstance.destroy();
        chartInstance = null;
    }

    if (!chartModel.data || !chartModel.data[0] || !chartModel.data[0].data) {
        log('WARNING: No data in chartModel');
        return;
    }

    // Real ThoughtSpot data: { columns: [...ids], dataValue: [[row1], [row2], ...] }
    const rawData = chartModel.data[0].data as unknown as {
        columns: string[];
        dataValue: any[][];
    };

    log('Row count:', rawData.dataValue?.length);
    log('Column IDs:', rawData.columns);
    log('Sample row[0]:', rawData.dataValue?.[0]);

    if (!rawData.dataValue || rawData.dataValue.length === 0) {
        log('WARNING: dataValue is empty');
        return;
    }

    // Find label column info
    const labelColumnId = rawData.columns[0];
    const labelColumnInfo = chartModel.columns.find(col => col.id === labelColumnId);
    log('Label column name:', labelColumnInfo?.name);
    log('Label column dataType:', labelColumnInfo?.dataType);

    // dataType 7 = DATE in ThoughtSpot
    const isLabelDate = labelColumnInfo?.dataType === 7;
    log('Is label column a date?', isLabelDate);

    // Find value column info
    const valueColumnId = rawData.columns[1];
    const valueColumnInfo = chartModel.columns.find(col => col.id === valueColumnId);
    log('Value column name:', valueColumnInfo?.name);
    log('Value column dataType:', valueColumnInfo?.dataType);

    // Build labels — if date column, convert unix timestamp to readable date
    const labels = rawData.dataValue.map((row: any[]) => {
        if (isLabelDate) {
            const date = new Date(Number(row[0]) * 1000);
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        return String(row[0]);
    });

    // Build values — always numeric for bar chart
    const values = rawData.dataValue.map((row: any[]) => Number(row[1]));

    log('Labels sample:', labels.slice(0, 3));
    log('Values sample:', values.slice(0, 3));

    const datasetLabel = valueColumnInfo?.name ?? 'Value';
    log('Dataset label:', datasetLabel);

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
                legend: { display: true },
            },
            scales: {
                x: { beginAtZero: true },
            },
        },
    });

    log('Chart rendered successfully');
}

async function renderChart(ctx: CustomChartContext): Promise<void> {
    log('renderChart() called by ThoughtSpot');
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    log('RenderStart emitted');
    render(ctx);
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
    log('RenderComplete emitted');
}

(async () => {
    log('Initializing getChartContext...');

    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            log('getDefaultChartConfig called');
            const cols = chartModel.columns;
            log('Total columns received:', cols.length);

            const dimensionColumns = cols.filter(
                (col: ChartColumn) => col.type === ColumnType.ATTRIBUTE
            );
            const measureColumns = cols.filter(
                (col: ChartColumn) => col.type === ColumnType.MEASURE
            );

            log('Dimension columns:', dimensionColumns.map(c => c.name));
            log('Measure columns:', measureColumns.map(c => c.name));

            return [
                {
                    key: 'default',
                    dimensions: [
                        { key: 'x', columns: dimensionColumns.slice(0, 1) },
                        { key: 'y', columns: measureColumns.slice(0, 1) },
                    ],
                },
            ];
        },

        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Query[] => {
            log('getQueriesFromChartConfig called');
            const queries = chartConfig.map((config: ChartConfig) => ({
                queryColumns: config.dimensions.flatMap((dim) => dim.columns),
            }));
            log('Queries built successfully, column count:',
                queries[0]?.queryColumns?.length
            );
            return queries;
        },

        visualPropEditorDefinition: {
            elements: [],
        },

        renderChart,
    });

    log('getChartContext resolved — ctx ready');

    const checkAndRender = async (): Promise<boolean> => {
        log('checkAndRender() called');
        const chartModel = ctx.getChartModel();
        const hasData = chartModel?.data?.[0]?.data;
        log('hasData:', !!hasData);

        if (hasData) {
            log('Data available — calling renderChart');
            await renderChart(ctx);
            return true;
        }

        log('No data yet — will retry');
        return false;
    };

    const rendered = await checkAndRender();

    if (!rendered) {
        log('First attempt had no data — starting poll');
        let attempts = 0;
        const maxAttempts = 15;

        const pollInterval = setInterval(async () => {
            attempts++;
            log(`Poll attempt ${attempts}/${maxAttempts}`);
            const success = await checkAndRender();
            if (success) {
                log('Poll succeeded — stopping');
                clearInterval(pollInterval);
            } else if (attempts >= maxAttempts) {
                log('Max poll attempts reached — giving up');
                clearInterval(pollInterval);
            }
        }, 2000);
    } else {
        log('Rendered on first attempt');
    }
})();