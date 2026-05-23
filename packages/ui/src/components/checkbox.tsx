"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface CheckboxFieldProps extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "defaultChecked" | "disabled" | "onChange">;
  onCheckedChange?: (checked: boolean) => void;
  controlSize?: "sm" | "default";
  variant?: "default" | "subtle";
}

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(
  (
    {
      checked,
      defaultChecked,
      disabled = false,
      inputProps,
      onCheckedChange,
      controlSize = "default",
      variant = "default",
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <label
      className={cn("ms-field-control ms-checkbox-field", className)}
      data-size={controlSize}
      data-variant={variant}
      data-disabled={disabled ? "true" : undefined}
      {...props}
    >
      <input
        ref={ref}
        type="checkbox"
        className="ms-checkbox-field__input"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        {...inputProps}
      />
      {children ? <span className="ms-checkbox-field__label">{children}</span> : null}
    </label>
  ),
);

CheckboxField.displayName = "CheckboxField";
