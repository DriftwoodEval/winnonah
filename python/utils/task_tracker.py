"""Records the Python sidecar's job runs in emr_task.

The tracking logic is shared with the questionnaires project and lives in
`driftwood_common.task_tracker`. This wrapper supplies the sidecar's database
connection.
"""

from __future__ import annotations

from contextlib import AbstractContextManager

from driftwood_common.task_tracker import NoOpTaskHandle, TaskHandle
from driftwood_common.task_tracker import track_task as _track_task

from utils.database import get_db


def track_task(
    task_type: str, label: str
) -> AbstractContextManager[TaskHandle | NoOpTaskHandle | None]:
    """Record a job run and guard it against overlapping runs of the same type.

    Yields None if another run of this task type is still in progress, in which
    case the caller should return without doing any work.
    """
    return _track_task(get_db, task_type, label)
