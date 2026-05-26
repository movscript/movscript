import type { ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { ResourceLibraryPickerRow } from "../row";
import type { ResourceLibraryPickerItem } from "../types";

export function ResourceLibraryPickerList({
  items,
  selectedLabel,
  loadingLabel,
  emptyLabel,
  className,
  onSelect,
  isLoading,
}: {
  items: ResourceLibraryPickerItem[];
  selectedLabel: ReactNode;
  loadingLabel: ReactNode;
  emptyLabel: ReactNode;
  className?: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}) {
  return (
    <div className={cn("resource-library-picker__list", className)}>
      {isLoading ? (
        <p className="resource-library-picker__state">{loadingLabel}</p>
      ) : items.length === 0 ? (
        <p className="resource-library-picker__state">{emptyLabel}</p>
      ) : (
        items.map((item) => (
          <ResourceLibraryPickerRow
            key={item.id}
            item={item}
            selectedLabel={selectedLabel}
            onSelect={() => onSelect(item.id)}
          />
        ))
      )}
    </div>
  );
}
