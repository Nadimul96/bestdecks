"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Search,
  Send,
  Square,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, StatusPill } from "../view-layout";
import { DeckScoreBadge, DeckScoreDetail } from "@/components/deck-score-badge";
import {
  viewMeta,
  type RunSummary,
  type RunArtifactRecord,
  type RunDetail,
  type RunTargetRecord,
  type DeckScore,
} from "@/lib/workspace-types";
import { cn } from "@/lib/utils";

const meta = viewMeta.delivery;

/* ─────────────────────────────────────────────
   Deck card type — one card per target per run
   ───────────────────────────────────────────── */

interface DeckCard {
  targetId: string;
  runId: string;
  companyName: string;
  websiteUrl: string;
  status: string;
  format: string;
  createdAt: string;
  artifacts: RunArtifactRecord[];
  score?: DeckScore;
}

export function DeliveryView() {
  const [runs, setRuns] = React.useState<RunSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deckCards, setDeckCards] = React.useState<DeckCard[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<
    "all" | "completed" | "failed" | "pending"
  >("all");
  const [previewDeck, setPreviewDeck] = React.useState<DeckCard | null>(null);
  const [scoreDetailDeck, setScoreDetailDeck] = React.useState<DeckCard | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    fetchAllDecks();
  }, []);

  async function fetchAllDecks() {
    setLoading(true);
    try {
      const runsRes = await fetch("/api/runs");
      const runsData: RunSummary[] = await runsRes.json();
      if (!Array.isArray(runsData)) {
        setRuns([]);
        setDeckCards([]);
        setLoading(false);
        return;
      }
      setRuns(runsData);

      const relevantRuns = runsData.filter(
        (r) => r.status === "completed" || r.status === "partially_completed" || r.status === "running",
      );

      const cards: DeckCard[] = [];

      await Promise.all(
        relevantRuns.map(async (run) => {
          try {
            const detailRes = await fetch(`/api/runs/${run.id}`);
            const detail: RunDetail = await detailRes.json();

            const artifactsByTarget = new Map<string, RunArtifactRecord[]>();
            for (const artifact of detail.artifacts) {
              const key = artifact.target_id ?? "general";
              const list = artifactsByTarget.get(key) ?? [];
              list.push(artifact);
              artifactsByTarget.set(key, list);
            }

            for (const target of detail.targets) {
              cards.push({
                targetId: target.id,
                runId: run.id,
                companyName: target.company_name || "",
                websiteUrl: target.website_url,
                status: target.status,
                format: run.delivery_format,
                createdAt: target.created_at,
                artifacts: artifactsByTarget.get(target.id) ?? [],
                score: (target.status === "completed" || target.status === "delivered") ? generateMockScore(target) : undefined,
              });
            }
          } catch {
            // skip
          }
        }),
      );

      cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDeckCards(cards);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  const filteredDecks = deckCards.filter((deck) => {
    if (filterStatus !== "all" && deck.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return deck.companyName.toLowerCase().includes(q) || deck.websiteUrl.toLowerCase().includes(q);
    }
    return true;
  });

  // Selection helpers
  const selectableDecks = filteredDecks.filter(
    (d) => d.status === "completed" || d.status === "delivered",
  );
  const allSelected =
    selectableDecks.length > 0 &&
    selectableDecks.every((d) => selectedIds.has(d.targetId));

  function toggleSelect(targetId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableDecks.map((d) => d.targetId)));
    }
  }

  function handleBatchExport() {
    const selected = selectableDecks.filter((d) => selectedIds.has(d.targetId));
    // Open download/view URLs for each selected deck
    let downloadCount = 0;
    for (const deck of selected) {
      const downloadUrl = deck.artifacts.find(
        (a) => typeof a.artifact_json?.download_url === "string",
      )?.artifact_json?.download_url as string | undefined;
      const viewUrl = deck.artifacts.find(
        (a) => typeof a.artifact_json?.url === "string",
      )?.artifact_json?.url as string | undefined;
      const url = downloadUrl ?? viewUrl;
      if (url) {
        window.open(url, "_blank");
        downloadCount++;
      }
    }
    if (downloadCount > 0) {
      toast.success(`Opened ${downloadCount} deck${downloadCount > 1 ? "s" : ""} for download.`);
    } else {
      toast.error("No downloadable decks found in selection.");
    }
  }

  function handleBatchSend() {
    const selected = selectableDecks.filter((d) => selectedIds.has(d.targetId));
    toast.info(`Send ${selected.length} deck${selected.length > 1 ? "s" : ""} — coming soon! This will email decks directly to your contacts.`);
  }

  const completedCount = deckCards.filter((d) => d.status === "completed" || d.status === "delivered").length;
  const totalCount = deckCards.length;
  const scoredDecks = deckCards.filter((d) => d.score);
  const avgScore =
    scoredDecks.length > 0
      ? Math.round(scoredDecks.reduce((sum, d) => sum + (d.score?.overallScore ?? 0), 0) / scoredDecks.length)
      : 0;

  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      actions={
        <Button variant="outline" size="sm" onClick={fetchAllDecks} disabled={loading} className="gap-1.5">
          <RefreshCcw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Completed decks" value={completedCount} icon={CheckCircle2} accent="emerald" />
        <SummaryCard label="Total targets" value={totalCount} icon={FileText} accent="primary" />
        <SummaryCard label="Avg. quality score" value={avgScore} icon={Star} accent="amber" suffix="/100" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {(["all", "completed", "failed", "pending"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-all",
                filterStatus === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {status === "all"
                ? `All (${deckCards.length})`
                : `${status.charAt(0).toUpperCase() + status.slice(1)} (${deckCards.filter((d) => d.status === status).length})`}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by company..."
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Selection bar */}
      {selectableDecks.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-2.5">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-[13px] font-medium text-foreground hover:text-primary transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="size-4 text-primary" />
            ) : selectedIds.size > 0 ? (
              <CheckSquare className="size-4 text-primary/60" />
            ) : (
              <Square className="size-4 text-muted-foreground" />
            )}
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `Select all (${selectableDecks.length})`}
          </button>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleBatchExport}
              >
                <Download className="size-3" />
                Export ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleBatchSend}
              >
                <Send className="size-3" />
                Send ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Deck gallery grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredDecks.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-muted">
            <FileText className="size-6 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-medium text-foreground">
            {deckCards.length === 0 ? "No decks yet" : "No matching decks"}
          </p>
          <p className="mt-1 max-w-[300px] text-[12px] leading-relaxed text-muted-foreground">
            {deckCards.length === 0
              ? "Complete a run to see your generated decks here."
              : "Try adjusting your search or filter."}
          </p>
          {deckCards.length === 0 && (
            <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
              <a href="#target-intake">Launch a run</a>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks.map((deck) => (
            <DeckCardItem
              key={`${deck.runId}-${deck.targetId}`}
              deck={deck}
              selected={selectedIds.has(deck.targetId)}
              onToggleSelect={() => toggleSelect(deck.targetId)}
              onPreview={() => setPreviewDeck(deck)}
              onScoreClick={() => setScoreDetailDeck(deck)}
            />
          ))}
        </div>
      )}

      {/* Deck preview drawer */}
      {previewDeck && (
        <DeckPreviewDrawer
          deck={previewDeck}
          onClose={() => setPreviewDeck(null)}
          onScoreClick={() => setScoreDetailDeck(previewDeck)}
        />
      )}

      {/* Score detail overlay */}
      {scoreDetailDeck?.score && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg mx-4">
            <DeckScoreDetail deckScore={scoreDetailDeck.score} onClose={() => setScoreDetailDeck(null)} />
          </div>
        </div>
      )}
    </ViewLayout>
  );
}

/* ── Individual Deck Card ─────────────────── */

function DeckCardItem({
  deck,
  selected,
  onToggleSelect,
  onPreview,
  onScoreClick,
}: {
  deck: DeckCard;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onScoreClick: () => void;
}) {
  let displayName: string;
  try {
    displayName = deck.companyName || new URL(deck.websiteUrl.startsWith("http") ? deck.websiteUrl : `https://${deck.websiteUrl}`).hostname;
  } catch {
    displayName = deck.websiteUrl;
  }

  const isSelectable = deck.status === "completed" || deck.status === "delivered";

  return (
    <div className={cn(
      "card-elevated group rounded-xl border bg-card transition-all hover:border-border hover:shadow-md",
      selected ? "border-primary/40 bg-primary/[0.02] ring-1 ring-primary/20" : "border-border/50",
    )}>
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          {isSelectable ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted"
            >
              {selected ? (
                <CheckSquare className="size-5 text-primary" />
              ) : (
                <Square className="size-5 text-muted-foreground/50 group-hover:text-muted-foreground" />
              )}
            </button>
          ) : (
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-lg",
                deck.status === "failed" ? "bg-red-500/10" : "bg-muted",
              )}
            >
              {deck.status === "failed" ? (
                <AlertCircle className="size-4 text-red-500" />
              ) : (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{deck.websiteUrl}</p>
          </div>
        </div>
        {deck.score && <DeckScoreBadge score={deck.score.overallScore} onClick={onScoreClick} />}
      </div>

      <div className="flex items-center gap-3 border-t border-border/30 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="uppercase font-medium">{deck.format}</span>
        <span>&middot;</span>
        <span>{new Date(deck.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>&middot;</span>
        <StatusPill
          status={deck.status === "completed" ? "ready" : deck.status === "failed" ? "error" : "running"}
          label={deck.status}
        />
      </div>

      <div className="flex items-center gap-1.5 border-t border-border/30 px-3 py-2.5">
        {deck.status === "completed" && (
          <>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs flex-1" onClick={onPreview}>
              <Eye className="size-3" />
              Preview
            </Button>
            {deck.artifacts.some((a) => typeof a.artifact_json?.download_url === "string") && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs flex-1" asChild>
                <a
                  href={(deck.artifacts.find((a) => typeof a.artifact_json?.download_url === "string")?.artifact_json?.download_url as string) ?? "#"}
                  download
                >
                  <Download className="size-3" />
                  Download
                </a>
              </Button>
            )}
            {deck.artifacts.some((a) => typeof a.artifact_json?.url === "string") && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" asChild>
                <a
                  href={(deck.artifacts.find((a) => typeof a.artifact_json?.url === "string")?.artifact_json?.url as string) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            )}
          </>
        )}
        {deck.status === "failed" && (
          <p className="px-1 text-[11px] text-destructive">Generation failed — try again from Pipeline</p>
        )}
        {deck.status !== "completed" && deck.status !== "failed" && (
          <p className="px-1 text-[11px] text-muted-foreground">Generation in progress…</p>
        )}
      </div>
    </div>
  );
}

/* ── Deck Preview Drawer ──────────────────── */

function DeckPreviewDrawer({
  deck,
  onClose,
  onScoreClick,
}: {
  deck: DeckCard;
  onClose: () => void;
  onScoreClick: () => void;
}) {
  let displayName: string;
  try {
    displayName = deck.companyName || new URL(deck.websiteUrl.startsWith("http") ? deck.websiteUrl : `https://${deck.websiteUrl}`).hostname;
  } catch {
    displayName = deck.websiteUrl;
  }

  const viewUrl = deck.artifacts.find((a) => typeof a.artifact_json?.url === "string")?.artifact_json?.url as string | undefined;
  const downloadUrl = deck.artifacts.find((a) => typeof a.artifact_json?.download_url === "string")?.artifact_json?.download_url as string | undefined;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-slide-in-right flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
              <X className="size-4" />
            </Button>
            <div>
              <p className="text-[14px] font-semibold">{displayName}</p>
              <p className="text-[11px] text-muted-foreground">{deck.websiteUrl}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {deck.score && <DeckScoreBadge score={deck.score.overallScore} onClick={onScoreClick} />}
            {downloadUrl && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                <a href={downloadUrl} download>
                  <Download className="size-3" />
                  Download
                </a>
              </Button>
            )}
            {viewUrl && (
              <Button variant="default" size="sm" className="gap-1.5 text-xs" asChild>
                <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" />
                  Open
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {viewUrl ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/30">
                <iframe
                  src={viewUrl}
                  title={`Preview — ${displayName}`}
                  className="h-[600px] w-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
              <div className="space-y-2">
                <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">Artifacts</p>
                {deck.artifacts.map((artifact) => (
                  <div key={artifact.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-card px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span className="text-[12px] font-medium capitalize">{artifact.artifact_type.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{new Date(artifact.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-muted">
                <Eye className="size-6 text-muted-foreground/60" />
              </div>
              <p className="text-[14px] font-medium">No preview available</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {downloadUrl ? "This deck can be downloaded but doesn\u2019t have an online preview." : "Artifacts are still being generated."}
              </p>
            </div>
          )}
        </div>

        {deck.score && (
          <div className="border-t border-border/40 px-6 py-3">
            <button
              type="button"
              onClick={onScoreClick}
              className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-2.5">
                <Star className="size-3.5 text-amber-500 fill-amber-500" />
                <span className="text-[12px] font-medium">Quality Score: {deck.score.overallScore}/100</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>View breakdown</span>
                <ChevronRight className="size-3" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Summary Card ─────────────────────────── */

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "primary" | "amber";
  suffix?: string;
}) {
  const accentStyles = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    primary: "bg-primary/10 text-primary dark:bg-primary/20",
    amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  };

  return (
    <div className="card-elevated rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center gap-3">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", accentStyles[accent])}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {value}
            {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Mock score (dev only — production uses /api/decks/{id}/score) ── */

function generateMockScore(target: RunTargetRecord): DeckScore {
  const hash = target.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = 55 + (hash % 40);

  return {
    deckId: target.id,
    overallScore: base,
    breakdown: {
      relevance: Math.min(100, base + ((hash * 3) % 15) - 5),
      completeness: Math.min(100, base + ((hash * 7) % 15) - 5),
      persuasion: Math.min(100, base + ((hash * 11) % 15) - 5),
      visualQuality: Math.min(100, base + ((hash * 13) % 15) - 5),
      personalization: Math.min(100, base + ((hash * 17) % 15) - 5),
    },
    feedback:
      base < 80
        ? [
            "Add a case study relevant to the target\u2019s industry",
            "Include specific pricing or ROI metrics",
            "Strengthen the call-to-action with a concrete next step",
          ]
        : ["Deck is well-tailored and ready to send"],
    infoRequests:
      base < 70
        ? [
            { field: "proofPoints", question: "Do you have case studies in their industry?", priority: "high" as const, businessId: "" },
            { field: "constraintsText", question: "Any pricing details to include?", priority: "medium" as const, businessId: "" },
          ]
        : [],
    scoredAt: new Date().toISOString(),
  };
}
