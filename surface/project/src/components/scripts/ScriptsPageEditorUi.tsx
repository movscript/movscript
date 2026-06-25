import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from "react";

import { cn } from '@movscript/ui/primitives';
import { AppSurfaceItem } from "@movscript/ui/business/app";
import { Button, Input, Label, Textarea } from "@movscript/ui/primitives";

export function ScriptEditorFormShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form", className)} {...props} />;
}

export function ScriptEditorToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AppSurfaceItem variant="muted" className={cn("script-editor-form__toolbar", className)} {...props} />;
}

export function ScriptEditorToolbarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__toolbar-group", className)} {...props} />;
}

export const ScriptEditorHiddenFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn("script-editor-form__file-input", className)} {...props} />,
);

ScriptEditorHiddenFileInput.displayName = "ScriptEditorHiddenFileInput";

export function ScriptEditorActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn("script-editor-form__action-button", className)} {...props} />;
}

export function ScriptEditorInlineMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("script-editor-form__inline-meta", className)} {...props} />;
}

export function ScriptEditorErrorText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("script-editor-form__error-text", className)} {...props} />;
}

export function ScriptEditorVersionState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__version-state", className)} {...props} />;
}

export function ScriptEditorVersionTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__version-title", className)} {...props} />;
}

export function ScriptEditorVersionSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__version-subtitle", className)} {...props} />;
}

export function ScriptEditorBodyGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__body-grid", className)} {...props} />;
}

export function ScriptEditorMainField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__main-field", className)} {...props} />;
}

export function ScriptEditorFieldLabel({ className, ...props }: ComponentPropsWithoutRef<typeof Label>) {
  return <Label className={cn("script-editor-form__label", className)} {...props} />;
}

export const ScriptEditorBodyTextarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<typeof Textarea>>(
  ({ className, ...props }, ref) => <Textarea ref={ref} className={cn("script-editor-form__body-textarea", className)} {...props} />,
);

ScriptEditorBodyTextarea.displayName = "ScriptEditorBodyTextarea";

export function ScriptEditorSideRail({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn("script-editor-form__side-rail", className)} {...props} />;
}

export function ScriptEditorSidePanel({ className, ...props }: ComponentPropsWithoutRef<typeof AppSurfaceItem>) {
  return <AppSurfaceItem className={cn("script-editor-form__side-panel", className)} {...props} />;
}

export function ScriptEditorInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn("script-editor-form__input", className)} {...props} />;
}

export function ScriptEditorSummaryTextarea({ className, ...props }: ComponentPropsWithoutRef<typeof Textarea>) {
  return <Textarea className={cn("script-editor-form__summary-textarea", className)} {...props} />;
}

export function ScriptEditorHelperText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("script-editor-form__helper-text", className)} {...props} />;
}

export function ScriptEditorStrongText({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <strong className={cn("script-editor-form__strong-text", className)} {...props} />;
}

export function ScriptEditorOutlinePanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn("script-editor-form__outline-panel", className)} {...props} />;
}

export function ScriptEditorOutlineList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("script-editor-form__outline-list", className)} {...props} />;
}

export function ScriptEditorOutlineItem({
  level,
  line,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  level: number;
  line: number;
}) {
  return (
    <button
      type="button"
      className={cn("script-editor-form__outline-item", className)}
      data-level={level}
      {...props}
    >
      <span className="script-editor-form__outline-line">{line}</span>
      <span className="script-editor-form__outline-title">{children}</span>
    </button>
  );
}
