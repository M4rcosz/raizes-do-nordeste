#!/bin/sh
set -e

# One-shot migration. A managed DB (Supabase) is always up, so there is no DB
# to wait for. If this fails we exit non-zero and let the container crash loud
# instead of retrying forever and hanging the deploy.
echo "Applying migrations..."
npx prisma migrate deploy

# No seed on boot. Seeding is a manual, one-off operation (npm run db:seed),
# never part of the container lifecycle. seed.ts still hard-refuses in prod.

# Ensure the initial ADMIN exists. Idempotent: a no-op once the account is
# there, so it is safe to run on every boot. Fails loud (set -e) if the
# INITIAL_ADMIN_* envs are missing when the admin still has to be created.
echo "Ensuring initial admin..."
node dist/scripts/bootstrap-admin.js

echo "Starting application..."
exec node dist/main.js