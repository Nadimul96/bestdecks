import type { AppEnv } from "@/src/config/env";
import { selectionFromConfiguration, type ProviderSelection } from "@/src/config/provider-selection";
import {
  buildExperimentalProviderStatuses,
  buildReferenceProviderStatuses,
  type ReferenceProviderStatus,
} from "@/src/server/reference-provider-health";

export interface DoctorCheck {
  id: string;
  ok: boolean;
  label: string;
  /** What to do when the check fails. Never contains configuration values. */
  fix: string;
  /** The environment variables this check reads, by name. */
  variables: string[];
}

export interface DoctorReport {
  ready: boolean;
  selection: ProviderSelection;
  checks: DoctorCheck[];
  /** Variable names behind the failed checks, deduplicated, in check order. */
  missingVariables: string[];
  providers: ReferenceProviderStatus[];
  experimentalProviders: ReferenceProviderStatus[];
}

const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

/**
 * Offline configuration report for `pnpm doctor`. It inspects presence and
 * shape only: no provider is contacted, and no value is echoed.
 */
export function buildDoctorReport(env: AppEnv): DoctorReport {
  const configuration = {
    crawlProvider: env.CRAWL_PROVIDER,
    researchProvider: env.RESEARCH_PROVIDER,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
    perplexityApiKey: env.PERPLEXITY_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    presentonBaseUrl: env.PRESENTON_BASE_URL,
    presentonApiKey: env.PRESENTON_API_KEY,
    presentonAuthUsername: env.PRESENTON_AUTH_USERNAME,
    presentonAuthPassword: env.PRESENTON_AUTH_PASSWORD,
    presentonTemplate: env.PRESENTON_TEMPLATE,
    allowPrivateProviderUrls:
      env.NODE_ENV !== "production" || env.ALLOW_PRIVATE_PROVIDER_URLS === "1",
  };
  const selection = selectionFromConfiguration(configuration);
  const providers = buildReferenceProviderStatuses(configuration, selection);
  const configured = (stage: ReferenceProviderStatus["stage"], index = 0) =>
    providers.filter((provider) => provider.stage === stage)[index]?.health.configured ?? false;

  const checks: DoctorCheck[] = [
    {
      id: "auth-secret",
      ok: Boolean(env.BETTER_AUTH_SECRET),
      label: "BETTER_AUTH_SECRET is set",
      fix: "Run `pnpm setup` (or set a random value of at least 32 characters).",
      variables: ["BETTER_AUTH_SECRET"],
    },
    {
      id: "secrets-key",
      ok: Boolean(env.APP_SECRETS_KEY),
      label: "APP_SECRETS_KEY is set",
      fix: "Run `pnpm setup` (or set an independent random value of at least 32 characters).",
      variables: ["APP_SECRETS_KEY"],
    },
    {
      id: "shared-credentials",
      ok: env.ALLOW_SHARED_PROVIDER_CREDENTIALS === "1",
      label: "Provider keys from this environment are usable by signed-in users",
      fix: "Set ALLOW_SHARED_PROVIDER_CREDENTIALS=1 for a single-user install, or save keys per user in the console.",
      variables: ["ALLOW_SHARED_PROVIDER_CREDENTIALS"],
    },
    {
      id: "commit-sha",
      ok: Boolean(env.BESTDECKS_COMMIT_SHA),
      label: "BESTDECKS_COMMIT_SHA is set (the worker records it in every receipt)",
      fix: "Set it to `git rev-parse --short=12 HEAD`; `pnpm setup` and Docker Compose do this for you.",
      variables: ["BESTDECKS_COMMIT_SHA"],
    },
    {
      id: "crawl",
      ok: configured("crawling"),
      label: selection.crawl.provider === "builtin"
        ? "Crawler: built-in (no key needed)"
        : "Crawler: Cloudflare Browser Rendering",
      fix: "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or use CRAWL_PROVIDER=builtin.",
      variables: selection.crawl.provider === "builtin"
        ? []
        : ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    },
    {
      id: "research",
      ok: configured("enriching", 0),
      label: selection.research.provider === "site"
        ? "Research: first-party site research (uses GEMINI_API_KEY)"
        : "Research: Perplexity",
      fix: selection.research.provider === "site"
        ? `Set GEMINI_API_KEY (free tier: ${GEMINI_KEY_URL}).`
        : "Set PERPLEXITY_API_KEY, or use RESEARCH_PROVIDER=site.",
      variables: [selection.research.provider === "site" ? "GEMINI_API_KEY" : "PERPLEXITY_API_KEY"],
    },
    {
      id: "gemini",
      ok: configured("enriching", 1) && configured("planning"),
      label: "Gemini brief and slide planning",
      fix: `Set GEMINI_API_KEY (free tier: ${GEMINI_KEY_URL}).`,
      variables: ["GEMINI_API_KEY"],
    },
    {
      id: "renderer",
      ok: configured("rendering"),
      label: "Presenton renderer",
      fix: "Run `pnpm presenton:start` (or `docker compose up`) and set PRESENTON_BASE_URL with its Basic auth username and password.",
      variables: ["PRESENTON_BASE_URL", "PRESENTON_AUTH_USERNAME", "PRESENTON_AUTH_PASSWORD"],
    },
  ];

  return {
    ready: checks.every((check) => check.ok),
    selection,
    checks,
    missingVariables: [...new Set(
      checks.filter((check) => !check.ok).flatMap((check) => check.variables),
    )],
    providers,
    experimentalProviders: buildExperimentalProviderStatuses({
      deepcrawlApiKey: env.DEEPCRAWL_API_KEY,
      alaiApiKey: env.ALAI_API_KEY,
      plusAiApiKey: env.PLUSAI_API_KEY,
      geminiApiKey: env.GEMINI_API_KEY,
    }),
  };
}

const REASONS = {
  explicit: "set explicitly",
  existing_credentials: "existing credentials found",
  free_default: "free default",
} as const;

export type DoctorRuntime = "native" | "compose";

const NEXT_STEPS: Record<DoctorRuntime, { ready: string; notReady: string }> = {
  native: {
    ready: "Ready. Start the app with `pnpm dev` and the worker with `pnpm worker`.",
    notReady: "Not ready yet. Fix the items marked [missing] above, then run `pnpm doctor` again.",
  },
  compose: {
    ready: "Ready.",
    notReady: "Not ready yet. Set the missing values in .env, then run `docker compose up` again.",
  },
};

export function formatDoctorReport(report: DoctorReport, runtime: DoctorRuntime = "native") {
  const lines = [
    "Bestdecks configuration (offline check, no provider was contacted)",
    "",
    `  crawl provider:    ${report.selection.crawl.provider} (${REASONS[report.selection.crawl.reason]})`,
    `  research provider: ${report.selection.research.provider} (${REASONS[report.selection.research.reason]})`,
    "",
  ];
  for (const check of report.checks) {
    lines.push(`  [${check.ok ? "ok" : "missing"}] ${check.label}`);
    if (!check.ok) lines.push(`            ${check.fix}`);
  }
  if (report.missingVariables.length > 0) {
    lines.push("", `  Missing: ${report.missingVariables.join(", ")}`);
  }
  lines.push("", report.ready ? NEXT_STEPS[runtime].ready : NEXT_STEPS[runtime].notReady);
  return lines.join("\n");
}
