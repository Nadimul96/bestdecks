"use client";

import * as React from "react";
import {
  DEFAULT_WORKSPACE_VIEW,
  isWorkspaceViewId,
  type WorkspaceViewId,
} from "@/lib/workspace-navigation";
import type { CurrentUser } from "@/lib/workspace-types";
import { useBusinessContext } from "@/lib/business-context";

import { SetupWizard } from "@/components/setup-wizard";
import { ProductTour } from "@/components/product-tour";
import { OverviewView } from "./views/overview-view";
import { OnboardingView } from "./views/onboarding-view";
import { SellerContextView } from "./views/seller-context-view";
import { RunSettingsView } from "./views/run-settings-view";
import { StructureView } from "./views/structure-view";
import { TargetIntakeView } from "./views/target-intake-view";
import { PipelineView } from "./views/pipeline-view";
import { DeliveryView } from "./views/delivery-view";
import { PricingView } from "./views/pricing-view";

const TOUR_COMPLETE_KEY = "bestdecks_tour_complete";

function useActiveWorkspaceView() {
  const [activeView, setActiveView] =
    React.useState<WorkspaceViewId>(DEFAULT_WORKSPACE_VIEW);

  React.useEffect(() => {
    // Aliases: #billing → #pricing
    const hashAliases: Record<string, WorkspaceViewId> = {
      billing: "pricing",
    };

    const syncHash = () => {
      const nextHash = window.location.hash.replace(/^#/, "");
      const resolved = hashAliases[nextHash] ?? nextHash;
      setActiveView(
        resolved && isWorkspaceViewId(resolved)
          ? resolved
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
  const { currentBusiness, loading } = useBusinessContext();

  // Show setup wizard for first-time users
  const setupComplete = currentBusiness?.setupComplete ?? false;
  const [wizardDismissed, setWizardDismissed] = React.useState(false);

  // Show product tour after wizard completion (one-time)
  const [showTour, setShowTour] = React.useState(false);

  // Check if tour was already completed
  const tourAlreadyDone = React.useMemo(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(TOUR_COMPLETE_KEY) === "true";
  }, []);

  const shouldShowWizard = !loading && !setupComplete && !wizardDismissed;

  function handleWizardComplete() {
    setWizardDismissed(true);
    // Show product tour after a brief delay for the wizard to animate out
    if (!tourAlreadyDone) {
      setTimeout(() => setShowTour(true), 600);
    }
  }

  function handleTourComplete() {
    setShowTour(false);
    localStorage.setItem(TOUR_COMPLETE_KEY, "true");
  }

  // Full-screen setup wizard for first-time users
  if (shouldShowWizard) {
    return (
      <SetupWizard
        currentUser={{
          name: currentUser.name ?? "",
          email: currentUser.email ?? "",
        }}
        onComplete={handleWizardComplete}
      />
    );
  }

  return (
    <>
      {showTour && <ProductTour onComplete={handleTourComplete} />}
      <div key={activeView} className="animate-fade-up">
        {activeView === "overview" && <OverviewView currentUser={currentUser} />}
        {activeView === "onboarding" && (
          <OnboardingView currentUser={currentUser} />
        )}
        {activeView === "seller-context" && <SellerContextView />}
        {activeView === "run-settings" && <RunSettingsView />}
        {activeView === "deck-structure" && <StructureView />}
        {activeView === "target-intake" && <TargetIntakeView />}
        {activeView === "pipeline" && <PipelineView />}
        {activeView === "delivery" && <DeliveryView />}
        {activeView === "pricing" && <PricingView />}
      </div>
    </>
  );
}
