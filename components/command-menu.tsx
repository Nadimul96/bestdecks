"use client";

import * as React from "react";
import {
  Briefcase,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListTree,
  Moon,
  Rocket,
  SearchCheck,
  Settings2,
  Sun,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { workspaceNavGroups } from "@/lib/workspace-navigation";

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  function navigate(hash: string) {
    window.location.hash = hash;
    setOpen(false);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      showCloseButton={false}
      className="sm:max-w-xl rounded-xl shadow-2xl border-border/60"
    >
      <CommandInput placeholder="Search pages, actions…" />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1.5 py-4 text-muted-foreground">
            <p className="text-sm font-medium">No results</p>
            <p className="text-xs">Try a different search term</p>
          </div>
        </CommandEmpty>

        {workspaceNavGroups.map((group) => (
          <CommandGroup key={group.id} heading={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.url}
                  onSelect={() => navigate(item.url)}
                  className="gap-3 py-2.5 px-3 rounded-lg"
                >
                  {Icon && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium">{item.title}</span>
                    {item.description && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {item.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem
            onSelect={() => navigate("#target-intake")}
            className="gap-3 py-2.5 px-3 rounded-lg"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Rocket className="size-4 text-primary" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium">New run</span>
              <span className="text-[11px] text-muted-foreground">
                Import targets and generate decks
              </span>
            </div>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem
            onSelect={() => {
              setTheme("light");
              setOpen(false);
            }}
            className="gap-3 py-2 px-3 rounded-lg"
          >
            <Sun className="size-4" />
            <span className="text-[13px]">Light mode</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("dark");
              setOpen(false);
            }}
            className="gap-3 py-2 px-3 rounded-lg"
          >
            <Moon className="size-4" />
            <span className="text-[13px]">Dark mode</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("system");
              setOpen(false);
            }}
            className="gap-3 py-2 px-3 rounded-lg"
          >
            <Settings2 className="size-4" />
            <span className="text-[13px]">System default</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      {/* Footer with keyboard hint */}
      <div className="flex items-center justify-between border-t border-border/40 px-4 py-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}
