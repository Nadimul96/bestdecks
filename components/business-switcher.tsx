"use client";

import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBusinessContext } from "@/lib/business-context";

export function BusinessSwitcher() {
  const { currentBusiness } = useBusinessContext();

  return (
    <Button variant="ghost" size="sm" className="gap-2 px-2.5 font-medium" asChild>
      <a href={currentBusiness ? "#seller-context" : "#onboarding"}>
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
          <Building2 className="size-3 text-primary" />
        </span>
        <span className="max-w-[160px] truncate text-xs">
          {currentBusiness?.name || "Configure workspace"}
        </span>
      </a>
    </Button>
  );
}
