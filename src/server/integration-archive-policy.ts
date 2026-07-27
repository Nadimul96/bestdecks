export const INTEGRATION_ARCHIVE_QUOTA = {
  windowMs: 24 * 60 * 60 * 1_000,
  maxRowsPerWindow: 100,
  maxRetainedRows: 1_000,
  maxRetainedPayloadBytes: 2 * 1_024 * 1_024,
} as const;

export interface IntegrationArchiveUsage {
  retainedRows: number;
  retainedPayloadBytes: number;
  rowsInWindow: number;
  oldestRowInWindowAt?: string;
}

export class IntegrationArchiveQuotaExceededError extends Error {
  public readonly code = "integration_archive_quota_exceeded";

  public constructor(
    public readonly retryAfterSeconds: number,
  ) {
    super("Integration archive quota exceeded.");
    this.name = "IntegrationArchiveQuotaExceededError";
  }
}

function assertNonnegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer.`);
  }
}

function windowRetryAfterSeconds(usage: IntegrationArchiveUsage, timestamp: string) {
  const timestampMs = Date.parse(timestamp);
  const oldestMs = usage.oldestRowInWindowAt
    ? Date.parse(usage.oldestRowInWindowAt)
    : Number.NaN;
  if (!Number.isFinite(timestampMs) || !Number.isFinite(oldestMs)) {
    return Math.ceil(INTEGRATION_ARCHIVE_QUOTA.windowMs / 1_000);
  }

  return Math.min(
    Math.ceil(INTEGRATION_ARCHIVE_QUOTA.windowMs / 1_000),
    Math.max(
      1,
      Math.ceil((oldestMs + INTEGRATION_ARCHIVE_QUOTA.windowMs - timestampMs) / 1_000),
    ),
  );
}

/**
 * Reserve one append-only archive row. The caller keeps the returned usage
 * inside its write transaction and persists no archive row unless this check
 * succeeds. Retained history is never pruned to make room.
 */
export function reserveIntegrationArchiveCapacity(
  usage: IntegrationArchiveUsage,
  payloadBytes: number,
  timestamp: string,
): IntegrationArchiveUsage {
  assertNonnegativeSafeInteger(usage.retainedRows, "retainedRows");
  assertNonnegativeSafeInteger(usage.retainedPayloadBytes, "retainedPayloadBytes");
  assertNonnegativeSafeInteger(usage.rowsInWindow, "rowsInWindow");
  assertNonnegativeSafeInteger(payloadBytes, "payloadBytes");
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new RangeError("timestamp must be a valid date-time.");
  }

  if (
    usage.retainedRows + 1 > INTEGRATION_ARCHIVE_QUOTA.maxRetainedRows
    || usage.retainedPayloadBytes + payloadBytes
      > INTEGRATION_ARCHIVE_QUOTA.maxRetainedPayloadBytes
  ) {
    // Lifetime caps require operator intervention rather than destructive
    // cleanup. Keep a stable bounded retry hint for generic HTTP clients.
    throw new IntegrationArchiveQuotaExceededError(
      Math.ceil(INTEGRATION_ARCHIVE_QUOTA.windowMs / 1_000),
    );
  }

  if (usage.rowsInWindow + 1 > INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow) {
    throw new IntegrationArchiveQuotaExceededError(
      windowRetryAfterSeconds(usage, timestamp),
    );
  }

  return {
    retainedRows: usage.retainedRows + 1,
    retainedPayloadBytes: usage.retainedPayloadBytes + payloadBytes,
    rowsInWindow: usage.rowsInWindow + 1,
    oldestRowInWindowAt: usage.oldestRowInWindowAt ?? timestamp,
  };
}
