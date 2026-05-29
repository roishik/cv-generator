import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/**
 * Loading skeleton composites — shaped to the final layout,
 * paper-tone shimmer at ≤180ms.
 *
 * Following the spec: "skeletons, not spinners" for content.
 * Each composite mirrors the visual weight of the real component.
 */

/** Single document card skeleton */
export function DocumentCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card p-0",
        className,
      )}
      aria-hidden
    >
      {/* Thumbnail */}
      <Skeleton className="aspect-[794/300] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Grid of document card skeletons */
export function DocumentCardGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      aria-busy
      aria-label="Loading documents"
    >
      {Array.from({ length: count }).map((_, i) => (
        <DocumentCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Profile / knowledge-base form skeleton */
export function ProfileFormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)} aria-busy aria-label="Loading profile">
      {/* Section heading */}
      <Skeleton className="h-5 w-32" />
      {/* Fields */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
      {/* Second section */}
      <Skeleton className="h-5 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/** Page-level header skeleton */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

/** Generic content area shimmer (full-width rows) */
export function ContentSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-3", className)}
      aria-busy
      aria-label="Loading content"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: `${70 + ((i * 17) % 30)}%` }}
        />
      ))}
    </div>
  );
}
