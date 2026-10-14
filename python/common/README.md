# driftwood-common

Code shared by the winnonah and questionnaires Python projects. Keep it small and free of app-specific imports: anything here is used by both repos, so a change affects both.

- `driftwood_common.constants`: `BUSINESS_TIMEZONE` and the `emr_task` table name.
- `driftwood_common.timezone`: conversions between business-local wall-clock time and UTC.
- `driftwood_common.task_tracker`: records job runs in `emr_task` and guards against overlapping runs. Each project wraps `track_task` with its own database connection.
- `driftwood_common.quo`: pure helpers for the Quo messaging API (phone normalization, request payloads and queries, response parsing). No HTTP library.
- `driftwood_common.gmail`: sending, listing, reading, and marking Gmail messages, on a Gmail service the caller builds. `driftwood_common.google_service.build_google_service` builds any Google API service with a request timeout.
- `driftwood_common.google_auth`: `authenticate`, which loads, refreshes (with retries), or logs in for Google OAuth credentials, given scopes and file paths. Each project keeps the result in memory.
- `driftwood_common.log_format`: `json_log_format`, the one-line JSON formatter for loguru sinks, including the traceback for logged exceptions.
- `driftwood_common.quo_client`: `QuoClient`, a synchronous client with rate limiting and retries. Async callers run it with `asyncio.to_thread`.

winnonah installs it from this folder (a local path dependency). questionnaires installs it from this repo's `main` branch through a git dependency, pinned to a commit by its `uv.lock`. To pick up changes there, run `uv lock --upgrade-package driftwood-common` and commit the lock file.

Run the tests from `python/`: `uv run pytest common/tests`.
