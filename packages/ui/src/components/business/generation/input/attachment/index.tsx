import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { Button } from "../../../../primitives/button";
import { AppInlineMeta, AppMediaFrame, AppSurfaceItem } from "../../../app";

export const GenerationAttachmentTag = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  media: ReactNode;
  label: ReactNode;
  removeIcon: ReactNode;
  removeTitle?: string;
  onRemove: () => void;
}>(({ media, label, removeIcon, removeTitle, onRemove, className, ...props }, ref) => (
  <AppInlineMeta asChild className={cn("generation-input-attachment-tag", className)}>
    <div ref={ref} {...props}>
      <AppMediaFrame variant="thumb" className="generation-input-attachment-tag__media">
        {media}
      </AppMediaFrame>
      <span className="generation-input-attachment-tag__label">{label}</span>
      <Button
        type="button"
        onClick={onRemove}
        variant="ghost"
        size="icon-xs"
        title={removeTitle}
        className="generation-input-attachment-tag__remove"
      >
        {removeIcon}
      </Button>
    </div>
  </AppInlineMeta>
));

GenerationAttachmentTag.displayName = "GenerationAttachmentTag";

export function GenerationAttachmentPreview({
  media,
  name,
  typeLabel,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  media: ReactNode;
  name: ReactNode;
  typeLabel?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <AppSurfaceItem
      variant="overlay"
      className={cn("generation-input-attachment-preview", className)}
      style={style}
      {...props}
    >
      <AppMediaFrame variant="thumb" className="generation-input-attachment-preview__media">
        {media}
      </AppMediaFrame>
      <p className="generation-input-attachment-preview__name">{name}</p>
      {typeLabel ? <p className="generation-input-attachment-preview__type">{typeLabel}</p> : null}
    </AppSurfaceItem>
  );
}

export function GenerationAttachmentList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input-attachment-list", className)} {...props}>
      {children}
    </div>
  );
}
