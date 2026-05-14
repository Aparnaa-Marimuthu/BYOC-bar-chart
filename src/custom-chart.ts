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

// Currently drawn chart, raw data and chart model stored globally
// so right-click handler can access them without re-fetching
let chartInstance: Chart | null = null;
let globalRawData: { columns: string[]; dataValue: any[][] } | null = null;
let globalChartModel: ChartModel | null = null;

// Prevents attaching duplicate event listeners on re-renders
let rightClickAttached = false;

function render(ctx: CustomChartContext): void {
    const chartModel = ctx.getChartModel();
    const canvas = document.getElementById('chart') as HTMLCanvasElement;

    // Wipe the existing chart before drawing a new one
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    // Safety check — stop if no data arrived yet
    if (!chartModel.data || !chartModel.data[0] || !chartModel.data[0].data) {
        return;
    }

    // ThoughtSpot sends data as rows: { columns: [ids], dataValue: [[row1], [row2]...] }
    const rawData = chartModel.data[0].data as unknown as {
        columns: string[];
        dataValue: any[][];
    };

    // Safety check — stop if rows are empty
    if (!rawData.dataValue || rawData.dataValue.length === 0) {
        return;
    }

    globalRawData = rawData;
    globalChartModel = chartModel;

    // Check if label column is a date (dataType 7 = DATE in ThoughtSpot)
    // so we can convert unix timestamp to readable format like "May 2025"
    const labelColumnId = rawData.columns[0];
    const labelColumnInfo = chartModel.columns.find(col => col.id === labelColumnId);
    const isLabelDate = labelColumnInfo?.dataType === 7;

    // Find value column name to show in the chart legend
    const valueColumnId = rawData.columns[1];
    const valueColumnInfo = chartModel.columns.find(col => col.id === valueColumnId);

    // Build Y axis labels — format as readable date if date column, otherwise use as-is
    const labels = rawData.dataValue.map((row: any[]) => {
        if (isLabelDate) {
            const date = new Date(Number(row[0]) * 1000);
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        return String(row[0]);
    });

    // Build X axis values — always numeric for a bar chart
    const values = rawData.dataValue.map((row: any[]) => Number(row[1]));
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
            indexAxis: 'y', // Makes bars horizontal
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                    duration: 800,
                    easing: 'easeInOutQuart',
                },
                animations: {
                    x: {
                        type: 'number' as const,
                        easing: 'easeInOutQuart',
                        duration: 800,
                        from: 0,
                    },
                    y: {
                        duration: 0,
                    },
                },
            plugins: {
                legend: { display: true },
            },
            scales: {
                x: { beginAtZero: true },
            },
            // Show pointer cursor when hovering over a bar
            onHover: (event, elements) => {
                const nativeCanvas = event.native?.target as HTMLCanvasElement;
                if (nativeCanvas) {
                    nativeCanvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                }
            },
        },
    });

    // Attach right-click handler after chart is drawn
    attachRightClickHandler(canvas, ctx);
}

function attachRightClickHandler(canvas: HTMLCanvasElement, ctx: CustomChartContext): void {
    // Only attach once — skip if already attached to prevent duplicate listeners
    if (rightClickAttached) return;
    rightClickAttached = true;

    // Right-click — find the clicked bar and open ThoughtSpot's native context menu
    canvas.addEventListener('contextmenu', (event: MouseEvent) => {
        event.preventDefault();
        if (!globalRawData || !globalChartModel || !chartInstance) return;

        const points = chartInstance.getElementsAtEventForMode(
            event, 'nearest', { intersect: true }, false
        );
        if (points.length === 0) return;

        const clickedRow = globalRawData.dataValue[points[0].index];
        if (!clickedRow) return;

        // Tell ThoughtSpot which bar was clicked so it shows the correct filter options
        ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
            event: { clientX: event.clientX, clientY: event.clientY },
            clickedPoint: {
                tuple: [
                    {
                        columnId: globalRawData.columns[0],
                        value: clickedRow[0],
                    },
                ],
            },
        });
    });

    // Left-click anywhere on chart — close the context menu
    canvas.addEventListener('click', () => {
        ctx.emitEvent(ChartToTSEvent.CloseContextMenu);
    });
}

// ThoughtSpot calls this when it wants the chart drawn
// RenderStart → draw → RenderComplete is mandatory — missing RenderComplete causes timeout
async function renderChart(ctx: CustomChartContext): Promise<void> {
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    render(ctx);
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
}

(async () => {
    const ctx = await getChartContext({

        // Tells ThoughtSpot what column slots the chart needs —
        // first attribute column for labels, first measure column for values
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
                        { key: 'x', columns: dimensionColumns.slice(0, 1) },
                        { key: 'y', columns: measureColumns.slice(0, 1) },
                    ],
                },
            ];
        },

        // Tells ThoughtSpot which columns to fetch data for
        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Query[] => {
            return chartConfig.map((config: ChartConfig) => ({
                queryColumns: config.dimensions.flatMap((dim) => dim.columns),
            }));
        },

        // Builds the drag-and-drop panel in ThoughtSpot's right side panel
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

        // No custom styling panel needed — empty elements prevents a crash
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