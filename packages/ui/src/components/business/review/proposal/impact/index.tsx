import { toneTextClass } from "../../../../../semantic";
import { AppPanel } from "../../../app";
import { ReviewStat } from "../../callout";
import type { IconComponent } from "../../types";

export function ReviewProposalWriteImpactPanel({
  icon,
  actionCounts,
}: {
  icon?: IconComponent;
  actionCounts: { create: number; update: number; delete: number };
}) {
  return (
    <AppPanel icon={icon} iconClassName={toneTextClass("info")} title="写入影响">
      <div className="review-proposal-impact-grid">
        <ReviewStat tone="success">新建 {actionCounts.create}</ReviewStat>
        <ReviewStat tone="warning">更新 {actionCounts.update}</ReviewStat>
        <ReviewStat tone="danger">删除 {actionCounts.delete}</ReviewStat>
      </div>
      <p className="review-proposal-impact-detail">
        写入时会按完整提案同步：已有节点会更新，新节点会创建，未保留的旧节点会进入删除候选。
      </p>
    </AppPanel>
  );
}
