import type { HTMLAttributes } from "react";

import { cn } from "../../../../lib/cn";
import { AppMediaFrame } from "../../app";

export const canvasMentionChipClassNames = {
  chip: "canvas-mention-chip",
  media: "canvas-mention-chip__media",
  label: "canvas-mention-chip__label",
} as const;

export function CanvasMentionMenuThumb({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppMediaFrame variant="thumb" className={cn("canvas-mention-menu-thumb", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}

export function CanvasMentionAttachmentThumb({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppMediaFrame variant="thumb" className={cn("canvas-mention-attachment-thumb", className)} {...props}>
      {children}
    </AppMediaFrame>
  );
}
