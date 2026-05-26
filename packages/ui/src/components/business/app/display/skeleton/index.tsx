import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export function AppSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-skeleton", className)} {...props} />;
}
