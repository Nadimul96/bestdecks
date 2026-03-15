"use client";

import * as React from "react";
import {
  DEFAULT_WORKSPACE_VIEW,
  isWorkspaceViewId,
  type WorkspaceViewId,
} from "@/lib/workspace-navigation";
import type { CurrentUser } from "@/lib/workspace-types";

import { OverviewView } from "./views/overview-view";
import { OnboardingView } from "./views/onboarding-view";
import { SellerContextView } from "./views/seller-context-view";
import { RunSettingsView } from "./views/run-settings-view";
import { TargetIntakeView } from "./views/target-intake-view";
import { PipelineView } from "./views/pipeline-view";
import { DeliveryView } from "./views/delivery-view";
import { PricingView } from "./views/pricing-view";

function useActiveWorkspaceView() {
  const [activeView, setActiveView] =
    React.useState<WorkspaceViewId>(DEFAULT_WORKSPACE_VIEW);

  React.useEffect(() => {
    const syncHash = () => {
      const nextHash = window.location.hash.replace(/^#/, "");
      setActiveView(
        nextHash && isWorkspaceViewId(nextHash)
          ? nextHash
          : DEFAULT_WORKSPACE_VIEW,
      );
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return activeView;
}

interface WorkspaceShellProps {
  currentUser: CurrentUser;
}

export function WorkspaceShell({ currentUser }: WorkspaceShellProps) {
  const activeView = useActiveWorkspaceView();

  return (
    <div key={activeView} className="animate-fade-in">
      {activeView === "overview" && <OverviewView currentUser={currentUser} />}
      {activeView === "onboarding" && (
        <OnboardingView currentUser={currentUser} />
      )}
      {activeView === "seller-context" && <SellerContextView />}
      {activeView === "run-settings" && <RunSettingsView />}
      {activeView === "target-intake" && <TargetIntakeView />}
      {activeView === "pipeline" && <PipelineView />}
      {activeView === "delivery" && <DeliveryView />}
      {activeView === "pricing" && <PricingView />}
    </div>
  );
}
