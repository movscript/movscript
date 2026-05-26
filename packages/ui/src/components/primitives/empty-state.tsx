"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { Surface } from "./surface";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionClassName?: string;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      action,
      className,
      iconClassName,
      titleClassName,
      descriptionClassName,
      actionClassName,
      children,
      ...props
    },
    ref,
  ) => (
    <Surface ref={ref} kind="panel" density="normal" emphasis="unframed" className={cn("ms-empty-state", className)} {...props}>
      {icon ? <span className={cn("ms-center ms-empty-state__icon", iconClassName)}>{icon}</span> : null}
      {title ? <p className={cn("ms-empty-state__title", titleClassName)}>{title}</p> : null}
      {description ? <p className={cn("ms-empty-state__description", descriptionClassName)}>{description}</p> : null}
      {children}
      {action ? <div className={cn("ms-empty-state__action", actionClassName)}>{action}</div> : null}
    </Surface>
  ),
);

EmptyState.displayName = "EmptyState";
