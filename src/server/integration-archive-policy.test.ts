import assert from "node:assert/strict";
import test from "node:test";

import {
  INTEGRATION_ARCHIVE_QUOTA,
  IntegrationArchiveQuotaExceededError,
  reserveIntegrationArchiveCapacity,
} from "./integration-archive-policy";

const timestamp = "2026-07-13T12:00:00.000Z";

test("integration archive quota accepts the final row inside every boundary", () => {
  const result = reserveIntegrationArchiveCapacity({
    retainedRows: INTEGRATION_ARCHIVE_QUOTA.maxRetainedRows - 1,
    retainedPayloadBytes: INTEGRATION_ARCHIVE_QUOTA.maxRetainedPayloadBytes - 8,
    rowsInWindow: INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow - 1,
    oldestRowInWindowAt: "2026-07-13T11:00:00.000Z",
  }, 8, timestamp);

  assert.deepEqual(result, {
    retainedRows: INTEGRATION_ARCHIVE_QUOTA.maxRetainedRows,
    retainedPayloadBytes: INTEGRATION_ARCHIVE_QUOTA.maxRetainedPayloadBytes,
    rowsInWindow: INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow,
    oldestRowInWindowAt: "2026-07-13T11:00:00.000Z",
  });
});

test("integration archive quota rejects window, retained-row, and retained-byte overflow", () => {
  const cases = [
    {
      usage: {
        retainedRows: INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow,
        retainedPayloadBytes: 100,
        rowsInWindow: INTEGRATION_ARCHIVE_QUOTA.maxRowsPerWindow,
        oldestRowInWindowAt: "2026-07-13T11:00:00.000Z",
      },
      payloadBytes: 1,
      expectedRetryAfter: 82_800,
    },
    {
      usage: {
        retainedRows: INTEGRATION_ARCHIVE_QUOTA.maxRetainedRows,
        retainedPayloadBytes: 100,
        rowsInWindow: 0,
      },
      payloadBytes: 1,
      expectedRetryAfter: 86_400,
    },
    {
      usage: {
        retainedRows: 1,
        retainedPayloadBytes: INTEGRATION_ARCHIVE_QUOTA.maxRetainedPayloadBytes,
        rowsInWindow: 0,
      },
      payloadBytes: 1,
      expectedRetryAfter: 86_400,
    },
  ];

  for (const { usage, payloadBytes, expectedRetryAfter } of cases) {
    assert.throws(
      () => reserveIntegrationArchiveCapacity(usage, payloadBytes, timestamp),
      (error: unknown) => {
        assert.ok(error instanceof IntegrationArchiveQuotaExceededError);
        assert.equal(error.retryAfterSeconds, expectedRetryAfter);
        return true;
      },
    );
  }
});
