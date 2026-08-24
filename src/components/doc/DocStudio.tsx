import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Copy,
  Plus,
  Trash2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table as TableIcon,
  Search,
  Check,
  Superscript,
  Subscript,
  Bold,
  Italic,
  Underline,
  PlusCircle,
  Image as ImageIcon,
  Upload,
  Sparkles,
} from 'lucide-react';
import type { DocParagraph } from '../../types/pdf';
import { PdfRenderService, cleanSubSuperTags } from '../../services/pdfRenderService';
import { DocExportService } from '../../services/docExportService';
import confetti from 'canvas-confetti';

interface DocStudioProps {
  docId: string;
  pdfBytes: Uint8Array | null;
  fileName: string;
}

export const DocStudio: React.FC<DocStudioProps> = ({
  docId,
  pdfBytes,
  fileName,
}) => {
  const [paragraphs, setParagraphs] = useState<DocParagraph[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [ocrLoadingId, setOcrLoadingId] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number>(0);

  // Hidden image input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cellFileInputRef = useRef<HTMLInputElement>(null);
  const [insertImageTargetPageIndex, setInsertImageTargetPageIndex] = useState<number>(0);
  const [targetCellCoords, setTargetCellCoords] = useState<{
    paraId: string;
    rowIdx: number;
    colIdx: number;
  } | null>(null);

  // Active focused textarea or table input for formatting toolbar
  const [activeElementInfo, setActiveElementInfo] = useState<{
    paraId: string;
    isTableCell?: boolean;
    rowIdx?: number;
    colIdx?: number;
  } | null>(null);

  // Auto-resize all textareas
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  // Extract structured paragraphs and diagrams on load
  useEffect(() => {
    if (!pdfBytes) return;
    let isCancelled = false;

    const parseDoc = async () => {
      setIsLoading(true);
      try {
        const docProxy = await PdfRenderService.loadDocument(docId, pdfBytes);
        const extracted = await PdfRenderService.extractDocumentParagraphs(docProxy);
        if (!isCancelled) {
          setParagraphs(extracted);
        }
      } catch (err) {
        console.error('Failed to extract document paragraphs:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    parseDoc();

    return () => {
      isCancelled = true;
    };
  }, [docId, pdfBytes]);

  // Adjust textarea heights automatically whenever paragraphs change
  useEffect(() => {
    paragraphs.forEach((p) => {
      const el = textareaRefs.current.get(p.id);
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
      }
    });
  }, [paragraphs, searchQuery]);

  const handleUpdateParagraph = (id: string, text: string) => {
    const cleaned = cleanSubSuperTags(text);
    setParagraphs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, text: cleaned } : p))
    );
    const el = textareaRefs.current.get(id);
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
    }
  };

  const handleUpdateCaption = (id: string, caption: string) => {
    setParagraphs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption } : p))
    );
  };

  const handleTypeChange = (id: string, type: DocParagraph['type']) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          if (type === 'table' && (!p.tableData || p.tableData.length === 0)) {
            return {
              ...p,
              type,
              tableData: [
                ['Column 1', 'Column 2', 'Column 3'],
                ['Data 1', 'Data 2', 'Data 3'],
              ],
            };
          }
          return { ...p, type };
        }
        return p;
      })
    );
  };

  const handleDeleteParagraph = (id: string) => {
    setParagraphs((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddParagraph = (
    afterIndex: number,
    pageIndex: number,
    type: DocParagraph['type'] = 'p'
  ) => {
    const newPara: DocParagraph = {
      id: `p-new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      text: type === 'table' ? '' : 'New text section...',
      tableData:
        type === 'table'
          ? [
              ['Column 1', 'Column 2', 'Column 3'],
              ['Data 1', 'Data 2', 'Data 3'],
            ]
          : undefined,
      pageIndex,
    };
    setParagraphs((prev) => {
      const updated = [...prev];
      updated.splice(afterIndex + 1, 0, newPara);
      return updated;
    });
  };

  const handleInsertCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        const newImgPara: DocParagraph = {
          id: `img-custom-${Date.now()}`,
          type: 'image',
          text: '',
          imageUrl: dataUrl,
          imageWidth: 460,
          imageHeight: 280,
          caption: 'Figure: ' + file.name.replace(/\.[^/.]+$/, ''),
          pageIndex: insertImageTargetPageIndex,
        };
        setParagraphs((prev) => [...prev, newImgPara]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Table cell image insertion handler
  const handleInsertCellImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetCellCoords) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        const { paraId, rowIdx, colIdx } = targetCellCoords;
        setParagraphs((prev) =>
          prev.map((p) => {
            if (p.id === paraId && p.tableData) {
              const currentCell = p.tableData[rowIdx]?.[colIdx] || '';
              const newCell = `![img](${dataUrl}) ${currentCell.replace(/!\[.*?\]\(.*?\)/, '').trim()}`.trim();
              const newTable = p.tableData.map((row, r) =>
                r === rowIdx ? row.map((cell, c) => (c === colIdx ? newCell : cell)) : [...row]
              );
              return { ...p, tableData: newTable };
            }
            return p;
          })
        );
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setTargetCellCoords(null);
  };

  const handleRemoveCellImage = (paraId: string, rowIdx: number, colIdx: number) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === paraId && p.tableData) {
          const currentCell = p.tableData[rowIdx]?.[colIdx] || '';
          const cleaned = currentCell.replace(/!\[.*?\]\(.*?\)|data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/, '').trim();
          const newTable = p.tableData.map((row, r) =>
            r === rowIdx ? row.map((cell, c) => (c === colIdx ? cleaned : cell)) : [...row]
          );
          return { ...p, tableData: newTable };
        }
        return p;
      })
    );
  };

  // Run Tesseract OCR on Diagram / Scanned image
  const handleRunOcrOnDiagram = async (para: DocParagraph, globalIndex: number) => {
    if (!para.imageUrl) return;
    setOcrLoadingId(para.id);
    try {
      const ocrRes = await PdfRenderService.runOcrOnImage(para.imageUrl, (prog) => {
        setOcrProgress(Math.round(prog * 100));
      });

      if (ocrRes.text && ocrRes.text.trim()) {
        const lines = ocrRes.text.split('\n').map((l) => l.trim()).filter(Boolean);
        const newParas: DocParagraph[] = lines.map((line, lIdx) => ({
          id: `ocr-transcribed-${Date.now()}-${lIdx}`,
          type: 'p',
          text: cleanSubSuperTags(line),
          pageIndex: para.pageIndex,
        }));

        setParagraphs((prev) => {
          const copy = [...prev];
          copy.splice(globalIndex + 1, 0, ...newParas);
          return copy;
        });
      }
    } catch (err) {
      console.error('OCR failed on diagram:', err);
    } finally {
      setOcrLoadingId(null);
      setOcrProgress(0);
    }
  };

  // Table manipulation handlers
  const handleUpdateTableCell = (
    paraId: string,
    rowIdx: number,
    colIdx: number,
    value: string
  ) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === paraId && p.tableData) {
          const newTable = p.tableData.map((row, r) =>
            r === rowIdx ? row.map((cell, c) => (c === colIdx ? value : cell)) : [...row]
          );
          return { ...p, tableData: newTable };
        }
        return p;
      })
    );
  };

  const handleAddTableRow = (paraId: string) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === paraId && p.tableData && p.tableData.length > 0) {
          const numCols = p.tableData[0].length;
          const newRow = new Array(numCols).fill('Cell');
          return { ...p, tableData: [...p.tableData, newRow] };
        }
        return p;
      })
    );
  };

  const handleAddTableCol = (paraId: string) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === paraId && p.tableData) {
          const newTable = p.tableData.map((row, idx) => [
            ...row,
            idx === 0 ? `Col ${row.length + 1}` : 'Cell',
          ]);
          return { ...p, tableData: newTable };
        }
        return p;
      })
    );
  };

  const handleDeleteTableRow = (paraId: string, rowIdx: number) => {
    setParagraphs((prev) =>
      prev.map((p) => {
        if (p.id === paraId && p.tableData && p.tableData.length > 1) {
          const newTable = p.tableData.filter((_, idx) => idx !== rowIdx);
          return { ...p, tableData: newTable };
        }
        return p;
      })
    );
  };

  // Formatting Tag Wrap Handler (Bold, Italic, Underline, Sub, Sup)
  const handleApplyFormatting = (tag: 'b' | 'i' | 'u' | 'sub' | 'sup') => {
    const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (!activeEl) return;

    const start = activeEl.selectionStart || 0;
    const end = activeEl.selectionEnd || 0;
    const val = activeEl.value || '';
    const selected = val.substring(start, end) || (tag === 'b' ? 'bold text' : tag === 'i' ? 'italic text' : 'text');
    const cleanSelected = selected.trim();
    if (!cleanSelected) return;

    const replacement = `<${tag}>${cleanSelected}</${tag}>`;
    const newText = val.substring(0, start) + replacement + val.substring(end);

    // If active element is a table cell
    if (activeElementInfo?.isTableCell && activeElementInfo.rowIdx !== undefined && activeElementInfo.colIdx !== undefined) {
      handleUpdateTableCell(activeElementInfo.paraId, activeElementInfo.rowIdx, activeElementInfo.colIdx, newText);
    } else if (activeElementInfo?.paraId) {
      handleUpdateParagraph(activeElementInfo.paraId, newText);
    }

    setTimeout(() => {
      activeEl.focus();
      activeEl.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 50);
  };

  // Keyboard shortcut listener for formatting in textareas/inputs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, paraId: string) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleApplyFormatting('b');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleApplyFormatting('i');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleApplyFormatting('u');
      }
    }
  };

  // Export handlers
  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      const baseName = fileName.replace(/\.pdf$/i, '');
      const blob = await DocExportService.exportToDocx(paragraphs, baseName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.docx`;
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
      console.error('Failed to export DOCX:', err);
      alert('Error exporting Word document: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportHtml = () => {
    const baseName = fileName.replace(/\.pdf$/i, '');
    const html = DocExportService.exportToHtml(paragraphs, baseName);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTxt = () => {
    const baseName = fileName.replace(/\.pdf$/i, '');
    const txt = DocExportService.exportToTxt(paragraphs);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyText = () => {
    const text = DocExportService.exportToTxt(paragraphs);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group paragraphs by page
  const pagesMap = new Map<number, { globalIndex: number; para: DocParagraph }[]>();
  paragraphs.forEach((para, idx) => {
    const pIdx = para.pageIndex || 0;
    if (!pagesMap.has(pIdx)) {
      pagesMap.set(pIdx, []);
    }
    pagesMap.get(pIdx)!.push({ globalIndex: idx, para });
  });

  const pageKeys = Array.from(pagesMap.keys()).sort((a, b) => a - b);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f5f5f7] overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInsertCustomImage}
      />
      <input
        ref={cellFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInsertCellImageUpload}
      />

      {/* DOCKED FORMATTING & EXPORT HEADER */}
      <div className="bg-white/95 backdrop-blur-xl border-b border-black/10 px-6 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 shadow-xs">
        {/* Left: Search & Word Count */}
        <div className="flex items-center space-x-3">
          <div className="relative w-48 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search document..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-black/5 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-[#0071e3] transition-all text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-[11px] font-medium text-slate-400">
            <span>{paragraphs.length} sections</span>
            <span>•</span>
            <span>{paragraphs.filter((p) => p.type === 'table').length} tables</span>
            <span>•</span>
            <span>{paragraphs.filter((p) => p.type === 'image').length} diagrams</span>
          </div>
        </div>

        {/* Center: RICH FORMATTING TOOLBAR */}
        <div className="flex items-center bg-black/5 p-0.5 rounded-lg space-x-0.5">
          <button
            onClick={() => handleApplyFormatting('b')}
            className="p-1.5 rounded hover:bg-white text-slate-700 hover:text-[#0071e3] transition-all"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleApplyFormatting('i')}
            className="p-1.5 rounded hover:bg-white text-slate-700 hover:text-[#0071e3] transition-all"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleApplyFormatting('u')}
            className="p-1.5 rounded hover:bg-white text-slate-700 hover:text-[#0071e3] transition-all"
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3.5 bg-black/10 mx-0.5" />
          <button
            onClick={() => handleApplyFormatting('sub')}
            className="p-1.5 rounded hover:bg-white text-slate-700 hover:text-[#0071e3] transition-all"
            title="Subscript (X₂)"
          >
            <Subscript className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleApplyFormatting('sup')}
            className="p-1.5 rounded hover:bg-white text-slate-700 hover:text-[#0071e3] transition-all"
            title="Superscript (X²)"
          >
            <Superscript className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Export & Copy Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyText}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-black/5 hover:bg-black/10 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            title="Copy all text to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#34c759]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleExportHtml}
            className="hidden md:flex items-center space-x-1 px-3 py-1.5 bg-black/5 hover:bg-black/10 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>HTML</span>
          </button>

          <button
            onClick={handleExportTxt}
            className="hidden md:flex items-center space-x-1 px-3 py-1.5 bg-black/5 hover:bg-black/10 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>TXT</span>
          </button>

          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-[#0071e3] hover:bg-[#0077ED] active:scale-98 text-white text-xs font-medium rounded-lg shadow-xs transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export Word (.docx)'}</span>
          </button>
        </div>
      </div>

      {/* MAIN DOCUMENT VIEWPORT */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 md:p-8 flex justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-3 m-auto">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-[#0071e3] rounded-full animate-spin" />
            <span className="text-xs font-medium text-slate-500">
              Extracting document structure, tables, and diagrams...
            </span>
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-6 select-text">
            {pageKeys.map((pageNum) => {
              const pageEntries = (pagesMap.get(pageNum) || []).filter(
                (item) =>
                  !searchQuery.trim() ||
                  item.para.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (item.para.tableData &&
                    item.para.tableData.some((r) =>
                      r.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))
                    ))
              );

              if (pageEntries.length === 0) return null;

              return (
                <div
                  key={`page-sheet-${pageNum}`}
                  className="bg-white text-[#1d1d1f] rounded-2xl shadow-sm p-10 md:p-14 min-h-[600px] border border-black/5 transition-all relative"
                >
                  {/* Sheet Header */}
                  <div className="border-b border-black/5 pb-3 mb-6 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Page {pageNum + 1}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => {
                          setInsertImageTargetPageIndex(pageNum);
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center space-x-1 px-2 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 text-xs font-medium rounded-md transition-colors"
                        title="Insert Diagram / Image"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>Diagram</span>
                      </button>

                      <button
                        onClick={() =>
                          handleAddParagraph(pageEntries[0].globalIndex - 1, pageNum, 'table')
                        }
                        className="flex items-center space-x-1 px-2 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 text-xs font-medium rounded-md transition-colors"
                        title="Insert Table"
                      >
                        <TableIcon className="w-3 h-3" />
                        <span>Table</span>
                      </button>

                      <button
                        onClick={() =>
                          handleAddParagraph(pageEntries[0].globalIndex - 1, pageNum, 'h1')
                        }
                        className="flex items-center space-x-1 px-2 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 text-xs font-medium rounded-md transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Heading</span>
                      </button>
                    </div>
                  </div>

                  {/* Paragraph Items on this page */}
                  <div className="space-y-3">
                    {pageEntries.map(({ globalIndex, para }) => (
                      <div
                        key={para.id}
                        className="group relative border border-transparent hover:border-[#0071e3]/30 hover:bg-[#0071e3]/5 p-2 rounded-xl transition-all"
                      >
                        {/* Floating Style Controls on hover */}
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-3.5 right-2 bg-white border border-black/10 shadow-md rounded-lg px-1.5 py-0.5 flex items-center space-x-0.5 text-xs z-10 transition-opacity">
                          {para.type !== 'image' && (
                            <>
                              <button
                                onClick={() => handleTypeChange(para.id, 'h1')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'h1' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Heading 1"
                              >
                                <Heading1 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'h2')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'h2' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Heading 2"
                              >
                                <Heading2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'h3')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'h3' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Heading 3"
                              >
                                <Heading3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'p')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'p' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Paragraph"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'bullet')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'bullet' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Bullet List"
                              >
                                <List className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'numbered')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'numbered' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Numbered List"
                              >
                                <ListOrdered className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleTypeChange(para.id, 'table')}
                                className={`p-1 rounded hover:bg-black/5 ${
                                  para.type === 'table' ? 'text-[#0071e3] font-bold' : 'text-slate-500'
                                }`}
                                title="Table"
                              >
                                <TableIcon className="w-3.5 h-3.5" />
                              </button>

                              <div className="w-[1px] h-3 bg-black/10 mx-0.5" />
                            </>
                          )}

                          <button
                            onClick={() => handleAddParagraph(globalIndex, pageNum, 'p')}
                            className="p-1 rounded hover:bg-black/5 text-[#0071e3]"
                            title="Insert paragraph below"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteParagraph(para.id)}
                            className="p-1 rounded hover:bg-black/5 text-[#ff3b30]"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* DIAGRAM / IMAGE VIEW WITH TESSERACT OCR */}
                        {para.type === 'image' && para.imageUrl && (
                          <div className="flex flex-col items-center py-2 space-y-2 bg-slate-50/70 border border-black/5 rounded-xl p-3">
                            <img
                              src={para.imageUrl}
                              alt={para.caption || 'Diagram'}
                              className="max-w-full max-h-[380px] object-contain rounded-lg border border-black/10 shadow-xs bg-white"
                            />
                            <div className="w-full flex items-center justify-between gap-2 pt-1 px-2">
                              <input
                                type="text"
                                value={para.caption || ''}
                                placeholder="Add figure caption..."
                                onChange={(e) => handleUpdateCaption(para.id, e.target.value)}
                                className="text-center text-xs italic text-slate-500 bg-transparent border-b border-dashed border-transparent hover:border-black/20 focus:border-[#0071e3] outline-none max-w-sm px-2 py-0.5"
                              />

                              <button
                                onClick={() => handleRunOcrOnDiagram(para, globalIndex)}
                                disabled={ocrLoadingId === para.id}
                                className="flex items-center space-x-1 px-2.5 py-1 bg-[#0071e3]/10 hover:bg-[#0071e3]/20 text-[#0071e3] text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                                title="Run Tesseract OCR on this image to convert to editable text"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>
                                  {ocrLoadingId === para.id
                                    ? `Recognizing... ${ocrProgress}%`
                                    : 'OCR (Image to Text)'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* TABLE VIEW (WITH FULL IMAGE-IN-CELL AND FORMATTING SUPPORT) */}
                        {para.type === 'table' && para.tableData && (
                          <div className="overflow-x-auto py-1">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Table ({para.tableData.length} × {para.tableData[0]?.length || 0})
                              </span>
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => handleAddTableRow(para.id)}
                                  className="text-[10px] font-medium px-1.5 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 rounded flex items-center space-x-0.5"
                                >
                                  <PlusCircle className="w-2.5 h-2.5" />
                                  <span>Row</span>
                                </button>
                                <button
                                  onClick={() => handleAddTableCol(para.id)}
                                  className="text-[10px] font-medium px-1.5 py-0.5 bg-black/5 hover:bg-black/10 text-slate-600 rounded flex items-center space-x-0.5"
                                >
                                  <PlusCircle className="w-2.5 h-2.5" />
                                  <span>Col</span>
                                </button>
                              </div>
                            </div>

                            <table className="w-full border-collapse border border-slate-200 text-xs rounded-lg overflow-hidden">
                              <tbody>
                                {para.tableData.map((row, rIdx) => (
                                  <tr
                                    key={`r-${rIdx}`}
                                    className={
                                      rIdx === 0 ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50/50'
                                    }
                                  >
                                    {row.map((cell, cIdx) => {
                                      const hasCellImage = cell.includes('data:image/');
                                      const imgUrlMatch = cell.match(/data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/);
                                      const cellTextOnly = cell.replace(/!\[.*?\]\(.*?\)|data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/, '').trim();

                                      return (
                                        <td
                                          key={`c-${rIdx}-${cIdx}`}
                                          className="border border-slate-200 p-1.5 relative group/cell"
                                        >
                                          {/* Render Cell Image Thumbnail if exists */}
                                          {hasCellImage && imgUrlMatch && (
                                            <div className="relative mb-1.5 p-1 bg-white border border-black/10 rounded-md max-w-fit">
                                              <img
                                                src={imgUrlMatch[0]}
                                                alt="Cell Figure"
                                                className="max-h-20 max-w-full object-contain rounded"
                                              />
                                              <button
                                                onClick={() => handleRemoveCellImage(para.id, rIdx, cIdx)}
                                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-xs hover:bg-red-600"
                                                title="Remove cell image"
                                              >
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </button>
                                            </div>
                                          )}

                                          <div className="flex items-center space-x-1">
                                            <input
                                              type="text"
                                              value={cellTextOnly || (hasCellImage ? '' : cell)}
                                              onFocus={() =>
                                                setActiveElementInfo({
                                                  paraId: para.id,
                                                  isTableCell: true,
                                                  rowIdx: rIdx,
                                                  colIdx: cIdx,
                                                })
                                              }
                                              onKeyDown={(e) => handleKeyDown(e, para.id)}
                                              onChange={(e) => {
                                                const newText = hasCellImage && imgUrlMatch
                                                  ? `![img](${imgUrlMatch[0]}) ${e.target.value}`
                                                  : e.target.value;
                                                handleUpdateTableCell(para.id, rIdx, cIdx, newText);
                                              }}
                                              className="w-full bg-transparent border-0 outline-none text-slate-800 text-xs focus:ring-1 focus:ring-[#0071e3] rounded px-1"
                                            />

                                            {/* Button to insert image into cell */}
                                            <button
                                              onClick={() => {
                                                setTargetCellCoords({ paraId: para.id, rowIdx: rIdx, colIdx: cIdx });
                                                cellFileInputRef.current?.click();
                                              }}
                                              className="opacity-0 group-hover/cell:opacity-100 p-0.5 hover:bg-black/5 text-slate-400 hover:text-[#0071e3] rounded transition-opacity"
                                              title="Insert image into cell"
                                            >
                                              <ImageIcon className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                      );
                                    })}
                                    {para.tableData!.length > 1 && (
                                      <td className="w-5 border-0 text-center">
                                        <button
                                          onClick={() => handleDeleteTableRow(para.id, rIdx)}
                                          className="text-slate-300 hover:text-[#ff3b30] p-0.5"
                                          title="Delete row"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* HEADING 1 */}
                        {para.type === 'h1' && (
                          <textarea
                            ref={(el) => {
                              if (el) textareaRefs.current.set(para.id, el);
                              else textareaRefs.current.delete(para.id);
                            }}
                            rows={1}
                            value={para.text}
                            onFocus={() => setActiveElementInfo({ paraId: para.id })}
                            onKeyDown={(e) => handleKeyDown(e, para.id)}
                            onChange={(e) => handleUpdateParagraph(para.id, e.target.value)}
                            className="w-full bg-transparent text-xl font-bold text-[#1d1d1f] border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                          />
                        )}

                        {/* HEADING 2 */}
                        {para.type === 'h2' && (
                          <textarea
                            ref={(el) => {
                              if (el) textareaRefs.current.set(para.id, el);
                              else textareaRefs.current.delete(para.id);
                            }}
                            rows={1}
                            value={para.text}
                            onFocus={() => setActiveElementInfo({ paraId: para.id })}
                            onKeyDown={(e) => handleKeyDown(e, para.id)}
                            onChange={(e) => handleUpdateParagraph(para.id, e.target.value)}
                            className="w-full bg-transparent text-base font-semibold text-[#1d1d1f] border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                          />
                        )}

                        {/* HEADING 3 */}
                        {para.type === 'h3' && (
                          <textarea
                            ref={(el) => {
                              if (el) textareaRefs.current.set(para.id, el);
                              else textareaRefs.current.delete(para.id);
                            }}
                            rows={1}
                            value={para.text}
                            onFocus={() => setActiveElementInfo({ paraId: para.id })}
                            onKeyDown={(e) => handleKeyDown(e, para.id)}
                            onChange={(e) => handleUpdateParagraph(para.id, e.target.value)}
                            className="w-full bg-transparent text-sm font-semibold text-[#1d1d1f] border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                          />
                        )}

                        {/* BULLET LIST */}
                        {para.type === 'bullet' && (
                          <div className="flex items-start space-x-2 pl-2">
                            <span className="text-[#0071e3] font-bold mt-1 text-base select-none">•</span>
                            <textarea
                              ref={(el) => {
                                if (el) textareaRefs.current.set(para.id, el);
                                else textareaRefs.current.delete(para.id);
                              }}
                              rows={1}
                              value={para.text.replace(/^[-•*▪◦–—■►✔✓]\s*/, '')}
                              onFocus={() => setActiveElementInfo({ paraId: para.id })}
                              onKeyDown={(e) => handleKeyDown(e, para.id)}
                              onChange={(e) => handleUpdateParagraph(para.id, '• ' + e.target.value)}
                              className="w-full bg-transparent text-sm leading-relaxed text-slate-700 border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                            />
                          </div>
                        )}

                        {/* NUMBERED LIST */}
                        {para.type === 'numbered' && (
                          <div className="flex items-start space-x-2 pl-2">
                            <span className="text-[#0071e3] font-semibold text-xs mt-1 shrink-0 bg-blue-50/80 border border-blue-200/50 px-1.5 py-0.5 rounded-md select-none">
                              {para.text.match(
                                /^(\d+(\.\d+)*[\.\)]|\([0-9a-zA-Z]+\)(\([0-9a-zA-Z]+\))*|[a-zA-Z][\.\)]|\[[0-9a-zA-Z\s:]+\]|[ivxlcdmIVXLCDM]+[\.\)]|\d+\s*\([a-z0-9]+\))/i
                              )?.[0] || '1.'}
                            </span>
                            <textarea
                              ref={(el) => {
                                if (el) textareaRefs.current.set(para.id, el);
                                else textareaRefs.current.delete(para.id);
                              }}
                              rows={1}
                              value={para.text.replace(
                                /^(\d+(\.\d+)*[\.\)]|\([0-9a-zA-Z]+\)(\([0-9a-zA-Z]+\))*|[a-zA-Z][\.\)]|\[[0-9a-zA-Z\s:]+\]|[ivxlcdmIVXLCDM]+[\.\)]|\d+\s*\([a-z0-9]+\))\s*/i,
                                ''
                              )}
                              onFocus={() => setActiveElementInfo({ paraId: para.id })}
                              onKeyDown={(e) => handleKeyDown(e, para.id)}
                              onChange={(e) => {
                                const prefix =
                                  para.text.match(
                                    /^(\d+(\.\d+)*[\.\)]|\([0-9a-zA-Z]+\)(\([0-9a-zA-Z]+\))*|[a-zA-Z][\.\)]|\[[0-9a-zA-Z\s:]+\]|[ivxlcdmIVXLCDM]+[\.\)]|\d+\s*\([a-z0-9]+\))\s*/i
                                  )?.[0] || '1. ';
                                handleUpdateParagraph(para.id, prefix + e.target.value);
                              }}
                              className="w-full bg-transparent text-sm leading-relaxed text-slate-700 border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                            />
                          </div>
                        )}

                        {/* STANDARD PARAGRAPH */}
                        {para.type === 'p' && (
                          <textarea
                            ref={(el) => {
                              if (el) textareaRefs.current.set(para.id, el);
                              else textareaRefs.current.delete(para.id);
                            }}
                            rows={1}
                            value={para.text}
                            onFocus={() => setActiveElementInfo({ paraId: para.id })}
                            onKeyDown={(e) => handleKeyDown(e, para.id)}
                            onChange={(e) => handleUpdateParagraph(para.id, e.target.value)}
                            className="w-full bg-transparent text-sm leading-relaxed text-slate-700 border-0 outline-none resize-none overflow-hidden focus:ring-1 focus:ring-[#0071e3] rounded p-1"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocStudio;
