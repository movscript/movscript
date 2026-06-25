import { type HTMLAttributes, type ReactNode } from "react";
import { AgentSurfaceBlock } from "@movscript/ui/business/agent";
import { toneSurfaceClass, toneTextClass, type SemanticTone } from "@movscript/ui/semantic";
import {
  Input,
  Label,
  NativeSelect,
  type InputProps,
  type NativeSelectProps,
} from "@movscript/ui/primitives";

import { cn } from "@/shared/ui/cn";

export function AgentConsoleLocalToolCard({
  invalid = false,
  children,
}: {
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <AgentSurfaceBlock
      variant="subtle"
      className={cn("agent-console-tone-surface", invalid ? toneSurfaceClass("danger") : undefined, "agent-console-local-tool-card")}
    >
      {children}
    </AgentSurfaceBlock>
  );
}

export function AgentConsoleLocalToolHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-card__header", className)} {...props} />;
}

export function AgentConsoleLocalToolCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__copy", className)} {...props} />;
}

export function AgentConsoleLocalToolTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__title", className)} {...props} />;
}

export function AgentConsoleLocalToolDetail({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("agent-console-local-tool-card__detail", className)} {...props} />;
}

export function AgentConsoleLocalToolControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-card__controls", className)} {...props} />;
}

export function AgentConsoleLocalToolFields({
  disabled = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
}) {
  return <div data-disabled={disabled ? "true" : undefined} className={cn("agent-console-local-tool-fields", className)} {...props} />;
}

export function AgentConsoleLocalToolActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("agent-console-local-tool-actions", className)} {...props} />;
}

export function AgentConsoleTestResult({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone: SemanticTone;
}) {
  return <span className={cn("agent-console-tone-text", toneTextClass(tone), "agent-console-test-result", className)} {...props} />;
}

export function AgentConsoleFormField({
  label,
  className,
  ...props
}: InputProps & {
  label: ReactNode;
}) {
  return (
    <div className={cn("agent-console-form-field", className)}>
      <Label className="agent-console-form-field__label">{label}</Label>
      <Input controlSize="sm" className="agent-console-form-field__input" {...props} />
    </div>
  );
}

export function AgentConsoleSelectField({
  label,
  children,
  className,
  ...props
}: NativeSelectProps & {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("agent-console-form-field", className)}>
      <Label className="agent-console-form-field__label">{label}</Label>
      <NativeSelect controlSize="sm" className="agent-console-form-field__input" {...props}>
        {children}
      </NativeSelect>
    </div>
  );
}
