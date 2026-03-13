"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SearchTrigger() {
  const openCommandMenu = React.useCallback(() => {
    // Dispatch the ⌘K shortcut to open the CommandMenu
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      }),
    );
  }, []);

  return (
    <Button
      onClick={openCommandMenu}
      variant="outline"
      className="relative h-8 w-56 justify-start gap-2 rounded-lg border-border/60 bg-muted/40 px-3 text-xs text-muted-foreground shadow-none hover:bg-muted/60"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}
