"use client";

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
} from "@/components/ui/sidebar";
import { workspaceNavGroups } from "@/lib/workspace-navigation";

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
        <div className="flex items-center justify-between px-2 group-data-[collapsible=icon]:hidden">
          <ThemeToggle />
        </div>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
