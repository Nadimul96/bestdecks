"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SearchTrigger() {
  const focusSearch = React.useCallback(() => {
    const focusVisibleInput = () => {
      const input = document.getElementById("search-input");
      if (!(input instanceof HTMLInputElement)) {
        return false;
      }

      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      return true;
    };

    if (focusVisibleInput()) {
      return;
    }

    window.location.hash = "#overview";
    window.setTimeout(() => {
      focusVisibleInput();
    }, 50);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        focusSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusSearch]);

  return (
    <Button
      onClick={focusSearch}
      variant="link"
      className="px-0! font-normal text-muted-foreground hover:no-underline"
    >
      <Search data-icon="inline-start" />
      Search
      <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
        <span className="text-xs">⌘</span>J
      </kbd>
    </Button>
  );
}
