"use client";

import * as React from "react";
import { Coins, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

export function CreditCounter() {
  const { credits } = useBusinessContext();

  // Don't show if credits haven't loaded or no plan
  if (!credits) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
        <a href="#pricing">
          <Zap className="size-3 text-amber-500" />
          <span>Get credits</span>
        </a>
      </Button>
    );
  }

  const used = credits.monthlyAllowance - credits.balance + credits.bonusCredits;
  const total = credits.monthlyAllowance + credits.bonusCredits;
  const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
  const isLow = usagePercent >= 80;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 text-xs tabular-nums",
              isLow && "border-amber-500/30 text-amber-600 dark:text-amber-400",
            )}
            asChild
          >
            <a href="#pricing">
              <Coins
                className={cn(
                  "size-3",
                  isLow ? "text-amber-500" : "text-muted-foreground",
                )}
              />
              <span className="font-semibold">{credits.balance}</span>
              <span className="text-muted-foreground">/ {total}</span>
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {credits.balance} credit{credits.balance !== 1 ? "s" : ""} remaining
            {isLow && " — running low!"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            1 credit = 1 deck. Click to manage plan.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
