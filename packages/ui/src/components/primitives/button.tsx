"use client";

import * as React from "react";
import { AsChildSlot } from "../../lib/asChild";
import { cn } from "../../lib/cn";
import type { UiSemanticEmphasis, UiSemanticIntent } from "../../style-system";

export type ButtonVariant =
  | "solid"
  | "soft"
  | "outline"
  | "ghost"
  | "link";
export type ButtonTone = "brand" | "neutral" | "danger";
export type ButtonIntent = UiSemanticIntent;
export type ButtonEmphasis = Extract<UiSemanticEmphasis, "plain" | "soft" | "solid">;
export type ButtonSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: ButtonIntent;
  emphasis?: ButtonEmphasis;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  fullWidth?: boolean;
  align?: "center" | "start" | "end";
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      intent,
      emphasis,
      variant,
      tone,
      size = "md",
      fullWidth = false,
      align = "center",
      loading = false,
      disabled,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? AsChildSlot : "button";
    const visualVariant = variant ?? (emphasis === "plain" ? "ghost" : emphasis ?? "solid");
    const visualTone = tone ?? (intent === "danger" ? "danger" : intent === "neutral" ? "neutral" : (visualVariant === "solid" || visualVariant === "link" ? "brand" : "neutral"));
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
          "ms-control ms-button",
          `ms-button--${visualVariant}`,
          `ms-button--tone-${visualTone}`,
          `ms-button--${size}`,
          fullWidth && "ms-button--full-width",
          loading && "ms-button--loading",
          className
        )}
        disabled={!asChild ? disabled || loading : undefined}
        aria-disabled={asChild && (disabled || loading) ? true : props["aria-disabled"]}
        data-loading={loading ? "true" : undefined}
        data-ms-component="Button"
        data-ms-slot="root"
        data-ms-variant={visualVariant}
        data-ms-tone={visualTone}
        data-ms-intent={intent ?? visualTone}
        data-ms-emphasis={emphasis ?? (visualVariant === "ghost" || visualVariant === "link" ? "plain" : visualVariant)}
        data-ms-size={size}
        data-ms-full-width={fullWidth ? "true" : undefined}
        data-ms-align={align}
        {...(asChild ? { fallback: "button" } : {})}
        {...props}
      >
        {asChild ? children : content}
      </Comp>
    );
  }
);

Button.displayName = "Button";
