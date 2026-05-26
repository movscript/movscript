import type { HTMLAttributes } from "react";

import { AsChildSlot } from "../../../../../lib/asChild";
import { cn } from "../../../../../lib/cn";

export function AppCodeBlock({
  children,
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? AsChildSlot : "pre";
  return (
    <Comp className={cn("app-code-block", className)} {...props}>
      {children}
    </Comp>
  );
}
