import React, { useState } from 'react';
import {
  Scissors,
  Download,
  Archive,
  Layers,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import type { PageInfo } from '../../types/pdf';
import { PdfService } from '../../services/pdfService';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';

interface SplitStudioProps {
  pdfBytes: Uint8Array | null;
  fileName: string;
  pages: PageInfo[];
}

export const SplitStudio: React.FC<SplitStudioProps> = ({
  pdfBytes,
  fileName,
  pages,
}) => {
  const [splitMode, setSplitMode] = useState<'single' | 'range' | 'chunk'>('range');
  const [chunkSize, setChunkSize] = useState(2);
  const [isSplitting, setIsSplitting] = useState(false);
  const [customRanges, setCustomRanges] = useState<{ id: string; name: string; range: string }[]>([
    { id: '1', name: 'Part_1.pdf', range: `1-${Math.min(2, pages.length)}` },
    {
      id: '2',
      name: 'Part_2.pdf',
      range: pages.length > 2 ? `3-${pages.length}` : '1',
    },
  ]);

  if (!pdfBytes) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] text-slate-400 text-xs">
        Open a PDF document to split.
      </div>
    );
  }

  const parseRangeString = (rangeStr: string, maxPages: number): number[] => {
    const indices = new Set<number>();
    const parts = rangeStr.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) {
            indices.add(p - 1);
          }
        }
      } else {
        const pageNum = parseInt(part, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
          indices.add(pageNum - 1);
        }
      }
    }

    return Array.from(indices).sort((a, b) => a - b);
  };

  const handleSplitSinglePages = async () => {
    setIsSplitting(true);
    try {
      const results = await PdfService.splitToSinglePages(pdfBytes);
      const zip = new JSZip();
      const baseName = fileName.replace(/\.pdf$/i, '');

      results.forEach((res) => {
        zip.file(`${baseName}_page_${res.pageNumber}.pdf`, res.pdfBytes);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_all_pages.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Failed splitting to single pages:', err);
      alert('Failed to split PDF: ' + (err as Error).message);
    } finally {
      setIsSplitting(false);
    }
  };

  const handleSplitCustomRanges = async () => {
    setIsSplitting(true);
    try {
      const splitDefinitions = customRanges.map((cr) => ({
        name: cr.name.endsWith('.pdf') ? cr.name : `${cr.name}.pdf`,
        pageIndices: parseRangeString(cr.range, pages.length),
      }));

      const results = await PdfService.splitByRanges(pdfBytes, splitDefinitions);

      if (results.length === 1) {
        const blob = new Blob([results[0].pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = results[0].name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const zip = new JSZip();
        results.forEach((res) => {
          zip.file(res.name, res.pdfBytes);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.replace(/\.pdf$/i, '')}_split_ranges.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Failed to split by ranges:', err);
      alert('Failed to split by ranges: ' + (err as Error).message);
    } finally {
      setIsSplitting(false);
    }
  };

  const handleSplitChunks = async () => {
    setIsSplitting(true);
    try {
      const splitDefinitions: { name: string; pageIndices: number[] }[] = [];
      const baseName = fileName.replace(/\.pdf$/i, '');

      let partNum = 1;
      for (let i = 0; i < pages.length; i += chunkSize) {
        const chunkIndices: number[] = [];
        for (let j = i; j < Math.min(i + chunkSize, pages.length); j++) {
          chunkIndices.push(j);
        }
        splitDefinitions.push({
          name: `${baseName}_part_${partNum}.pdf`,
          pageIndices: chunkIndices,
        });
        partNum++;
      }

      const results = await PdfService.splitByRanges(pdfBytes, splitDefinitions);
      const zip = new JSZip();
      results.forEach((res) => {
        zip.file(res.name, res.pdfBytes);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_chunked_${chunkSize}pages.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Failed to split in chunks:', err);
      alert('Failed to split: ' + (err as Error).message);
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7] overflow-hidden select-none p-6 md:p-10">
      <div className="max-w-3xl mx-auto w-full flex flex-col h-full space-y-5">
        {/* Header */}
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-[#0071e3]/10 text-[#0071e3] rounded-xl">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Split Document</h2>
            <p className="text-xs text-slate-500">Extract pages or split into segments</p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              id: 'range',
              label: 'Custom Ranges',
              desc: 'Define page ranges',
              icon: <Layers className="w-4 h-4" />,
            },
            {
              id: 'single',
              label: 'Extract All',
              desc: 'All pages as individual PDFs',
              icon: <Archive className="w-4 h-4" />,
            },
            {
              id: 'chunk',
              label: 'Chunk Pages',
              desc: 'Split every N pages',
              icon: <FileText className="w-4 h-4" />,
            },
          ].map((mode) => (
            <div
              key={mode.id}
              onClick={() => setSplitMode(mode.id as 'single' | 'range' | 'chunk')}
              className={`border rounded-2xl p-4 cursor-pointer transition-all ${
                splitMode === mode.id
                  ? 'border-[#0071e3] bg-blue-50/40 shadow-xs'
                  : 'border-black/10 bg-white hover:border-black/20'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-[#0071e3] mb-1">
                {mode.icon}
                <span className="text-xs font-semibold text-slate-900">{mode.label}</span>
              </div>
              <p className="text-[11px] text-slate-500">{mode.desc}</p>
            </div>
          ))}
        </div>

        {/* MODE 1: CUSTOM RANGES */}
        {splitMode === 'range' && (
          <div className="flex-1 flex flex-col bg-white border border-black/10 rounded-2xl p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">Ranges</h3>
                <p className="text-[11px] text-slate-400">Total pages: {pages.length}</p>
              </div>

              <button
                onClick={() =>
                  setCustomRanges((prev) => [
                    ...prev,
                    {
                      id: `${Date.now()}`,
                      name: `Part_${prev.length + 1}.pdf`,
                      range: '1',
                    },
                  ])
                }
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-black/5 hover:bg-black/10 text-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Range</span>
              </button>
            </div>

            {/* Range rows */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {customRanges.map((cr, idx) => {
                const parsedPages = parseRangeString(cr.range, pages.length);
                return (
                  <div
                    key={cr.id}
                    className="flex items-center space-x-2.5 bg-slate-50 border border-black/5 rounded-xl p-2.5"
                  >
                    <span className="w-5 h-5 rounded-full bg-white text-[#0071e3] font-semibold text-[11px] flex items-center justify-center shrink-0 border border-black/5">
                      {idx + 1}
                    </span>

                    {/* File Name */}
                    <div className="flex-1">
                      <input
                        type="text"
                        value={cr.name}
                        placeholder="File name"
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomRanges((prev) =>
                            prev.map((item) => (item.id === cr.id ? { ...item, name: val } : item))
                          );
                        }}
                        className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none w-full"
                      />
                    </div>

                    {/* Page Range Input */}
                    <div className="w-36">
                      <input
                        type="text"
                        value={cr.range}
                        placeholder="e.g. 1-3, 5"
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomRanges((prev) =>
                            prev.map((item) => (item.id === cr.id ? { ...item, range: val } : item))
                          );
                        }}
                        className="bg-white border border-black/10 rounded px-2 py-0.5 text-xs font-mono text-[#0071e3] focus:outline-none w-full"
                      />
                    </div>

                    <span className="text-[11px] text-slate-400 shrink-0">
                      {parsedPages.length} {parsedPages.length === 1 ? 'page' : 'pages'}
                    </span>

                    {customRanges.length > 1 && (
                      <button
                        onClick={() =>
                          setCustomRanges((prev) => prev.filter((item) => item.id !== cr.id))
                        }
                        className="p-1 text-slate-300 hover:text-[#ff3b30] rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleSplitCustomRanges}
                disabled={isSplitting}
                className="flex items-center space-x-1.5 bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isSplitting ? 'Splitting...' : 'Split & Download'}</span>
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: EXTRACT SINGLE PAGES */}
        {splitMode === 'single' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-black/10 rounded-2xl p-10 text-center space-y-3 shadow-xs">
            <div className="p-3 bg-[#0071e3]/10 text-[#0071e3] rounded-2xl">
              <Archive className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Extract All {pages.length} Pages</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Save each page as an individual PDF in a ZIP file.
            </p>
            <button
              onClick={handleSplitSinglePages}
              disabled={isSplitting}
              className="flex items-center space-x-1.5 bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-40 mt-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isSplitting ? 'Extracting...' : 'Download ZIP'}</span>
            </button>
          </div>
        )}

        {/* MODE 3: FIXED CHUNK SPLITTING */}
        {splitMode === 'chunk' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white border border-black/10 rounded-2xl p-10 text-center space-y-4 shadow-xs">
            <div className="p-3 bg-[#0071e3]/10 text-[#0071e3] rounded-2xl">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Split Every N Pages</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Divide into equal page segments and download as a ZIP file.
            </p>

            <div className="flex items-center space-x-2 bg-slate-50 border border-black/10 px-3.5 py-1.5 rounded-xl">
              <span className="text-xs text-slate-600">Pages per file:</span>
              <input
                type="number"
                min="1"
                max={pages.length}
                value={chunkSize}
                onChange={(e) => setChunkSize(Math.max(1, Number(e.target.value)))}
                className="w-12 bg-white border border-black/10 rounded px-1.5 py-0.5 text-xs text-slate-900 font-semibold text-center outline-none"
              />
              <span className="text-xs text-slate-400">
                = {Math.ceil(pages.length / chunkSize)} files
              </span>
            </div>

            <button
              onClick={handleSplitChunks}
              disabled={isSplitting}
              className="flex items-center space-x-1.5 bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isSplitting ? 'Splitting...' : 'Download ZIP'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
