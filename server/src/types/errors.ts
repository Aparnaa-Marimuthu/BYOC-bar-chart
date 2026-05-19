export type ErrorCode =
    | 'AUTH_REQUIRED'
    | 'BAD_REQUEST'
    | 'CACHE_ERROR'
    | 'DB_ERROR'
    | 'ARROW_PARSE_ERROR'
    | 'TIMEOUT'
    | 'CONFIG_ERROR';

export class ApiError extends Error {
    code: ErrorCode;
    statusCode: number;

    constructor(code: ErrorCode, message: string, statusCode = 500) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

export interface ErrorResponse {
    error: {
        code: ErrorCode;
        message: string;
        requestId: string;
    };
}
