import { describe, expect, it } from 'vitest';
import { TRUNCATION_WARNING_MESSAGE } from './performance';
import { getUiStateMessage } from './uiState';

describe('UI state messages', () => {
    it('returns explicit empty and error messages', () => {
        expect(getUiStateMessage('empty')).toBe('No data to display.');
        expect(getUiStateMessage('missing-canvas')).toBe('Chart canvas was not found.');
        expect(getUiStateMessage('error', 'Safe error')).toBe('Safe error');
    });

    it('does not imply truncated rows are top-ranked results', () => {
        expect(TRUNCATION_WARNING_MESSAGE.toLowerCase()).not.toContain('top');
        expect(TRUNCATION_WARNING_MESSAGE).toContain('incoming order');
    });
});
