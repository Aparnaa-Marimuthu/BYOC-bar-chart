import Chart from 'chart.js/auto';
import type { Chart as ChartInstance, ChartConfiguration, UpdateMode } from 'chart.js';
import type { NativeChartData } from './nativeData';

export type NativeBarChart = ChartInstance<'bar', number[], string>;

export function createBarChart(
    canvas: HTMLCanvasElement,
    data: NativeChartData,
    animationFreeRowThreshold: number,
): NativeBarChart {
    return new Chart(canvas, buildBarChartConfig(data, animationFreeRowThreshold));
}

export function updateExistingChart(
    chart: NativeBarChart,
    data: NativeChartData,
    animationFreeRowThreshold: number,
): UpdateMode | undefined {
    chart.data.labels = data.labels;

    if (!chart.data.datasets[0]) {
        chart.data.datasets[0] = createDataset(data);
    } else {
        chart.data.datasets[0].label = data.datasetLabel;
        chart.data.datasets[0].data = data.values;
    }

    const updateMode = getChartUpdateMode(data, animationFreeRowThreshold);
    chart.update(updateMode);
    return updateMode;
}

export function getChartUpdateMode(
    data: Pick<NativeChartData, 'rowsRendered'>,
    animationFreeRowThreshold: number,
): UpdateMode | undefined {
    return data.rowsRendered >= animationFreeRowThreshold ? 'none' : undefined;
}

function buildBarChartConfig(
    data: NativeChartData,
    animationFreeRowThreshold: number,
): ChartConfiguration<'bar', number[], string> {
    const useAnimation = data.rowsRendered < animationFreeRowThreshold;

    return {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [createDataset(data)],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: useAnimation
                ? {
                      duration: 800,
                      easing: 'easeInOutQuart',
                  }
                : false,
            animations: useAnimation
                ? {
                      x: {
                          type: 'number',
                          easing: 'easeInOutQuart',
                          duration: 800,
                          from: 0,
                      },
                      y: {
                          duration: 0,
                      },
                  }
                : undefined,
            plugins: {
                legend: { display: true },
            },
            scales: {
                x: { beginAtZero: true },
            },
            onHover: (event, elements) => {
                const nativeCanvas = event.native?.target as HTMLCanvasElement | null;
                if (nativeCanvas) {
                    nativeCanvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                }
            },
        },
    };
}

function createDataset(data: NativeChartData) {
    return {
        label: data.datasetLabel,
        data: data.values,
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
    };
}
