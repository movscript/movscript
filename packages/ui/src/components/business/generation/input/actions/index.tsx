import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives/button";

export function GenerationActionBar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input-actions", className)} {...props}>
      {children}
    </div>
  );
}

export function GenerationActionHint({
  children,
  icon,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
}) {
  return (
    <span className={cn("generation-input-actions__hint", className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

export function GenerationActionSpacer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("generation-input-actions__spacer", className)} {...props} />;
}

export const GenerationActionButton = forwardRef<HTMLButtonElement, ButtonProps & {
  icon?: ReactNode;
}>(({ icon, children, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="outline"
    size="sm"
    className={cn("generation-input-actions__button", className)}
    {...props}
  >
    {icon}
    {children}
  </Button>
));

GenerationActionButton.displayName = "GenerationActionButton";

export const GenerationGenerateButton = forwardRef<HTMLButtonElement, ButtonProps & {
  icon: ReactNode;
}>(({ icon, children, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    size="sm"
    className={cn("generation-input-actions__generate", className)}
    {...props}
  >
    {icon}
    {children}
  </Button>
));

GenerationGenerateButton.displayName = "GenerationGenerateButton";
