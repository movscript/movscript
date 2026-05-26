import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface, type SurfaceTone } from "../../../../primitives";

export function AppDashboardPipelineStep({
  asChild = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
}) {
  return (
    <Surface
      asChild={asChild}
      kind="item"
      density="compact"
      emphasis="unframed"
      interaction="hover"
      className={cn("app-dashboard-pipeline-step", className)}
      {...props}
    />
  );
}

export function AppDashboardEntry({
  asChild = false,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  asChild?: boolean;
  tone?: SurfaceTone;
}) {
  return (
    <Surface
      asChild={asChild}
      kind="item"
      tone={tone}
      density="compact"
      emphasis="unframed"
      interaction="hover"
      className={cn("app-dashboard-entry", className)}
      {...props}
    />
  );
}
