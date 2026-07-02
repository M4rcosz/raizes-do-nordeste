#!/bin/sh
set -e

# One-shot migration. A managed DB (Supabase) is always up, so there is no DB
# to wait for. If this fails we exit non-zero and let the container crash loud
# instead of retrying forever and hanging the deploy.
echo "Applying migrations..."
npx prisma migrate deploy

# No seed on boot. Seeding is a manual, one-off operation (npm run db:seed),
# never part of the container lifecycle. seed.ts still hard-refuses in prod.

echo "Starting application..."
exec node dist/main.js