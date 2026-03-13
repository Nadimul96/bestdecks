"use client";

import * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DEFAULT_WORKSPACE_VIEW,
  type NavGroup,
} from "@/lib/workspace-navigation";

export function NavMain({ items }: { items: readonly NavGroup[] }) {
  const [activeHash, setActiveHash] = React.useState(
    `#${DEFAULT_WORKSPACE_VIEW}`,
  );

  React.useEffect(() => {
    const syncHash = () => {
      setActiveHash(window.location.hash || `#${DEFAULT_WORKSPACE_VIEW}`);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label ? (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={activeHash === item.url}
                    className="transition-colors"
                  >
                    <a href={item.url}>
                      {item.icon ? (
                        <item.icon className="size-4 shrink-0" />
                      ) : null}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
