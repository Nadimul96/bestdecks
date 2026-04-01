"use client";

import * as React from "react";
import {
  ArrowRight,
  GripVertical,
  ImageIcon,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ViewLayout } from "../view-layout";
import { viewMeta, archetypeOptions, type QuestionnaireForm } from "@/lib/workspace-types";
import type { DeckArchetype } from "@/src/domain/schemas";
import { cn } from "@/lib/utils";

const meta = viewMeta["deck-structure"];

/* ─── Constants ─── */
const VISUAL_CREDIT_COST = 0.25;

/* ─── Types ─── */

interface SlideBlueprint {
  id: string;
  title: string;
  description: string;
  includeVisual: boolean;
  required: boolean; // required slides can still be edited, just not removed
}

/* ─── Defaults ─── */

/** Human-readable label for an archetype key */
function archetypeLabel(archetype: string): string {
  const match = archetypeOptions.find((o) => o.value === archetype);
  return match?.label ?? archetype.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultSlideBlueprints(archetype: string): SlideBlueprint[] {
  const s = (id: string, title: string, description: string, opts?: { visual?: boolean; required?: boolean }): SlideBlueprint => ({
    id,
    title,
    description,
    includeVisual: opts?.visual ?? false,
    required: opts?.required ?? false,
  });

  switch (archetype) {
    case "cold_outreach":
      return [
        s("hook", "Hook", "A company-specific opening that grabs attention — reference a recent event, metric, or challenge unique to the target.", { required: true }),
        s("tension", "Company-Specific Tension", "Surface a concrete tension or gap the target is experiencing right now, backed by research."),
        s("industry_shift", "Industry Shift", "Frame a broader industry change that makes the status quo risky. Set the stage for urgency.", { visual: true }),
        s("loss_stat", "Preventable Loss Stat", "One powerful statistic that quantifies what inaction costs companies like theirs.", { visual: true }),
        s("vision", "Vision", "Paint the picture of the better future — what the world looks like once this problem is solved."),
        s("solution_1", "Solution Pillar 1", "First key capability of your solution, mapped directly to their pain.", { visual: true }),
        s("solution_2", "Solution Pillar 2", "Second key capability — show breadth without losing focus."),
        s("solution_3", "Solution Pillar 3", "Third key capability — tie back to the industry shift or loss stat."),
        s("proof", "Proof / Case Study", "A concrete example of results achieved for a similar company. Include metrics."),
        s("cta", "Call to Action", "Single, low-friction next step. Be specific about what you want them to do.", { required: true }),
      ];

    case "warm_intro":
      return [
        s("context", "Context Recap", "Reference the shared connection, event, or prior interaction that makes this warm.", { required: true }),
        s("shared_connection", "Shared Connection", "Why this introduction matters — mutual interests, overlapping networks, or aligned goals."),
        s("challenge", "Their Challenge", "The specific problem or opportunity you believe they face, based on what you know."),
        s("approach", "Your Approach", "How your solution addresses their challenge — tailored, not generic.", { visual: true }),
        s("how_it_works", "How It Works", "A clear walkthrough of your process or product in action.", { visual: true }),
        s("results", "Results", "Proof points from similar engagements — metrics, testimonials, or outcomes."),
        s("next_steps", "Next Steps", "A warm, specific ask — meeting, intro call, or shared resource."),
        s("contact", "Contact", "Your details, calendar link, and a closing note.", { required: true }),
      ];

    case "agency_proposal":
      return [
        s("cover", "Cover", "Title, your logo, their company name, and date.", { required: true }),
        s("brief", "Understanding Their Brief", "Demonstrate that you've listened — restate their goals, constraints, and success criteria."),
        s("approach", "Our Approach", "Your strategic framework for tackling their brief. Show thinking, not just doing.", { visual: true }),
        s("scope", "Scope & Deliverables", "Detailed breakdown of what's included — be precise about outputs."),
        s("timeline", "Timeline", "Key milestones, phases, and delivery dates laid out clearly.", { visual: true }),
        s("team", "Team", "Who will work on this and why they're the right people.", { visual: true }),
        s("case_study_1", "Case Study 1", "A relevant past project with measurable results."),
        s("case_study_2", "Case Study 2", "A second example that shows range or depth in their space."),
        s("investment", "Investment", "Pricing options, what each tier includes, and ROI framing."),
        s("next_steps", "Next Steps", "How to move forward — decision timeline, signing process, kickoff.", { required: true }),
      ];

    case "investor_pitch":
      return [
        s("cover", "Cover", "Company name, tagline, round details, and date.", { required: true }),
        s("problem", "Problem", "The problem you're solving — make it visceral and large.", { visual: true }),
        s("market", "Market Size", "TAM/SAM/SOM with credible sources. Show the opportunity is large enough.", { visual: true }),
        s("solution", "Solution", "What you've built and why it's the right approach.", { visual: true }),
        s("how_it_works", "How It Works", "Product walkthrough or demo screenshots showing the experience."),
        s("traction", "Traction", "Key metrics — revenue, users, growth rate, retention. Be honest and specific.", { visual: true }),
        s("business_model", "Business Model", "How you make money — unit economics, pricing, LTV/CAC."),
        s("competition", "Competition", "Landscape positioning — why you win and what moats you're building.", { visual: true }),
        s("team", "Team", "Founders and key hires — relevant experience and why this team.", { visual: true }),
        s("financials", "Financials", "Projections, burn rate, runway. Keep it grounded.", { visual: true }),
        s("ask", "The Ask", "How much you're raising, use of funds, and what you're looking for in a partner."),
        s("contact", "Contact", "Founder contact details and data room link.", { required: true }),
      ];

    case "partnership":
      return [
        s("cover", "Cover", "Partnership proposal title, both company names, and date.", { required: true }),
        s("opportunity", "Mutual Opportunity", "Frame the partnership as a win-win — what each side gains."),
        s("audience_overlap", "Audience Overlap", "Show where your audiences or markets intersect.", { visual: true }),
        s("integration", "Integration Concept", "What the partnership looks like in practice — co-sell, integration, or co-marketing.", { visual: true }),
        s("pilot", "Pilot Proposal", "A concrete, low-risk first step to test the partnership."),
        s("case_study", "Case Study", "An example of a similar partnership that worked — or adjacent proof."),
        s("terms", "Terms", "Proposed structure — revenue share, responsibilities, timeline."),
        s("next_steps", "Next Steps", "How to kick off the conversation and who to involve.", { required: true }),
      ];

    case "event_sponsor":
      return [
        s("cover", "Cover", "Sponsorship proposal title, event name, and date.", { required: true }),
        s("alignment", "Event Alignment", "Why this event fits your brand — audience, theme, and values match."),
        s("audience", "Audience Reach", "Demographics, attendee count, and engagement metrics.", { visual: true }),
        s("activation", "Activation Ideas", "Creative ways to show up — booths, talks, branded experiences.", { visual: true }),
        s("past_sponsorships", "Past Sponsorships", "Examples of past events you've sponsored and results achieved."),
        s("packages", "Package Options", "Sponsorship tiers with clear inclusions and pricing."),
        s("roi", "ROI Projection", "Expected returns — leads, impressions, brand lift.", { visual: true }),
        s("contact", "Contact", "Decision-maker details and next steps.", { required: true }),
      ];

    case "product_demo":
      return [
        s("cover", "Cover", "Demo recap title, their company name, and date.", { required: true }),
        s("workflow_gaps", "Their Workflow Gaps", "The specific pain points or inefficiencies you identified in their current setup."),
        s("highlights", "Demo Highlights", "Key moments from the demo — the features that resonated most.", { visual: true }),
        s("feature_1", "Feature Deep-Dive 1", "First standout feature mapped to their workflow gap.", { visual: true }),
        s("feature_2", "Feature Deep-Dive 2", "Second feature with a concrete use case for their team.", { visual: true }),
        s("feature_3", "Feature Deep-Dive 3", "Third feature — tie it to ROI or time savings."),
        s("comparison", "Comparison", "How you stack up against their current solution or competitors.", { visual: true }),
        s("next_steps", "Next Steps", "Trial, pilot, or procurement process — be specific.", { required: true }),
      ];

    case "upsell":
      return [
        s("cover", "Cover", "Account expansion proposal, their company name, and date.", { required: true }),
        s("usage_wins", "Current Usage Wins", "Highlight what's working — adoption metrics, outcomes, and team feedback.", { visual: true }),
        s("growth_opp", "Growth Opportunity", "Where there's room to do more — untapped features, teams, or use cases."),
        s("new_capability", "New Capability", "The specific product or tier you're proposing they adopt.", { visual: true }),
        s("roi", "ROI of Expansion", "Projected value of upgrading — cost savings, revenue impact, efficiency gains.", { visual: true }),
        s("implementation", "Implementation", "How the expansion works — migration, onboarding, support."),
        s("timeline", "Timeline", "Rollout plan with key milestones."),
        s("lets_talk", "Let's Talk", "Next meeting, decision timeline, and your contact.", { required: true }),
      ];

    case "board_update":
      return [
        s("cover", "Cover", "Board update title, company name, period, and date.", { required: true }),
        s("exec_summary", "Executive Summary", "Three to five bullet-point highlights — wins, misses, and priorities."),
        s("metrics", "Key Metrics", "Dashboard-style overview of the most important KPIs.", { visual: true }),
        s("revenue", "Revenue", "Revenue performance vs. plan — MRR, ARR, pipeline, churn.", { visual: true }),
        s("product", "Product", "Shipping velocity, roadmap progress, and key launches.", { visual: true }),
        s("customers", "Customers", "Acquisition, retention, NPS, and notable logos."),
        s("team", "Team", "Headcount, key hires, org changes, and culture health."),
        s("challenges", "Challenges", "What's not working and what you're doing about it."),
        s("priorities", "Priorities", "Top three to five focus areas for the next quarter."),
        s("discussion", "Discussion", "Open items, asks of the board, and decisions needed.", { required: true }),
      ];

    // Schema archetypes without specific blueprints in the spec — sensible defaults
    case "case_study":
      return [
        s("cover", "Cover", "Case study title, client name (or anonymized), and date.", { required: true }),
        s("challenge", "The Challenge", "What the client was struggling with before engaging you.", { visual: true }),
        s("context", "Context & Background", "Industry, company size, and why the problem mattered."),
        s("approach", "Our Approach", "How you tackled the challenge — methodology, tools, timeline.", { visual: true }),
        s("implementation", "Implementation", "Key phases of the work and what was delivered."),
        s("results", "Results", "Measurable outcomes — metrics, percentages, revenue impact.", { visual: true }),
        s("testimonial", "Client Testimonial", "A direct quote from the client about the experience."),
        s("bridge", "You Could See Similar Results", "Connect the case back to the reader's situation.", { required: true }),
      ];

    case "competitive_displacement":
      return [
        s("cover", "Cover", "Title, target company name, and date.", { required: true }),
        s("status_quo", "The Status Quo Cost", "What staying with their current solution is costing them — quantified.", { visual: true }),
        s("triggers", "Switching Triggers", "Market or internal changes that make now the right time to switch."),
        s("comparison", "Side-by-Side Comparison", "Honest feature and value comparison — your strengths vs. incumbent.", { visual: true }),
        s("migration", "Migration Ease", "How switching actually works — timeline, effort, and support.", { visual: true }),
        s("results", "Results After Switching", "Metrics from companies that made the move."),
        s("risk", "Risk Mitigation", "How you de-risk the transition — guarantees, pilots, rollback plans."),
        s("next_steps", "Next Steps", "Specific path to evaluate or pilot your solution.", { required: true }),
      ];

    case "thought_leadership":
      return [
        s("cover", "Cover", "Title, your name/brand, and date.", { required: true }),
        s("trend", "The Industry Shift", "A provocative trend or insight that demands attention.", { visual: true }),
        s("data", "The Data Behind It", "Evidence that backs up your thesis — charts, research, stats.", { visual: true }),
        s("implications", "What This Means", "How this shift affects your audience's business."),
        s("framework", "A Framework for Thinking About It", "Your unique perspective or mental model.", { visual: true }),
        s("approach", "How We Approach This", "Naturally position your solution as aligned with the shift."),
        s("examples", "Real-World Examples", "Companies or teams already adapting — and the results they see."),
        s("takeaway", "Key Takeaway & Next Steps", "What to do next — and how to go deeper.", { required: true }),
      ];

    case "product_launch":
      return [
        s("cover", "Cover", "Product name, launch tagline, and date.", { required: true }),
        s("whats_new", "What's New", "The headline feature or product — what changed and why it matters.", { visual: true }),
        s("who_its_for", "Who It's For", "Target audience and use cases — be specific."),
        s("how_it_works", "How It Works", "Walkthrough of the new experience or capability.", { visual: true }),
        s("key_features", "Key Features", "Three to five standout features with brief descriptions.", { visual: true }),
        s("comparison", "Before & After", "What the workflow looked like before vs. now."),
        s("availability", "Availability & Pricing", "When it's available, how to get it, and what it costs."),
        s("get_started", "Get Started", "CTA — sign up, upgrade, or learn more.", { required: true }),
      ];

    case "custom":
    default:
      return [
        s("cover", "Cover", "Title, your branding, and date.", { required: true }),
        s("context", "Context", "Set the scene — why this deck exists and what it's about."),
        s("challenge", "Challenge", "The core problem or opportunity you're addressing.", { visual: true }),
        s("approach", "Approach", "Your proposed solution, framework, or strategy.", { visual: true }),
        s("details", "Details", "Supporting information — features, data, or specifications."),
        s("evidence", "Evidence", "Proof points — case studies, metrics, or testimonials."),
        s("summary", "Summary", "Recap the key points and reinforce your message."),
        s("next_steps", "Next Steps", "Clear call to action and contact information.", { required: true }),
      ];
  }
}

/* ─── Sortable slide card ─── */

interface SortableSlideCardProps {
  slide: SlideBlueprint;
  index: number;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateDescription: (id: string, description: string) => void;
  onToggleVisual: (id: string) => void;
  onRemove: (id: string) => void;
}

function SortableSlideCard({
  slide,
  index,
  onUpdateTitle,
  onUpdateDescription,
  onToggleVisual,
  onRemove,
}: SortableSlideCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border bg-card transition-all",
        isDragging
          ? "shadow-lg ring-2 ring-primary/20 z-50 opacity-95"
          : "hover:shadow-sm",
        "border-border/50",
      )}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Drag handle + slide number */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-muted-foreground">
            {index + 1}
          </span>
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            aria-label={`Reorder slide ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </div>

        {/* Content — all slides editable */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={slide.title}
              onChange={(e) => onUpdateTitle(slide.id, e.target.value)}
              className="h-8 text-[14px] font-semibold border-transparent bg-transparent px-2 hover:border-border/60 hover:bg-muted/20 focus:border-border focus:bg-background transition-colors rounded-md"
              placeholder="Slide title..."
            />
            {slide.required && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Required
              </span>
            )}
          </div>
          <Textarea
            value={slide.description}
            onChange={(e) =>
              onUpdateDescription(slide.id, e.target.value)
            }
            className="min-h-[48px] resize-none text-[12px] leading-relaxed border-transparent bg-transparent px-2 hover:border-border/60 hover:bg-muted/20 focus:border-border focus:bg-background transition-colors rounded-md"
            placeholder="Describe what this slide should contain. This acts as a prompt for the AI — be specific about what info you want here."
            rows={2}
          />
        </div>

        {/* Visual toggle + remove */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition-colors",
              slide.includeVisual
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground/40",
            )}
          >
            <ImageIcon className="size-4" />
          </div>
          <Switch
            checked={slide.includeVisual}
            onCheckedChange={() => onToggleVisual(slide.id)}
            className="scale-75"
          />
          <span className="text-[9px] text-muted-foreground">
            {slide.includeVisual ? `+img` : "No img"}
          </span>

          {/* Remove button — not shown for required slides */}
          {!slide.required && (
            <button
              type="button"
              onClick={() => onRemove(slide.id)}
              className="mt-1 rounded p-1 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remove slide"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

export function StructureView() {
  const nextCustomIdRef = React.useRef(1);
  const [slides, setSlides] = React.useState<SlideBlueprint[]>([]);
  const [archetype, setArchetype] = React.useState<string>("cold_outreach");
  /** The archetype that the current slide list was generated from */
  const [slidesArchetype, setSlidesArchetype] = React.useState<string>("cold_outreach");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const archetypeChanged = archetype !== slidesArchetype;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Load questionnaire to get archetype
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/questionnaire");
        if (res.ok) {
          const data: Partial<QuestionnaireForm> = await res.json();
          const arch = data.archetype ?? "cold_outreach";
          setArchetype(arch);
          setSlidesArchetype(arch);
          setSlides(defaultSlideBlueprints(arch));
        } else {
          setSlides(defaultSlideBlueprints("cold_outreach"));
        }
      } catch {
        setSlides(defaultSlideBlueprints("cold_outreach"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Re-check archetype when the view becomes visible (user may have changed it)
  React.useEffect(() => {
    let aborted = false;

    function refreshArchetype() {
      fetch("/api/onboarding/questionnaire")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Partial<QuestionnaireForm> | null) => {
          if (!aborted && data?.archetype) setArchetype(data.archetype);
        })
        .catch(() => {});
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") refreshArchetype();
    }
    function handleHash() {
      if (window.location.hash === "#deck-structure") refreshArchetype();
    }
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("hashchange", handleHash);
    return () => {
      aborted = true;
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("hashchange", handleHash);
    };
  }, []);

  function resetSlidesToArchetype() {
    setSlides(defaultSlideBlueprints(archetype));
    setSlidesArchetype(archetype);
    toast.success(`Slides reset to ${archetypeLabel(archetype)} template.`);
  }

  /* ── Handlers ── */

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSlides((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleVisual(slideId: string) {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId ? { ...s, includeVisual: !s.includeVisual } : s,
      ),
    );
  }

  function updateTitle(slideId: string, title: string) {
    setSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, title } : s)),
    );
  }

  function updateDescription(slideId: string, description: string) {
    setSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, description } : s)),
    );
  }

  function removeSlide(slideId: string) {
    setSlides((prev) => prev.filter((s) => s.id !== slideId));
  }

  function addSlide() {
    const id = `custom_${nextCustomIdRef.current++}`;
    const newSlide: SlideBlueprint = {
      id,
      title: "New Slide",
      description: "",
      includeVisual: false,
      required: false,
    };
    // Insert before the last slide (Contact & Closing) if it exists
    setSlides((prev) => {
      if (prev.length === 0) return [newSlide];
      return [...prev.slice(0, -1), newSlide, prev[prev.length - 1]];
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const structureText = slides
        .map(
          (s, i) =>
            `Slide ${i + 1}: ${s.title} — ${s.description}${s.includeVisual ? " [include visual]" : ""}`,
        )
        .join("\n");

      // Preserve existing extraInstructions — only replace the SLIDE STRUCTURE block
      let existingInstructions = "";
      try {
        const qRes = await fetch("/api/onboarding/questionnaire");
        if (qRes.ok) {
          const qData = await qRes.json();
          existingInstructions = qData?.extraInstructions ?? "";
        }
      } catch {
        // proceed with empty
      }

      // Strip any prior SLIDE STRUCTURE block, then append the new one
      const withoutStructure = existingInstructions
        .replace(/\n?SLIDE STRUCTURE:\n[\s\S]*$/, "")
        .trim();
      const combined = withoutStructure
        ? `${withoutStructure}\n\nSLIDE STRUCTURE:\n${structureText}`
        : `SLIDE STRUCTURE:\n${structureText}`;

      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraInstructions: combined,
          desiredCardCount: slides.length,
        }),
      });
      if (res.ok) {
        toast.success("Deck structure saved.");
      } else {
        toast.error("Failed to save structure.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const visualCount = slides.filter((s) => s.includeVisual).length;
  const visualCreditCost = visualCount * VISUAL_CREDIT_COST;

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save structure
            </>
          )}
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Archetype indicator */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-5 py-3">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">Template:</span>
              <span className="font-semibold text-foreground">
                {archetypeLabel(slidesArchetype)}
              </span>
              <span className="text-muted-foreground">
                &middot; {slides.length} slides
              </span>
            </div>
            <a
              href="#run-settings"
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Change archetype &rarr;
            </a>
          </div>

          {/* Archetype changed notice */}
          {archetypeChanged && (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-50 px-5 py-3 dark:bg-amber-950/20">
              <p className="text-[13px] text-amber-800 dark:text-amber-200">
                Your archetype changed to <strong>{archetypeLabel(archetype)}</strong>. Reset slides to match?
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-500/40 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/40"
                onClick={resetSlidesToArchetype}
              >
                Reset slides
              </Button>
            </div>
          )}

          {/* Visual credit summary */}
          <div className="card-elevated rounded-xl border border-border/50 bg-card px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <ImageIcon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {visualCount} slide{visualCount !== 1 ? "s" : ""} with
                    visuals
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {VISUAL_CREDIT_COST} per visual &middot; {visualCreditCost}{" "}
                    total for visuals
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {slides.length}
                </p>
                <p className="text-[11px] text-muted-foreground">slides</p>
              </div>
            </div>
          </div>

          {/* Sortable slide list */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slides.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {slides.map((slide, index) => (
                  <SortableSlideCard
                    key={slide.id}
                    slide={slide}
                    index={index}
                    onUpdateTitle={updateTitle}
                    onUpdateDescription={updateDescription}
                    onToggleVisual={toggleVisual}
                    onRemove={removeSlide}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add slide button */}
          <button
            type="button"
            onClick={addSlide}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-4 text-[13px] font-medium text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <Plus className="size-4" />
            Add slide
          </button>

          {/* Bottom bar */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <p className="text-[13px] text-muted-foreground">
                {slides.length} slides &middot; {visualCount} visuals
                &middot; ~{(1 + visualCreditCost).toFixed(2)} cost/deck
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
              <Button
                onClick={() => {
                  handleSave();
                  window.location.hash = "target-intake";
                }}
              >
                Continue to Targets
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </ViewLayout>
  );
}
