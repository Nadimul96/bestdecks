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
import { viewMeta, type QuestionnaireForm } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["deck-structure"];

/* ─── Types ─── */

interface SlideBlueprint {
  id: string;
  title: string;
  description: string;
  includeVisual: boolean;
  required: boolean; // required slides can still be edited, just not removed
}

/* ─── Defaults ─── */

function defaultSlideBlueprints(archetype: string): SlideBlueprint[] {
  const base: SlideBlueprint[] = [
    {
      id: "cover",
      title: "Cover Slide",
      description:
        "Title, subtitle with the target company name, your logo, and date.",
      includeVisual: false,
      required: true,
    },
    {
      id: "about_target",
      title: "About [Target Company]",
      description:
        "Company overview, industry context, size, and recent developments gathered from web research.",
      includeVisual: true,
      required: false,
    },
    {
      id: "challenges",
      title: "Key Challenges",
      description:
        "Pain points and challenges specific to the target company and their industry.",
      includeVisual: true,
      required: false,
    },
    {
      id: "solution_fit",
      title: "How We Help",
      description:
        "Your solution mapped directly to their specific challenges. Concrete value propositions, not generic claims.",
      includeVisual: true,
      required: false,
    },
    {
      id: "proof",
      title: "Proof & Results",
      description:
        "Case studies, testimonials, or metrics from similar clients in their industry.",
      includeVisual: false,
      required: false,
    },
  ];

  if (archetype === "cold_outreach" || archetype === "warm_intro") {
    base.push({
      id: "why_now",
      title: "Why Now?",
      description:
        "Timely triggers — market shifts, seasonal demand, or recent company events that make this the right moment.",
      includeVisual: false,
      required: false,
    });
  }

  if (archetype === "agency_proposal") {
    base.push({
      id: "scope",
      title: "Proposed Scope & Timeline",
      description:
        "What you'll deliver, key milestones, and expected timeline.",
      includeVisual: false,
      required: false,
    });
    base.push({
      id: "investment",
      title: "Investment",
      description:
        "Pricing tiers or ranges, what's included, ROI projection.",
      includeVisual: false,
      required: false,
    });
  }

  if (archetype === "investor_pitch") {
    base.push({
      id: "traction",
      title: "Traction & Metrics",
      description:
        "Key growth metrics, revenue, user numbers, partnerships.",
      includeVisual: true,
      required: false,
    });
    base.push({
      id: "ask",
      title: "The Ask",
      description:
        "Funding amount, use of funds, and what you're looking for in an investor.",
      includeVisual: false,
      required: false,
    });
  }

  base.push({
    id: "next_steps",
    title: "Next Steps",
    description:
      "Clear call to action — what you want them to do next and how to get started.",
    includeVisual: false,
    required: false,
  });

  base.push({
    id: "closing",
    title: "Contact & Closing",
    description:
      "Your contact details, website, social links, and a closing message.",
    includeVisual: false,
    required: true,
  });

  return base;
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
              className="h-8 text-[14px] font-semibold border-transparent bg-transparent px-1 hover:border-border focus:border-border focus:bg-background transition-colors"
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
            className="min-h-[48px] resize-none text-[12px] leading-relaxed border-transparent bg-transparent px-1 hover:border-border focus:border-border focus:bg-background transition-colors"
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
            {slide.includeVisual ? "0.25 cr" : "No img"}
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

let nextCustomId = 1;

export function StructureView() {
  const [slides, setSlides] = React.useState<SlideBlueprint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

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
    const id = `custom_${nextCustomId++}`;
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

      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraInstructions: `SLIDE STRUCTURE:\n${structureText}`,
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
                    {visualCount} slide{visualCount !== 1 ? "s" : ""} with
                    visuals
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Each visual costs 0.25 credits ({visualCreditCost}{" "}
                    credits total for visuals)
                  </p>
                </div>
              </div>
              <p className="text-[13px] font-semibold text-foreground">
                {slides.length} slides total
              </p>
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-4 text-[13px] font-medium text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="size-4" />
            Add slide
          </button>

          {/* Bottom bar */}
          <div className="sticky bottom-0 -mx-1 flex items-center justify-between rounded-xl border border-border/50 bg-card/95 px-6 py-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <p className="text-[13px] text-muted-foreground">
                {slides.length} slides &middot; {visualCount} visuals
                &middot; ~{(1 + visualCreditCost).toFixed(2)} credits/deck
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
