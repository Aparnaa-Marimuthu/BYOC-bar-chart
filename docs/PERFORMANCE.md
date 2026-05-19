# Performance

## What Changed

- Chart.js is created once and then updated in place.
- Manual polling was removed.
- ThoughtSpot queries now request a bounded result size with
  `queryParams: { offset: 0, size }`.
- Native data transformation is memoized with a stable signature.
- Large chart updates use `chart.update('none')` to skip animation.
- `VITE_BYOC_MAX_BARS` prevents the browser from rendering too many bars.

## Debug Metrics

Enable debug logs with:

```text
VITE_BYOC_DEBUG=true
```

The chart logs structured records with:

- `renderId`
- `rowsInput`
- `renderTotalMs`
- `nativeDataTransformMs`
- `chartUpdateMs`
- `rowsRendered`
- `truncated`
- `memoCacheHit`
- `chartAction`
- `updateMode`
- `path: "native-thoughtspot"`

The implementation uses unique render IDs and `performance.now()` timing, so it
does not accumulate browser performance marks or measures.

## Console Prefixes

Debug logs are copy/paste-friendly from browser DevTools and use these prefixes:

- `[BYOC:init]`
- `[BYOC:config]`
- `[BYOC:query]`
- `[BYOC:render:start]`
- `[BYOC:render:data]`
- `[BYOC:render:chart]`
- `[BYOC:render:done]`
- `[BYOC:render:error]`
- `[BYOC:context-menu]`
- `[BYOC:backend:request]`
- `[BYOC:backend:response]`
- `[BYOC:backend:error]`
- `[BYOC:backend:fallback]`
- `[BYOC:perf]`

Production remains quiet when `VITE_BYOC_DEBUG=false`; only critical safe errors
are logged.

`[BYOC:query]` uses flat primitive fields so Chrome DevTools displays the values
without expanding nested objects:

```text
event: "getQueriesFromChartConfig"
queryColumnsCount: 2
queryParamOffset: 0
queryParamSize: 1000
chartConfigCount: 1
dimensionKeys: "x,y"
columnNames: "Product,Revenue"
```

`[BYOC:perf]` also uses flat primitive fields:

```text
renderId: "native-render-1"
path: "native-thoughtspot"
rowsInput: 96
rowsRendered: 96
truncated: false
memoCacheHit: false
chartAction: "create"
updateMode: "default"
nativeDataTransformMs: 3.1
chartUpdateMs: 10.2
renderTotalMs: 18.4
```

Backend perf paths are:

```text
backend-cache
backend-mock
backend-databricks-arrow
```

Backend responses include server timings:

```text
totalMs
cacheLookupMs
sqlBuildMs
databricksSubmitMs
databricksWaitMs
arrowDownloadMs
arrowParseMs
transformMs
cacheWriteMs
```

## Benchmarking

Use the same ThoughtSpot answer and compare:

1. First render after load.
2. Re-render with unchanged data.
3. Re-render with changed data.
4. A result set larger than `VITE_BYOC_MAX_BARS`.
5. Backend mock first miss with `VITE_BYOC_DATA_MODE=backend`.
6. Backend mock cache hit for the same request.
7. Databricks Arrow miss when real backend credentials are configured.
8. Databricks cache hit for the same request.

Expected behavior: repeated unchanged data should skip transformation output
allocation and avoid Chart.js work when the previous signature is already
rendered.

For the POC, cache invalidation is TTL-only unless `/api/v1/byoc/cache/invalidate`
is called. Production should include data refresh or data version based
invalidation.

On Vercel serverless, memory cache is best-effort only. A repeated request may
return `cacheHit: true` while the same function instance is warm, but cold
starts or different instances can reset memory and return a new mock miss.
