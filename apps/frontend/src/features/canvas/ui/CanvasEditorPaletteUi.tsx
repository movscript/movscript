import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { AppIconFrame, AppSurfaceItem } from "@movscript/ui/business/app";
import {
  Button,
  type ButtonProps,
} from "@movscript/ui/primitives";

export function CanvasPalettePanel({
  collapsed = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  collapsed?: boolean;
}) {
  return <aside data-collapsed={collapsed ? "true" : undefined} className={cn("canvas-palette", className)} {...props} />;
}

export function CanvasPaletteInner({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette__inner", className)} {...props} />;
}

export function CanvasPaletteHeader({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("canvas-palette__header", className)} {...props}>
      {icon ? <span className="canvas-palette__header-icon">{icon}</span> : null}
      <span className="canvas-palette__header-title">{children}</span>
    </div>
  );
}

export function CanvasPaletteCollapsedBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette__collapsed-body", className)} {...props} />;
}

export function CanvasPaletteExpandedBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette__expanded-body", className)} {...props} />;
}

export function CanvasPaletteCollapsedGroup({
  separated = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  separated?: boolean;
}) {
  return (
    <div
      data-separated={separated ? "true" : undefined}
      className={cn("canvas-palette__collapsed-group", className)}
      {...props}
    />
  );
}

export function CanvasPaletteCollapsedItems({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette__collapsed-items", className)} {...props} />;
}

export const CanvasPaletteCollapsedItemButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "icon-sm", ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn("canvas-palette__collapsed-item", className)}
      {...props}
    />
  )
);

CanvasPaletteCollapsedItemButton.displayName = "CanvasPaletteCollapsedItemButton";

export function CanvasPaletteHint({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppSurfaceItem className={cn("canvas-palette__hint", className)} {...props}>
      {icon ? <span className="canvas-palette__hint-icon">{icon}</span> : null}
      <span>{children}</span>
    </AppSurfaceItem>
  );
}

export function CanvasPaletteSections({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette__sections", className)} {...props} />;
}

export function CanvasPaletteSection({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={cn("canvas-palette-section", className)} {...props} />;
}

export function CanvasPaletteSectionHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette-section__header", className)} {...props} />;
}

export function CanvasPaletteSectionTitle({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-palette-section__title", className)} {...props} />;
}

export function CanvasPaletteSectionDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-palette-section__description", className)} {...props} />;
}

export function CanvasPaletteItemGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-palette-section__items", className)} {...props} />;
}

export const CanvasPaletteItemButton = forwardRef<HTMLButtonElement, ButtonProps & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  dragHandle?: ReactNode;
}>(({ icon, title, description, dragHandle, className, variant = "ghost", size = "sm", children, ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={size}
    fullWidth
    align="start"
    className={cn("canvas-palette-item", className)}
    {...props}
  >
    <AppIconFrame className="canvas-palette-item__icon">{icon}</AppIconFrame>
    <span className="canvas-palette-item__body">
      <span className="canvas-palette-item__title">{title}</span>
      {description ? <span className="canvas-palette-item__description">{description}</span> : null}
      {children}
    </span>
    {dragHandle ? <span className="canvas-palette-item__drag">{dragHandle}</span> : null}
  </Button>
));

CanvasPaletteItemButton.displayName = "CanvasPaletteItemButton";

export function CanvasPaletteEmpty({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="muted" className={cn("canvas-palette-empty", className)} {...props} />;
}
