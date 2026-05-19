import { describe, expect, it } from 'vitest';
import {
    getByocRuntimeConfig,
    MAX_BARS_HARD_LIMIT,
    THOUGHTSPOT_QUERY_HARD_LIMIT,
} from './config';

describe('BYOC runtime config', () => {
    it('uses safe defaults', () => {
        const config = getByocRuntimeConfig({});

        expect(config.querySize).toBe(1000);
        expect(config.maxBars).toBe(1000);
        expect(config.debug).toBe(false);
        expect(config.debugData).toBe(false);
        expect(config.enableCustomDrill).toBe(false);
        expect(config.dataMode).toBe('native');
        expect(config.backendUrl).toBe('http://localhost:8787');
    });

    it('clamps numeric environment values', () => {
        expect(
            getByocRuntimeConfig({
                VITE_BYOC_QUERY_SIZE: '999999',
                VITE_BYOC_MAX_BARS: '999999',
            }),
        ).toMatchObject({
            querySize: THOUGHTSPOT_QUERY_HARD_LIMIT,
            maxBars: MAX_BARS_HARD_LIMIT,
        });

        expect(
            getByocRuntimeConfig({
                VITE_BYOC_QUERY_SIZE: '-25',
                VITE_BYOC_MAX_BARS: '0',
            }),
        ).toMatchObject({
            querySize: 1,
            maxBars: 1,
        });
    });

    it('parses backend data mode config safely', () => {
        expect(
            getByocRuntimeConfig({
                VITE_BYOC_DATA_MODE: 'backend',
                VITE_BYOC_BACKEND_URL: 'https://backend.example.com/',
                VITE_BYOC_BACKEND_TIMEOUT_MS: '5000',
                VITE_BYOC_BACKEND_CACHE_DEBUG: 'true',
            }),
        ).toMatchObject({
            dataMode: 'backend',
            backendUrl: 'https://backend.example.com',
            backendTimeoutMs: 5000,
            backendCacheDebug: true,
        });

        expect(getByocRuntimeConfig({ VITE_BYOC_DATA_MODE: 'bad-value' }).dataMode).toBe('native');
    });
});
