"use client";

import { ChevronsLeft } from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { workspaceNavGroups } from "@/lib/workspace-navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function SidebarCollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleSidebar}
          className="flex h-8 items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-2"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft
            className={`size-4 transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`}
          />
          {!isCollapsed && (
            <span className="ml-2 text-xs text-muted-foreground/60">
              Collapse
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="group-data-[state=expanded]:hidden">
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
}) {
  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-10 hover:bg-transparent active:bg-transparent"
            >
              <a href="#overview" className="flex items-center gap-2.5">
                <Logo size="sm" showText={false} />
                <span className="text-sm font-semibold tracking-tight text-brand-navy dark:text-foreground">
                  bestdecks
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="pt-1">
        <NavMain items={workspaceNavGroups} />
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2">
          <SidebarCollapseToggle />
          <div className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </div>
        </div>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
