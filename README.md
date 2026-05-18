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

This patch intentionally does not add a backend, Databricks client, or Apache
Arrow implementation. Backend Arrow retrieval is documented as a future phase.

## Performance Controls

Environment variables:

```text
VITE_BYOC_QUERY_SIZE=1000
VITE_BYOC_MAX_BARS=1000
VITE_BYOC_DEBUG=false
VITE_BYOC_DEBUG_DATA=false
VITE_BYOC_ENABLE_CUSTOM_DRILL=false
```

- `VITE_BYOC_QUERY_SIZE` is clamped between `1` and ThoughtSpot's `100000`
  hard limit.
- `VITE_BYOC_MAX_BARS` is clamped between `1` and `5000`.
- `VITE_BYOC_DEBUG=true` enables browser-console lifecycle logs.
- `VITE_BYOC_DEBUG_DATA=true` additionally logs full ThoughtSpot data payloads.
  Use only for controlled debugging because chart data can contain sensitive
  business values.
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
6. Confirm `[BYOC:query]` logs show `queryParams: { offset: 0, size: 1000 }`
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
[BYOC:query] { queryColumnsCount: 2, queryParams: { offset: 0, size: 1000 } }
[BYOC:render:start] { renderId: "native-render-1", chartModelExists: true, chartModelDataExists: true }
[BYOC:render:data] { rowsInput: 96, rowsRendered: 96, truncated: false, memoCacheHit: false }
[BYOC:render:chart] { chartAction: "create", updateMode: "default", chartInstanceDestroyUsed: false }
[BYOC:perf] { renderTotalMs: 18.4, nativeDataTransformMs: 3.1, chartUpdateMs: 10.2 }
[BYOC:render:done] { renderId: "native-render-1", rowsRendered: 96, truncated: false }
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
