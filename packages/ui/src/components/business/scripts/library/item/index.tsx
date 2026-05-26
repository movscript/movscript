import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { StatusDot, type StatusDotProps } from "../../../../primitives/badge";
import { Button } from "../../../../primitives/button";

export interface ScriptLibraryItemProps {
  active?: boolean;
  statusProps?: StatusDotProps;
  title: ReactNode;
  meta: ReactNode;
  onSelect?: () => void;
}

export function ScriptLibraryItem({
  active = false,
  statusProps,
  title,
  meta,
  onSelect,
}: ScriptLibraryItemProps) {
  const { className: statusClassName, ...statusVisualProps } = statusProps ?? {};

  return (
    <Button
      type="button"
      variant="ghost"
      data-active={active ? "true" : undefined}
      onClick={onSelect}
      className="script-library-item"
    >
      <StatusDot className={cn("script-library-item__dot", statusClassName)} {...statusVisualProps} />
      <span className="script-library-item__copy">
        <span className="script-library-item__title">{title}</span>
        <span className="script-library-item__meta">{meta}</span>
      </span>
    </Button>
  );
}
