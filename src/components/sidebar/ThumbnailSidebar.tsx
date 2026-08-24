import React, { useEffect, useState } from 'react';
import {
  RotateCw,
  Trash2,
  Copy,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import type { PageInfo } from '../../types/pdf';
import { PdfRenderService } from '../../services/pdfRenderService';
import * as pdfjsLib from 'pdfjs-dist';

interface ThumbnailSidebarProps {
  docId: string;
  pdfBytes: Uint8Array | null;
  pages: PageInfo[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onRotatePage: (index: number) => void;
  onDeletePage: (index: number) => void;
  onDuplicatePage: (index: number) => void;
  onInsertBlankPage: (index: number) => void;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  docId,
  pdfBytes,
  pages,
  activePageIndex,
  onSelectPage,
  onRotatePage,
  onDeletePage,
  onDuplicatePage,
  onInsertBlankPage,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [pdfProxy, setPdfProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;

    PdfRenderService.loadDocument(docId, pdfBytes)
      .then((proxy) => {
        if (!isCancelled) setPdfProxy(proxy);
      })
      .catch((err) => console.error('Error loading thumbnail doc:', err));

    return () => {
      isCancelled = true;
    };
  }, [docId, pdfBytes]);

  useEffect(() => {
    if (!pdfProxy || pages.length === 0) return;
    let isCancelled = false;

    const loadThumbnails = async () => {
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
            c.width = 120;
            c.height = 170;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, 120, 170);
              ctx.fillStyle = '#94a3b8';
              ctx.font = '12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('Blank Page', 60, 85);
              newThumbs[cacheKey] = c.toDataURL();
            }
          } else if (page.customBytes) {
            const extDoc = await pdfjsLib.getDocument({ data: new Uint8Array(page.customBytes) }).promise;
            const thumbUrl = await PdfRenderService.generateThumbnail(
              extDoc,
              page.originalPageIndex + 1,
              page.rotation,
              180
            );
            newThumbs[cacheKey] = thumbUrl;
          } else {
            const thumbUrl = await PdfRenderService.generateThumbnail(
              pdfProxy,
              page.originalPageIndex + 1,
              page.rotation,
              180
            );
            newThumbs[cacheKey] = thumbUrl;
          }
        } catch (e) {
          console.error('Failed generating thumbnail for page', i, e);
        }
      }

      if (!isCancelled) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    };

    loadThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [pdfProxy, pages]);

  if (isCollapsed) {
    return (
      <div className="w-9 bg-white/80 backdrop-blur-xl border-r border-black/5 flex flex-col items-center py-3 select-none shrink-0 transition-all">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          title="Expand Pages Sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-semibold text-slate-400 [writing-mode:vertical-lr] mt-4 tracking-widest uppercase">
          PAGES ({pages.length})
        </span>
      </div>
    );
  }

  return (
    <aside className="w-52 bg-white/80 backdrop-blur-xl border-r border-black/5 flex flex-col select-none shrink-0 z-20">
      {/* Sidebar Header */}
      <div className="h-11 px-3.5 border-b border-black/5 flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
          <FileText className="w-3.5 h-3.5 text-[#0071e3]" />
          <span>Pages ({pages.length})</span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          title="Collapse Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Pages List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {pages.map((page, idx) => {
          const cacheKey = `${page.id}-${page.rotation}`;
          const thumbUrl = thumbnails[cacheKey];
          const isActive = idx === activePageIndex;

          return (
            <div
              key={page.id}
              onClick={() => onSelectPage(idx)}
              className={`group relative rounded-xl p-2 cursor-pointer transition-all border ${
                isActive
                  ? 'bg-[#0071e3]/10 border-[#0071e3] shadow-xs'
                  : 'bg-white border-black/10 hover:border-black/20 shadow-xs'
              }`}
            >
              {/* Page Number Badge */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[#0071e3] text-white' : 'bg-black/5 text-slate-600'
                  }`}
                >
                  Page {idx + 1}
                </span>

                {/* Quick actions on hover */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRotatePage(idx);
                    }}
                    className="p-0.5 text-slate-500 hover:text-slate-900 hover:bg-black/5 rounded"
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicatePage(idx);
                    }}
                    className="p-0.5 text-slate-500 hover:text-[#34c759] hover:bg-black/5 rounded"
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
                      className="p-0.5 text-slate-500 hover:text-[#ff3b30] hover:bg-black/5 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Thumbnail Container */}
              <div className="w-full aspect-[1/1.414] bg-white rounded-lg flex items-center justify-center overflow-hidden border border-black/10 shadow-inner">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : (
                  <div className="text-slate-300 text-xs font-mono animate-pulse">...</div>
                )}
              </div>

              {/* Quick Insert Blank Below */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertBlankPage(idx + 1);
                  }}
                  className="bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-full p-0.5 shadow-sm flex items-center justify-center"
                  title="Insert blank page below"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
