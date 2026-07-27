"use client";

import * as React from "react";
import type { Business } from "@/lib/workspace-types";

interface BusinessContextValue {
  businesses: Business[];
  currentBusiness: Business | null;
  loading: boolean;
  refreshBusinesses: () => Promise<void>;
}

const BusinessContext = React.createContext<BusinessContextValue | null>(null);

export function useBusinessContext() {
  const ctx = React.useContext(BusinessContext);
  if (!ctx) {
    throw new Error("useBusinessContext must be used within BusinessProvider");
  }
  return ctx;
}

/**
 * Provides multi-business state to the workspace.
 *
 * Bestdecks OSS has no hosted entitlement or credit balance. Provider usage
 * belongs to the accounts configured by the operator, so this context only
 * owns business selection and setup state.
 */
export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = React.useState<Business[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refreshBusinesses = React.useCallback(async () => {
    try {
      const res = await fetch("/api/businesses");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // The OSS persistence model is intentionally one workspace per user.
          setBusinesses([data[0]]);
          return;
        }
      }
    } catch {
      // The empty state below is safer than inventing a client-only workspace.
    }
    setBusinesses([]);
  }, []);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshBusinesses().finally(() => {
        if (active) setLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refreshBusinesses]);

  const currentBusiness = businesses[0] ?? null;

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        currentBusiness,
        loading,
        refreshBusinesses,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}
