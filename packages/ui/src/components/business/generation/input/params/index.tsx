import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export type GenerationParamPreviewItem = {
  label: ReactNode;
  value: ReactNode;
  tone?: "neutral" | "ready" | "warning";
};

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

export function GenerationParamPreview({
  items,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  items: readonly GenerationParamPreviewItem[];
}) {
  const visibleItems = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (visibleItems.length === 0) return null;
  return (
    <div className={cn("generation-param-preview", className)} {...props}>
      {visibleItems.map((item, index) => (
        <span key={index} className="generation-param-preview__item" data-tone={item.tone}>
          <b>{item.label}</b>
          <em>{item.value}</em>
        </span>
      ))}
    </div>
  );
}
