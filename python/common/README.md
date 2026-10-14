# driftwood-common

Code shared by the winnonah and questionnaires Python projects. Keep it small and free of app-specific imports: anything here is used by both repos, so a change affects both.

- `driftwood_common.constants`: `BUSINESS_TIMEZONE`.
- `driftwood_common.timezone`: conversions between business-local wall-clock time and UTC.

winnonah installs it from this folder (a local path dependency). questionnaires installs it from this repo's `main` branch through a git dependency, pinned to a commit by its `uv.lock`. To pick up changes there, run `uv lock --upgrade-package driftwood-common` and commit the lock file.

Run the tests from `python/`: `uv run pytest common/tests`.
