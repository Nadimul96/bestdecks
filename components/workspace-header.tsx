"use client";

import * as React from "react";
import {
  Bell,
  CircleUser,
  CreditCard,
  LogOut,
  MessageSquareDot,
  Plus,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchTrigger } from "@/components/search-trigger";
import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/utils";
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

interface WorkspaceHeaderProps {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}

export function WorkspaceHeader({ user }: WorkspaceHeaderProps) {
  const currentView = useCurrentView();
  const [isPending, startTransition] = React.useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await authClient.signOut();
      window.location.href = "/login";
    });
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex w-full items-center justify-between px-4 lg:px-6">
        {/* Left section: sidebar trigger + breadcrumb */}
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />

          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#overview" className="text-xs text-muted-foreground hover:text-foreground">
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

        {/* Right section: actions + profile */}
        <div className="flex items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            {/* New run button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="hidden gap-1.5 shadow-sm sm:inline-flex"
                  asChild
                >
                  <a href="#target-intake">
                    <Plus className="size-3.5" />
                    New run
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Import targets & launch</p>
              </TooltipContent>
            </Tooltip>

            {/* Notifications (placeholder) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <Bell className="size-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Notifications</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
              >
                <Avatar className="size-7">
                  <AvatarImage
                    src={user.avatar || undefined}
                    alt={user.name}
                  />
                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <Avatar className="size-8">
                    <AvatarImage
                      src={user.avatar || undefined}
                      alt={user.name}
                    />
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <CircleUser className="size-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CreditCard className="size-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <MessageSquareDot className="size-4" />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={isPending}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                {isPending ? "Signing out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
