import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeProviderCallObservability,
  providerCallObservabilitySchema,
  providerHealthSchema,
  uncheckedProviderHealth,
} from "./provider-observability";

test("provider health preserves not-checked as distinct from failure", () => {
  assert.deepEqual(uncheckedProviderHealth(true), {
    configured: true,
    reachable: null,
    liveSmokePassed: null,
  });
  assert.doesNotThrow(() => providerHealthSchema.parse({
    configured: true,
    reachable: false,
    liveSmokePassed: null,
  }));
  assert.throws(() => providerHealthSchema.parse({
    configured: false,
    reachable: false,
    liveSmokePassed: null,
  }), /unconfigured provider/i);
});

test("provider health never infers live-smoke success from reachability", () => {
  assert.doesNotThrow(() => providerHealthSchema.parse({
    configured: true,
    reachable: true,
    liveSmokePassed: null,
  }));
  assert.throws(() => providerHealthSchema.parse({
    configured: true,
    reachable: false,
    liveSmokePassed: true,
  }), /passing live smoke/i);
});

test("provider usage merges matching metrics deterministically", () => {
  assert.deepEqual(mergeProviderCallObservability([
    {
      usage: [
        { metric: "total_tokens", unit: "tokens", amount: 7 },
        { metric: "input_tokens", unit: "tokens", amount: 5 },
      ],
    },
    {
      usage: [
        { metric: "input_tokens", unit: "tokens", amount: 3 },
        { metric: "output_tokens", unit: "tokens", amount: 2 },
      ],
    },
  ]), {
    usage: [
      { metric: "input_tokens", unit: "tokens", amount: 8 },
      { metric: "output_tokens", unit: "tokens", amount: 2 },
      { metric: "total_tokens", unit: "tokens", amount: 7 },
    ],
  });

  assert.deepEqual(mergeProviderCallObservability([
    { usage: [{ metric: "browser_time", unit: "milliseconds", amount: 0.5 }] },
    { usage: [{ metric: "browser_time", unit: "milliseconds", amount: 1 }] },
  ]), {
    usage: [{ metric: "browser_time", unit: "milliseconds", amount: 1.5 }],
  });
});

test("provider usage rejects duplicate metrics and ambiguous cost totals", () => {
  assert.throws(() => providerCallObservabilitySchema.parse({
    usage: [
      { metric: "input_tokens", unit: "tokens", amount: 1 },
      { metric: "input_tokens", unit: "tokens", amount: 2 },
    ],
  }), /unique/i);

  assert.throws(() => mergeProviderCallObservability([
    { cost: { currency: "USD", amount: 1 } },
    { cost: { currency: "EUR", amount: 1 } },
  ]), /different currencies/i);
});
