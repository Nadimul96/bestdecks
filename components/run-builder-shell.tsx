"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileText,
  FolderKanban,
  ImageIcon,
  KeyRound,
  Layers3,
  Search,
  Sparkles,
  Target,
  Upload,
  Wand2,
} from "lucide-react";

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
import {
  DEFAULT_WORKSPACE_VIEW,
  isWorkspaceViewId,
  type WorkspaceViewId,
} from "@/lib/workspace-navigation";

const archetypes = [
  {
    title: "Cold Outreach",
    description: "Lead with company-specific evidence and a narrow, credible call to action.",
  },
  {
    title: "Warm Intro",
    description: "Frame shared context, likely upside, and why the conversation should happen now.",
  },
  {
    title: "Agency Proposal",
    description: "Translate research into a tailored recommendation, scope direction, and next step.",
  },
];

const outputFormats = ["Presenton editor", "PDF", "PPTX"];

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

const targetExamples = `https://acmeplumbing.com
https://northshoreclinic.com
https://sunsetlogistics.io`;

const contactExamples = `websiteUrl,firstName,lastName,role,email
https://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com
https://northshoreclinic.com,Marcus,Reed,Director,marcus@northshoreclinic.com`;

const metrics = [
  {
    label: "Run capacity",
    value: "100 companies",
    detail: "One deck per uploaded row by default",
  },
  {
    label: "Primary crawl",
    value: "Cloudflare",
    detail: "Deepcrawl fallback when needed",
  },
  {
    label: "Research layer",
    value: "Perplexity",
    detail: "External validation and personalization",
  },
  {
    label: "Delivery",
    value: "Presenton",
    detail: "Editor, PDF, or PPTX",
  },
];

const deliveryItems = [
  "Run manifest preview and row normalization before crawl jobs start",
  "Seller brief generation from website discovery or typed offer details",
  "Per-target crawl coverage, retries, and failure-state reporting",
  "Optional operator review before a deck is treated as delivered",
  "Presenton editor link or the selected PDF/PPTX export once complete",
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

const providerFields = [
  "Cloudflare account ID",
  "Cloudflare API token",
  "Deepcrawl API key",
  "Perplexity API key",
  "OpenAI API key",
  "Gemini API key",
  "Presenton base URL",
];

const checklist = [
  {
    title: "Connect providers",
    description: "Store the credentials and endpoints the workspace will use for crawl, research, image generation, and deck delivery.",
  },
  {
    title: "Describe the seller",
    description: "Capture the operator's website, offer, services, and differentiators so the deck actually reflects what is being sold.",
  },
  {
    title: "Load targets and contacts",
    description: "Import websites and contact rows now so the first run starts from structured input instead of manual patching later.",
  },
];

const overviewCards = [
  {
    title: "Onboarding",
    href: "#onboarding",
    description: "Collect credentials, operator defaults, and first-run intake.",
    status: "Required first",
  },
  {
    title: "Seller Context",
    href: "#seller-context",
    description: "Teach the system what the user sells and why it matters.",
    status: "Evidence source",
  },
  {
    title: "Run Settings",
    href: "#run-settings",
    description: "Normalize deck type, audience, CTA, and output format.",
    status: "Typed contract",
  },
  {
    title: "Target Intake",
    href: "#target-intake",
    description: "Upload websites and contact rows for up to 100 companies.",
    status: "Batch input",
  },
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

function OverviewView() {
  return (
    <div className="space-y-6">
      <section id="overview" className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader>
            <CardAction className="hidden gap-2 sm:flex">
              <Button asChild>
                <a href="#onboarding">Continue onboarding</a>
              </Button>
              <Button asChild variant="outline">
                <a href="#pipeline">Review contract</a>
              </Button>
            </CardAction>
            <Badge variant="secondary" className="mb-2">
              Batch runs up to 100 companies
            </Badge>
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Research-to-deck workspace
            </CardTitle>
            <CardDescription className="max-w-3xl">
              Capture the seller offer first, normalize user intent into typed fields, crawl
              every target, enrich the findings, and deliver one tailored deck per row.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border bg-muted/30 p-4">
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
            <Badge variant="outline" className="mb-2">
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
              "Operators choose Presenton editor, PDF, or PPTX.",
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
              Use this page to move between setup stages instead of hunting through one long form.
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
                    <Badge variant="outline">{card.status}</Badge>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline snapshot</CardTitle>
            <CardDescription>
              The backend remains rigid even when the UI feels conversational.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineSteps.slice(0, 3).map((step, index) => {
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
      </section>
    </div>
  );
}

function OnboardingView() {
  return (
    <div id="onboarding" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="secondary" className="mb-2">
              Step 0
            </Badge>
            <CardTitle>Operator profile</CardTitle>
            <CardDescription>
              Capture the workspace owner and company defaults before the first run starts.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Full name</p>
              <Input placeholder="Nadim Haque" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Work email</p>
              <Input placeholder="owner@customproposals.app" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Company</p>
              <Input placeholder="Custom Proposals" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Primary website</p>
              <Input placeholder="https://yourcompany.com" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Timezone</p>
              <Input placeholder="Asia/Makassar" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Default signature</p>
              <Input placeholder="Book a 20-minute call next week" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="outline" className="mb-2">
              Access
            </Badge>
            <CardTitle>Provider credentials</CardTitle>
            <CardDescription>
              Store the access this workspace needs for crawl, research, image generation, and deck output.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {providerFields.map((field) => (
              <div key={field} className="space-y-2">
                <p className="text-sm font-medium">{field}</p>
                <Input placeholder={`Enter ${field.toLowerCase()}`} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Badge variant="outline" className="mb-2">
              First import
            </Badge>
            <CardTitle>Seed the workspace</CardTitle>
            <CardDescription>
              Collect the first batch of target websites and contact rows during onboarding so the first run is immediately actionable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Website list</p>
              <Textarea className="min-h-40 font-mono text-xs" defaultValue={targetExamples} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Contacts CSV</p>
              <Textarea className="min-h-40 font-mono text-xs" defaultValue={contactExamples} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>
                <Upload className="size-4" />
                Upload import file
              </Button>
              <Button variant="outline">Validate sources</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Onboarding checklist</CardTitle>
            <CardDescription>
              This step should gather everything needed so later pages can focus on execution, not missing data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklist.map((item) => (
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

function SellerContextView() {
  return (
    <Card id="seller-context">
      <CardHeader>
        <Badge variant="secondary" className="mb-2">
          Step 1
        </Badge>
        <CardTitle>Seller context</CardTitle>
        <CardDescription>
          Teach the system what the user actually sells so target-company research becomes a credible pitch instead of generic deck filler.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium">Seller website</p>
          <Input placeholder="https://yourcompany.com" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Company name</p>
          <Input placeholder="Northwind Studio" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Desired outcome</p>
          <Input placeholder="Book qualified discovery calls" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium">Offer summary</p>
          <Textarea
            className="min-h-32"
            placeholder="We generate research-backed outreach decks for outbound campaigns aimed at specific target accounts."
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Services</p>
          <Input placeholder="Outbound strategy, proposal generation, presentation design" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Ideal customer</p>
          <Input placeholder="Founders and growth leaders at SMBs" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-medium">Differentiators</p>
          <Textarea
            className="min-h-28"
            placeholder="Each deck is generated from target-company evidence rather than generic templates."
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RunSettingsView() {
  return (
    <Card id="run-settings">
      <CardHeader>
        <Badge variant="secondary" className="mb-2">
          Step 2
        </Badge>
        <CardTitle>Run settings</CardTitle>
        <CardDescription>
          The intake can feel chat-like for the user, but the backend still normalizes it into a fixed contract for deck generation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {archetypes.map((archetype) => (
            <div key={archetype.title} className="rounded-lg border bg-muted/25 p-4">
              <p className="font-medium">{archetype.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {archetype.description}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Audience</p>
            <Input placeholder="Founder or Head of Growth" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Call to action</p>
            <Input placeholder="Book a 20-minute call" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Goal</p>
            <Textarea
              className="min-h-24"
              placeholder="Convince the target company to explore a tailored outbound campaign."
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Must include</p>
            <Textarea
              className="min-h-24"
              placeholder="Specific website observations, clear next step, localized context"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-medium">Choose one output format</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {outputFormats.map((format, index) => (
              <Badge key={format} variant={index === 0 ? "secondary" : "outline"}>
                {format}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Presenton editor is the fastest default, but PDF and PPTX remain available when the operator needs a portable export.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetIntakeView() {
  return (
    <div id="target-intake" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2">
            Step 3
          </Badge>
          <CardTitle>Website intake</CardTitle>
          <CardDescription>
            Accept newline-separated domains or CSV rows. Only the website field must exist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Paste websites</p>
            <Textarea className="min-h-56 font-mono text-xs" defaultValue={targetExamples} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>
              <Upload className="size-4" />
              Upload CSV
            </Button>
            <Button variant="outline">Normalize rows</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Contact mapping</CardTitle>
            <CardDescription>
              Preserve contact rows alongside websites so personalization remains tied to the correct company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Contacts CSV</p>
              <Textarea className="min-h-44 font-mono text-xs" defaultValue={contactExamples} />
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              The ingest layer dedupes by domain, caps the run at 100 rows, and keeps row-level metadata for downstream personalization.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accepted optional columns</CardTitle>
            <CardDescription>
              Optional fields improve personalization but never block a run when only the website exists.
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

function PipelineView() {
  return (
    <div id="pipeline" className="space-y-6">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2">
            Pipeline
          </Badge>
          <CardTitle>Pipeline overview</CardTitle>
          <CardDescription>
            Keep the UX flexible for the user while the backend stays rigid, observable, and recoverable.
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
              Make provider choices predictable enough to reason about when jobs fail or quality drops.
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
            <CardTitle>Operator controls</CardTitle>
            <CardDescription>
              Keep review, retries, and export choices visible while the run is executing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/25 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="size-4" />
              </div>
              <div>
                <p className="font-medium">Optional review mode</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hold completed decks for approval when the run requires operator review before delivery.
                </p>
              </div>
            </div>

            <Button asChild className="w-full" size="lg">
              <a href="#delivery">
                Continue to delivery
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeliveryView() {
  return (
    <div id="delivery" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2">
            Delivery
          </Badge>
          <CardTitle>Delivery state</CardTitle>
          <CardDescription>
            This is where the live run status, review gate, and export links will surface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliveryItems.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
              <FolderKanban className="mt-0.5 size-4 text-primary" />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Output rules</CardTitle>
            <CardDescription>
              Return exactly one output mode for the full run once generation succeeds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {outputFormats.map((format, index) => (
                <Badge key={format} variant={index === 0 ? "secondary" : "outline"}>
                  {format}
                </Badge>
              ))}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Presenton editor stays the fastest default. PDF and PPTX remain export options when the operator needs a portable file.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch controls</CardTitle>
            <CardDescription>
              Make it clear what is automated, what is reviewed, and what the user will receive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <p className="font-medium">Run readiness</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Once onboarding, seller context, run settings, and intake are populated, this page becomes the single place to launch and monitor the batch.
              </p>
            </div>
            <Button className="w-full" size="lg">
              Launch batch generation
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function RunBuilderShell() {
  const activeView = useActiveWorkspaceView();
  const meta = viewMeta[activeView];
  const isOverview = activeView === "overview";

  return (
    <main className="space-y-6">
      <Card
        className={
          isOverview
            ? "overflow-hidden border-0 bg-transparent shadow-none ring-0"
            : undefined
        }
      >
        {isOverview ? (
          <div className="relative overflow-hidden rounded-xl border border-black bg-black text-white shadow-sm">
            <CardHeader className="relative px-8 py-8 md:px-10 md:py-10 lg:px-12 lg:py-12">
              <Badge
                variant="secondary"
                className="mb-2 w-fit bg-white/18 text-white backdrop-blur-sm"
              >
                {meta.eyebrow}
              </Badge>
              <CardTitle className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {meta.title}
              </CardTitle>
              <CardDescription className="mt-2 max-w-4xl text-base leading-8 text-white/82 sm:text-lg">
                {meta.description}
              </CardDescription>
            </CardHeader>
          </div>
        ) : (
          <CardHeader>
            <Badge variant="outline" className="mb-2">
              {meta.eyebrow}
            </Badge>
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {meta.title}
            </CardTitle>
            <CardDescription className="max-w-3xl">{meta.description}</CardDescription>
          </CardHeader>
        )}
      </Card>

      {activeView === "overview" ? <OverviewView /> : null}
      {activeView === "onboarding" ? <OnboardingView /> : null}
      {activeView === "seller-context" ? <SellerContextView /> : null}
      {activeView === "run-settings" ? <RunSettingsView /> : null}
      {activeView === "target-intake" ? <TargetIntakeView /> : null}
      {activeView === "pipeline" ? <PipelineView /> : null}
      {activeView === "delivery" ? <DeliveryView /> : null}
    </main>
  );
}
