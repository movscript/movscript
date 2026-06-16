"use client";

import * as React from "react";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { cn } from "../../../../../lib/cn";
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from "../../surface-block";

export const AgentDiagnosticCard = React.forwardRef<HTMLDivElement, AgentSurfaceBlockProps>(
  ({ className, variant = "surface", ...props }, ref) => {
    return <AgentSurfaceBlock ref={ref} variant={variant} className={cn("ms-agent-diagnostic-card", className)} {...props} />;
  }
);

AgentDiagnosticCard.displayName = "AgentDiagnosticCard";

export const AgentDiagnosticHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-diagnostic-card__header", className)} {...props} />;
  }
);

AgentDiagnosticHeader.displayName = "AgentDiagnosticHeader";

export const AgentDiagnosticHeaderBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-diagnostic-card__header-body", className)} {...props} />;
  }
);

AgentDiagnosticHeaderBody.displayName = "AgentDiagnosticHeaderBody";

export const AgentDiagnosticTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-type-label ms-agent-diagnostic-card__title", className)} {...props} />;
  }
);

AgentDiagnosticTitle.displayName = "AgentDiagnosticTitle";

export const AgentDiagnosticDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn("ms-type-caption ms-agent-diagnostic-card__description", className)} {...props} />;
  }
);

AgentDiagnosticDescription.displayName = "AgentDiagnosticDescription";

export const AgentDiagnosticActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "icon-xs", variant = "ghost", ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} className={cn("ms-agent-diagnostic-card__action", className)} {...props} />;
  }
);

AgentDiagnosticActionButton.displayName = "AgentDiagnosticActionButton";
