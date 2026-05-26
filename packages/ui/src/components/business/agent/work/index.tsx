"use client";

import * as React from "react";

import { cn } from "../../../../lib/cn";
import { Surface } from "../../../primitives";

export const AgentWorkSurface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-container ms-agent-work-surface", className)} {...props} />;
  }
);

AgentWorkSurface.displayName = "AgentWorkSurface";

export const AgentWorkHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-bar ms-agent-work-header", className)} {...props} />;
  }
);

AgentWorkHeader.displayName = "AgentWorkHeader";

export const AgentWorkTitleBlock = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-stack ms-agent-titleblock ms-agent-work-title", className)} {...props} />;
  }
);

AgentWorkTitleBlock.displayName = "AgentWorkTitleBlock";

export const AgentWorkActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-actions ms-agent-work-actions", className)} {...props} />;
  }
);

AgentWorkActions.displayName = "AgentWorkActions";

export const AgentWorkBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-stack ms-agent-work-body", className)} {...props} />;
  }
);

AgentWorkBody.displayName = "AgentWorkBody";

export const AgentWorkLane = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-agent-scrollarea ms-agent-work-lane", className)} {...props} />;
  }
);

AgentWorkLane.displayName = "AgentWorkLane";

export const AgentWorkRail = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <aside ref={ref} className={cn("ms-agent-scrollarea ms-agent-work-rail", className)} {...props} />;
  }
);

AgentWorkRail.displayName = "AgentWorkRail";

export const AgentCommandBar = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => {
    return <form ref={ref} className={cn("ms-agent-stack ms-agent-commandbar", className)} {...props} />;
  }
);

AgentCommandBar.displayName = "AgentCommandBar";

export interface AgentInstructionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  meta?: React.ReactNode;
}

export const AgentInstructionCard = React.forwardRef<HTMLDivElement, AgentInstructionCardProps>(
  ({ className, title, meta, children, ...props }, ref) => {
    return (
      <Surface ref={ref} kind="card" density="normal" emphasis="raised" className={cn("ms-agent-frame ms-agent-instruction", className)} {...props}>
        {(title || meta) ? (
          <div className="ms-frame__header ms-agent-frame__header ms-agent-instruction__header">
            {title ? <span className="ms-agent-text ms-agent-text--truncate ms-frame__title ms-agent-instruction__title">{title}</span> : null}
            {meta ? <span className="ms-agent-text ms-agent-text--meta ms-agent-instruction__meta">{meta}</span> : null}
          </div>
        ) : null}
        {children ? <div className="ms-frame__body ms-agent-instruction__body">{children}</div> : null}
      </Surface>
    );
  }
);

AgentInstructionCard.displayName = "AgentInstructionCard";

export interface AgentRailSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export const AgentRailSection = React.forwardRef<HTMLDivElement, AgentRailSectionProps>(
  ({ className, title, action, children, ...props }, ref) => {
    return (
      <Surface ref={ref} kind="panel" density="normal" emphasis="plain" className={cn("ms-agent-frame ms-agent-rail-section", className)} {...props}>
        {(title || action) ? (
          <div className="ms-frame__header ms-agent-frame__header ms-agent-rail-section__header">
            {title ? <span className="ms-agent-text ms-agent-text--truncate ms-frame__title ms-agent-rail-section__title">{title}</span> : null}
            {action ? <span className="ms-agent-text ms-agent-text--meta ms-agent-rail-section__action">{action}</span> : null}
          </div>
        ) : null}
        {children ? <div className="ms-agent-stack ms-frame__body ms-agent-rail-section__body">{children}</div> : null}
      </Surface>
    );
  }
);

AgentRailSection.displayName = "AgentRailSection";
