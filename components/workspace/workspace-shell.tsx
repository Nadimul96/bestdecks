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
const WIZARD_DISMISSED_KEY = "bestdecks_setup_wizard_dismissed";
const LOCAL_FLAG_EVENT = "bestdecks:local-flag";

/**
 * A per-browser boolean flag in localStorage, read through
 * useSyncExternalStore so server and client renders agree. If storage is
 * unavailable the flag reads as set, so one-time UI never traps the user.
 */
function useLocalFlag(key: string) {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) onStoreChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_FLAG_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_FLAG_EVENT, onStoreChange);
    };
  }, [key]);
  const getSnapshot = React.useCallback(() => {
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return true;
    }
  }, [key]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => true);
}

function setLocalFlag(key: string) {
  try {
    localStorage.setItem(key, "true");
    window.dispatchEvent(new Event(LOCAL_FLAG_EVENT));
  } catch {
    // The in-memory state still applies for this session.
  }
}

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
      // Scroll to top on every page navigation
      window.scrollTo({ top: 0 });
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

  // Show the setup wizard until setup is complete or the user dismisses it.
  const setupComplete = currentBusiness?.setupComplete ?? false;
  const wizardDismissed = useLocalFlag(WIZARD_DISMISSED_KEY);

  // Show product tour after wizard completion (one-time)
  const [showTour, setShowTour] = React.useState(false);
  const tourAlreadyDone = useLocalFlag(TOUR_COMPLETE_KEY);

  const shouldShowWizard = !loading && !setupComplete && !wizardDismissed;

  function handleWizardComplete() {
    setLocalFlag(WIZARD_DISMISSED_KEY);
    // Show product tour after a brief delay for the wizard to animate out
    if (!tourAlreadyDone) {
      setTimeout(() => setShowTour(true), 600);
    }
  }

  function handleTourComplete() {
    setShowTour(false);
    setLocalFlag(TOUR_COMPLETE_KEY);
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
        {activeView === "onboarding" && <OnboardingView />}
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
