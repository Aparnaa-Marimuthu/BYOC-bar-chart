import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheProvider } from './memoryCacheProvider.js';

describe('memory cache provider', () => {
    it('gets, expires, and clears values', async () => {
        vi.useFakeTimers();
        const cache = new MemoryCacheProvider<string>(10);

        await cache.set('a', 'value', 1);
        await expect(cache.get('a')).resolves.toBe('value');

        vi.advanceTimersByTime(1001);
        await expect(cache.get('a')).resolves.toBeNull();

        await cache.set('b', 'value', 10);
        await cache.clear();
        await expect(cache.get('b')).resolves.toBeNull();
        vi.useRealTimers();
    });

    it('evicts oldest entries over max item count', async () => {
        const cache = new MemoryCacheProvider<string>(1);
        await cache.set('a', 'first', 10);
        await cache.set('b', 'second', 10);

        await expect(cache.get('a')).resolves.toBeNull();
        await expect(cache.get('b')).resolves.toBe('second');
    });
});
