'use client';

import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { ToolType, Annotation, RedactAnnotation, TextAnnotation } from './types/pdf';
import { usePdfDocument } from './hooks/usePdfDocument';
import { Navbar } from './components/common/Navbar';
import { ThumbnailSidebar } from './components/sidebar/ThumbnailSidebar';
import { AnnotationToolbar } from './components/editor/AnnotationToolbar';
import { PropertyBar } from './components/editor/PropertyBar';
import { CanvasEditor } from './components/editor/CanvasEditor';
import { SignatureModal } from './components/editor/SignatureModal';
import { StampModal } from './components/editor/StampModal';
import { WatermarkModal } from './components/editor/WatermarkModal';
import { MetadataModal } from './components/metadata/MetadataModal';
import { FindReplaceModal } from './components/editor/FindReplaceModal';
import { OrganizeGrid } from './components/organize/OrganizeGrid';
import { MergeStudio } from './components/merge/MergeStudio';
import { SplitStudio } from './components/split/SplitStudio';
import { DocStudio } from './components/doc/DocStudio';
import { PdfRenderService } from './services/pdfRenderService';

export const App: React.FC = () => {
  const {
    docId,
    fileName,
    fileSize,
    pdfBytes,
    pages,
    activePageIndex,
    annotations,
    metadata,
    watermark,
    mode,
    zoom,
    isLoading,
    isProcessing,
    statusMessage,
    canUndo,
    canRedo,

    setActivePageIndex,
    setMode,
    setZoom,
    setWatermark,
    setMetadata,
    loadPdfDocument,
    loadSamplePdf,
    reorderPages,
    rotatePage,
    rotateAllPages,
    deletePage,
    duplicatePage,
    insertBlankPage,
    insertExternalPages,
    updatePageAnnotations,
    exportBakedPdf,
    undo,
    redo,
  } = usePdfDocument();

  // Active Tool & Style State
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [currentColor, setCurrentColor] = useState<string>('#0071e3');
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState<number>(3);
  const [currentFontSize, setCurrentFontSize] = useState<number>(16);
  const [currentFontFamily, setCurrentFontFamily] = useState<string>('Helvetica');
  const [currentOpacity, setCurrentOpacity] = useState<number>(1.0);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Modals
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isStampModalOpen, setIsStampModalOpen] = useState(false);
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isFindReplaceModalOpen, setIsFindReplaceModalOpen] = useState(false);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          await loadPdfDocument(file);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [loadPdfDocument]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadPdfDocument(file);
    }
  };

  // Insert Image / Signature / Stamp
  const handleInsertImageAnnotation = (dataUrl: string, label?: string) => {
    const activePage = pages[activePageIndex];
    const pageWidth = activePage ? activePage.width : 595;
    const pageHeight = activePage ? activePage.height : 842;

    const newImageAnn: Annotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pageIndex: activePageIndex,
      type: label === 'signature' ? 'signature' : label === 'stamp' ? 'stamp' : 'image',
      x: pageWidth / 2 - 90,
      y: pageHeight / 2 - 40,
      width: 180,
      height: 80,
      dataUrl,
      opacity: currentOpacity,
    };

    const currentAnnList = annotations[activePageIndex] || [];
    updatePageAnnotations(activePageIndex, [...currentAnnList, newImageAnn]);
    setSelectedAnnotationId(newImageAnn.id);
    setActiveTool('select');
  };

  // Find & Replace text across all pages in PDF
  const handleReplaceAllInPdf = async (
    findText: string,
    replaceText: string,
    matchCase: boolean
  ) => {
    if (!pdfBytes) return;
    try {
      const docProxy = await PdfRenderService.loadDocument(docId, pdfBytes);
      let matchCount = 0;

      for (let p = 0; p < pages.length; p++) {
        const textItems = await PdfRenderService.extractPageTextItems(docProxy, p + 1);
        const pageAnnsToAdd: Annotation[] = [];

        for (const item of textItems) {
          const itemText = matchCase ? item.str : item.str.toLowerCase();
          const targetFind = matchCase ? findText : findText.toLowerCase();

          if (itemText.includes(targetFind)) {
            matchCount++;
            const replaced = item.str.replace(
              new RegExp(findText, matchCase ? 'g' : 'gi'),
              replaceText
            );

            // 1. Mask original text
            const mask: RedactAnnotation = {
              id: `mask-find-${p}-${item.id}-${Date.now()}`,
              pageIndex: p,
              type: 'redact',
              x: item.x - 2,
              y: item.y - 2,
              width: Math.max(item.width + 4, 30),
              height: Math.max(item.height + 4, 16),
              color: '#ffffff',
            };

            // 2. Add replaced text on top
            const newTextAnn: TextAnnotation = {
              id: `text-find-${p}-${item.id}-${Date.now()}`,
              pageIndex: p,
              type: 'text',
              x: item.x,
              y: item.y,
              width: Math.max(item.width + 4, 30),
              height: item.height,
              text: replaced,
              fontSize: item.fontSize,
              fontFamily: 'Helvetica',
              color: '#000000',
              opacity: 1,
            };

            pageAnnsToAdd.push(mask, newTextAnn);
          }
        }

        if (pageAnnsToAdd.length > 0) {
          const existing = annotations[p] || [];
          updatePageAnnotations(p, [...existing, ...pageAnnsToAdd]);
        }
      }

      alert(`Replaced ${matchCount} occurrence(s) in document.`);
    } catch (err) {
      console.error('Error replacing text:', err);
      alert('Error searching PDF: ' + (err as Error).message);
    }
  };

  // Annotation property handlers for selected annotation
  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId) {
            if (a.type === 'text') return { ...a, color };
            if (a.type === 'draw' || a.type === 'highlight') return { ...a, strokeColor: color };
            if (a.type === 'rectangle' || a.type === 'circle' || a.type === 'line' || a.type === 'arrow') {
              return { ...a, strokeColor: color };
            }
            if (a.type === 'redact') return { ...a, color };
          }
          return a;
        })
      );
    }
  };

  const handleStrokeWidthChange = (width: number) => {
    setCurrentStrokeWidth(width);
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && 'strokeWidth' in a) {
            return { ...a, strokeWidth: width };
          }
          return a;
        })
      );
    }
  };

  const handleFontSizeChange = (fontSize: number) => {
    setCurrentFontSize(fontSize);
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && a.type === 'text') {
            return { ...a, fontSize };
          }
          return a;
        })
      );
    }
  };

  const handleFontFamilyChange = (fontFamily: string) => {
    setCurrentFontFamily(fontFamily);
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && a.type === 'text') {
            return {
              ...a,
              fontFamily: fontFamily as 'Helvetica' | 'TimesRoman' | 'Courier' | 'Arial',
            };
          }
          return a;
        })
      );
    }
  };

  const handleOpacityChange = (opacity: number) => {
    setCurrentOpacity(opacity);
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => (a.id === selectedAnnotationId ? { ...a, opacity } : a))
      );
    }
  };

  const handleToggleBold = () => {
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && a.type === 'text') {
            return { ...a, bold: !a.bold };
          }
          return a;
        })
      );
    }
  };

  const handleToggleItalic = () => {
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && a.type === 'text') {
            return { ...a, italic: !a.italic };
          }
          return a;
        })
      );
    }
  };

  const handleAlignChange = (align: 'left' | 'center' | 'right') => {
    if (selectedAnnotationId) {
      const currentList = annotations[activePageIndex] || [];
      updatePageAnnotations(
        activePageIndex,
        currentList.map((a) => {
          if (a.id === selectedAnnotationId && a.type === 'text') {
            return { ...a, align };
          }
          return a;
        })
      );
    }
  };

  const handleDeleteSelectedAnnotation = (id?: string) => {
    const targetId = id || selectedAnnotationId;
    if (!targetId) return;
    const currentList = annotations[activePageIndex] || [];
    updatePageAnnotations(
      activePageIndex,
      currentList.filter((a) => a.id !== targetId)
    );
    setSelectedAnnotationId(null);
  };

  const handleDuplicateSelectedAnnotation = () => {
    if (!selectedAnnotationId) return;
    const currentList = annotations[activePageIndex] || [];
    const item = currentList.find((a) => a.id === selectedAnnotationId);
    if (!item) return;

    const newItem: Annotation = {
      ...JSON.parse(JSON.stringify(item)),
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      x: item.x + 20,
      y: item.y + 20,
    };
    updatePageAnnotations(activePageIndex, [...currentList, newItem]);
    setSelectedAnnotationId(newItem.id);
  };

  const handleBringToFront = () => {
    if (!selectedAnnotationId) return;
    const currentList = annotations[activePageIndex] || [];
    const item = currentList.find((a) => a.id === selectedAnnotationId);
    if (!item) return;
    const rest = currentList.filter((a) => a.id !== selectedAnnotationId);
    updatePageAnnotations(activePageIndex, [...rest, item]);
  };

  const handleSendToBack = () => {
    if (!selectedAnnotationId) return;
    const currentList = annotations[activePageIndex] || [];
    const item = currentList.find((a) => a.id === selectedAnnotationId);
    if (!item) return;
    const rest = currentList.filter((a) => a.id !== selectedAnnotationId);
    updatePageAnnotations(activePageIndex, [item, ...rest]);
  };

  const selectedAnnotation =
    annotations[activePageIndex]?.find((a) => a.id === selectedAnnotationId) || null;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f5f5f7] text-[#1d1d1f] overflow-hidden select-none font-sans">
      {/* Top Navbar */}
      <Navbar
        fileName={fileName}
        mode={mode}
        zoom={zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        isProcessing={isProcessing || isLoading}
        hasDocument={!!pdfBytes}
        pageCount={pages.length}
        activePageIndex={activePageIndex}
        onSelectMode={setMode}
        onZoomChange={setZoom}
        onUndo={undo}
        onRedo={redo}
        onExport={() => exportBakedPdf()}
        onOpenWatermark={() => setIsWatermarkModalOpen(true)}
        onOpenMetadata={() => setIsMetadataModalOpen(true)}
        onLoadSample={loadSamplePdf}
        onUploadFile={handleFileUpload}
      />

      {/* DOCKED TOP TOOLBAR (Zero Canvas Overlap) */}
      {pdfBytes && mode === 'edit' && (
        <div className="bg-white/95 backdrop-blur-xl border-b border-black/10 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0 shadow-xs">
          <AnnotationToolbar
            activeTool={activeTool}
            onSelectTool={(tool) => {
              setActiveTool(tool);
              if (tool !== 'select') setSelectedAnnotationId(null);
            }}
            onOpenSignature={() => setIsSignatureModalOpen(true)}
            onOpenStamp={() => setIsStampModalOpen(true)}
            onOpenFindReplace={() => setIsFindReplaceModalOpen(true)}
            onInsertImage={(url) => handleInsertImageAnnotation(url, 'image')}
          />

          {(selectedAnnotation ||
            activeTool === 'text' ||
            activeTool === 'draw' ||
            activeTool === 'highlight' ||
            activeTool === 'rectangle' ||
            activeTool === 'circle' ||
            activeTool === 'line' ||
            activeTool === 'arrow' ||
            activeTool === 'redact') && (
            <PropertyBar
              selectedAnnotation={selectedAnnotation}
              activeTool={activeTool}
              currentColor={currentColor}
              currentStrokeWidth={currentStrokeWidth}
              currentFontSize={currentFontSize}
              currentFontFamily={currentFontFamily}
              currentOpacity={currentOpacity}
              onColorChange={handleColorChange}
              onStrokeWidthChange={handleStrokeWidthChange}
              onFontSizeChange={handleFontSizeChange}
              onFontFamilyChange={handleFontFamilyChange}
              onOpacityChange={handleOpacityChange}
              onToggleBold={handleToggleBold}
              onToggleItalic={handleToggleItalic}
              onAlignChange={handleAlignChange}
              onDeleteSelected={() => handleDeleteSelectedAnnotation()}
              onDuplicateSelected={handleDuplicateSelectedAnnotation}
              onBringToFront={handleBringToFront}
              onSendToBack={handleSendToBack}
            />
          )}
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Loading Overlay */}
        {(isLoading || isProcessing) && (
          <div className="absolute inset-0 bg-[#f5f5f7]/80 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-2 border-slate-300 border-t-[#0071e3] rounded-full animate-spin" />
            <div className="text-xs font-medium text-slate-700">
              {statusMessage || 'Processing document...'}
            </div>
          </div>
        )}

        {/* 1. LANDING DROPZONE */}
        {!pdfBytes && mode !== 'merge' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#f5f5f7] overflow-y-auto">
            <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
              <div className="w-full bg-white border border-black/10 rounded-3xl p-10 flex flex-col items-center justify-center space-y-4 shadow-sm hover:border-black/20 transition-all">
                <div className="p-3 bg-[#0071e3]/10 text-[#0071e3] rounded-2xl">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">
                    Open a PDF document
                  </h3>
                  <p className="text-xs text-slate-500">Drag & drop your file here</p>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <label className="bg-[#0071e3] hover:bg-[#0077ED] text-white font-medium text-xs px-4 py-2 rounded-xl cursor-pointer shadow-xs transition-all active:scale-98">
                    <span>Browse File</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>

                  <button
                    onClick={loadSamplePdf}
                    className="bg-black/5 hover:bg-black/10 text-slate-700 font-medium text-xs px-3.5 py-2 rounded-xl transition-colors"
                  >
                    Try Sample
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. MODE: DOC MODE (CONVERT TO WORD / RICH TEXT) */}
        {pdfBytes && mode === 'doc' && (
          <DocStudio docId={docId} pdfBytes={pdfBytes} fileName={fileName} />
        )}

        {/* 3. MODE: MERGE STUDIO */}
        {mode === 'merge' && (
          <MergeStudio
            onMergeComplete={(bytes, name) => {
              loadPdfDocument(bytes, name);
              setMode('organize');
            }}
          />
        )}

        {/* 4. MODE: SPLIT STUDIO */}
        {pdfBytes && mode === 'split' && (
          <SplitStudio pdfBytes={pdfBytes} fileName={fileName} pages={pages} />
        )}

        {/* 5. MODE: ORGANIZE & SPLICE STUDIO */}
        {pdfBytes && mode === 'organize' && (
          <OrganizeGrid
            docId={docId}
            pdfBytes={pdfBytes}
            pages={pages}
            fileName={fileName}
            onReorderPages={reorderPages}
            onRotatePage={rotatePage}
            onRotateAllPages={rotateAllPages}
            onDeletePage={deletePage}
            onDuplicatePage={duplicatePage}
            onInsertBlankPage={insertBlankPage}
            onInsertExternalPages={insertExternalPages}
            onSelectPageToEdit={(index) => {
              setActivePageIndex(index);
              setMode('edit');
            }}
          />
        )}

        {/* 6. MODE: EDIT & ANNOTATE STUDIO (CONTINUOUS MULTI-PAGE SCROLL) */}
        {pdfBytes && mode === 'edit' && (
          <>
            {/* Left Thumbnail Sidebar */}
            <ThumbnailSidebar
              docId={docId}
              pdfBytes={pdfBytes}
              pages={pages}
              activePageIndex={activePageIndex}
              onSelectPage={(idx) => {
                setActivePageIndex(idx);
                const el = document.getElementById(`page-wrapper-${idx}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              onRotatePage={rotatePage}
              onDeletePage={deletePage}
              onDuplicatePage={duplicatePage}
              onInsertBlankPage={(idx) => insertBlankPage(idx)}
            />

            {/* Center Canvas Viewport (Continuous Vertical Multi-Page Scroll) */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-[#e8e8ed]">
              <CanvasEditor
                docId={docId}
                pdfBytes={pdfBytes}
                pages={pages}
                activePageIndex={activePageIndex}
                zoom={zoom}
                activeTool={activeTool}
                currentColor={currentColor}
                currentStrokeWidth={currentStrokeWidth}
                currentFontSize={currentFontSize}
                currentFontFamily={currentFontFamily}
                currentOpacity={currentOpacity}
                annotations={annotations}
                watermark={watermark}
                selectedAnnotationId={selectedAnnotationId}
                onSelectPage={setActivePageIndex}
                onSelectAnnotation={setSelectedAnnotationId}
                onUpdateAnnotations={updatePageAnnotations}
                onDeleteAnnotation={handleDeleteSelectedAnnotation}
              />
            </div>
          </>
        )}
      </div>

      {/* MODALS */}
      <FindReplaceModal
        isOpen={isFindReplaceModalOpen}
        onClose={() => setIsFindReplaceModalOpen(false)}
        onReplaceAll={handleReplaceAllInPdf}
      />

      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSaveSignature={(dataUrl) => handleInsertImageAnnotation(dataUrl, 'signature')}
      />

      <StampModal
        isOpen={isStampModalOpen}
        onClose={() => setIsStampModalOpen(false)}
        onSelectStamp={(dataUrl) => handleInsertImageAnnotation(dataUrl, 'stamp')}
      />

      <WatermarkModal
        isOpen={isWatermarkModalOpen}
        watermark={watermark}
        onClose={() => setIsWatermarkModalOpen(false)}
        onSaveWatermark={setWatermark}
      />

      <MetadataModal
        isOpen={isMetadataModalOpen}
        metadata={metadata}
        fileName={fileName}
        fileSize={fileSize}
        pages={pages}
        activePageIndex={activePageIndex}
        pdfBytes={pdfBytes}
        onClose={() => setIsMetadataModalOpen(false)}
        onSaveMetadata={setMetadata}
      />
    </div>
  );
};

export default App;
