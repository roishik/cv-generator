import { cn } from "@/lib/utils";

/**
 * Section — reusable content section with an optional heading.
 *
 * Usage:
 *   <Section title="Recent documents" description="Your last 4 tailored CVs.">
 *     <DocumentCardGrid />
 *   </Section>
 *
 * Design:
 * - Title: Inter 600 18/26 (heading-2)
 * - Description: body-sm 13/20, muted
 * - Hairline separator below title
 */

interface SectionProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4 border-b border-border pb-2">
          <div>
            {title && (
              <h2 className="text-[18px] font-semibold leading-[1.444] tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
