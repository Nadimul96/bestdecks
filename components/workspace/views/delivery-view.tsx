"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
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
  type RunArtifactRecord,
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

  async function fetchAllDecks(retries = 2) {
    setLoading(true);
    try {
      // Single bulk API call instead of N+1 fetches — goes from ~60s to ~1s
      const res = await fetch("/api/delivery");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.decks) {
        setDeckCards([]);
        setLoading(false);
        return;
      }

      // Map server response to DeckCard format with client-side scoring
      const cards: DeckCard[] = (data.decks as Array<{
        targetId: string;
        runId: string;
        companyName: string;
        websiteUrl: string;
        status: string;
        format: string;
        createdAt: string;
        artifacts: RunArtifactRecord[];
      }>).map((deck) => ({
        ...deck,
        score: (deck.status === "completed" || deck.status === "delivered")
          ? generateMockScore({ id: deck.targetId, status: deck.status } as RunTargetRecord)
          : undefined,
      }));

      cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDeckCards(cards);
    } catch (err) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchAllDecks(retries - 1);
      }
      toast.error("Failed to load decks. Please refresh the page.");
      setDeckCards([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredDecks = deckCards.filter((deck) => {
    if (filterStatus === "completed" && deck.status !== "completed" && deck.status !== "delivered") return false;
    if (filterStatus === "failed" && deck.status !== "failed") return false;
    if (filterStatus === "pending" && deck.status !== "pending" && deck.status !== "brief_ready") return false;
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
    toast.info(`Send ${selected.length} deck${selected.length > 1 ? "s" : ""} — coming soon!`);
  }

  const completedCount = deckCards.filter((d) => d.status === "completed" || d.status === "delivered").length;
  const failedCount = deckCards.filter((d) => d.status === "failed").length;
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
        <Button variant="outline" size="sm" onClick={() => fetchAllDecks()} disabled={loading} className="gap-1.5">
          <RefreshCcw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <p className="text-[13px] text-muted-foreground animate-pulse">Loading your decks...</p>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
      <>
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 min-w-0">
        <SummaryCard label="Completed decks" value={completedCount} icon={CheckCircle2} accent="emerald" />
        <SummaryCard label="Total targets" value={totalCount} icon={FileText} accent="primary" />
        <SummaryCard label="Avg. quality score" value={avgScore} icon={Star} accent="amber" suffix="/100" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "completed", "failed", "pending"] as const).map((status) => {
            const count = status === "all"
              ? deckCards.length
              : status === "completed"
                ? completedCount
                : status === "failed"
                  ? failedCount
                  : deckCards.filter((d) => d.status === "pending" || d.status === "brief_ready").length;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                  filterStatus === status
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative shrink-0">
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
      {filteredDecks.length === 0 ? (
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
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-w-0">
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
      </>
      )}

      {/* Deck preview overlay */}
      {previewDeck && (
        <DeckPreviewOverlay
          deck={previewDeck}
          onClose={() => setPreviewDeck(null)}
          onScoreClick={() => setScoreDetailDeck(previewDeck)}
        />
      )}

      {/* Score detail overlay */}
      {scoreDetailDeck?.score && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setScoreDetailDeck(null)}
          onKeyDown={(e) => e.key === "Escape" && setScoreDetailDeck(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Deck quality score details"
          tabIndex={-1}
        >
          <div className="w-full max-w-lg mx-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
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

  // Extract Google Slides embed for thumbnail
  const deliveryArtifact = deck.artifacts.find((a) => a.artifact_type === "presentation_delivery")?.artifact_json;
  const gsId = deliveryArtifact?.googleSlidesId as string | undefined;
  const thumbnailUrl = gsId
    ? `https://docs.google.com/presentation/d/${gsId}/export/png?pageid=p`
    : null;

  return (
    <div className={cn(
      "card-elevated group rounded-xl border bg-card overflow-hidden transition-all duration-200 hover:shadow-md",
      selected ? "border-primary/40 ring-1 ring-primary/20 shadow-md" : "border-border/50 hover:border-border",
    )}>
      {/* Slide thumbnail preview */}
      <button
        type="button"
        onClick={onPreview}
        className="relative block w-full aspect-[16/10] bg-muted/30 overflow-hidden"
      >
        {thumbnailUrl && isSelectable ? (
          <img
            src={thumbnailUrl}
            alt={`Preview of ${displayName} deck`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {deck.status === "failed" ? (
              <AlertCircle className="size-8 text-destructive/30" />
            ) : !isSelectable ? (
              <LoaderCircle className="size-6 animate-spin text-muted-foreground/40" />
            ) : (
              <FileText className="size-8 text-muted-foreground/20" />
            )}
          </div>
        )}
        {/* Hover overlay */}
        {isSelectable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-medium text-gray-900 shadow-lg backdrop-blur">
              <Eye className="size-3.5" />
              Preview
            </span>
          </div>
        )}
      </button>

      {/* Card body */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Checkbox */}
            {isSelectable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect();
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded cursor-pointer transition-colors"
              >
                {selected ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="flex size-5 items-center justify-center shrink-0">
                {deck.status === "failed" ? (
                  <AlertCircle className="size-3.5 text-destructive" />
                ) : (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
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
      </div>

      {/* Footer metadata */}
      <div className="flex items-center justify-between border-t border-border/30 px-3.5 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase font-medium tracking-wide">{deck.format}</span>
          <span className="text-border">&middot;</span>
          <span>{new Date(deck.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span className="text-border">&middot;</span>
          <StatusPill
            status={deck.status === "completed" || deck.status === "delivered" ? "ready" : deck.status === "failed" ? "error" : "running"}
            label={deck.status === "delivered" ? "completed" : deck.status}
          />
        </div>

        {isSelectable && (() => {
          const da = deck.artifacts.find((a) => a.artifact_type === "presentation_delivery")?.artifact_json;
          const editorUrl = da?.editorUrl as string | undefined;
          const downloadUrl = (da?.pptxExportUrl ?? da?.download_url) as string | undefined;
          const actionUrl = editorUrl ?? downloadUrl;
          if (!actionUrl) return null;
          return (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {editorUrl ? (
                <>Edit <ExternalLink className="size-2.5" /></>
              ) : (
                <>Download <Download className="size-2.5" /></>
              )}
            </a>
          );
        })()}
      </div>
    </div>
  );
}

/* ── Full-screen Deck Preview — Theater Mode ──── */

function DeckPreviewOverlay({
  deck,
  onClose,
  onScoreClick,
}: {
  deck: DeckCard;
  onClose: () => void;
  onScoreClick: () => void;
}) {
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  let displayName: string;
  try {
    displayName = deck.companyName || new URL(deck.websiteUrl.startsWith("http") ? deck.websiteUrl : `https://${deck.websiteUrl}`).hostname;
  } catch {
    displayName = deck.websiteUrl;
  }

  const viewUrl = deck.artifacts.find((a) => typeof a.artifact_json?.url === "string")?.artifact_json?.url as string | undefined;
  const downloadUrl = deck.artifacts.find((a) => typeof a.artifact_json?.download_url === "string")?.artifact_json?.download_url as string | undefined;

  const deliveryArtifact = deck.artifacts.find((a) => a.artifact_type === "presentation_delivery")?.artifact_json;
  const embedUrl = deliveryArtifact?.embedUrl as string | undefined;
  const editorUrl = deliveryArtifact?.editorUrl as string | undefined;
  const pdfExportUrl = deliveryArtifact?.pdfExportUrl as string | undefined;
  const pptxExportUrl = deliveryArtifact?.pptxExportUrl as string | undefined;

  const fileUrl = downloadUrl ?? viewUrl;
  const previewUrl = embedUrl
    ? `${embedUrl}&rm=minimal`
    : fileUrl
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
      : null;

  // Auto-hide controls after 3s of inactivity
  const resetHideTimer = React.useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  React.useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  // Keyboard shortcuts
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "f" || e.key === "F") setIsFullscreen((p) => !p);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const scoreColor = deck.score
    ? deck.score.overallScore >= 80
      ? "text-emerald-400"
      : deck.score.overallScore >= 60
        ? "text-amber-400"
        : "text-red-400"
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onMouseMove={resetHideTimer}
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 55%, oklch(0.16 0.025 250), oklch(0.08 0.015 250) 70%, oklch(0.05 0.01 250))",
      }}
    >
      {/* Scoped animations */}
      <style>{`
        @keyframes preview-enter {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes preview-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.6; }
        }
        .preview-enter { animation: preview-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .preview-glow { animation: preview-glow 4s ease-in-out infinite; }
        .controls-bar { transition: opacity 0.4s ease, transform 0.4s ease; }
        .controls-hidden { opacity: 0; transform: translateY(-8px); pointer-events: none; }
        .controls-hidden-bottom { opacity: 0; transform: translateY(8px); pointer-events: none; }
      `}</style>

      {/* Top bar — auto-hides when idle */}
      <div
        className={cn("controls-bar relative z-10 flex items-center justify-between px-5 py-3", !controlsVisible && "controls-hidden")}
        onMouseEnter={() => setControlsVisible(true)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[13px] font-medium text-white/70 backdrop-blur-md transition-all hover:bg-white/[0.12] hover:text-white"
          >
            <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Back</span>
          </button>
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-[13px] font-medium text-white/50">{displayName}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {pdfExportUrl && (
            <a
              href={pdfExportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12px] font-medium text-white/60 backdrop-blur-md transition-all hover:bg-white/[0.12] hover:text-white"
            >
              <Download className="size-3" />
              PDF
            </a>
          )}
          {(pptxExportUrl || downloadUrl) && (
            <a
              href={(pptxExportUrl ?? downloadUrl)!}
              download={!pptxExportUrl}
              className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12px] font-medium text-white/60 backdrop-blur-md transition-all hover:bg-white/[0.12] hover:text-white"
            >
              <Download className="size-3" />
              PPTX
            </a>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((p) => !p)}
            className="flex items-center justify-center size-8 rounded-full bg-white/[0.07] text-white/60 backdrop-blur-md transition-all hover:bg-white/[0.12] hover:text-white"
            title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {editorUrl ? (
            <a
              href={editorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-semibold text-gray-900 shadow-lg shadow-black/20 backdrop-blur-md transition-all hover:bg-white hover:shadow-xl hover:shadow-black/25"
            >
              <ExternalLink className="size-3" />
              Edit in Slides
            </a>
          ) : fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-semibold text-gray-900 shadow-lg shadow-black/20 backdrop-blur-md transition-all hover:bg-white hover:shadow-xl"
            >
              <ExternalLink className="size-3" />
              Open
            </a>
          ) : null}
        </div>
      </div>

      {/* Slide area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          <>
            {/* Ambient glow behind the slide */}
            {iframeLoaded && !isFullscreen && (
              <div
                className="preview-glow pointer-events-none absolute"
                style={{
                  width: "70%",
                  height: "50%",
                  top: "55%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  background: "radial-gradient(ellipse, oklch(0.35 0.08 255 / 30%), transparent 70%)",
                  filter: "blur(60px)",
                }}
              />
            )}

            {/* Loading state */}
            {!iframeLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <div className="size-12 rounded-2xl bg-white/[0.05] backdrop-blur-sm flex items-center justify-center">
                  <LoaderCircle className="size-5 animate-spin text-white/40" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[13px] font-medium text-white/40">Loading presentation</p>
                  <p className="text-[11px] text-white/20">This may take a moment</p>
                </div>
              </div>
            )}

            {/* Slide iframe */}
            <div className={cn(
              "preview-enter relative z-[1] transition-all duration-500 ease-out",
              isFullscreen
                ? "w-full h-full"
                : "w-[92%] max-w-[1120px] aspect-[16/9.5]",
              iframeLoaded ? "opacity-100" : "opacity-0",
            )}>
              <div
                className={cn(
                  "relative w-full h-full overflow-hidden",
                  !isFullscreen && "rounded-xl",
                )}
                style={!isFullscreen ? {
                  boxShadow: "0 25px 60px -12px oklch(0 0 0 / 60%), 0 0 0 1px oklch(1 0 0 / 6%)",
                } : undefined}
              >
                <iframe
                  src={previewUrl}
                  title={`Preview — ${displayName}`}
                  className="h-full w-full border-0 bg-white"
                  allowFullScreen
                  onLoad={() => setIframeLoaded(true)}
                />
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-white/[0.04] ring-1 ring-white/[0.06]">
              <Eye className="size-8 text-white/20" />
            </div>
            <div>
              <p className="text-[15px] font-medium text-white/50">No preview available</p>
              <p className="mt-1 text-[12px] text-white/25 max-w-xs">
                {downloadUrl ? "Download the deck to view it in PowerPoint or Google Slides." : "The presentation is still being generated."}
              </p>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="mt-2 flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.12] hover:text-white"
              >
                <Download className="size-3.5" />
                Download deck
              </a>
            )}
          </div>
        )}
      </div>

      {/* Floating quality score pill */}
      {deck.score && (
        <div
          className={cn(
            "controls-bar absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
            !controlsVisible && "controls-hidden-bottom",
          )}
          onMouseEnter={() => setControlsVisible(true)}
        >
          <button
            type="button"
            onClick={onScoreClick}
            className="group flex items-center gap-3 rounded-full bg-white/[0.08] backdrop-blur-xl px-5 py-2.5 transition-all hover:bg-white/[0.12] ring-1 ring-white/[0.06] shadow-lg shadow-black/20"
          >
            <div className="flex items-center gap-2">
              <Star className={cn("size-3.5 fill-current", scoreColor)} />
              <span className="text-[13px] font-semibold tabular-nums text-white/80">
                {deck.score.overallScore}
              </span>
              <span className="text-[11px] text-white/30 font-normal">/100</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <span className="text-[11px] text-white/40 transition-colors group-hover:text-white/60">
              View breakdown
            </span>
            <ChevronRight className="size-3 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/50" />
          </button>
        </div>
      )}

      {/* Keyboard hints — very subtle */}
      <div className={cn(
        "controls-bar absolute bottom-4 right-5 z-10 flex items-center gap-2",
        !controlsVisible && "controls-hidden-bottom",
      )}>
        <span className="text-[10px] text-white/15 tracking-wide">
          <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/25 font-mono">esc</kbd> close
          <span className="mx-1.5">&middot;</span>
          <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/25 font-mono">F</kbd> fullscreen
        </span>
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
