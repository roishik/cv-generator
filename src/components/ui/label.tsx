import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label — form label using the `label` type token (12/16, 500, +0.02em).
 * Always tie to a control via htmlFor for accessibility.
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-xs font-medium tracking-[0.02em] text-foreground",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
