import type { DeckIntent } from "@/lib/workspace-types";
import { randomUUID } from "@/lib/utils-crypto";
import type { DeckArchetype } from "@/src/domain/schemas";

export interface SetupSubmissionInput {
  websiteUrl: string;
  companyName: string;
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  intent: DeckIntent;
  audience: string;
  objective: string;
  callToAction: string;
  websitesText: string;
  contactsCsvText: string;
}

export const setupArchetypeByIntent = {
  cold_pitch: "cold_outreach",
  post_call: "warm_intro",
  agency_rfp: "agency_proposal",
  investor: "investor_pitch",
  partnership: "warm_intro",
  event_sponsor: "agency_proposal",
  product_demo: "product_launch",
  upsell: "warm_intro",
  board_update: "thought_leadership",
  custom: "cold_outreach",
} as const satisfies Record<DeckIntent, DeckArchetype>;

export class IncompleteSetupError extends Error {
  public constructor(public readonly missingFields: string[]) {
    super(`Complete these required fields: ${missingFields.join(", ")}.`);
    this.name = "IncompleteSetupError";
  }
}

function nonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedTargetCount(value: string): number {
  return new Set(
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean),
  ).size;
}

/** Build one atomic onboarding payload without filling semantic fields with guesses. */
export function buildSetupOnboardingPayload(input: SetupSubmissionInput) {
  const services = nonEmptyLines(input.servicesText);
  const differentiators = nonEmptyLines(input.differentiatorsText);
  const required = [
    ["website", input.websiteUrl.trim()],
    ["offer", input.offerSummary.trim()],
    ["services", services.length > 0 ? "present" : ""],
    ["differentiators", differentiators.length > 0 ? "present" : ""],
    ["target customer", input.targetCustomer.trim()],
    ["desired outcome", input.desiredOutcome.trim()],
    ["audience", input.audience.trim()],
    ["objective", input.objective.trim()],
    ["call to action", input.callToAction.trim()],
  ] as const;
  const missingFields = required
    .filter(([, value]) => !value)
    .map(([label]) => label);
  if (missingFields.length > 0) throw new IncompleteSetupError(missingFields);

  return {
    profile: {
      companyName: input.companyName.trim() || undefined,
      websiteUrl: input.websiteUrl.trim(),
    },
    sellerContext: {
      websiteUrl: input.websiteUrl.trim(),
      companyName: input.companyName.trim() || undefined,
      offerSummary: input.offerSummary.trim(),
      services,
      differentiators,
      targetCustomer: input.targetCustomer.trim(),
      desiredOutcome: input.desiredOutcome.trim(),
      proofPoints: [],
      constraints: [],
    },
    questionnaire: {
      archetype: setupArchetypeByIntent[input.intent],
      audience: input.audience.trim(),
      objective: input.objective.trim(),
      callToAction: input.callToAction.trim(),
    },
    intakeDraft: {
      websitesText: input.websitesText,
      contactsCsvText: input.contactsCsvText,
    },
  };
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function responseError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof payload?.error === "string" ? payload.error : fallback;
}

export async function submitSetup(
  input: SetupSubmissionInput,
  options: { fetcher?: FetchLike; idempotencyKey?: string } = {},
): Promise<{ targetCount: number; runId?: string }> {
  const fetcher = options.fetcher ?? fetch;
  const onboarding = buildSetupOnboardingPayload(input);
  const saveResponse = await fetcher("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(onboarding),
  });
  if (!saveResponse.ok) {
    throw new Error(await responseError(saveResponse, "Unable to save onboarding state."));
  }

  const targetCount = normalizedTargetCount(input.websitesText);
  if (targetCount === 0) return { targetCount };

  const runResponse = await fetcher("/api/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey ?? randomUUID(),
    },
    body: JSON.stringify({
      websitesText: input.websitesText,
      contactsCsvText: input.contactsCsvText || undefined,
    }),
  });
  const runPayload = await runResponse.json().catch(() => null) as
    | { runId?: unknown; error?: unknown }
    | null;
  if (!runResponse.ok || typeof runPayload?.runId !== "string") {
    const reason = typeof runPayload?.error === "string"
      ? runPayload.error
      : "Unable to queue the initial run.";
    throw new Error(`Setup was saved, but the initial run was not queued: ${reason}`);
  }

  return { targetCount, runId: runPayload.runId };
}
