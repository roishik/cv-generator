import { cn } from "@/lib/utils";

/**
 * PageHeader — reusable page-level heading block.
 *
 * Usage:
 *   <PageHeader
 *     eyebrow="Documents"
 *     heading="Your tailored CVs"
 *     subheading="Manage versions and exports."
 *     actions={<Button>Export</Button>}
 *   />
 *
 * Design:
 * - Heading uses Inter 600 24/30 (heading-1 from the type scale)
 * - Optional eyebrow uses label style (12/16, 500, +0.02em letter-spacing)
 * - Optional subheading uses body-sm (13/20, 400)
 * - Optional actions slot floats right on desktop
 */

interface PageHeaderProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  heading,
  subheading,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold leading-[1.25] tracking-tight text-foreground">
          {heading}
        </h1>
        {subheading && (
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {subheading}
          </p>
        )}
      </div>

      {actions && (
        <div className="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
