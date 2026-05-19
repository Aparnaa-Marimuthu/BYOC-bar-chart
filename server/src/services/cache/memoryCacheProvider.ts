import type { CacheProvider } from './cacheProvider.js';

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
    createdAt: number;
}

export class MemoryCacheProvider<T> implements CacheProvider<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();

    constructor(private readonly maxItems: number) {}

    async get(key: string): Promise<T | null> {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiresAt) {
            this.entries.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: T, ttlSeconds: number): Promise<void> {
        this.entries.set(key, {
            value,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
        this.evictIfNeeded();
    }

    async del(key: string): Promise<void> {
        this.entries.delete(key);
    }

    async clear(): Promise<void> {
        this.entries.clear();
    }

    async stats(): Promise<Record<string, unknown>> {
        this.deleteExpired();
        return {
            provider: 'memory',
            items: this.entries.size,
            maxItems: this.maxItems,
        };
    }

    private evictIfNeeded(): void {
        this.deleteExpired();
        while (this.entries.size > this.maxItems) {
            const oldestKey = [...this.entries.entries()].sort(
                ([, left], [, right]) => left.createdAt - right.createdAt,
            )[0]?.[0];
            if (!oldestKey) return;
            this.entries.delete(oldestKey);
        }
    }

    private deleteExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries.entries()) {
            if (now >= entry.expiresAt) {
                this.entries.delete(key);
            }
        }
    }
}
