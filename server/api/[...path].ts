import type { IncomingMessage, ServerResponse } from 'node:http';
import type { InjectOptions } from 'fastify';
import { getServerlessApp } from '../src/serverlessApp.js';

export default async function handler(
    request: IncomingMessage,
    response: ServerResponse,
): Promise<void> {
    const app = await getServerlessApp();
    const payload = await readRequestBody(request);
    const injectOptions: InjectOptions = {
        method: (request.method ?? 'GET') as InjectOptions['method'],
        url: request.url ?? '/',
        headers: request.headers,
        payload: payload.length > 0 ? payload : undefined,
        remoteAddress: getForwardedIp(request),
    };
    const injectedResponse = await app.inject(injectOptions);

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

function getForwardedIp(request: IncomingMessage): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
        return forwardedFor.split(',')[0]?.trim();
    }
    return undefined;
}
