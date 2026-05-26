import { Button } from "../../../../primitives";
import { ChevronLeftIcon } from "../../../../primitives/icons";
import type { IconComponent } from "../../../../primitives/types";

export function ResourceScriptReferenceTrigger({
  icon: Icon,
  expandLabel,
  onOpen,
}: {
  icon: IconComponent;
  expandLabel: string;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onOpen}
      variant="soft"
      size="icon"
      className="resource-script-reference-panel__trigger"
      title={expandLabel}
    >
      <Icon size={14} />
      <ChevronLeftIcon size={12} />
    </Button>
  );
}
