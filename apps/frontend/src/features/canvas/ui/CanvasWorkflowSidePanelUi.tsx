import { forwardRef, type ComponentProps, type HTMLAttributes } from "react";

import { cn } from "@/shared/ui/cn";
import { PanelResizeHandle } from "@movscript/ui/layout";
import { Button, Input, type ButtonProps, type InputProps } from "@movscript/ui/primitives";

export type CanvasWorkflowPanelTab = "resources" | "workflows" | "history";

export function CanvasWorkflowSideRail({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("canvas-workflow-side-rail", className)} {...props} />;
}

export function CanvasWorkflowSidePanel({
  width,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & {
  width: number;
}) {
  return <aside className={cn("canvas-workflow-side-panel", className)} style={{ ...style, width }} {...props} />;
}

export function CanvasWorkflowResizeHandle({
  className,
  side = "left",
  ...props
}: ComponentProps<typeof PanelResizeHandle>) {
  return <PanelResizeHandle className={cn("canvas-workflow-side-panel__resize-handle", className)} side={side} {...props} />;
}

export function CanvasWorkflowReferencePickerShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker", className)} {...props} />;
}

export function CanvasWorkflowReferenceSearch({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__search", className)} {...props} />;
}

export const CanvasWorkflowReferenceSearchInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={className} {...props} />
  ),
);

CanvasWorkflowReferenceSearchInput.displayName = "CanvasWorkflowReferenceSearchInput";

export function CanvasWorkflowReferenceBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__body", className)} {...props} />;
}

export function CanvasWorkflowReferenceState({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__state", className)} {...props} />;
}

export function CanvasWorkflowReferenceList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__list", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__card", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCardMain({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__card-main", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCardIcon({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-workflow-reference-picker__card-icon", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCardText({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__card-text", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__card-title", className)} {...props} />;
}

export function CanvasWorkflowReferencePickerCardMeta({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__card-meta", className)} {...props} />;
}

export function CanvasWorkflowReferenceChips({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-reference-picker__chips", className)} {...props} />;
}

export function CanvasWorkflowReferenceChip({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={className} {...props} />;
}

export const CanvasWorkflowReferenceAddButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ size = "icon-xs", variant = "ghost", ...props }, ref) => (
    <Button ref={ref} size={size} variant={variant} {...props} />
  ),
);

CanvasWorkflowReferenceAddButton.displayName = "CanvasWorkflowReferenceAddButton";

export function CanvasWorkflowSideHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__header", className)} {...props} />;
}

export function CanvasWorkflowSideBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__body", className)} {...props} />;
}

export function CanvasWorkflowSideTabGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-workflow-side-panel__tabs", className)} {...props} />;
}

export const CanvasWorkflowSideTabButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
}>(({ active = false, className, variant, size = "sm", ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant ?? (active ? "solid" : "ghost")}
    size={size}
    data-active={active ? "true" : undefined}
    className={cn("canvas-workflow-side-panel__tab", className)}
    {...props}
  />
));

CanvasWorkflowSideTabButton.displayName = "CanvasWorkflowSideTabButton";

export function CanvasWorkflowSideTabLabel({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-workflow-side-panel__tab-label", className)} {...props} />;
}

export const CanvasWorkflowSideIconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-workflow-side-panel__icon-button", className)} {...props} />
  )
);

CanvasWorkflowSideIconButton.displayName = "CanvasWorkflowSideIconButton";

