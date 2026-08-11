# One-time backfill: appointment times to true UTC

`.sql` files are write-denied for Claude in this project, so this lives as
Markdown. Copy the SQL blocks into your own client to run.

## Context

`emr_appointment.startTime`/`endTime`/`confirmedAt` were written by
`python/utils/appointments.py` (before this change) parsing TherapyAppointment
CSV exports as naive business-local wall-clock time (America/New_York) and
inserting it as-is. Every reader treated the same value as if it were already
UTC. This backfill corrects existing rows to match the new write path (see
`python/utils/timezone.py`'s `business_to_utc`), which localizes to
America/New_York and converts to UTC before insert.

Every other timestamp column in the schema (`sentAt`, `receivedAt`,
`reportCompletedAt`, `sessionStartedAt`, task `started_at`/`completed_at`,
etc.) is written via `NOW()`, `CURRENT_TIMESTAMP`, JS `new Date()`, or Python
`datetime.utcnow()`/`now_utc()`, all of which already produce true UTC
instants (confirmed: the shared MySQL instance's `@@global.time_zone` and
`@@session.time_zone` are both `SYSTEM`, and the server's system clock is
UTC). Only `startTime`/`endTime`/`confirmedAt` need backfilling.

Run this during a gap between appointment-sync cron runs, so no row is
written under the old convention while this is in progress and none is
double-converted afterward.

## 1. Verify prerequisites

```sql
SELECT @@global.time_zone, @@session.time_zone;
SELECT CONVERT_TZ('2026-07-01 12:00:00', 'America/New_York', 'UTC');
```

The `CONVERT_TZ` call must return a non-NULL value (`2026-07-01 16:00:00`).
If it returns `NULL`, the server's timezone tables aren't loaded
(`mysql_tzinfo_to_sql`) — do not proceed, the UPDATE below would silently
leave every row unchanged instead of converting it.

(Already confirmed once for this database: both variables are `SYSTEM`, the
server's system clock is UTC, and `CONVERT_TZ` correctly returns
`2026-07-01 16:00:00`. Worth re-checking if the DB host or config changed
since.)

## 2. Preview DST-boundary rows

`CONVERT_TZ` resolves ambiguous ("fall back") and nonexistent ("spring
forward") local times without raising, so spot-check anything near a
transition before trusting the bulk conversion:

```sql
SELECT id, startTime, endTime, confirmedAt
FROM emr_appointment
WHERE
	(startTime BETWEEN '2025-03-08 05:00:00' AND '2025-03-08 09:00:00')
	OR (startTime BETWEEN '2025-11-01 04:00:00' AND '2025-11-01 08:00:00')
	OR (startTime BETWEEN '2026-03-08 05:00:00' AND '2026-03-08 09:00:00')
	OR (startTime BETWEEN '2026-11-01 04:00:00' AND '2026-11-01 08:00:00');
```

Business hours mean real appointment collisions with the 2-3am transition
window should be near-zero, but confirm the row count is small and each row
looks sane before proceeding.

## 3. Run the backfill

```sql
START TRANSACTION;

UPDATE emr_appointment
SET
	startTime = CONVERT_TZ(startTime, 'America/New_York', 'UTC'),
	endTime = CONVERT_TZ(endTime, 'America/New_York', 'UTC'),
	confirmedAt = CASE
		WHEN confirmedAt IS NULL THEN NULL
		ELSE CONVERT_TZ(confirmedAt, 'America/New_York', 'UTC')
	END;

SELECT id, startTime, endTime, confirmedAt
FROM emr_appointment
ORDER BY startTime DESC
LIMIT 20;
```

Compare a few rows in that output against a known real appointment's
TherapyAppointment-displayed (business-local) time — each `startTime` should
now be 4-5 hours ahead of what TherapyAppointment shows, depending on
whether that appointment falls in EDT or EST.

Then either:

```sql
COMMIT;
```

or, if anything looks wrong:

```sql
ROLLBACK;
```

## 4. After committing

Deploy 3a/3b (the write-side and read-side code in this branch) if not
already live, so new syncs write true UTC and match the backfilled rows.
Resume the appointment-sync cron.
