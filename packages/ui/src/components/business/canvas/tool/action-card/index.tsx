import { cn } from "../../../../../lib/cn";
import { CanvasCardShell } from "../../card";
import type { CanvasToolActionCardProps } from "../types";
import { CanvasToolActionCardBody } from "./body";
import { CanvasToolActionCardFooter } from "./footer";
import { CanvasToolActionCardHeader } from "./header";

export function CanvasToolActionCard({
  source,
  tone,
  icon,
  title,
  subtitle,
  status,
  selected,
  inputs = [],
  configs,
  outputs = [],
  inputPanel,
  resultPanel,
  primaryAction,
  secondaryAction,
  footer,
  className,
  renderPortHandle,
}: CanvasToolActionCardProps) {
  return (
    <CanvasCardShell
      selected={selected}
      className={cn("canvas-tool-action-card", selected && "canvas-tool-action-card--selected", className)}
    >
      <CanvasToolActionCardHeader source={source} tone={tone} icon={icon} title={title} subtitle={subtitle} status={status} />
      <CanvasToolActionCardBody
        inputs={inputs}
        configs={configs}
        outputs={outputs}
        inputPanel={inputPanel}
        resultPanel={resultPanel}
        renderPortHandle={renderPortHandle}
      />
      <CanvasToolActionCardFooter primaryAction={primaryAction} secondaryAction={secondaryAction} footer={footer} />
    </CanvasCardShell>
  );
}

export { CanvasToolActionCardBody } from "./body";
export { CanvasToolActionCardFooter } from "./footer";
export { CanvasToolActionCardHeader } from "./header";
