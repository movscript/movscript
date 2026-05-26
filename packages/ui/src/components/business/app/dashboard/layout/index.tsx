import type { HTMLAttributes } from "react";

import { cn } from "../../../../../lib/cn";

export function AppDashboardHeroGrid({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("app-dashboard-hero-grid", className)} {...props} />;
}

export function AppDashboardSplit({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("app-dashboard-split", className)} {...props} />;
}

export function AppDashboardRegion({
  primary,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  primary?: boolean;
}) {
  return <div className={cn("app-dashboard-region", primary && "app-dashboard-region--primary", className)} {...props} />;
}

export function AppDashboardSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("app-dashboard-section", className)} {...props} />;
}

export function AppDashboardSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-dashboard-section__header", className)} {...props} />;
}

export function AppDashboardDividerBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-dashboard-divider-block", className)} {...props} />;
}

export function AppDashboardMetaCell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("app-dashboard-meta-cell", className)} {...props} />;
}
