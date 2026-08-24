import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
  PageInfo,
  Annotation,
  ToolType,
  Point,
  TextAnnotation,
  DrawAnnotation,
  ShapeAnnotation,
  RedactAnnotation,
  ImageAnnotation,
  WatermarkConfig,
  ExtractedTextItem,
} from '../../types/pdf';
import { PdfRenderService } from '../../services/pdfRenderService';
import * as pdfjsLib from 'pdfjs-dist';

interface CanvasEditorProps {
  docId: string;
  pdfBytes: Uint8Array | null;
  pages: PageInfo[];
  activePageIndex: number;
  zoom: number;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  currentFontSize: number;
  currentFontFamily: string;
  currentOpacity: number;
  annotations: Record<number, Annotation[]>;
  watermark: WatermarkConfig | null;
  selectedAnnotationId: string | null;
  onSelectPage: (index: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotations: (pageIndex: number, annotations: Annotation[]) => void;
  onDeleteAnnotation: (id: string) => void;
}

// Sub-component for rendering a single page in the multi-page scroll view
const SinglePageView: React.FC<{
  docId: string;
  pdfBytes: Uint8Array | null;
  pdfProxy: pdfjsLib.PDFDocumentProxy | null;
  page: PageInfo;
  pageIndex: number;
  isActive: boolean;
  zoom: number;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  currentFontSize: number;
  currentFontFamily: string;
  currentOpacity: number;
  pageAnnotations: Annotation[];
  watermark: WatermarkConfig | null;
  selectedAnnotationId: string | null;
  onFocusPage: (index: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotations: (newAnns: Annotation[]) => void;
  onDeleteAnnotation: (id: string) => void;
}> = ({
  docId,
  pdfBytes,
  pdfProxy,
  page,
  pageIndex,
  isActive,
  zoom,
  activeTool,
  currentColor,
  currentStrokeWidth,
  currentFontSize,
  currentFontFamily,
  currentOpacity,
  pageAnnotations,
  watermark,
  selectedAnnotationId,
  onFocusPage,
  onSelectAnnotation,
  onUpdateAnnotations,
  onDeleteAnnotation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [extractedTextItems, setExtractedTextItems] = useState<ExtractedTextItem[]>([]);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);

  // Interaction states for this page
  const [isInteracting, setIsInteracting] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentDrawPoints, setCurrentDrawPoints] = useState<Point[]>([]);
  const [previewShape, setPreviewShape] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [resizingHandle, setResizingHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const [initialResizeBox, setInitialResizeBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const renderWidth = Math.round(page.width * zoom);
  const renderHeight = Math.round(page.height * zoom);

  // Render this page to canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    let isCancelled = false;

    const render = async () => {
      if (page.isBlank) {
        const c = canvasRef.current;
        if (!c) return;
        c.width = renderWidth;
        c.height = renderHeight;
        c.style.width = `${renderWidth}px`;
        c.style.height = `${renderHeight}px`;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, renderWidth, renderHeight);
        }
        return;
      }

      if (page.customBytes) {
        try {
          const extDoc = await pdfjsLib.getDocument({ data: new Uint8Array(page.customBytes) }).promise;
          if (!isCancelled && canvasRef.current) {
            await PdfRenderService.renderPageToCanvas(
              extDoc,
              page.originalPageIndex + 1,
              canvasRef.current,
              zoom,
              page.rotation
            );
          }
        } catch (e) {
          console.error('Error rendering custom page in canvas:', e);
        }
        return;
      }

      if (pdfProxy && canvasRef.current) {
        try {
          await PdfRenderService.renderPageToCanvas(
            pdfProxy,
            page.originalPageIndex + 1,
            canvasRef.current,
            zoom,
            page.rotation
          );
        } catch (e) {
          console.error('Error rendering page in canvas:', e);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, page, zoom, renderWidth, renderHeight]);

  // Extract original text items for in-place text editing
  useEffect(() => {
    if (!pdfProxy || page.isBlank || page.customBytes) return;
    let isCancelled = false;

    PdfRenderService.extractPageTextItems(pdfProxy, page.originalPageIndex + 1)
      .then((items) => {
        if (!isCancelled) {
          setExtractedTextItems(items);
        }
      })
      .catch((err) => console.error('Error extracting text items for page', pageIndex, err));

    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, page, pageIndex]);

  // Transform client pointer to PDF point coordinate
  const getPdfPoint = useCallback(
    (e: React.PointerEvent): Point => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      return {
        x: clientX / zoom,
        y: clientY / zoom,
      };
    },
    [zoom]
  );

  // In-place text edit save handler
  const handleSaveOriginalTextEdit = (item: ExtractedTextItem, newText: string) => {
    if (newText === item.str) {
      setEditingOriginalId(null);
      return;
    }

    // 1. Mask original text with whiteout patch
    const maskAnnotation: RedactAnnotation = {
      id: `mask-${item.id}-${Date.now()}`,
      pageIndex,
      type: 'redact',
      x: item.x - 2,
      y: item.y - 2,
      width: Math.max(item.width + 4, 24),
      height: Math.max(item.height + 4, 16),
      color: '#ffffff',
    };

    // 2. Add edited text on top
    const textAnnotation: TextAnnotation = {
      id: `text-${item.id}-${Date.now()}`,
      pageIndex,
      type: 'text',
      x: item.x,
      y: item.y,
      width: Math.max(item.width + 4, 24),
      height: item.height,
      text: newText,
      fontSize: item.fontSize,
      fontFamily: (item.fontName?.includes('Times')
        ? 'TimesRoman'
        : item.fontName?.includes('Courier')
        ? 'Courier'
        : 'Helvetica') as any,
      color: '#000000',
      opacity: 1,
    };

    onUpdateAnnotations([...pageAnnotations, maskAnnotation, textAnnotation]);
    setEditingOriginalId(null);
  };

  // Pointer event handlers for drawing, adding text, and dragging annotations
  const handlePointerDown = (e: React.PointerEvent) => {
    onFocusPage(pageIndex);
    const target = e.target as HTMLElement;

    if (
      target.closest('.annotation-item') ||
      target.closest('.unvectorize-box') ||
      target.closest('input') ||
      target.closest('textarea')
    ) {
      return;
    }

    if (activeTool === 'select') {
      onSelectAnnotation(null);
      setEditingTextId(null);
      setEditingOriginalId(null);
      return;
    }

    const pt = getPdfPoint(e);
    setIsInteracting(true);
    setDragStart(pt);

    if (activeTool === 'draw' || activeTool === 'highlight') {
      setCurrentDrawPoints([pt]);
    } else if (activeTool === 'text') {
      const newText: TextAnnotation = {
        id: `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        pageIndex,
        type: 'text',
        x: pt.x,
        y: pt.y,
        width: 140,
        height: 32,
        text: 'Type text...',
        fontSize: currentFontSize,
        fontFamily: currentFontFamily as any,
        color: currentColor,
        opacity: currentOpacity,
      };
      onUpdateAnnotations([...pageAnnotations, newText]);
      onSelectAnnotation(newText.id);
      setEditingTextId(newText.id);
      setIsInteracting(false);
    } else if (
      activeTool === 'rectangle' ||
      activeTool === 'circle' ||
      activeTool === 'arrow' ||
      activeTool === 'line' ||
      activeTool === 'redact'
    ) {
      setPreviewShape({ x: pt.x, y: pt.y, width: 0, height: 0 });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pt = getPdfPoint(e);

    // Resizing annotation
    if (resizingHandle && draggingAnnotationId && initialResizeBox && dragStart) {
      const dx = pt.x - dragStart.x;
      const dy = pt.y - dragStart.y;
      let { x, y, width, height } = initialResizeBox;

      if (resizingHandle === 'se') {
        width = Math.max(20, initialResizeBox.width + dx);
        height = Math.max(20, initialResizeBox.height + dy);
      } else if (resizingHandle === 'sw') {
        width = Math.max(20, initialResizeBox.width - dx);
        x = initialResizeBox.x + (initialResizeBox.width - width);
        height = Math.max(20, initialResizeBox.height + dy);
      } else if (resizingHandle === 'ne') {
        width = Math.max(20, initialResizeBox.width + dx);
        height = Math.max(20, initialResizeBox.height - dy);
        y = initialResizeBox.y + (initialResizeBox.height - height);
      } else if (resizingHandle === 'nw') {
        width = Math.max(20, initialResizeBox.width - dx);
        height = Math.max(20, initialResizeBox.height - dy);
        x = initialResizeBox.x + (initialResizeBox.width - width);
        y = initialResizeBox.y + (initialResizeBox.height - height);
      }

      onUpdateAnnotations(
        pageAnnotations.map((a) => (a.id === draggingAnnotationId ? { ...a, x, y, width, height } : a))
      );
      return;
    }

    // Dragging annotation
    if (draggingAnnotationId && !resizingHandle) {
      const newX = pt.x - dragOffset.x;
      const newY = pt.y - dragOffset.y;
      onUpdateAnnotations(
        pageAnnotations.map((a) => (a.id === draggingAnnotationId ? { ...a, x: newX, y: newY } : a))
      );
      return;
    }

    if (!isInteracting || !dragStart) return;

    if (activeTool === 'draw' || activeTool === 'highlight') {
      setCurrentDrawPoints((prev) => [...prev, pt]);
    } else if (
      activeTool === 'rectangle' ||
      activeTool === 'circle' ||
      activeTool === 'arrow' ||
      activeTool === 'line' ||
      activeTool === 'redact'
    ) {
      const minX = Math.min(dragStart.x, pt.x);
      const minY = Math.min(dragStart.y, pt.y);
      const width = Math.abs(pt.x - dragStart.x);
      const height = Math.abs(pt.y - dragStart.y);
      setPreviewShape({ x: minX, y: minY, width, height });
    }
  };

  const handlePointerUp = () => {
    if (isInteracting && dragStart) {
      if (activeTool === 'draw' || activeTool === 'highlight') {
        if (currentDrawPoints.length > 1) {
          const newDraw: DrawAnnotation = {
            id: `draw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            pageIndex,
            type: activeTool === 'highlight' ? 'highlight' : 'draw',
            points: currentDrawPoints,
            strokeColor: currentColor,
            strokeWidth: activeTool === 'highlight' ? Math.max(currentStrokeWidth, 14) : currentStrokeWidth,
            opacity: activeTool === 'highlight' ? 0.35 : currentOpacity,
            isHighlighter: activeTool === 'highlight',
            x: 0,
            y: 0,
            width: page.width,
            height: page.height,
          };
          onUpdateAnnotations([...pageAnnotations, newDraw]);
        }
      } else if (previewShape && (previewShape.width > 4 || previewShape.height > 4)) {
        if (activeTool === 'redact') {
          const newRedact: RedactAnnotation = {
            id: `redact-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            pageIndex,
            type: 'redact',
            x: previewShape.x,
            y: previewShape.y,
            width: previewShape.width,
            height: previewShape.height,
            color: currentColor === '#000000' ? '#000000' : '#ffffff',
          };
          onUpdateAnnotations([...pageAnnotations, newRedact]);
        } else {
          const newShape: ShapeAnnotation = {
            id: `shape-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            pageIndex,
            type: activeTool as any,
            x: previewShape.x,
            y: previewShape.y,
            width: Math.max(previewShape.width, 10),
            height: Math.max(previewShape.height, 10),
            strokeColor: currentColor,
            strokeWidth: currentStrokeWidth,
            opacity: currentOpacity,
          };
          onUpdateAnnotations([...pageAnnotations, newShape]);
        }
      }
    }

    setIsInteracting(false);
    setDragStart(null);
    setCurrentDrawPoints([]);
    setPreviewShape(null);
    setDraggingAnnotationId(null);
    setResizingHandle(null);
    setInitialResizeBox(null);
  };

  const isEditOriginalMode = activeTool === 'editOriginal';

  return (
    <div className="flex flex-col items-center select-none" id={`page-wrapper-${pageIndex}`}>
      {/* Page Header Indicator */}
      <div className="w-full max-w-fit mb-2 flex items-center justify-between px-2 text-[11px] font-medium text-slate-400">
        <span>Page {pageIndex + 1}</span>
      </div>

      {/* Document Page Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative bg-white shadow-md rounded-xl transition-all overflow-hidden cursor-default border ${
          isActive ? 'ring-2 ring-[#0071e3]/40 border-black/15' : 'border-black/10'
        }`}
        style={{
          width: `${renderWidth}px`,
          height: `${renderHeight}px`,
        }}
      >
        {/* Rendered PDF Canvas */}
        <canvas ref={canvasRef} className="block pointer-events-none" />

        {/* UNVECTORIZE / ORIGINAL TEXT INTERACTIVE LAYER */}
        {isEditOriginalMode && (
          <div className="absolute inset-0 pointer-events-auto z-20">
            {extractedTextItems.map((item) => {
              const isEditing = editingOriginalId === item.id;
              const isHovered = hoveredTextId === item.id;
              const scale = zoom;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredTextId(item.id)}
                  onMouseLeave={() => setHoveredTextId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingOriginalId(item.id);
                  }}
                  className={`absolute rounded transition-all cursor-text ${
                    isHovered
                      ? 'bg-[#0071e3]/20 ring-1 ring-[#0071e3] shadow-xs'
                      : 'hover:bg-[#0071e3]/15'
                  }`}
                  style={{
                    left: `${item.x * scale}px`,
                    top: `${item.y * scale}px`,
                    width: `${Math.max(item.width * scale, 24)}px`,
                    height: `${Math.max(item.height * scale, 16)}px`,
                  }}
                  title={`Click to edit: "${item.str}"`}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      defaultValue={item.str}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          handleSaveOriginalTextEdit(item, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          setEditingOriginalId(null);
                        }
                      }}
                      onBlur={(e) => handleSaveOriginalTextEdit(item, e.currentTarget.value)}
                      className="absolute inset-0 bg-white text-slate-950 px-1 font-sans outline-none border border-[#0071e3] rounded shadow-sm z-30"
                      style={{
                        fontSize: `${item.fontSize * scale}px`,
                        lineHeight: `${item.height * scale}px`,
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* WATERMARK OVERLAY */}
        {watermark && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-10">
            <div
              style={{
                color: watermark.color,
                fontSize: `${watermark.fontSize * zoom}px`,
                opacity: watermark.opacity,
                transform: `rotate(${watermark.rotation}deg)`,
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              {watermark.text}
            </div>
          </div>
        )}

        {/* SVG LAYER FOR DRAWINGS, HIGHLIGHTS, SHAPES */}
        <svg
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
          style={{ width: `${renderWidth}px`, height: `${renderHeight}px` }}
        >
          {/* Render Active Freehand Drawing */}
          {currentDrawPoints.length > 1 && (
            <path
              d={currentDrawPoints.reduce(
                (acc, pt, idx) =>
                  idx === 0
                    ? `M ${pt.x * zoom} ${pt.y * zoom}`
                    : `${acc} L ${pt.x * zoom} ${pt.y * zoom}`,
                ''
              )}
              stroke={currentColor}
              strokeWidth={
                (activeTool === 'highlight'
                  ? Math.max(currentStrokeWidth, 14)
                  : currentStrokeWidth) * zoom
              }
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={activeTool === 'highlight' ? 0.35 : currentOpacity}
            />
          )}

          {/* Render Active Shape Preview */}
          {previewShape && (
            <>
              {activeTool === 'rectangle' && (
                <rect
                  x={previewShape.x * zoom}
                  y={previewShape.y * zoom}
                  width={previewShape.width * zoom}
                  height={previewShape.height * zoom}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth * zoom}
                  fill="none"
                  strokeDasharray="4 4"
                />
              )}
              {activeTool === 'circle' && (
                <ellipse
                  cx={(previewShape.x + previewShape.width / 2) * zoom}
                  cy={(previewShape.y + previewShape.height / 2) * zoom}
                  rx={(previewShape.width / 2) * zoom}
                  ry={(previewShape.height / 2) * zoom}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth * zoom}
                  fill="none"
                  strokeDasharray="4 4"
                />
              )}
              {activeTool === 'line' && (
                <line
                  x1={previewShape.x * zoom}
                  y1={previewShape.y * zoom}
                  x2={(previewShape.x + previewShape.width) * zoom}
                  y2={(previewShape.y + previewShape.height) * zoom}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth * zoom}
                  strokeDasharray="4 4"
                />
              )}
              {activeTool === 'arrow' && (
                <line
                  x1={previewShape.x * zoom}
                  y1={previewShape.y * zoom}
                  x2={(previewShape.x + previewShape.width) * zoom}
                  y2={(previewShape.y + previewShape.height) * zoom}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth * zoom}
                  markerEnd="url(#arrowhead-preview)"
                />
              )}
            </>
          )}

          {/* Existing Saved Vector Annotations */}
          {pageAnnotations.map((ann) => {
            if (ann.type === 'draw' || ann.type === 'highlight') {
              const dAnn = ann as DrawAnnotation;
              if (!dAnn.points || dAnn.points.length === 0) return null;
              return (
                <path
                  key={ann.id}
                  d={dAnn.points.reduce(
                    (acc, pt, idx) =>
                      idx === 0
                        ? `M ${pt.x * zoom} ${pt.y * zoom}`
                        : `${acc} L ${pt.x * zoom} ${pt.y * zoom}`,
                    ''
                  )}
                  stroke={dAnn.strokeColor}
                  strokeWidth={dAnn.strokeWidth * zoom}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={dAnn.opacity ?? 1}
                  className="cursor-pointer pointer-events-auto"
                  onClick={() => onSelectAnnotation(ann.id)}
                />
              );
            }

            if (ann.type === 'rectangle') {
              const s = ann as ShapeAnnotation;
              return (
                <rect
                  key={ann.id}
                  x={s.x * zoom}
                  y={s.y * zoom}
                  width={s.width * zoom}
                  height={s.height * zoom}
                  stroke={s.strokeColor}
                  strokeWidth={s.strokeWidth * zoom}
                  fill={s.fillColor || 'none'}
                  opacity={s.opacity ?? 1}
                  className="cursor-pointer pointer-events-auto"
                  onClick={() => onSelectAnnotation(ann.id)}
                />
              );
            }

            if (ann.type === 'circle') {
              const s = ann as ShapeAnnotation;
              return (
                <ellipse
                  key={ann.id}
                  cx={(s.x + s.width / 2) * zoom}
                  cy={(s.y + s.height / 2) * zoom}
                  rx={(s.width / 2) * zoom}
                  ry={(s.height / 2) * zoom}
                  stroke={s.strokeColor}
                  strokeWidth={s.strokeWidth * zoom}
                  fill={s.fillColor || 'none'}
                  opacity={s.opacity ?? 1}
                  className="cursor-pointer pointer-events-auto"
                  onClick={() => onSelectAnnotation(ann.id)}
                />
              );
            }

            if (ann.type === 'line') {
              const s = ann as ShapeAnnotation;
              return (
                <line
                  key={ann.id}
                  x1={s.x * zoom}
                  y1={s.y * zoom}
                  x2={(s.x + s.width) * zoom}
                  y2={(s.y + s.height) * zoom}
                  stroke={s.strokeColor}
                  strokeWidth={s.strokeWidth * zoom}
                  opacity={s.opacity ?? 1}
                  className="cursor-pointer pointer-events-auto"
                  onClick={() => onSelectAnnotation(ann.id)}
                />
              );
            }

            if (ann.type === 'arrow') {
              const s = ann as ShapeAnnotation;
              return (
                <g key={ann.id} className="cursor-pointer pointer-events-auto" onClick={() => onSelectAnnotation(ann.id)}>
                  <line
                    x1={s.x * zoom}
                    y1={s.y * zoom}
                    x2={(s.x + s.width) * zoom}
                    y2={(s.y + s.height) * zoom}
                    stroke={s.strokeColor}
                    strokeWidth={s.strokeWidth * zoom}
                    opacity={s.opacity ?? 1}
                  />
                  {/* Arrow Head */}
                  <polygon
                    points={`${(s.x + s.width) * zoom},${(s.y + s.height) * zoom} ${
                      (s.x + s.width - 10) * zoom
                    },${(s.y + s.height - 5) * zoom} ${(s.x + s.width - 10) * zoom},${
                      (s.y + s.height + 5) * zoom
                    }`}
                    fill={s.strokeColor}
                  />
                </g>
              );
            }

            return null;
          })}
        </svg>

        {/* DOM ANNOTATION ITEMS (TEXT, REDACT/WHITEOUT, SIGNATURE, STAMP, IMAGE) */}
        {pageAnnotations.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;

          // REDACTION / WHITEOUT BOX
          if (ann.type === 'redact') {
            const rAnn = ann as RedactAnnotation;
            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  setDraggingAnnotationId(ann.id);
                  const pt = getPdfPoint(e);
                  setDragOffset({ x: pt.x - rAnn.x, y: pt.y - rAnn.y });
                }}
                className={`annotation-item absolute cursor-move transition-all ${
                  isSelected ? 'ring-2 ring-[#0071e3] shadow-md z-30' : 'z-20'
                }`}
                style={{
                  left: `${rAnn.x * zoom}px`,
                  top: `${rAnn.y * zoom}px`,
                  width: `${rAnn.width * zoom}px`,
                  height: `${rAnn.height * zoom}px`,
                  backgroundColor: rAnn.color,
                }}
              >
                {isSelected && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizingHandle('se');
                      setDraggingAnnotationId(ann.id);
                      setDragStart(getPdfPoint(e));
                      setInitialResizeBox({
                        x: rAnn.x,
                        y: rAnn.y,
                        width: rAnn.width,
                        height: rAnn.height,
                      });
                    }}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#0071e3] border-2 border-white rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          }

          // TEXT BOX
          if (ann.type === 'text') {
            const tAnn = ann as TextAnnotation;
            const isEditing = editingTextId === ann.id;

            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  if (activeTool === 'select') {
                    setDraggingAnnotationId(ann.id);
                    const pt = getPdfPoint(e);
                    setDragOffset({ x: pt.x - tAnn.x, y: pt.y - tAnn.y });
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTextId(ann.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  setEditingTextId(ann.id);
                }}
                className={`annotation-item absolute cursor-text select-text transition-all ${
                  isSelected ? 'ring-2 ring-[#0071e3] rounded shadow-md z-30' : 'z-20'
                }`}
                style={{
                  left: `${tAnn.x * zoom}px`,
                  top: `${tAnn.y * zoom}px`,
                  width: `${tAnn.width * zoom}px`,
                  height: `${tAnn.height * zoom}px`,
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    defaultValue={tAnn.text}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const updated = e.target.value;
                      onUpdateAnnotations(
                        pageAnnotations.map((a) => (a.id === ann.id ? { ...a, text: updated } : a))
                      );
                      setEditingTextId(null);
                    }}
                    className="w-full h-full bg-white/95 text-slate-900 border border-[#0071e3] rounded outline-none p-1 resize-none shadow-xs"
                    style={{
                      fontSize: `${tAnn.fontSize * zoom}px`,
                      fontFamily: tAnn.fontFamily || 'Helvetica',
                      color: tAnn.color,
                      fontWeight: tAnn.bold ? 'bold' : 'normal',
                      fontStyle: tAnn.italic ? 'italic' : 'normal',
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full p-1 whitespace-pre-wrap select-text"
                    style={{
                      fontSize: `${tAnn.fontSize * zoom}px`,
                      fontFamily: tAnn.fontFamily || 'Helvetica',
                      color: tAnn.color,
                      opacity: tAnn.opacity ?? 1,
                      fontWeight: tAnn.bold ? 'bold' : 'normal',
                      fontStyle: tAnn.italic ? 'italic' : 'normal',
                      textAlign: tAnn.align || 'left',
                    }}
                  >
                    {tAnn.text}
                  </div>
                )}

                {/* Resize Handle */}
                {isSelected && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizingHandle('se');
                      setDraggingAnnotationId(ann.id);
                      setDragStart(getPdfPoint(e));
                      setInitialResizeBox({
                        x: tAnn.x,
                        y: tAnn.y,
                        width: tAnn.width,
                        height: tAnn.height,
                      });
                    }}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#0071e3] border-2 border-white rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          }

          // IMAGE / SIGNATURE / STAMP
          if (ann.type === 'image' || ann.type === 'signature' || ann.type === 'stamp') {
            const imgAnn = ann as ImageAnnotation;
            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  setDraggingAnnotationId(ann.id);
                  const pt = getPdfPoint(e);
                  setDragOffset({ x: pt.x - imgAnn.x, y: pt.y - imgAnn.y });
                }}
                className={`annotation-item absolute cursor-move transition-all ${
                  isSelected ? 'ring-2 ring-[#0071e3] shadow-md z-30' : 'z-20'
                }`}
                style={{
                  left: `${imgAnn.x * zoom}px`,
                  top: `${imgAnn.y * zoom}px`,
                  width: `${imgAnn.width * zoom}px`,
                  height: `${imgAnn.height * zoom}px`,
                }}
              >
                <img
                  src={imgAnn.dataUrl}
                  alt="Annotation"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  style={{ opacity: imgAnn.opacity ?? 1 }}
                />

                {isSelected && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizingHandle('se');
                      setDraggingAnnotationId(ann.id);
                      setDragStart(getPdfPoint(e));
                      setInitialResizeBox({
                        x: imgAnn.x,
                        y: imgAnn.y,
                        width: imgAnn.width,
                        height: imgAnn.height,
                      });
                    }}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#0071e3] border-2 border-white rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  docId,
  pdfBytes,
  pages,
  activePageIndex,
  zoom,
  activeTool,
  currentColor,
  currentStrokeWidth,
  currentFontSize,
  currentFontFamily,
  currentOpacity,
  annotations,
  watermark,
  selectedAnnotationId,
  onSelectPage,
  onSelectAnnotation,
  onUpdateAnnotations,
  onDeleteAnnotation,
}) => {
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load PDF proxy
  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;

    PdfRenderService.loadDocument(docId, pdfBytes)
      .then((proxy) => {
        if (!isCancelled) setPdfProxy(proxy);
      })
      .catch((err) => console.error('Error loading PDF in CanvasEditor:', err));

    return () => {
      isCancelled = true;
    };
  }, [docId, pdfBytes]);

  // Keyboard shortcut listener (Delete key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        selectedAnnotationId &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        onDeleteAnnotation(selectedAnnotationId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, onDeleteAnnotation]);

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-auto bg-[#e8e8ed] flex flex-col items-center py-8 space-y-8 select-none"
      id="canvas-scroll-container"
    >
      {pages.map((page, idx) => (
        <SinglePageView
          key={page.id}
          docId={docId}
          pdfBytes={pdfBytes}
          pdfProxy={pdfProxy}
          page={page}
          pageIndex={idx}
          isActive={idx === activePageIndex}
          zoom={zoom}
          activeTool={activeTool}
          currentColor={currentColor}
          currentStrokeWidth={currentStrokeWidth}
          currentFontSize={currentFontSize}
          currentFontFamily={currentFontFamily}
          currentOpacity={currentOpacity}
          pageAnnotations={annotations[idx] || []}
          watermark={watermark}
          selectedAnnotationId={selectedAnnotationId}
          onFocusPage={onSelectPage}
          onSelectAnnotation={onSelectAnnotation}
          onUpdateAnnotations={(newAnns) => onUpdateAnnotations(idx, newAnns)}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      ))}
    </div>
  );
};
