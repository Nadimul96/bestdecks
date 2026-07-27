import { z, type ZodType } from "zod";

import {
  normalizePersistableSourceUrl,
} from "@/src/domain/source-url";

import type { DeckGenerationInput } from "./providers";

export type ProviderAdapterReleaseStatus = "implemented" | "experimental";

export interface ProviderAdapterMetadata<
  Capabilities extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  providerId: string;
  apiVersion: string;
  modelId: string | null;
  contractVersion: number;
  capabilities: Capabilities;
  releaseStatus: ProviderAdapterReleaseStatus;
}

export type ProviderAdapterErrorCode =
  | "configuration"
  | "authentication"
  | "authorization"
  | "client_request"
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "aborted"
  | "malformed_response"
  | "empty_response"
  | "generation_failed"
  | "poll_timeout";

/**
 * A bounded, non-secret provider failure. Raw response bodies and upstream
 * messages never cross this boundary.
 */
export class ProviderAdapterError extends Error {
  public constructor(
    public readonly providerId: string,
    displayName: string,
    public readonly operation: string,
    public readonly code: ProviderAdapterErrorCode,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(
      `${displayName} ${operation} failed (${code}${
        status === undefined ? "" : `, HTTP ${status}`
      }).`,
    );
    this.name = "ProviderAdapterError";
  }
}

export function providerErrorFromStatus(
  providerId: string,
  displayName: string,
  operation: string,
  status: number,
): ProviderAdapterError {
  if (status === 401) {
    return new ProviderAdapterError(
      providerId,
      displayName,
      operation,
      "authentication",
      false,
      status,
    );
  }
  if (status === 403) {
    return new ProviderAdapterError(
      providerId,
      displayName,
      operation,
      "authorization",
      false,
      status,
    );
  }
  if (status === 408) {
    return new ProviderAdapterError(
      providerId,
      displayName,
      operation,
      "timeout",
      true,
      status,
    );
  }
  if (status === 429) {
    return new ProviderAdapterError(
      providerId,
      displayName,
      operation,
      "rate_limited",
      true,
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    return new ProviderAdapterError(
      providerId,
      displayName,
      operation,
      "provider_unavailable",
      true,
      status,
    );
  }
  return new ProviderAdapterError(
    providerId,
    displayName,
    operation,
    "client_request",
    false,
    status,
  );
}

export function parseProviderJson<T>(input: {
  text: string;
  schema: ZodType<T>;
  providerId: string;
  displayName: string;
  operation: string;
}): T {
  if (input.text.trim() === "") {
    throw new ProviderAdapterError(
      input.providerId,
      input.displayName,
      input.operation,
      "empty_response",
      false,
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(input.text);
  } catch {
    throw new ProviderAdapterError(
      input.providerId,
      input.displayName,
      input.operation,
      "malformed_response",
      false,
    );
  }

  const parsed = input.schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ProviderAdapterError(
      input.providerId,
      input.displayName,
      input.operation,
      "malformed_response",
      false,
    );
  }
  return parsed.data;
}

export function normalizeProviderTransportError(input: {
  error: unknown;
  providerId: string;
  displayName: string;
  operation: string;
  signal?: AbortSignal;
}): ProviderAdapterError {
  if (input.error instanceof ProviderAdapterError) return input.error;

  if (input.signal?.aborted) {
    return new ProviderAdapterError(
      input.providerId,
      input.displayName,
      input.operation,
      "aborted",
      false,
    );
  }

  if (input.error instanceof Error && /timed out/iu.test(input.error.message)) {
    return new ProviderAdapterError(
      input.providerId,
      input.displayName,
      input.operation,
      "timeout",
      true,
    );
  }

  return new ProviderAdapterError(
    input.providerId,
    input.displayName,
    input.operation,
    "network",
    true,
  );
}

export function invalidProviderConfiguration(
  providerId: string,
  displayName: string,
): ProviderAdapterError {
  return new ProviderAdapterError(
    providerId,
    displayName,
    "configuration",
    "configuration",
    false,
  );
}

export const safeProviderOutputUrlSchema = z.string().trim().max(4_096).url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider output URLs must be credential-free HTTPS URLs.",
      });
    }
  });

/** Remove transient or credential-bearing source URL data before a renderer sees it. */
export function normalizeDeckInputSourceUrls(
  input: DeckGenerationInput,
): DeckGenerationInput {
  return {
    ...input,
    companyBrief: {
      ...input.companyBrief,
      websiteUrl: normalizePersistableSourceUrl(input.companyBrief.websiteUrl),
      sourceUrls: input.companyBrief.sourceUrls.map(normalizePersistableSourceUrl),
      ...(input.companyBrief.sourceClaims
        ? {
            sourceClaims: input.companyBrief.sourceClaims.map((claim) => ({
              ...claim,
              sourceUrl: normalizePersistableSourceUrl(claim.sourceUrl),
            })),
          }
        : {}),
    },
  };
}
