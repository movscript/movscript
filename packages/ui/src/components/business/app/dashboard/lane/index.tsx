import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { Surface, type SurfaceTone } from "../../../../primitives";

export function AppDashboardLane({
  tone = "neutral",
  selected,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: SurfaceTone;
  selected?: boolean;
}) {
  return (
    <Surface
      kind="item"
      tone={tone}
      density="normal"
      emphasis="unframed"
      interaction={selected ? "selected" : "hover"}
      className={cn("app-dashboard-lane", className)}
      {...props}
    />
  );
}

export function AppDashboardLaneSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-dashboard-lane__summary", className)} {...props} />;
}
