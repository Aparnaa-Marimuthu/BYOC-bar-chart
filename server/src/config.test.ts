import { describe, expect, it } from 'vitest';
import { isDatabricksConfigured, loadConfig } from './config.js';

describe('backend config', () => {
    it('uses safe defaults', () => {
        const config = loadConfig({});

        expect(config.port).toBe(8787);
        expect(config.cacheProvider).toBe('memory');
        expect(config.cacheTtlSeconds).toBe(300);
        expect(config.useMockBackend).toBe(false);
        expect(isDatabricksConfigured(config)).toBe(false);
    });

    it('detects Databricks configuration without exposing secrets', () => {
        const config = loadConfig({
            DATABRICKS_HOST: 'https://example.cloud.databricks.com/',
            DATABRICKS_TOKEN: 'secret-token',
            DATABRICKS_WAREHOUSE_ID: 'warehouse',
            DATABRICKS_CATALOG: 'catalog',
            DATABRICKS_SCHEMA: 'schema',
            DATABRICKS_TABLE: 'table',
        });

        expect(config.databricks.host).toBe('https://example.cloud.databricks.com');
        expect(isDatabricksConfigured(config)).toBe(true);
    });
});
