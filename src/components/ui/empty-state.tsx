import { cn } from "@/lib/utils";

/**
 * EmptyState — standardized empty state component.
 *
 * Art direction:
 * - Fraunces serif headline (display-lg style — editorial, warm)
 * - Single sentence description in muted body text
 * - One primary action (optional)
 * - A subtle lapel/page-fold motif (SVG, ink color, low opacity)
 * - Never clip-art, never emoji
 *
 * Usage:
 *   <EmptyState
 *     heading="No documents yet"
 *     description="Upload a resume and we'll build your profile."
 *     action={<Button>Upload resume</Button>}
 *   />
 */

interface EmptyStateProps {
  /** Fraunces serif headline */
  heading: string;
  /** Single sentence in muted body */
  description?: string;
  /** One primary action */
  action?: React.ReactNode;
  className?: string;
}

/** Lapel / page-fold motif — the brand mark as a subtle SVG */
function LapelMotif({ className }: { className?: string }) {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className={cn("text-muted-foreground opacity-20", className)}
    >
      {/* A single folded-corner notch — the Lapel/Tailor brand mark */}
      <path
        d="M8 8h24l8 8v24H8V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Fold crease */}
      <path
        d="M32 8v8h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyState({
  heading,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 px-8 text-center",
        className,
      )}
    >
      <LapelMotif />

      <div className="space-y-1.5">
        <h3 className="font-serif text-2xl font-semibold leading-tight text-foreground">
          {heading}
        </h3>
        {description && (
          <p className="mx-auto max-w-sm text-[13px] leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
