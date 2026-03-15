"use client";

import * as React from "react";
import {
  AlertTriangle,
  ChevronRight,
  Lightbulb,
  Star,
  TrendingUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DeckScore } from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
   Score Badge — shown on deck cards
   ───────────────────────────────────────────── */

export function DeckScoreBadge({
  score,
  onClick,
}: {
  score: number;
  onClick?: () => void;
}) {
  const color =
    score >= 80
      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
      : score >= 50
        ? "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset tabular-nums transition-all hover:scale-105",
        color,
      )}
    >
      <Star className="size-3 fill-current" />
      {score}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Score Detail Modal — radar breakdown + feedback
   ───────────────────────────────────────────── */

export function DeckScoreDetail({
  deckScore,
  onClose,
}: {
  deckScore: DeckScore;
  onClose: () => void;
}) {
  const categories = [
    { key: "relevance", label: "Relevance", value: deckScore.breakdown.relevance },
    { key: "completeness", label: "Completeness", value: deckScore.breakdown.completeness },
    { key: "persuasion", label: "Persuasion", value: deckScore.breakdown.persuasion },
    { key: "visualQuality", label: "Visual Quality", value: deckScore.breakdown.visualQuality },
    { key: "personalization", label: "Personalization", value: deckScore.breakdown.personalization },
  ];

  return (
    <div className="animate-scale-in space-y-5 rounded-xl border border-border/50 bg-card p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-xl text-xl font-bold",
              deckScore.overallScore >= 80
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : deckScore.overallScore >= 50
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400",
            )}
          >
            {deckScore.overallScore}
          </div>
          <div>
            <p className="text-[15px] font-semibold">Deck Quality Score</p>
            <p className="text-[12px] text-muted-foreground">
              {deckScore.overallScore >= 80
                ? "Great — ready to send"
                : deckScore.overallScore >= 50
                  ? "Good — could be improved"
                  : "Needs work — see suggestions below"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Score breakdown — horizontal bar chart */}
      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.key} className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-foreground">{cat.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {cat.value}/100
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  cat.value >= 80
                    ? "bg-emerald-500"
                    : cat.value >= 50
                      ? "bg-amber-500"
                      : "bg-red-500",
                )}
                style={{ width: `${cat.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* AI Feedback */}
      {deckScore.feedback.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <Lightbulb className="size-3.5 text-amber-500" />
            Suggestions
          </div>
          <ul className="space-y-1.5 pl-5">
            {deckScore.feedback.map((item, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed text-muted-foreground list-disc"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info requests */}
      {deckScore.infoRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <AlertTriangle className="size-3.5 text-amber-500" />
            More info needed to improve this score
          </div>
          <div className="space-y-1.5">
            {deckScore.infoRequests.map((req, i) => (
              <a
                key={i}
                href="#seller-context"
                className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[12px] transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      req.priority === "high"
                        ? "bg-red-500"
                        : req.priority === "medium"
                          ? "bg-amber-500"
                          : "bg-blue-500",
                    )}
                  />
                  <span className="text-foreground">{req.question}</span>
                </div>
                <ChevronRight className="size-3 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
