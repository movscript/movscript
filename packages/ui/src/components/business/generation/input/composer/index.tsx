import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";

export type GenerationCallComposerTone = "neutral" | "ready" | "warning" | "danger";

export function GenerationCallComposerRoot({
  children,
  className,
  compact = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
}) {
  return (
    <div
      className={cn("generation-call-composer", className)}
      data-compact={compact ? "true" : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export function GenerationCallComposerForm({
  children,
  className,
  compact = false,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  compact?: boolean;
}) {
  return (
    <form
      className={cn("generation-call-composer", className)}
      data-compact={compact ? "true" : undefined}
      {...props}
    >
      {children}
    </form>
  );
}

export function GenerationCallPromptBlock({
  children,
  label,
  action,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cn("generation-call-composer__prompt", className)} {...props}>
      {(label || action) ? (
        <div className="generation-call-composer__section-header">
          {label ? <span>{label}</span> : <span />}
          {action ? <span className="generation-call-composer__section-action">{action}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function GenerationCallConfigBlock({
  children,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
}) {
  return (
    <section className={cn("generation-call-composer__config", className)} {...props}>
      {label ? (
        <div className="generation-call-composer__section-header">
          <span>{label}</span>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function GenerationCallMetaRow({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-call-composer__meta-row", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationCallField({
  children,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
}) {
  return (
    <label className={cn("generation-call-composer__field", className)} {...props}>
      <span className="generation-call-composer__field-label">{label}</span>
      {children}
    </label>
  );
}

export function GenerationCallBadge({
  children,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: GenerationCallComposerTone;
}) {
  return (
    <span className={cn("generation-call-composer__badge", className)} data-tone={tone} {...props}>
      {children}
    </span>
  );
}

export function GenerationCallMessages({
  messages,
  className,
  tone = "warning",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  messages: readonly ReactNode[];
  tone?: GenerationCallComposerTone;
}) {
  if (messages.length === 0) return null;
  return (
    <div
      className={cn("generation-call-composer__messages", className)}
      data-tone={tone}
      aria-live="polite"
      {...props}
    >
      {messages.map((message, index) => (
        <small key={typeof message === "string" ? `${message}-${index}` : index}>{message}</small>
      ))}
    </div>
  );
}

export function GenerationCallFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-call-composer__footer", className)} {...props}>
      {children}
    </div>
  );
}
