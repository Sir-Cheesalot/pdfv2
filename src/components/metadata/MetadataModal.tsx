import React, { useState } from 'react';
import { X, Info, Image as ImageIcon, Check } from 'lucide-react';
import type { PdfMetadata, PageInfo } from '../../types/pdf';
import { PdfRenderService } from '../../services/pdfRenderService';
import * as pdfjsLib from 'pdfjs-dist';

interface MetadataModalProps {
  isOpen: boolean;
  metadata: PdfMetadata;
  fileName: string;
  fileSize: number;
  pages: PageInfo[];
  activePageIndex: number;
  pdfBytes: Uint8Array | null;
  onClose: () => void;
  onSaveMetadata: (meta: PdfMetadata) => void;
}

export const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  metadata,
  fileName,
  fileSize,
  pages,
  activePageIndex,
  pdfBytes,
  onClose,
  onSaveMetadata,
}) => {
  const [title, setTitle] = useState(metadata.title || '');
  const [author, setAuthor] = useState(metadata.author || '');
  const [subject, setSubject] = useState(metadata.subject || '');
  const [keywords, setKeywords] = useState((metadata.keywords || []).join(', '));
  const [isExportingImage, setIsExportingImage] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveMetadata({
      ...metadata,
      title: title.trim(),
      author: author.trim(),
      subject: subject.trim(),
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
    });
    onClose();
  };

  const handleExportPageImage = async (format: 'image/png' | 'image/jpeg') => {
    if (!pdfBytes) return;
    setIsExportingImage(true);
    try {
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
      const dataUrl = await PdfRenderService.exportPageAsImage(doc, activePageIndex + 1, format, 2.5);

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName.replace(/\.pdf$/i, '')}_page_${activePageIndex + 1}.${format === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export page image:', err);
      alert('Failed to export image: ' + (err as Error).message);
    } finally {
      setIsExportingImage(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const currentPage = pages[activePageIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#0071e3]/10 text-[#0071e3] rounded-lg">
              <Info className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Document Properties</h3>
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
          {/* File summary */}
          <div className="bg-slate-50 border border-black/5 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">File Size</span>
              <strong className="text-slate-800 font-semibold">{formatFileSize(fileSize)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Total Pages</span>
              <strong className="text-slate-800 font-semibold">{pages.length}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Page Dimensions</span>
              <strong className="text-slate-800 font-semibold">
                {currentPage ? `${Math.round(currentPage.width)} × ${Math.round(currentPage.height)}` : '-'}
              </strong>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-2.5">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
                className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Document subject"
                className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Keywords</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. report, finance, 2026"
                className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
            </div>
          </div>

          {/* Export page as image */}
          <div className="pt-2 border-t border-black/5 flex items-center justify-between">
            <span className="text-xs text-slate-600">Export Page {activePageIndex + 1} as Image:</span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => handleExportPageImage('image/png')}
                disabled={isExportingImage}
                className="flex items-center space-x-1 bg-black/5 hover:bg-black/10 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium"
              >
                <ImageIcon className="w-3 h-3" />
                <span>PNG</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPageImage('image/jpeg')}
                disabled={isExportingImage}
                className="flex items-center space-x-1 bg-black/5 hover:bg-black/10 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium"
              >
                <ImageIcon className="w-3 h-3" />
                <span>JPEG</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/5 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
