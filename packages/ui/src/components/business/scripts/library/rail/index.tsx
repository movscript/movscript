import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

type ScriptLibraryRailAttributes = Omit<HTMLAttributes<HTMLElement>, "title">;

export interface ScriptLibraryRailProps extends ScriptLibraryRailAttributes {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}

export function ScriptLibraryRail({
  icon,
  title,
  action,
  children,
  className,
  ...props
}: ScriptLibraryRailProps) {
  return (
    <aside className={cn("script-library-rail", className)} {...props}>
      <div className="script-library-rail__header">
        <div className="script-library-rail__title">
          {icon ? <span className="script-library-rail__title-icon">{icon}</span> : null}
          <span className="script-library-rail__title-text">{title}</span>
        </div>
        {action ? <div className="script-library-rail__action">{action}</div> : null}
      </div>
      <div className="script-library-rail__body">{children}</div>
    </aside>
  );
}
