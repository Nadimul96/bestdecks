import { cookies as nextCookiesStore, headers as nextHeaders } from "next/headers";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNextJsHandler, nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { Kysely } from "kysely";
import { LibsqlDialect, type LibsqlDialectConfig } from "@libsql/kysely-libsql";

import { loadEnv } from "@/src/config/env";
import { derivePublicAuthCapabilities } from "@/src/config/auth-capabilities";
import { decideAdminBootstrap } from "@/src/server/auth-bootstrap";
import { resolveAuthBaseUrl } from "@/src/server/auth-origin";
import {
  createDatabaseClient,
  getDbConnectionInfo,
  getDb,
  initializeLocalDatabaseConnection,
  retryReconcilingMigrationContention,
  withDatabaseMigrationLease,
} from "@/src/server/db";

const env = loadEnv();

function resolveAuthSecret() {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;

  throw new Error(
    "BETTER_AUTH_SECRET is required. Generate an independent value with at least 32 random bytes.",
  );
}

function resolveAdminSeed() {
  if (env.SEED_ADMIN_ON_STARTUP !== "1") return null;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_ON_STARTUP=1 requires ADMIN_EMAIL and ADMIN_PASSWORD.",
    );
  }

  return {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME ?? "Bestdecks Admin",
  };
}

const authBaseUrl = resolveAuthBaseUrl({
  environment: env.NODE_ENV,
  betterAuthUrl: env.BETTER_AUTH_URL,
  renderExternalUrl: env.RENDER_EXTERNAL_URL,
  vercelUrl: process.env.VERCEL_URL,
  port: process.env.PORT,
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const authCapabilities = derivePublicAuthCapabilities({
  environment: env.NODE_ENV,
  googleClientId,
  googleClientSecret,
});
const socialProviders: BetterAuthOptions["socialProviders"] =
  authCapabilities.googleSignIn && googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          disableSignUp: !authCapabilities.selfServiceSignup,
        },
      }
    : undefined;

const dbInfo = getDbConnectionInfo();
const authDbClient = dbInfo.url.startsWith("file:")
  ? createDatabaseClient(dbInfo)
  : null;
type DialectClient = Extract<LibsqlDialectConfig, { client: unknown }>["client"];
// kysely-libsql 0.4.x declares the older `sync(): Promise<void>` client
// contract. Adapt that one return value explicitly while retaining the current
// client instance and its per-connection timeout behavior.
const authDialectClient: DialectClient | null = authDbClient
  ? {
      execute: authDbClient.execute.bind(authDbClient),
      batch: authDbClient.batch.bind(authDbClient),
      transaction: authDbClient.transaction.bind(authDbClient),
      executeMultiple: authDbClient.executeMultiple.bind(authDbClient),
      async sync() {
        await authDbClient.sync();
      },
      close: authDbClient.close.bind(authDbClient),
      get closed() {
        return authDbClient.closed;
      },
      get protocol() {
        return authDbClient.protocol;
      },
    }
  : null;
const kyselyDb = new Kysely({
  // Preserve the original URL-based client path for remote libSQL. Only local
  // SQLite needs the explicit client so its connection policy can be verified.
  dialect: authDialectClient
    ? new LibsqlDialect({ client: authDialectClient })
    : new LibsqlDialect({ url: dbInfo.url, authToken: dbInfo.authToken }),
});

const authOptions = {
  database: { db: kyselyDb, type: "sqlite" },
  baseURL: authBaseUrl,
  secret: resolveAuthSecret(),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !authCapabilities.selfServiceSignup,
    autoSignIn: env.NODE_ENV !== "production",
    requireEmailVerification: env.NODE_ENV === "production",
    minPasswordLength: authCapabilities.password.minLength,
    maxPasswordLength: authCapabilities.password.maxLength,
  },
  socialProviders,
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    nextCookies(),
  ],
  trustedOrigins: [
    authBaseUrl,
    ...(env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://localhost:3001"]
      : []),
  ],
  ...(env.NODE_ENV === "production"
    ? {
        advanced: {
          defaultCookieAttributes: {
            secure: true,
            sameSite: "lax" as const,
          },
        },
      }
    : {}),
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
export type AuthSession = typeof auth.$Infer.Session;
export const authHandlers = toNextJsHandler(async (request) => {
  await ensureAuthReady();
  return auth.handler(request);
});

let authReadyPromise: Promise<void> | null = null;
let authDatabaseReadyPromise: Promise<void> | null = null;

export async function ensureAuthDatabaseConnectionReady() {
  if (!authDbClient) return;
  if (!authDatabaseReadyPromise) {
    authDatabaseReadyPromise = initializeLocalDatabaseConnection(
      authDbClient,
      dbInfo.url,
    ).catch((error) => {
      authDatabaseReadyPromise = null;
      throw error;
    });
  }
  await authDatabaseReadyPromise;
}

async function migrateAuthTables() {
  // The worker and web process share the application database but not a
  // process-local promise. Finish the application schema first, then keep
  // Better Auth's schema introspection and DDL under the same durable lease.
  await getDb();
  await ensureAuthDatabaseConnectionReady();
  await withDatabaseMigrationLease(async () => {
    await retryReconcilingMigrationContention(async () => {
      // Rebuild the migration plan after any SQLITE_BUSY result. This fresh
      // introspection omits DDL that a prior attempt already committed.
      const { runMigrations } = await getMigrations(authOptions);
      await runMigrations();
    });
  });
}

async function seedAdminAccount() {
  const seed = resolveAdminSeed();
  if (!seed) return;

  const db = await getDb();
  const existing = (await db.execute(
    'SELECT "id", "role" FROM "user" WHERE "email" = ? LIMIT 1',
    [seed.email],
  )) as { id: string; role: string | null } | undefined;

  const userCount = (await db.execute(
    'SELECT COUNT(*) AS "count" FROM "user"',
  )) as { count: number } | undefined;
  const decision = decideAdminBootstrap(
    existing,
    Number(userCount?.count ?? Number.NaN),
  );
  if (decision.action === "reuse") {
    return;
  }

  // The admin plugin's server API creates the first account without traversing
  // the public sign-up route, which remains disabled in production.
  let adminUserId: string;
  try {
    const created = await auth.api.createUser({
      body: { ...seed, role: "admin" },
    });
    adminUserId = created.user.id;
  } catch {
    const concurrentlyCreated = (await db.execute(
      'SELECT "id", "role" FROM "user" WHERE "email" = ? LIMIT 1',
      [seed.email],
    )) as { id: string; role: string | null } | undefined;
    if (!concurrentlyCreated || concurrentlyCreated.role !== "admin") {
      throw new Error("Admin bootstrap failed without creating an admin account.");
    }
    adminUserId = concurrentlyCreated.id;
  }
  await db.run(
    'UPDATE "user" SET "emailVerified" = ?, "updatedAt" = ? WHERE "id" = ?',
    [1, new Date().toISOString(), adminUserId],
  );
}

export async function ensureAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      await migrateAuthTables();
      await seedAdminAccount();
    })().catch((error) => {
      authReadyPromise = null;
      throw error;
    });
  }

  await authReadyPromise;
}

export async function getSession() {
  await ensureAuthReady();
  const headerStore = await nextHeaders();
  const cookieStore = await nextCookiesStore();
  const requestHeaders = new Headers(headerStore);
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
  return auth.api.getSession({ headers: requestHeaders });
}

export function isAdmin(session: AuthSession) {
  return session.user.role === "admin";
}

/** Compatibility helper for older routes; unlike the previous version, this enforces the role. */
export async function getAdminSession() {
  const session = await getSession();
  return session?.user && isAdmin(session) ? session : null;
}
