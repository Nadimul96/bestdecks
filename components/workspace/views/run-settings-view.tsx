"use client";

import * as React from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import {
  viewMeta,
  defaultQuestionnaire,
  archetypeOptions,
  outputFormatOptions,
  toneOptions,
  visualStyleOptions,
  imagePolicyOptions,
  type QuestionnaireForm,
} from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["run-settings"];

function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div
      className={cn("grid gap-3", {
        "sm:grid-cols-2": columns === 2,
        "sm:grid-cols-3": columns === 3,
        "sm:grid-cols-5": columns === 5,
      })}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-xl border p-4 text-left transition-all",
            value === opt.value
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "border-border/60 bg-card hover:border-border",
          )}
        >
          <p className="text-sm font-medium text-foreground">{opt.label}</p>
          {opt.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {opt.description}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function ChipGrid<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function RunSettingsView() {
  const [form, setForm] = React.useState<QuestionnaireForm>(
    defaultQuestionnaire(),
  );
  const [saving, setSaving] = React.useState(false);

  function update<K extends keyof QuestionnaireForm>(
    field: K,
    value: QuestionnaireForm[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Run settings saved.");
      } else {
        toast.error("Failed to save settings. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

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
              Saving…
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save settings
            </>
          )}
        </Button>
      }
    >
      {/* Archetype */}
      <SectionCard
        title="Deck archetype"
        description="Choose the primary framing for your outreach decks."
      >
        <OptionGrid
          options={archetypeOptions}
          value={form.archetype}
          onChange={(v) => update("archetype", v)}
          columns={3}
        />
      </SectionCard>

      {/* Audience & objective */}
      <SectionCard
        title="Audience & objective"
        description="Who are these decks for, and what should they achieve?"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldGroup label="Target audience">
            <Input
              value={form.audience}
              onChange={(e) => update("audience", e.target.value)}
              placeholder="VP of Marketing at mid-market SaaS"
              className="h-10"
            />
          </FieldGroup>
          <FieldGroup label="Objective">
            <Input
              value={form.objective}
              onChange={(e) => update("objective", e.target.value)}
              placeholder="Get a discovery call booked"
              className="h-10"
            />
          </FieldGroup>
          <FieldGroup label="Call to action" className="sm:col-span-2">
            <Input
              value={form.callToAction}
              onChange={(e) => update("callToAction", e.target.value)}
              placeholder="Book a 20-minute call this week"
              className="h-10"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      {/* Style */}
      <SectionCard
        title="Style & format"
        description="Control the visual feel and output format."
      >
        <div className="space-y-6">
          <FieldGroup label="Output format">
            <OptionGrid
              options={outputFormatOptions}
              value={form.outputFormat}
              onChange={(v) => update("outputFormat", v)}
              columns={3}
            />
          </FieldGroup>

          <FieldGroup label="Tone">
            <ChipGrid
              options={toneOptions}
              value={form.tone}
              onChange={(v) => update("tone", v)}
            />
          </FieldGroup>

          <FieldGroup label="Visual style">
            <ChipGrid
              options={visualStyleOptions}
              value={form.visualStyle}
              onChange={(v) => update("visualStyle", v)}
            />
          </FieldGroup>

          <div className="flex items-center gap-4">
            <FieldGroup label="Image policy">
              <ChipGrid
                options={imagePolicyOptions}
                value={form.imagePolicy}
                onChange={(v) => update("imagePolicy", v)}
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Desired slide count" hint="Typical: 6-12">
            <Input
              type="number"
              value={form.desiredCardCount}
              onChange={(e) => update("desiredCardCount", e.target.value)}
              placeholder="8"
              className="h-10 w-24"
            />
          </FieldGroup>
        </div>
      </SectionCard>

      {/* Advanced */}
      <SectionCard
        title="Advanced"
        description="Fine-tune content rules and review gates."
      >
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FieldGroup label="Must include" hint="Topics or phrases to always cover">
              <Textarea
                value={form.mustIncludeText}
                onChange={(e) => update("mustIncludeText", e.target.value)}
                placeholder="ROI metrics, customer success story"
                className="min-h-[80px] resize-none"
              />
            </FieldGroup>
            <FieldGroup label="Must avoid" hint="Topics or phrases to never use">
              <Textarea
                value={form.mustAvoidText}
                onChange={(e) => update("mustAvoidText", e.target.value)}
                placeholder="Competitor names, aggressive pricing claims"
                className="min-h-[80px] resize-none"
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Extra instructions">
            <Textarea
              value={form.extraInstructions}
              onChange={(e) => update("extraInstructions", e.target.value)}
              placeholder="Any additional guidance for the AI when generating decks…"
              className="min-h-[80px] resize-none"
            />
          </FieldGroup>

          <div className="flex items-center gap-8 rounded-lg border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Switch
                id="review-gate"
                checked={form.optionalReview}
                onCheckedChange={(c) =>
                  update("optionalReview", c as boolean)
                }
              />
              <Label htmlFor="review-gate" className="cursor-pointer">
                <p className="text-sm font-medium">Review gate</p>
                <p className="text-xs text-muted-foreground">
                  Pause before delivery for manual review
                </p>
              </Label>
            </div>
          </div>
        </div>
      </SectionCard>
    </ViewLayout>
  );
}
