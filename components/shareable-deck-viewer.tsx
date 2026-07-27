"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  alaiPreviewThemes,
  getAlaiPreviewTheme,
  type AlaiPreviewTheme,
} from "@/src/examples/alai-preview-themes";
import type { PublicShareSlide } from "@/src/server/shareable-decks";

interface ShareableDeckViewerProps {
  title: string;
  preparedFor: string;
  targetWebsiteUrl: string;
  watermark: string;
  coverEyebrow: string;
  coverFooter: string;
  defaultThemeKey: string;
  slides: PublicShareSlide[];
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

/**
 * Recipient-facing slides intentionally use a separate renderer from the
 * sample archetype previews. Only persisted public titles and bullets enter
 * this component; it has no sample charts, testimonials, offers, or contacts.
 */
function PublicShareSlideCanvas({
  slide,
  theme,
  watermark,
  coverEyebrow,
  coverFooter,
}: {
  slide: PublicShareSlide;
  theme: AlaiPreviewTheme;
  watermark: string;
  coverEyebrow: string;
  coverFooter: string;
}) {
  const isLight = theme.family === "light";
  const headingColor = isLight ? "#111827" : "#F8FAFC";
  const bodyColor = isLight ? "#4B5563" : "rgba(248,250,252,0.68)";
  const mutedColor = isLight ? "#6B7280" : "rgba(248,250,252,0.42)";
  const eyebrow = slide.type === "cover"
    ? coverEyebrow
    : slide.type === "closing" ? "Closing" : "Proposal";

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        borderColor: theme.border,
        background:
          `radial-gradient(circle at 82% 18%, ${theme.surfaceGlow} 0%, transparent 34%), linear-gradient(140deg, ${theme.surface} 0%, ${theme.surfaceAlt} 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: isLight
            ? "linear-gradient(rgba(15,23,42,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.16) 1px, transparent 1px)"
            : "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: isLight ? "56px 56px" : "28px 28px",
        }}
      />

      <div className="relative flex h-full flex-col px-8 py-7 sm:px-12 sm:py-10">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: theme.accent }} />
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: mutedColor }}
            >
              {eyebrow}
            </p>
          </div>
          <p
            className="max-w-[40%] truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: mutedColor }}
          >
            {watermark}
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <h2
            className="max-w-5xl text-3xl font-bold leading-[1.08] tracking-tight sm:text-5xl"
            style={{ color: headingColor }}
          >
            {slide.title}
          </h2>
          {slide.bullets.length > 0 ? (
            <ul className="mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
              {slide.bullets.map((bullet, index) => (
                <li
                  key={`${bullet}-${index}`}
                  className="flex items-start gap-3 text-xs leading-relaxed sm:text-sm"
                  style={{ color: bodyColor }}
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: theme.accent }}
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {slide.type === "cover" ? (
          <p
            className="text-[10px] font-medium uppercase tracking-[0.18em]"
            style={{ color: mutedColor }}
          >
            {coverFooter}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ShareableDeckViewer({
  title,
  preparedFor,
  targetWebsiteUrl,
  watermark,
  coverEyebrow,
  coverFooter,
  defaultThemeKey,
  slides,
}: ShareableDeckViewerProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [themeKey, setThemeKey] = React.useState(defaultThemeKey);

  const currentSlide = slides[currentIndex] ?? slides[0];
  const currentTheme = getAlaiPreviewTheme(themeKey);
  const progressValue = slides.length > 1
    ? ((currentIndex + 1) / slides.length) * 100
    : 100;

  const goToSlide = React.useCallback((nextIndex: number) => {
    setCurrentIndex((previous) => {
      const resolved = nextIndex ?? previous;
      if (resolved < 0) return 0;
      if (resolved >= slides.length) return slides.length - 1;
      return resolved;
    });
  }, [slides.length]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(currentIndex - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(currentIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, goToSlide]);

  if (!currentSlide) return null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.1),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-3xl border border-border/50 bg-background/90 p-5 shadow-sm backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                BestDecks Shareable Deck
              </p>
              <h1 className="max-w-4xl text-2xl font-semibold tracking-tight sm:text-3xl">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground">
                Prepared for <span className="font-medium text-foreground">{preparedFor}</span>
                {" "}at {hostnameFromUrl(targetWebsiteUrl)}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-44">
                <Select value={themeKey} onValueChange={setThemeKey}>
                  <SelectTrigger size="sm" aria-label="Select deck theme">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {alaiPreviewThemes.map((theme) => (
                      <SelectItem key={theme.key} value={theme.key}>
                        {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Slide
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {currentIndex + 1} / {slides.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border/50 bg-background/70 p-3 shadow-sm backdrop-blur sm:p-4">
          <div className="aspect-[16/9] w-full">
            <PublicShareSlideCanvas
              slide={currentSlide}
              theme={currentTheme}
              watermark={watermark}
              coverEyebrow={coverEyebrow}
              coverFooter={coverFooter}
            />
          </div>
        </section>

        <section className="rounded-3xl border border-border/50 bg-background/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {slides.map((slide, index) => (
                <button
                  key={`${slide.title}-${index}`}
                  type="button"
                  onClick={() => goToSlide(index)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    index === currentIndex
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-label={`Go to slide ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <Progress value={progressValue} className="h-2 bg-primary/10" />

            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToSlide(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>

              <p className="hidden text-sm text-muted-foreground sm:block">
                Use the arrow keys to move between slides.
              </p>

              <Button
                size="sm"
                onClick={() => goToSlide(currentIndex + 1)}
                disabled={currentIndex === slides.length - 1}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <footer className="rounded-3xl border border-border/50 bg-background/90 shadow-sm backdrop-blur">
          <div className="border-t border-border/30 bg-muted/30 px-6 py-4 text-center">
            <p className="text-[12px] text-muted-foreground">
              Made with{" "}
              <a
                href="https://bestdecks.co"
                className="font-semibold text-primary hover:underline"
              >
                BestDecks
              </a>
              {" "}— open-source proposal deck tooling
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              <a
                href="https://bestdecks.co"
                className="font-medium text-primary hover:underline"
              >
                Generate your own deck
              </a>
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
