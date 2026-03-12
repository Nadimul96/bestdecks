import {
  FileText,
  KeyRound,
  LayoutTemplate,
  SearchCheck,
  Settings2,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: `#${string}`;
  icon?: LucideIcon;
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
  | "target-intake"
  | "pipeline"
  | "delivery";

export const DEFAULT_WORKSPACE_VIEW: WorkspaceViewId = "overview";

export const workspaceNavGroups: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { title: "Overview", url: "#overview", icon: LayoutTemplate },
      { title: "Onboarding", url: "#onboarding", icon: KeyRound },
      { title: "Seller Context", url: "#seller-context", icon: WandSparkles },
      { title: "Run Settings", url: "#run-settings", icon: Settings2 },
      { title: "Target Intake", url: "#target-intake", icon: Upload },
      { title: "Pipeline", url: "#pipeline", icon: SearchCheck },
      { title: "Delivery", url: "#delivery", icon: FileText },
    ],
  },
];

const workspaceViewIds = new Set<WorkspaceViewId>([
  "overview",
  "onboarding",
  "seller-context",
  "run-settings",
  "target-intake",
  "pipeline",
  "delivery",
]);

export function isWorkspaceViewId(value: string): value is WorkspaceViewId {
  return workspaceViewIds.has(value as WorkspaceViewId);
}
