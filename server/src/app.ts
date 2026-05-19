import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config, type BackendConfig } from './config.js';
import { logError } from './logger.js';
import { registerCacheRoutes } from './routes/cache.js';
import { registerChartDataRoute } from './routes/chartData.js';
import { registerHealthRoute } from './routes/health.js';
import { createCacheProvider } from './services/cache/index.js';
import { ApiError } from './types/errors.js';

export async function createApp(appConfig: BackendConfig = config) {
    const app = Fastify({
        logger: false,
        bodyLimit: 256 * 1024,
        requestTimeout: appConfig.requestTimeoutMs,
    });

    await app.register(cors, {
        origin: (origin, callback) => {
            if (!origin || isAllowedOrigin(origin, appConfig.allowedOrigins)) {
                callback(null, true);
                return;
            }
            callback(new Error('Origin is not allowed by CORS.'), false);
        },
    });

    const rateLimiter = createRateLimiter(appConfig);
    app.addHook('preHandler', async (request) => {
        rateLimiter(request.ip);
    });

    app.setErrorHandler((error, request, reply) => {
        const requestId = getRequestId(request.body, request.headers['x-request-id']);
        const apiError = error instanceof ApiError ? error : null;
        const statusCode = apiError?.statusCode ?? 500;
        const code = apiError?.code ?? 'CONFIG_ERROR';
        const message = apiError?.message ?? 'Unexpected backend error.';
        logError('[BYOC:backend:error]', {
            requestId,
            code,
            message,
            statusCode,
        });
        void reply.status(statusCode).send({
            error: {
                code,
                message,
                requestId,
            },
        });
    });

    const cache = createCacheProvider(appConfig);
    await registerHealthRoute(app, appConfig);
    await registerChartDataRoute(app, appConfig, cache);
    await registerCacheRoutes(app, appConfig, cache);

    return app;
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
    return allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin.includes('*')) {
            const pattern = `^${escapeRegExp(allowedOrigin).replace('\\*', '.*')}$`;
            return new RegExp(pattern).test(origin);
        }
        return origin === allowedOrigin;
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function getRequestId(body: unknown, headerValue: string | string[] | undefined): string {
    if (body && typeof body === 'object' && typeof (body as { requestId?: unknown }).requestId === 'string') {
        return (body as { requestId: string }).requestId;
    }
    if (typeof headerValue === 'string' && headerValue) {
        return headerValue;
    }
    return 'unknown';
}

function createRateLimiter(appConfig: BackendConfig): (ip: string) => void {
    const requestsByIp = new Map<string, { count: number; resetAt: number }>();

    return (ip: string) => {
        if (!appConfig.rateLimitEnabled) return;
        const now = Date.now();
        const current = requestsByIp.get(ip);
        if (!current || now >= current.resetAt) {
            requestsByIp.set(ip, { count: 1, resetAt: now + appConfig.rateLimitWindowMs });
            return;
        }
        current.count += 1;
        if (current.count > appConfig.rateLimitMax) {
            throw new ApiError('BAD_REQUEST', 'Rate limit exceeded.', 429);
        }
    };
}
