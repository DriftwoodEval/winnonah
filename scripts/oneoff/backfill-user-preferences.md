# Backfill user preferences

Moves each user's `homeWidgets`, `headerItems`, and `issueListOrder` text columns into the new `emr_user.preferences` JSON column, then drops the old columns. The order matters: `pnpm db:push` drops the old columns, so the data has to be copied first.

Do these steps in order, before deploying the code that reads `preferences`.

## 1. Add the column

Run this by hand instead of `pnpm db:push`, so the old columns stay in place until the data is copied.

```sql
ALTER TABLE emr_user ADD COLUMN preferences JSON NULL;
```

## 2. Copy the data

Users with nothing saved are left alone. A saved value that is the JSON `null` is skipped. The old columns are not changed, so the statement is safe to run more than once.

```sql
UPDATE emr_user
SET preferences = JSON_MERGE_PATCH(
  COALESCE(preferences, JSON_OBJECT()),
  JSON_OBJECT(
    'homeWidgets', IF(JSON_VALID(homeWidgets), CAST(homeWidgets AS JSON), NULL),
    'headerItems', IF(JSON_VALID(headerItems), CAST(headerItems AS JSON), NULL),
    'issueListOrder', IF(JSON_VALID(issueListOrder), CAST(issueListOrder AS JSON), NULL)
  )
)
WHERE homeWidgets IS NOT NULL
   OR headerItems IS NOT NULL
   OR issueListOrder IS NOT NULL;
```

## 3. Check the result

Every user with a saved layout should have a preferences value, so the second count should be zero.

```sql
SELECT COUNT(*) AS users_with_legacy_values
FROM emr_user
WHERE homeWidgets IS NOT NULL OR headerItems IS NOT NULL OR issueListOrder IS NOT NULL;

SELECT COUNT(*) AS legacy_users_missing_preferences
FROM emr_user
WHERE preferences IS NULL
  AND (homeWidgets IS NOT NULL OR headerItems IS NOT NULL OR issueListOrder IS NOT NULL);
```

## 4. Drop the old columns

Run `pnpm db:push`. The schema no longer defines `homeWidgets`, `headerItems`, or `issueListOrder`, so drizzle-kit asks to drop them and warns about data loss. Confirm only after step 3 checks out.
