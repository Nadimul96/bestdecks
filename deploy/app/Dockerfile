ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS base
ARG NODE_IMAGE
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# The digest is supplied by the deployer, but the runtime contract is exact.
# Fail the build before dependency installation if either condition drifts.
RUN node -e 'if (!/@sha256:[a-f0-9]{64}$/.test(process.argv[1])) process.exit(1)' "${NODE_IMAGE}" \
  && node -e 'if (process.version !== "v24.18.0") process.exit(1)' \
  && corepack enable pnpm \
  && corepack install --global pnpm@11.7.0 \
  && test "$(pnpm --version)" = "11.7.0"

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next imports the auth route while compiling. Supply non-secret sentinels only
# for that import-time contract; the final images do not inherit these values
# and still fail closed unless real runtime secrets are provided.
RUN BETTER_AUTH_URL=https://build.invalid \
  BETTER_AUTH_SECRET=build-only-placeholder-never-use-at-runtime-000000000000 \
  APP_SECRETS_KEY=build-only-placeholder-encryption-key-000000000000000000 \
  BESTDECKS_COMMIT_SHA=0000000000000000000000000000000000000000 \
  LOCAL_DB_PATH=/tmp/bestdecks-build.sqlite \
  SEED_ADMIN_ON_STARTUP=0 \
  pnpm build \
  && pnpm verify:standalone

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/home/bestdecks
ENV NEXT_TELEMETRY_DISABLED=1

# A numeric identity keeps both runtime targets independent of user-management
# tools in the digest-pinned base image. Compose mounts only the home, temporary,
# runtime cache, and database paths as writable; application code remains root-owned.
RUN mkdir -p /home/bestdecks /app/.data /app/.next/cache \
  && chmod 0700 /home/bestdecks /app/.data /app/.next/cache \
  && chown 10001:10001 /home/bestdecks /app/.data /app/.next/cache \
  && node -e 'if (process.version !== "v24.18.0") process.exit(1)'

FROM runtime AS worker
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

USER 10001:10001

CMD ["node", "--import", "tsx", "src/bin/run-worker.ts"]

FROM runtime AS runner
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER 10001:10001

# Re-run the boundary check against the exact final filesystem layout. The
# BuildKit bind mount is read-only and does not copy the verifier into the
# runtime image.
RUN --mount=type=bind,from=builder,source=/app/scripts/check-standalone-boundary.mjs,target=/tmp/check-standalone-boundary.mjs,ro \
  node /tmp/check-standalone-boundary.mjs --root /app

EXPOSE 3000

CMD ["node", "server.js"]
