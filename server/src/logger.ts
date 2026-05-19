import type { BackendConfig } from './config.js';

export function logDebug(config: BackendConfig, event: string, payload: Record<string, unknown>): void {
    if (!config.debug) return;
    console.info(event, payload);
}

export function logError(event: string, payload: Record<string, unknown>): void {
    console.error(event, redactPayload(payload));
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [
            key,
            /(token|secret|password|authorization|cookie)/i.test(key) ? '[REDACTED]' : value,
        ]),
    );
}
