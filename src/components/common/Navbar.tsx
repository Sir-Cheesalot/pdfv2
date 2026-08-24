import React from 'react';
import {
  FileText,
  Edit3,
  Layers,
  FilePlus,
  Scissors,
  Download,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Info,
  Droplets,
  Printer,
  UploadCloud,
  FileCode,
} from 'lucide-react';
import type { EditorMode } from '../../types/pdf';

interface NavbarProps {
  fileName: string;
  mode: EditorMode;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  isProcessing: boolean;
  hasDocument: boolean;
  pageCount: number;
  activePageIndex: number;
  onSelectMode: (mode: EditorMode) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onOpenWatermark: () => void;
  onOpenMetadata: () => void;
  onLoadSample: () => void;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  fileName,
  mode,
  zoom,
  canUndo,
  canRedo,
  isProcessing,
  hasDocument,
  pageCount,
  activePageIndex,
  onSelectMode,
  onZoomChange,
  onUndo,
  onRedo,
  onExport,
  onOpenWatermark,
  onOpenMetadata,
  onLoadSample,
  onUploadFile,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="h-13 bg-white/80 backdrop-blur-xl border-b border-black/5 text-[#1d1d1f] flex items-center justify-between px-4 select-none shrink-0 z-30 shadow-xs">
      {/* Brand & File name */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="flex items-center space-x-1.5 text-[#0071e3] font-semibold text-sm">
          <FileText className="w-4 h-4" />
          <span className="font-semibold text-slate-900">Splice</span>
        </div>

        {hasDocument ? (
          <div className="flex items-center space-x-2 truncate max-w-[140px] md:max-w-[220px]">
            <span
              className="text-xs font-medium text-slate-700 truncate cursor-pointer hover:text-slate-900"
              title={fileName}
            >
              {fileName}
            </span>
            <span className="text-[11px] text-slate-400 shrink-0">
              ({activePageIndex + 1}/{pageCount})
            </span>
          </div>
        ) : null}
      </div>

      {/* Segmented Control Mode Tabs */}
      <div className="flex items-center bg-black/5 p-0.5 rounded-xl border border-black/5">
        <button
          onClick={() => onSelectMode('edit')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            mode === 'edit'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
          }`}
          title="Edit and Annotate PDF"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        <button
          onClick={() => onSelectMode('doc')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            mode === 'doc'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
          }`}
          title="Doc Mode: Edit and convert to Microsoft Word (.docx)"
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Doc / Word</span>
        </button>

        <button
          onClick={() => onSelectMode('organize')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            mode === 'organize'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
          }`}
          title="Splice, Reorder, Rotate & Delete Pages"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Pages</span>
        </button>

        <button
          onClick={() => onSelectMode('merge')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            mode === 'merge'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
          }`}
          title="Merge Multiple PDFs"
        >
          <FilePlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Merge</span>
        </button>

        <button
          onClick={() => onSelectMode('split')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
            mode === 'split'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
          }`}
          title="Split PDF into separate files or ranges"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Split</span>
        </button>
      </div>

      {/* Right Controls: Zoom, Actions */}
      <div className="flex items-center space-x-1.5">
        {hasDocument && mode === 'edit' && (
          <>
            {/* Undo / Redo */}
            <div className="hidden lg:flex items-center space-x-0.5 border-r border-black/10 pr-1.5 mr-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/5 disabled:opacity-30"
                title="Undo (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/5 disabled:opacity-30"
                title="Redo (Ctrl+Y)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center space-x-0.5 bg-black/5 rounded-lg px-1 py-0.5 border border-black/5">
              <button
                onClick={() => onZoomChange(Math.max(0.5, zoom - 0.15))}
                className="p-1 text-slate-500 hover:text-slate-900"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-medium text-slate-700 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => onZoomChange(Math.min(3.0, zoom + 0.15))}
                className="p-1 text-slate-500 hover:text-slate-900"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Watermark & Info */}
            <button
              onClick={onOpenWatermark}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-black/5 rounded-lg transition-colors"
              title="Add Watermark"
            >
              <Droplets className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenMetadata}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-black/5 rounded-lg transition-colors"
              title="PDF Properties"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={handlePrint}
              className="hidden lg:block p-1.5 text-slate-500 hover:text-slate-900 hover:bg-black/5 rounded-lg transition-colors"
              title="Print Document"
            >
              <Printer className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Upload Hidden Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          className="hidden"
          onChange={onUploadFile}
        />

        {!hasDocument && (
          <>
            <button
              onClick={onLoadSample}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-black/5 border border-black/10 transition-colors"
            >
              Try Sample
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Open PDF</span>
            </button>
          </>
        )}

        {hasDocument && (
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-black/5 rounded-lg"
              title="Open Another PDF"
            >
              <UploadCloud className="w-4 h-4" />
            </button>

            <button
              onClick={onExport}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 bg-[#0071e3] hover:bg-[#0077ED] text-white font-semibold px-3.5 py-1.5 rounded-lg text-xs shadow-xs transition-all active:scale-98 disabled:opacity-50"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save PDF</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
