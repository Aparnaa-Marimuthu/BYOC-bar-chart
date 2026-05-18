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

## Future Backend Arrow Phase

If a backend Arrow path is added later:

- Databricks/database credentials must live only in backend environment
  variables.
- The frontend should call only the application backend.
- Databricks presigned Arrow result URLs must not be exposed to the browser.
- CORS must be allow-listed to the ThoughtSpot and chart hosting origins.
- ThoughtSpot CSP must allow the deployed BYOC Vercel origin and any approved
  backend origin.
- Cache keys must include tenant, user or security context, chart request
  fields, and data version to prevent cross-user leakage.
