import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { parseArrowChunksToRows } from './arrowParser.js';

describe('Arrow parser', () => {
    it('converts Arrow IPC chunks to chart rows', () => {
        const table = tableFromArrays({
            label: ['A', 'B'],
            value: Float64Array.from([12.34, 56.78]),
        });
        const ipc = tableToIPC(table, 'stream');

        expect(parseArrowChunksToRows([ipc], 10)).toEqual([
            { label: 'A', value: 12.34 },
            { label: 'B', value: 56.78 },
        ]);
    });
});
