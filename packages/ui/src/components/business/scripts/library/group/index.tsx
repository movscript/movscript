import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export interface ScriptLibraryGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  count: ReactNode;
}

export function ScriptLibraryGroup({
  label,
  count,
  children,
  className,
  ...props
}: ScriptLibraryGroupProps) {
  return (
    <div className={cn("script-library-group", className)} {...props}>
      <div className="script-library-group__header">
        <p className="script-library-group__label">{label}</p>
        <span className="script-library-group__count">{count} 项</span>
      </div>
      <div className="script-library-group__items">{children}</div>
    </div>
  );
}
