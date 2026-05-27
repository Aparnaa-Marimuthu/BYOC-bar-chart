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
        expect(sql.statement).toContain('CAST(SUM(`revenue`) AS DOUBLE) AS value');
        expect(sql.statement).toContain('order_date BETWEEN :start_date AND :end_date');
        expect(sql.statement).toContain('`region` = :parent_value');
        expect(sql.statement).toContain('LIMIT 100');
        expect(sql.parameters).toHaveLength(3);
    });

    it('maps order_count to transaction count', () => {
        expect(buildChartSql(createRequest({ metric: 'order_count' }), config).statement).toContain('CAST(COUNT(`txn_id`) AS DOUBLE)');
    });

    it.each([
        ['total_revenue', 'CAST(SUM(`revenue`) AS DOUBLE)'],
        ['sum_revenue', 'CAST(SUM(`revenue`) AS DOUBLE)'],
        ['total_profit', 'CAST(SUM(`profit`) AS DOUBLE)'],
        ['total_units_sold', 'CAST(SUM(`units_sold`) AS DOUBLE)'],
        ['average_discount_pct', 'CAST(AVG(`discount_pct`) AS DOUBLE)'],
        [
            'average_first_ninety_day_attrition_rate',
            'CAST(AVG(`first_ninety_day_attrition_rate`) AS DOUBLE)',
        ],
        ['count_txn_id', 'CAST(COUNT(`txn_id`) AS DOUBLE)'],
    ])('resolves %s to %s', (metric, expression) => {
        expect(buildChartSql(createRequest({ metric }), config).statement).toContain(expression);
    });

    it('returns FIELD_UNRESOLVED for unsupported Databricks fields', () => {
        expect(() => buildChartSql(createRequest({ dimension: 'unsafe_dimension' }), config)).toThrow('Backend could not safely resolve');
        expect(() => buildChartSql(createRequest({ metric: 'unsafe_metric' }), config)).toThrow('Backend could not safely resolve');
    });

    it('uses only resolved physical column names in SQL', () => {
        const sql = buildChartSql(
            createRequest({
                metric: 'total_revenue',
                fields: {
                    metric: {
                        displayName: 'Total Revenue',
                        normalizedName: 'total_revenue',
                        columnId: 'total_revenue',
                    },
                },
            }),
            config,
        );

        expect(sql.statement).toContain('SUM(`revenue`)');
        expect(sql.statement).not.toContain('SUM(`total_revenue`)');
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
