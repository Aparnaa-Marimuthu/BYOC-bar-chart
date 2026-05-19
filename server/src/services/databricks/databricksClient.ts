import type { BackendConfig } from '../../config.js';
import { ApiError } from '../../types/errors.js';
import { elapsedMs, nowMs } from '../metrics/timings.js';
import type { BuiltSql } from './sqlBuilder.js';
import type { DatabricksExternalLink, DatabricksStatementResponse } from './statementApiTypes.js';

export interface DatabricksQueryResult {
    arrowChunks: Uint8Array[];
    databricksSubmitMs: number;
    databricksWaitMs: number;
    arrowDownloadMs: number;
}

export async function executeDatabricksArrowQuery(
    sql: BuiltSql,
    config: BackendConfig,
    requestId: string,
): Promise<DatabricksQueryResult> {
    const submitStartMs = nowMs();
    const submitted = await databricksFetch<DatabricksStatementResponse>(
        config,
        '/api/2.0/sql/statements/',
        {
            method: 'POST',
            body: JSON.stringify({
                warehouse_id: config.databricks.warehouseId,
                statement: sql.statement,
                parameters: sql.parameters,
                format: 'ARROW_STREAM',
                disposition: 'EXTERNAL_LINKS',
                wait_timeout: config.databricks.waitTimeout,
            }),
            headers: { 'content-type': 'application/json' },
        },
        requestId,
    );
    const databricksSubmitMs = elapsedMs(submitStartMs);
    const waitStartMs = nowMs();
    const finalStatement = await waitForStatement(config, submitted, requestId);
    const databricksWaitMs = elapsedMs(waitStartMs);

    const links = finalStatement.result?.external_links ?? [];
    if (links.length === 0) {
        return {
            arrowChunks: [],
            databricksSubmitMs,
            databricksWaitMs,
            arrowDownloadMs: 0,
        };
    }

    const downloadStartMs = nowMs();
    const arrowChunks = await downloadExternalLinks(links, config.arrowDownloadConcurrency);

    return {
        arrowChunks,
        databricksSubmitMs,
        databricksWaitMs,
        arrowDownloadMs: elapsedMs(downloadStartMs),
    };
}

async function waitForStatement(
    config: BackendConfig,
    statement: DatabricksStatementResponse,
    requestId: string,
): Promise<DatabricksStatementResponse> {
    let current = statement;
    const statementId = current.statement_id;
    const startMs = Date.now();

    while (true) {
        const state = current.status?.state;
        if (state === 'SUCCEEDED') return current;
        if (state === 'FAILED' || state === 'CANCELED' || state === 'CLOSED') {
            throw new ApiError('DB_ERROR', 'Databricks statement did not complete successfully.', 502);
        }
        if (Date.now() - startMs > config.databricks.maxWaitMs) {
            throw new ApiError('TIMEOUT', 'Databricks statement timed out.', 504);
        }

        await sleep(config.databricks.pollIntervalMs);
        current = await databricksFetch<DatabricksStatementResponse>(
            config,
            `/api/2.0/sql/statements/${statementId}`,
            { method: 'GET' },
            requestId,
        );
    }
}

async function databricksFetch<T>(
    config: BackendConfig,
    path: string,
    init: RequestInit,
    requestId: string,
): Promise<T> {
    const response = await fetch(`${config.databricks.host}${path}`, {
        ...init,
        headers: {
            ...(init.headers ?? {}),
            authorization: `Bearer ${config.databricks.token}`,
            'x-byoc-request-id': requestId,
        },
    });

    if (!response.ok) {
        throw new ApiError('DB_ERROR', `Databricks request failed with status ${response.status}.`, 502);
    }

    return response.json() as Promise<T>;
}

async function downloadExternalLinks(
    links: DatabricksExternalLink[],
    concurrency: number,
): Promise<Uint8Array[]> {
    const sortedLinks = [...links].sort((left, right) => left.chunk_index - right.chunk_index);
    const chunks: Uint8Array[] = [];
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < sortedLinks.length) {
            const index = nextIndex;
            nextIndex += 1;
            chunks[index] = await downloadArrowChunk(sortedLinks[index].external_link);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, sortedLinks.length) }, () => worker()),
    );
    return chunks.filter(Boolean);
}

async function downloadArrowChunk(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new ApiError('DB_ERROR', `Databricks Arrow chunk download failed with status ${response.status}.`, 502);
    }
    return new Uint8Array(await response.arrayBuffer());
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
