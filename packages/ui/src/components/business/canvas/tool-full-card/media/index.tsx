import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { AppMediaFrame } from "../../../app";

export function CanvasToolFullOutputFrame({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppMediaFrame variant="stage" className={cn("canvas-tool-full-output", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}

export function CanvasToolFullInputRegion({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("canvas-tool-full-input nodrag nowheel", className)} {...props}>
      {children}
    </div>
  );
}
