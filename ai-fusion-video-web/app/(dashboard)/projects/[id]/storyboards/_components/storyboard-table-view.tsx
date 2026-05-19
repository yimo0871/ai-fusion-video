"use client";

import { Film, GripVertical, Plus, Trash2, ImageIcon, Video, Play, ZoomIn, X } from "lucide-react";
import { VideoPreviewDialog } from "@/components/dashboard/video-preview-dialog";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/api/client";
import type { StoryboardItem } from "@/lib/api/storyboard";
import { EditableCell } from "./editable-cell";
import { useState, useRef, useCallback, useEffect } from "react";

/** 安全解析 ID 数组 */
function parseIds(raw: number[] | string | null | undefined): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 格式化资产显示名称：子变体名 (主资产名) */
function getAssetDisplayName(subItemName: string | null | undefined, parentAssetName: string) {
  const subName = subItemName?.trim();
  const parentName = parentAssetName.trim();
  if (!subName || subName === "默认" || subName === "默认变体" || subName === "初始") {
    return parentName;
  }
  return `${subName} (${parentName})`;
}

/** 列定义 */
type StoryboardTableField =
  | "shotNumber"
  | "imageUrl"
  | "generatedVideoUrl"
  | "shotType"
  | "duration"
  | "cameraAngle"
  | "cameraMovement"
  | "content"
  | "dialogue"
  | "sound"
  | "remark"
  | "assets";

interface ColumnDef {
  label: string;
  field: StoryboardTableField;
  initW: number;
  minW: number;
  isImage?: boolean;
  isVideo?: boolean;
  multiline?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { label: "镜号", field: "shotNumber", initW: 56, minW: 40 },
  { label: "画面", field: "imageUrl", initW: 80, minW: 60, isImage: true },
  { label: "视频", field: "generatedVideoUrl", initW: 80, minW: 60, isVideo: true },
  { label: "关联资产", field: "assets", initW: 160, minW: 100 },
  { label: "景别", field: "shotType", initW: 72, minW: 50 },
  { label: "时长", field: "duration", initW: 56, minW: 40 },
  { label: "摄像机角度", field: "cameraAngle", initW: 90, minW: 60 },
  { label: "运镜", field: "cameraMovement", initW: 80, minW: 50 },
  {
    label: "分镜内容",
    field: "content",
    initW: 200,
    minW: 100,
    multiline: true,
  },
  { label: "对白", field: "dialogue", initW: 180, minW: 80, multiline: true },
  { label: "声音", field: "sound", initW: 100, minW: 60 },
  { label: "备注", field: "remark", initW: 100, minW: 60 },
];

/** 固定列宽 */
const DRAG_COL_W = 28;
const ACTION_COL_W = 56;

export function StoryboardTableView({
  items,
  selectedItemId,
  onSelectItem,
  onUpdateItemField,
  onAddItem,
  onDeleteItem,
  onReorderItems,
  onVideoGen,
  assetLookup = {},
  onEditAssets,
}: {
  items: StoryboardItem[];
  selectedItemId: number | null;
  onSelectItem: (id: number | null) => void;
  onUpdateItemField: (itemId: number, field: string, value: string) => void;
  onAddItem: () => void;
  onDeleteItem: (id: number) => void;
  onReorderItems?: (reorderedItems: StoryboardItem[]) => void;
  onVideoGen?: (itemId: number) => void;
  assetLookup?: Record<
    number,
    {
      item: import("@/lib/api/asset").AssetItem;
      asset: import("@/lib/api/asset").Asset;
    }
  >;
  onEditAssets?: (item: StoryboardItem) => void;
}) {
  const [colWidths, setColWidths] = useState<number[]>(
    COLUMNS.map((c) => c.initW)
  );
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>("");

  // ========== 行拖拽排序 ==========
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      setDragIdx(idx);
      dragNodeRef.current = e.currentTarget;
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => {
        if (dragNodeRef.current) {
          dragNodeRef.current.style.opacity = "0.4";
        }
      });
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = "1";
    }
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const reordered = [...items];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      onReorderItems?.(reordered);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragNodeRef.current = null;
  }, [dragIdx, overIdx, items, onReorderItems]);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIdx !== null && idx !== overIdx) {
        setOverIdx(idx);
      }
    },
    [dragIdx, overIdx]
  );

  // ========== 列宽拖拽（直接 DOM 操作避免重渲染） ==========
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const colWidthsRef = useRef(colWidths);

  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);

  /** 构建 grid-template-columns 字符串 */
  const buildGridTemplate = useCallback(
    (widths: number[]) =>
      `${DRAG_COL_W}px ${widths.map((w) => `${w}px`).join(" ")} ${ACTION_COL_W}px`,
    []
  );

  /** 根据列宽数组直接更新所有 grid 行的 gridTemplateColumns */
  const applyGridTemplate = useCallback(
    (widths: number[]) => {
      if (!containerRef.current) return;
      const tpl = buildGridTemplate(widths);
      const totalW = DRAG_COL_W + widths.reduce((s, w) => s + w, 0) + ACTION_COL_W;
      // 更新外层容器宽度
      containerRef.current.style.width = `${totalW}px`;
      containerRef.current.style.minWidth = `${totalW}px`;
      // 更新所有 grid 行
      const gridRows = containerRef.current.querySelectorAll<HTMLElement>("[data-grid-row]");
      gridRows.forEach((row) => {
        row.style.gridTemplateColumns = tpl;
      });
    },
    [buildGridTemplate]
  );

  const handleResizeStart = useCallback(
    (colIdx: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingCol(colIdx);

      const startX = e.clientX;
      const startW = colWidthsRef.current[colIdx];
      const minW = COLUMNS[colIdx].minW;
      const liveWidths = [...colWidthsRef.current];

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        liveWidths[colIdx] = Math.max(minW, startW + delta);
        applyGridTemplate(liveWidths);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setResizingCol(null);
        // 最终提交到 state
        setColWidths([...liveWidths]);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [applyGridTemplate]
  );

  // CSS Grid 模板
  const gridTemplate = buildGridTemplate(colWidths);
  const totalWidth =
    DRAG_COL_W + colWidths.reduce((s, w) => s + w, 0) + ACTION_COL_W;

  // ========== 空状态 ==========
  if (items.length === 0) {
    return (
      <div
        onClick={onAddItem}
        className={cn(
          "rounded-2xl border-2 border-dashed border-primary/20 p-16",
          "flex flex-col items-center justify-center text-center",
          "bg-linear-to-br from-primary/5 to-transparent hover:border-primary/40 hover:from-primary/10 transition-all duration-300 cursor-pointer shadow-sm"
        )}
      >
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary transition-transform group-hover:scale-110">
          <Film className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">暂无镜头</h3>
        <p className="text-xs text-muted-foreground/80">点击添加该场次的第一个镜头</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 横向滚动容器 */}
      <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-x-auto">
        <div ref={containerRef} style={{ width: totalWidth, minWidth: totalWidth }}>
          {/* ===== 表头 ===== */}
          <div
            className="grid bg-muted/20 border-b border-border/20"
            data-grid-row
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {/* 拖拽占位 */}
            <div className="px-1 py-2.5" />

            {/* 数据列表头 */}
            {COLUMNS.map((col, i) => (
              <div
                key={col.field}
                className="relative px-2 py-2.5 flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap select-none"
              >
                {col.label}
                {/* 列宽拖拽手柄 */}
                <div
                  onMouseDown={(e) => handleResizeStart(i, e)}
                  className={cn(
                    "absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize z-10",
                    "group/resize"
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-y-1.5 left-1/2 -translate-x-1/2 w-[2px] rounded-full transition-colors",
                      resizingCol === i
                        ? "bg-primary/70"
                        : "bg-border/40 group-hover/resize:bg-primary/50"
                    )}
                  />
                </div>
              </div>
            ))}

            {/* 操作占位 */}
            <div className="px-1 py-2.5" />
          </div>

          {/* ===== 数据行 ===== */}
          {items.map((item, idx) => {
            const isDragging = dragIdx === idx;
            const isOver =
              overIdx === idx && dragIdx !== null && dragIdx !== idx;
            const showTopLine = isOver && dragIdx !== null && dragIdx > idx;
            const showBottomLine = isOver && dragIdx !== null && dragIdx < idx;

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, idx)}
                onClick={() => onSelectItem(item.id)}
                className={cn(
                  "grid border-b border-border/10 last:border-b-0",
                  "transition-colors group cursor-pointer",
                  selectedItemId === item.id
                    ? "bg-primary/5 hover:bg-primary/8"
                    : "hover:bg-primary/3",
                  isDragging && "opacity-40"
                )}
                data-grid-row
                style={{
                  gridTemplateColumns: gridTemplate,
                  boxShadow: showTopLine
                    ? "0 -2px 0 0 hsl(var(--primary) / 0.6)"
                    : showBottomLine
                    ? "0 2px 0 0 hsl(var(--primary) / 0.6)"
                    : undefined,
                }}
              >
                {/* 行拖拽手柄 */}
                <div className="px-1 py-2 flex items-center justify-center">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-muted-foreground/90 cursor-grab active:cursor-grabbing" />
                </div>

                {/* 数据列 */}
                {COLUMNS.map((col) => (
                  <div
                    key={col.field}
                    className="px-2 py-2 flex items-center justify-center min-w-0 break-all"
                  >
                    {col.isImage ? (
                      <div
                        onClick={(e) => {
                          if (item.imageUrl) {
                            e.stopPropagation();
                            setPreviewImageUrl(item.imageUrl);
                            setPreviewImageTitle(`镜头 #${item.shotNumber || item.autoShotNumber || ""} 画面`);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-center h-11 w-16 rounded-md bg-muted/20 border border-border/10 overflow-hidden shrink-0 relative group/img",
                          item.imageUrl && "cursor-zoom-in hover:border-primary/40 transition-colors"
                        )}
                      >
                        {item.imageUrl ? (
                          <>
                            <img
                              src={resolveMediaUrl(item.imageUrl) || ""}
                              alt="画面"
                              className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/25 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all">
                              <ZoomIn className="h-3.5 w-3.5 text-white/90" />
                            </div>
                          </>
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                      </div>
                    ) : col.isVideo ? (
                      <div className="flex items-center justify-center h-11 w-16 rounded-md bg-muted/20 border border-border/10 overflow-hidden shrink-0 relative group/video">
                        {(item.generatedVideoUrl || item.videoUrl) ? (
                          <>
                            <video
                              src={resolveMediaUrl(item.generatedVideoUrl || item.videoUrl) || ""}
                              className="w-full h-full object-cover"
                              muted
                              preload="metadata"
                              playsInline
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectItem(item.id);
                                const rawVideoUrl = item.generatedVideoUrl || item.videoUrl;
                                if (rawVideoUrl) {
                                  setPreviewVideoUrl(rawVideoUrl);
                                }
                              }}
                              className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/video:bg-black/40 transition-colors"
                              title="预览视频"
                            >
                              <Play className="h-3.5 w-3.5 text-white/90 fill-white/90" />
                            </button>
                          </>
                        ) : (
                          <Video className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                      </div>
                    ) : col.field === "assets" ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item.id);
                          onEditAssets?.(item);
                        }}
                        className="group/cell w-full h-full min-h-11 flex items-center justify-center px-1.5 py-1.5 rounded-lg border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
                      >
                        {(() => {
                          const charIds = parseIds(item.characterIds);
                          const sceneId = item.sceneAssetItemId;
                          const propIds = parseIds(item.propIds);

                          const charItems = charIds.map((id) => assetLookup[id]).filter(Boolean);
                          const sceneItem = sceneId ? assetLookup[sceneId] : null;
                          const propItems = propIds.map((id) => assetLookup[id]).filter(Boolean);

                          const hasAssets = charItems.length > 0 || !!sceneItem || propItems.length > 0;

                          if (!hasAssets) {
                            return (
                              <span className="text-[10px] text-muted-foreground/35 group-hover/cell:text-primary transition-colors flex items-center gap-1 font-medium select-none">
                                + 关联资产
                              </span>
                            );
                          }

                          return (
                            <div className="flex flex-wrap gap-1 justify-center w-full max-h-[80px] overflow-hidden">
                              {/* 角色 */}
                              {charItems.map((ci, idx) => (
                                <div
                                  key={`char-${idx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 max-w-full text-[10px] shrink-0"
                                  title={`角色: ${getAssetDisplayName(ci.item.name, ci.asset.name)}`}
                                >
                                  {ci.item.imageUrl && (
                                    <img
                                      src={resolveMediaUrl(ci.item.imageUrl) || ""}
                                      alt="avatar"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewImageUrl(ci.item.imageUrl!);
                                        setPreviewImageTitle(`角色: ${getAssetDisplayName(ci.item.name, ci.asset.name)}`);
                                      }}
                                      className="h-3.5 w-3.5 rounded-xs object-cover cursor-zoom-in hover:scale-110 active:scale-95 transition-transform"
                                    />
                                  )}
                                  <span className="truncate max-w-[80px]">
                                    {getAssetDisplayName(ci.item.name, ci.asset.name)}
                                  </span>
                                </div>
                              ))}
                              {/* 场景 */}
                              {sceneItem && (
                                <div
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 max-w-full text-[10px] shrink-0"
                                  title={`场景: ${getAssetDisplayName(sceneItem.item.name, sceneItem.asset.name)}`}
                                >
                                  {sceneItem.item.imageUrl && (
                                    <img
                                      src={resolveMediaUrl(sceneItem.item.imageUrl) || ""}
                                      alt="scene"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewImageUrl(sceneItem.item.imageUrl!);
                                        setPreviewImageTitle(`场景: ${getAssetDisplayName(sceneItem.item.name, sceneItem.asset.name)}`);
                                      }}
                                      className="h-3.5 w-3.5 rounded-xs object-cover cursor-zoom-in hover:scale-110 active:scale-95 transition-transform"
                                    />
                                  )}
                                  <span className="truncate max-w-[80px]">
                                    {getAssetDisplayName(sceneItem.item.name, sceneItem.asset.name)}
                                  </span>
                                </div>
                              )}
                              {/* 道具 */}
                              {propItems.map((pi, idx) => (
                                <div
                                  key={`prop-${idx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 max-w-full text-[10px] shrink-0"
                                  title={`道具: ${getAssetDisplayName(pi.item.name, pi.asset.name)}`}
                                >
                                  {pi.item.imageUrl && (
                                    <img
                                      src={resolveMediaUrl(pi.item.imageUrl) || ""}
                                      alt="prop"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewImageUrl(pi.item.imageUrl!);
                                        setPreviewImageTitle(`道具: ${getAssetDisplayName(pi.item.name, pi.asset.name)}`);
                                      }}
                                      className="h-3.5 w-3.5 rounded-xs object-cover cursor-zoom-in hover:scale-110 active:scale-95 transition-transform"
                                    />
                                  )}
                                  <span className="truncate max-w-[80px]">
                                    {getAssetDisplayName(pi.item.name, pi.asset.name)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <EditableCell
                        value={
                          col.field === "shotNumber"
                            ? item.shotNumber || String(idx + 1)
                            : col.field === "duration"
                            ? item.duration
                              ? String(item.duration)
                              : ""
                            : (item[col.field as keyof StoryboardItem] as string) ||
                              ""
                        }
                        placeholder={
                          col.field === "shotNumber" ? String(idx + 1) : ""
                        }
                        onSave={(val) =>
                          onUpdateItemField(item.id, col.field, val)
                        }
                        onCellClick={() => onSelectItem(item.id)}
                        className={cn(
                          "text-[11px] w-full",
                          col.field === "shotNumber"
                            ? "font-mono text-muted-foreground text-center"
                            : col.field === "content"
                            ? ""
                            : "text-muted-foreground text-center"
                        )}
                        multiline={col.multiline}
                      />
                    )}
                  </div>
                ))}

                {/* 操作按钮 */}
                <div className="px-1 py-2 flex items-center justify-center gap-0.5">
                  {/* 生成视频 - 需要有画面 */}
                  {(item.imageUrl || item.generatedImageUrl) && onVideoGen && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onVideoGen(item.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                      title="生成视频"
                    >
                      <Video className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 添加按钮 */}
      <button
        onClick={onAddItem}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl",
          "border-2 border-dashed border-border/30 hover:border-primary/30",
          "text-muted-foreground hover:text-primary transition-all",
          "text-xs font-medium"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        添加镜头
      </button>

      <VideoPreviewDialog
        open={!!previewVideoUrl}
        title="镜头视频预览"
        videoUrl={previewVideoUrl}
        onClose={() => setPreviewVideoUrl(null)}
      />

      {/* 图片大图预览灯箱 */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-12 right-0 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={resolveMediaUrl(previewImageUrl) || ""}
              alt={previewImageTitle}
              className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl border border-white/10 select-none pointer-events-none"
            />
            <p className="text-white/90 text-xs font-medium px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/5">
              {previewImageTitle}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
