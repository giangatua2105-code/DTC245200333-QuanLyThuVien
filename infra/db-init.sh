#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$DB_PASSWORD" -v exporter_password="$EXPORTER_PASSWORD" <<'SQL'
CREATE USER library_app WITH PASSWORD :'app_password';
GRANT CONNECT ON DATABASE library TO library_app;
GRANT USAGE, CREATE ON SCHEMA public TO library_app;
CREATE USER metrics WITH PASSWORD :'exporter_password';
GRANT pg_monitor TO metrics;
GRANT CONNECT ON DATABASE library TO metrics;
SQL
