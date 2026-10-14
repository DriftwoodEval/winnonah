"""
Tracks background job runs in emr_task so the frontend can show a live
"tasks in progress" indicator, and guards each job type against overlapping
runs (e.g. a cron firing again before a slow job finishes) using a MySQL named
lock.

Both winnonah and questionnaires record runs in the same table. Each project
wraps `track_task` with its own way of opening a database connection.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from loguru import logger

from driftwood_common.constants import TABLE_TASK

# Opens a PyMySQL connection that returns rows as dicts (a DictCursor).
ConnectionFactory = Callable[[], Any]

# How long a non-exclusive task run may take before we assume the process
# that owns it died without closing its row (kill -9, OOM, host crash).
STALE_TASK_HOURS = 4


def _clear_orphaned_rows(
    connection, task_type: str, older_than_hours: int | None = None
) -> None:
    """Mark leftover 'running' rows for this task type as failed.

    For exclusive tasks this runs right after acquiring the named lock,
    which guarantees no other process is genuinely running this task type
    (MySQL releases the lock when its owning connection dies), so any
    'running' row left over is provably orphaned. For non-exclusive tasks
    there's no lock to prove that, so we only sweep rows old enough that a
    real run would have finished by now.
    """
    query = f"""
        UPDATE {TABLE_TASK}
        SET status = 'failed', completedAt = NOW(),
            error = 'Orphaned: previous process died without closing this task'
        WHERE type = %s AND status = 'running'
    """
    params: tuple = (task_type,)
    if older_than_hours is not None:
        query += " AND startedAt < NOW() - INTERVAL %s HOUR"
        params = (task_type, older_than_hours)

    with connection.cursor() as cursor:
        cursor.execute(query, params)
    connection.commit()


class NoOpTaskHandle:
    """Stand-in yielded by track_task in dev mode: records nothing."""

    task_id = 0

    def progress(
        self, current: int, total: int | None = None, detail: str | None = None
    ) -> None:
        pass

    def set_summary(self, summary: dict) -> None:
        pass


class TaskHandle:
    def __init__(self, connection, task_id: int) -> None:
        self._connection = connection
        self.task_id = task_id

    def progress(
        self, current: int, total: int | None = None, detail: str | None = None
    ) -> None:
        with self._connection.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE {TABLE_TASK}
                SET progressCurrent = %s, progressTotal = %s, detail = COALESCE(%s, detail)
                WHERE id = %s
                """,
                (current, total, detail, self.task_id),
            )
        self._connection.commit()

    def set_summary(self, summary: dict) -> None:
        """Records domain-specific counts (sent, imported, errors by reason,
        etc.) for the run summary shown in the app."""
        with self._connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE {TABLE_TASK} SET summary = %s WHERE id = %s",
                (json.dumps(summary, default=str), self.task_id),
            )
        self._connection.commit()


@contextmanager
def track_task(
    get_connection: ConnectionFactory,
    task_type: str,
    label: str,
    exclusive: bool = True,
    *,
    dev_mode: bool = False,
) -> Iterator[TaskHandle | NoOpTaskHandle | None]:
    """Records a job run as a row in emr_task.

    If dev_mode is True, takes no lock and writes no row: yields a
    NoOpTaskHandle so callers run their work without touching the shared DB.

    If exclusive is True (the default), also holds a MySQL named lock for
    the task type so a second cron-triggered run of the same job can't
    start while one is still in progress. Yields None (and does not create
    a row) if another run of this task type already holds the lock, in
    which case the caller should return without doing any work.

    If exclusive is False, no lock is taken and overlapping runs are
    allowed to proceed concurrently, each getting its own row.

    Otherwise yields a TaskHandle for reporting progress; the row is
    marked completed or failed automatically.
    """
    if dev_mode:
        logger.info(f"Dev mode: not recording {task_type} run in {TABLE_TASK}")
        yield NoOpTaskHandle()
        return

    connection = get_connection()
    lock_name = f"task:{task_type}"

    if exclusive:
        with connection.cursor() as cursor:
            cursor.execute("SELECT GET_LOCK(%s, 0) AS acquired", (lock_name,))
            row = cursor.fetchone()
            acquired = row is not None and row["acquired"] == 1

        if not acquired:
            logger.info(
                f"Skipping {task_type} run: a previous run is still in progress."
            )
            connection.close()
            yield None
            return

        _clear_orphaned_rows(connection, task_type)
    else:
        _clear_orphaned_rows(connection, task_type, older_than_hours=STALE_TASK_HOURS)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO {TABLE_TASK} (type, status, label, startedAt)
                VALUES (%s, 'running', %s, NOW())
                """,
                (task_type, label),
            )
            task_id = cursor.lastrowid
        connection.commit()

        try:
            yield TaskHandle(connection, task_id)
        except Exception as e:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE {TABLE_TASK}
                    SET status = 'failed', completedAt = NOW(), error = %s
                    WHERE id = %s
                    """,
                    (str(e)[:2000], task_id),
                )
            connection.commit()
            raise
        else:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE {TABLE_TASK}
                    SET status = 'completed', completedAt = NOW()
                    WHERE id = %s
                    """,
                    (task_id,),
                )
            connection.commit()
    finally:
        if exclusive:
            with connection.cursor() as cursor:
                cursor.execute("SELECT RELEASE_LOCK(%s)", (lock_name,))
        connection.close()
