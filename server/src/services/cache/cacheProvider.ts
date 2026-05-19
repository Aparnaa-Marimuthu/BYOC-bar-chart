export interface CacheProvider<T> {
    get(key: string): Promise<T | null>;
    set(key: string, value: T, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    clear(): Promise<void>;
    stats(): Promise<Record<string, unknown>>;
}
