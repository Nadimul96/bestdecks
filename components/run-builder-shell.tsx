"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cloud,
  ExternalLink,
  FileText,
  FolderKanban,
  ImageIcon,
  KeyRound,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCcw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Wand2,
} from "lucide-react";

import type {
  CompanyRow,
  DeckArchetype,
  DeliveryFormat,
  ImagePolicy,
  RunQuestionnaire,
  SellerContext,
  Tone,
  VisualStyle,
} from "@/src/domain/schemas";
import type { IntegrationProviderKey } from "@/src/server/settings";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WORKSPACE_VIEW,
  isWorkspaceViewId,
  type WorkspaceViewId,
} from "@/lib/workspace-navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const targetExamples = `https://acmeplumbing.com
https://northshoreclinic.com
https://sunsetlogistics.io`;

const contactExamples = `websiteUrl,firstName,lastName,role,email
https://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com
https://northshoreclinic.com,Marcus,Reed,Director,marcus@northshoreclinic.com`;

const archetypeOptions: Array<{
  value: DeckArchetype;
  label: string;
  description: string;
}> = [
  {
    value: "cold_outreach",
    label: "Cold Outreach",
    description:
      "Lead with company-specific evidence and a narrow, credible call to action.",
  },
  {
    value: "warm_intro",
    label: "Warm Intro",
    description:
      "Frame shared context, likely upside, and why the conversation should happen now.",
  },
  {
    value: "agency_proposal",
    label: "Agency Proposal",
    description:
      "Translate research into a tailored recommendation, scope direction, and next step.",
  },
];

const outputFormatOptions: Array<{
  value: DeliveryFormat;
  label: string;
  description: string;
}> = [
  {
    value: "presenton_editor",
    label: "Presenton editor",
    description: "Fastest local path and the only export mode verified on this machine.",
  },
  {
    value: "pdf",
    label: "PDF",
    description: "Portable file output. Remote Presenton export is recommended.",
  },
  {
    value: "pptx",
    label: "PPTX",
    description: "Portable slide deck. Remote Presenton export is recommended.",
  },
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "concise", label: "Concise" },
  { value: "consultative", label: "Consultative" },
  { value: "bold", label: "Bold" },
  { value: "executive", label: "Executive" },
  { value: "friendly", label: "Friendly" },
];

const visualStyleOptions: Array<{ value: VisualStyle; label: string }> = [
  { value: "minimal", label: "Minimal" },
  { value: "editorial", label: "Editorial" },
  { value: "sales_polished", label: "Sales polished" },
  { value: "premium_modern", label: "Premium modern" },
  { value: "playful", label: "Playful" },
];

const imagePolicyOptions: Array<{ value: ImagePolicy; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "never", label: "Never" },
  { value: "always", label: "Always" },
];

const providerFieldDefinitions = [
  {
    id: "cloudflareAccountId",
    label: "Cloudflare account ID",
    provider: "cloudflare" as const,
    kind: "config" as const,
    configKey: "accountId",
    placeholder: "2c273fce90c0a8c566807aad975e95c3",
  },
  {
    id: "cloudflareApiToken",
    label: "Cloudflare Browser Rendering token",
    provider: "cloudflare" as const,
    kind: "secret" as const,
    placeholder: "Cloudflare Browser Rendering token",
  },
  {
    id: "deepcrawlApiKey",
    label: "Deepcrawl API key",
    provider: "deepcrawl" as const,
    kind: "secret" as const,
    placeholder: "Deepcrawl API key",
  },
  {
    id: "perplexityApiKey",
    label: "Perplexity API key",
    provider: "perplexity" as const,
    kind: "secret" as const,
    placeholder: "Perplexity API key",
  },
  {
    id: "openaiApiKey",
    label: "OpenAI API key",
    provider: "openai" as const,
    kind: "secret" as const,
    placeholder: "OpenAI API key for Presenton",
  },
  {
    id: "geminiApiKey",
    label: "Gemini API key",
    provider: "gemini" as const,
    kind: "secret" as const,
    placeholder: "Gemini image generation key",
  },
  {
    id: "presentonBaseUrl",
    label: "Presenton base URL",
    provider: "presenton" as const,
    kind: "config" as const,
    configKey: "baseUrl",
    placeholder: "http://localhost:5050",
  },
  {
    id: "presentonApiKey",
    label: "Presenton API key",
    provider: "presenton" as const,
    kind: "secret" as const,
    placeholder: "Optional bearer token",
  },
] satisfies Array<{
  id: ProviderFieldId;
  label: string;
  provider: IntegrationProviderKey;
  kind: "config" | "secret";
  configKey?: string;
  placeholder: string;
}>;

const pipelineSteps = [
  {
    icon: Wand2,
    title: "Seller discovery",
    description:
      "Crawl the operator's site first or capture a typed offer so the system understands what is being sold before target research begins.",
    provider: "Internal brief",
  },
  {
    icon: Cloud,
    title: "Target crawl",
    description:
      "Use Cloudflare `/crawl` first, then hand off to Deepcrawl only if the primary crawl fails or coverage is weak.",
    provider: "Cloudflare + Deepcrawl",
  },
  {
    icon: Layers3,
    title: "Research synthesis",
    description:
      "Condense site evidence and Perplexity enrichment into a source-backed company brief for each row.",
    provider: "Perplexity + LLM",
  },
  {
    icon: ImageIcon,
    title: "Visual strategy",
    description:
      "Generate images only when the deck materially benefits and website assets are not enough.",
    provider: "Gemini image",
  },
  {
    icon: FileText,
    title: "Deck delivery",
    description:
      "Send a compressed brief to Presenton and return exactly one chosen output mode for the full run.",
    provider: "Presenton",
  },
];

const acceptedColumns = [
  "websiteUrl",
  "companyName",
  "firstName",
  "lastName",
  "role",
  "campaignGoal",
  "notes",
];

const viewMeta: Record<
  WorkspaceViewId,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "Overview",
    title: "Workspace summary",
    description:
      "Track readiness across onboarding, seller setup, run configuration, target intake, pipeline rules, and delivery output.",
  },
  onboarding: {
    eyebrow: "Onboarding",
    title: "Connect the workspace",
    description:
      "Gather the user information the platform needs before generating anything: credentials, seller defaults, websites, and contacts.",
  },
  "seller-context": {
    eyebrow: "Seller Context",
    title: "Capture what the user sells",
    description:
      "The deck quality depends on this step. The system needs a clear view of the offer, services, and intended outcome.",
  },
  "run-settings": {
    eyebrow: "Run Settings",
    title: "Normalize the run contract",
    description:
      "Let users answer naturally, but convert their request into typed fields that the pipeline can execute consistently.",
  },
  "target-intake": {
    eyebrow: "Target Intake",
    title: "Import websites and contacts",
    description:
      "Website URL stays mandatory. Contact data and notes remain optional but should be preserved at the row level.",
  },
  pipeline: {
    eyebrow: "Pipeline",
    title: "Review the orchestration flow",
    description:
      "Keep crawl, research, image generation, and delivery decisions transparent enough to debug and retry safely.",
  },
  delivery: {
    eyebrow: "Delivery",
    title: "Control output and review",
    description:
      "Surface run status, review gates, and exactly one output format per run once deck generation finishes.",
  },
};

type ProviderFieldId =
  | "cloudflareAccountId"
  | "cloudflareApiToken"
  | "deepcrawlApiKey"
  | "perplexityApiKey"
  | "openaiApiKey"
  | "geminiApiKey"
  | "presentonBaseUrl"
  | "presentonApiKey";

interface CurrentUser {
  name?: string | null;
  email?: string | null;
}

interface WorkspaceProfileForm {
  ownerName: string;
  ownerEmail: string;
  companyName: string;
  websiteUrl: string;
  timezone: string;
  defaultSignature: string;
}

interface SellerContextForm {
  websiteUrl: string;
  companyName: string;
  offerSummary: string;
  servicesText: string;
  differentiatorsText: string;
  targetCustomer: string;
  desiredOutcome: string;
  proofPointsText: string;
  constraintsText: string;
}

interface QuestionnaireForm {
  archetype: DeckArchetype;
  audience: string;
  objective: string;
  callToAction: string;
  outputFormat: DeliveryFormat;
  desiredCardCount: string;
  tone: Tone;
  visualStyle: VisualStyle;
  imagePolicy: ImagePolicy;
  mustIncludeText: string;
  mustAvoidText: string;
  extraInstructions: string;
  optionalReview: boolean;
  allowUserApprovedCrawlException: boolean;
}

interface IntakeDraftForm {
  websitesText: string;
  contactsCsvText: string;
}

type ProviderFieldValues = Record<ProviderFieldId, string>;

interface SavedIntegrationState {
  provider: IntegrationProviderKey;
  config?: Record<string, unknown>;
  hasSecret?: boolean;
}

interface OnboardingResponse {
  profile?: Partial<WorkspaceProfileForm>;
  sellerContext?: SellerContext;
  questionnaire?: RunQuestionnaire;
  intakeDraft?: {
    websitesText?: string;
    contactsCsvText?: string;
  };
  integrations?: Array<SavedIntegrationState>;
}

interface RunSummary {
  id: string;
  status: string;
  target_count: number;
  delivery_format: DeliveryFormat;
  created_at: string;
  updated_at: string;
}

interface RunTargetRecord {
  id: string;
  website_url: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  campaign_goal: string | null;
  notes: string | null;
  status: string;
  crawl_provider?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface RunArtifactRecord {
  id: string;
  run_id: string;
  target_id?: string | null;
  artifact_type: string;
  artifact_json: Record<string, unknown>;
  created_at: string;
}

interface RunEventRecord {
  id: string;
  run_id: string;
  target_id?: string | null;
  stage?: string | null;
  level: "info" | "warning" | "error";
  message: string;
  created_at: string;
}

interface RunDetail {
  id: string;
  status: string;
  targetCount: number;
  deliveryFormat: DeliveryFormat;
  reviewGateEnabled: boolean;
  sellerContext: SellerContext;
  questionnaire: RunQuestionnaire;
  sellerBrief?: Record<string, unknown>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  targets: RunTargetRecord[];
  artifacts: RunArtifactRecord[];
  events: RunEventRecord[];
}

type Notice =
  | { type: "success" | "error" | "info"; message: string }
  | null;

function useActiveWorkspaceView() {
  const [activeView, setActiveView] =
    React.useState<WorkspaceViewId>(DEFAULT_WORKSPACE_VIEW);

  React.useEffect(() => {
    const syncHash = () => {
      const nextHash = window.location.hash.replace(/^#/, "");
      setActiveView(
        nextHash && isWorkspaceViewId(nextHash) ? nextHash : DEFAULT_WORKSPACE_VIEW,
      );
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return activeView;
}

function emptyProviderValues(): ProviderFieldValues {
  return {
    cloudflareAccountId: "",
    cloudflareApiToken: "",
    deepcrawlApiKey: "",
    perplexityApiKey: "",
    openaiApiKey: "",
    geminiApiKey: "",
    presentonBaseUrl: "",
    presentonApiKey: "",
  };
}

function defaultProfile(currentUser?: CurrentUser): WorkspaceProfileForm {
  return {
    ownerName: currentUser?.name ?? "",
    ownerEmail: currentUser?.email ?? "",
    companyName: "",
    websiteUrl: "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
    defaultSignature: "Book a 20-minute call next week",
  };
}

function defaultSellerContext(): SellerContextForm {
  return {
    websiteUrl: "",
    companyName: "",
    offerSummary: "",
    servicesText: "",
    differentiatorsText: "",
    targetCustomer: "",
    desiredOutcome: "",
    proofPointsText: "",
    constraintsText: "",
  };
}

function defaultQuestionnaire(): QuestionnaireForm {
  return {
    archetype: "cold_outreach",
    audience: "",
    objective: "",
    callToAction: "",
    outputFormat: "presenton_editor",
    desiredCardCount: "8",
    tone: "consultative",
    visualStyle: "premium_modern",
    imagePolicy: "auto",
    mustIncludeText: "",
    mustAvoidText: "",
    extraInstructions: "",
    optionalReview: true,
    allowUserApprovedCrawlException: false,
  };
}

function defaultIntakeDraft(): IntakeDraftForm {
  return {
    websitesText: "",
    contactsCsvText: "",
  };
}

function toTextList(input: string) {
  return input
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sellerContextToForm(value?: SellerContext): SellerContextForm {
  if (!value) {
    return defaultSellerContext();
  }

  return {
    websiteUrl: value.websiteUrl ?? "",
    companyName: value.companyName ?? "",
    offerSummary: value.offerSummary,
    servicesText: value.services.join("\n"),
    differentiatorsText: value.differentiators.join("\n"),
    targetCustomer: value.targetCustomer,
    desiredOutcome: value.desiredOutcome,
    proofPointsText: value.proofPoints.join("\n"),
    constraintsText: value.constraints.join("\n"),
  };
}

function questionnaireToForm(value?: RunQuestionnaire): QuestionnaireForm {
  if (!value) {
    return defaultQuestionnaire();
  }

  return {
    archetype: value.archetype,
    audience: value.audience,
    objective: value.objective,
    callToAction: value.callToAction,
    outputFormat: value.outputFormat,
    desiredCardCount: String(value.desiredCardCount),
    tone: value.tone,
    visualStyle: value.visualStyle,
    imagePolicy: value.imagePolicy,
    mustIncludeText: value.mustInclude.join("\n"),
    mustAvoidText: value.mustAvoid.join("\n"),
    extraInstructions: value.extraInstructions ?? "",
    optionalReview: value.optionalReview,
    allowUserApprovedCrawlException: value.allowUserApprovedCrawlException,
  };
}

function buildSellerContextPayload(form: SellerContextForm): SellerContext {
  return {
    websiteUrl: toOptional(form.websiteUrl),
    companyName: toOptional(form.companyName),
    offerSummary: form.offerSummary.trim(),
    services: toTextList(form.servicesText),
    differentiators: toTextList(form.differentiatorsText),
    targetCustomer: form.targetCustomer.trim(),
    desiredOutcome: form.desiredOutcome.trim(),
    proofPoints: toTextList(form.proofPointsText),
    constraints: toTextList(form.constraintsText),
  };
}

function buildQuestionnairePayload(form: QuestionnaireForm): RunQuestionnaire {
  return {
    archetype: form.archetype,
    audience: form.audience.trim(),
    objective: form.objective.trim(),
    callToAction: form.callToAction.trim(),
    outputFormat: form.outputFormat,
    desiredCardCount: Number.parseInt(form.desiredCardCount, 10),
    tone: form.tone,
    visualStyle: form.visualStyle,
    imagePolicy: form.imagePolicy,
    mustInclude: toTextList(form.mustIncludeText),
    mustAvoid: toTextList(form.mustAvoidText),
    extraInstructions: toOptional(form.extraInstructions),
    optionalReview: form.optionalReview,
    allowUserApprovedCrawlException: form.allowUserApprovedCrawlException,
  };
}

function hostKey(url: string) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function mergeTargets(targets: CompanyRow[]) {
  const merged = new Map<string, CompanyRow>();

  for (const target of targets) {
    const key = hostKey(target.websiteUrl);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, target);
      continue;
    }

    merged.set(key, {
      websiteUrl: existing.websiteUrl,
      companyName: target.companyName ?? existing.companyName,
      firstName: target.firstName ?? existing.firstName,
      lastName: target.lastName ?? existing.lastName,
      role: target.role ?? existing.role,
      campaignGoal: target.campaignGoal ?? existing.campaignGoal,
      notes: target.notes ?? existing.notes,
    });
  }

  return Array.from(merged.values()).slice(0, 100);
}

function humanizeLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusVariant(status: string): "secondary" | "outline" | "destructive" | "accent" {
  switch (status) {
    case "completed":
    case "delivered":
      return "accent";
    case "running":
    case "queued":
    case "brief_ready":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function getDeliveryLinks(run: RunDetail | null) {
  if (!run) {
    return [];
  }

  return run.artifacts
    .filter((artifact) => artifact.artifact_type === "presentation_delivery")
    .map((artifact) => {
      const payload = artifact.artifact_json;

      return {
        id: artifact.id,
        targetId: artifact.target_id ?? undefined,
        presentationId: String(payload.presentationId ?? ""),
        editorUrl:
          typeof payload.editorUrl === "string" ? payload.editorUrl : undefined,
        exportUrl:
          typeof payload.exportUrl === "string" ? payload.exportUrl : undefined,
      };
    });
}

function getRunReadiness(
  profile: WorkspaceProfileForm,
  sellerForm: SellerContextForm,
  questionnaireForm: QuestionnaireForm,
  normalizedTargets: CompanyRow[],
  savedIntegrations: Partial<Record<IntegrationProviderKey, SavedIntegrationState>>,
  providerValues: ProviderFieldValues,
) {
  const providerReady =
    Boolean(
      providerValues.cloudflareAccountId || savedIntegrations.cloudflare?.config?.accountId,
    ) &&
    Boolean(providerValues.cloudflareApiToken || savedIntegrations.cloudflare?.hasSecret) &&
    Boolean(providerValues.perplexityApiKey || savedIntegrations.perplexity?.hasSecret) &&
    Boolean(providerValues.presentonBaseUrl || savedIntegrations.presenton?.config?.baseUrl);

  const onboardingReady =
    Boolean(profile.ownerEmail.trim()) &&
    Boolean(profile.companyName.trim()) &&
    providerReady;

  const sellerReady =
    Boolean(sellerForm.offerSummary.trim()) &&
    Boolean(sellerForm.targetCustomer.trim()) &&
    Boolean(sellerForm.desiredOutcome.trim()) &&
    toTextList(sellerForm.servicesText).length > 0 &&
    toTextList(sellerForm.differentiatorsText).length > 0 &&
    Boolean(sellerForm.websiteUrl.trim() || sellerForm.companyName.trim());

  const runReady =
    Boolean(questionnaireForm.audience.trim()) &&
    Boolean(questionnaireForm.objective.trim()) &&
    Boolean(questionnaireForm.callToAction.trim()) &&
    Number.parseInt(questionnaireForm.desiredCardCount, 10) >= 4;

  const targetsReady = normalizedTargets.length > 0;

  return {
    onboardingReady,
    sellerReady,
    runReady,
    targetsReady,
    providerReady,
    overallReady: onboardingReady && sellerReady && runReady && targetsReady,
  };
}

interface JsonRequestInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function requestJson<T>(input: string, init?: JsonRequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body:
      init?.body === undefined
        ? undefined
        : JSON.stringify(init.body),
  });

  const body = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | T
    | null;

  if (!response.ok) {
    const errorBody =
      body && typeof body === "object"
        ? (body as { error?: string; message?: string })
        : undefined;
    const message =
      errorBody?.error ??
      errorBody?.message ??
      `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}

function uploadTextFile(
  inputRef: React.RefObject<HTMLInputElement | null>,
  onLoaded: (text: string) => void,
) {
  const file = inputRef.current?.files?.[0];
  if (!file) {
    return;
  }

  void file.text().then(onLoaded);
}

function SectionNotice({ notice }: { notice: Notice }) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        notice.type === "success" &&
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        notice.type === "error" &&
          "border-destructive/25 bg-destructive/10 text-destructive",
        notice.type === "info" &&
          "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      {notice.type === "error" ? (
        <AlertCircle className="mt-0.5 size-4" />
      ) : notice.type === "success" ? (
        <CheckCircle2 className="mt-0.5 size-4" />
      ) : (
        <Clock3 className="mt-0.5 size-4" />
      )}
      <p>{notice.message}</p>
    </div>
  );
}

function OverviewView(props: {
  readiness: ReturnType<typeof getRunReadiness>;
  runs: RunSummary[];
  currentRun: RunDetail | null;
  normalizedTargets: CompanyRow[];
  activeDeliveryCount: number;
}) {
  const { readiness, runs, currentRun, normalizedTargets, activeDeliveryCount } = props;
  const metrics = [
    {
      label: "Run capacity",
      value: `${normalizedTargets.length || 0}/100`,
      detail:
        normalizedTargets.length > 0
          ? "Normalized targets ready for launch"
          : "Normalize targets before launch",
    },
    {
      label: "Provider readiness",
      value: readiness.providerReady ? "Connected" : "Needs setup",
      detail: "Cloudflare, Perplexity, Presenton",
    },
    {
      label: "Current run",
      value: currentRun ? humanizeLabel(currentRun.status) : "No active run",
      detail: currentRun ? formatTimestamp(currentRun.updatedAt) : "Create or launch a run",
    },
    {
      label: "Deck deliveries",
      value: String(activeDeliveryCount),
      detail: currentRun ? "Artifacts captured on the current run" : "No deliveries yet",
    },
  ];

  const overviewCards = [
    {
      title: "Onboarding",
      href: "#onboarding",
      description: "Collect credentials, operator defaults, and first-run intake.",
      status: readiness.onboardingReady ? "Ready" : "Needs attention",
    },
    {
      title: "Seller Context",
      href: "#seller-context",
      description: "Teach the system what the user sells and why it matters.",
      status: readiness.sellerReady ? "Ready" : "Needs attention",
    },
    {
      title: "Run Settings",
      href: "#run-settings",
      description: "Normalize deck type, audience, CTA, and output format.",
      status: readiness.runReady ? "Ready" : "Needs attention",
    },
    {
      title: "Target Intake",
      href: "#target-intake",
      description: "Upload websites and contact rows for up to 100 companies.",
      status: readiness.targetsReady ? "Ready" : "Needs attention",
    },
  ];

  return (
    <div className="space-y-6">
      <section id="overview" className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader className="gap-4">
            <CardAction className="hidden gap-2 sm:flex">
              <Button asChild>
                <a href="#onboarding">Continue onboarding</a>
              </Button>
              <Button asChild variant="outline">
                <a href="#delivery">Review delivery</a>
              </Button>
            </CardAction>
            <Badge variant="secondary" className="w-fit">
              Workspace health
            </Badge>
            <div className="space-y-3">
              <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Ready the workspace before the first CEO test
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7">
                This view reflects the real backend state now: onboarding can be saved,
                runs can be created and launched, and delivery artifacts are tracked on the
                active run.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border bg-muted/25 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-3 text-xl font-semibold">{metric.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{metric.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="outline" className="mb-2 w-fit">
              Current wedge
            </Badge>
            <CardTitle>Evidence-first outreach decks</CardTitle>
            <CardDescription>
              The system understands the seller, researches each company, and turns that
              evidence into a usable outbound presentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "One row equals one company.",
              "Website URL is the only required input field.",
              "Deck settings apply once per run.",
              "Presenton editor is the safest local output mode.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg border bg-muted/25 p-3">
                <CheckCircle2 className="mt-0.5 size-4 text-primary" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Workspace search and quick actions</CardTitle>
            <CardDescription>
              Move between setup stages instead of hunting through one long form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Quick search</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search-input"
                  className="pl-9"
                  placeholder="Search onboarding, targets, delivery, or outputs"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {overviewCards.map((card) => (
                <a
                  key={card.title}
                  href={card.href}
                  className="rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{card.title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                    <Badge
                      variant={card.status === "Ready" ? "accent" : "outline"}
                    >
                      {card.status}
                    </Badge>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent run activity</CardTitle>
            <CardDescription>
              The operator should be able to inspect recent runs without opening the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                No runs created yet.
              </div>
            ) : (
              runs.slice(0, 4).map((run) => (
                <div key={run.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Run {run.id.slice(0, 8)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {run.target_count} targets • {humanizeLabel(run.delivery_format)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(run.status)}>{humanizeLabel(run.status)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated {formatTimestamp(run.updated_at)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function OnboardingView(props: {
  profile: WorkspaceProfileForm;
  providerValues: ProviderFieldValues;
  savedIntegrations: Partial<Record<IntegrationProviderKey, SavedIntegrationState>>;
  intakeDraft: IntakeDraftForm;
  isSaving: boolean;
  onProfileChange: (field: keyof WorkspaceProfileForm, value: string) => void;
  onProviderChange: (field: ProviderFieldId, value: string) => void;
  onIntakeDraftChange: (field: keyof IntakeDraftForm, value: string) => void;
  onSave: () => void;
  onNormalizeSeed: () => void;
  onUploadWebsites: () => void;
  onUploadContacts: () => void;
}) {
  return (
    <div id="onboarding" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="secondary" className="mb-2 w-fit">
              Step 0
            </Badge>
            <CardTitle>Operator profile</CardTitle>
            <CardDescription>
              Capture the workspace owner and company defaults before the first run starts.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Full name</span>
              <Input
                value={props.profile.ownerName}
                onChange={(event) => props.onProfileChange("ownerName", event.target.value)}
                placeholder="Nadim Haque"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Work email</span>
              <Input
                value={props.profile.ownerEmail}
                onChange={(event) => props.onProfileChange("ownerEmail", event.target.value)}
                placeholder="owner@bestdecks.co"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Company</span>
              <Input
                value={props.profile.companyName}
                onChange={(event) => props.onProfileChange("companyName", event.target.value)}
                placeholder="Bestdecks"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Primary website</span>
              <Input
                value={props.profile.websiteUrl}
                onChange={(event) => props.onProfileChange("websiteUrl", event.target.value)}
                placeholder="https://bestdecks.co"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Timezone</span>
              <Input
                value={props.profile.timezone}
                onChange={(event) => props.onProfileChange("timezone", event.target.value)}
                placeholder="Asia/Makassar"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Default signature</span>
              <Input
                value={props.profile.defaultSignature}
                onChange={(event) =>
                  props.onProfileChange("defaultSignature", event.target.value)
                }
                placeholder="Book a 20-minute call next week"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="outline" className="mb-2 w-fit">
              Access
            </Badge>
            <CardTitle>Provider credentials</CardTitle>
            <CardDescription>
              Save the crawl, research, image, and delivery credentials here. Secret
              fields are never returned to the browser after save.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {providerFieldDefinitions.map((field) => {
              const saved = props.savedIntegrations[field.provider];
              const hasSavedConfig =
                field.kind === "config" &&
                field.configKey &&
                typeof saved?.config?.[field.configKey] === "string";

              return (
                <label key={field.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{field.label}</span>
                    {field.kind === "secret" && saved?.hasSecret ? (
                      <Badge variant="accent">Stored</Badge>
                    ) : null}
                    {hasSavedConfig ? <Badge variant="outline">Saved</Badge> : null}
                  </div>
                  <Input
                    type={field.kind === "secret" ? "password" : "text"}
                    value={props.providerValues[field.id]}
                    onChange={(event) =>
                      props.onProviderChange(field.id, event.target.value)
                    }
                    placeholder={field.placeholder}
                  />
                  <p className="text-xs text-muted-foreground">
                    {field.kind === "secret"
                      ? saved?.hasSecret
                        ? "Leave blank to keep the stored secret unchanged."
                        : "Enter once and it will be encrypted at rest."
                      : "Non-secret config is stored alongside the workspace."}
                  </p>
                </label>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onSave} disabled={props.isSaving}>
            {props.isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving workspace
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                Save workspace
              </>
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="#seller-context">Continue to seller context</a>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="outline" className="mb-2 w-fit">
              First import
            </Badge>
            <CardTitle>Seed the workspace</CardTitle>
            <CardDescription>
              Capture the first website list and contacts during onboarding so the first
              run is immediately actionable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Website list</span>
              <Textarea
                className="min-h-40 font-mono text-xs"
                value={props.intakeDraft.websitesText}
                onChange={(event) =>
                  props.onIntakeDraftChange("websitesText", event.target.value)
                }
                placeholder={targetExamples}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Contacts CSV</span>
              <Textarea
                className="min-h-40 font-mono text-xs"
                value={props.intakeDraft.contactsCsvText}
                onChange={(event) =>
                  props.onIntakeDraftChange("contactsCsvText", event.target.value)
                }
                placeholder={contactExamples}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={props.onUploadWebsites}>
                <Upload className="size-4" />
                Upload websites file
              </Button>
              <Button type="button" variant="outline" onClick={props.onUploadContacts}>
                <Upload className="size-4" />
                Upload contacts CSV
              </Button>
              <Button type="button" onClick={props.onNormalizeSeed}>
                Normalize seed rows
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Onboarding checklist</CardTitle>
            <CardDescription>
              This step should gather everything needed so later pages can focus on
              execution, not missing data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                title: "Connect providers",
                description:
                  "Store the credentials and endpoints the workspace will use for crawl, research, image generation, and deck delivery.",
              },
              {
                title: "Describe the seller",
                description:
                  "Capture the operator's website, offer, services, and differentiators so the deck actually reflects what is being sold.",
              },
              {
                title: "Load targets and contacts",
                description:
                  "Import websites and contact rows now so the first run starts from structured input instead of manual patching later.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
                <KeyRound className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SellerContextView(props: {
  sellerForm: SellerContextForm;
  onChange: (field: keyof SellerContextForm, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <Card id="seller-context">
      <CardHeader>
        <Badge variant="secondary" className="mb-2 w-fit">
          Step 1
        </Badge>
        <CardTitle>Seller context</CardTitle>
        <CardDescription>
          Teach the system what the user actually sells so target-company research becomes
          a credible pitch instead of generic deck filler.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Seller website</span>
            <Input
              value={props.sellerForm.websiteUrl}
              onChange={(event) => props.onChange("websiteUrl", event.target.value)}
              placeholder="https://bestdecks.co"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Company name</span>
            <Input
              value={props.sellerForm.companyName}
              onChange={(event) => props.onChange("companyName", event.target.value)}
              placeholder="Bestdecks"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Desired outcome</span>
            <Input
              value={props.sellerForm.desiredOutcome}
              onChange={(event) => props.onChange("desiredOutcome", event.target.value)}
              placeholder="Book qualified discovery calls"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Offer summary</span>
            <Textarea
              className="min-h-32"
              value={props.sellerForm.offerSummary}
              onChange={(event) => props.onChange("offerSummary", event.target.value)}
              placeholder="We generate research-backed outreach decks for outbound campaigns aimed at specific target accounts."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Services</span>
            <Textarea
              className="min-h-28"
              value={props.sellerForm.servicesText}
              onChange={(event) => props.onChange("servicesText", event.target.value)}
              placeholder={"Outbound strategy\nPresentation generation\nSales enablement"}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ideal customer</span>
            <Input
              value={props.sellerForm.targetCustomer}
              onChange={(event) => props.onChange("targetCustomer", event.target.value)}
              placeholder="Founders and growth leaders at SMBs"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Differentiators</span>
            <Textarea
              className="min-h-28"
              value={props.sellerForm.differentiatorsText}
              onChange={(event) =>
                props.onChange("differentiatorsText", event.target.value)
              }
              placeholder={"Evidence-backed decks\nCompany-specific research\nOperator review workflow"}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Proof points</span>
            <Textarea
              className="min-h-24"
              value={props.sellerForm.proofPointsText}
              onChange={(event) => props.onChange("proofPointsText", event.target.value)}
              placeholder={"Cloudflare crawl coverage\nPerplexity enrichment\nPresenton delivery"}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Constraints</span>
            <Textarea
              className="min-h-24"
              value={props.sellerForm.constraintsText}
              onChange={(event) => props.onChange("constraintsText", event.target.value)}
              placeholder={"Use one output format per run\nOptional review gate\nRespect crawl policy"}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onSave} disabled={props.isSaving}>
            {props.isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving seller context
              </>
            ) : (
              "Save seller context"
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="#run-settings">Continue to run settings</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RunSettingsView(props: {
  questionnaireForm: QuestionnaireForm;
  isSaving: boolean;
  onChange: <K extends keyof QuestionnaireForm>(
    field: K,
    value: QuestionnaireForm[K],
  ) => void;
  onSave: () => void;
  onCreateDraft: () => void;
  isCreatingDraft: boolean;
}) {
  return (
    <Card id="run-settings">
      <CardHeader>
        <Badge variant="secondary" className="mb-2 w-fit">
          Step 2
        </Badge>
        <CardTitle>Run settings</CardTitle>
        <CardDescription>
          The intake can feel chat-like for the user, but the backend still normalizes it
          into a fixed contract for deck generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {archetypeOptions.map((archetype) => (
            <button
              key={archetype.value}
              type="button"
              onClick={() => props.onChange("archetype", archetype.value)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                props.questionnaireForm.archetype === archetype.value
                  ? "border-primary bg-primary/10"
                  : "bg-muted/25 hover:bg-muted/35",
              )}
            >
              <p className="font-medium">{archetype.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {archetype.description}
              </p>
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Audience</span>
            <Input
              value={props.questionnaireForm.audience}
              onChange={(event) => props.onChange("audience", event.target.value)}
              placeholder="Founder or Head of Growth"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Call to action</span>
            <Input
              value={props.questionnaireForm.callToAction}
              onChange={(event) => props.onChange("callToAction", event.target.value)}
              placeholder="Book a 20-minute call"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Goal</span>
            <Textarea
              className="min-h-24"
              value={props.questionnaireForm.objective}
              onChange={(event) => props.onChange("objective", event.target.value)}
              placeholder="Convince the target company to explore a tailored outbound campaign."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Card count</span>
            <Input
              type="number"
              min={4}
              max={20}
              value={props.questionnaireForm.desiredCardCount}
              onChange={(event) =>
                props.onChange("desiredCardCount", event.target.value)
              }
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Tone</span>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={props.questionnaireForm.tone}
              onChange={(event) => props.onChange("tone", event.target.value as Tone)}
            >
              {toneOptions.map((tone) => (
                <option key={tone.value} value={tone.value}>
                  {tone.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Visual style</span>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={props.questionnaireForm.visualStyle}
              onChange={(event) =>
                props.onChange("visualStyle", event.target.value as VisualStyle)
              }
            >
              {visualStyleOptions.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Image policy</span>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={props.questionnaireForm.imagePolicy}
              onChange={(event) =>
                props.onChange("imagePolicy", event.target.value as ImagePolicy)
              }
            >
              {imagePolicyOptions.map((policy) => (
                <option key={policy.value} value={policy.value}>
                  {policy.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Output format</span>
            <select
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={props.questionnaireForm.outputFormat}
              onChange={(event) =>
                props.onChange("outputFormat", event.target.value as DeliveryFormat)
              }
            >
              {outputFormatOptions.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Must include</span>
            <Textarea
              className="min-h-24"
              value={props.questionnaireForm.mustIncludeText}
              onChange={(event) => props.onChange("mustIncludeText", event.target.value)}
              placeholder={"Specific website observations\nClear next step\nLocalized context"}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Must avoid</span>
            <Textarea
              className="min-h-24"
              value={props.questionnaireForm.mustAvoidText}
              onChange={(event) => props.onChange("mustAvoidText", event.target.value)}
              placeholder={"Generic filler\nUnsupported claims\nMulti-offer confusion"}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Extra instructions</span>
            <Textarea
              className="min-h-24"
              value={props.questionnaireForm.extraInstructions}
              onChange={(event) => props.onChange("extraInstructions", event.target.value)}
              placeholder="Mention local service coverage, keep the close tactical, and avoid over-promising."
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={props.questionnaireForm.optionalReview}
              onChange={(event) => props.onChange("optionalReview", event.target.checked)}
            />
            <div>
              <p className="font-medium">Optional review gate</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Hold completed decks for operator approval before considering the run fully delivered.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={props.questionnaireForm.allowUserApprovedCrawlException}
              onChange={(event) =>
                props.onChange("allowUserApprovedCrawlException", event.target.checked)
              }
            />
            <div>
              <p className="font-medium">Allow user-approved crawl exception</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Preserve the policy flag even though Cloudflare remains robots-aware by default.
              </p>
            </div>
          </label>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-medium">Output modes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {outputFormatOptions.map((format) => (
              <Badge
                key={format.value}
                variant={
                  format.value === props.questionnaireForm.outputFormat
                    ? "secondary"
                    : "outline"
                }
              >
                {format.label}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Presenton editor is the verified local delivery path. PDF and PPTX remain
            selectable, but they are better suited to a remote Presenton export host.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onSave} disabled={props.isSaving}>
            {props.isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving run settings
              </>
            ) : (
              "Save run settings"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={props.onCreateDraft}
            disabled={props.isCreatingDraft}
          >
            {props.isCreatingDraft ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Creating draft run
              </>
            ) : (
              <>
                <FolderKanban className="size-4" />
                Create run draft
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetIntakeView(props: {
  intakeDraft: IntakeDraftForm;
  normalizedTargets: CompanyRow[];
  isNormalizing: boolean;
  onDraftChange: (field: keyof IntakeDraftForm, value: string) => void;
  onNormalize: () => void;
  onUploadWebsites: () => void;
  onUploadContacts: () => void;
}) {
  return (
    <div id="target-intake" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Step 3
          </Badge>
          <CardTitle>Website intake</CardTitle>
          <CardDescription>
            Accept newline-separated domains or CSV rows. Only the website field must exist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Paste websites</span>
            <Textarea
              className="min-h-56 font-mono text-xs"
              value={props.intakeDraft.websitesText}
              onChange={(event) => props.onDraftChange("websitesText", event.target.value)}
              placeholder={targetExamples}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={props.onUploadWebsites}>
              <Upload className="size-4" />
              Upload CSV or text file
            </Button>
            <Button type="button" onClick={props.onNormalize} disabled={props.isNormalizing}>
              {props.isNormalizing ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Normalizing rows
                </>
              ) : (
                "Normalize rows"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Contact mapping</CardTitle>
            <CardDescription>
              Preserve contact rows alongside websites so personalization remains tied to
              the correct company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">Contacts CSV</span>
              <Textarea
                className="min-h-44 font-mono text-xs"
                value={props.intakeDraft.contactsCsvText}
                onChange={(event) =>
                  props.onDraftChange("contactsCsvText", event.target.value)
                }
                placeholder={contactExamples}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={props.onUploadContacts}>
                <Upload className="size-4" />
                Upload contacts CSV
              </Button>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              The ingest layer dedupes by domain, caps the run at 100 rows, and keeps
              row-level metadata for downstream personalization.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Normalized preview</CardTitle>
            <CardDescription>
              Verify what will actually go into the run manifest before launch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant={props.normalizedTargets.length > 0 ? "accent" : "outline"}>
                {props.normalizedTargets.length} normalized rows
              </Badge>
              <span className="text-xs text-muted-foreground">max 100</span>
            </div>
            <div className="space-y-2">
              {props.normalizedTargets.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                  No normalized targets yet.
                </div>
              ) : (
                props.normalizedTargets.slice(0, 8).map((target) => (
                  <div key={target.websiteUrl} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{target.companyName ?? hostKey(target.websiteUrl)}</p>
                      <Badge variant="outline">{hostKey(target.websiteUrl)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {[target.firstName, target.lastName, target.role]
                        .filter(Boolean)
                        .join(" ")
                        || "No contact metadata"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accepted optional columns</CardTitle>
            <CardDescription>
              Optional fields improve personalization but never block a run when only the
              website exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {acceptedColumns.map((field) => (
                <Badge key={field} variant="outline">
                  {field}
                </Badge>
              ))}
            </div>
            <div className="rounded-md border bg-background p-3 font-mono text-xs text-muted-foreground">
              websiteUrl,companyName,firstName,role
              <br />
              https://acmeplumbing.com,Acme Plumbing,Sarah,Founder
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PipelineView(props: {
  currentRun: RunDetail | null;
  onRefreshRun: () => void;
  isRefreshingRun: boolean;
}) {
  return (
    <div id="pipeline" className="space-y-6">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Pipeline
          </Badge>
          <CardTitle>Pipeline overview</CardTitle>
          <CardDescription>
            Keep the UX flexible for the user while the backend stays rigid, observable,
            and recoverable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pipelineSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <div key={step.title} className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {index + 1}. {step.title}
                      </p>
                      <Badge variant="outline">{step.provider}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Decision rules</CardTitle>
            <CardDescription>
              Make provider choices predictable enough to reason about when jobs fail or
              quality drops.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Cloudflare is always the first crawl attempt.",
              "Deepcrawl activates only when Cloudflare fails or discovered coverage is weak.",
              "Perplexity is used for external validation and personalization.",
              "Image generation stays optional and policy-driven.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                <CheckCircle2 className="mt-0.5 size-4 text-primary" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current run telemetry</CardTitle>
            <CardDescription>
              The pipeline is only testable if the operator can inspect the latest run state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {props.currentRun ? `Run ${props.currentRun.id.slice(0, 8)}` : "No current run"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {props.currentRun
                      ? `${props.currentRun.targets.length} target rows`
                      : "Create or launch a run to populate this panel."}
                  </p>
                </div>
                {props.currentRun ? (
                  <Badge variant={statusVariant(props.currentRun.status)}>
                    {humanizeLabel(props.currentRun.status)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={props.onRefreshRun}
              disabled={!props.currentRun || props.isRefreshingRun}
            >
              {props.isRefreshingRun ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Refreshing telemetry
                </>
              ) : (
                <>
                  <RefreshCcw className="size-4" />
                  Refresh current run
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeliveryView(props: {
  runs: RunSummary[];
  currentRun: RunDetail | null;
  isLaunching: boolean;
  isCreatingDraft: boolean;
  onLaunchNewRun: () => void;
  onLaunchExistingRun: () => void;
  onSelectRun: (runId: string) => void;
}) {
  const deliveryLinks = getDeliveryLinks(props.currentRun);
  const deliveredCount =
    props.currentRun?.targets.filter((target) => target.status === "delivered").length ?? 0;
  const failedCount =
    props.currentRun?.targets.filter((target) => target.status === "failed").length ?? 0;

  return (
    <div id="delivery" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Delivery
          </Badge>
          <CardTitle>Delivery state</CardTitle>
          <CardDescription>
            This panel now reflects the real run status, event stream, and delivery artifacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Current status
              </p>
              <p className="mt-3 text-xl font-semibold">
                {props.currentRun ? humanizeLabel(props.currentRun.status) : "No run"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {props.currentRun ? formatTimestamp(props.currentRun.updatedAt) : "Create a run first"}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Delivered
              </p>
              <p className="mt-3 text-xl font-semibold">{deliveredCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Rows with a delivery artifact
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Failed
              </p>
              <p className="mt-3 text-xl font-semibold">{failedCount}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Target rows that need review
              </p>
            </div>
          </div>

          {props.currentRun?.lastError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {props.currentRun.lastError}
            </div>
          ) : null}

          <div className="space-y-3">
            {(props.currentRun?.events ?? []).slice(-6).reverse().map((event) => (
              <div key={event.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(event.level)}>{event.level}</Badge>
                    <span className="text-sm font-medium">
                      {event.stage ? humanizeLabel(event.stage) : "Run event"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(event.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{event.message}</p>
              </div>
            ))}
            {props.currentRun && props.currentRun.events.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                No run events yet.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Launch controls</CardTitle>
            <CardDescription>
              Create a fresh run from the current form state or launch an existing queued draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <p className="font-medium">Run readiness</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Launching now saves the current workspace state, normalizes target rows when
                needed, creates a new run, and starts processing immediately.
              </p>
            </div>
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={props.onLaunchNewRun}
              disabled={props.isLaunching}
            >
              {props.isLaunching ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Launching batch generation
                </>
              ) : (
                <>
                  <Rocket className="size-4" />
                  Launch new batch generation
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={props.onLaunchExistingRun}
              disabled={
                props.isCreatingDraft ||
                props.isLaunching ||
                !props.currentRun ||
                props.currentRun.status !== "queued"
              }
            >
              <Play className="size-4" />
              Launch selected draft run
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>
              Pick a run to inspect target statuses and delivery artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.runs.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                No runs yet.
              </div>
            ) : (
              props.runs.slice(0, 6).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => props.onSelectRun(run.id)}
                  className="w-full rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/35"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Run {run.id.slice(0, 8)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {run.target_count} targets • {humanizeLabel(run.delivery_format)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(run.status)}>
                      {humanizeLabel(run.status)}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery links</CardTitle>
            <CardDescription>
              Output links are attached to the current run as artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveryLinks.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                No deck deliveries are attached to the selected run yet.
              </div>
            ) : (
              deliveryLinks.map((link, index) => (
                <div key={link.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Delivery {index + 1}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Presentation {link.presentationId || "pending"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {link.editorUrl ? (
                        <Button asChild size="sm">
                          <a href={link.editorUrl} target="_blank" rel="noreferrer">
                            Editor
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      {link.exportUrl ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={link.exportUrl} target="_blank" rel="noreferrer">
                            Export
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function RunBuilderShell({ currentUser }: { currentUser?: CurrentUser }) {
  const activeView = useActiveWorkspaceView();
  const meta = viewMeta[activeView];
  const isOverview = activeView === "overview";

  const [profile, setProfile] = React.useState(() => defaultProfile(currentUser));
  const [sellerForm, setSellerForm] = React.useState(() => defaultSellerContext());
  const [questionnaireForm, setQuestionnaireForm] = React.useState(() =>
    defaultQuestionnaire(),
  );
  const [intakeDraft, setIntakeDraft] = React.useState(() => defaultIntakeDraft());
  const [providerValues, setProviderValues] = React.useState<ProviderFieldValues>(() =>
    emptyProviderValues(),
  );
  const [savedIntegrations, setSavedIntegrations] = React.useState<
    Partial<Record<IntegrationProviderKey, SavedIntegrationState>>
  >({});
  const [normalizedTargets, setNormalizedTargets] = React.useState<CompanyRow[]>([]);
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [currentRun, setCurrentRun] = React.useState<RunDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isSavingWorkspace, setIsSavingWorkspace] = React.useState(false);
  const [isNormalizing, setIsNormalizing] = React.useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = React.useState(false);
  const [isLaunching, setIsLaunching] = React.useState(false);
  const [isRefreshingRun, setIsRefreshingRun] = React.useState(false);
  const websitesUploadRef = React.useRef<HTMLInputElement | null>(null);
  const contactsUploadRef = React.useRef<HTMLInputElement | null>(null);

  const readiness = getRunReadiness(
    profile,
    sellerForm,
    questionnaireForm,
    normalizedTargets,
    savedIntegrations,
    providerValues,
  );

  const applyOnboarding = React.useCallback(
    (payload: OnboardingResponse) => {
      setProfile((previous) => ({
        ...previous,
        ...payload.profile,
        ownerName:
          payload.profile?.ownerName ?? previous.ownerName ?? currentUser?.name ?? "",
        ownerEmail:
          payload.profile?.ownerEmail ?? previous.ownerEmail ?? currentUser?.email ?? "",
      }));
      setSellerForm(sellerContextToForm(payload.sellerContext));
      setQuestionnaireForm(questionnaireToForm(payload.questionnaire));
      setIntakeDraft({
        websitesText: payload.intakeDraft?.websitesText ?? "",
        contactsCsvText: payload.intakeDraft?.contactsCsvText ?? "",
      });

      const nextSavedIntegrations = Object.fromEntries(
        (payload.integrations ?? []).map((integration) => [integration.provider, integration]),
      ) as Partial<Record<IntegrationProviderKey, SavedIntegrationState>>;
      setSavedIntegrations(nextSavedIntegrations);
      setProviderValues((previous) => ({
        ...previous,
        cloudflareAccountId:
          typeof nextSavedIntegrations.cloudflare?.config?.accountId === "string"
            ? String(nextSavedIntegrations.cloudflare?.config?.accountId)
            : "",
        cloudflareApiToken: "",
        deepcrawlApiKey: "",
        perplexityApiKey: "",
        openaiApiKey: "",
        geminiApiKey: "",
        presentonBaseUrl:
          typeof nextSavedIntegrations.presenton?.config?.baseUrl === "string"
            ? String(nextSavedIntegrations.presenton?.config?.baseUrl)
            : "",
        presentonApiKey: "",
      }));
    },
    [currentUser?.email, currentUser?.name],
  );

  const refreshRun = React.useCallback(
    async (runId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsRefreshingRun(true);
      }

      try {
        const response = await requestJson<RunDetail>(`/api/runs/${runId}`);
        setCurrentRun(response);
        setSelectedRunId(runId);
      } finally {
        if (!options?.silent) {
          setIsRefreshingRun(false);
        }
      }
    },
    [],
  );

  const refreshRuns = React.useCallback(
    async (preferredRunId?: string) => {
      const response = await requestJson<{ runs: RunSummary[] }>("/api/runs");
      setRuns(response.runs);

      const nextRunId =
        preferredRunId ??
        selectedRunId ??
        response.runs[0]?.id ??
        null;

      if (nextRunId) {
        await refreshRun(nextRunId, { silent: true });
      } else {
        setSelectedRunId(null);
        setCurrentRun(null);
      }
    },
    [refreshRun, selectedRunId],
  );

  React.useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const onboarding = await requestJson<OnboardingResponse>("/api/onboarding");
        if (cancelled) {
          return;
        }

        applyOnboarding(onboarding);
        await refreshRuns();
      } catch (error) {
        if (!cancelled) {
          setNotice({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load workspace state.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyOnboarding, refreshRuns]);

  React.useEffect(() => {
    if (!selectedRunId || !currentRun) {
      return;
    }

    if (!["queued", "running"].includes(currentRun.status)) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshRun(selectedRunId, { silent: true });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [currentRun, refreshRun, selectedRunId]);

  const handleProfileChange = React.useCallback(
    (field: keyof WorkspaceProfileForm, value: string) => {
      setProfile((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const handleSellerChange = React.useCallback(
    (field: keyof SellerContextForm, value: string) => {
      setSellerForm((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const handleQuestionnaireChange = React.useCallback(
    <K extends keyof QuestionnaireForm>(field: K, value: QuestionnaireForm[K]) => {
      setQuestionnaireForm((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const handleProviderChange = React.useCallback(
    (field: ProviderFieldId, value: string) => {
      setProviderValues((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const handleIntakeDraftChange = React.useCallback(
    (field: keyof IntakeDraftForm, value: string) => {
      setIntakeDraft((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const persistWorkspace = React.useCallback(
    async (options?: { silent?: boolean }) => {
      setIsSavingWorkspace(true);

      try {
        const integrations = providerFieldDefinitions
          .reduce<Array<{
            provider: IntegrationProviderKey;
            displayName?: string;
            config?: Record<string, unknown>;
            secret?: string;
          }>>((records, field) => {
            const currentValue = providerValues[field.id].trim();
            const existing = records.find((record) => record.provider === field.provider);

            if (field.kind === "config") {
              if (!currentValue) {
                return records;
              }

              if (existing) {
                existing.config = {
                  ...(existing.config ?? {}),
                  [field.configKey as string]: currentValue,
                };
              } else {
                records.push({
                  provider: field.provider,
                  config: { [field.configKey as string]: currentValue },
                });
              }

              return records;
            }

            if (!currentValue) {
              return records;
            }

            if (existing) {
              existing.secret = currentValue;
            } else {
              records.push({
                provider: field.provider,
                secret: currentValue,
              });
            }

            return records;
          }, [])
          .filter(
            (record) =>
              Boolean(record.secret) ||
              Boolean(record.config && Object.keys(record.config).length > 0),
          );

        const response = await requestJson<{
          ok: true;
          onboarding: OnboardingResponse;
        }>("/api/onboarding", {
          method: "POST",
          body: {
            profile,
            sellerContext: buildSellerContextPayload(sellerForm),
            questionnaire: buildQuestionnairePayload(questionnaireForm),
            integrations,
            intakeDraft,
          },
        });

        applyOnboarding(response.onboarding);
        if (!options?.silent) {
          setNotice({ type: "success", message: "Workspace state saved." });
        }
      } catch (error) {
        setNotice({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unable to save workspace state.",
        });
        throw error;
      } finally {
        setIsSavingWorkspace(false);
      }
    },
    [applyOnboarding, intakeDraft, profile, providerValues, questionnaireForm, sellerForm],
  );

  const normalizeTargets = React.useCallback(async () => {
    setIsNormalizing(true);

    try {
      const normalizedSets: CompanyRow[] = [];

      if (intakeDraft.websitesText.trim()) {
        const response = await requestJson<{
          ok: true;
          count: number;
          targets: CompanyRow[];
        }>("/api/intake/normalize", {
          method: "POST",
          body: {
            mode: "multiline",
            input: intakeDraft.websitesText,
          },
        });
        normalizedSets.push(...response.targets);
      }

      if (intakeDraft.contactsCsvText.trim()) {
        const response = await requestJson<{
          ok: true;
          count: number;
          targets: CompanyRow[];
        }>("/api/intake/normalize", {
          method: "POST",
          body: {
            mode: "csv",
            input: intakeDraft.contactsCsvText,
          },
        });
        normalizedSets.push(...response.targets);
      }

      const merged = mergeTargets(normalizedSets);
      setNormalizedTargets(merged);
      setNotice({
        type: "success",
        message:
          merged.length > 0
            ? `Normalized ${merged.length} target row${merged.length === 1 ? "" : "s"}.`
            : "No rows were produced from the current intake.",
      });

      return merged;
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to normalize target rows.",
      });
      throw error;
    } finally {
      setIsNormalizing(false);
    }
  }, [intakeDraft.contactsCsvText, intakeDraft.websitesText]);

  const buildRunPayload = React.useCallback(
    async (options?: { ensureNormalized?: boolean }) => {
      const targets =
        normalizedTargets.length > 0
          ? normalizedTargets
          : options?.ensureNormalized
            ? await normalizeTargets()
            : normalizedTargets;

      if (targets.length === 0) {
        throw new Error("Normalize at least one target row before creating a run.");
      }

      return {
        sellerContext: buildSellerContextPayload(sellerForm),
        questionnaire: buildQuestionnairePayload(questionnaireForm),
        targets,
      };
    },
    [normalizeTargets, normalizedTargets, questionnaireForm, sellerForm],
  );

  const createRunDraft = React.useCallback(async () => {
    setIsCreatingDraft(true);

    try {
      await persistWorkspace({ silent: true });
      const runPayload = await buildRunPayload({ ensureNormalized: true });
      const response = await requestJson<{
        ok: true;
        runId: string;
        launched: boolean;
      }>("/api/runs", {
        method: "POST",
        body: {
          run: runPayload,
          autoLaunch: false,
        },
      });

      await refreshRuns(response.runId);
      window.location.hash = "#delivery";
      setNotice({
        type: "success",
        message: `Draft run ${response.runId.slice(0, 8)} created.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create run draft.",
      });
    } finally {
      setIsCreatingDraft(false);
    }
  }, [buildRunPayload, persistWorkspace, refreshRuns]);

  const launchNewRun = React.useCallback(async () => {
    setIsLaunching(true);

    try {
      await persistWorkspace({ silent: true });
      const runPayload = await buildRunPayload({ ensureNormalized: true });
      const response = await requestJson<{
        ok: true;
        runId: string;
        launched: boolean;
      }>("/api/runs", {
        method: "POST",
        body: {
          run: runPayload,
          autoLaunch: true,
        },
      });

      await refreshRuns(response.runId);
      window.location.hash = "#delivery";
      setNotice({
        type: "success",
        message: `Run ${response.runId.slice(0, 8)} launched.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to launch batch generation.",
      });
    } finally {
      setIsLaunching(false);
    }
  }, [buildRunPayload, persistWorkspace, refreshRuns]);

  const launchExistingRun = React.useCallback(async () => {
    if (!selectedRunId) {
      setNotice({ type: "error", message: "Select a queued run first." });
      return;
    }

    setIsLaunching(true);

    try {
      await requestJson<{ ok: true; launched: boolean }>(
        `/api/runs/${selectedRunId}/launch`,
        {
          method: "POST",
        },
      );
      await refreshRuns(selectedRunId);
      setNotice({
        type: "success",
        message: `Run ${selectedRunId.slice(0, 8)} launched.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to launch the selected run.",
      });
    } finally {
      setIsLaunching(false);
    }
  }, [refreshRuns, selectedRunId]);

  if (isBootstrapping) {
    return (
      <main className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="outline" className="w-fit">
              Loading workspace
            </Badge>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Bootstrapping Bestdecks
            </CardTitle>
            <CardDescription>
              Pulling onboarding state, recent runs, and delivery artifacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <LoaderCircle className="size-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Please wait.</span>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <input
        ref={websitesUploadRef}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        className="hidden"
        onChange={() =>
          uploadTextFile(websitesUploadRef, (text) =>
            setIntakeDraft((previous) => ({ ...previous, websitesText: text })),
          )
        }
      />
      <input
        ref={contactsUploadRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={() =>
          uploadTextFile(contactsUploadRef, (text) =>
            setIntakeDraft((previous) => ({ ...previous, contactsCsvText: text })),
          )
        }
      />

      <Card
        className={
          isOverview
            ? "overflow-hidden border-0 bg-transparent shadow-none ring-0"
            : undefined
        }
      >
        {isOverview ? (
          <div className="relative overflow-hidden rounded-xl border border-black bg-black text-white shadow-sm">
            <CardHeader className="relative px-8 py-10 md:px-10 md:py-12 lg:px-12 lg:py-14">
              <Badge
                variant="secondary"
                className="mb-3 w-fit bg-white/18 text-white backdrop-blur-sm"
              >
                {meta.eyebrow}
              </Badge>
              <CardTitle className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {meta.title}
              </CardTitle>
              <CardDescription className="mt-4 max-w-4xl text-base leading-8 text-white/82 sm:text-lg">
                {meta.description}
              </CardDescription>
            </CardHeader>
          </div>
        ) : (
          <CardHeader>
            <Badge variant="outline" className="mb-2 w-fit">
              {meta.eyebrow}
            </Badge>
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {meta.title}
            </CardTitle>
            <CardDescription className="max-w-3xl">{meta.description}</CardDescription>
          </CardHeader>
        )}
      </Card>

      <SectionNotice notice={notice} />

      {activeView === "overview" ? (
        <OverviewView
          readiness={readiness}
          runs={runs}
          currentRun={currentRun}
          normalizedTargets={normalizedTargets}
          activeDeliveryCount={getDeliveryLinks(currentRun).length}
        />
      ) : null}
      {activeView === "onboarding" ? (
        <OnboardingView
          profile={profile}
          providerValues={providerValues}
          savedIntegrations={savedIntegrations}
          intakeDraft={intakeDraft}
          isSaving={isSavingWorkspace}
          onProfileChange={handleProfileChange}
          onProviderChange={handleProviderChange}
          onIntakeDraftChange={handleIntakeDraftChange}
          onSave={() => {
            void persistWorkspace();
          }}
          onNormalizeSeed={() => {
            void normalizeTargets();
          }}
          onUploadWebsites={() => websitesUploadRef.current?.click()}
          onUploadContacts={() => contactsUploadRef.current?.click()}
        />
      ) : null}
      {activeView === "seller-context" ? (
        <SellerContextView
          sellerForm={sellerForm}
          onChange={handleSellerChange}
          onSave={() => {
            void persistWorkspace();
          }}
          isSaving={isSavingWorkspace}
        />
      ) : null}
      {activeView === "run-settings" ? (
        <RunSettingsView
          questionnaireForm={questionnaireForm}
          isSaving={isSavingWorkspace}
          onChange={handleQuestionnaireChange}
          onSave={() => {
            void persistWorkspace();
          }}
          onCreateDraft={() => {
            void createRunDraft();
          }}
          isCreatingDraft={isCreatingDraft}
        />
      ) : null}
      {activeView === "target-intake" ? (
        <TargetIntakeView
          intakeDraft={intakeDraft}
          normalizedTargets={normalizedTargets}
          isNormalizing={isNormalizing}
          onDraftChange={handleIntakeDraftChange}
          onNormalize={() => {
            void normalizeTargets();
          }}
          onUploadWebsites={() => websitesUploadRef.current?.click()}
          onUploadContacts={() => contactsUploadRef.current?.click()}
        />
      ) : null}
      {activeView === "pipeline" ? (
        <PipelineView
          currentRun={currentRun}
          onRefreshRun={() => {
            if (selectedRunId) {
              void refreshRun(selectedRunId);
            }
          }}
          isRefreshingRun={isRefreshingRun}
        />
      ) : null}
      {activeView === "delivery" ? (
        <DeliveryView
          runs={runs}
          currentRun={currentRun}
          isLaunching={isLaunching}
          isCreatingDraft={isCreatingDraft}
          onLaunchNewRun={() => {
            void launchNewRun();
          }}
          onLaunchExistingRun={() => {
            void launchExistingRun();
          }}
          onSelectRun={(runId) => {
            void refreshRun(runId);
          }}
        />
      ) : null}
    </main>
  );
}
