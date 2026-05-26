import type { ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";

export function DetailEntityEditorHeader({
  title,
  description,
  requiredHint,
  actions,
  hideCopy = false,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  requiredHint?: ReactNode;
  actions?: ReactNode;
  hideCopy?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("detail-entity-editor-header", hideCopy && "detail-entity-editor-header--actions-only", className)}>
      {hideCopy ? null : (
        <div className="detail-entity-editor-header__copy">
          <p className="detail-entity-editor-header__title">{title}</p>
          {description ? <p className="detail-entity-editor-header__description">{description}</p> : null}
          {requiredHint ? <p className="detail-entity-editor-header__hint">{requiredHint}</p> : null}
        </div>
      )}
      {actions ? <div className="detail-entity-editor-header__actions">{actions}</div> : null}
    </div>
  );
}
