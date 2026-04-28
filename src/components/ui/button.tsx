import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-extrabold tracking-normal ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary/35 bg-primary text-primary-foreground shadow-glow hover:bg-primary/95",
        destructive: "border border-danger/35 bg-danger text-danger-foreground shadow-press hover:bg-danger/95",
        outline: "border border-white/10 bg-white/[0.04] text-foreground shadow-press hover:border-primary/35 hover:bg-primary/10 hover:text-primary",
        secondary: "border border-secondary/35 bg-secondary text-secondary-foreground shadow-press hover:bg-secondary/95",
        accent: "border border-accent/35 bg-accent text-accent-foreground shadow-press hover:bg-accent/95",
        surface: "border border-white/10 bg-white/[0.07] text-foreground shadow-press hover:bg-white/[0.11]",
        ghost: "text-text-soft hover:bg-white/[0.07] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-5 py-3",
        sm: "h-10 rounded-lg px-3 text-xs",
        lg: "h-14 rounded-xl px-7 text-base",
        icon: "h-11 w-11 rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
