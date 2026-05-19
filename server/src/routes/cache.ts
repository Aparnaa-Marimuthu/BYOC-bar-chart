import type { FastifyInstance } from 'fastify';
import type { BackendConfig } from '../config.js';
import type { CacheProvider } from '../services/cache/cacheProvider.js';
import type { ChartDataResponse } from '../types/chart.js';
import { ApiError } from '../types/errors.js';

export async function registerCacheRoutes(
    app: FastifyInstance,
    config: BackendConfig,
    cache: CacheProvider<ChartDataResponse>,
): Promise<void> {
    app.get('/api/v1/byoc/cache/stats', async () => ({
        provider: config.cacheProvider,
        enabled: config.cacheEnabled,
        ttlSeconds: config.cacheTtlSeconds,
        ...(await cache.stats()),
    }));

    app.post('/api/v1/byoc/cache/invalidate', async (request) => {
        if (config.authMode === 'dev' && config.devApiKey) {
            const headerValue = request.headers['x-byoc-api-key'];
            if (headerValue !== config.devApiKey) {
                throw new ApiError('AUTH_REQUIRED', 'A valid dev API key is required.', 401);
            }
        }

        await cache.clear();
        return { ok: true, invalidated: 'all' };
    });
}
