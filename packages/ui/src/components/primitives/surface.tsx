"use client";

import * as React from "react";
import { AsChildSlot } from "../../lib/asChild";
import { cn } from "../../lib/cn";
import type { UiSemanticEmphasis, UiSemanticIntent, UiSemanticState, UiSemanticSurface } from "../../style-system";

export type SurfaceKind = "card" | "panel" | "section" | "item" | "metric" | "media" | "overlay";
export type SurfaceTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";
export type SurfaceDensity = "compact" | "normal" | "comfortable";
export type SurfaceEmphasis = "plain" | "muted" | "soft" | "outlined" | "raised" | "unframed";
export type SurfaceInteraction = "none" | "hover" | "selectable" | "selected" | "disabled";
export type SurfaceSemanticRole = UiSemanticSurface;
export type SurfaceIntent = UiSemanticIntent;
export type SurfaceState = UiSemanticState;
export type SurfaceSemanticEmphasis = Exclude<UiSemanticEmphasis, "solid">;

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  asChild?: boolean;
  surface?: SurfaceSemanticRole;
  intent?: SurfaceIntent;
  state?: SurfaceState;
  kind?: SurfaceKind;
  tone?: SurfaceTone;
  density?: SurfaceDensity;
  emphasis?: SurfaceEmphasis;
  interaction?: SurfaceInteraction;
  disabled?: boolean;
  type?: string;
}

export const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  (
    {
      as: Component = "div",
      asChild = false,
      surface = "card",
      intent = "neutral",
      state = "rest",
      kind,
      tone = "neutral",
      density = "normal",
      emphasis = "plain",
      interaction = "none",
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const semanticKind: SurfaceKind =
      surface === "page" ? "section" : surface === "muted" ? "item" : surface;
    const semanticEmphasis: SurfaceEmphasis =
      surface === "muted" ? "muted" : surface === "overlay" ? "raised" : emphasis;
    const semanticInteraction: SurfaceInteraction =
      state === "rest" ? "none" : state === "hover" ? "hover" : state;
    const visualKind = kind ?? semanticKind;
    const visualTone = tone === "neutral" ? intent : tone;
    const visualInteraction = interaction === "none" ? semanticInteraction : interaction;
    const surfaceClassName = cn(
      "ms-frame ms-surface",
      "ms-surface-root",
      `ms-surface-root--kind-${visualKind}`,
      className,
    );
    const commonProps = {
      ref,
      className: surfaceClassName,
      "data-surface": surface,
      "data-intent": intent,
      "data-state": disabled ? "disabled" : state,
      "data-kind": visualKind,
      "data-tone": visualTone,
      "data-density": density,
      "data-emphasis": semanticEmphasis,
      "data-interaction": disabled ? "disabled" : visualInteraction,
      disabled,
      "aria-disabled": disabled || undefined,
      ...props,
    };

    if (asChild) {
      return <AsChildSlot fallback={Component} {...commonProps} />;
    }

    return React.createElement(Component, commonProps);
  },
);

Surface.displayName = "Surface";
