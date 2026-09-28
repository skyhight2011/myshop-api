#!/bin/sh
set -eu

APP_ENV="${APP_ENV:-development}"

case "$APP_ENV" in
  development|uat|production) ;;
  *)
    echo "APP_ENV must be development, uat, or production (got: ${APP_ENV})" >&2
    exit 1
    ;;
esac

ENV_FILE="/app/.env.${APP_ENV}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

# Fill only variables that were not already set by Compose, Kubernetes, or docker run.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac

  key=${line%%=*}
  value=${line#*=}
  value=${value#\"}
  value=${value%\"}
  value=${value#\'}
  value=${value%\'}

  if ! printenv "$key" >/dev/null 2>&1; then
    export "$key=$value"
  fi
done < "$ENV_FILE"

if [ "$APP_ENV" = "uat" ] || [ "$APP_ENV" = "production" ]; then
  case "${DATABASE_URL:-}" in
    ''|*USER:PASSWORD*|*@HOST:*)
      echo "Set a real DATABASE_URL for ${APP_ENV} before starting the container." >&2
      exit 1
      ;;
  esac
fi

if [ "$APP_ENV" = "development" ]; then
  pnpm prisma db push
fi

exec "$@"
