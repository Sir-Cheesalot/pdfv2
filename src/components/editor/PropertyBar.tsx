import React from 'react';
import {
  Trash2,
  Copy,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers,
  FileText,
  Shapes,
  Image as ImageIcon,
  Cpu,
} from 'lucide-react';
import type { Annotation, ToolType, PdfContentObject } from '../../types/pdf';

interface PropertyBarProps {
  selectedAnnotation: Annotation | null;
  selectedContentObject?: PdfContentObject | null;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  currentFontSize: number;
  currentFontFamily: string;
  currentOpacity: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (font: string) => void;
  onOpacityChange: (opacity: number) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onAlignChange: (align: 'left' | 'center' | 'right') => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

const COLOR_PRESETS = [
  '#0071e3', // Blue
  '#34c759', // Green
  '#ff9500', // Orange
  '#ff3b30', // Red
  '#af52de', // Purple
  '#000000', // Black
  '#ffffff', // White
];

export const PropertyBar: React.FC<PropertyBarProps> = ({
  selectedAnnotation,
  selectedContentObject,
  activeTool,
  currentColor,
  currentStrokeWidth,
  currentFontSize,
  currentFontFamily,
  currentOpacity,
  onColorChange,
  onStrokeWidthChange,
  onFontSizeChange,
  onFontFamilyChange,
  onOpacityChange,
  onToggleBold,
  onToggleItalic,
  onAlignChange,
  onDeleteSelected,
  onDuplicateSelected,
  onBringToFront,
  onSendToBack,
}) => {
  const isTextTool = activeTool === 'text' || selectedAnnotation?.type === 'text';
  const isDrawOrShape =
    ['draw', 'highlight', 'rectangle', 'circle', 'line', 'arrow'].includes(activeTool) ||
    (selectedAnnotation && ['draw', 'highlight', 'rectangle', 'circle', 'line', 'arrow'].includes(selectedAnnotation.type));
  const isRedact = activeTool === 'redact' || selectedAnnotation?.type === 'redact';

  return (
    <div className="bg-white/95 backdrop-blur-2xl border border-black/10 rounded-2xl shadow-xl px-4 py-2 flex flex-wrap items-center gap-3 select-none z-20 text-xs text-slate-700">
      {/* UNDERLYING PDF CONTENT OBJECT IDENTIFIER BADGE */}
      {selectedContentObject && (
        <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
          {selectedContentObject.type === 'NativeText' && (
            <div className="flex items-center space-x-1.5 bg-blue-50 text-[#0071e3] border border-blue-200/80 px-2.5 py-1 rounded-lg">
              <FileText className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px]">Native PDF Text</span>
              <span className="text-[10px] text-blue-600/70 font-mono">
                {selectedContentObject.fontName || 'Helvetica'} ({selectedContentObject.fontSize || 12}pt)
              </span>
            </div>
          )}

          {selectedContentObject.type === 'VectorPath' && (
            <div className="flex items-center space-x-1.5 bg-amber-50 text-amber-700 border border-amber-200/80 px-2.5 py-1 rounded-lg">
              <Cpu className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px]">Vector / Outlined Text</span>
            </div>
          )}

          {selectedContentObject.type === 'Image' && (
            <div className="flex items-center space-x-1.5 bg-purple-50 text-purple-700 border border-purple-200/80 px-2.5 py-1 rounded-lg">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px]">Raster / Image Text (Pixel Data)</span>
            </div>
          )}

          {selectedContentObject.type === 'Shape' && (
            <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
              <Shapes className="w-3.5 h-3.5" />
              <span className="font-semibold text-[11px]">Vector Graphic</span>
            </div>
          )}
        </div>
      )}

      {/* Color Palette */}
      {!isRedact && (
        <div className="flex items-center space-x-1.5 border-r border-black/10 pr-3">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              className={`w-4 h-4 rounded-full transition-transform border border-black/15 ${
                currentColor.toLowerCase() === color.toLowerCase()
                  ? 'scale-125 ring-2 ring-[#0071e3] ring-offset-1'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-4 h-4 rounded-full border border-black/15 cursor-pointer p-0 bg-transparent"
            title="Custom color"
          />
        </div>
      )}

      {/* Text Options (Font, Size, Style, Alignment) */}
      {(isTextTool || selectedContentObject?.type === 'NativeText') && (
        <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
          {/* Font Family Selector */}
          <select
            value={currentFontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value)}
            className="bg-[#f5f5f7] border border-black/10 rounded-lg px-2 py-0.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-[#0071e3] font-medium"
          >
            <option value="Helvetica">Helvetica (Sans)</option>
            <option value="TimesRoman">Times (Serif)</option>
            <option value="Courier">Courier (Mono)</option>
          </select>

          {/* Font Size Selector */}
          <div className="flex items-center space-x-1">
            <input
              type="number"
              min="8"
              max="72"
              value={currentFontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-12 bg-[#f5f5f7] border border-black/10 rounded-lg px-1.5 py-0.5 text-xs text-slate-800 text-center outline-none focus:ring-1 focus:ring-[#0071e3] font-medium"
            />
            <span className="text-[10px] text-slate-400">pt</span>
          </div>

          {/* Bold / Italic */}
          <div className="flex items-center space-x-0.5 bg-[#f5f5f7] p-0.5 rounded-lg border border-black/5">
            <button
              onClick={onToggleBold}
              className="p-1 rounded hover:bg-black/5 text-slate-700 active:scale-95"
              title="Bold"
            >
              <Bold className="w-3 h-3" />
            </button>
            <button
              onClick={onToggleItalic}
              className="p-1 rounded hover:bg-black/5 text-slate-700 active:scale-95"
              title="Italic"
            >
              <Italic className="w-3 h-3" />
            </button>
          </div>

          {/* Alignment */}
          <div className="flex items-center space-x-0.5 bg-[#f5f5f7] p-0.5 rounded-lg border border-black/5">
            <button
              onClick={() => onAlignChange('left')}
              className="p-1 rounded hover:bg-black/5 text-slate-700 active:scale-95"
              title="Align Left"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => onAlignChange('center')}
              className="p-1 rounded hover:bg-black/5 text-slate-700 active:scale-95"
              title="Align Center"
            >
              <AlignCenter className="w-3 h-3" />
            </button>
            <button
              onClick={() => onAlignChange('right')}
              className="p-1 rounded hover:bg-black/5 text-slate-700 active:scale-95"
              title="Align Right"
            >
              <AlignRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Stroke Width Slider for Drawing/Shapes */}
      {isDrawOrShape && (
        <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
          <span className="text-[11px] text-slate-500 font-medium">Thickness:</span>
          <input
            type="range"
            min="1"
            max="20"
            value={currentStrokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0071e3]"
          />
          <span className="text-[11px] font-mono text-slate-600 w-4">
            {currentStrokeWidth}
          </span>
        </div>
      )}

      {/* Opacity Slider */}
      <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
        <span className="text-[11px] text-slate-500 font-medium">Opacity:</span>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={currentOpacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="w-14 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0071e3]"
        />
        <span className="text-[11px] font-mono text-slate-600 w-7">
          {Math.round(currentOpacity * 100)}%
        </span>
      </div>

      {/* Selection Operations (Delete, Duplicate, Layering) */}
      {selectedAnnotation && (
        <div className="flex items-center space-x-1">
          <button
            onClick={onDuplicateSelected}
            className="p-1.5 rounded-lg hover:bg-black/5 text-slate-700 active:scale-95"
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onBringToFront}
            className="p-1.5 rounded-lg hover:bg-black/5 text-slate-700 active:scale-95"
            title="Bring to Front"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDeleteSelected}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 active:scale-95"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
