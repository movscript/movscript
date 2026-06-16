import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cn } from "../../../../../lib/cn";
import { Button, type ButtonProps } from "../../../../primitives/button";
import { AppMediaFrame, AppSurfaceItem } from "../../../app";

export function GenerationMentionMenu({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppSurfaceItem variant="overlay" className={cn("generation-input-mention-menu", className)} {...props}>
      {children}
    </AppSurfaceItem>
  );
}

export function GenerationMentionEmpty({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("generation-input-mention-menu__empty ms-type-label", className)} {...props}>
      {children}
    </p>
  );
}

export function GenerationMentionList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("generation-input-mention-menu__list", className)} {...props}>
      {children}
    </div>
  );
}

export const GenerationMentionItem = forwardRef<HTMLButtonElement, ButtonProps & {
  media: ReactNode;
  label: ReactNode;
}>(({ media, label, className, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    size="sm"
    className={cn("generation-input-mention-menu__item", className)}
    {...props}
  >
    <AppMediaFrame variant="thumb" className="generation-input-mention-menu__thumb">
      {media}
    </AppMediaFrame>
    <span className="generation-input-mention-menu__label ms-type-label ms-text-truncate">{label}</span>
  </Button>
));

GenerationMentionItem.displayName = "GenerationMentionItem";
