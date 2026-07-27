export interface ExistingBootstrapUser {
  id: string;
  role: string | null;
}

export type AdminBootstrapDecision =
  | { action: "create" }
  | { action: "reuse"; userId: string };

export function decideAdminBootstrap(
  existing: ExistingBootstrapUser | undefined,
  userCount: number,
): AdminBootstrapDecision {
  if (existing) {
    if (existing.role !== "admin") {
      throw new Error(
        "Admin bootstrap refused to promote an existing non-admin account.",
      );
    }
    return { action: "reuse", userId: existing.id };
  }

  if (!Number.isSafeInteger(userCount) || userCount !== 0) {
    throw new Error("Admin bootstrap requires a fresh user database.");
  }

  return { action: "create" };
}
