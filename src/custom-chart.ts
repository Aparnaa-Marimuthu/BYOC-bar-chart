import Chart from 'chart.js/auto';

// Dummy data to test the chart renders correctly
const labels = ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'];
const values = [120, 85, 200, 150, 95];

const canvas = document.getElementById('chart') as HTMLCanvasElement;

new Chart(canvas, {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [
            {
                label: 'Sales',
                data: values,
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
            },
        ],
    },
    options: {
        indexAxis: 'y', // 👈 This is what makes it HORIZONTAL
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