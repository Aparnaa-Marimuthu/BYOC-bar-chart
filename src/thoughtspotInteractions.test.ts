import { describe, expect, it, vi } from 'vitest';
import { attachRightClickHandler } from './thoughtspotInteractions';
import type { ThoughtSpotInteractionState } from './thoughtspotInteractions';

describe('ThoughtSpot interactions', () => {
    it('attaches right-click listeners idempotently per canvas', () => {
        const canvas = new FakeCanvas();
        const state: ThoughtSpotInteractionState = {
            chart: null,
            rawData: null,
            ctx: { emitEvent: vi.fn() },
        };

        const firstAttach = attachRightClickHandler(
            canvas as unknown as HTMLCanvasElement,
            state,
            { enableCustomDrill: false },
        );
        const secondAttach = attachRightClickHandler(
            canvas as unknown as HTMLCanvasElement,
            state,
            { enableCustomDrill: false },
        );

        expect(firstAttach).toBe(true);
        expect(secondAttach).toBe(false);
        expect(canvas.listenerCount).toBe(2);
        expect(canvas.types).toEqual(['contextmenu', 'click']);
    });
});

class FakeCanvas {
    readonly types: string[] = [];

    get listenerCount(): number {
        return this.types.length;
    }

    addEventListener(type: string): void {
        this.types.push(type);
    }
}
