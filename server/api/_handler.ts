import type { IncomingMessage, ServerResponse } from 'node:http';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { getServerlessApp } from '../src/serverlessApp.js';

export interface VercelInjectRequest {
    method?: string;
    url?: string;
    headers?: IncomingMessage['headers'];
    body?: Buffer | string;
    remoteAddress?: string;
}

export function createVercelHandler(fallbackPath: string) {
    return async function handler(
        request: IncomingMessage,
        response: ServerResponse,
    ): Promise<void> {
        const body = await readRequestBody(request);
        const injectedResponse = await injectVercelRequest({
            method: request.method,
            url: normalizeRequestUrl(request.url, fallbackPath),
            headers: request.headers,
            body: body.length > 0 ? body : undefined,
            remoteAddress: getForwardedIp(request),
        });

        writeVercelResponse(response, injectedResponse);
    };
}

export async function injectVercelRequest(
    request: VercelInjectRequest,
): Promise<LightMyRequestResponse> {
    const app = await getServerlessApp();
    const injectOptions: InjectOptions = {
        method: (request.method ?? 'GET') as InjectOptions['method'],
        url: request.url ?? '/',
        headers: request.headers,
        payload: request.body,
        remoteAddress: request.remoteAddress,
    };

    return app.inject(injectOptions);
}

function writeVercelResponse(
    response: ServerResponse,
    injectedResponse: LightMyRequestResponse,
): void {
    response.statusCode = injectedResponse.statusCode;
    for (const [header, value] of Object.entries(injectedResponse.headers)) {
        if (value !== undefined) {
            response.setHeader(header, value);
        }
    }
    response.end(injectedResponse.body);
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        request.on('data', (chunk: Buffer | string) => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        request.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        request.on('error', reject);
    });
}

function normalizeRequestUrl(url: string | undefined, fallbackPath: string): string {
    if (!url) return fallbackPath;
    if (url.startsWith('/api/')) return url;
    if (url.startsWith('?')) return `${fallbackPath}${url}`;
    if (url.startsWith('/')) return url;
    return `${fallbackPath}${url.startsWith('?') ? '' : '/'}${url}`;
}

function getForwardedIp(request: IncomingMessage): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
        return forwardedFor.split(',')[0]?.trim();
    }
    return undefined;
}
