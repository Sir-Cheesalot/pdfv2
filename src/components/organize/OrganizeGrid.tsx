import React, { useState, useEffect } from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Copy,
  Plus,
  Download,
  CheckSquare,
  Square,
  GripVertical,
} from 'lucide-react';
import type { PageInfo } from '../../types/pdf';
import { PdfRenderService } from '../../services/pdfRenderService';
import { PdfService } from '../../services/pdfService';
import { InsertPageModal } from './InsertPageModal';
import * as pdfjsLib from 'pdfjs-dist';

interface OrganizeGridProps {
  docId: string;
  pdfBytes: Uint8Array | null;
  pages: PageInfo[];
  fileName: string;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  onRotatePage: (index: number, angleDiff?: number) => void;
  onRotateAllPages: (angleDiff?: number) => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onInsertBlankPage: (atIndex: number, width?: number, height?: number) => void;
  onInsertExternalPages: (fileBytes: Uint8Array, atIndex: number) => void;
  onSelectPageToEdit: (index: number) => void;
}

export const OrganizeGrid: React.FC<OrganizeGridProps> = ({
  docId,
  pdfBytes,
  pages,
  fileName,
  onReorderPages,
  onRotatePage,
  onRotateAllPages,
  onDeletePage,
  onDuplicatePage,
  onInsertBlankPage,
  onInsertExternalPages,
  onSelectPageToEdit,
}) => {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [selectedPageIndices, setSelectedPageIndices] = useState<number[]>([]);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [insertTargetIndex, setInsertTargetIndex] = useState(pages.length);

  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;

    PdfRenderService.loadDocument(docId, pdfBytes)
      .then((proxy) => {
        if (!isCancelled) setPdfProxy(proxy);
      })
      .catch((err) => console.error('Error loading pdf in OrganizeGrid:', err));

    return () => {
      isCancelled = true;
    };
  }, [docId, pdfBytes]);

  useEffect(() => {
    if (!pdfProxy || pages.length === 0) return;
    let isCancelled = false;

    const loadThumbs = async () => {
      const newThumbs: Record<string, string> = {};

      for (let i = 0; i < pages.length; i++) {
        if (isCancelled) break;
        const page = pages[i];
        const cacheKey = `${page.id}-${page.rotation}`;

        if (thumbnails[cacheKey]) {
          newThumbs[cacheKey] = thumbnails[cacheKey];
          continue;
        }

        try {
          if (page.isBlank) {
            const c = document.createElement('canvas');
            c.width = 200;
            c.height = 280;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, 200, 280);
              ctx.fillStyle = '#94a3b8';
              ctx.font = '14px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('Blank Page', 100, 140);
              newThumbs[cacheKey] = c.toDataURL();
            }
          } else if (page.customBytes) {
            const extDoc = await pdfjsLib.getDocument({ data: new Uint8Array(page.customBytes) }).promise;
            const thumbUrl = await PdfRenderService.generateThumbnail(
              extDoc,
              page.originalPageIndex + 1,
              page.rotation,
              260
            );
            newThumbs[cacheKey] = thumbUrl;
          } else {
            const thumbUrl = await PdfRenderService.generateThumbnail(
              pdfProxy,
              page.originalPageIndex + 1,
              page.rotation,
              260
            );
            newThumbs[cacheKey] = thumbUrl;
          }
        } catch (e) {
          console.error('Error generating grid thumbnail', i, e);
        }
      }

      if (!isCancelled) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    };

    loadThumbs();

    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, pages]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedPageIndex(index);
    e.dataTransfer.setData('text/plain', index.toString());
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
    if (draggedPageIndex !== null && draggedPageIndex !== toIndex) {
      onReorderPages(draggedPageIndex, toIndex);
    }
    setDraggedPageIndex(null);
    setDragOverIndex(null);
  };

  const toggleSelectPage = (index: number) => {
    setSelectedPageIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const selectAll = () => {
    if (selectedPageIndices.length === pages.length) {
      setSelectedPageIndices([]);
    } else {
      setSelectedPageIndices(pages.map((_, idx) => idx));
    }
  };

  const deleteSelectedPages = () => {
    if (selectedPageIndices.length === 0) return;
    if (selectedPageIndices.length >= pages.length) {
      alert('Cannot delete all pages.');
      return;
    }
    if (confirm(`Delete ${selectedPageIndices.length} selected pages?`)) {
      const sorted = [...selectedPageIndices].sort((a, b) => b - a);
      sorted.forEach((idx) => onDeletePage(idx));
      setSelectedPageIndices([]);
    }
  };

  const rotateSelectedPages = (diff: number = 90) => {
    selectedPageIndices.forEach((idx) => onRotatePage(idx, diff));
  };

  const extractSelectedPages = async () => {
    if (!pdfBytes || selectedPageIndices.length === 0) return;
    const sortedIndices = [...selectedPageIndices].sort((a, b) => a - b);
    const splitResults = await PdfService.splitByRanges(pdfBytes, [
      {
        name: `${fileName.replace(/\.pdf$/i, '')}_extracted.pdf`,
        pageIndices: sortedIndices.map((i) => pages[i].originalPageIndex),
      },
    ]);

    if (splitResults.length > 0) {
      const blob = new Blob([splitResults[0].pdfBytes.buffer as ArrayBuffer], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = splitResults[0].name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7] overflow-hidden select-none">
      {/* Top Action Bar */}
      <div className="h-12 bg-white/80 backdrop-blur-xl border-b border-black/5 px-6 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={selectAll}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-black/5 border border-black/10 transition-colors"
          >
            {selectedPageIndices.length === pages.length ? (
              <CheckSquare className="w-3.5 h-3.5 text-[#0071e3]" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span>{selectedPageIndices.length === pages.length ? 'Deselect All' : 'Select All'}</span>
          </button>

          {selectedPageIndices.length > 0 && (
            <span className="text-xs text-[#0071e3] font-medium bg-blue-50 px-2 py-0.5 rounded-md">
              {selectedPageIndices.length} selected
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1.5">
          {selectedPageIndices.length > 0 ? (
            <>
              <button
                onClick={() => rotateSelectedPages(90)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-black/5 border border-black/10"
                title="Rotate Selected"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rotate</span>
              </button>

              <button
                onClick={extractSelectedPages}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium bg-[#0071e3] hover:bg-[#0077ED] text-white shadow-xs"
                title="Extract Pages"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Extract ({selectedPageIndices.length})</span>
              </button>

              <button
                onClick={deleteSelectedPages}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#ff3b30] hover:bg-red-50 border border-red-200"
                title="Delete Selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onRotateAllPages(90)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-black/5 border border-black/10"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotate All</span>
              </button>

              <button
                onClick={() => {
                  setInsertTargetIndex(pages.length);
                  setIsInsertModalOpen(true);
                }}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium bg-[#0071e3] hover:bg-[#0077ED] text-white shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert Page</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pages Grid Container */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {pages.map((page, idx) => {
            const cacheKey = `${page.id}-${page.rotation}`;
            const thumbUrl = thumbnails[cacheKey];
            const isSelected = selectedPageIndices.includes(idx);
            const isDragging = draggedPageIndex === idx;
            const isDragOver = dragOverIndex === idx;

            return (
              <div
                key={page.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                className={`group relative flex flex-col bg-white border rounded-2xl p-3 shadow-xs transition-all duration-150 cursor-grab active:cursor-grabbing ${
                  isDragging ? 'opacity-30' : ''
                } ${
                  isDragOver ? 'border-[#0071e3] ring-2 ring-[#0071e3]/30 scale-102' : ''
                } ${
                  isSelected
                    ? 'border-[#0071e3] ring-2 ring-[#0071e3]/30 bg-blue-50/20'
                    : 'border-black/10 hover:border-black/20'
                }`}
              >
                {/* Header Bar */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectPage(idx);
                      }}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#0071e3]" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span className="text-xs font-semibold text-slate-800">Page {idx + 1}</span>
                  </div>

                  <div className="flex items-center text-slate-300 group-hover:text-slate-500">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Thumbnail Preview */}
                <div
                  onClick={() => onSelectPageToEdit(idx)}
                  className="w-full aspect-[1/1.414] bg-white rounded-xl overflow-hidden flex items-center justify-center border border-black/10 cursor-pointer relative shadow-inner"
                  title="Open in editor"
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="text-slate-300 text-xs font-mono animate-pulse">...</div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-[10px] font-semibold text-white bg-[#0071e3] px-2.5 py-1 rounded-full shadow-xs">
                      Open
                    </span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/5">
                  <div className="flex items-center space-x-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotatePage(idx, -90);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-800 hover:bg-black/5 rounded"
                      title="Rotate CCW"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotatePage(idx, 90);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-800 hover:bg-black/5 rounded"
                      title="Rotate CW"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicatePage(idx);
                      }}
                      className="p-1 text-slate-400 hover:text-[#34c759] hover:bg-black/5 rounded"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {pages.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePage(idx);
                        }}
                        className="p-1 text-slate-400 hover:text-[#ff3b30] hover:bg-black/5 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Insert Page Modal */}
      <InsertPageModal
        isOpen={isInsertModalOpen}
        totalPages={pages.length}
        insertIndex={insertTargetIndex}
        onClose={() => setIsInsertModalOpen(false)}
        onInsertBlank={(atIndex, w, h) => onInsertBlankPage(atIndex, w, h)}
        onInsertExternal={(bytes, atIndex) => onInsertExternalPages(bytes, atIndex)}
      />
    </div>
  );
};
