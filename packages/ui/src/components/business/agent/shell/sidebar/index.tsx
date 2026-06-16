"use client";

import * as React from "react";
import { AsChildSlot } from "../../../../../lib/asChild";
import { cn } from "../../../../../lib/cn";

export const AgentSidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => {
    return <aside ref={ref} className={cn("ms-agent-sidebar", className)} {...props} />;
  }
);

AgentSidebar.displayName = "AgentSidebar";

export const AgentSidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-action-row ms-agent-bar ms-agent-sidebar__header", className)} {...props} />;
  }
);

AgentSidebarHeader.displayName = "AgentSidebarHeader";

export const AgentSidebarSection = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("ms-stack ms-agent-sidebar__section", className)} {...props} />;
  }
);

AgentSidebarSection.displayName = "AgentSidebarSection";

export const AgentSidebarTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return <h2 ref={ref} className={cn("ms-type-label ms-agent-sidebar__title", className)} {...props} />;
  }
);

AgentSidebarTitle.displayName = "AgentSidebarTitle";

export interface AgentNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  asChild?: boolean;
  density?: "normal" | "compact";
}

export const AgentNavItem = React.forwardRef<HTMLButtonElement, AgentNavItemProps>(
  ({ active = false, asChild = false, density = "normal", className, children, ...props }, ref) => {
    const Comp = asChild ? AsChildSlot : "button";
    return (
      <Comp
        ref={ref}
        type={!asChild ? "button" : undefined}
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : undefined}
        data-density={density}
        className={cn("ms-control ms-type-item ms-agent-nav-item", density === "compact" && "ms-type-label", className)}
        {...(asChild ? { fallback: "button" } : {})}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);

AgentNavItem.displayName = "AgentNavItem";

export interface AgentConversationItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  active?: boolean;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
}

export const AgentConversationItem = React.forwardRef<HTMLButtonElement, AgentConversationItemProps>(
  ({ active = false, icon, title, description, meta, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : undefined}
        data-has-icon={icon ? "true" : undefined}
        className={cn("ms-control ms-agent-conversation", className)}
        {...props}
      >
        <span className="ms-agent-conversation__indicator" aria-hidden="true" />
        {icon ? <span className="ms-inline-center ms-agent-conversation__icon">{icon}</span> : null}
        <span className="ms-stack ms-agent-conversation__body">
          <span className="ms-agent-text ms-text-truncate ms-type-item ms-agent-conversation__title">{title}</span>
          {description ? (
            <span className="ms-agent-text ms-text-truncate ms-agent-text--muted ms-type-label ms-agent-conversation__description">
              {description}
            </span>
          ) : null}
        </span>
        {meta ? <span className="ms-agent-text ms-text-truncate ms-agent-text--muted ms-type-label ms-agent-conversation__meta">{meta}</span> : null}
      </button>
    );
  }
);

AgentConversationItem.displayName = "AgentConversationItem";
