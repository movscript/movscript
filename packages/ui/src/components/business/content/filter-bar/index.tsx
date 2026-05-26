import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppPanel } from "../../app";
import { Button, Input, NativeSelect, type ButtonProps, type InputProps, type NativeSelectProps } from "../../../primitives";

export interface ContentFilterOption {
  value: string;
  label: string;
  count?: number;
}

export function ContentFilterBarShell({
  className,
  ...props
}: Parameters<typeof AppPanel>[0]) {
  return <AppPanel className={cn("content-filter-bar", className)} bodyClassName="content-filter-bar__body" {...props} />;
}

export function ContentFilterToolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("content-filter-bar__toolbar", className)} {...props} />;
}

export const ContentFilterSearchBox = forwardRef<HTMLInputElement, InputProps & {
  icon?: ReactNode;
}>(({ icon, className, ...props }, ref) => (
  <span className="content-filter-search">
    {icon ? <span className="content-filter-search__icon">{icon}</span> : null}
    <Input ref={ref} className={cn("content-filter-search__input", className)} {...props} />
  </span>
));

ContentFilterSearchBox.displayName = "ContentFilterSearchBox";

export function ContentFilterSelectField({
  icon,
  label,
  options,
  className,
  selectClassName,
  ...props
}: Omit<NativeSelectProps, "children"> & {
  icon?: ReactNode;
  label: ReactNode;
  options: ContentFilterOption[];
  selectClassName?: string;
}) {
  return (
    <label className={cn("content-filter-select", className)}>
      <span className="content-filter-select__label">
        {icon ? <span className="content-filter-select__icon">{icon}</span> : null}
        {label}
      </span>
      <NativeSelect
        controlSize="sm"
        variant="subtle"
        className={cn("content-filter-select__control", selectClassName)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count === undefined ? option.label : `${option.label} (${option.count})`}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

export function ContentFilterCount({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("content-filter-count", className)} {...props} />;
}

export function ContentFilterChipRail({
  label,
  children,
  clearAction,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  clearAction?: ReactNode;
}) {
  return (
    <div className={cn("content-filter-chip-rail", className)} {...props}>
      <span className="content-filter-chip-rail__label">{label}</span>
      {children}
      {clearAction ? <span className="content-filter-chip-rail__clear">{clearAction}</span> : null}
    </div>
  );
}

export const ContentFilterChipButton = forwardRef<HTMLButtonElement, ButtonProps & {
  removeIcon?: ReactNode;
}>(({ className, children, removeIcon, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="soft"
      size="xs"
      className={cn("content-filter-chip", className)}
      {...props}
    >
      <span className="content-filter-chip__label">{children}</span>
      {removeIcon ? <span className="content-filter-chip__remove">{removeIcon}</span> : null}
    </Button>
  )
);

ContentFilterChipButton.displayName = "ContentFilterChipButton";

export const ContentFilterClearButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "xs", ...props }, ref) => (
    <Button ref={ref} type="button" variant={variant} size={size} className={cn("content-filter-clear", className)} {...props} />
  )
);

ContentFilterClearButton.displayName = "ContentFilterClearButton";
