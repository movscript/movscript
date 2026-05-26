"use client";

import * as React from "react";
import { cn } from "../../../lib/cn";
import { Surface } from "../../primitives";

export interface AgentSurfaceBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  variant?: "surface" | "subtle" | "card";
}

export const AgentSurfaceBlock = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ asChild = false, variant = "surface", className, ...props }, ref) => {
    const blockClassName = cn("ms-agent-frame ms-agent-surface-block", `ms-agent-surface-block--${variant}`, className);
    return (
      <Surface
        ref={ref}
        asChild={asChild}
        kind="panel"
        density="normal"
        emphasis={variant === "card" ? "raised" : variant === "subtle" ? "muted" : "plain"}
        className={blockClassName}
        data-variant={variant}
        {...props}
      />
    );
  }
);

AgentSurfaceBlock.displayName = "AgentSurfaceBlock";
