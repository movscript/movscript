import type { HTMLAttributes } from "react";

export type DetailSurfaceMode = "content" | "workbench" | "canvas";
export type DetailHeaderAttributes = Omit<HTMLAttributes<HTMLElement>, "title">;
