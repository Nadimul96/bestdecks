import {
  Briefcase,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListTree,
  Rocket,
  SearchCheck,
  Settings2,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: `#${string}`;
  icon?: LucideIcon;
  description?: string;
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

export type WorkspaceViewId =
  | "overview"
  | "onboarding"
  | "seller-context"
  | "run-settings"
  | "deck-structure"
  | "target-intake"
  | "pipeline"
  | "delivery"
  | "pricing";

export const DEFAULT_WORKSPACE_VIEW: WorkspaceViewId = "overview";

export const workspaceNavGroups: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        title: "Overview",
        url: "#overview",
        icon: LayoutDashboard,
        description: "Dashboard and readiness summary",
      },
      {
        title: "Get Started",
        url: "#onboarding",
        icon: Rocket,
        description: "Set up your workspace",
      },
    ],
  },
  {
    id: "configure",
    label: "Configure",
    items: [
      {
        title: "Your Business",
        url: "#seller-context",
        icon: Briefcase,
        description: "What you sell and who you help",
      },
      {
        title: "Deck Style",
        url: "#run-settings",
        icon: Settings2,
        description: "Archetype, tone, visuals, and export format",
      },
      {
        title: "Structure",
        url: "#deck-structure",
        icon: ListTree,
        description: "Slide-by-slide content outline",
      },
      {
        title: "Targets",
        url: "#target-intake",
        icon: Upload,
        description: "Import companies to personalize for",
      },
    ],
  },
  {
    id: "execute",
    label: "Execute",
    items: [
      {
        title: "Pipeline",
        url: "#pipeline",
        icon: SearchCheck,
        description: "Research and generation progress",
      },
      {
        title: "Delivery",
        url: "#delivery",
        icon: FileText,
        description: "Review and download decks",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        title: "Plans & Credits",
        url: "#pricing",
        icon: CreditCard,
        description: "Manage your plan and credits",
      },
    ],
  },
];

const workspaceViewIds = new Set<WorkspaceViewId>([
  "overview",
  "onboarding",
  "seller-context",
  "run-settings",
  "deck-structure",
  "target-intake",
  "pipeline",
  "delivery",
  "pricing",
]);

export function isWorkspaceViewId(value: string): value is WorkspaceViewId {
  return workspaceViewIds.has(value as WorkspaceViewId);
}
