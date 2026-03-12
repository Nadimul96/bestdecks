import { cookies as nextCookiesStore, headers as nextHeaders } from "next/headers";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNextJsHandler, nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { loadEnv } from "@/src/config/env";
import { getDb } from "@/src/server/db";

function resolveAuthBaseUrl() {
  const env = loadEnv();

  if (env.BETTER_AUTH_URL) {
    return env.BETTER_AUTH_URL;
  }

  if (env.RENDER_EXTERNAL_URL) {
    return env.RENDER_EXTERNAL_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

const env = loadEnv();
const adminEmail = env.ADMIN_EMAIL ?? "nadimul96@gmail.com";
const adminPassword = env.ADMIN_PASSWORD ?? "Nazmul89?";
const adminName = env.ADMIN_NAME ?? "Nadimul Haque";

const authOptions: BetterAuthOptions = {
  database: getDb(),
  baseURL: resolveAuthBaseUrl(),
  secret: env.BETTER_AUTH_SECRET ?? env.APP_SECRETS_KEY ?? "bestdecks-dev-secret",
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    nextCookies(),
  ],
  trustedOrigins: [resolveAuthBaseUrl()],
};

export const auth = betterAuth(authOptions);
export const authHandlers = toNextJsHandler(async (request) => {
  await ensureAuthReady();
  return auth.handler(request);
});

let authReadyPromise: Promise<void> | null = null;

async function migrateAuthTables() {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();
}

async function seedAdminAccount() {
  const db = getDb();
  const existing = db
    .prepare('SELECT "id" FROM "user" WHERE "email" = ? LIMIT 1')
    .get(adminEmail) as { id: string } | undefined;

  if (!existing) {
    await auth.api.signUpEmail({
      body: {
        name: adminName,
        email: adminEmail,
        password: adminPassword,
      },
    });
  }

  db.prepare(
    'UPDATE "user" SET "role" = ?, "emailVerified" = ?, "updatedAt" = ? WHERE "email" = ?',
  ).run("admin", 1, new Date().toISOString(), adminEmail);
}

export async function ensureAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      await migrateAuthTables();
      await seedAdminAccount();
    })();
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

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  return auth.api.getSession({
    headers: requestHeaders,
  });
}

export async function getAdminSession() {
  const session = await getSession();
  if (!session?.user) {
    return null;
  }

  if ((session.user as { role?: string }).role !== "admin") {
    return null;
  }

  return session;
}
