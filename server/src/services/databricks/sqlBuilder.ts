import type { BackendConfig } from '../../config.js';
import { resolveDimension, resolveMetric } from '../fieldResolver.js';
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

export function buildChartSql(request: ChartDataRequest, config: BackendConfig): BuiltSql {
    const resolvedDimension = request.resolvedDimension ??
        resolveDimension(request.dimension, config, request.fields?.dimension);
    const resolvedMetric = request.resolvedMetric ??
        resolveMetric(request.metric, config, request.fields?.metric);
    if (!resolvedDimension || !resolvedMetric) {
        throw new ApiError(
            'FIELD_UNRESOLVED',
            'Backend could not safely resolve the selected fields.',
            400,
        );
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
        const parentDimension = resolveDimension(request.filters.parentDimension, config);
        if (!parentDimension) {
            throw new ApiError('FIELD_UNRESOLVED', 'Backend could not safely resolve the parent dimension.', 400);
        }
        whereClauses.push(`${quoteIdentifier(parentDimension.columnName)} = :parent_value`);
        parameters.push({
            name: 'parent_value',
            value: String(request.filters.parentValue),
            type: 'STRING',
        });
    }

    const statement = `
SELECT
  CAST(${quoteIdentifier(resolvedDimension.columnName)} AS STRING) AS label,
  CAST(${resolvedMetric.aggregation}(${quoteIdentifier(resolvedMetric.columnName)}) AS DOUBLE) AS value
FROM ${tableName}
WHERE ${whereClauses.join('\n  AND ')}
GROUP BY ${quoteIdentifier(resolvedDimension.columnName)}
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
