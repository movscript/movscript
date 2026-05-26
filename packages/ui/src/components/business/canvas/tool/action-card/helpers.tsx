import { FileJsonIcon, ImageIcon, TextIcon, VideoIcon } from "../../../../primitives/icons";
import type { CanvasToolSlotType } from "../types";

export function canvasToolSlotIcon(type: CanvasToolSlotType, size: number) {
  const Icon = type === "image" ? ImageIcon : type === "video" ? VideoIcon : type === "json" ? FileJsonIcon : TextIcon;
  return <Icon size={size} />;
}
