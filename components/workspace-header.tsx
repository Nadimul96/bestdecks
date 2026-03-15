"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchTrigger } from "@/components/search-trigger";
import { BusinessSwitcher } from "@/components/business-switcher";
import { CreditCounter } from "@/components/credit-counter";
import {
  isWorkspaceViewId,
  workspaceNavGroups,
  type WorkspaceViewId,
} from "@/lib/workspace-navigation";

/* ─────────────────────────────────────────────
   View label lookup — flatten nav groups to map
   ───────────────────────────────────────────── */

const viewLabels: Record<WorkspaceViewId, string> = Object.fromEntries(
  workspaceNavGroups.flatMap((g) =>
    g.items.map((item) => [item.url.replace("#", ""), item.title]),
  ),
) as Record<WorkspaceViewId, string>;

/* ─────────────────────────────────────────────
   Hook: track current view from hash
   ───────────────────────────────────────────── */

function useCurrentView(): WorkspaceViewId {
  const [view, setView] = React.useState<WorkspaceViewId>("overview");

  React.useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace("#", "");
      setView(isWorkspaceViewId(h) ? h : "overview");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return view;
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

export function WorkspaceHeader() {
  const currentView = useCurrentView();

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex w-full items-center justify-between px-4 lg:px-6">
        {/* Left section: sidebar trigger + business switcher + breadcrumb */}
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />

          {/* Business switcher dropdown */}
          <BusinessSwitcher />

          <Separator
            orientation="vertical"
            className="mx-1 hidden data-[orientation=vertical]:h-4 sm:block"
          />

          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="#overview"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  bestdecks
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs font-medium">
                  {viewLabels[currentView] ?? "Overview"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Center: search */}
        <div className="hidden md:block">
          <SearchTrigger />
        </div>

        {/* Right section: credits + new run */}
        <div className="flex items-center gap-2">
          <CreditCounter />

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 shadow-sm"
                  asChild
                >
                  <a href="#target-intake">
                    <Plus className="size-3.5" />
                    <span className="hidden sm:inline">New run</span>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Import targets &amp; launch</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  );
}
