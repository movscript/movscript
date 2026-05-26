import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppContentLayout } from "../../../../layout";
import { AppEmptyState } from "../../../app/state";
import { Button, type ButtonProps } from "../../../../primitives";

export function JobsPageShell({
  header,
  filters,
  pager,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  filters?: ReactNode;
  pager?: ReactNode;
}) {
  return (
    <AppContentLayout
      variant="workspace"
      padding="none"
      scroll="hidden"
      contentClassName={cn("jobs-page-shell", className)}
      {...props}
    >
      {header}
      {filters}
      <main className="jobs-page-shell__content">{children}</main>
      {pager}
    </AppContentLayout>
  );
}

export function JobsLoadingState({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("jobs-loading-state", className)} {...props}>
      {icon ? <span className="jobs-loading-state__icon">{icon}</span> : null}
      <span className="jobs-loading-state__text">{children}</span>
    </div>
  );
}

export function JobsEmptyState(props: ComponentPropsWithoutRef<typeof AppEmptyState>) {
  return <AppEmptyState {...props} />;
}

export function JobsActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn("jobs-action-button", className)} {...props} />;
}
