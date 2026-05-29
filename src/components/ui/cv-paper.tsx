import { cn } from "@/lib/utils";

/**
 * CvPaper — the fixed convention wrapper for all CV preview surfaces.
 *
 * Design contract (from 02-ux-design-spec.md §2.1):
 * "The CV preview pane is ALWAYS rendered on its own white paper
 *  regardless of app theme — you never edit a resume on a black background.
 *  In dark mode the preview sits in a darker 'lightbox' frame with a
 *  subtle paper drop shadow."
 *
 * Usage:
 *   <CvPaper>
 *     <CvPreview data={cvData} template="sidebar" />
 *   </CvPaper>
 *
 * The outer lightbox (PreviewFrame) handles the dark-mode backdrop and
 * the drop shadow. This component enforces only the white paper surface.
 */

interface CvPaperProps {
  /** Applies the A4 fixed-size convention (794×1123px). Default: false. */
  fixedA4?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function CvPaper({ fixedA4 = false, className, children }: CvPaperProps) {
  return (
    <div
      className={cn(
        // Core invariant: always white, always light-scheme
        "cv-paper",
        fixedA4 ? "w-[794px] min-h-[1123px]" : "w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * PreviewFrame — the lightbox that wraps CvPaper.
 *
 * In light mode: a clean raised surface with paper shadow.
 * In dark mode: a warm charcoal backdrop framing the white paper.
 * The .cv-paper inside always stays white.
 */

interface PreviewFrameProps {
  className?: string;
  children: React.ReactNode;
}

export function PreviewFrame({ className, children }: PreviewFrameProps) {
  return (
    <div
      className={cn(
        // Lightbox backdrop
        "flex items-start justify-center rounded-lg p-6",
        "bg-secondary dark:bg-card",
        // Subtle paper grain
        "paper-grain",
        className,
      )}
    >
      <div
        className={cn(
          // Paper drop shadow (from the spec's shadow-paper token)
          "[box-shadow:0_2px_8px_rgba(26,27,25,0.08),0_16px_40px_rgba(26,27,25,0.10)]",
          "dark:[box-shadow:0_4px_24px_rgba(0,0,0,0.40),0_24px_64px_rgba(0,0,0,0.30)]",
          "overflow-hidden rounded-sm",
        )}
      >
        {children}
      </div>
    </div>
  );
}
