import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export function GenerationParamsRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input-params ms-action-row", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationParamItem({
  children,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
}) {
  return (
    <div className={cn("generation-input-param ms-action-row", className)} {...props}>
      <span className="generation-input-param__label ms-type-caption">{label}</span>
      {children}
    </div>
  );
}
