import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../../semantic";
import { Button, EmptyState, Surface, type ButtonProps, type SurfaceEmphasis } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";

function appStatusSurfaceEmphasis(emphasis: "soft" | "outline"): SurfaceEmphasis {
  return emphasis === "outline" ? "outlined" : "soft";
}

export function AppStateMessage({
  icon,
  children,
  text,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  text?: ReactNode;
  tone?: SemanticTone;
}) {
  return (
    <Surface
      kind="item"
      tone={tone}
      density="normal"
      emphasis="soft"
      className={cn("ms-action-row ms-type-body app-state-message", `app-state-message--${tone}`, className)}
      {...props}
    >
      {icon ? <span className="ms-inline-center app-state-message__icon">{icon}</span> : null}
      <span className="app-state-message__content">{children ?? text}</span>
    </Surface>
  );
}

export function AppStatusSurface({
  tone = "neutral",
  emphasis = "soft",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: SemanticTone;
  emphasis?: "soft" | "outline";
}) {
  return (
    <Surface
      kind="item"
      tone={tone}
      density="normal"
      emphasis={appStatusSurfaceEmphasis(emphasis)}
      data-app-emphasis={emphasis}
      className={cn("ms-type-label app-status-surface", className)}
      {...props}
    />
  );
}

export function AppStatusToggleButton({
  tone = "neutral",
  selected = false,
  className,
  ...props
}: Omit<ButtonProps, "tone"> & {
  tone?: SemanticTone;
  selected?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      data-tone={tone}
      data-selected={selected ? "true" : "false"}
      className={cn("ms-type-label app-status-toggle-button", className)}
      {...props}
    />
  );
}

export function AppInlineError({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Surface kind="item" tone="danger" density="compact" emphasis="soft" className={cn("ms-type-label app-inline-error", className)} {...props}>
      {children}
    </Surface>
  );
}

export function AppFeedbackText({
  as: Element = "p",
  tone = "danger",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div";
  tone?: SemanticTone;
}) {
  return <Element className={cn("ms-type-label app-feedback-text", toneTextClass(tone), className)} {...props} />;
}

export function AppRequiredMark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cn("app-required-mark", toneTextClass("danger"), className)} {...props} />;
}

export function AppTextEmptyState({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Surface as="p" kind="item" tone="neutral" density="normal" emphasis="muted" className={cn("ms-type-caption app-text-empty-state", className)} {...props}>
      {children}
    </Surface>
  );
}

export function AppEmptyState({
  icon: Icon,
  title,
  detail,
  action,
  compact = false,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: IconComponent;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon={Icon ? <Icon size={compact ? 18 : 24} /> : undefined}
      title={title}
      description={detail}
      action={action}
      className={cn("app-empty-state", compact && "app-empty-state--compact", className)}
      iconClassName="app-empty-state__icon"
      titleClassName="ms-type-body app-empty-state__title"
      descriptionClassName="ms-type-label app-empty-state__detail"
      actionClassName="app-empty-state__action"
      {...props}
    />
  );
}
