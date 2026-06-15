import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/shared/ui/cn";
import { toneTextClass } from "@movscript/ui/semantic";
import { AppChoiceTile, AppCreateDialog, AppEmptyState, AppSurfaceItem } from "@movscript/ui/business/app";
import {
  Badge,
  Button,
  Input,
  Label,
  type ButtonProps,
  type InputProps,
  type IconComponent,
} from "@movscript/ui/primitives";

import "./CanvasListUi.css";

export function CanvasListShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list", className)} {...props} />;
}

export function CanvasListHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list__header", className)} {...props} />;
}

export function CanvasListHeaderText({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list__header-text", className)} {...props} />;
}

export function CanvasListTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("canvas-list__title", className)} {...props} />;
}

export function CanvasListDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list__description", className)} {...props} />;
}

export const CanvasListCreateButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "sm", ...props }, ref) => (
    <Button ref={ref} size={size} className={cn("canvas-list__create-button", className)} {...props} />
  )
);

CanvasListCreateButton.displayName = "CanvasListCreateButton";

export function CanvasListLoading({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list__loading", className)} {...props} />;
}

export function CanvasListToolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list__toolbar", className)} {...props} />;
}

export function CanvasListSearchBox({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
}) {
  return (
    <div className={cn("canvas-list-search", className)} {...props}>
      {icon ? <span className="canvas-list-search__icon">{icon}</span> : null}
      {children}
    </div>
  );
}

export const CanvasListSearchInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-list-search__input", className)} {...props} />
  )
);

CanvasListSearchInput.displayName = "CanvasListSearchInput";

export function CanvasListFilterGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-filter", className)} {...props} />;
}

export const CanvasListFilterButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean;
}>(({ active = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    size="sm"
    variant={active ? "soft" : "ghost"}
    className={cn("canvas-list-filter__button", className)}
    data-active={active ? "true" : undefined}
    {...props}
  />
));

CanvasListFilterButton.displayName = "CanvasListFilterButton";

export function CanvasListSummary({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list__summary", className)} {...props} />;
}

export function CanvasListEmpty({
  icon,
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AppEmptyState icon={icon} title={title} className={cn("canvas-list-empty", className)} {...props}>
      {children}
    </AppEmptyState>
  );
}

export function CanvasListError({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("canvas-list-error", toneTextClass("danger"), className)} {...props} />;
}

export const CanvasListEmptyActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "link", size = "sm", ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} className={cn("canvas-list-empty__action", className)} {...props} />
  )
);

CanvasListEmptyActionButton.displayName = "CanvasListEmptyActionButton";

export function CanvasListItems({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list__items", className)} {...props} />;
}

export function CanvasListPagination({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-pagination", className)} {...props} />;
}

export function CanvasListPageStatus({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list-pagination__status", className)} {...props} />;
}

export const CanvasListPageButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size = "icon-sm", variant = "outline", ...props }, ref) => (
    <Button ref={ref} size={size} variant={variant} className={cn("canvas-list-pagination__button", className)} {...props} />
  )
);

CanvasListPageButton.displayName = "CanvasListPageButton";

export function CanvasListItem({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem className={cn("canvas-list-item", className)} {...props} />;
}

export function CanvasListItemIcon({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("canvas-list-item__icon", className)} {...props} />;
}

export function CanvasListItemBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-item__body", className)} {...props} />;
}

export function CanvasListItemName({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list-item__name", className)} {...props} />;
}

export function CanvasListItemMeta({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("canvas-list-item__meta", className)} {...props} />;
}

export const CanvasListItemNameInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-list-item__name-input", className)} {...props} />
  )
);

CanvasListItemNameInput.displayName = "CanvasListItemNameInput";

export function CanvasListTypeBadge({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("canvas-list-item__type", className)} {...props}>
      {icon ? <span className="canvas-list-item__type-icon">{icon}</span> : null}
      {children}
    </Badge>
  );
}

export function CanvasListItemActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-item__actions", className)} {...props} />;
}

export const CanvasListItemActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  muted?: boolean;
}>(({ muted = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    data-muted={muted ? "true" : undefined}
    className={cn("canvas-list-item__action", className)}
    {...props}
  />
));

CanvasListItemActionButton.displayName = "CanvasListItemActionButton";

export function CanvasListCreateDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppCreateDialog open={open} onClose={onClose} title={title} contentClassName="canvas-list-create-dialog">
      {children}
    </AppCreateDialog>
  );
}

export function CanvasListCreateDialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-create-dialog__body", className)} {...props} />;
}

export function CanvasListCreateField({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-create-dialog__field", className)} {...props} />;
}

export function CanvasListCreateLabel({
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement>) {
  return <Label className={cn("canvas-list-create-dialog__label", className)} {...props} />;
}

export const CanvasListCreateInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-list-create-dialog__input", className)} {...props} />
  )
);

CanvasListCreateInput.displayName = "CanvasListCreateInput";

export function CanvasListCreateTypeGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-create-dialog__type-grid", className)} {...props} />;
}

export const CanvasListCreateTypeTile = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean;
}>(({ selected = false, className, ...props }, ref) => (
  <AppChoiceTile
    ref={ref}
    selected={selected}
    className={cn("canvas-list-create-type", className)}
    {...props}
  />
));

CanvasListCreateTypeTile.displayName = "CanvasListCreateTypeTile";

export function CanvasListCreateTypeLabel({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={cn("canvas-list-create-type__label", className)} {...props}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

export function CanvasListCreateTypeDescription({
  selected = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  selected?: boolean;
}) {
  return (
    <span
      data-selected={selected ? "true" : undefined}
      className={cn("canvas-list-create-type__description", className)}
      {...props}
    />
  );
}

export function CanvasListCreateActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-list-create-dialog__actions", className)} {...props} />;
}

export const CanvasListCreateActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  stretch?: boolean;
}>(({ stretch = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    data-stretch={stretch ? "true" : undefined}
    className={cn("canvas-list-create-dialog__action", className)}
    {...props}
  />
));

CanvasListCreateActionButton.displayName = "CanvasListCreateActionButton";
