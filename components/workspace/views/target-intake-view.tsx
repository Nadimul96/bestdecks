"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ViewLayout, SectionCard, FieldGroup } from "../view-layout";
import { viewMeta, type Notice } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta["target-intake"];

const targetExamples = `https://acmeplumbing.com
https://northshoreclinic.com
https://sunsetlogistics.io`;

const contactExamples = `websiteUrl,firstName,lastName,role,email
https://acmeplumbing.com,Sarah,Lee,Founder,sarah@acmeplumbing.com
https://northshoreclinic.com,Marcus,Reed,Director,marcus@northshoreclinic.com`;

export function TargetIntakeView() {
  const [websitesText, setWebsitesText] = React.useState("");
  const [contactsCsvText, setContactsCsvText] = React.useState("");
  const [showCsv, setShowCsv] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const websiteCount = websitesText
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  async function handleSubmit() {
    if (websiteCount === 0) {
      setNotice({ type: "error", message: "Add at least one target URL." });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websitesText,
          contactsCsvText: contactsCsvText || undefined,
        }),
      });

      if (res.ok) {
        setNotice({
          type: "success",
          message: `Run created with ${websiteCount} target${websiteCount > 1 ? "s" : ""}. View it in Pipeline.`,
        });
        toast.success(
          `Run launched with ${websiteCount} target${websiteCount > 1 ? "s" : ""}.`,
        );
        setWebsitesText("");
        setContactsCsvText("");
      } else {
        const err = await res.json().catch(() => ({}));
        setNotice({
          type: "error",
          message: err.error ?? "Failed to create run.",
        });
        toast.error(err.error ?? "Failed to create run.");
      }
    } catch {
      setNotice({ type: "error", message: "Network error." });
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button
          onClick={handleSubmit}
          disabled={submitting || websiteCount === 0}
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Creating run…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Launch run
              {websiteCount > 0 && (
                <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
                  {websiteCount}
                </span>
              )}
            </>
          )}
        </Button>
      }
    >
      {/* Notice */}
      {notice && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm animate-fade-in",
            notice.type === "success" &&
              "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
            notice.type === "error" &&
              "border-destructive/20 bg-destructive/5 text-destructive",
            notice.type === "info" &&
              "border-primary/20 bg-primary/5 text-primary",
          )}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          {notice.message}
        </div>
      )}

      {/* Websites — primary input */}
      <SectionCard
        title="Target websites"
        description="Paste one URL per line. These are the companies you want personalized decks for."
      >
        <FieldGroup
          label="Website URLs"
          hint={
            websiteCount > 0
              ? `${websiteCount} target${websiteCount > 1 ? "s" : ""}`
              : "Required"
          }
        >
          <Textarea
            value={websitesText}
            onChange={(e) => setWebsitesText(e.target.value)}
            placeholder={targetExamples}
            className="min-h-[160px] resize-none font-mono text-xs leading-relaxed"
          />
        </FieldGroup>
      </SectionCard>

      {/* CSV — collapsible advanced section */}
      <div className="rounded-xl border border-border/40 bg-card">
        <button
          type="button"
          onClick={() => setShowCsv(!showCsv)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <div>
            <p className="text-sm font-medium text-foreground">
              Have a CSV with contacts?
            </p>
            <p className="text-xs text-muted-foreground">
              Optional — personalizes greetings and CTAs per person
            </p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              showCsv && "rotate-180",
            )}
          />
        </button>

        {showCsv && (
          <div className="border-t border-border/40 px-5 py-4">
            <FieldGroup label="Contacts CSV" hint="Optional">
              <Textarea
                value={contactsCsvText}
                onChange={(e) => setContactsCsvText(e.target.value)}
                placeholder={contactExamples}
                className="min-h-[140px] resize-none font-mono text-xs leading-relaxed"
              />
            </FieldGroup>
            <p className="mt-3 text-xs text-muted-foreground">
              Columns:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                websiteUrl, firstName, lastName, role, email, campaignGoal,
                notes
              </code>
            </p>
          </div>
        )}
      </div>
    </ViewLayout>
  );
}
