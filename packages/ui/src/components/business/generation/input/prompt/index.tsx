import type { HTMLAttributes, InputHTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";

export function GenerationInputRoot({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationPromptArea({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input__prompt-area", className)} {...props}>
      {children}
    </div>
  );
}

export const GenerationPromptEditor = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn("generation-input__prompt-editor mention-editor", className)}
      {...props}
    />
  )
);

GenerationPromptEditor.displayName = "GenerationPromptEditor";

export const GenerationHiddenFileInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "file", ...props }, ref) => (
    <input ref={ref} type={type} className={cn("generation-input__hidden-input", className)} {...props} />
  )
);

GenerationHiddenFileInput.displayName = "GenerationHiddenFileInput";
