import { z } from "zod";

const MAX_OBSERVABILITY_AMOUNT = Number.MAX_SAFE_INTEGER;
const MAX_USAGE_METRICS = 32;

const observabilityIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9._-]*$/u);

/**
 * `null` means no retained check exists. It is intentionally distinct from
 * `false`, which means a check ran and failed.
 */
export const providerHealthSchema = z.object({
  configured: z.boolean(),
  reachable: z.boolean().nullable(),
  liveSmokePassed: z.boolean().nullable(),
}).strict().superRefine((health, context) => {
  if (
    !health.configured
    && (health.reachable !== null || health.liveSmokePassed !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An unconfigured provider cannot have retained reachability or live-smoke state.",
    });
  }

  if (health.liveSmokePassed !== null && health.reachable === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A live-smoke result requires retained reachability evidence.",
      path: ["liveSmokePassed"],
    });
  }

  if (health.liveSmokePassed === true && health.reachable !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A passing live smoke must also prove provider reachability.",
      path: ["liveSmokePassed"],
    });
  }
});

export const providerUsageMetricSchema = z.object({
  metric: observabilityIdentifierSchema,
  unit: observabilityIdentifierSchema,
  amount: z.number().finite().nonnegative().max(MAX_OBSERVABILITY_AMOUNT),
}).strict();

export const providerCostSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  amount: z.number().finite().nonnegative().max(MAX_OBSERVABILITY_AMOUNT),
}).strict();

export const providerCallObservabilitySchema = z.object({
  usage: z.array(providerUsageMetricSchema).min(1).max(MAX_USAGE_METRICS).optional(),
  cost: providerCostSchema.optional(),
}).strict().superRefine((observability, context) => {
  if (!observability.usage && !observability.cost) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provider observability requires at least one retained usage or cost value.",
    });
  }

  const keys = new Set<string>();
  observability.usage?.forEach((metric, index) => {
    const key = `${metric.metric}\u0000${metric.unit}`;
    if (keys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider usage metrics must be unique by metric and unit.",
        path: ["usage", index],
      });
    }
    keys.add(key);
  });
});

export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type ProviderUsageMetric = z.infer<typeof providerUsageMetricSchema>;
export type ProviderCost = z.infer<typeof providerCostSchema>;
export type ProviderCallObservability = z.infer<typeof providerCallObservabilitySchema>;

export function uncheckedProviderHealth(configured: boolean): ProviderHealth {
  return providerHealthSchema.parse({
    configured,
    reachable: null,
    liveSmokePassed: null,
  });
}

/**
 * Add call-level metrics without guessing prices or converting units. A
 * currency mismatch fails closed instead of manufacturing a mixed total.
 */
export function mergeProviderCallObservability(
  values: ReadonlyArray<ProviderCallObservability | undefined>,
): ProviderCallObservability | undefined {
  const usage = new Map<string, ProviderUsageMetric>();
  let cost: ProviderCost | undefined;

  for (const value of values) {
    if (!value) continue;
    const parsed = providerCallObservabilitySchema.parse(value);
    for (const metric of parsed.usage ?? []) {
      const key = `${metric.metric}\u0000${metric.unit}`;
      const prior = usage.get(key);
      const amount = (prior?.amount ?? 0) + metric.amount;
      if (
        Number.isInteger(prior?.amount ?? 0)
        && Number.isInteger(metric.amount)
        && !Number.isSafeInteger(amount)
      ) {
        throw new RangeError("Provider usage total exceeded the safe integer range.");
      }
      if (!Number.isFinite(amount) || amount > MAX_OBSERVABILITY_AMOUNT) {
        throw new RangeError("Provider usage total exceeded the supported range.");
      }
      usage.set(key, { ...metric, amount });
    }

    if (parsed.cost) {
      if (cost && cost.currency !== parsed.cost.currency) {
        throw new RangeError("Provider costs with different currencies cannot be combined.");
      }
      const amount = (cost?.amount ?? 0) + parsed.cost.amount;
      if (!Number.isFinite(amount) || amount > MAX_OBSERVABILITY_AMOUNT) {
        throw new RangeError("Provider cost total exceeded the supported range.");
      }
      cost = { currency: parsed.cost.currency, amount };
    }
  }

  if (usage.size === 0 && !cost) return undefined;
  return providerCallObservabilitySchema.parse({
    ...(usage.size > 0
      ? {
          usage: [...usage.values()].sort((left, right) =>
            left.metric.localeCompare(right.metric) || left.unit.localeCompare(right.unit)
          ),
        }
      : {}),
    ...(cost ? { cost } : {}),
  });
}
