import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppIconFrame, AppInlineMeta } from "../../../app";

export function GenerationInlineResourceChip({
  media,
  label,
  className,
  ...props
}: {
  media?: ReactNode;
  label: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <AppInlineMeta asChild className={cn("generation-result-resource-chip", className)} {...props}>
      <span>
        {media ? (
          <AppIconFrame className="generation-result-resource-chip__media">
            {media}
          </AppIconFrame>
        ) : null}
        <span className="ms-text-truncate generation-result-resource-chip__label">{label}</span>
      </span>
    </AppInlineMeta>
  );
}

export function GenerationContextSummary({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-stack type-caption generation-result-context-summary", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationContextRow({
  icon,
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className={cn("ms-action-row generation-result-context-row", className)} {...props}>
      <span className="ms-inline-center generation-result-context-row__icon">{icon}</span>
      <span className="generation-result-context-row__label">{label}</span>
      {children}
    </div>
  );
}

export function GenerationContextValue({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("ms-text-truncate generation-result-context-row__value", className)} {...props}>
      {children}
    </span>
  );
}

export function GenerationContextValueList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-action-row generation-result-context-row__values", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationContextMeta({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <AppInlineMeta className={cn("generation-result-context-meta", className)} {...props}>
      {children}
    </AppInlineMeta>
  );
}
