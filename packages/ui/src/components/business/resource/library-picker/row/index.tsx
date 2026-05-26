import type { ReactNode } from "react";

import { WorkbenchListItem, WorkbenchThumbnail } from "../../../workbench";
import type { ResourceLibraryPickerItem } from "../types";

export function ResourceLibraryPickerRow({
  item,
  selectedLabel,
  onSelect,
}: {
  item: ResourceLibraryPickerItem;
  selectedLabel: ReactNode;
  onSelect: () => void;
}) {
  return (
    <WorkbenchListItem onClick={onSelect} active={item.selected} density="compact" className="resource-library-picker__row">
      {item.thumbnail ? (
        <WorkbenchThumbnail ratio="square" className="resource-library-picker__thumbnail">
          {item.thumbnail}
        </WorkbenchThumbnail>
      ) : (
        <WorkbenchThumbnail ratio="square" className="resource-library-picker__thumbnail" icon={item.fallbackIcon} />
      )}
      <div className="resource-library-picker__item-copy">
        <p className="resource-library-picker__item-title">{item.title}</p>
        <p className="resource-library-picker__item-meta">{item.meta}</p>
      </div>
      {item.selected ? <span className="resource-library-picker__selected-label">{selectedLabel}</span> : null}
    </WorkbenchListItem>
  );
}
