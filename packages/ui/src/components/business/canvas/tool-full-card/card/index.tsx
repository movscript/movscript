import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../../../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../primitives/card";

export function CanvasToolFullCard({
  title,
  modelControl,
  modeAction,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  modelControl?: ReactNode;
  modeAction?: ReactNode;
}) {
  return (
    <Card className={cn("canvas-tool-full-card", className)} {...props}>
      <CardHeader className="canvas-tool-full-card__header">
        <div className="canvas-tool-full-card__header-row">
          <CardTitle className="canvas-tool-full-card__title">{title}</CardTitle>
          {modelControl}
          {modeAction}
        </div>
      </CardHeader>
      <CardContent className="canvas-tool-full-card__content">
        {children}
      </CardContent>
    </Card>
  );
}
