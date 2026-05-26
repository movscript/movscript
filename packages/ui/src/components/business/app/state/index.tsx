import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { toneTextClass, type SemanticTone } from "../../../../semantic";
import { Button, EmptyState, type ButtonProps } from "../../../primitives";
import type { IconComponent } from "../../../primitives/types";

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
    <div className={cn("app-state-message", `app-state-message--${tone}`, className)} {...props}>
      {icon ? <span className="app-state-message__icon">{icon}</span> : null}
      <span className="app-state-message__content">{children ?? text}</span>
    </div>
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
    <div
      data-tone={tone}
      data-emphasis={emphasis}
      className={cn("app-status-surface", className)}
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
      className={cn("app-status-toggle-button", className)}
      {...props}
    />
  );
}

export function AppInlineError({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("app-inline-error", className)} {...props}>
      {children}
    </div>
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
  return <Element className={cn("app-feedback-text", toneTextClass(tone), className)} {...props} />;
}

export function AppRequiredMark({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cn("app-required-mark", toneTextClass("danger"), className)} {...props} />;
}

export function AppTextEmptyState({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("app-text-empty-state", className)} {...props}>
      {children}
    </p>
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
      titleClassName="app-empty-state__title"
      descriptionClassName="app-empty-state__detail"
      actionClassName="app-empty-state__action"
      {...props}
    />
  );
}
