# ThoughtSpot BYOC Bar Chart

This project is a Vite + vanilla TypeScript ThoughtSpot Bring Your Own Chart
bar chart using Chart.js.

## Native BYOC Path

The active runtime path is native ThoughtSpot BYOC data only:

```text
ThoughtSpot chartModel.data
  -> validated native transform
  -> memoized labels/values
  -> Chart.js update-in-place
```

Phase 2 adds an optional backend-powered path. Native mode remains the default.

```text
BYOC frontend
  -> /api/v1/byoc/chart-data
  -> backend cache lookup
  -> mock rows or Databricks SQL Statement Execution API on miss
  -> backend Apache Arrow parsing
  -> chart-ready JSON
  -> Chart.js update-in-place
```

## Performance Controls

Environment variables:

```text
VITE_BYOC_QUERY_SIZE=1000
VITE_BYOC_MAX_BARS=1000
VITE_BYOC_DEBUG=false
VITE_BYOC_DEBUG_DATA=false
VITE_BYOC_ENABLE_CUSTOM_DRILL=false
VITE_BYOC_DATA_MODE=native
VITE_BYOC_BACKEND_URL=http://localhost:8787
VITE_BYOC_BACKEND_TIMEOUT_MS=30000
VITE_BYOC_BACKEND_CACHE_DEBUG=false
```

- `VITE_BYOC_QUERY_SIZE` is clamped between `1` and ThoughtSpot's `100000`
  hard limit.
- `VITE_BYOC_MAX_BARS` is clamped between `1` and `5000`.
- `VITE_BYOC_DEBUG=true` enables browser-console lifecycle logs.
- `VITE_BYOC_DEBUG_DATA=true` additionally logs full ThoughtSpot data payloads.
  Use only for controlled debugging because chart data can contain sensitive
  business values.
- `VITE_BYOC_DATA_MODE=native` keeps the verified ThoughtSpot `chartModel.data`
  path. Use `backend` only when testing the Phase 2 backend API.
- Large row counts use `chart.update('none')` to avoid animation cost.
- Truncated rows preserve incoming order; the UI does not imply top-ranked rows
  unless ThoughtSpot already sorted the data.

## Local Commands

```bash
npm install
npm run dev
npm test
npm run build
```

Backend:

```bash
cd server
npm install
npm run dev
npm test
npm run build
```

Local mock backend test:

```text
Frontend env:
VITE_BYOC_DATA_MODE=backend
VITE_BYOC_BACKEND_URL=http://localhost:8787
VITE_BYOC_DEBUG=true

Backend env:
BYOC_USE_MOCK_BACKEND=true
BYOC_CACHE_ENABLED=true
BYOC_CACHE_PROVIDER=memory
```

First identical backend request should return `cacheHit: false` and
`source: "mock"`. The second identical request should return `cacheHit: true`
and `source: "cache"`.

Opening the Vite app directly is useful for static checks, but the ThoughtSpot
SDK host handshake only succeeds inside ThoughtSpot. A standalone page can show
an `InitStart` SDK error because there is no ThoughtSpot parent frame to answer
the SDK postMessage request.

## How To Verify In ThoughtSpot After Vercel Deployment

1. Set `VITE_BYOC_DEBUG=true` in Vercel Environment Variables.
2. Deploy the chart to Vercel.
3. Open the ThoughtSpot BYOC chart that loads the Vercel URL.
4. Open browser DevTools and select the Console tab.
5. Confirm `[BYOC:init]` logs show initialization starting and completing.
6. Confirm `[BYOC:query]` logs show `queryParamOffset: 0` and
   `queryParamSize: 1000`
   or your configured size.
7. Confirm `[BYOC:render:done]` appears after render.
8. Confirm there are no repeated polling logs.
9. Confirm `[BYOC:render:chart]` shows `chartAction: "create"` on first render
   and `chartAction: "update"` on later renders.
10. Confirm no `chartInstance.destroy` path is logged or used.
11. Confirm `[BYOC:context-menu]` shows `rightClickHandlerAttached: true` only
   once for the canvas, then `false` on later renders.
12. Copy/paste `[BYOC:*]` logs when debugging deployment issues.

Expected debug log shape:

```text
[BYOC:init] { event: "starting", debug: true, version: "0.0.0@local" }
[BYOC:init] { event: "complete", hasInitialData: true, oneShotInitialRenderGuardUsed: false }
[BYOC:query] { event: "getQueriesFromChartConfig", queryColumnsCount: 2, queryParamOffset: 0, queryParamSize: 1000, chartConfigCount: 1, dimensionKeys: "x,y", columnNames: "Product,Revenue" }
[BYOC:render:start] { renderId: "native-render-1", chartModelExists: true, chartModelDataExists: true }
[BYOC:render:data] { rowsInput: 96, rowsRendered: 96, truncated: false, memoCacheHit: false }
[BYOC:render:chart] { chartAction: "create", updateMode: "default", chartInstanceDestroyUsed: false }
[BYOC:perf] { renderId: "native-render-1", path: "native-thoughtspot", rowsInput: 96, rowsRendered: 96, truncated: false, memoCacheHit: false, chartAction: "create", updateMode: "default", nativeDataTransformMs: 3.1, chartUpdateMs: 10.2, renderTotalMs: 18.4 }
[BYOC:render:done] { renderId: "native-render-1", rowsRendered: 96, truncated: false }
```

Backend mode additionally logs:

```text
[BYOC:backend:request] { requestId: "native-render-1", mode: "backend", dimension: "location_name", metric: "revenue", limit: 1000 }
[BYOC:backend:response] { requestId: "native-render-1", cacheHit: false, source: "mock", rowsReturned: 12, totalMs: 4.2, cacheLookupMs: 0.3, databricksWaitMs: 0, arrowDownloadMs: 0, arrowParseMs: 0 }
```

When `VITE_BYOC_DEBUG=true`, DevTools also exposes:

```js
window.__BYOC_DEBUG__.getLastRenderSummary()
window.__BYOC_DEBUG__.getLastError()
window.__BYOC_DEBUG__.getConfig()
window.__BYOC_DEBUG__.getVersion()
```

## Security

No secrets belong in this frontend. Do not put Databricks tokens, database
passwords, presigned result URLs, or service credentials in Vite code or
`VITE_*` variables.

## Backend Deployment

For office-network testing without a tunnel, deploy the backend as a second
Vercel project from the same GitHub repo:

```text
Project name: byoc-arrow-backend
Root Directory: server
Framework Preset: Other
Install Command: npm install
Build Command: npm run build
Output Directory: leave blank
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

Frontend Vercel env for native verification:

```text
VITE_BYOC_DATA_MODE=native
VITE_BYOC_DEBUG=true
VITE_BYOC_DEBUG_DATA=false
VITE_BYOC_QUERY_SIZE=1000
VITE_BYOC_MAX_BARS=1000
VITE_BYOC_ENABLE_CUSTOM_DRILL=false
```

Frontend Vercel env for backend mock testing:

```text
VITE_BYOC_DATA_MODE=backend
VITE_BYOC_BACKEND_URL=https://<backend-vercel-domain>
VITE_BYOC_BACKEND_TIMEOUT_MS=30000
VITE_BYOC_DEBUG=true
VITE_BYOC_DEBUG_DATA=false
```

Vite reads `VITE_*` values at build time, so changing frontend env vars requires
a frontend redeploy.

Vercel serverless is acceptable for mock-mode POC testing. It is not recommended
for production Databricks polling or large Arrow downloads; production should
use a long-running Node service or container. Serverless memory cache is
best-effort only and may reset on cold starts or across instances.
