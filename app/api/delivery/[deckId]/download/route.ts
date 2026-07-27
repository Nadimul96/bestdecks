import { requestBytes } from "@/src/integrations/http";
import { resolveSafeOutboundTarget } from "@/src/integrations/url-policy";
import { getSession } from "@/src/server/auth";
import { createDeliveryDownloadHandler } from "@/src/server/delivery-download";
import { getOwnedDeliveryDeck } from "@/src/server/repository";
import { resolveIntegrationConfig } from "@/src/server/settings";

export const dynamic = "force-dynamic";

export const GET = createDeliveryDownloadHandler({
  getSession,
  getOwnedDeliveryDeck,
  resolveIntegrationConfig,
  resolveSafeOutboundTarget,
  requestBytes,
});
