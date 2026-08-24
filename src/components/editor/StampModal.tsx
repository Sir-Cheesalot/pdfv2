import React, { useState } from 'react';
import { X, Stamp as StampIcon, Check, Plus } from 'lucide-react';

interface StampModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStamp: (dataUrl: string) => void;
}

interface StampPreset {
  id: string;
  label: string;
  color: string;
  borderColor: string;
  textColor: string;
}

const PRESET_STAMPS: StampPreset[] = [
  { id: 'approved', label: 'APPROVED', color: '#ecfdf5', borderColor: '#10b981', textColor: '#047857' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#fef2f2', borderColor: '#ef4444', textColor: '#b91c1c' },
  { id: 'draft', label: 'DRAFT', color: '#fefce8', borderColor: '#eab308', textColor: '#a16207' },
  { id: 'void', label: 'VOID', color: '#fdf2f8', borderColor: '#ec4899', textColor: '#be185d' },
  { id: 'final', label: 'FINAL', color: '#eff6ff', borderColor: '#3b82f6', textColor: '#1d4ed8' },
  { id: 'rejected', label: 'REJECTED', color: '#fef2f2', borderColor: '#ef4444', textColor: '#991b1b' },
];

export const StampModal: React.FC<StampModalProps> = ({
  isOpen,
  onClose,
  onSelectStamp,
}) => {
  const [customText, setCustomText] = useState('VERIFIED');
  const [customColor, setCustomColor] = useState('#0071e3');

  if (!isOpen) return null;

  const createStampDataUrl = (text: string, color: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, 300, 100);

    // Rounded rectangle border
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    const r = 12;
    ctx.beginPath();
    ctx.roundRect(8, 8, 284, 84, r);
    ctx.stroke();

    // Inner dashed border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.roundRect(14, 14, 272, 72, r - 2);
    ctx.stroke();

    // Stamp text
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 150, 50);

    return canvas.toDataURL('image/png');
  };

  const handleSelectPreset = (preset: StampPreset) => {
    const dataUrl = createStampDataUrl(preset.label, preset.borderColor);
    onSelectStamp(dataUrl);
    onClose();
  };

  const handleApplyCustom = () => {
    if (!customText.trim()) return;
    const dataUrl = createStampDataUrl(customText.trim(), customColor);
    onSelectStamp(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#ff9500]/10 text-[#ff9500] rounded-lg">
              <StampIcon className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Insert Stamp</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-2">Preset Stamps</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {PRESET_STAMPS.map((stamp) => (
                <div
                  key={stamp.id}
                  onClick={() => handleSelectPreset(stamp)}
                  className="border-2 rounded-xl p-3 text-center cursor-pointer transition-all hover:scale-102 shadow-xs"
                  style={{
                    backgroundColor: stamp.color,
                    borderColor: stamp.borderColor,
                    color: stamp.textColor,
                  }}
                >
                  <span className="font-black text-xs tracking-wider block">{stamp.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Stamp */}
          <div className="pt-2 border-t border-black/5 space-y-2.5">
            <label className="text-xs font-medium text-slate-600 block">Custom Stamp</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Custom stamp text..."
                className="flex-1 bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
              />
              <button
                onClick={handleApplyCustom}
                disabled={!customText.trim()}
                className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-3.5 py-1.5 rounded-xl shadow-xs disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/5 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
