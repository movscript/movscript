import { forwardRef, type DragEvent, type HTMLAttributes, type ReactNode } from "react";

import { AppInlineMeta, AppSurfaceItem } from "@movscript/ui/business/app";
import { CanvasResourceShelfThumbFrame } from "@movscript/ui/business/canvas";
import { Badge } from "@movscript/ui/primitives";
import { toneSurfaceClass, toneTextClass } from "@movscript/ui/semantic";

import { cn } from '@movscript/ui/primitives';
import type { CanvasResourceShelfItem } from "./CanvasResourceShelfUi";

export function CanvasResourceShelfResourceCard({
  item,
  compact = false,
  selectedLabel,
  idPrefix = "#",
  onDragStart,
}: {
  item: CanvasResourceShelfItem;
  compact?: boolean;
  selectedLabel?: ReactNode;
  idPrefix?: ReactNode;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const compactMeta = compact ? (
    <CanvasResourceShelfCardFooter
      idLabel={<>{idPrefix}{item.id}</>}
      meta={item.selected && selectedLabel ? selectedLabel : item.footerMeta}
    />
  ) : null;
  return (
    <CanvasResourceShelfCard
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      compact={compact}
      selected={item.selected}
      title={typeof item.name === "string" ? item.name : undefined}
    >
      <CanvasResourceShelfCardBody>
        <CanvasResourceShelfCardContent>
          {!compact ? (
            <CanvasResourceShelfCardMetaRow>
              <CanvasResourceShelfTypeBadge>{item.type}</CanvasResourceShelfTypeBadge>
              {item.selected && selectedLabel ? <CanvasResourceShelfSelectedBadge>{selectedLabel}</CanvasResourceShelfSelectedBadge> : null}
            </CanvasResourceShelfCardMetaRow>
          ) : null}
          <CanvasResourceShelfResourceName>{item.name}</CanvasResourceShelfResourceName>
          {!compact ? (
            <CanvasResourceShelfResourceDescription>
              <span>{item.footerMeta}</span>
              {item.description}
            </CanvasResourceShelfResourceDescription>
          ) : item.description ? (
            <CanvasResourceShelfResourceDescription>{item.description}</CanvasResourceShelfResourceDescription>
          ) : null}
          {compactMeta}
        </CanvasResourceShelfCardContent>
        <CanvasResourceShelfThumbFrame compact={compact}>
          {item.media}
        </CanvasResourceShelfThumbFrame>
      </CanvasResourceShelfCardBody>
    </CanvasResourceShelfCard>
  );
}

export function CanvasResourceShelfCard({
  compact = false,
  selected = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem
      data-compact={compact ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      className={cn("canvas-resource-shelf-card", selected ? toneSurfaceClass("success") : undefined, className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  );
}

export function CanvasResourceShelfCardBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__body", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfCardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__content", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfCardMetaRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-resource-shelf-card__meta-row", className)} {...props}>
      {children}
    </div>
  );
}

export function CanvasResourceShelfTypeBadge({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("canvas-resource-shelf-card__type", className)} {...props}>
      {children}
    </Badge>
  );
}

export function CanvasResourceShelfSelectedBadge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <AppInlineMeta className={cn("canvas-resource-shelf-card__selected", toneTextClass("success"), className)} {...props}>
      {children}
    </AppInlineMeta>
  );
}

export function CanvasResourceShelfResourceName({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
}) {
  return (
    <p className={cn("canvas-resource-shelf-card__name", className)} {...props}>
      {children}
    </p>
  );
}

export function CanvasResourceShelfResourceDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
}) {
  return (
    <p className={cn("canvas-resource-shelf-card__description", className)} {...props}>
      {children}
    </p>
  );
}

export function CanvasResourceShelfMetadataText({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={className} {...props}>
      {children}
    </span>
  );
}

export function CanvasResourceShelfMetadataProbe({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-resource-shelf__metadata-probe", className)} {...props}>
      {children}
    </span>
  );
}

export const CanvasResourceShelfLazyFrame = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("canvas-resource-shelf__lazy-frame", className)} {...props} />
  ),
);

CanvasResourceShelfLazyFrame.displayName = "CanvasResourceShelfLazyFrame";

export function CanvasResourceShelfCardFooter({
  idLabel,
  meta,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  idLabel: ReactNode;
  meta: ReactNode;
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn("canvas-resource-shelf-card__footer", className)} {...props}>
      <span className="canvas-resource-shelf-card__id">{idLabel}</span>
      <AppInlineMeta className="canvas-resource-shelf-card__footer-meta">{meta}</AppInlineMeta>
    </AppSurfaceItem>
  );
}
