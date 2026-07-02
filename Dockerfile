# syntax=docker/dockerfile:1

# ---- builder ----
# Full toolchain: installs every dep (incl. dev), generates the Prisma client
# and compiles TypeScript to dist/. Nothing here ships; only the artifacts we
# copy into the runtime stage do.
FROM node:24-slim AS builder
WORKDIR /app

# Deps first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runtime ----
# Slim production image: only prod deps. glibc means argon2's prebuilt binary
# matches (no compiler needed) and Prisma runs on its default engine target.
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# openssl: Prisma's migration engine needs libssl to run and to detect its
# engine target. ca-certificates: TLS to a managed DB (Supabase requires SSL)
# needs trusted root CAs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Prod-only deps. prisma is a runtime dep (Option A: entrypoint runs
# `prisma migrate deploy` on boot), so it survives --omit=dev.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Schema + migrations are needed by `prisma migrate deploy`; regenerate the
# client here so it is present after the prod-only install. Generate runs
# before prisma.config.ts is copied so it does not validate the (build-time
# unset) datasource url.
COPY prisma ./prisma
RUN npx prisma generate

# Compiled app from the builder.
COPY --from=builder /app/dist ./dist
# Prisma 7 keeps the datasource url in prisma.config.ts (not the schema);
# migrate deploy at boot reads it from here (url = process.env.DATABASE_URL).
COPY prisma.config.ts ./
COPY entrypoint.sh ./

# Drop root: the app only reads these files and talks to the DB.
USER node

EXPOSE 3000
CMD ["sh", "./entrypoint.sh"]
