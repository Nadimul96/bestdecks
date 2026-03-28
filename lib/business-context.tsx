"use client";

import * as React from "react";
import type { Business, UserCredits } from "@/lib/workspace-types";

interface BusinessContextValue {
  businesses: Business[];
  currentBusiness: Business | null;
  credits: UserCredits | null;
  loading: boolean;
  switchBusiness: (id: string) => void;
  addBusiness: (business: Business) => void;
  updateBusiness: (id: string, updates: Partial<Business>) => void;
  startNewBusiness: () => void;
  refreshBusinesses: () => Promise<void>;
  refreshCredits: () => Promise<void>;
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
 * Provides multi-business state to the entire workspace.
 * Fetches businesses from /api/businesses and credits from /api/credits.
 * Falls back to a mock business derived from existing seller context for
 * backward compatibility during migration.
 */
export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = React.useState<Business[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [credits, setCredits] = React.useState<UserCredits | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshBusinesses = React.useCallback(async () => {
    try {
      const res = await fetch("/api/businesses");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setBusinesses(data);
          // If no business selected yet, pick the first one
          setCurrentId((prev) => prev ?? data[0].id);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Fallback: try to construct a business from existing seller context
    try {
      const sellerRes = await fetch("/api/onboarding/seller-context");
      if (sellerRes.ok) {
        const seller = await sellerRes.json();
        if (seller?.companyName || seller?.websiteUrl) {
          const fallback: Business = {
            id: "default",
            name: seller.companyName || "My Business",
            websiteUrl: seller.websiteUrl || "",
            setupComplete: !!(seller.companyName && seller.offerSummary),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sellerContext: seller,
          };
          setBusinesses([fallback]);
          setCurrentId("default");
          return;
        }
      }
    } catch {
      // ignore
    }

    // No businesses at all — fresh user
    setBusinesses([]);
    setCurrentId(null);
  }, []);

  const refreshCredits = React.useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch {
      // ignore — credits endpoint may not exist yet
    }
  }, []);

  React.useEffect(() => {
    Promise.all([refreshBusinesses(), refreshCredits()]).finally(() =>
      setLoading(false),
    );
  }, [refreshBusinesses, refreshCredits]);

  const currentBusiness =
    businesses.find((b) => b.id === currentId) ?? businesses[0] ?? null;

  const switchBusiness = React.useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const addBusiness = React.useCallback((business: Business) => {
    setBusinesses((prev) => [...prev, business]);
    setCurrentId(business.id);
  }, []);

  const updateBusiness = React.useCallback(
    (id: string, updates: Partial<Business>) => {
      setBusinesses((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      );
    },
    [],
  );

  const startNewBusiness = React.useCallback(() => {
    const now = new Date().toISOString();
    const newBiz: Business = {
      id: `new-${Date.now()}`,
      name: "New Business",
      websiteUrl: "",
      setupComplete: false,
      createdAt: now,
      updatedAt: now,
    };
    setBusinesses((prev) => [...prev, newBiz]);
    setCurrentId(newBiz.id);
    // Signal to seller-context view to start with blank fields
    sessionStorage.setItem("bestdecks_new_business", newBiz.id);
  }, []);

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        currentBusiness,
        credits,
        loading,
        switchBusiness,
        addBusiness,
        updateBusiness,
        startNewBusiness,
        refreshBusinesses,
        refreshCredits,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}
