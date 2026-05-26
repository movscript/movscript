import { NativeSelect } from "../../../../primitives";
import type { ResourceScriptReferenceItem } from "../types";

export function ResourceScriptReferenceSelector({
  items,
  selectedId,
  onSelectedIdChange,
}: {
  items: ResourceScriptReferenceItem[];
  selectedId?: string;
  onSelectedIdChange: (id: string) => void;
}) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <div className="resource-script-reference-panel__selector">
      <NativeSelect
        controlSize="sm"
        className="resource-script-reference-panel__select"
        value={selectedId ?? ""}
        onChange={(event) => onSelectedIdChange(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
