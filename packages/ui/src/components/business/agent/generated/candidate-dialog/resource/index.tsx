"use client";

import * as React from "react";
import { cn } from "../../../../../../lib/cn";

export interface AgentGeneratedCandidateResourceItemProps extends React.HTMLAttributes<HTMLDivElement> {
  attached?: boolean;
}

export const AgentGeneratedCandidateResourceItem = React.forwardRef<HTMLDivElement, AgentGeneratedCandidateResourceItemProps>(
  ({ attached = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-attached={attached ? "true" : undefined}
        className={cn("ms-agent-generated-candidate-resource-item", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedCandidateResourceItem.displayName = "AgentGeneratedCandidateResourceItem";

export const AgentGeneratedCandidateResourceRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-resource-item__row", className)} {...props} />;
  }
);

AgentGeneratedCandidateResourceRow.displayName = "AgentGeneratedCandidateResourceRow";

export const AgentGeneratedCandidateResourceIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-generated-candidate-resource-item__icon", className)} {...props} />;
  }
);

AgentGeneratedCandidateResourceIcon.displayName = "AgentGeneratedCandidateResourceIcon";

export const AgentGeneratedCandidateResourceBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-resource-item__body", className)} {...props} />;
  }
);

AgentGeneratedCandidateResourceBody.displayName = "AgentGeneratedCandidateResourceBody";

export const AgentGeneratedCandidateResourceName = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-resource-item__name", className)} {...props} />;
  }
);

AgentGeneratedCandidateResourceName.displayName = "AgentGeneratedCandidateResourceName";

export const AgentGeneratedCandidateResourceMeta = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-resource-item__meta", className)} {...props} />;
  }
);

AgentGeneratedCandidateResourceMeta.displayName = "AgentGeneratedCandidateResourceMeta";
