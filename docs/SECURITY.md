# Security Notes

## Frontend Secrets

The BYOC frontend must not contain Databricks tokens, database passwords,
authorization headers, cookies, API secrets, or service credentials.

Only `VITE_*` variables are available to the browser. Treat every `VITE_*`
variable as public.

## Debug Logging

Debug logs are disabled by default:

```text
VITE_BYOC_DEBUG=false
VITE_BYOC_DEBUG_DATA=false
```

`VITE_BYOC_DEBUG=true` logs metadata such as row counts, column names, render
timings, query sizes, and chart actions. It does not log full data payloads.

`VITE_BYOC_DEBUG_DATA=true` logs full ThoughtSpot chart data and should only be
used temporarily in controlled debugging sessions because chart values can be
sensitive.

Safe error logging redacts common bearer token, authorization, cookie, token,
password, and secret patterns from error messages and stack traces.

## Backend Arrow Phase

- Databricks/database credentials must live only in backend environment
  variables.
- The frontend should call only the application backend.
- Databricks presigned Arrow result URLs must not be exposed to the browser.
- CORS must be allow-listed to the ThoughtSpot and chart hosting origins.
- ThoughtSpot CSP must allow the deployed BYOC Vercel origin and any approved
  backend origin.
- Cache keys must include tenant, user or security context, chart request
  fields, and data version to prevent cross-user leakage.

The POC backend has a dev auth placeholder. Production must validate the
ThoughtSpot user/session/security context, enforce row-level security, add audit
logs, rate limits, secret management, and data-version cache invalidation.

`/api/v1/health` returns only booleans such as `databricksConfigured`; it must
not expose hostnames, tokens, warehouse IDs, external links, or SQL text.

For Vercel backend testing, set `BYOC_ALLOWED_ORIGINS` to the frontend Vercel
domain. Do not add Databricks variables to the frontend Vercel project.

`POST /api/v1/byoc/cache/invalidate` requires `X-BYOC-API-Key` when
`BACKEND_DEV_API_KEY` is configured. Production must replace this placeholder
with real authentication and authorization.
