import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "button inline-flex items-center justify-center gap-2.75 whitespace-normal min-h-11.5 px-5.25 py-2.75 rounded-1.75 border border-solid border-transparent text-[0.8125rem] font-medium transition-[background,transform] duration-180 ease-linear [&:active:not(:disabled)]:[transform:translateY(0.0625rem)]",
  {
    variants: {
      variant: {
        default:
          "button-primary bg-olive-600 dark:bg-olive-400 text-white dark:text-emerald-950 [&:hover:not(:disabled)]:bg-emerald-900 dark:[&:hover:not(:disabled)]:bg-olive-300",
        outline:
          "button-outline border-olive-300 dark:border-olive-700 bg-transparent [&:hover:not(:disabled)]:bg-taupe-100 dark:[&:hover:not(:disabled)]:bg-neutral-700",
        ghost:
          "button-ghost bg-transparent text-olive-600 dark:text-olive-400 [&:hover:not(:disabled)]:bg-taupe-100 dark:[&:hover:not(:disabled)]:bg-neutral-700",
        destructive: "button-danger bg-amber-800 text-white",
      },
      size: {
        default: "",
        sm: "button-sm min-h-[2.3125rem] px-[0.8125rem] py-[0.4375rem] text-[0.75rem]",
        icon: "button-icon p-2 min-w-9 min-h-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
