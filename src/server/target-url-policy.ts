import type { OutboundUrlPolicy } from "@/src/integrations/url-policy";
import { resolveSafeOutboundTarget } from "@/src/integrations/url-policy";

export class TargetUrlPolicyError extends Error {
  public readonly code = "target_url_policy";
  public readonly retryable = false;

  public constructor() {
    super("Target URL did not satisfy the public HTTPS network policy.");
    this.name = "TargetUrlPolicyError";
  }
}

export function validateTargetTransportApproval(
  value: string,
  _crawlFailureException = false,
): void {
  // Retain the argument for API compatibility. It authorizes crawl fallback,
  // never a downgrade from HTTPS to plaintext HTTP.
  void _crawlFailureException;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return;
  } catch {
    // The common policy error below intentionally hides parsing details.
  }
  throw new TargetUrlPolicyError();
}

export async function validatePublicTargetUrl(
  value: string,
  policy: Pick<OutboundUrlPolicy, "resolver"> = {},
): Promise<void> {
  try {
    await resolveSafeOutboundTarget(value, {
      ...policy,
      allowPrivateNetwork: false,
      allowPublicHttp: false,
    });
  } catch {
    throw new TargetUrlPolicyError();
  }
}

export async function validatePublicTargetUrls(
  values: readonly string[],
  policy: Pick<OutboundUrlPolicy, "resolver"> = {},
): Promise<void> {
  const concurrency = 8;
  for (let offset = 0; offset < values.length; offset += concurrency) {
    await Promise.all(
      values.slice(offset, offset + concurrency).map((value) =>
        validatePublicTargetUrl(value, policy)
      ),
    );
  }
}
