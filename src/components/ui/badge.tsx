import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold tracking-normal transition-colors [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-white/10 bg-white/[0.07] text-text-soft",
        primary: "border-primary/35 bg-primary/15 text-primary",
        secondary: "border-secondary/35 bg-secondary/15 text-secondary",
        accent: "border-accent/35 bg-accent/15 text-accent",
        success: "border-success/35 bg-success/15 text-success",
        warning: "border-warning/35 bg-warning/15 text-warning",
        danger: "border-danger/35 bg-danger/15 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
