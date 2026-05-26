import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";
import { AppPager, AppTextEmptyState } from "../../../app";

export function ResourcePanelShell({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePanelTabs({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel__tabs", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePanelFilters({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel__filters", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePanelContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("resource-panel__content", className)} {...props}>
      {children}
    </div>
  );
}

export function ResourcePanelEmptyState({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppTextEmptyState className={cn("resource-panel-empty", className)} {...props}>
      {children}
    </AppTextEmptyState>
  );
}

export function ResourcePanelPager({
  className,
  ...props
}: Parameters<typeof AppPager>[0]) {
  return <AppPager className={cn("resource-panel__pager", className)} {...props} />;
}
