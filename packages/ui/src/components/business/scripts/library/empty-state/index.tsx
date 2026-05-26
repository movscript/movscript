import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

type ScriptLibraryEmptyStateAttributes = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export interface ScriptLibraryEmptyStateProps extends ScriptLibraryEmptyStateAttributes {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}

export function ScriptLibraryEmptyState({
  icon,
  title,
  action,
  className,
  ...props
}: ScriptLibraryEmptyStateProps) {
  return (
    <div className={cn("script-library-empty", className)} {...props}>
      {icon ? <span className="script-library-empty__icon">{icon}</span> : null}
      <p className="script-library-empty__title">{title}</p>
      {action}
    </div>
  );
}
