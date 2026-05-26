import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../lib/cn";
import { Button } from "../../../primitives/button";

type ScriptDetailTabsAttributes = Omit<HTMLAttributes<HTMLDivElement>, "onSelect">;

export interface ScriptDetailTabItem {
  key: string;
  label: ReactNode;
}

export interface ScriptDetailTabsProps extends ScriptDetailTabsAttributes {
  tabs: ScriptDetailTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function ScriptDetailTabs({
  tabs,
  activeKey,
  onSelect,
  className,
  ...props
}: ScriptDetailTabsProps) {
  return (
    <div className={cn("script-detail-tabs", className)} {...props}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Button
            key={tab.key}
            type="button"
            variant="ghost"
            data-active={active ? "true" : undefined}
            onClick={() => onSelect(tab.key)}
            className="script-detail-tabs__trigger"
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}
