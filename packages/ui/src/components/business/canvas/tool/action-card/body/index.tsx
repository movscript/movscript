import { CheckIcon, CircleIcon, ImageIcon, LoaderIcon, SettingsIcon, TextIcon } from "../../../../../primitives/icons";
import {
  CanvasToolConfigPill,
  CanvasToolEmptyRow,
  CanvasToolOutputTile,
  CanvasToolSectionTitle,
  CanvasToolSlotRow,
} from "../../slot";
import type { CanvasToolActionCardProps } from "../../types";
import { canvasToolSlotIcon } from "../helpers";

export function CanvasToolActionCardBody({
  inputs = [],
  configs = [],
  outputs = [],
  inputPanel,
  resultPanel,
  renderPortHandle,
}: Pick<CanvasToolActionCardProps, "inputs" | "configs" | "outputs" | "inputPanel" | "resultPanel" | "renderPortHandle">) {
  const visibleInputs = inputs.slice(0, 3);
  const visibleConfigs = configs.slice(0, 5);
  const visibleOutputs = outputs.slice(0, 2);

  return (
    <div className="canvas-tool-action-card__body">
      <div>
        <CanvasToolSectionTitle icon={<TextIcon size={12} />} label="输入" />
        <div className="canvas-tool-action-card__stack">
          {visibleInputs.length > 0 ? (
            visibleInputs.map((slot) => (
              <CanvasToolSlotRow
                key={slot.id}
                slot={slot}
                direction="input"
                icon={canvasToolSlotIcon(slot.type, 12)}
                pendingIcon={<LoaderIcon size={10} className="canvas-tool-action-card__spin-icon" />}
                readyIcon={<CheckIcon size={10} />}
                renderPortHandle={renderPortHandle}
              />
            ))
          ) : (
            <CanvasToolEmptyRow label="等待上游输入" />
          )}
        </div>
      </div>

      {inputPanel}

      <div className="canvas-tool-action-card__detail-grid">
        <div className="canvas-tool-action-card__config-column">
          <CanvasToolSectionTitle icon={<SettingsIcon size={12} />} label="配置" />
          <div className="canvas-tool-action-card__stack">
            {visibleConfigs.length > 0 ? (
              visibleConfigs.map((item) => <CanvasToolConfigPill key={item.id} item={item} />)
            ) : (
              <CanvasToolEmptyRow label="默认参数" />
            )}
          </div>
        </div>

        <div className="canvas-tool-action-card__output-column">
          <CanvasToolSectionTitle icon={<ImageIcon size={12} />} label="输出" />
          <div className="canvas-tool-action-card__output-grid">
            {visibleOutputs.length > 0 ? (
              visibleOutputs.map((slot) => (
                <CanvasToolOutputTile
                  key={slot.id}
                  slot={slot}
                  icon={canvasToolSlotIcon(slot.type, 14)}
                  pendingIcon={<LoaderIcon size={14} className="canvas-tool-action-card__spin-icon" />}
                  readyIcon={<CheckIcon size={10} />}
                  emptyIcon={<CircleIcon size={10} />}
                  renderPortHandle={renderPortHandle}
                />
              ))
            ) : (
              <div className="canvas-tool-action-card__output-empty">
                <CanvasToolEmptyRow label="未生成" />
              </div>
            )}
          </div>
        </div>
      </div>

      {resultPanel}
    </div>
  );
}
