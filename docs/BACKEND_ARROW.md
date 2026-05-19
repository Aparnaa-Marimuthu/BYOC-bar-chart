# Phase 2 Backend Cache + Apache Arrow POC

## Purpose

Phase 2 adds an optional backend data path for cache and Databricks Arrow
experiments. The verified native ThoughtSpot BYOC path remains the default.

```text
native:
ThoughtSpot chartModel.data -> native transform -> Chart.js update

backend:
BYOC frontend -> backend cache -> mock or Databricks Arrow -> chart-ready JSON
```

Apache Arrow is backend-only because Chart.js ultimately renders JavaScript
arrays and ThoughtSpot `chartModel.data` does not provide Arrow buffers.

## Local Mock Workflow

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
cd server
npm run dev
```

Frontend env:

```text
VITE_BYOC_DATA_MODE=backend
VITE_BYOC_BACKEND_URL=http://localhost:8787
VITE_BYOC_DEBUG=true
```

Backend env:

```text
BYOC_USE_MOCK_BACKEND=true
BYOC_CACHE_ENABLED=true
BYOC_CACHE_PROVIDER=memory
```

Expected:

- first identical request: `cacheHit: false`, `source: "mock"`
- second identical request: `cacheHit: true`, `source: "cache"`

## Databricks Setup

Set backend-only environment variables:

```text
DATABRICKS_HOST=
DATABRICKS_TOKEN=
DATABRICKS_WAREHOUSE_ID=
DATABRICKS_CATALOG=
DATABRICKS_SCHEMA=
DATABRICKS_TABLE=
```

When these are missing and `BYOC_USE_MOCK_BACKEND=false`,
`/api/v1/byoc/chart-data` returns a safe `CONFIG_ERROR`. Databricks Arrow path
compiles, but runtime validation requires Databricks credentials.

## Cache Strategy

The cache key is a SHA-256 hash over normalized JSON. It includes:

- `queryVersion`
- optional `dataVersion`
- tenant ID
- user ID or security context hash
- chart type, dimension, metric, filters, sort, limit, and return format

Raw tokens, Authorization headers, cookies, external links, and full data rows
are never part of the cache key.

The POC uses TTL-only invalidation plus the dev invalidate endpoint. Production
needs data refresh or version-based invalidation.

## Deployment

Deploy the frontend to Vercel or another static host allowed by ThoughtSpot CSP.
For mock-mode testing without a tunnel, deploy the backend as a second Vercel
project from the same GitHub repo:

```text
Project name: byoc-arrow-backend
Root Directory: server
Framework Preset: Other
Install Command: npm install
Build Command: npm run build
Output Directory: leave blank
```

`server/public/.gitkeep` exists only to satisfy Vercel's static output
expectation for this API-only backend project. The Vercel UI Output Directory
can remain blank.

The backend exposes explicit Vercel API route files:

```text
server/api/v1/health.ts
server/api/v1/byoc/chart-data.ts
server/api/v1/byoc/cache/stats.ts
server/api/v1/byoc/cache/invalidate.ts
```

All route files use `server/api/_handler.ts`, which adapts Vercel requests to
the shared Fastify app without calling `app.listen()`.

The same backend also supports long-running local/container usage:

```bash
cd server
npm run dev
npm start
```

Vercel serverless is acceptable for mock-mode POC testing. It is not recommended
for production Databricks polling or large Arrow downloads. Databricks Arrow
runtime testing may work for small queries but can hit serverless timeout or
memory limits. Production should use a long-running Node service or container.

Configure CORS with only approved frontend origins:

```text
BYOC_ALLOWED_ORIGINS=http://localhost:5173,https://*.vercel.app
```

Backend Vercel env for mock testing:

```text
NODE_ENV=production
BYOC_USE_MOCK_BACKEND=true
BYOC_BACKEND_DEBUG=true
BYOC_CACHE_ENABLED=true
BYOC_CACHE_PROVIDER=memory
BYOC_CACHE_TTL_SECONDS=300
BYOC_CACHE_MAX_ITEMS=500
BYOC_ALLOWED_ORIGINS=https://<frontend-vercel-domain>
BACKEND_AUTH_MODE=dev
BACKEND_DEV_API_KEY=<random-long-value>
```

Frontend Vercel env for backend mock testing:

```text
VITE_BYOC_DATA_MODE=backend
VITE_BYOC_BACKEND_URL=https://<backend-vercel-domain>
VITE_BYOC_BACKEND_TIMEOUT_MS=30000
VITE_BYOC_DEBUG=true
VITE_BYOC_DEBUG_DATA=false
```

Because this is Vite, changing `VITE_*` env vars requires frontend redeployment.

## Vercel Backend Curl Checks

Health:

```bash
curl https://<backend-vercel-domain>/api/v1/health
```

Mock chart-data:

```bash
curl -X POST https://<backend-vercel-domain>/api/v1/byoc/chart-data \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: manual-test-1" \
  -d '{
    "chartType": "bar",
    "mode": "chart",
    "dimension": "location_name",
    "metric": "order_count",
    "filters": {},
    "sort": { "field": "value", "direction": "desc" },
    "limit": 100,
    "context": {
      "tenantId": "dev-tenant",
      "userId": "dev-user",
      "securityContextHash": "dev-security"
    },
    "returnFormat": "json"
  }'
```

Expected first response:

```json
{
  "cacheHit": false,
  "source": "mock"
}
```

Repeat the same request to attempt a cache hit:

```json
{
  "cacheHit": true,
  "source": "cache"
}
```

On Vercel serverless, memory cache is best-effort only. If the request cold
starts or lands on another instance, it may return another mock miss.

## ThoughtSpot Test Steps

Native test:

1. Set frontend `VITE_BYOC_DATA_MODE=native`.
2. Redeploy frontend.
3. Open the ThoughtSpot BYOC chart.
4. Open DevTools Console and filter `[BYOC:`.
5. Confirm `[BYOC:render:start]`, `[BYOC:render:data]`,
   `[BYOC:render:chart]`, `[BYOC:perf]`, and `[BYOC:render:done]`.

Backend mock test:

1. Deploy the backend Vercel project with `BYOC_USE_MOCK_BACKEND=true`.
2. Verify `https://<backend-vercel-domain>/api/v1/health`.
3. Set frontend `VITE_BYOC_DATA_MODE=backend`.
4. Set frontend `VITE_BYOC_BACKEND_URL=https://<backend-vercel-domain>`.
5. Redeploy frontend.
6. Open the ThoughtSpot BYOC chart.
7. Confirm `[BYOC:backend:request]`, `[BYOC:backend:response]`, and
   `[BYOC:perf]`.
8. First request should show `cacheHit: false`, `source: "mock"`.
9. Repeated identical request may show `cacheHit: true`, `source: "cache"`.

## Verification Checklist

- Native mode still renders first with `VITE_BYOC_DATA_MODE=native`.
- Backend health returns `ok: true`.
- Mock first request returns `cacheHit: false`.
- Mock second identical request returns `cacheHit: true`.
- Frontend logs `[BYOC:backend:request]` and `[BYOC:backend:response]`.
- No Databricks token, warehouse ID, or Arrow external link appears in browser
  logs.
- `apache-arrow` is imported only from `server/`.

## Production Caveats

This is a POC. Production needs real authentication, ThoughtSpot security
context validation, row-level security, monitoring, rate limits, audit logs,
secret management, and cache invalidation tied to data freshness.
