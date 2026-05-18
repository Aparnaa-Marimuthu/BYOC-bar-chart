export type ChartUiState =
    | 'ready'
    | 'loading'
    | 'empty'
    | 'invalid-config'
    | 'missing-canvas'
    | 'unsupported-columns'
    | 'error';

const DEFAULT_STATE_MESSAGES: Record<Exclude<ChartUiState, 'ready'>, string> = {
    loading: 'Loading chart data...',
    empty: 'No data to display.',
    'invalid-config': 'Configure one label column and one measure column.',
    'missing-canvas': 'Chart canvas was not found.',
    'unsupported-columns': 'This chart needs one label column and one numeric value column.',
    error: 'Unable to render chart.',
};

export function getUiStateMessage(state: ChartUiState, message?: string): string {
    if (state === 'ready') return '';
    return message || DEFAULT_STATE_MESSAGES[state];
}

export function setChartUiState(state: ChartUiState, message?: string): void {
    const stateElement = document.getElementById('chart-state');
    const canvas = document.getElementById('chart') as HTMLCanvasElement | null;

    if (canvas) {
        canvas.hidden = state !== 'ready';
    }

    if (!stateElement) {
        return;
    }

    if (state === 'ready') {
        stateElement.hidden = true;
        stateElement.textContent = '';
        return;
    }

    stateElement.hidden = false;
    stateElement.textContent = getUiStateMessage(state, message);
}
