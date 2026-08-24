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
} from 'lucide-react';
import type { Annotation, ToolType } from '../../types/pdf';

interface PropertyBarProps {
  selectedAnnotation: Annotation | null;
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
    <div className="bg-white/90 backdrop-blur-2xl border border-black/10 rounded-2xl shadow-xl px-3.5 py-1.5 flex items-center space-x-3 select-none z-20 text-xs text-slate-700">
      {/* Color Palette */}
      {!isRedact && (
        <div className="flex items-center space-x-1.5 border-r border-black/10 pr-3">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              className={`w-4 h-4 rounded-full border transition-all ${
                currentColor.toLowerCase() === color.toLowerCase()
                  ? 'border-slate-800 scale-110 shadow-xs ring-2 ring-[#0071e3]'
                  : 'border-black/15 hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-4 h-4 rounded-full cursor-pointer border-0 bg-transparent"
            title="Custom color"
          />
        </div>
      )}

      {/* Redact Color Switcher */}
      {isRedact && (
        <div className="flex items-center space-x-1 border-r border-black/10 pr-3">
          <button
            onClick={() => onColorChange('#000000')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${
              currentColor === '#000000' ? 'bg-black text-white' : 'text-slate-600 hover:bg-black/5'
            }`}
          >
            Blackout
          </button>
          <button
            onClick={() => onColorChange('#ffffff')}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border border-black/10 ${
              currentColor === '#ffffff' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-black/5'
            }`}
          >
            Whiteout
          </button>
        </div>
      )}

      {/* Text Properties */}
      {isTextTool && (
        <div className="flex items-center space-x-1.5 border-r border-black/10 pr-3">
          <select
            value={currentFontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value)}
            className="bg-black/5 text-slate-800 border border-black/10 rounded-lg px-2 py-0.5 text-xs outline-none"
          >
            <option value="Helvetica">Helvetica</option>
            <option value="TimesRoman">Times</option>
            <option value="Courier">Courier</option>
          </select>

          <select
            value={currentFontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="bg-black/5 text-slate-800 border border-black/10 rounded-lg px-2 py-0.5 text-xs outline-none w-14"
          >
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>

          <button
            onClick={onToggleBold}
            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg"
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleItalic}
            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg"
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onAlignChange('left')}
            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg"
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAlignChange('center')}
            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg"
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAlignChange('right')}
            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-lg"
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stroke Width Slider */}
      {isDrawOrShape && (
        <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
          <span className="text-[11px] text-slate-500">Size:</span>
          <input
            type="range"
            min="1"
            max="32"
            value={currentStrokeWidth}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
            className="w-16 accent-[#0071e3] cursor-pointer h-1"
          />
          <span className="text-[11px] font-mono text-slate-500 w-5">{currentStrokeWidth}px</span>
        </div>
      )}

      {/* Opacity Slider */}
      <div className="flex items-center space-x-2 border-r border-black/10 pr-3">
        <span className="text-[11px] text-slate-500">Opacity:</span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={currentOpacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="w-14 accent-[#0071e3] cursor-pointer h-1"
        />
        <span className="text-[11px] font-mono text-slate-500 w-7">{Math.round(currentOpacity * 100)}%</span>
      </div>

      {/* Selected Element Actions */}
      {selectedAnnotation && (
        <div className="flex items-center space-x-0.5">
          <button
            onClick={onDuplicateSelected}
            className="p-1 text-slate-600 hover:text-[#34c759] hover:bg-black/5 rounded-lg"
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onBringToFront}
            className="p-1 text-slate-600 hover:text-[#0071e3] hover:bg-black/5 rounded-lg"
            title="Bring to Front"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSendToBack}
            className="p-1 text-slate-600 hover:text-[#0071e3] hover:bg-black/5 rounded-lg"
            title="Send to Back"
          >
            <Layers className="w-3.5 h-3.5 rotate-180" />
          </button>
          <button
            onClick={onDeleteSelected}
            className="p-1 text-slate-600 hover:text-[#ff3b30] hover:bg-black/5 rounded-lg"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
