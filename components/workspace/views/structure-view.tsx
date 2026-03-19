"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  GripVertical,
  ImageIcon,
  LoaderCircle,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ViewLayout, SectionCard } from "../view-layout";
import { viewMeta, type QuestionnaireForm } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["deck-structure"];

/* ─── Default slide blueprint ─── */

interface SlideBlueprint {
  id: string;
  title: string;
  description: string;
  includeVisual: boolean;
  locked: boolean; // cover + closing are always present
}

function defaultSlideBlueprints(archetype: string): SlideBlueprint[] {
  const base: SlideBlueprint[] = [
    {
      id: "cover",
      title: "Cover Slide",
      description: "Title, subtitle with the target company name, your logo, and date.",
      includeVisual: false,
      locked: true,
    },
    {
      id: "about_target",
      title: "About [Target Company]",
      description: "Company overview, industry context, size, and recent developments gathered from web research.",
      includeVisual: true,
      locked: false,
    },
    {
      id: "challenges",
      title: "Key Challenges",
      description: "Pain points and challenges specific to the target company and their industry.",
      includeVisual: true,
      locked: false,
    },
    {
      id: "solution_fit",
      title: "How We Help",
      description: "Your solution mapped directly to their specific challenges. Concrete value propositions, not generic claims.",
      includeVisual: true,
      locked: false,
    },
    {
      id: "proof",
      title: "Proof & Results",
      description: "Case studies, testimonials, or metrics from similar clients in their industry.",
      includeVisual: false,
      locked: false,
    },
  ];

  if (archetype === "cold_outreach" || archetype === "warm_intro") {
    base.push({
      id: "why_now",
      title: "Why Now?",
      description: "Timely triggers — market shifts, seasonal demand, or recent company events that make this the right moment.",
      includeVisual: false,
      locked: false,
    });
  }

  if (archetype === "agency_proposal") {
    base.push({
      id: "scope",
      title: "Proposed Scope & Timeline",
      description: "What you'll deliver, key milestones, and expected timeline.",
      includeVisual: false,
      locked: false,
    });
    base.push({
      id: "investment",
      title: "Investment",
      description: "Pricing tiers or ranges, what's included, ROI projection.",
      includeVisual: false,
      locked: false,
    });
  }

  if (archetype === "investor_pitch") {
    base.push({
      id: "traction",
      title: "Traction & Metrics",
      description: "Key growth metrics, revenue, user numbers, partnerships.",
      includeVisual: true,
      locked: false,
    });
    base.push({
      id: "ask",
      title: "The Ask",
      description: "Funding amount, use of funds, and what you're looking for in an investor.",
      includeVisual: false,
      locked: false,
    });
  }

  base.push({
    id: "next_steps",
    title: "Next Steps",
    description: "Clear call to action — what you want them to do next and how to get started.",
    includeVisual: false,
    locked: false,
  });

  base.push({
    id: "closing",
    title: "Contact & Closing",
    description: "Your contact details, website, social links, and a closing message.",
    includeVisual: false,
    locked: true,
  });

  return base;
}

export function StructureView() {
  const [slides, setSlides] = React.useState<SlideBlueprint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [archetype, setArchetype] = React.useState("cold_outreach");

  // Load questionnaire to get archetype
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/questionnaire");
        if (res.ok) {
          const data: Partial<QuestionnaireForm> = await res.json();
          const arch = data.archetype ?? "cold_outreach";
          setArchetype(arch);
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

  function toggleVisual(slideId: string) {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId ? { ...s, includeVisual: !s.includeVisual } : s,
      ),
    );
  }

  function updateDescription(slideId: string, description: string) {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId ? { ...s, description } : s,
      ),
    );
  }

  function removeSlide(slideId: string) {
    setSlides((prev) => prev.filter((s) => s.id !== slideId));
  }

  async function handleSave() {
    setSaving(true);
    // Save as extra instructions in the questionnaire
    try {
      const structureText = slides
        .map((s, i) => `Slide ${i + 1}: ${s.title} — ${s.description}${s.includeVisual ? " [include visual]" : ""}`)
        .join("\n");

      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraInstructions: `SLIDE STRUCTURE:\n${structureText}`,
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
  const visualCreditCost = visualCount * 0.25;

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
          {/* Visual credit summary */}
          <div className="rounded-lg border border-border/50 bg-muted/30 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <ImageIcon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    {visualCount} slide{visualCount !== 1 ? "s" : ""} with visuals
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Each visual costs 0.25 credits ({visualCreditCost} credits total for visuals)
                  </p>
                </div>
              </div>
              <p className="text-[13px] font-semibold text-foreground">
                {slides.length} slides total
              </p>
            </div>
          </div>

          {/* Slide list */}
          <div className="space-y-3">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={cn(
                  "group rounded-xl border bg-card transition-all hover:shadow-sm",
                  slide.locked
                    ? "border-border/30 bg-muted/20"
                    : "border-border/50",
                )}
              >
                <div className="flex items-start gap-4 p-4">
                  {/* Slide number */}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    {!slide.locked && (
                      <GripVertical className="size-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-foreground">
                        {slide.title}
                      </h3>
                      {slide.locked && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Required
                        </span>
                      )}
                    </div>
                    {slide.locked ? (
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        {slide.description}
                      </p>
                    ) : (
                      <Textarea
                        value={slide.description}
                        onChange={(e) => updateDescription(slide.id, e.target.value)}
                        className="min-h-[48px] resize-none text-[12px] leading-relaxed"
                        rows={2}
                      />
                    )}
                  </div>

                  {/* Visual toggle */}
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
                      onCheckedChange={() => toggleVisual(slide.id)}
                      className="scale-75"
                    />
                    <span className="text-[9px] text-muted-foreground">
                      {slide.includeVisual ? "0.25 cr" : "No img"}
                    </span>
                  </div>
                </div>

                {/* Remove button */}
                {!slide.locked && (
                  <div className="border-t border-border/20 px-4 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => removeSlide(slide.id)}
                      className="text-[11px] text-destructive/70 hover:text-destructive"
                    >
                      Remove slide
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="sticky bottom-0 -mx-1 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <p className="text-[13px] text-muted-foreground">
                {slides.length} slides &middot; {visualCount} visuals &middot; ~{(1 + visualCreditCost).toFixed(2)} credits/deck
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
              <Button onClick={() => { handleSave(); window.location.hash = "target-intake"; }}>
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
