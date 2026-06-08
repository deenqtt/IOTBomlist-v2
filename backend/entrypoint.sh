#!/bin/sh
set -e

# Apply schema: use migrate deploy if migrations exist, else db push (safe — no --accept-data-loss)
if [ -d "/app/prisma/migrations" ] && [ "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  npx prisma migrate deploy --schema=/app/prisma/schema.prisma
else
  echo "[entrypoint] No migrations found — running prisma db push..."
  npx prisma db push --schema=/app/prisma/schema.prisma --url="${DATABASE_URL}"
fi

# Seed only on first run (when no users exist)
USER_COUNT=$(node -e "
try {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(0); try { p.\$disconnect(); } catch(_) {} });
} catch(e) { console.log(0); }
" 2>/dev/null) || USER_COUNT=0

if [ "$USER_COUNT" = "0" ]; then
  echo "[entrypoint] No users found — running seed..."
  node dist/src/seed.js
else
  echo "[entrypoint] Users exist ($USER_COUNT) — skipping seed."
fi

# Run the server
exec node dist/src/index.js
