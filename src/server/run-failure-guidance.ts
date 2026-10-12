/**
 * Plain-language guidance for failures that stop a whole run and that only the
 * operator can fix: a missing or rejected provider credential. The text names
 * the variable to set, never its value, and fits the 256-character event limit
 * with room for the diagnostic code the worker appends.
 */

const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

interface CredentialHint {
  provider: string;
  variables: string;
  source?: string;
}

const GEMINI: CredentialHint = {
  provider: "Gemini",
  variables: "GEMINI_API_KEY",
  source: `free key: ${GEMINI_KEY_URL}`,
};
const PERPLEXITY: CredentialHint = { provider: "Perplexity", variables: "PERPLEXITY_API_KEY" };
const CLOUDFLARE: CredentialHint = {
  provider: "Cloudflare",
  variables: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
};
const PRESENTON: CredentialHint = {
  provider: "The Presenton renderer",
  variables: "PRESENTON_BASE_URL and its Basic-auth credentials",
};

const HINTS_BY_PROVIDER_ID: Record<string, CredentialHint> = {
  "bestdecks.site-research": GEMINI,
  "google.gemini.generate-content.company-brief": GEMINI,
  "google.gemini.generate-content.slide-plan": GEMINI,
  "perplexity.sonar.enrichment": PERPLEXITY,
  "cloudflare.browser-rendering.crawl": CLOUDFLARE,
  "presenton.render-only": PRESENTON,
};

const HINTS_BY_MISSING_COMPONENT: Record<string, CredentialHint> = {
  gemini: GEMINI,
  perplexity: PERPLEXITY,
  cloudflare: CLOUDFLARE,
  presenton: PRESENTON,
};

function field(error: unknown, name: string) {
  if (!error || typeof error !== "object" || !(name in error)) return undefined;
  const value = (error as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function setInstruction(hint: CredentialHint) {
  return `Set ${hint.variables} in .env${hint.source ? ` (${hint.source})` : ""}, restart with \`docker compose up\` or \`pnpm worker\`, then launch a new run.`;
}

export function describeRunFailure(error: unknown): string | null {
  const code = field(error, "code");
  if (code === "configuration") {
    const component = field(error, "component");
    if (component === "commit_sha") {
      return "The worker has no BESTDECKS_COMMIT_SHA to record in the run receipt. Set it (Docker Compose and `pnpm setup` do this), then launch a new run.";
    }
    const hint = component ? HINTS_BY_MISSING_COMPONENT[component] : undefined;
    return hint ? `${hint.provider} is not configured. ${setInstruction(hint)}` : null;
  }
  if (code === "authentication" || code === "authorization") {
    const providerId = field(error, "providerId");
    const hint = providerId ? HINTS_BY_PROVIDER_ID[providerId] : undefined;
    return hint ? `${hint.provider} rejected the configured credentials. ${setInstruction(hint)}` : null;
  }
  return null;
}
