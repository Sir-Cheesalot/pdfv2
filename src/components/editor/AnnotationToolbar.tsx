import React, { useRef } from 'react';
import {
  MousePointer,
  Type,
  PenTool,
  Highlighter,
  Square,
  Circle,
  MoveUpRight,
  Minus,
  PenLine,
  Stamp as StampIcon,
  ShieldAlert,
  Image as ImageIcon,
  Sparkles,
  Replace,
} from 'lucide-react';
import type { ToolType } from '../../types/pdf';

interface AnnotationToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onOpenSignature: () => void;
  onOpenStamp: () => void;
  onOpenFindReplace: () => void;
  onInsertImage: (dataUrl: string) => void;
}

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  activeTool,
  onSelectTool,
  onOpenSignature,
  onOpenStamp,
  onOpenFindReplace,
  onInsertImage,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          onInsertImage(result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut?: string }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer className="w-4 h-4" />, shortcut: 'V' },
    { id: 'text', label: 'Add Text', icon: <Type className="w-4 h-4" />, shortcut: 'T' },
    { id: 'draw', label: 'Draw', icon: <PenTool className="w-4 h-4" />, shortcut: 'P' },
    { id: 'highlight', label: 'Highlighter', icon: <Highlighter className="w-4 h-4" />, shortcut: 'H' },
    { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-4 h-4" />, shortcut: 'R' },
    { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" />, shortcut: 'C' },
    { id: 'arrow', label: 'Arrow', icon: <MoveUpRight className="w-4 h-4" />, shortcut: 'A' },
    { id: 'line', label: 'Line', icon: <Minus className="w-4 h-4" />, shortcut: 'L' },
    { id: 'redact', label: 'Whiteout', icon: <ShieldAlert className="w-4 h-4" />, shortcut: 'X' },
  ];

  return (
    <div className="bg-white/90 backdrop-blur-2xl border border-black/10 rounded-2xl shadow-xl p-1.5 flex items-center space-x-1 select-none z-30">
      {/* Edit Original Words Toggle */}
      <button
        onClick={() => onSelectTool(activeTool === 'editOriginal' ? 'select' : 'editOriginal')}
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          activeTool === 'editOriginal'
            ? 'bg-[#0071e3] text-white shadow-sm'
            : 'bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/15'
        }`}
        title="Click and edit words directly in the PDF"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Edit Text</span>
      </button>

      <div className="w-[1px] h-4 bg-black/10 mx-1" />

      {/* Basic Tools */}
      {tools.map((t) => {
        const isActive = activeTool === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelectTool(t.id)}
            className={`flex items-center justify-center p-2 rounded-xl text-xs font-medium transition-all ${
              isActive
                ? 'bg-[#0071e3] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
            }`}
            title={`${t.label} ${t.shortcut ? `(${t.shortcut})` : ''}`}
          >
            {t.icon}
          </button>
        );
      })}

      <div className="w-[1px] h-4 bg-black/10 mx-1" />

      {/* Find & Replace */}
      <button
        onClick={onOpenFindReplace}
        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-xl transition-colors"
        title="Find & Replace"
      >
        <Replace className="w-4 h-4" />
      </button>

      {/* Signature */}
      <button
        onClick={onOpenSignature}
        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-black/5 hover:bg-black/10 text-slate-700 transition-all"
        title="Signature"
      >
        <PenLine className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sign</span>
      </button>

      {/* Stamp */}
      <button
        onClick={onOpenStamp}
        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-black/5 hover:bg-black/10 text-slate-700 transition-all"
        title="Stamp"
      >
        <StampIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Stamp</span>
      </button>

      {/* Insert Image */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
        onChange={handleImageFile}
      />
      <button
        onClick={() => imageInputRef.current?.click()}
        className="p-2 text-slate-600 hover:text-slate-900 hover:bg-black/5 rounded-xl transition-colors"
        title="Insert Image"
      >
        <ImageIcon className="w-4 h-4" />
      </button>
    </div>
  );
};
