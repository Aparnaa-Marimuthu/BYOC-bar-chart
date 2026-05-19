import type { BackendConfig } from '../../config.js';
import type { ChartDataRequest } from '../../types/chart.js';
import { ApiError } from '../../types/errors.js';

export interface SqlParameter {
    name: string;
    value: string;
    type?: 'STRING' | 'DATE' | 'INT';
}

export interface BuiltSql {
    statement: string;
    parameters: SqlParameter[];
}

const DIMENSION_COLUMNS: Record<string, string> = {
    product_category: 'product_category',
    product_name: 'product_name',
    region: 'region',
    channel: 'channel',
    location_name: 'location_name',
    base: 'base',
};

const METRIC_EXPRESSIONS: Record<string, string> = {
    revenue: 'SUM(revenue)',
    units_sold: 'SUM(units_sold)',
    order_count: 'COUNT(*)',
    first_ninety_day_attrition_rate: 'AVG(first_ninety_day_attrition_rate)',
    average_turn_time: 'AVG(average_turn_time)',
    average_turnaround_time_min: 'AVG(average_turnaround_time_min)',
};

export function buildChartSql(request: ChartDataRequest, config: BackendConfig): BuiltSql {
    const dimensionColumn = DIMENSION_COLUMNS[request.dimension];
    const metricExpression = METRIC_EXPRESSIONS[request.metric];
    if (!dimensionColumn) {
        throw new ApiError('BAD_REQUEST', 'Unsupported dimension.', 400);
    }
    if (!metricExpression) {
        throw new ApiError('BAD_REQUEST', 'Unsupported metric.', 400);
    }
    if (!config.databricks.catalog || !config.databricks.schema || !config.databricks.table) {
        throw new ApiError('CONFIG_ERROR', 'Databricks table configuration is missing.', 500);
    }

    const tableName = [
        quoteIdentifier(config.databricks.catalog),
        quoteIdentifier(config.databricks.schema),
        quoteIdentifier(config.databricks.table),
    ].join('.');
    const whereClauses = ['1=1'];
    const parameters: SqlParameter[] = [];

    if (request.filters?.dateRange) {
        whereClauses.push('order_date BETWEEN :start_date AND :end_date');
        parameters.push(
            { name: 'start_date', value: request.filters.dateRange[0], type: 'DATE' },
            { name: 'end_date', value: request.filters.dateRange[1], type: 'DATE' },
        );
    }

    if (request.filters?.parentDimension && request.filters.parentValue !== undefined) {
        const parentColumn = DIMENSION_COLUMNS[request.filters.parentDimension];
        if (!parentColumn) {
            throw new ApiError('BAD_REQUEST', 'Unsupported parent dimension.', 400);
        }
        whereClauses.push(`${quoteIdentifier(parentColumn)} = :parent_value`);
        parameters.push({
            name: 'parent_value',
            value: String(request.filters.parentValue),
            type: 'STRING',
        });
    }

    const statement = `
SELECT
  CAST(${quoteIdentifier(dimensionColumn)} AS STRING) AS label,
  CAST(${metricExpression} AS DOUBLE) AS value
FROM ${tableName}
WHERE ${whereClauses.join('\n  AND ')}
GROUP BY ${quoteIdentifier(dimensionColumn)}
ORDER BY value ${request.sort?.direction === 'asc' ? 'ASC' : 'DESC'}
LIMIT ${request.limit ?? 100}
`.trim();

    return { statement, parameters };
}

function quoteIdentifier(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
        throw new ApiError('BAD_REQUEST', 'Unsafe SQL identifier.', 400);
    }
    return `\`${identifier}\``;
}
