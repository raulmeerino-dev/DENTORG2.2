#!/bin/sh
set -eu

# Named volumes may predate the non-root image. Normalize only the writable
# runtime directories, then drop privileges before migrations and startup.
mkdir -p /app/uploads /app/backups
chown -R dentcore:dentcore /app/uploads /app/backups

exec setpriv --reuid=dentcore --regid=dentcore --init-groups "$@"
