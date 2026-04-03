"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  SlidePreview,
  type ExampleSlide,
} from "@/components/archetype-preview-modal";
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
} from "@/src/examples/alai-preview-themes";

interface ShareableDeckViewerProps {
  title: string;
  preparedFor: string;
  targetWebsiteUrl: string;
  watermark: string;
  coverEyebrow: string;
  coverFooter: string;
  defaultThemeKey: string;
  slides: ExampleSlide[];
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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
            <SlidePreview
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
              {" "}— AI-powered decks that close deals
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
