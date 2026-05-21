#!/bin/sh
set -e

echo "Waiting database..."
until npx prisma migrate deploy; do
    echo "Migration failed, retrying in 3s..."
    sleep 3
done

echo "Running seed..."
npx prisma db seed

echo "Initializing application..."
exec node dist/main.js