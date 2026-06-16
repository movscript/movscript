import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Button } from "../../../../primitives/button";
import { AppInlineMeta, AppMediaFrame, AppSurfaceItem } from "../../../app";

export function GenerationSlotList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-stack generation-input-slots", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationInputSlotCard({
  children,
  indexLabel,
  icon,
  label,
  requiredLabel,
  limitLabel,
  state = "optional",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  indexLabel: ReactNode;
  icon: ReactNode;
  label: ReactNode;
  requiredLabel?: ReactNode;
  limitLabel?: ReactNode;
  state?: "filled" | "required" | "optional";
}) {
  return (
    <AppSurfaceItem
      variant="muted"
      density="compact"
      data-state={state}
      className={cn("ms-stack generation-input-slot", className)}
      {...props}
    >
      <div className="ms-action-row generation-input-slot__header">
        <span className="generation-input-slot__index">{indexLabel}</span>
        <span className="generation-input-slot__icon">{icon}</span>
        <span className="ms-text-truncate ms-type-label generation-input-slot__label">{label}</span>
        {requiredLabel ? <span className="ms-type-caption generation-input-slot__meta">{requiredLabel}</span> : null}
        {limitLabel ? <span className="ms-type-caption generation-input-slot__meta">{limitLabel}</span> : null}
      </div>
      {children}
    </AppSurfaceItem>
  );
}

export function GenerationSlotAttachmentList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ms-action-row generation-input-slot__attachments", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationSlotAttachmentTag({
  media,
  label,
  removeIcon,
  removeTitle,
  onRemove,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  media: ReactNode;
  label: ReactNode;
  removeIcon: ReactNode;
  removeTitle?: string;
  onRemove: () => void;
}) {
  return (
    <AppInlineMeta className={cn("generation-input-slot-tag", className)} {...props}>
      <AppMediaFrame variant="thumb" className="generation-input-slot-tag__media">
        {media}
      </AppMediaFrame>
      <span className="ms-text-truncate generation-input-slot-tag__label">{label}</span>
      <Button
        type="button"
        onClick={onRemove}
        variant="ghost"
        size="icon-xs"
        title={removeTitle}
        className="generation-input-slot-tag__remove"
      >
        {removeIcon}
      </Button>
    </AppInlineMeta>
  );
}

export function GenerationSlotEmpty({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: ReactNode;
}) {
  return (
    <div className={cn("ms-action-row ms-type-caption generation-input-slot__empty", className)} {...props}>
      <span className="ms-inline-center generation-input-slot__empty-icon">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
