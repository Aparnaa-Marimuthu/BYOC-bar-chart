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

// Stores the raw data globally so right-click handler can identify which bar was clicked
let globalRawData: { columns: string[]; dataValue: any[][] } | null = null;
let globalChartModel: ChartModel | null = null;

function render(ctx: CustomChartContext): void {
    const chartModel = ctx.getChartModel();
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

    // Store globally for right-click handler
    globalRawData = rawData;
    globalChartModel = chartModel;

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

    // Draw the horizontal bar chart with left-to-right grow animation
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
            // Bars grow from left to right every time chart renders
            animation: {
                duration: 800,
                easing: 'easeInOutQuart',
            },
            plugins: {
                legend: { display: true },
            },
            scales: {
                x: { beginAtZero: true },
            },
            // Capture right-click on bars to open ThoughtSpot's native context menu
            onHover: (event, elements) => {
                const canvas = event.native?.target as HTMLCanvasElement;
                if (canvas) {
                    canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                }
            },
        },
    });

    // Attach right-click handler to canvas after chart is drawn
    attachRightClickHandler(canvas, ctx);
}

function attachRightClickHandler(canvas: HTMLCanvasElement, ctx: CustomChartContext): void {
    // Remove any existing right-click listener to avoid duplicates
    const newCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
    canvas.parentNode?.replaceChild(newCanvas, canvas);

    // Re-get the canvas after replacement
    const freshCanvas = document.getElementById('chart') as HTMLCanvasElement;

    freshCanvas.addEventListener('contextmenu', (event: MouseEvent) => {
        // Stop browser's default right-click menu from appearing
        event.preventDefault();

        if (!globalRawData || !globalChartModel || !chartInstance) return;

        // Find which bar was right-clicked using Chart.js's getElementsAtEventForMode
        const points = chartInstance.getElementsAtEventForMode(
            event,
            'nearest',
            { intersect: true },
            false
        );

        if (points.length === 0) return;

        // Get the index of the clicked bar
        const clickedIndex = points[0].index;
        const clickedRow = globalRawData.dataValue[clickedIndex];

        if (!clickedRow) return;

        // Get the label column ID — this is what ThoughtSpot uses to filter
        const labelColumnId = globalRawData.columns[0];

        // Build the clicked point — tells ThoughtSpot which data point was clicked
        const clickedPoint = {
            tuple: [
                {
                    columnId: labelColumnId,
                    value: clickedRow[0], // the actual value of the clicked bar label
                },
            ],
        };

        // Open ThoughtSpot's native context menu at the cursor position
        ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
            event: {
                clientX: event.clientX,
                clientY: event.clientY,
            },
            clickedPoint,
        });
    });

    // Left click anywhere closes the context menu
    freshCanvas.addEventListener('click', () => {
        ctx.emitEvent(ChartToTSEvent.CloseContextMenu);
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
                descriptionText: 'X Axis accepts text or date columns. Y Axis accepts number columns only.',
                columnSections: [
                    {
                        key: 'x',
                        label: 'X Axis — Categories / Labels',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        allowTimeSeriesColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'y',
                        label: 'Y Axis — Values / Numbers',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        allowTimeSeriesColumns: false,
                        maxColumnCount: 1,
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