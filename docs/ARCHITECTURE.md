# Architecture

## Current Native Path

```text
ThoughtSpot SDK render lifecycle
  -> ctx.getChartModel()
  -> chartModel.data[0].data
  -> native transform and memoization
  -> Chart.js create once or update existing chart
```

The chart keeps the existing ThoughtSpot right-click context menu. Event
listeners are attached once per canvas and read the latest chart state from a
shared interaction state object.

## Optional Phase 2 Backend Path

Backend mode is available only when explicitly configured with
`VITE_BYOC_DATA_MODE=backend`. Native remains the default.

```text
BYOC frontend
  -> secure backend API
  -> cache lookup
  -> Databricks SQL Statement Execution API on cache miss
  -> ARROW_STREAM + EXTERNAL_LINKS downloaded server-side
  -> backend parses Arrow and returns chart-ready JSON
  -> Chart.js update-in-place
```

ThoughtSpot `chartModel.data` does not expose native Apache Arrow buffers to
this custom chart. Arrow should therefore be introduced only through a secure
backend owned by the application, not by putting database credentials in the
browser.

## Backend Components

The backend lives in `server/` as an independent Node + TypeScript service.

- Fastify routes provide health, chart data, cache stats, and cache invalidation.
- Memory cache is the working POC provider with TTL and max-item eviction.
- Cache keys are SHA-256 hashes over normalized request context and include
  `queryVersion`, optional `dataVersion`, tenant, user or security context,
  chart fields, filters, sort, limit, and return format.
- Mock backend mode allows cache hit/miss testing without Databricks credentials.
- Databricks Statement Execution API support uses `ARROW_STREAM` and
  `EXTERNAL_LINKS`; Arrow chunks are downloaded and parsed server-side.

## Deployment Shape

Deploy the frontend anywhere ThoughtSpot can load it, such as Vercel. For
mock-mode testing, the backend can be deployed as a second Vercel project using
the same repo with `Root Directory: server`.

The backend supports two entrypoints:

- `server/src/index.ts` for local or long-running Node usage with `app.listen()`.
- explicit `server/api/v1/**` Vercel function files for serverless usage
  without `app.listen()`. These route files share `server/api/_handler.ts`,
  which adapts Vercel requests to the Fastify app via `app.inject()`.

Vercel serverless is not the recommended production target for Databricks
polling or large Arrow downloads. Production should use a long-running Node
service or container with controlled CORS.
