import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value = 0, ...props }, ref) => {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      ref={ref}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/[0.08]", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
      {...props}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-500"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
});
Progress.displayName = "Progress";

export { Progress };
