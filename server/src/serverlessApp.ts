import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

let appPromise: Promise<FastifyInstance> | null = null;

export async function getServerlessApp(): Promise<FastifyInstance> {
    if (!appPromise) {
        appPromise = createApp(loadConfig()).then(async (app) => {
            await app.ready();
            return app;
        });
    }
    return appPromise;
}
