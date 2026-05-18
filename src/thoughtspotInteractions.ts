import type { RawThoughtSpotData } from './nativeData';
import { THOUGHTSPOT_EVENT } from './thoughtspotConstants';

interface ContextMenuChart {
    getElementsAtEventForMode: (
        event: MouseEvent,
        mode: string,
        options: { intersect: boolean },
        useFinalPosition: boolean,
    ) => Array<{ index: number }>;
}

export interface ThoughtSpotInteractionState {
    chart: ContextMenuChart | null;
    rawData: RawThoughtSpotData | null;
    ctx: ThoughtSpotEventEmitter | null;
}

export interface RightClickOptions {
    enableCustomDrill: boolean;
    onError?: (error: unknown, rowCount?: number) => void;
}

export interface ThoughtSpotEventEmitter {
    emitEvent: (eventType: string, eventPayload?: unknown) => Promise<unknown>;
}

const canvasesWithHandlers = new WeakSet<EventTarget>();

export function attachRightClickHandler(
    canvas: HTMLCanvasElement,
    state: ThoughtSpotInteractionState,
    options: RightClickOptions,
): boolean {
    if (canvasesWithHandlers.has(canvas)) {
        return false;
    }

    canvasesWithHandlers.add(canvas);

    canvas.addEventListener('contextmenu', (event: MouseEvent) => {
        try {
            event.preventDefault();
            if (!state.rawData || !state.chart || !state.ctx) return;

            const points = state.chart.getElementsAtEventForMode(
                event,
                'nearest',
                { intersect: true },
                false,
            );
            if (points.length === 0) return;

            const clickedRow = state.rawData.dataValue[points[0].index];
            if (!clickedRow) return;

            void state.ctx.emitEvent(THOUGHTSPOT_EVENT.OPEN_CONTEXT_MENU, {
                event: { clientX: event.clientX, clientY: event.clientY },
                clickedPoint: {
                    tuple: [
                        {
                            columnId: state.rawData.columns[0],
                            value: clickedRow[0],
                        },
                    ],
                },
            });
        } catch (error: unknown) {
            options.onError?.(error, state.rawData?.dataValue.length);
        }
    });

    canvas.addEventListener('click', () => {
        try {
            if (options.enableCustomDrill) {
                // Future custom drill-down will be isolated behind this flag.
                return;
            }
            void state.ctx?.emitEvent(THOUGHTSPOT_EVENT.CLOSE_CONTEXT_MENU);
        } catch (error: unknown) {
            options.onError?.(error, state.rawData?.dataValue.length);
        }
    });

    return true;
}
