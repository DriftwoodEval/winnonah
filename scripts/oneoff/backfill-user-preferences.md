# Backfill user preferences

Copies each user's `homeWidgets`, `headerItems`, and `issueListOrder` text columns into the new `emr_user.preferences` JSON column. Run it after `pnpm db:push` adds the column and before deploying the code that reads from it.

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

Check the result:

```sql
SELECT COUNT(*) AS users_with_preferences FROM emr_user WHERE preferences IS NOT NULL;
SELECT COUNT(*) AS users_with_legacy_values
FROM emr_user
WHERE homeWidgets IS NOT NULL OR headerItems IS NOT NULL OR issueListOrder IS NOT NULL;
```

Once the app has run on the new column and the counts look right, remove `homeWidgets`, `headerItems`, and `issueListOrder` from `src/server/db/schema.ts` and push the schema to drop them.
