import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
  PageInfo,
  Annotation,
  ToolType,
  Point,
  TextAnnotation,
  DrawAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  RedactAnnotation,
  WatermarkConfig,
  RebuiltPage,
  ExtractedTextItem,
  PdfContentObject,
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
  selectedContentObject?: PdfContentObject | null;
  rebuiltPages?: RebuiltPage[];
  onUpdateRebuiltText?: (pageIndex: number, elemId: string, newText: string) => void;
  onUpdatePageTextInStream?: (
    pageIndex: number,
    oldText: string,
    newText: string,
    coords?: { x: number; y: number; fontSize: number; fontName?: string }
  ) => void;
  onSelectPage: (index: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  onSelectContentObject?: (obj: PdfContentObject | null) => void;
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
  onSelectContentObject?: (obj: PdfContentObject | null) => void;
  onUpdatePageTextInStream?: (
    pageIndex: number,
    oldText: string,
    newText: string,
    coords?: { x: number; y: number; fontSize: number; fontName?: string }
  ) => void;
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
  onSelectContentObject,
  onUpdatePageTextInStream,
  onUpdateAnnotations,
  onDeleteAnnotation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [extractedTextItems, setExtractedTextItems] = useState<ExtractedTextItem[]>([]);
  const [editingTextItemId, setEditingTextItemId] = useState<string | null>(null);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);

  // Interaction states for drawing & annotating
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

  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const renderWidth = Math.round(page.width * zoom);
  const renderHeight = Math.round(page.height * zoom);

  // Render page to canvas immediately (never blank)
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

  // Extract page text items for live in-place direct editing
  useEffect(() => {
    if (!pdfProxy || page.isBlank || page.customBytes) return;
    let isCancelled = false;

    PdfRenderService.extractPageTextItems(pdfProxy, page.originalPageIndex + 1)
      .then((items) => {
        if (!isCancelled) {
          setExtractedTextItems(items);
        }
      })
      .catch((err) => console.warn('Text items note for page', pageIndex, err));

    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, page, pageIndex]);

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

  // In-place text save handler — modifies underlying PDF stream directly
  const handleSaveTextItemEdit = (item: ExtractedTextItem, newText: string) => {
    if (!newText || newText === item.str) {
      setEditingTextItemId(null);
      return;
    }

    const oldStr = item.str;
    item.str = newText;
    setExtractedTextItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, str: newText } : it))
    );

    // Call true underlying PDF stream editor (zero coverups)
    onUpdatePageTextInStream?.(pageIndex, oldStr, newText, {
      x: item.x,
      y: item.y,
      fontSize: item.fontSize,
      fontName: item.fontName,
    });

    setEditingTextItemId(null);
  };

  // Pointer events for drawing & annotating
  const handlePointerDown = (e: React.PointerEvent) => {
    onFocusPage(pageIndex);
    const target = e.target as HTMLElement;

    if (
      target.closest('.annotation-item') ||
      target.closest('.text-item-block') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('button')
    ) {
      return;
    }

    const pt = getPdfPoint(e);
    setIsInteracting(true);
    setDragStart(pt);

    if (activeTool === 'draw' || activeTool === 'highlight') {
      setCurrentDrawPoints([pt]);
    } else if (
      activeTool === 'rectangle' ||
      activeTool === 'circle' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'redact'
    ) {
      setPreviewShape({ x: pt.x, y: pt.y, width: 0, height: 0 });
    } else if (activeTool === 'text') {
      const newAnn: TextAnnotation = {
        id: `text-${Date.now()}`,
        pageIndex,
        type: 'text',
        x: pt.x,
        y: pt.y,
        width: 140,
        height: 32,
        text: 'Type text here...',
        fontSize: currentFontSize,
        fontFamily: currentFontFamily as any,
        color: currentColor,
        opacity: currentOpacity,
      };
      onUpdateAnnotations([...pageAnnotations, newAnn]);
      onSelectAnnotation(newAnn.id);
      setEditingTextId(newAnn.id);
      setIsInteracting(false);
    } else if (activeTool === 'select') {
      onSelectAnnotation(null);
      onSelectContentObject?.(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isInteracting && !draggingAnnotationId) return;
    const pt = getPdfPoint(e);

    if (draggingAnnotationId) {
      const newX = Math.max(0, pt.x - dragOffset.x);
      const newY = Math.max(0, pt.y - dragOffset.y);
      const updated = pageAnnotations.map((a) =>
        a.id === draggingAnnotationId ? ({ ...a, x: newX, y: newY } as Annotation) : a
      );
      onUpdateAnnotations(updated);
      return;
    }

    if (activeTool === 'draw' || activeTool === 'highlight') {
      setCurrentDrawPoints((prev) => [...prev, pt]);
    } else if (
      (activeTool === 'rectangle' ||
        activeTool === 'circle' ||
        activeTool === 'line' ||
        activeTool === 'arrow' ||
        activeTool === 'redact') &&
      dragStart
    ) {
      const minX = Math.min(dragStart.x, pt.x);
      const minY = Math.min(dragStart.y, pt.y);
      const width = Math.abs(pt.x - dragStart.x);
      const height = Math.abs(pt.y - dragStart.y);
      setPreviewShape({ x: minX, y: minY, width, height });
    }
  };

  const handlePointerUp = () => {
    if (draggingAnnotationId) {
      setDraggingAnnotationId(null);
      setDragStart(null);
    }

    if (!isInteracting) return;
    setIsInteracting(false);

    if ((activeTool === 'draw' || activeTool === 'highlight') && currentDrawPoints.length > 1) {
      const xs = currentDrawPoints.map((p) => p.x);
      const ys = currentDrawPoints.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      const newAnn: DrawAnnotation = {
        id: `draw-${Date.now()}`,
        pageIndex,
        type: activeTool === 'highlight' ? 'highlight' : 'draw',
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 10),
        height: Math.max(maxY - minY, 10),
        points: currentDrawPoints,
        strokeColor: currentColor,
        strokeWidth: activeTool === 'highlight' ? currentStrokeWidth * 3 : currentStrokeWidth,
        isHighlighter: activeTool === 'highlight',
        opacity: activeTool === 'highlight' ? 0.35 : currentOpacity,
      };
      onUpdateAnnotations([...pageAnnotations, newAnn]);
      setCurrentDrawPoints([]);
    } else if (
      (activeTool === 'rectangle' ||
        activeTool === 'circle' ||
        activeTool === 'line' ||
        activeTool === 'arrow') &&
      previewShape &&
      (previewShape.width > 3 || previewShape.height > 3)
    ) {
      const newAnn: ShapeAnnotation = {
        id: `shape-${Date.now()}`,
        pageIndex,
        type: activeTool as any,
        x: previewShape.x,
        y: previewShape.y,
        width: previewShape.width,
        height: previewShape.height,
        strokeColor: currentColor,
        strokeWidth: currentStrokeWidth,
        opacity: currentOpacity,
      };
      onUpdateAnnotations([...pageAnnotations, newAnn]);
      setPreviewShape(null);
    } else if (
      activeTool === 'redact' &&
      previewShape &&
      (previewShape.width > 3 || previewShape.height > 3)
    ) {
      const newAnn: RedactAnnotation = {
        id: `redact-${Date.now()}`,
        pageIndex,
        type: 'redact',
        x: previewShape.x,
        y: previewShape.y,
        width: previewShape.width,
        height: previewShape.height,
        color: '#000000',
        overlayText: 'REDACTED',
      };
      onUpdateAnnotations([...pageAnnotations, newAnn]);
      setPreviewShape(null);
    }

    setDragStart(null);
  };

  return (
    <div
      className={`relative flex flex-col items-center group transition-transform ${
        isActive ? 'ring-2 ring-[#0071e3]/40 rounded-xl' : ''
      }`}
      id={`page-wrapper-${pageIndex}`}
      onClick={() => onFocusPage(pageIndex)}
    >
      {/* Page Header badge */}
      <div className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-medium text-slate-500">
        <span>Page {pageIndex + 1}</span>
        <span className="text-[10px] text-slate-400">
          {Math.round(page.width)} × {Math.round(page.height)} pt
        </span>
      </div>

      {/* Main Page Viewport Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative bg-white shadow-xl rounded-lg overflow-hidden border border-black/10 select-none"
        style={{
          width: `${renderWidth}px`,
          height: `${renderHeight}px`,
          cursor:
            activeTool === 'select'
              ? 'default'
              : activeTool === 'text'
              ? 'text'
              : activeTool === 'draw' || activeTool === 'highlight'
              ? 'crosshair'
              : activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'line' || activeTool === 'arrow'
              ? 'crosshair'
              : 'default',
        }}
      >
        {/* BASE CANVAS LAYER (Renders PDF pages crisp & immediately) */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none block z-0"
          style={{ width: `${renderWidth}px`, height: `${renderHeight}px` }}
        />

        {/* SVG VECTOR ANNOTATION & DRAWING LAYER */}
        <svg
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
          viewBox={`0 0 ${page.width} ${page.height}`}
        >
          <defs>
            <marker
              id={`arrow-head-${pageIndex}`}
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={currentColor} />
            </marker>
          </defs>

          {/* Render Vector Drawings & Shapes */}
          {pageAnnotations.map((ann) => {
            if (ann.type === 'draw' || ann.type === 'highlight') {
              const dAnn = ann as DrawAnnotation;
              if (!dAnn.points || dAnn.points.length < 2) return null;
              const pathData = dAnn.points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                .join(' ');

              return (
                <path
                  key={ann.id}
                  d={pathData}
                  fill="none"
                  stroke={dAnn.strokeColor}
                  strokeWidth={dAnn.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={dAnn.opacity ?? 1}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                />
              );
            }

            if (ann.type === 'rectangle') {
              const sAnn = ann as ShapeAnnotation;
              return (
                <rect
                  key={ann.id}
                  x={sAnn.x}
                  y={sAnn.y}
                  width={sAnn.width}
                  height={sAnn.height}
                  fill={sAnn.fillColor || 'none'}
                  stroke={sAnn.strokeColor}
                  strokeWidth={sAnn.strokeWidth}
                  opacity={sAnn.opacity ?? 1}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                />
              );
            }

            if (ann.type === 'circle') {
              const sAnn = ann as ShapeAnnotation;
              const cx = sAnn.x + sAnn.width / 2;
              const cy = sAnn.y + sAnn.height / 2;
              return (
                <ellipse
                  key={ann.id}
                  cx={cx}
                  cy={cy}
                  rx={sAnn.width / 2}
                  ry={sAnn.height / 2}
                  fill={sAnn.fillColor || 'none'}
                  stroke={sAnn.strokeColor}
                  strokeWidth={sAnn.strokeWidth}
                  opacity={sAnn.opacity ?? 1}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                />
              );
            }

            if (ann.type === 'line') {
              const sAnn = ann as ShapeAnnotation;
              return (
                <line
                  key={ann.id}
                  x1={sAnn.x}
                  y1={sAnn.y}
                  x2={sAnn.x + sAnn.width}
                  y2={sAnn.y + sAnn.height}
                  stroke={sAnn.strokeColor}
                  strokeWidth={sAnn.strokeWidth}
                  opacity={sAnn.opacity ?? 1}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                />
              );
            }

            if (ann.type === 'arrow') {
              const sAnn = ann as ShapeAnnotation;
              return (
                <line
                  key={ann.id}
                  x1={sAnn.x}
                  y1={sAnn.y}
                  x2={sAnn.x + sAnn.width}
                  y2={sAnn.y + sAnn.height}
                  stroke={sAnn.strokeColor}
                  strokeWidth={sAnn.strokeWidth}
                  opacity={sAnn.opacity ?? 1}
                  markerEnd={`url(#arrow-head-${pageIndex})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                />
              );
            }

            if (ann.type === 'redact') {
              const rAnn = ann as RedactAnnotation;
              return (
                <g key={ann.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelectAnnotation(ann.id); }}>
                  <rect
                    x={rAnn.x}
                    y={rAnn.y}
                    width={rAnn.width}
                    height={rAnn.height}
                    fill={rAnn.color || '#000000'}
                  />
                  <text
                    x={rAnn.x + rAnn.width / 2}
                    y={rAnn.y + rAnn.height / 2 + 3}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {rAnn.overlayText || 'REDACTED'}
                  </text>
                </g>
              );
            }

            return null;
          })}

          {/* LIVE DRAWING PREVIEW (While drawing with mouse/pen) */}
          {(activeTool === 'draw' || activeTool === 'highlight') && currentDrawPoints.length > 1 && (
            <path
              d={currentDrawPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke={currentColor}
              strokeWidth={activeTool === 'highlight' ? currentStrokeWidth * 3 : currentStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeTool === 'highlight' ? 0.4 : currentOpacity}
            />
          )}

          {/* LIVE SHAPE PREVIEW (While dragging rectangle/circle/line/arrow/redact) */}
          {previewShape && (
            <>
              {activeTool === 'rectangle' && (
                <rect
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="none"
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth}
                  strokeDasharray="4 2"
                  opacity={currentOpacity}
                />
              )}
              {activeTool === 'circle' && (
                <ellipse
                  cx={previewShape.x + previewShape.width / 2}
                  cy={previewShape.y + previewShape.height / 2}
                  rx={previewShape.width / 2}
                  ry={previewShape.height / 2}
                  fill="none"
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth}
                  strokeDasharray="4 2"
                  opacity={currentOpacity}
                />
              )}
              {activeTool === 'line' && (
                <line
                  x1={previewShape.x}
                  y1={previewShape.y}
                  x2={previewShape.x + previewShape.width}
                  y2={previewShape.y + previewShape.height}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth}
                  strokeDasharray="4 2"
                  opacity={currentOpacity}
                />
              )}
              {activeTool === 'arrow' && (
                <line
                  x1={previewShape.x}
                  y1={previewShape.y}
                  x2={previewShape.x + previewShape.width}
                  y2={previewShape.y + previewShape.height}
                  stroke={currentColor}
                  strokeWidth={currentStrokeWidth}
                  markerEnd={`url(#arrow-head-${pageIndex})`}
                  opacity={currentOpacity}
                />
              )}
              {activeTool === 'redact' && (
                <rect
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="#000000"
                  opacity={0.6}
                />
              )}
            </>
          )}
        </svg>

        {/* INTERACTIVE TEXT OVERLAY (Click any text on the page to edit directly) */}
        {extractedTextItems.map((item) => {
          const isEditing = editingTextItemId === item.id;
          const isHovered = hoveredTextId === item.id;
          const fontSizePx = Math.max(item.fontSize * zoom, 9);

          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredTextId(item.id)}
              onMouseLeave={() => setHoveredTextId(null)}
              onClick={(e) => {
                e.stopPropagation();
                setEditingTextItemId(item.id);
                onSelectContentObject?.({
                  id: `native-text-${pageIndex}-${item.id}`,
                  type: 'NativeText',
                  pageIndex,
                  x: item.x,
                  y: item.y,
                  width: item.width,
                  height: item.height,
                  text: item.str,
                  originalText: item.str,
                  fontName: item.fontName,
                  fontSize: item.fontSize,
                  color: '#000000',
                });
              }}
              className={`text-item-block absolute cursor-text select-text transition-all ${
                isEditing
                  ? 'ring-2 ring-[#0071e3] bg-white z-30 shadow-md rounded'
                  : isHovered
                  ? 'ring-1 ring-[#0071e3]/40 bg-[#0071e3]/10 rounded z-10'
                  : 'z-5 hover:bg-[#0071e3]/5'
              }`}
              style={{
                left: `${item.x * zoom}px`,
                top: `${item.y * zoom}px`,
                minWidth: `${Math.max(item.width * zoom, 24)}px`,
                minHeight: `${Math.max(item.height * zoom, 16)}px`,
              }}
              title="Click to edit native PDF text directly"
            >
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  defaultValue={item.str}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => handleSaveTextItemEdit(item, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveTextItemEdit(item, (e.target as HTMLInputElement).value);
                    }
                  }}
                  className="w-full h-full bg-white text-slate-900 border-0 outline-none px-1 py-0.5 rounded text-xs shadow-xs"
                  style={{
                    fontSize: `${fontSizePx}px`,
                    fontFamily: item.fontName || 'Helvetica',
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {/* WATERMARK LAYER */}
        {watermark && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-15">
            <span
              style={{
                fontSize: `${watermark.fontSize * zoom}px`,
                color: watermark.color,
                opacity: watermark.opacity,
                transform: `rotate(${watermark.rotation}deg)`,
                fontFamily: (watermark as any).fontFamily || 'Helvetica',
                fontWeight: 'bold',
              }}
            >
              {watermark.text}
            </span>
          </div>
        )}

        {/* USER ANNOTATIONS LAYER (DOM Layer for Text, Images, Signatures, Stamps) */}
        {pageAnnotations.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;

          if (ann.type === 'text') {
            const tAnn = ann as TextAnnotation;
            const isEditing = editingTextId === ann.id;

            return (
              <div
                key={ann.id}
                onPointerDown={(e) => {
                  if (activeTool === 'select') {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    setDraggingAnnotationId(ann.id);
                    const pt = getPdfPoint(e);
                    setDragOffset({ x: pt.x - tAnn.x, y: pt.y - tAnn.y });
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation(ann.id);
                  setEditingTextId(ann.id);
                }}
                className={`annotation-item absolute cursor-text select-text transition-all ${
                  isSelected ? 'ring-2 ring-[#0071e3] rounded shadow-md z-40' : 'z-20'
                }`}
                style={{
                  left: `${tAnn.x * zoom}px`,
                  top: `${tAnn.y * zoom}px`,
                  width: `${tAnn.width * zoom}px`,
                  height: `${tAnn.height * zoom}px`,
                  backgroundColor: tAnn.backgroundColor || 'transparent',
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
                    className="w-full h-full bg-white text-slate-900 border border-[#0071e3] rounded outline-none p-1 resize-none shadow-xs"
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
                    className="w-full h-full p-0.5 whitespace-pre-wrap select-text"
                    style={{
                      fontSize: `${tAnn.fontSize * zoom}px`,
                      fontFamily: tAnn.fontFamily || 'Helvetica',
                      color: tAnn.color,
                      opacity: tAnn.opacity ?? 1,
                      fontWeight: tAnn.bold ? 'bold' : 'normal',
                      fontStyle: tAnn.italic ? 'italic' : 'normal',
                    }}
                  >
                    {tAnn.text}
                  </div>
                )}
              </div>
            );
          }

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
                  isSelected ? 'ring-2 ring-[#0071e3] shadow-md z-40' : 'z-20'
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
  selectedContentObject,
  onSelectPage,
  onSelectAnnotation,
  onSelectContentObject,
  onUpdatePageTextInStream,
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
          onSelectContentObject={onSelectContentObject}
          onUpdatePageTextInStream={onUpdatePageTextInStream}
          onUpdateAnnotations={(newAnns) => onUpdateAnnotations(idx, newAnns)}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      ))}
    </div>
  );
};
