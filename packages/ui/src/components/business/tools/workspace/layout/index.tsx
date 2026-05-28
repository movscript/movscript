import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export interface ToolPageFrameProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  sidebar?: ReactNode;
}

export function ToolPageFrame({ header, sidebar, children, className, ...props }: ToolPageFrameProps) {
  return (
    <div className={cn("tool-page-frame", className)} {...props}>
      {header ? header : null}
      <div className="tool-page-frame__body">
        {sidebar}
        <main className="tool-page-frame__main">{children}</main>
      </div>
    </div>
  );
}
