import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { AppCodeBlock, AppMediaFrame } from "../../../app";

export function ResourceMediaTextThumb({
  icon,
  name,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
  name: ReactNode;
}) {
  return (
    <AppMediaFrame variant="fill" className={cn("resource-media-text-thumb", className)} {...props}>
      <div className="ms-action-row resource-media-text-thumb__header">
        {icon}
        <span className="ms-text-truncate ms-type-tiny">{name}</span>
      </div>
      {children}
    </AppMediaFrame>
  );
}

export function ResourceMediaTextPreviewPanel({
  loading,
  loadingContent,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  loading?: boolean;
  loadingContent?: ReactNode;
}) {
  return (
    <AppMediaFrame variant="panel" className={cn("resource-media-text-preview", className)} {...props}>
      <div className="resource-media-text-preview__body">
        {loading ? (
          <div className="ms-center ms-type-body resource-media-text-preview__loading">{loadingContent}</div>
        ) : children}
      </div>
    </AppMediaFrame>
  );
}

export function ResourceMediaCodeBlock({
  children,
  variant = "preview",
  className,
}: {
  children: ReactNode;
  variant?: "thumb" | "preview";
  className?: string;
}) {
  return (
    <AppCodeBlock className={cn("resource-media-code", variant === "thumb" ? "ms-type-tiny" : "ms-type-body", `resource-media-code--${variant}`, className)}>
      {children}
    </AppCodeBlock>
  );
}
