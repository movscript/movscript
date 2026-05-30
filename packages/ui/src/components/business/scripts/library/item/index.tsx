import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { StatusDot, type StatusDotProps } from "../../../../primitives/badge";
import { Button } from "../../../../primitives/button";

export interface ScriptLibraryItemProps {
  active?: boolean;
  statusProps?: StatusDotProps;
  title: ReactNode;
  meta: ReactNode;
  statusLabel?: ReactNode;
  action?: ReactNode;
  editor?: ReactNode;
  onSelect?: () => void;
}

export function ScriptLibraryItem({
  active = false,
  statusProps,
  title,
  meta,
  statusLabel,
  action,
  editor,
  onSelect,
}: ScriptLibraryItemProps) {
  const { className: statusClassName, ...statusVisualProps } = statusProps ?? {};

  return (
    <div data-active={active ? "true" : undefined} className="script-library-item">
      <div className="script-library-item__main">
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          className="script-library-item__select"
        >
          <StatusDot className={cn("script-library-item__dot", statusClassName)} {...statusVisualProps} />
          <span className="script-library-item__copy">
            <span className="script-library-item__title-row">
              <span className="script-library-item__title">{title}</span>
              {statusLabel ? <span className="script-library-item__state">{statusLabel}</span> : null}
            </span>
            <span className="script-library-item__meta">{meta}</span>
          </span>
        </Button>
        {action ? <div className="script-library-item__action">{action}</div> : null}
      </div>
      {editor ? <div className="script-library-item__editor">{editor}</div> : null}
    </div>
  );
}
