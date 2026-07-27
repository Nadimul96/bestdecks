"use client";

import {
  CheckCircle2,
  Cloud,
  Code2,
  KeyRound,
  ShieldAlert,
  Terminal,
} from "lucide-react";

import { SectionCard, ViewLayout } from "../view-layout";
import { viewMeta } from "@/lib/workspace-types";

const meta = viewMeta.pricing;

const ossCapabilities = [
  "Self-host the public application and pipeline",
  "Bring your own provider accounts and credentials",
  "Use the implemented intake, research, planning, and rendering paths",
  "Inspect and modify the Apache-2.0 source",
];

export function PricingView() {
  return (
    <ViewLayout
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
    >
      <div className="rounded-2xl border border-amber-500/25 bg-amber-50/70 p-6 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <h3 className="text-[15px] font-semibold text-amber-950 dark:text-amber-100">
              Managed hosting is not available yet
            </h3>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-amber-900/75 dark:text-amber-200/70">
              Bestdecks does not currently publish hosted prices, included-run allowances,
              overages, or team commitments. Those terms require measured completed-run cost and
              reliability data first.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Open-source BYOK implementation"
          description="Run the public core with infrastructure and provider accounts you control."
        >
          <div className="space-y-3">
            {ossCapabilities.map((capability) => (
              <div key={capability} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span className="text-[13px] leading-relaxed text-foreground">{capability}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <KeyRound className="size-3.5 text-primary" />
              Provider costs remain with your accounts
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              The repository does not bundle provider credits. Review each configured provider&apos;s
              own terms and usage controls before running live jobs.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Deferred: managed Bestdecks Cloud"
          description="The managed-service contract is deliberately unpublished."
        >
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-4">
            <Cloud className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              The intended cloud boundary covers managed hosting, queues, monitoring, storage,
              scheduling, analytics, teams, billing, and managed provider credits. Availability
              and commercial terms remain undecided.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-border/50 p-4">
            <p className="text-[12px] font-semibold text-foreground">Publication gate</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Do not publish included-run counts or pricing until at least 30 completed reference
              runs establish delivered-run cost, including p95.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: Code2,
              title: "License",
              body: "Apache-2.0 public core",
            },
            {
              icon: Terminal,
              title: "Setup",
              body: "README.md and docs/self-hosting.md",
            },
            {
              icon: Cloud,
              title: "Hosted service",
              body: "Deferred; no checkout or sales promise",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ViewLayout>
  );
}
