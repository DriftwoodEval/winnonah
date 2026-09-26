# Migrating Kimai onto driftwood-db and into failover

One-time runbook for moving Kimai from its standalone `~/kimai` stack into
the winnonah compose project, so it fails over with everything else. Run
manually, in order. Nothing here is automated.

## 1. Dump Kimai's database

From primary, dump only Kimai's database out of the `kimai-db` container.
Never `--all-databases`: that would overwrite `driftwood-db`'s `mysql.user`
table, including the replication user.

```
docker exec kimai-db mysqldump -uroot -p"$DATABASE_ROOT_PASSWORD" \
  --databases "$DATABASE_NAME" \
  --single-transaction --routines --triggers --set-gtid-purged=OFF \
  > kimai_dump.sql
```

`$DATABASE_ROOT_PASSWORD` and `$DATABASE_NAME` come from `~/kimai/.env`, not
winnonah's `.env`.

Import into `driftwood-db`, on primary only. Replication carries it to
standby from there.

```
docker exec -i driftwood-db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < kimai_dump.sql
```

## 2. Copy the data and plugins volumes

The old volumes aren't host paths, so copy them out via a throwaway
container. Confirm the actual volume names first, compose prefixes them
with the project directory name, likely `kimai_data` and `kimai_plugins`:

```
docker volume ls | grep kimai
```

```
docker run --rm -v kimai_data:/src -v ~/winnonah/kimai/data:/dst alpine cp -a /src/. /dst/
docker run --rm -v kimai_plugins:/src -v ~/winnonah/kimai/plugins:/dst alpine cp -a /src/. /dst/
```

Also copy the existing `local.yaml` (mailer, LDAP, etc.) to
`~/winnonah/kimai/local.yaml`.

## 3. Set env vars on both hosts

Add the `KIMAI_*` vars (`KIMAI_APP_SECRET`, `KIMAI_TRUSTED_HOSTS`,
`KIMAI_TRUSTED_PROXIES`, `KIMAI_ADMIN_EMAIL`, `KIMAI_ADMIN_PASSWORD`,
`KIMAI_DATABASE_USER`, `KIMAI_DATABASE_PASSWORD`, `KIMAI_DATABASE_NAME`,
`KIMAI_DATABASE_SERVER_VERSION`) to `.env` on **both** primary and standby.

Check `driftwood-db`'s actual version for `KIMAI_DATABASE_SERVER_VERSION`:

```
docker exec driftwood-db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT VERSION();"
```

`KIMAI_TRUSTED_PROXIES` should be `winnonah-net`'s subnet, not the old
standalone network's:

```
docker network inspect winnonah-net | grep Subnet
```

## 4. Stop the old stack, start the new one

Both use the container name `kimai`, so the old stack has to come down
first. Keep its volumes in place (don't `docker compose down -v`) as a
rollback path until the new setup is verified.

```
cd ~/kimai && docker compose down
cd ~/winnonah && docker compose up -d kimai
```

## 5. Pull the image on standby too

So a real failover doesn't pull a newer image than primary is running
mid-incident:

```
ssh standby 'cd ~/winnonah && docker compose pull kimai'
```

Consider pinning an exact Kimai version tag instead of `stable`, for the
same reason.

## 6. Cloudflare Tunnel

In the Cloudflare dashboard, move Kimai's public hostname off its own
tunnel and onto winnonah's tunnel, pointing at `http://caddy:8090`.

## 7. Reload Caddy on both hosts

The Caddyfile is a single-file bind mount and won't pick up changes from a
`git pull` on its own:

```
docker compose up -d --force-recreate caddy   # on primary
ssh standby 'cd ~/winnonah && docker compose up -d --force-recreate caddy'
```

## 8. Cron on primary

Add the sync job:

```
*/15 * * * * /bin/bash ~/winnonah/failover/sync-kimai-data.sh >> /var/log/sync-kimai-data.log 2>&1
```

## 9. Verify, then clean up

Confirm Kimai works end to end against `driftwood-db`, then remove the old
`~/kimai` stack's volumes (`kimai_data`, `kimai_plugins`, the old `mysql`
volume) and stop pointing anything at it.

Nothing in this repo's failover scripts (`failover.sh`, `failback.sh`,
`sync-kimai-data.sh`) has been exercised against either server. Test a
failover deliberately once this migration is done.
