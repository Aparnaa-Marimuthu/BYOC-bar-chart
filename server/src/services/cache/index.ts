import type { BackendConfig } from '../../config.js';
import type { ChartDataResponse } from '../../types/chart.js';
import type { CacheProvider } from './cacheProvider.js';
import { MemoryCacheProvider } from './memoryCacheProvider.js';
import { RedisCacheProvider } from './redisCacheProvider.js';

export function createCacheProvider(config: BackendConfig): CacheProvider<ChartDataResponse> {
    if (config.cacheProvider === 'redis') {
        return new RedisCacheProvider<ChartDataResponse>();
    }
    return new MemoryCacheProvider<ChartDataResponse>(config.cacheMaxItems);
}
