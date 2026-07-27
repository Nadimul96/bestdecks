/**
 * Canonical public capability inventory.
 *
 * `implemented` means a code path exists in this repository. It does not imply
 * that a live provider run has passed. Only `reference-verified` may make that
 * stronger claim, and that status requires a checked-in, reproducible receipt.
 */

import { DECK_ARCHETYPES } from "@/src/domain/schemas";

export const CAPABILITY_STATUSES = [
  "implemented",
  "reference-verified",
  "experimental",
  "planned",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type CapabilityBoundary = "oss-core" | "provider-adapter";

export const NAMED_DECK_PLAYBOOKS = DECK_ARCHETYPES.filter(
  (archetype) => archetype !== "custom",
);

export const REFERENCE_PIPELINE_STAGES = [
  "crawl",
  "research",
  "brief",
  "plan",
  "render",
] as const;

export const RENDERER_ADAPTERS = ["presenton", "alai", "plusai"] as const;

export const CURRENT_CAPABILITY_COUNTS = [
  {
    id: "deck-playbooks",
    value: NAMED_DECK_PLAYBOOKS.length,
    label: "deck playbooks",
    definition: "The Custom option is separate and is not counted as a named playbook.",
  },
  {
    id: "pipeline-stages",
    value: REFERENCE_PIPELINE_STAGES.length,
    label: "evidence-to-deck stages",
    definition: "Crawl, research, brief, plan, and render.",
  },
  {
    id: "renderer-adapters",
    value: RENDERER_ADAPTERS.length,
    label: "renderer adapters",
    definition: "Presenton is the reference adapter; Alai and Plus AI remain experimental.",
  },
] as const;

export interface PublicCapability {
  id: string;
  name: string;
  summary: string;
  status: CapabilityStatus;
  boundary: CapabilityBoundary;
  evidence: readonly string[];
}

export const PUBLIC_CAPABILITIES: readonly PublicCapability[] = [
  {
    id: "target-intake",
    name: "CSV, TSV, and pasted-URL intake",
    summary: "Normalize target rows into the typed run contract.",
    status: "implemented",
    boundary: "oss-core",
    evidence: ["src/domain/intake.ts", "src/domain/schemas.ts"],
  },
  {
    id: "seller-context",
    name: "Seller context and eight named deck archetypes",
    summary: "Capture seller-provided context and select a structured deck narrative.",
    status: "implemented",
    boundary: "oss-core",
    evidence: ["src/domain/schemas.ts", "src/domain/pipeline.ts"],
  },
  {
    id: "cloudflare-crawl",
    name: "Cloudflare Browser Rendering crawl adapter",
    summary: "Fetch target-site content through a bring-your-own-key provider adapter.",
    status: "implemented",
    boundary: "provider-adapter",
    evidence: ["src/integrations/cloudflare.ts", "src/server/run-executor.ts"],
  },
  {
    id: "deepcrawl-crawl",
    name: "Deepcrawl crawl adapter",
    summary: "Adapter code exists, but it is disabled and outside the durable reference path.",
    status: "experimental",
    boundary: "provider-adapter",
    evidence: ["src/integrations/deepcrawl.ts"],
  },
  {
    id: "perplexity-research",
    name: "Perplexity enrichment adapter",
    summary: "Request external company research through a bring-your-own-key adapter.",
    status: "implemented",
    boundary: "provider-adapter",
    evidence: ["src/integrations/perplexity.ts", "src/server/run-executor.ts"],
  },
  {
    id: "gemini-planning",
    name: "Gemini brief and slide planning",
    summary: "Build structured company briefs and slide plans when Gemini is configured.",
    status: "implemented",
    boundary: "provider-adapter",
    evidence: ["src/server/ai-brief-builder.ts", "src/server/slide-planner.ts"],
  },
  {
    id: "gemini-images",
    name: "Gemini image-generation adapter",
    summary: "Adapter code exists, while generated media remains disabled by the rich native-vector artifact contract.",
    status: "experimental",
    boundary: "provider-adapter",
    evidence: ["src/integrations/gemini.ts"],
  },
  {
    id: "presenton-rendering",
    name: "Presenton deterministic rich-static PPTX rendering",
    summary: "Build exact native-vector slide UI locally, use self-hosted Presenton only for PPTX export, and persist the verified artifact.",
    status: "implemented",
    boundary: "provider-adapter",
    evidence: ["src/integrations/presenton.ts", "src/server/run-executor.ts"],
  },
  {
    id: "alai-rendering",
    name: "Alai renderer adapter",
    summary: "Adapter code exists, but it has no checked-in live reference receipt.",
    status: "experimental",
    boundary: "provider-adapter",
    evidence: ["src/integrations/alai.ts"],
  },
  {
    id: "plusai-rendering",
    name: "Plus AI / Google Slides renderer adapter",
    summary: "Adapter code exists, while the product surface remains disabled and unverified.",
    status: "experimental",
    boundary: "provider-adapter",
    evidence: ["src/integrations/plusai.ts"],
  },
  {
    id: "evidence-coverage",
    name: "Claim-level evidence coverage and delivery gate",
    summary: "Persist deterministic claim provenance and block rendering when factual claims lack source support.",
    status: "implemented",
    boundary: "oss-core",
    evidence: [
      "src/domain/evidence.ts",
      "src/domain/run-receipt.ts",
      "src/server/run-executor.ts",
    ],
  },
  {
    id: "outbound-email",
    name: "Outbound email delivery",
    summary: "Sending generated decks by email is outside the current implemented reference surface.",
    status: "planned",
    boundary: "oss-core",
    evidence: ["ROADMAP.md"],
  },
] as const;

export const LIVE_REFERENCE_VERIFICATION = {
  state: "blocked",
  label: "Live-reference verification blocked",
  reason:
    "No reproducible Cloudflare → Perplexity → Gemini → renderer run receipt is checked into this repository.",
} as const;

export const OSS_DISTRIBUTION = {
  license: "Apache-2.0",
  mode: "Self-hosted, bring your own provider keys",
  coreBoundary:
    "Intake, research orchestration, brief and slide planning, rendering adapters, and artifact persistence belong in the public core.",
  cloudBoundary:
    "Managed hosting, queues, monitoring, storage, teams, scheduling, analytics, billing, and managed provider credits belong in a separate private cloud service.",
} as const;

export function capabilityCount(status: CapabilityStatus) {
  return PUBLIC_CAPABILITIES.filter((capability) => capability.status === status).length;
}
