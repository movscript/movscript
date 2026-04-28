"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/cn";

export type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "danger"
  | "link";
export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const normalizedVariant = variant === "primary" ? "default" : variant === "danger" ? "destructive" : variant;
    const normalizedSize = size === "md" ? "default" : size;
    const content = (
      <>
        {loading ? <span className="ms-button__spinner" aria-hidden="true" /> : null}
        <span className="ms-button__content">{children}</span>
      </>
    );

    return (
      <Comp
        ref={ref}
        className={cn(
          "ms-button",
          `ms-button--${normalizedVariant}`,
          `ms-button--${normalizedSize}`,
          loading && "ms-button--loading",
          className
        )}
        disabled={!asChild ? disabled || loading : undefined}
        aria-disabled={asChild && (disabled || loading) ? true : props["aria-disabled"]}
        data-loading={loading ? "true" : undefined}
        {...props}
      >
        {asChild ? children : content}
      </Comp>
    );
  }
);

Button.displayName = "Button";
