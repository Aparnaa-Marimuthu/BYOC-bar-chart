import { ApiError } from '../../types/errors.js';
import type { CacheProvider } from './cacheProvider.js';

export class RedisCacheProvider<T> implements CacheProvider<T> {
    constructor() {
        throw new ApiError(
            'CONFIG_ERROR',
            'Redis cache provider is not installed in this POC. Use BYOC_CACHE_PROVIDER=memory.',
            500,
        );
    }

    async get(): Promise<T | null> {
        return null;
    }

    async set(): Promise<void> {}

    async del(): Promise<void> {}

    async clear(): Promise<void> {}

    async stats(): Promise<Record<string, unknown>> {
        return { provider: 'redis', enabled: false };
    }
}
