"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { DropdownMenuContent } from "../../../../primitives/dropdown-menu";
import { cn } from "../../../../../lib/cn";

export const AgentActivityDividerActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-activity-divider-actions", className)} {...props} />;
  }
);

AgentActivityDividerActions.displayName = "AgentActivityDividerActions";

export const AgentActivityMenuButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "icon-xs", variant = "ghost", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-activity-menu-button", className)} {...props} />;
  }
);

AgentActivityMenuButton.displayName = "AgentActivityMenuButton";

export const AgentActivityMenuContent = React.forwardRef<React.ElementRef<typeof DropdownMenuContent>, React.ComponentPropsWithoutRef<typeof DropdownMenuContent>>(
  ({ className, ...props }, ref) => {
    return <DropdownMenuContent ref={ref} className={cn("ms-agent-activity-menu-content", className)} {...props} />;
  }
);

AgentActivityMenuContent.displayName = "AgentActivityMenuContent";

export const AgentActivityMenuIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-activity-menu-icon", className)} {...props} />;
  }
);

AgentActivityMenuIcon.displayName = "AgentActivityMenuIcon";
