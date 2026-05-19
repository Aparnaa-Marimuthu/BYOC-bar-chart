import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import type { ChartDataRequest } from '../../types/chart.js';
import { buildChartSql } from './sqlBuilder.js';

describe('Databricks SQL builder', () => {
    const config = loadConfig({
        DATABRICKS_CATALOG: 'catalog',
        DATABRICKS_SCHEMA: 'schema',
        DATABRICKS_TABLE: 'orders',
    });

    it('builds aggregate SQL with date and parent filters', () => {
        const sql = buildChartSql(
            createRequest({
                filters: {
                    dateRange: ['2026-01-01', '2026-12-31'],
                    parentDimension: 'region',
                    parentValue: 'West',
                    extra: {},
                },
            }),
            config,
        );

        expect(sql.statement).toContain('CAST(`location_name` AS STRING) AS label');
        expect(sql.statement).toContain('CAST(SUM(revenue) AS DOUBLE) AS value');
        expect(sql.statement).toContain('order_date BETWEEN :start_date AND :end_date');
        expect(sql.statement).toContain('`region` = :parent_value');
        expect(sql.statement).toContain('LIMIT 100');
        expect(sql.parameters).toHaveLength(3);
    });

    it('maps order_count to count star', () => {
        expect(buildChartSql(createRequest({ metric: 'order_count' }), config).statement).toContain('CAST(COUNT(*) AS DOUBLE)');
    });

    it('rejects invalid identifiers', () => {
        expect(() => buildChartSql(createRequest({ dimension: 'unsafe_dimension' }), config)).toThrow('Unsupported dimension');
        expect(() => buildChartSql(createRequest({ metric: 'unsafe_metric' }), config)).toThrow('Unsupported metric');
    });
});

function createRequest(overrides: Partial<ChartDataRequest> = {}): ChartDataRequest {
    return {
        chartType: 'bar',
        mode: 'chart',
        dimension: 'location_name',
        metric: 'revenue',
        filters: { extra: {} },
        sort: { field: 'value', direction: 'desc' },
        limit: 100,
        context: {
            tenantId: 'dev-tenant',
            userId: 'dev-user',
            securityContextHash: 'dev-security',
        },
        returnFormat: 'json',
        ...overrides,
    };
}
