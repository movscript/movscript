import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from '@movscript/ui/primitives';
import { AppSurfaceItem } from "@movscript/ui/business/app";
import { Button, CheckboxField, Input, Label, Textarea, type ButtonProps, type CheckboxFieldProps, type InputProps, type TextareaProps } from "@movscript/ui/primitives";

type DivAttributesWithoutTitle = Omit<HTMLAttributes<HTMLDivElement>, "title">;

export function CanvasRuntimeInputDialogShell({
  size = "workflow",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: "workflow" | "node";
}) {
  return (
    <div className="canvas-runtime-input-dialog-overlay">
      <AppSurfaceItem
        variant="overlay"
        data-size={size}
        className={cn("canvas-runtime-input-dialog", className)}
        {...props}
      />
    </div>
  );
}

export function CanvasRuntimeInputDialogHeader({
  title,
  description,
  className,
  ...props
}: DivAttributesWithoutTitle & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={cn("canvas-runtime-input-dialog__header", className)} {...props}>
      <h2 className="canvas-runtime-input-dialog__title">{title}</h2>
      {description ? <p className="canvas-runtime-input-dialog__description">{description}</p> : null}
    </div>
  );
}

export function CanvasRuntimeInputDialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__body", className)} {...props} />;
}

export function CanvasRuntimeInputDialogField({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__field", className)} {...props} />;
}

export function CanvasRuntimeInputDialogFieldLabel({
  label,
  portType,
  required = false,
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  portType?: ReactNode;
  required?: boolean;
}) {
  return (
    <Label className={cn("canvas-runtime-input-dialog__label", className)} {...props}>
      <span className="canvas-runtime-input-dialog__label-text">{label}</span>
      {portType ? <span className="canvas-runtime-input-dialog__port-type">({portType})</span> : null}
      {required ? <span className="canvas-runtime-input-dialog__required">*</span> : null}
    </Label>
  );
}

export const CanvasRuntimeInputDialogCheckbox = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ className, ...props }, ref) => (
    <CheckboxField ref={ref} className={cn("canvas-runtime-input-dialog__checkbox", className)} {...props} />
  )
);

CanvasRuntimeInputDialogCheckbox.displayName = "CanvasRuntimeInputDialogCheckbox";

export const CanvasRuntimeInputDialogInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("canvas-runtime-input-dialog__input", className)} {...props} />
  )
);

CanvasRuntimeInputDialogInput.displayName = "CanvasRuntimeInputDialogInput";

export const CanvasRuntimeInputDialogTextarea = forwardRef<HTMLTextAreaElement, TextareaProps & {
  code?: boolean;
}>(({ code = false, className, ...props }, ref) => (
  <Textarea
    ref={ref}
    data-code={code ? "true" : undefined}
    className={cn("canvas-runtime-input-dialog__textarea", className)}
    {...props}
  />
));

CanvasRuntimeInputDialogTextarea.displayName = "CanvasRuntimeInputDialogTextarea";

export function CanvasRuntimeInputDialogActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("canvas-runtime-input-dialog__actions", className)} {...props} />;
}

export const CanvasRuntimeInputDialogActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  stretch?: boolean;
}>(({ stretch = false, className, ...props }, ref) => (
  <Button
    ref={ref}
    data-stretch={stretch ? "true" : undefined}
    className={cn("canvas-runtime-input-dialog__action", className)}
    {...props}
  />
));

CanvasRuntimeInputDialogActionButton.displayName = "CanvasRuntimeInputDialogActionButton";
