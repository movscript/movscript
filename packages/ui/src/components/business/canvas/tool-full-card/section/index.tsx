import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export function CanvasToolFullSection({
  icon,
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  label?: ReactNode;
}) {
  return (
    <div className={cn("canvas-tool-full-section", className)} {...props}>
      {label ? (
        <p className="canvas-tool-full-section__label">
          {icon}
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}
