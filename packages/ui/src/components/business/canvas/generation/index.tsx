import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { AppMediaFrame, AppSurfaceItem } from "../../app";
import { Button } from "../../../primitives/button";
import { NativeSelect } from "../../../primitives/select";
import { Textarea } from "../../../primitives/textarea";
import { LoaderIcon, SparklesIcon } from "../../../primitives/icons";

export interface CanvasGenerationModelOption {
  value: string | number;
  label: ReactNode;
}

export function CanvasGenerationBody({
  models,
  selectedModel,
  onModelChange,
  onModelClick,
  prompt,
  promptPlaceholder,
  onPromptChange,
  onPromptClick,
  error,
  output,
  textOutput,
  isRunning,
  runningLabel,
  runLabel,
  onRun,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  models?: CanvasGenerationModelOption[];
  selectedModel?: string | number;
  onModelChange?: (value: string) => void;
  onModelClick?: React.MouseEventHandler<HTMLSelectElement>;
  prompt?: string;
  promptPlaceholder?: string;
  onPromptChange?: (value: string) => void;
  onPromptClick?: React.MouseEventHandler<HTMLTextAreaElement>;
  error?: ReactNode;
  output?: ReactNode;
  textOutput?: ReactNode;
  isRunning?: boolean;
  runningLabel: ReactNode;
  runLabel: ReactNode;
  onRun?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className={cn("canvas-generation-body nodrag nowheel", className)}>
      {models && models.length > 0 ? (
        <NativeSelect
          controlSize="sm"
          className="canvas-generation-body__model nodrag"
          value={selectedModel ?? models[0]?.value ?? ""}
          onChange={(event) => onModelChange?.(event.target.value)}
          onClick={onModelClick}
        >
          {models.map((model) => (
            <option key={String(model.value)} value={model.value}>{model.label}</option>
          ))}
        </NativeSelect>
      ) : null}

      <Textarea
        className="canvas-generation-body__prompt nodrag nowheel"
        rows={3}
        placeholder={promptPlaceholder}
        value={prompt ?? ""}
        onChange={(event) => onPromptChange?.(event.target.value)}
        onClick={onPromptClick}
      />

      {error ? <p className="canvas-generation-body__error">{error}</p> : null}

      {output ? (
        <AppMediaFrame variant="stage" className="canvas-generation-body__output">
          {output}
        </AppMediaFrame>
      ) : null}

      {textOutput ? (
        <AppSurfaceItem asChild variant="muted" className="canvas-generation-body__text-output nowheel">
          <p>{textOutput}</p>
        </AppSurfaceItem>
      ) : null}

      <Button
        type="button"
        onMouseDown={onRun}
        disabled={isRunning}
        size="sm"
        className="canvas-generation-body__run nodrag"
      >
        {isRunning ? <LoaderIcon className="canvas-generation-body__run-icon canvas-generation-body__run-icon--spinning" /> : <SparklesIcon className="canvas-generation-body__run-icon" />}
        {isRunning ? runningLabel : runLabel}
      </Button>
    </div>
  );
}
