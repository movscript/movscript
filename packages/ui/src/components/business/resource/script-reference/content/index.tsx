import type { ReactNode } from "react";

import { AppCodeBlock, AppTextEmptyState } from "../../../app";
import type { ResourceScriptReferenceItem } from "../types";

export function ResourceScriptReferenceContent({
  selected,
  emptyLabel,
  emptyContentLabel,
}: {
  selected: ResourceScriptReferenceItem | null;
  emptyLabel: ReactNode;
  emptyContentLabel: ReactNode;
}) {
  return (
    <div className="resource-script-reference-panel__body">
      {!selected ? (
        <AppTextEmptyState className="resource-script-reference-panel__empty">{emptyLabel}</AppTextEmptyState>
      ) : (
        <div className="resource-script-reference-panel__content">
          <div>
            <p className="resource-script-reference-panel__script-title">{selected.title}</p>
            {selected.description ? (
              <p className="resource-script-reference-panel__description">{selected.description}</p>
            ) : null}
          </div>
          {selected.content ? (
            <AppCodeBlock asChild className="resource-script-reference-panel__script-body">
              <p>{selected.content}</p>
            </AppCodeBlock>
          ) : (
            <AppTextEmptyState className="resource-script-reference-panel__empty resource-script-reference-panel__empty--italic">
              {emptyContentLabel}
            </AppTextEmptyState>
          )}
        </div>
      )}
    </div>
  );
}
