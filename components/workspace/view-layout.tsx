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
    <div className={cn("stagger-children space-y-8", className)}>
      {/* View header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary/70">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
        "rounded-xl border border-border/60 bg-card p-6 shadow-sm",
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
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
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground/90">
          {label}
        </label>
        {hint ? (
          <span className="text-xs text-muted-foreground/60">{hint}</span>
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
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    incomplete:
      "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    running:
      "bg-primary/10 text-primary dark:bg-primary/20",
    error:
      "bg-destructive/10 text-destructive dark:bg-destructive/20",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
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
