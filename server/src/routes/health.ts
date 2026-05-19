import type { FastifyInstance } from 'fastify';
import type { BackendConfig } from '../config.js';
import { isDatabricksConfigured } from '../config.js';

export async function registerHealthRoute(app: FastifyInstance, config: BackendConfig): Promise<void> {
    app.get('/api/v1/health', async () => ({
        ok: true,
        service: 'byoc-arrow-backend',
        version: '0.1.0',
        cacheProvider: config.cacheProvider,
        databricksConfigured: isDatabricksConfigured(config),
    }));
}
