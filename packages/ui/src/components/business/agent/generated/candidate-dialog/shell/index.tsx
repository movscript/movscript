"use client";

import * as React from "react";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../../primitives/dialog";
import { Badge, type BadgeProps } from "../../../../../primitives/badge";
import { Button, type ButtonProps } from "../../../../../primitives/button";
import { Input, type InputProps } from "../../../../../primitives/input";
import { cn } from "../../../../../../lib/cn";
import { AppTextEmptyState } from "../../../../app/state";

export function AgentGeneratedCandidateDialogContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className={cn("ms-agent-generated-candidate-dialog", className)} {...props} />;
}

export function AgentGeneratedCandidateDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn("ms-agent-generated-candidate-dialog__header", className)} {...props} />;
}

export function AgentGeneratedCandidateDialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle className={className} {...props} />;
}

export function AgentGeneratedCandidateDialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogDescription>) {
  return <DialogDescription className={className} {...props} />;
}

export const AgentGeneratedCandidateDialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__body", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogBody.displayName = "AgentGeneratedCandidateDialogBody";

export const AgentGeneratedCandidateDialogSidebar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__sidebar", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogSidebar.displayName = "AgentGeneratedCandidateDialogSidebar";

export const AgentGeneratedCandidateDialogMain = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__main", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogMain.displayName = "AgentGeneratedCandidateDialogMain";

export const AgentGeneratedCandidateDialogSectionHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__section-header", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogSectionHeader.displayName = "AgentGeneratedCandidateDialogSectionHeader";

export const AgentGeneratedCandidateDialogList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__list", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogList.displayName = "AgentGeneratedCandidateDialogList";

export const AgentGeneratedCandidateDialogControls = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-generated-candidate-dialog__controls", className)} {...props} />;
  }
);

AgentGeneratedCandidateDialogControls.displayName = "AgentGeneratedCandidateDialogControls";

export function AgentGeneratedCandidateDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <DialogFooter className={cn("ms-agent-generated-candidate-dialog__footer", className)} {...props} />;
}

export const AgentGeneratedCandidateBadge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, ...props }, ref) => {
    return <Badge ref={ref} className={cn("ms-agent-generated-candidate-dialog__badge", className)} {...props} />;
  }
);

AgentGeneratedCandidateBadge.displayName = "AgentGeneratedCandidateBadge";

export const AgentGeneratedCandidateActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return <Button ref={ref} className={cn("ms-agent-generated-candidate-dialog__action", className)} {...props} />;
  }
);

AgentGeneratedCandidateActionButton.displayName = "AgentGeneratedCandidateActionButton";

export const AgentGeneratedCandidateSearchInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, controlSize = "sm", ...props }, ref) => {
    return (
      <Input
        ref={ref}
        controlSize={controlSize}
        className={cn("ms-agent-generated-candidate-dialog__search", className)}
        {...props}
      />
    );
  }
);

AgentGeneratedCandidateSearchInput.displayName = "AgentGeneratedCandidateSearchInput";

export function AgentGeneratedCandidateEmptyState({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AppTextEmptyState>) {
  return <AppTextEmptyState className={cn("ms-agent-generated-candidate-dialog__empty", className)} {...props} />;
}
