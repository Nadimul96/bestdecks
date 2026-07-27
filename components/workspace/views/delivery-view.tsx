"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Search,
  Share2,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewLayout, StatusPill } from "../view-layout";
import {
  DeckEvidenceBadge,
  DeckEvidenceDetails,
  DeckEvidenceNotice,
  type DeckEvidenceSummary,
} from "@/components/deck-score-badge";
import {
  viewMeta,
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
  downloadAvailable: boolean;
  evidence?: DeckEvidenceSummary;
  preview?: {
    googleSlidesId?: string;
    embedUrl?: string;
  };
  shareSlug?: string;
  canShare?: boolean;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:")
      || url.username
      || url.password
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeGoogleSlidesId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/u.test(value)
    ? value
    : undefined;
}

function safeGoogleSlidesEmbedUrl(value: unknown): string | undefined {
  const safe = safeHttpUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  if (
    url.origin !== "https://docs.google.com"
    || !/^\/presentation\/d\/[A-Za-z0-9_-]{1,256}\/embed$/u.test(url.pathname)
  ) return undefined;
  url.search = "";
  url.searchParams.set("start", "false");
  url.searchParams.set("loop", "false");
  url.searchParams.set("rm", "minimal");
  return url.toString();
}

function deliveryDownloadUrl(deck: DeckCard): string | undefined {
  if (!deck.downloadAvailable) return undefined;
  return `/api/delivery/${encodeURIComponent(deck.targetId)}/download`;
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function DeliveryView() {
  const [loading, setLoading] = React.useState(true);
  const [deckCards, setDeckCards] = React.useState<DeckCard[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<
    "all" | "delivered" | "failed" | "pending"
  >("all");
  const [previewDeck, setPreviewDeck] = React.useState<DeckCard | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const fetchAllDecks = React.useCallback(async function loadDecks(retries = 2) {
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

      const cards = data.decks as DeckCard[];

      cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDeckCards(cards);
    } catch {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return loadDecks(retries - 1);
      }
      toast.error("Failed to load decks. Please refresh the page.");
      setDeckCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void fetchAllDecks(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchAllDecks]);

  const filteredDecks = deckCards.filter((deck) => {
    if (filterStatus === "delivered" && deck.status !== "delivered") return false;
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
    (d) => d.status === "delivered",
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
      const url = deliveryDownloadUrl(deck);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        downloadCount++;
      }
    }
    if (downloadCount > 0) {
      toast.success(`Opened ${downloadCount} deck${downloadCount > 1 ? "s" : ""} for download.`);
    } else {
      toast.error("No downloadable decks found in selection.");
    }
  }

  async function handleShare(deck: DeckCard) {
    try {
      const res = await fetch(`/api/delivery/${deck.targetId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to create share link.",
        );
      }

      await copyToClipboard(data.url);
      setDeckCards((previous) =>
        previous.map((card) =>
          card.targetId === deck.targetId
            ? { ...card, shareSlug: data.slug as string }
            : card
        ),
      );
      toast.success(deck.shareSlug ? "Share link copied." : "Share link created and copied.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to share deck.";
      toast.error(message);
    }
  }

  async function handleUnshare(deck: DeckCard) {
    try {
      const res = await fetch(`/api/delivery/${deck.targetId}/share`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to disable share link.",
        );
      }

      setDeckCards((previous) =>
        previous.map((card) =>
          card.targetId === deck.targetId
            ? { ...card, shareSlug: undefined }
            : card
        ),
      );
      toast.success("Share link disabled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disable share link.";
      toast.error(message);
    }
  }

  const deliveredCount = deckCards.filter((d) => d.status === "delivered").length;
  const failedCount = deckCards.filter((d) => d.status === "failed").length;
  const totalCount = deckCards.length;

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
        <SummaryCard label="Delivered decks" value={deliveredCount} icon={CheckCircle2} accent="emerald" />
        <SummaryCard label="Total targets" value={totalCount} icon={FileText} accent="primary" />
        <SummaryCard label="Failed targets" value={failedCount} icon={AlertCircle} accent="amber" />
      </div>

      <DeckEvidenceNotice />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "delivered", "failed", "pending"] as const).map((status) => {
            const count = status === "all"
              ? deckCards.length
              : status === "delivered"
                ? deliveredCount
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
              onShare={() => handleShare(deck)}
              onUnshare={() => handleUnshare(deck)}
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
        />
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
  onShare,
  onUnshare,
}: {
  deck: DeckCard;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onShare: () => void;
  onUnshare: () => void;
}) {
  let displayName: string;
  try {
    displayName = deck.companyName || new URL(deck.websiteUrl.startsWith("http") ? deck.websiteUrl : `https://${deck.websiteUrl}`).hostname;
  } catch {
    displayName = deck.websiteUrl;
  }

  const isSelectable = deck.status === "delivered";

  // Extract Google Slides embed for thumbnail
  const gsId = safeGoogleSlidesId(deck.preview?.googleSlidesId);
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
          <Image
            src={thumbnailUrl}
            alt={`Preview of ${displayName} deck`}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 33vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
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
          {isSelectable && <DeckEvidenceBadge evidence={deck.evidence} />}
        </div>
        {isSelectable && (
          <DeckEvidenceDetails evidence={deck.evidence} className="mt-3 border-t border-border/30 pt-2.5" />
        )}
      </div>

      {/* Footer metadata */}
      <div className="flex items-center justify-between border-t border-border/30 px-3.5 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase font-medium tracking-wide">{deck.format}</span>
          <span className="text-border">&middot;</span>
          <span>{new Date(deck.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span className="text-border">&middot;</span>
          <StatusPill
            status={deck.status === "delivered" ? "ready" : deck.status === "failed" ? "error" : deck.status === "completed" ? "incomplete" : "running"}
            label={deck.status === "delivered" ? "delivered" : deck.status === "completed" ? "legacy / unverified" : deck.status}
          />
        </div>

        {isSelectable && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={deck.shareSlug ? "secondary" : "outline"}
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              disabled={deck.canShare === false}
              className="h-6 gap-1.5"
            >
              <Share2 className="size-3" />
              {deck.shareSlug ? "Copy link" : "Share"}
            </Button>

            {deck.shareSlug && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnshare();
                }}
                className="h-6 px-2 text-muted-foreground hover:text-foreground"
              >
                Stop sharing
              </Button>
            )}

            {(() => {
              const downloadUrl = deliveryDownloadUrl(deck);
              if (!downloadUrl) return null;
              return (
                <a
                  href={downloadUrl}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download <Download className="size-2.5" />
                </a>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Full-screen Deck Preview — Theater Mode ──── */

function DeckPreviewOverlay({
  deck,
  onClose,
}: {
  deck: DeckCard;
  onClose: () => void;
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

  const embedUrl = safeGoogleSlidesEmbedUrl(deck.preview?.embedUrl);
  const downloadUrl = deliveryDownloadUrl(deck);
  const previewUrl = embedUrl ?? null;

  // Auto-hide controls after 3s of inactivity
  const resetHideTimer = React.useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  React.useEffect(() => {
    hideTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      3000,
    );
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "f" || e.key === "F") setIsFullscreen((p) => !p);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12px] font-medium text-white/60 backdrop-blur-md transition-all hover:bg-white/[0.12] hover:text-white"
            >
              <Download className="size-3" />
              Download
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

          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-[12px] font-semibold text-gray-900 shadow-lg shadow-black/20 backdrop-blur-md transition-all hover:bg-white hover:shadow-xl"
            >
              <Download className="size-3" />
              Download
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
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                  referrerPolicy="no-referrer"
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
                {downloadUrl ? "Download the verified PPTX; target-suite compatibility is still being validated." : "The presentation is still being generated."}
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

      <div
        className={cn(
          "controls-bar absolute bottom-4 left-1/2 z-10 -translate-x-1/2",
          !controlsVisible && "controls-hidden-bottom",
        )}
        onMouseEnter={() => setControlsVisible(true)}
      >
        <div className="flex max-w-[min(90vw,900px)] flex-col items-center gap-2 rounded-xl bg-black/25 px-3 py-2 backdrop-blur-md ring-1 ring-white/10">
          <DeckEvidenceBadge evidence={deck.evidence} tone="dark" />
          <DeckEvidenceDetails
            evidence={deck.evidence}
            tone="dark"
            className="justify-center"
          />
        </div>
      </div>

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
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "primary" | "amber";
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
          <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
