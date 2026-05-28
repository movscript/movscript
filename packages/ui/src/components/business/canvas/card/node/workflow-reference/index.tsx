import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../../lib/cn";
import { Button } from "../../../../../primitives";
import { CanvasCardShell } from "../../shell";
import { CanvasPortDot } from "../../port";
import type { CanvasPortHandleRenderer } from "../../types";

export type CanvasWorkflowReferencePort = {
  id: string;
  label: string;
  dataType: string;
};

export type CanvasWorkflowReferenceAction = {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
};

export type CanvasWorkflowReferenceCardProps = HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  icon: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  summary?: ReactNode;
  referenceMeta?: ReactNode;
  inputsLabel: ReactNode;
  outputsLabel: ReactNode;
  emptyInputsLabel: ReactNode;
  emptyOutputsLabel: ReactNode;
  inputs?: CanvasWorkflowReferencePort[];
  outputs?: CanvasWorkflowReferencePort[];
  primaryAction?: CanvasWorkflowReferenceAction;
  renderPortHandle?: CanvasPortHandleRenderer;
};

export function CanvasWorkflowReferenceCard({
  selected,
  icon,
  eyebrow,
  title,
  status,
  summary,
  referenceMeta,
  inputsLabel,
  outputsLabel,
  emptyInputsLabel,
  emptyOutputsLabel,
  inputs = [],
  outputs = [],
  primaryAction,
  renderPortHandle,
  className,
  ...props
}: CanvasWorkflowReferenceCardProps) {
  return (
    <CanvasCardShell selected={selected} className={cn("canvas-workflow-reference-card", className)} {...props}>
      <header className="canvas-workflow-reference-card__header">
        <span className="canvas-workflow-reference-card__icon">{icon}</span>
        <div className="canvas-workflow-reference-card__title-block">
          <div className="canvas-workflow-reference-card__eyebrow">{eyebrow}</div>
          <div className="canvas-workflow-reference-card__title">{title}</div>
        </div>
        {status ? <span className="canvas-workflow-reference-card__status">{status}</span> : null}
      </header>

      {summary || referenceMeta ? (
        <div className="canvas-workflow-reference-card__summary">
          {summary ? <span>{summary}</span> : <span />}
          {referenceMeta ? <span>{referenceMeta}</span> : null}
        </div>
      ) : null}

      <div className="canvas-workflow-reference-card__ports">
        <CanvasWorkflowReferencePortList
          direction="input"
          label={inputsLabel}
          emptyLabel={emptyInputsLabel}
          ports={inputs}
          renderPortHandle={renderPortHandle}
        />
        <CanvasWorkflowReferencePortList
          direction="output"
          label={outputsLabel}
          emptyLabel={emptyOutputsLabel}
          ports={outputs}
          renderPortHandle={renderPortHandle}
        />
      </div>

      {primaryAction ? (
        <div className="canvas-workflow-reference-card__footer">
          <Button
            size="sm"
            disabled={primaryAction.disabled}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              primaryAction.onClick?.();
            }}
          >
            {primaryAction.icon}
            {primaryAction.label}
          </Button>
        </div>
      ) : null}
    </CanvasCardShell>
  );
}

function CanvasWorkflowReferencePortList({
  direction,
  label,
  emptyLabel,
  ports,
  renderPortHandle,
}: {
  direction: "input" | "output";
  label: ReactNode;
  emptyLabel: ReactNode;
  ports: CanvasWorkflowReferencePort[];
  renderPortHandle?: CanvasPortHandleRenderer;
}) {
  return (
    <div>
      <div className="canvas-workflow-reference-card__section-title">{label}</div>
      <div className="canvas-workflow-reference-card__port-list">
        {ports.length > 0 ? (
          ports.map((port) => (
            <div key={port.id} className="canvas-workflow-reference-card__port-row" data-direction={direction}>
              <CanvasPortDot
                side={direction === "input" ? "left" : "right"}
                tone={direction === "input" ? "target" : "source"}
                label={port.label}
                className="canvas-workflow-reference-card__port-dot"
                compact
                handleId={port.id}
                handleType={direction === "input" ? "target" : "source"}
                renderPortHandle={renderPortHandle}
              />
              <span>{port.label}</span>
              <em>{port.dataType}</em>
            </div>
          ))
        ) : (
          <span className="canvas-workflow-reference-card__empty">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}
