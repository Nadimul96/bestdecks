import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { icon: "size-6", text: "text-sm" },
  md: { icon: "size-8", text: "text-base" },
  lg: { icon: "size-10", text: "text-lg" },
};

export function Logo({ className, showText = true, size = "md" }: LogoProps) {
  const s = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(s.icon, "shrink-0")}
      >
        {/* Bottom layer — data/binary */}
        <rect
          x="4"
          y="24"
          width="32"
          height="10"
          rx="2"
          className="fill-brand-navy dark:fill-[oklch(0.70_0.06_250)]"
          opacity="0.5"
        />
        <text
          x="20"
          y="31.5"
          textAnchor="middle"
          className="fill-brand-navy dark:fill-[oklch(0.70_0.06_250)]"
          fontSize="5"
          fontFamily="monospace"
          opacity="0.7"
        >
          01101010
        </text>

        {/* Middle layer */}
        <rect
          x="6"
          y="16"
          width="28"
          height="10"
          rx="2"
          className="fill-brand-navy dark:fill-[oklch(0.70_0.06_250)]"
          opacity="0.7"
        />
        <text
          x="20"
          y="23.5"
          textAnchor="middle"
          className="fill-brand-navy dark:fill-[oklch(0.70_0.06_250)]"
          fontSize="5"
          fontFamily="monospace"
          opacity="0.5"
        >
          0011001
        </text>

        {/* Top layer — clean deck */}
        <rect
          x="8"
          y="8"
          width="24"
          height="10"
          rx="2"
          className="fill-brand-navy dark:fill-[oklch(0.80_0.04_250)]"
        />

        {/* Diamond/arrow accent on top layer */}
        <path
          d="M20 10 L24 13 L20 16 L16 13 Z"
          className="fill-background dark:fill-background"
          opacity="0.9"
        />
      </svg>

      {showText && (
        <span
          className={cn(
            "font-semibold tracking-tight text-brand-navy",
            s.text,
          )}
        >
          bestdecks
        </span>
      )}
    </div>
  );
}
