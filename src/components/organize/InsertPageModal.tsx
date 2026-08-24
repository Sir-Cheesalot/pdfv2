import React, { useState } from 'react';
import { X, FilePlus, Upload, Check } from 'lucide-react';

interface InsertPageModalProps {
  isOpen: boolean;
  totalPages: number;
  insertIndex: number;
  onClose: () => void;
  onInsertBlank: (atIndex: number, width: number, height: number) => void;
  onInsertExternal: (pdfBytes: Uint8Array, atIndex: number) => void;
}

export const InsertPageModal: React.FC<InsertPageModalProps> = ({
  isOpen,
  totalPages,
  insertIndex,
  onClose,
  onInsertBlank,
  onInsertExternal,
}) => {
  const [tab, setTab] = useState<'blank' | 'file'>('blank');
  const [targetIndex, setTargetIndex] = useState(insertIndex);
  const [pageSize, setPageSize] = useState<'a4' | 'letter' | 'custom'>('a4');
  const [customWidth, setCustomWidth] = useState(595);
  const [customHeight, setCustomHeight] = useState(842);
  const [selectedFileBytes, setSelectedFileBytes] = useState<Uint8Array | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const buffer = await file.arrayBuffer();
      setSelectedFileBytes(new Uint8Array(buffer));
      setSelectedFileName(file.name);
    }
  };

  const handleApply = () => {
    if (tab === 'blank') {
      let w = 595.28;
      let h = 841.89; // A4
      if (pageSize === 'letter') {
        w = 612.0;
        h = 792.0;
      } else if (pageSize === 'custom') {
        w = customWidth;
        h = customHeight;
      }
      onInsertBlank(targetIndex, w, h);
      onClose();
    } else if (tab === 'file') {
      if (selectedFileBytes) {
        onInsertExternal(selectedFileBytes, targetIndex);
        onClose();
      } else {
        alert('Please select a PDF file first.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#0071e3]/10 text-[#0071e3] rounded-lg">
              <FilePlus className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Insert Pages</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/5 bg-slate-50 p-1">
          <button
            onClick={() => setTab('blank')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'blank'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Blank Page</span>
          </button>
          <button
            onClick={() => setTab('file')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'file'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>From Another PDF</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          {/* Insertion Position */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Insert Position</label>
            <select
              value={targetIndex}
              onChange={(e) => setTargetIndex(Number(e.target.value))}
              className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
            >
              <option value={0}>At the beginning (Before Page 1)</option>
              {Array.from({ length: totalPages }).map((_, i) => (
                <option key={i} value={i + 1}>
                  After Page {i + 1}
                </option>
              ))}
            </select>
          </div>

          {/* TAB 1: BLANK PAGE */}
          {tab === 'blank' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Page Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'a4', label: 'A4', sub: '210 × 297 mm' },
                    { id: 'letter', label: 'Letter', sub: '8.5 × 11 in' },
                    { id: 'custom', label: 'Custom', sub: 'Set px' },
                  ].map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setPageSize(s.id as any)}
                      className={`border rounded-xl p-2.5 text-center cursor-pointer transition-all ${
                        pageSize === s.id
                          ? 'border-[#0071e3] bg-blue-50/40'
                          : 'border-black/10 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <strong className="text-xs text-slate-800 block">{s.label}</strong>
                      <span className="text-[10px] text-slate-400">{s.sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              {pageSize === 'custom' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Width (pts)</label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-black/10 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Height (pts)</label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-black/10 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXTERNAL FILE */}
          {tab === 'file' && (
            <div className="space-y-3 pt-1">
              <input
                type="file"
                accept="application/pdf"
                id="external-pdf-input"
                className="hidden"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="external-pdf-input"
                className="border border-dashed border-black/15 bg-slate-50 hover:bg-slate-100 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer text-center space-y-2 block"
              >
                {selectedFileName ? (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-[#0071e3] block truncate max-w-xs">
                      {selectedFileName}
                    </span>
                    <span className="text-[10px] text-slate-400">Click to change file</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-medium text-slate-700">Choose PDF file to insert</span>
                  </>
                )}
              </label>
            </div>
          )}
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
            onClick={handleApply}
            className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Insert</span>
          </button>
        </div>
      </div>
    </div>
  );
};
