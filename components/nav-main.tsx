"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

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
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sidebar_collapsed_sections";
const STORAGE_CHANGE_EVENT = "bestdecks:sidebar-sections-change";
const EMPTY_COLLAPSED_SECTIONS = "{}";

function getCollapsedSectionsSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? EMPTY_COLLAPSED_SECTIONS;
  } catch {
    return EMPTY_COLLAPSED_SECTIONS;
  }
}

function getServerCollapsedSectionsSnapshot(): string {
  return EMPTY_COLLAPSED_SECTIONS;
}

function subscribeToCollapsedSections(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_CHANGE_EVENT, onStoreChange);
  };
}

function parseCollapsedSections(snapshot: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] =>
        typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

function setCollapsedSections(sections: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  } catch {
    // Non-blocking
  }
}

export function NavMain({ items }: { items: readonly NavGroup[] }) {
  const [activeHash, setActiveHash] = React.useState(
    `#${DEFAULT_WORKSPACE_VIEW}`,
  );
  const collapsedSnapshot = React.useSyncExternalStore(
    subscribeToCollapsedSections,
    getCollapsedSectionsSnapshot,
    getServerCollapsedSectionsSnapshot,
  );
  const collapsed = React.useMemo(
    () => parseCollapsedSections(collapsedSnapshot),
    [collapsedSnapshot],
  );

  React.useEffect(() => {
    const syncHash = () => {
      setActiveHash(window.location.hash || `#${DEFAULT_WORKSPACE_VIEW}`);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function toggleSection(id: string) {
    setCollapsedSections({ ...collapsed, [id]: !collapsed[id] });
  }

  return (
    <>
      {items.map((group) => {
        const isCollapsed = !!collapsed[group.id];

        return (
          <SidebarGroup key={group.id}>
            {group.label ? (
              <SidebarGroupLabel
                className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 cursor-pointer select-none"
                onClick={() => toggleSection(group.id)}
              >
                <span className="flex-1">{group.label}</span>
                <ChevronDown
                  className={cn(
                    "ml-auto size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </SidebarGroupLabel>
            ) : null}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-in-out",
                isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
              )}
            >
              <div className="overflow-hidden">
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
              </div>
            </div>
          </SidebarGroup>
        );
      })}
    </>
  );
}
