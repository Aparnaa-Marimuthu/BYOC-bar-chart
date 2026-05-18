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

## Not Implemented In This Patch

Backend mode, hybrid mode, Databricks retrieval, and Apache Arrow parsing are
not active in this codebase yet.

The future backend path should be:

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
