"use client";

import * as React from "react";
import {
  Briefcase,
  FileText,
  LayoutDashboard,
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {workspaceNavGroups.map((group) => (
          <CommandGroup key={group.id} heading={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.url}
                  onSelect={() => navigate(item.url)}
                  className="gap-2.5"
                >
                  {Icon && <Icon className="size-4 text-muted-foreground" />}
                  <div className="flex flex-col">
                    <span>{item.title}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground">
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

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => navigate("#target-intake")}
            className="gap-2.5"
          >
            <Rocket className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>New run</span>
              <span className="text-xs text-muted-foreground">
                Import targets and launch a batch
              </span>
            </div>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => {
              setTheme("light");
              setOpen(false);
            }}
            className="gap-2.5"
          >
            <Sun className="size-4 text-muted-foreground" />
            Light
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("dark");
              setOpen(false);
            }}
            className="gap-2.5"
          >
            <Moon className="size-4 text-muted-foreground" />
            Dark
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("system");
              setOpen(false);
            }}
            className="gap-2.5"
          >
            <Settings2 className="size-4 text-muted-foreground" />
            System
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
