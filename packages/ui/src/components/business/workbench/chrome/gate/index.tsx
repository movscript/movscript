import { toneTextClass } from "../../../../../semantic";
import { cn } from "../../../../../lib/cn";
import { CheckIcon, CircleIcon } from "../../../../primitives";
import type { StatusIntent } from "../../../../primitives";
import { WorkbenchStatusBadge } from "../../card";
import { WorkbenchList } from "../../list";
import type { WorkbenchGate } from "../../types";

export function WorkbenchGateChecklist({ rows }: { rows: WorkbenchGate[] }) {
  return (
    <WorkbenchList className="workbench-gate-checklist">
      {rows.map((row) => (
        <div key={row.label} className="workbench-list-item workbench-gate-checklist__item">
          <div className="workbench-gate-checklist__header">
            <div className="workbench-gate-checklist__title">
              {row.done ? <CheckIcon className={cn("workbench-gate-checklist__icon", toneTextClass("success"))} /> : <CircleIcon className={cn("workbench-gate-checklist__icon", toneTextClass("warning"))} />}
              <span className="workbench-gate-checklist__label">{row.label}</span>
            </div>
            <WorkbenchStatusBadge intent={gateActionIntent(row.done, row.state)} label={gateActionLabel(row.done, row.state)} />
          </div>
          <p className="workbench-gate-checklist__detail">{row.detail}</p>
        </div>
      ))}
    </WorkbenchList>
  );
}

function gateActionLabel(done: boolean, state?: WorkbenchGate["state"]) {
  if (done) return "已通过";
  return state === "required" ? "待补齐" : "待确认";
}

function gateActionIntent(done: boolean, state?: WorkbenchGate["state"]): StatusIntent {
  if (done) return "success";
  return state === "required" ? "warning" : "neutral";
}
