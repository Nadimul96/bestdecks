import { cn } from "@/lib/utils";

interface ViewLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function ViewLayout({
  eyebrow,
  title,
  description,
  children,
  actions,
  className,
}: ViewLayoutProps) {
  return (
    <div className={cn("stagger-children space-y-8 min-w-0 overflow-x-hidden", className)}>
      {/* View header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
            {title}
          </h1>
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/* View content */}
      {children}
    </div>
  );
}

/* Reusable card section within views */
interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  children,
  className,
  actions,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "card-elevated rounded-xl border border-border/50 bg-card",
        className,
      )}
    >
      <div className="flex items-start justify-between border-b border-border/40 px-6 py-4">
        <div className="space-y-0.5">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

/* Form field helper */
interface FieldGroupProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldGroup({
  label,
  hint,
  children,
  className,
}: FieldGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {hint ? (
          <span className="shrink-0 text-[11px] text-muted-foreground/70">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/* Status pill */
interface StatusPillProps {
  status: "ready" | "incomplete" | "running" | "error";
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const styles = {
    ready:
      "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/25",
    incomplete:
      "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/25",
    running:
      "bg-primary/10 text-primary ring-primary/20 dark:bg-primary/15 dark:ring-primary/25",
    error:
      "bg-destructive/10 text-destructive ring-destructive/20 dark:bg-destructive/15 dark:ring-destructive/25",
  };

  const defaultLabels = {
    ready: "Ready",
    incomplete: "Needs attention",
    running: "Running",
    error: "Error",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        styles[status],
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-emerald-500": status === "ready",
          "bg-amber-500": status === "incomplete",
          "bg-primary animate-pulse": status === "running",
          "bg-destructive": status === "error",
        })}
      />
      {label ?? defaultLabels[status]}
    </span>
  );
}
