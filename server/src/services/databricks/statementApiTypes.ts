export interface DatabricksStatementResponse {
    statement_id: string;
    status?: {
        state: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'CLOSED';
        error?: {
            message?: string;
        };
    };
    manifest?: DatabricksManifest;
    result?: {
        external_links?: DatabricksExternalLink[];
    };
}

export interface DatabricksManifest {
    chunks?: Array<{
        chunk_index: number;
        row_count?: number;
        row_offset?: number;
    }>;
}

export interface DatabricksExternalLink {
    chunk_index: number;
    external_link: string;
    expiration?: string;
}
