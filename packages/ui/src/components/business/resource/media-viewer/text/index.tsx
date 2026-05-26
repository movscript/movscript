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
      <div className="resource-media-text-thumb__header">
        {icon}
        <span>{name}</span>
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
          <div className="resource-media-text-preview__loading">{loadingContent}</div>
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
    <AppCodeBlock className={cn("resource-media-code", `resource-media-code--${variant}`, className)}>
      {children}
    </AppCodeBlock>
  );
}
