import React, { useState } from 'react';
import { X, Droplets, Check, Trash2 } from 'lucide-react';
import type { WatermarkConfig } from '../../types/pdf';

interface WatermarkModalProps {
  isOpen: boolean;
  watermark: WatermarkConfig | null;
  onClose: () => void;
  onSaveWatermark: (watermark: WatermarkConfig | null) => void;
}

export const WatermarkModal: React.FC<WatermarkModalProps> = ({
  isOpen,
  watermark,
  onClose,
  onSaveWatermark,
}) => {
  const [text, setText] = useState(watermark?.text || 'CONFIDENTIAL');
  const [color, setColor] = useState(watermark?.color || '#ff3b30');
  const [fontSize, setFontSize] = useState(watermark?.fontSize || 54);
  const [opacity, setOpacity] = useState(watermark?.opacity || 0.15);
  const [rotation, setRotation] = useState(watermark?.rotation || 45);
  const [applyToAllPages, setApplyToAllPages] = useState(watermark?.applyToAllPages ?? true);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!text.trim()) {
      onSaveWatermark(null);
      onClose();
      return;
    }

    onSaveWatermark({
      text: text.trim(),
      color,
      fontSize,
      opacity,
      rotation,
      applyToAllPages,
    });
    onClose();
  };

  const handleRemove = () => {
    onSaveWatermark(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#0071e3]/10 text-[#0071e3] rounded-lg">
              <Droplets className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Document Watermark</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          {/* Watermark Text */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Watermark Text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. CONFIDENTIAL, DRAFT, SAMPLE"
              className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
            />
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            {['CONFIDENTIAL', 'DRAFT', 'DO NOT COPY', 'SAMPLE', 'REVIEW ONLY'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setText(preset)}
                className="px-2 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 text-[11px] font-medium rounded-md transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Color & Size */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Color</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="text-xs font-mono text-slate-500">{color}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Font Size: {fontSize}px
              </label>
              <input
                type="range"
                min="24"
                max="96"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-[#0071e3]"
              />
            </div>
          </div>

          {/* Opacity & Rotation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Opacity: {Math.round(opacity * 100)}%
              </label>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-[#0071e3]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                Angle: {rotation}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full accent-[#0071e3]"
              />
            </div>
          </div>

          {/* Apply to all pages */}
          <div className="pt-1">
            <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-600">
              <input
                type="checkbox"
                checked={applyToAllPages}
                onChange={(e) => setApplyToAllPages(e.target.checked)}
                className="rounded text-[#0071e3] focus:ring-0"
              />
              <span>Apply to all pages in document</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/5 bg-slate-50 flex items-center justify-between">
          {watermark ? (
            <button
              onClick={handleRemove}
              className="flex items-center space-x-1 text-xs text-[#ff3b30] hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
