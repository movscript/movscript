import type { HTMLAttributes, ReactNode } from "react";

import { cn } from '@movscript/ui/primitives';
import type { IconComponent } from "@movscript/ui/primitives";

export interface ScriptWorkspaceShellProps extends HTMLAttributes<HTMLDivElement> {
  frameClassName?: string;
}

export function ScriptWorkspaceShell({
  children,
  className,
  frameClassName,
  ...props
}: ScriptWorkspaceShellProps) {
  return (
    <div className={cn("script-workbench-shell", className)} {...props}>
      <div className={cn("script-workbench-frame", frameClassName)}>{children}</div>
    </div>
  );
}

export function ScriptWorkspaceInspector({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <aside className={cn("script-workbench-inspector", className)} {...props}>
      <div className="script-workbench-inspector__body">{children}</div>
    </aside>
  );
}

export function ScriptWorkspaceDetailContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-workbench-detail-content", className)} {...props} />;
}

export interface ScriptWorkspaceEmptySelectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: IconComponent;
  title: ReactNode;
  action?: ReactNode;
}

export function ScriptWorkspaceEmptySelection({
  icon: Icon,
  title,
  action,
  className,
  ...props
}: ScriptWorkspaceEmptySelectionProps) {
  return (
    <div className={cn("script-workspace-empty-selection", className)} {...props}>
      {Icon ? <Icon size={24} className="script-workspace-empty-selection__icon" /> : null}
      <p className="script-workspace-empty-selection__title">{title}</p>
      {action ? <div className="script-workspace-empty-selection__action">{action}</div> : null}
    </div>
  );
}
