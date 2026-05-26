import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives";
import { AppControlGroup } from "../../../app";

export function WorkbenchAppShell({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("workbench-app-shell", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkbenchAppTabBar({
  tabs,
  summary,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tabs: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div className={cn("workbench-app-tab-bar", className)} {...props}>
      <AppControlGroup className="workbench-app-tab-bar__tabs">
        {tabs}
      </AppControlGroup>
      {summary ? <div className="workbench-app-tab-bar__summary">{summary}</div> : null}
    </div>
  );
}

export const WorkbenchAppTabButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
  icon?: ReactNode;
}>(({ active = false, icon, children, className, variant, size = "sm", ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant ?? (active ? "soft" : "ghost")}
    size={size}
    className={cn("workbench-app-tab-button", className)}
    data-active={active ? "true" : "false"}
    {...props}
  >
    {icon ? <span className="workbench-app-tab-button__icon">{icon}</span> : null}
    <span className="workbench-app-tab-button__label">{children}</span>
  </Button>
));

WorkbenchAppTabButton.displayName = "WorkbenchAppTabButton";

export function WorkbenchAppSummary({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("workbench-app-summary", className)} {...props}>
      {icon ? <span className="workbench-app-summary__icon">{icon}</span> : null}
      <span className="workbench-app-summary__text">{children}</span>
    </div>
  );
}

export function WorkbenchAppContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("workbench-app-content", className)} {...props}>
      {children}
    </div>
  );
}
