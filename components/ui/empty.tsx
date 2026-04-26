import * as React from "react"
import { cn } from "@/lib/utils"

const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-h-[150px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50",
      className
    )}
    {...props}
  />
))
Empty.displayName = "Empty"

const EmptyTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "mt-4 text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("mt-2 text-sm text-muted-foreground", className)}
    {...props}
  />
))
EmptyDescription.displayName = "EmptyDescription"

export { Empty, EmptyTitle, EmptyDescription }
