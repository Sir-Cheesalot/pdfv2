import React, { useState, useRef } from 'react';
import {
  FilePlus,
  Upload,
  Trash2,
  GripVertical,
  Download,
  FileText,
  Layers,
} from 'lucide-react';
import type { MergeItem } from '../../types/pdf';
import { PdfService } from '../../services/pdfService';
import { PdfRenderService } from '../../services/pdfRenderService';
import confetti from 'canvas-confetti';
import * as pdfjsLib from 'pdfjs-dist';

interface MergeStudioProps {
  onMergeComplete?: (mergedBytes: Uint8Array, fileName: string) => void;
}

export const MergeStudio: React.FC<MergeStudioProps> = ({ onMergeComplete }) => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: MergeItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) continue;

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      try {
        const { numPages } = await PdfService.loadPdf(bytes);
        const docProxy = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
        const previewUrl = await PdfRenderService.generateThumbnail(docProxy, 1, 0, 160);

        newItems.push({
          id: `merge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          fileName: file.name,
          fileSize: file.size,
          pageCount: numPages,
          pdfBytes: bytes,
          previewThumbnail: previewUrl,
        });
      } catch (err) {
        console.error('Error loading PDF for merge:', file.name, err);
      }
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      setItems((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(draggedIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated;
      });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  const handleMergePdfs = async () => {
    if (items.length < 2) {
      alert('Please add at least 2 PDF files to merge.');
      return;
    }

    setIsMerging(true);
    try {
      const mergedBytes = await PdfService.mergePdfs(items.map((it) => it.pdfBytes));

      const blob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      if (onMergeComplete) {
        onMergeComplete(mergedBytes, a.download);
      }
    } catch (err) {
      console.error('Failed to merge PDFs:', err);
      alert('Failed to merge PDFs: ' + (err as Error).message);
    } finally {
      setIsMerging(false);
    }
  };

  const totalPages = items.reduce((acc, curr) => acc + curr.pageCount, 0);
  const totalSize = items.reduce((acc, curr) => acc + curr.fileSize, 0);

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7] overflow-hidden select-none p-6 md:p-10">
      <div className="max-w-3xl mx-auto w-full flex flex-col h-full space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#0071e3]/10 text-[#0071e3] rounded-xl">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Merge Documents</h2>
              <p className="text-xs text-slate-500">Combine multiple PDF files into one</p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={clearAll}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-[#ff3b30] hover:bg-red-50 transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium bg-black/5 hover:bg-black/10 text-slate-700 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Add Files</span>
              </button>
            </div>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Empty Dropzone State */}
        {items.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border border-dashed border-black/15 hover:border-[#0071e3] bg-white rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all shadow-xs"
          >
            <div className="p-3 bg-[#0071e3]/10 text-[#0071e3] rounded-2xl mb-3">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Choose PDF files to merge</h3>
            <p className="text-xs text-slate-500 text-center mb-4">
              Select two or more PDF files from your computer.
            </p>
            <span className="bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl shadow-xs transition-all">
              Browse PDF Files
            </span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {items.map((item, idx) => {
                const isDragging = draggedIndex === idx;
                const isDragOver = dragOverIndex === idx;

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`flex items-center justify-between bg-white border rounded-xl p-3 shadow-xs transition-all cursor-grab active:cursor-grabbing ${
                      isDragging ? 'opacity-30' : ''
                    } ${
                      isDragOver ? 'border-[#0071e3] ring-2 ring-[#0071e3]/30' : 'border-black/10 hover:border-black/20'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="text-slate-300 hover:text-slate-600 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <span className="w-5 h-5 rounded-full bg-black/5 text-slate-600 font-semibold text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>

                      <div className="w-10 h-14 bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center border border-black/10 shrink-0">
                        {item.previewThumbnail ? (
                          <img
                            src={item.previewThumbnail}
                            alt="Thumb"
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="truncate">
                        <div className="text-xs font-semibold text-slate-800 truncate" title={item.fileName}>
                          {item.fileName}
                        </div>
                        <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 mt-0.5">
                          <span className="text-[#0071e3] font-medium">{item.pageCount} pages</span>
                          <span>•</span>
                          <span>{formatFileSize(item.fileSize)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-[#ff3b30] hover:bg-black/5 rounded-lg transition-colors shrink-0"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Merge Bar */}
            <div className="bg-white border border-black/10 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2 text-xs text-slate-600">
                <Layers className="w-4 h-4 text-[#0071e3]" />
                <span>
                  <strong>{items.length} files</strong> ({totalPages} pages, {formatFileSize(totalSize)})
                </span>
              </div>

              <button
                onClick={handleMergePdfs}
                disabled={items.length < 2 || isMerging}
                className="flex items-center space-x-1.5 bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isMerging ? 'Merging...' : 'Merge & Download'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
