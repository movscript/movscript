import { cn } from "../../../../../lib/cn";
import { Button, CheckIcon, ChevronRightIcon, StatusBadge } from "../../../../primitives";
import { WorkbenchSurfaceItem } from "../../list";
import { WorkbenchSection } from "../../section";
import { workbenchDecisionIntent } from "../../status";
import type { WorkbenchDecisionRow, WorkbenchIconComponent } from "../../types";

export function WorkbenchInfoPanel({ title, rows, icon }: { title: string; rows: string[]; icon: WorkbenchIconComponent }) {
  return (
    <WorkbenchSection title={title} icon={icon}>
      <div className="workbench-info-panel__rows">
        {rows.map((row) => (
          <WorkbenchSurfaceItem key={row} density="compact" className="workbench-info-panel__row">
            {row}
          </WorkbenchSurfaceItem>
        ))}
      </div>
    </WorkbenchSection>
  );
}

export function WorkbenchDecisionPanel({ title, rows }: { title: string; rows: WorkbenchDecisionRow[] }) {
  return (
    <WorkbenchSection title={title}>
      <div className="workbench-decision-panel">
        {rows.map((row) => (
          <WorkbenchSurfaceItem key={`${row.label}:${row.value}`}>
            <div className="workbench-decision-panel__header">
              <p className="workbench-decision-panel__label">{row.label}</p>
              <StatusBadge intent={workbenchDecisionIntent(row.state)}>
                {row.state === "attention" ? "需处理" : row.state === "positive" ? "可用" : "信息"}
              </StatusBadge>
            </div>
            <p className="workbench-decision-panel__value">{row.value}</p>
          </WorkbenchSurfaceItem>
        ))}
      </div>
    </WorkbenchSection>
  );
}

export function WorkbenchActionRail({
  actions,
  outputTitle,
  outputs,
}: {
  actions: string[];
  outputTitle: string;
  outputs: WorkbenchDecisionRow[];
}) {
  return (
    <aside className="workbench-action-rail">
      <section className="workbench-action-rail__section">
        <h3 className="workbench-action-rail__title">可执行动作</h3>
        <div className="workbench-action-rail__list">
          {actions.map((action, index) => (
            <Button
              key={action}
              type="button"
              variant={index === 0 ? "soft" : "outline"}
              size="sm"
              className={cn("workbench-action-rail__button", index === 0 && "workbench-action-rail__button--primary")}
            >
              {index === 0 ? <CheckIcon className="workbench-action-rail__button-icon workbench-action-rail__button-icon--primary" /> : <ChevronRightIcon className="workbench-action-rail__button-icon" />}
              <span>{action}</span>
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="workbench-action-rail__title">{outputTitle}</h3>
        <div className="workbench-action-rail__list">
          {outputs.map((row) => (
            <WorkbenchSurfaceItem key={`${row.label}:${row.value}`} density="compact">
              <div className="workbench-decision-panel__header">
                <p className="workbench-decision-panel__label">{row.label}</p>
                <StatusBadge intent={workbenchDecisionIntent(row.state)}>{row.state === "positive" ? "输出" : "记录"}</StatusBadge>
              </div>
              <p className="workbench-action-rail__output">{row.value}</p>
            </WorkbenchSurfaceItem>
          ))}
        </div>
      </section>
    </aside>
  );
}
