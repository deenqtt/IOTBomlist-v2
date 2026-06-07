#!/bin/sh
set -e

# Run DB push to ensure schema is up to date
npx prisma db push --accept-data-loss

# Seed initial data
node dist/src/seed.js

# Run the server
exec node dist/src/index.js
