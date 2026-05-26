import { cn } from "../../../../../../lib/cn";
import { AppKeyValue } from "../../../../app";
import type { DetailEntityEditorStat } from "../../types";

export function DetailEntityEditorStats({
  stats,
  compact = false,
}: {
  stats: DetailEntityEditorStat[];
  compact?: boolean;
}) {
  return (
    <div className={cn("detail-entity-editor-stats", compact && "detail-entity-editor-stats--compact")}>
      {stats.map((stat) => (
        <AppKeyValue key={stat.label} label={stat.label} value={stat.value} strong />
      ))}
    </div>
  );
}
