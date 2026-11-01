-- Move the auth tables from the NextAuth (Auth.js) layout to the Better Auth
-- layout. Matches the schema.ts changes in the same PR.
--
-- Run this BEFORE `pnpm db:push`, with the app stopped, so push sees no diff
-- to reconcile. db:push's rename-detection prompt is interactive and risks a
-- DROP+ADD (data loss) instead of a rename if misread.
--
-- Back up first:
--   mysqldump <db> emr_user emr_account emr_session emr_verification_token > auth-backup.sql
--
-- Check first: Better Auth lowercases the email it looks up. MySQL's default
-- collation ignores case, so a stored "Jane@x.com" still matches, but make the
-- stored values lowercase anyway so later exact comparisons agree. The
-- BINARY comparison is needed; a plain `email <> LOWER(email)` ignores case and
-- never matches. This lists mixed-case emails:
--   SELECT id, email FROM emr_user WHERE BINARY email <> LOWER(email);
-- Two users whose emails differ only by case would collide once lowercased.
-- This must return no rows:
--   SELECT LOWER(email), COUNT(*) FROM emr_user GROUP BY LOWER(email) HAVING COUNT(*) > 1;
-- If both checks are clean up front, fix the first list with:
--   UPDATE emr_user SET email = LOWER(email) WHERE BINARY email <> LOWER(email);
--
-- Effects:
--   * Every session row is deleted, so everyone signs in again once.
--   * Linked Google accounts (and their refresh tokens) are kept.
--   * Every existing user is marked email-verified (sign-in already required a
--     verified Google Workspace email).

-- 1. Sessions: sign everyone out. Old cookies would not be recognised anyway.
DELETE FROM `emr_session`;

-- 2. emr_user: emailVerified becomes a boolean, plus createdAt/updatedAt.
ALTER TABLE `emr_user` DROP COLUMN `emailVerified`;
ALTER TABLE `emr_user`
  ADD COLUMN `emailVerified` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
UPDATE `emr_user` SET `emailVerified` = 1;

-- 3. emr_account: add a row id (the old key was provider + providerAccountId),
--    real token expiry timestamps, and audit columns. Drop NextAuth-only columns.
ALTER TABLE `emr_account` DROP PRIMARY KEY;
ALTER TABLE `emr_account`
  ADD COLUMN `id` VARCHAR(255) NOT NULL FIRST,
  ADD COLUMN `accessTokenExpiresAt` TIMESTAMP NULL,
  ADD COLUMN `refreshTokenExpiresAt` TIMESTAMP NULL,
  ADD COLUMN `password` TEXT NULL,
  ADD COLUMN `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
UPDATE `emr_account`
  SET `id` = UUID(),
      `accessTokenExpiresAt` = IF(`expires_at` IS NULL, NULL, FROM_UNIXTIME(`expires_at`));
ALTER TABLE `emr_account`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE INDEX `account_provider_account_idx` (`provider`, `providerAccountId`),
  DROP COLUMN `type`,
  DROP COLUMN `expires_at`,
  DROP COLUMN `token_type`,
  DROP COLUMN `session_state`;

-- 4. emr_session: add a row id (the old key was the token), client info, and
--    audit columns. The table is empty after step 1, so the new key is safe.
ALTER TABLE `emr_session` DROP PRIMARY KEY;
ALTER TABLE `emr_session`
  ADD COLUMN `id` VARCHAR(255) NOT NULL FIRST,
  ADD COLUMN `ipAddress` VARCHAR(255) NULL,
  ADD COLUMN `userAgent` TEXT NULL,
  ADD COLUMN `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `emr_session`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE INDEX `session_token_idx` (`sessionToken`);

-- 5. Verification: Better Auth keeps short-lived OAuth state in emr_verification.
--    The old emr_verification_token table was never used for Google sign-in.
CREATE TABLE `emr_verification` (
  `id` VARCHAR(255) NOT NULL,
  `identifier` VARCHAR(255) NOT NULL,
  `value` TEXT NOT NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `verification_identifier_idx` (`identifier`)
);
DROP TABLE `emr_verification_token`;
