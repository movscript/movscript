"use client";

import * as React from "react";

import { cn } from "../../../../../../lib/cn";

export const AgentGeneratedResultMissingNotice = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("ms-agent-generated-result-missing-notice", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedResultMissingNotice.displayName = "AgentGeneratedResultMissingNotice";

export const AgentGeneratedResultHelperText = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-result-card__helper", className)} {...props} />;
  }
);

AgentGeneratedResultHelperText.displayName = "AgentGeneratedResultHelperText";
