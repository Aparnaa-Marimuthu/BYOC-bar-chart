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

// The currently drawn chart — stored so we can destroy it before redrawing
let chartInstance: Chart | null = null;

function render(ctx: CustomChartContext): void {
    // Get the data ThoughtSpot sent
    const chartModel = ctx.getChartModel();

    // Find the canvas element in index.html to draw on
    const canvas = document.getElementById('chart') as HTMLCanvasElement;

    // Wipe the existing chart before drawing a new one
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    // Safety check — if no data arrived yet, stop here
    if (!chartModel.data || !chartModel.data[0] || !chartModel.data[0].data) {
        return;
    }

    // ThoughtSpot sends data as rows: { columns: [ids], dataValue: [[row1], [row2]...] }
    const rawData = chartModel.data[0].data as unknown as {
        columns: string[];
        dataValue: any[][];
    };

    // Safety check — if rows are empty, stop here
    if (!rawData.dataValue || rawData.dataValue.length === 0) {
        return;
    }

    // Find label column info — check if it's a date type (dataType 7 = DATE in ThoughtSpot)
    const labelColumnId = rawData.columns[0];
    const labelColumnInfo = chartModel.columns.find(col => col.id === labelColumnId);
    const isLabelDate = labelColumnInfo?.dataType === 7;

    // Find value column info — used for the dataset label in the legend
    const valueColumnId = rawData.columns[1];
    const valueColumnInfo = chartModel.columns.find(col => col.id === valueColumnId);

    // Build Y axis labels — convert unix timestamp to readable date if it's a date column
    const labels = rawData.dataValue.map((row: any[]) => {
        if (isLabelDate) {
            const date = new Date(Number(row[0]) * 1000);
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        return String(row[0]);
    });

    // Build X axis values — always numeric for a bar chart
    const values = rawData.dataValue.map((row: any[]) => Number(row[1]));

    // The name shown in the chart legend
    const datasetLabel = valueColumnInfo?.name ?? 'Value';

    // Draw the horizontal bar chart on the canvas
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
            indexAxis: 'y', // Makes the bar chart horizontal
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
}

// ThoughtSpot calls this function when it wants the chart to draw
// Must emit RenderStart → draw → RenderComplete — otherwise ThoughtSpot times out
async function renderChart(ctx: CustomChartContext): Promise<void> {
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    render(ctx);
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
}

(async () => {
    const ctx = await getChartContext({

        // Tells ThoughtSpot what column slots your chart needs by default
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            const cols = chartModel.columns;

            // Separate columns into text/date (attributes) and numbers (measures)
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
                        // First attribute column goes to X slot (labels)
                        { key: 'x', columns: dimensionColumns.slice(0, 1) },
                        // First measure column goes to Y slot (values)
                        { key: 'y', columns: measureColumns.slice(0, 1) },
                    ],
                },
            ];
        },

        // Tells ThoughtSpot which columns to actually fetch data for
        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Query[] => {
            return chartConfig.map((config: ChartConfig) => ({
                queryColumns: config.dimensions.flatMap((dim) => dim.columns),
            }));
        },

        // Defines the drag-and-drop panel shown in ThoughtSpot's right side panel
        chartConfigEditorDefinition: [
            {
                key: 'default',
                label: 'Bar Chart Configuration',
                // descriptionText is valid here at top level only — not inside columnSections
                descriptionText: 'X Axis accepts text or date columns. Y Axis accepts number columns only.',
                columnSections: [
                    {
                        key: 'x',
                        label: 'X Axis — Categories / Labels',
                        allowAttributeColumns: true,  // allows text and date columns
                        allowMeasureColumns: false,    // blocks number columns
                        allowTimeSeriesColumns: true,  // allows date columns like Month(Calendar Date)
                        maxColumnCount: 1,             // only 1 column allowed
                    },
                    {
                        key: 'y',
                        label: 'Y Axis — Values / Numbers',
                        allowAttributeColumns: false,  // blocks text columns
                        allowMeasureColumns: true,     // allows number columns only
                        allowTimeSeriesColumns: false, // blocks date columns
                        maxColumnCount: 1,             // only 1 column allowed
                    },
                ],
            },
        ],

        // Tells ThoughtSpot this chart has no custom styling panel — prevents a crash
        visualPropEditorDefinition: {
            elements: [],
        },

        renderChart,
    });

    // Check if data is already available and render immediately
    const checkAndRender = async (): Promise<boolean> => {
        const chartModel = ctx.getChartModel();
        const hasData = chartModel?.data?.[0]?.data;
        if (hasData) {
            await renderChart(ctx);
            return true;
        }
        return false;
    };

    const rendered = await checkAndRender();

    // If no data yet, retry every 2 seconds up to 15 times
    if (!rendered) {
        let attempts = 0;
        const maxAttempts = 15;
        const pollInterval = setInterval(async () => {
            attempts++;
            const success = await checkAndRender();
            if (success || attempts >= maxAttempts) {
                clearInterval(pollInterval);
            }
        }, 2000);
    }
})();