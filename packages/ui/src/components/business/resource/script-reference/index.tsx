import type { ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppSurfaceItem } from "../../app";
import type { IconComponent } from "../../../primitives/types";
import { ResourceScriptReferenceContent } from "./content";
import { ResourceScriptReferenceHeader } from "./header";
import { ResourceScriptReferenceSelector } from "./selector";
import { ResourceScriptReferenceTrigger } from "./trigger";
import type { ResourceScriptReferenceItem } from "./types";

export { ResourceScriptReferenceContent } from "./content";
export { ResourceScriptReferenceHeader } from "./header";
export { ResourceScriptReferenceSelector } from "./selector";
export { ResourceScriptReferenceTrigger } from "./trigger";
export type { ResourceScriptReferenceItem } from "./types";

export function ResourceScriptReferencePanel({
  open,
  onOpenChange,
  icon: Icon,
  title,
  expandLabel,
  emptyLabel,
  emptyContentLabel,
  items,
  selectedId,
  onSelectedIdChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: IconComponent;
  title: ReactNode;
  expandLabel: string;
  emptyLabel: ReactNode;
  emptyContentLabel: ReactNode;
  items: ResourceScriptReferenceItem[];
  selectedId?: string | null;
  onSelectedIdChange: (id: string) => void;
  className?: string;
}) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  if (!open) {
    return <ResourceScriptReferenceTrigger icon={Icon} expandLabel={expandLabel} onOpen={() => onOpenChange(true)} />;
  }

  return (
    <AppSurfaceItem variant="overlay" className={cn("resource-script-reference-panel", className)}>
      <ResourceScriptReferenceHeader icon={Icon} title={title} onClose={() => onOpenChange(false)} />
      <ResourceScriptReferenceSelector items={items} selectedId={selected?.id} onSelectedIdChange={onSelectedIdChange} />
      <ResourceScriptReferenceContent selected={selected} emptyLabel={emptyLabel} emptyContentLabel={emptyContentLabel} />
    </AppSurfaceItem>
  );
}
