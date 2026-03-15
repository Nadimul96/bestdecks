"use client";

import * as React from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Circle,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/utils";

export function BusinessSwitcher() {
  const { businesses, currentBusiness, switchBusiness } = useBusinessContext();

  if (businesses.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground"
        asChild
      >
        <a href="#onboarding">
          <Plus className="size-3.5" />
          <span className="text-xs">Add your business</span>
        </a>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2.5 font-medium"
        >
          {/* Business favicon/icon */}
          <div className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
            {currentBusiness?.logoUrl ? (
              <img
                src={currentBusiness.logoUrl}
                alt=""
                className="size-4 rounded object-cover"
              />
            ) : (
              <Building2 className="size-3 text-primary" />
            )}
          </div>

          <span className="max-w-[140px] truncate text-xs">
            {currentBusiness?.name || "Select business"}
          </span>

          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Your businesses
        </DropdownMenuLabel>

        {businesses.map((biz) => (
          <DropdownMenuItem
            key={biz.id}
            onClick={() => switchBusiness(biz.id)}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            {/* Icon */}
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
              {biz.logoUrl ? (
                <img
                  src={biz.logoUrl}
                  alt=""
                  className="size-5 rounded object-cover"
                />
              ) : (
                <Building2 className="size-3.5 text-muted-foreground" />
              )}
            </div>

            {/* Name + status */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{biz.name}</p>
              <div className="flex items-center gap-1.5">
                <Circle
                  className={cn(
                    "size-1.5 fill-current",
                    biz.setupComplete
                      ? "text-emerald-500"
                      : "text-amber-500",
                  )}
                />
                <span className="text-[11px] text-muted-foreground">
                  {biz.setupComplete ? "Ready" : "Setup needed"}
                </span>
              </div>
            </div>

            {/* Active indicator */}
            {currentBusiness?.id === biz.id && (
              <Check className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a
            href="#onboarding"
            className="flex items-center gap-2.5 px-3 py-2 text-[13px]"
          >
            <div className="flex size-7 items-center justify-center rounded-md border border-dashed border-border">
              <Plus className="size-3.5 text-muted-foreground" />
            </div>
            <span className="font-medium">Add new business</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
