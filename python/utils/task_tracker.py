"""
Tracks background job runs in emr_task so the frontend can show a live
"tasks in progress" indicator, and guards each job type against overlapping
runs (e.g. a cron firing again before a slow LLM lookup finishes) using a
MySQL named lock.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from loguru import logger

from utils.constants import TABLE_TASK
from utils.database import get_db


def _clear_orphaned_rows(connection, task_type: str) -> None:
    """Mark leftover 'running' rows for this task type as failed.

    Runs right after acquiring the named lock, which guarantees no other
    process is genuinely running this task type (MySQL releases the lock
    when its owning connection dies), so any 'running' row left over is
    provably orphaned (e.g. the previous process was kill -9'd or the host
    crashed before it could close its row).
    """
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE {TABLE_TASK}
            SET status = 'failed', completedAt = NOW(),
                error = 'Orphaned: previous process died without closing this task'
            WHERE type = %s AND status = 'running'
            """,
            (task_type,),
        )
    connection.commit()


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


@contextmanager
def track_task(task_type: str, label: str) -> Iterator[TaskHandle | None]:
    """Records a job run as a row in emr_task and holds a MySQL named lock
    for the task type so a second cron-triggered run of the same job can't
    start while one is still in progress.

    Yields None (and does not create a row) if another run of this task
    type already holds the lock, in which case the caller should return
    without doing any work. Otherwise yields a TaskHandle for reporting
    progress; the row is marked completed or failed automatically.
    """
    connection = get_db()
    lock_name = f"task:{task_type}"

    with connection.cursor() as cursor:
        cursor.execute("SELECT GET_LOCK(%s, 0) AS acquired", (lock_name,))
        row = cursor.fetchone()
        acquired = row is not None and row["acquired"] == 1

    if not acquired:
        logger.info(f"Skipping {task_type} run: a previous run is still in progress.")
        connection.close()
        yield None
        return

    _clear_orphaned_rows(connection, task_type)

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
        with connection.cursor() as cursor:
            cursor.execute("SELECT RELEASE_LOCK(%s)", (lock_name,))
        connection.close()
