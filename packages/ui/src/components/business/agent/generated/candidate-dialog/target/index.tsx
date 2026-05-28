"use client";

import * as React from "react";
import { cn } from "../../../../../../lib/cn";
import { WorkbenchList, WorkbenchListItem } from "../../../../workbench/list";

export const AgentGeneratedCandidateTargetListFrame = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("ms-agent-generated-candidate-target-list", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedCandidateTargetListFrame.displayName = "AgentGeneratedCandidateTargetListFrame";

export function AgentGeneratedCandidateTargetList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof WorkbenchList>) {
  return <WorkbenchList className={cn("ms-agent-generated-candidate-target-list__items", className)} {...props} />;
}

export function AgentGeneratedCandidateTargetItem({
  className,
  density = "compact",
  ...props
}: React.ComponentPropsWithoutRef<typeof WorkbenchListItem>) {
  return (
    <WorkbenchListItem
      density={density}
      className={cn("ms-agent-generated-candidate-target-list__item", className)}
      {...props}
    />
  );
}

export const AgentGeneratedCandidateEmptyMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-empty-message", className)} {...props} />;
  }
);

AgentGeneratedCandidateEmptyMessage.displayName = "AgentGeneratedCandidateEmptyMessage";

export const AgentGeneratedCandidateTargetRow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-target-row", className)} {...props} />;
  }
);

AgentGeneratedCandidateTargetRow.displayName = "AgentGeneratedCandidateTargetRow";

export const AgentGeneratedCandidateTargetTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-target-title", className)} {...props} />;
  }
);

AgentGeneratedCandidateTargetTitle.displayName = "AgentGeneratedCandidateTargetTitle";

export const AgentGeneratedCandidateTargetId = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    return <span ref={ref} className={cn("ms-agent-generated-candidate-target-id", className)} {...props} />;
  }
);

AgentGeneratedCandidateTargetId.displayName = "AgentGeneratedCandidateTargetId";

export const AgentGeneratedCandidateTargetMeta = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-target-meta", className)} {...props} />;
  }
);

AgentGeneratedCandidateTargetMeta.displayName = "AgentGeneratedCandidateTargetMeta";

export const AgentGeneratedCandidateTargetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-agent-generated-candidate-target-description", className)} {...props} />;
  }
);

AgentGeneratedCandidateTargetDescription.displayName = "AgentGeneratedCandidateTargetDescription";

export const AgentGeneratedCandidateSelectedTarget = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("ms-agent-generated-candidate-selected-target", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedCandidateSelectedTarget.displayName = "AgentGeneratedCandidateSelectedTarget";
