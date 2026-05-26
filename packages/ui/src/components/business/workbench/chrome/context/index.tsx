import { cn } from "../../../../../lib/cn";
import { WorkbenchSurfaceItem } from "../../list";
import type { WorkbenchLinkRow } from "../../types";

export function WorkbenchContextStack({ rows, className }: { rows: WorkbenchLinkRow[]; className?: string }) {
  return (
    <WorkbenchSurfaceItem className={cn("workbench-context-stack", className)}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div key={row.label} className="workbench-context-stack__row">
            <div className="workbench-context-stack__label">
              <Icon size={14} className="workbench-context-stack__icon" />
              <span className="workbench-context-stack__label-text">{row.label}</span>
            </div>
            <p className="workbench-context-stack__value">{row.value}</p>
          </div>
        );
      })}
    </WorkbenchSurfaceItem>
  );
}
