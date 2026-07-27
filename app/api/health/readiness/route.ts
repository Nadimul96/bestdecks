import { NextResponse } from "next/server";

import {
  providerHealthSchema,
  uncheckedProviderHealth,
} from "@/src/domain/provider-observability";
import { requestText } from "@/src/integrations/http";
import { resolveSafeOutboundTarget } from "@/src/integrations/url-policy";
import { getAdminSession } from "@/src/server/auth";
import { getDb } from "@/src/server/db";
import { buildReferenceProviderStatuses } from "@/src/server/reference-provider-health";
import { resolveIntegrationConfig } from "@/src/server/settings";

export const dynamic = "force-dynamic";

async function checkDatabase() {
  try {
    const db = await getDb();
    const result = (await db.execute("SELECT 1 AS ok")) as { ok: number } | undefined;
    return result?.ok === 1;
  } catch {
    return false;
  }
}

async function checkPresenton(
  baseUrl: string | undefined,
  allowPrivateNetwork: boolean,
  configured: boolean,
) {
  if (!baseUrl || !configured) return uncheckedProviderHealth(false);

  try {
    const target = await resolveSafeOutboundTarget(baseUrl, { allowPrivateNetwork });
    const response = await requestText(baseUrl, {
      method: "GET",
      pinnedAddress: target.address,
      pinnedFamily: target.family,
      timeoutMs: 5_000,
      maxResponseBytes: 64 * 1024,
    });
    return providerHealthSchema.parse({
      configured: true,
      reachable: response.status > 0 && response.status < 500,
      liveSmokePassed: null,
    });
  } catch {
    return providerHealthSchema.parse({
      configured: true,
      reachable: false,
      liveSmokePassed: null,
    });
  }
}

/** Admin-only dependency readiness. Never returns endpoint URLs, secrets, or raw errors. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = await checkDatabase();
  let settings: Awaited<ReturnType<typeof resolveIntegrationConfig>>;
  try {
    settings = await resolveIntegrationConfig(session.user.id);
  } catch {
    const providers = buildReferenceProviderStatuses({});
    return NextResponse.json(
      {
        status: "degraded",
        services: {
          database,
          artifactRenderer: uncheckedProviderHealth(false),
          worker: {
            observableFromWebProcess: false,
            providers,
            verification: "Use pnpm doctor in the worker environment and a redacted run receipt.",
          },
        },
      },
      { status: 503 },
    );
  }
  const providers = buildReferenceProviderStatuses(settings);
  const renderer = providers.find((provider) => provider.stage === "rendering");
  const presenton = await checkPresenton(
    settings.presentonBaseUrl,
    settings.allowPrivateProviderUrls,
    renderer?.health.configured ?? false,
  );
  const observedProviders = providers.map((provider) =>
    provider.stage === "rendering"
      ? { ...provider, health: presenton }
      : provider
  );

  const services = {
    database,
    artifactRenderer: presenton,
    worker: {
      observableFromWebProcess: false,
      providers: observedProviders,
      verification: "Use pnpm doctor in the worker environment and a redacted run receipt.",
    },
  };
  const ready =
    services.database &&
    services.artifactRenderer.reachable;

  return NextResponse.json(
    { status: ready ? "ready" : "degraded", services },
    { status: ready ? 200 : 503 },
  );
}
