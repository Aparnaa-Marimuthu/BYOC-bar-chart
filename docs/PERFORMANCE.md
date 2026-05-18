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
- `[BYOC:perf]`

Production remains quiet when `VITE_BYOC_DEBUG=false`; only critical safe errors
are logged.

## Benchmarking

Use the same ThoughtSpot answer and compare:

1. First render after load.
2. Re-render with unchanged data.
3. Re-render with changed data.
4. A result set larger than `VITE_BYOC_MAX_BARS`.

Expected behavior: repeated unchanged data should skip transformation output
allocation and avoid Chart.js work when the previous signature is already
rendered.
