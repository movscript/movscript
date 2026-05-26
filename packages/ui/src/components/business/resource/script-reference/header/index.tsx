import type { ReactNode } from "react";

import { Button } from "../../../../primitives";
import { ChevronRightIcon } from "../../../../primitives/icons";
import type { IconComponent } from "../../../../primitives/types";

export function ResourceScriptReferenceHeader({
  icon: Icon,
  title,
  onClose,
}: {
  icon: IconComponent;
  title: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="resource-script-reference-panel__header">
      <Icon size={14} className="resource-script-reference-panel__header-icon" />
      <span className="resource-script-reference-panel__title">{title}</span>
      <Button
        type="button"
        onClick={onClose}
        variant="ghost"
        size="icon-sm"
        className="resource-script-reference-panel__close"
      >
        <ChevronRightIcon size={16} />
      </Button>
    </div>
  );
}
