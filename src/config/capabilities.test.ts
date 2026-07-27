import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAPABILITY_STATUSES,
  CURRENT_CAPABILITY_COUNTS,
  LIVE_REFERENCE_VERIFICATION,
  NAMED_DECK_PLAYBOOKS,
  PUBLIC_CAPABILITIES,
  REFERENCE_PIPELINE_STAGES,
  RENDERER_ADAPTERS,
} from "./capabilities";
import { deckArchetypeSchema } from "@/src/domain/schemas";
import { outputFormatOptions } from "@/lib/workspace-types";

function readRepositoryFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

test("public capability metadata uses the release status contract", () => {
  assert.deepEqual(CAPABILITY_STATUSES, [
    "implemented",
    "reference-verified",
    "experimental",
    "planned",
  ]);

  assert.equal(
    new Set(PUBLIC_CAPABILITIES.map((capability) => capability.id)).size,
    PUBLIC_CAPABILITIES.length,
    "capability IDs must be unique",
  );

  for (const capability of PUBLIC_CAPABILITIES) {
    assert.ok(CAPABILITY_STATUSES.includes(capability.status));
    assert.ok(capability.evidence.length > 0, `${capability.id} must cite source evidence`);
  }
});

test("no capability is called reference-verified without a live receipt", () => {
  assert.equal(LIVE_REFERENCE_VERIFICATION.state, "blocked");
  assert.equal(
    PUBLIC_CAPABILITIES.filter((capability) => capability.status === "reference-verified").length,
    0,
  );
});

test("landing capability counts stay tied to the implemented contracts", () => {
  assert.equal(NAMED_DECK_PLAYBOOKS.length, 8);
  assert.deepEqual(
    NAMED_DECK_PLAYBOOKS,
    deckArchetypeSchema.options.filter((archetype) => archetype !== "custom"),
  );
  assert.deepEqual(REFERENCE_PIPELINE_STAGES, ["crawl", "research", "brief", "plan", "render"]);
  assert.deepEqual(RENDERER_ADAPTERS, ["presenton", "alai", "plusai"]);
  assert.deepEqual(
    CURRENT_CAPABILITY_COUNTS.map(({ value }) => value),
    [8, 5, 3],
  );
  assert.deepEqual(
    CURRENT_CAPABILITY_COUNTS.map(({ label }) => label),
    ["deck playbooks", "evidence-to-deck stages", "renderer adapters"],
  );
  assert.equal(CURRENT_CAPABILITY_COUNTS[1]?.definition, "Crawl, research, brief, plan, and render.");
});

test("canonical capability copy excludes unsupported marketing claims", () => {
  const copy = JSON.stringify(PUBLIC_CAPABILITIES);
  for (const unsupportedClaim of [
    "10x",
    "close more deals",
    "free decks",
    "Claude",
    "Kimi",
    "SSO",
    "SLA",
  ]) {
    assert.equal(copy.includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.doesNotMatch(copy, /\$\d/);
});

test("README capability rows stay aligned with the canonical inventory", () => {
  const readme = readRepositoryFile("README.md");
  const statusLabels = {
    implemented: "Implemented",
    "reference-verified": "Reference-verified",
    experimental: "Experimental",
    planned: "Planned",
  } as const;
  const boundaryLabels = {
    "oss-core": "OSS core",
    "provider-adapter": "Provider adapter",
  } as const;

  for (const capability of PUBLIC_CAPABILITIES) {
    const row = [
      capability.name,
      statusLabels[capability.status],
      boundaryLabels[capability.boundary],
      capability.evidence.map((path) => `\`${path}\``).join(", "),
    ].join(" | ");
    assert.ok(
      readme.includes(`| ${row} |`),
      `README row for ${capability.id} must match its canonical name, status, boundary, and evidence`,
    );
  }
});

test("checked-in run example uses only the active reference API contract", () => {
  const example = JSON.parse(
    readRepositoryFile("examples/run-input.example.json"),
  ) as {
    questionnaire: {
      outputFormat: string;
      optionalReview: boolean;
      allowUserApprovedCrawlException: boolean;
    };
  };

  assert.equal(example.questionnaire.outputFormat, "pptx");
  assert.equal(example.questionnaire.optionalReview, false);
  assert.equal(example.questionnaire.allowUserApprovedCrawlException, false);
});

test("public v0.1 surfaces expose only the attested PPTX reference path", () => {
  assert.deepEqual(outputFormatOptions.map(({ value }) => value), ["pptx"]);

  const runRoute = readRepositoryFile("app/api/runs/route.ts");
  assert.match(runRoute, /outputFormat !== "pptx"/u);
  assert.match(runRoute, /delivers only PPTX files/u);
  const launchRoute = readRepositoryFile("app/api/runs/[runId]/launch/route.ts");
  assert.ok(
    launchRoute.indexOf('run.deliveryFormat !== "pptx"')
      < launchRoute.indexOf("enqueueRunJob(runId)"),
    "legacy run launch must reject unsupported formats before enqueue",
  );
  assert.doesNotMatch(
    JSON.stringify(PUBLIC_CAPABILITIES),
    /PDF or PPTX|PDF delivery/u,
  );
});

test("landing and preview surfaces label samples and avoid legacy claims", () => {
  const landing = readRepositoryFile("app/page.tsx");
  const archetypePreview = readRepositoryFile("components/archetype-preview-modal.tsx");

  assert.match(landing, /PUBLIC_CAPABILITIES/);
  assert.match(landing, /CURRENT_CAPABILITY_COUNTS/);
  assert.match(landing, /Current capabilities/);
  assert.match(landing, /Availability depends on the providers you configure/);
  assert.match(landing, />\s*Sample data\s*</);
  assert.match(archetypePreview, />\s*Sample data\s*</);

  for (const unsupportedClaim of [
    "pricingPlans",
    "10x response rate",
    "Close more deals",
    "Setup in 2 minutes",
    "Claude, GPT, Gemini",
    "Kimi K2.5",
    "Referral program",
  ]) {
    assert.equal(landing.includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.doesNotMatch(landing, /\$\d/);
  assert.doesNotMatch(landing, /Claim-level evidence coverage is not implemented/);
  assert.doesNotMatch(landing, /Node\.js 22|pnpm 10\.13/);
  assert.match(landing, /cp -n \.env\.example \.env\.local/);
  assert.match(landing, /pnpm worker/);
});

test("delivery surfaces show measured evidence and abstain when its receipt is unavailable", () => {
  const delivery = readRepositoryFile("components/workspace/views/delivery-view.tsx");
  const evidenceBadge = readRepositoryFile("components/deck-score-badge.tsx");
  const hostedService = readRepositoryFile("components/workspace/views/pricing-view.tsx");

  assert.doesNotMatch(delivery, /generateMockScore|overallScore|quality score/i);
  assert.match(evidenceBadge, /Evidence receipt unavailable/);
  assert.match(evidenceBadge, /supportedFactualClaims/);
  assert.match(evidenceBadge, /Required fields/);
  assert.match(evidenceBadge, /Evidence gate/);
  assert.match(evidenceBadge, /Readable artifact/);
  assert.match(evidenceBadge, /Provider provenance/);
  assert.match(evidenceBadge, /Human review required/);
  assert.doesNotMatch(delivery, /view\.officeapps\.live\.com/);
  assert.match(delivery, /sandbox="allow-forms allow-popups allow-same-origin allow-scripts"/);
  assert.match(delivery, /referrerPolicy="no-referrer"/);

  assert.doesNotMatch(hostedService, /\/api\/stripe\/checkout|free decks|SSO|SLA|referral/i);
  assert.doesNotMatch(hostedService, /\$\d/);
  assert.match(hostedService, /Managed hosting is not available yet/);
});

test("active run surfaces expose the rich native-vector, no-generated-media boundary", () => {
  const runSettings = readRepositoryFile("components/workspace/views/run-settings-view.tsx");
  const structure = readRepositoryFile("components/workspace/views/structure-view.tsx");
  const pipeline = readRepositoryFile("components/workspace/views/pipeline-view.tsx");

  assert.match(
    runSettings,
    /Generated images,\s+charts, screenshots, and other media remain unavailable/,
  );
  assert.match(structure, /Rich native-vector reference profile/);
  assert.doesNotMatch(structure, /text(?:-|\s)only/iu);
  assert.doesNotMatch(structure, /includeVisual|\[include visual\]|onToggleVisual|\+img/u);
  assert.doesNotMatch(pipeline, /image_strategy|Generating supporting visuals/u);
  assert.doesNotMatch(pipeline, /~?\d+\s*(?:-|–|to)\s*\d+\s*(?:min|minute)/iu);
  assert.match(pipeline, /Timing varies by provider and target/u);
});
