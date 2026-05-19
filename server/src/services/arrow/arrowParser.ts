import { tableFromIPC } from 'apache-arrow';
import { ApiError } from '../../types/errors.js';
import type { ChartRow } from '../../types/chart.js';

export function parseArrowChunksToRows(chunks: Uint8Array[], limit: number): ChartRow[] {
    try {
        const rows: ChartRow[] = [];
        for (const chunk of chunks) {
            const table = tableFromIPC(chunk);
            const labelVector = table.getChild('label');
            const valueVector = table.getChild('value');
            if (!labelVector || !valueVector) {
                throw new ApiError('ARROW_PARSE_ERROR', 'Arrow result is missing label or value columns.', 502);
            }

            for (let index = 0; index < table.numRows && rows.length < limit; index += 1) {
                const label = String(labelVector.get(index) ?? '');
                const value = Number(valueVector.get(index));
                if (!label || !Number.isFinite(value)) continue;
                rows.push({ label, value });
            }
            if (rows.length >= limit) break;
        }
        return rows;
    } catch (error: unknown) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('ARROW_PARSE_ERROR', 'Unable to parse Databricks Arrow result.', 502);
    }
}
