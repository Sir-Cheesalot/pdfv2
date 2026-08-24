import { useState, useCallback, useRef } from 'react';
import type {
  PageInfo,
  Annotation,
  PdfMetadata,
  WatermarkConfig,
  EditorMode,
  RebuiltPage,
  RebuiltTextElement,
} from '../types/pdf';
import { PdfService } from '../services/pdfService';
import { PdfRenderService } from '../services/pdfRenderService';
import { PdfRebuildService } from '../services/pdfRebuildService';
import confetti from 'canvas-confetti';

export interface HistoryState {
  pages: PageInfo[];
  annotations: Record<number, Annotation[]>;
}

export function usePdfDocument() {
  const [docId, setDocId] = useState<string>('');
  const [fileName, setFileName] = useState<string>('document.pdf');
  const [fileSize, setFileSize] = useState<number>(0);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [metadata, setMetadata] = useState<PdfMetadata>({});
  const [watermark, setWatermark] = useState<WatermarkConfig | null>(null);
  const [rebuiltPages, setRebuiltPages] = useState<any[]>([]);

  const [mode, setMode] = useState<EditorMode>('doc');
  const [zoom, setZoom] = useState<number>(1.25);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Undo / Redo history
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUpdatingHistory = useRef(false);

  const pushHistory = useCallback((newPages: PageInfo[], newAnnotations: Record<number, Annotation[]>) => {
    if (isUpdatingHistory.current) return;
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, { pages: JSON.parse(JSON.stringify(newPages)), annotations: JSON.parse(JSON.stringify(newAnnotations)) }];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUpdatingHistory.current = true;
      const targetState = history[historyIndex - 1];
      setPages(JSON.parse(JSON.stringify(targetState.pages)));
      setAnnotations(JSON.parse(JSON.stringify(targetState.annotations)));
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => {
        isUpdatingHistory.current = false;
      }, 50);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUpdatingHistory.current = true;
      const targetState = history[historyIndex + 1];
      setPages(JSON.parse(JSON.stringify(targetState.pages)));
      setAnnotations(JSON.parse(JSON.stringify(targetState.annotations)));
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => {
        isUpdatingHistory.current = false;
      }, 50);
    }
  }, [history, historyIndex]);

  /**
   * Load PDF from file or Uint8Array
   */
  const loadPdfDocument = useCallback(async (file: File | Uint8Array, name?: string) => {
    setIsLoading(true);
    setStatusMessage('Reading PDF file...');
    try {
      let bytes: Uint8Array;
      let fName = name || 'document.pdf';
      let fSize = 0;

      if (file instanceof File) {
        fName = file.name;
        fSize = file.size;
        const arrayBuffer = await file.arrayBuffer();
        bytes = new Uint8Array(arrayBuffer);
      } else {
        bytes = file;
        fSize = bytes.byteLength;
      }

      const newDocId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      PdfRenderService.invalidateCache();

      const { pages: loadedPages, metadata: loadedMeta } = await PdfService.loadPdf(bytes);

      setDocId(newDocId);
      setFileName(fName);
      setFileSize(fSize);
      setPdfBytes(bytes);
      setPages(loadedPages);
      setActivePageIndex(0);
      setAnnotations({});
      setMetadata(loadedMeta);
      setWatermark(null);
      setMode('doc');

      // Initialize history
      setHistory([{ pages: loadedPages, annotations: {} }]);
      setHistoryIndex(0);
      setStatusMessage('');
    } catch (err: unknown) {
      console.error('Failed to load PDF:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setStatusMessage(`Error loading PDF: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Quick-load demo sample PDF
   */
  const loadSamplePdf = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage('Loading demo practice exam PDF...');
    try {
      const response = await fetch('/sample.pdf');
      if (!response.ok) throw new Error('Sample PDF not found');
      const arrayBuffer = await response.arrayBuffer();
      await loadPdfDocument(new Uint8Array(arrayBuffer), 'Practice_Exam_Sample.pdf');
    } catch (err) {
      console.error('Failed to load sample:', err);
      // Fallback create blank PDF
      const blank = await PdfService.createBlankPdf();
      await loadPdfDocument(blank, 'Blank_Document.pdf');
    } finally {
      setIsLoading(false);
    }
  }, [loadPdfDocument]);

  /**
   * Page Reorder (Spice)
   */
  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      // Re-index
      const reindexed = updated.map((p, idx) => ({ ...p, pageIndex: idx }));

      // Remap annotations
      setAnnotations((prevAnn) => {
        const newAnn: Record<number, Annotation[]> = {};
        const oldFromAnn = prevAnn[fromIndex] || [];
        // Shift keys
        Object.keys(prevAnn).forEach((keyStr) => {
          const k = parseInt(keyStr, 10);
          if (k !== fromIndex) {
            let targetK = k;
            if (fromIndex < toIndex && k > fromIndex && k <= toIndex) {
              targetK = k - 1;
            } else if (fromIndex > toIndex && k >= toIndex && k < fromIndex) {
              targetK = k + 1;
            }
            newAnn[targetK] = prevAnn[k];
          }
        });
        if (oldFromAnn.length > 0) {
          newAnn[toIndex] = oldFromAnn;
        }
        pushHistory(reindexed, newAnn);
        return newAnn;
      });

      return reindexed;
    });
  }, [pushHistory]);

  /**
   * Rotate a specific page by 90 degrees
   */
  const rotatePage = useCallback((index: number, angleDiff: number = 90) => {
    setPages((prev) => {
      const updated = prev.map((p, idx) => {
        if (idx === index) {
          const newRot = (p.rotation + angleDiff + 360) % 360;
          return { ...p, rotation: newRot };
        }
        return p;
      });
      pushHistory(updated, annotations);
      return updated;
    });
  }, [annotations, pushHistory]);

  /**
   * Rotate all pages
   */
  const rotateAllPages = useCallback((angleDiff: number = 90) => {
    setPages((prev) => {
      const updated = prev.map((p) => ({
        ...p,
        rotation: (p.rotation + angleDiff + 360) % 360,
      }));
      pushHistory(updated, annotations);
      return updated;
    });
  }, [annotations, pushHistory]);

  /**
   * Delete a specific page
   */
  const deletePage = useCallback((index: number) => {
    setPages((prev) => {
      if (prev.length <= 1) {
        alert('Cannot delete the only page of the document.');
        return prev;
      }
      const updated = prev.filter((_, idx) => idx !== index).map((p, idx) => ({ ...p, pageIndex: idx }));
      
      setAnnotations((prevAnn) => {
        const newAnn: Record<number, Annotation[]> = {};
        Object.keys(prevAnn).forEach((keyStr) => {
          const k = parseInt(keyStr, 10);
          if (k < index) {
            newAnn[k] = prevAnn[k];
          } else if (k > index) {
            newAnn[k - 1] = prevAnn[k];
          }
        });
        pushHistory(updated, newAnn);
        return newAnn;
      });

      if (activePageIndex >= updated.length) {
        setActivePageIndex(Math.max(0, updated.length - 1));
      }

      return updated;
    });
  }, [activePageIndex, pushHistory]);

  /**
   * Duplicate a page
   */
  const duplicatePage = useCallback((index: number) => {
    setPages((prev) => {
      const pageToDup = prev[index];
      const newPage: PageInfo = {
        ...pageToDup,
        id: `page-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      const updated = [...prev];
      updated.splice(index + 1, 0, newPage);
      const reindexed = updated.map((p, idx) => ({ ...p, pageIndex: idx }));

      setAnnotations((prevAnn) => {
        const newAnn: Record<number, Annotation[]> = {};
        Object.keys(prevAnn).forEach((keyStr) => {
          const k = parseInt(keyStr, 10);
          if (k <= index) {
            newAnn[k] = prevAnn[k];
          } else {
            newAnn[k + 1] = prevAnn[k];
          }
        });
        // Copy annotations of duplicated page
        if (prevAnn[index]) {
          newAnn[index + 1] = JSON.parse(JSON.stringify(prevAnn[index])).map((a: Annotation) => ({
            ...a,
            id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          }));
        }
        pushHistory(reindexed, newAnn);
        return newAnn;
      });

      return reindexed;
    });
  }, [pushHistory]);

  /**
   * Insert blank page at index
   */
  const insertBlankPage = useCallback((atIndex: number, width: number = 595.28, height: number = 841.89) => {
    setPages((prev) => {
      const newPage: PageInfo = {
        id: `blank-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        pageIndex: atIndex,
        originalPageIndex: 0,
        rotation: 0,
        width,
        height,
        isBlank: true,
      };
      const updated = [...prev];
      updated.splice(atIndex, 0, newPage);
      const reindexed = updated.map((p, idx) => ({ ...p, pageIndex: idx }));

      setAnnotations((prevAnn) => {
        const newAnn: Record<number, Annotation[]> = {};
        Object.keys(prevAnn).forEach((keyStr) => {
          const k = parseInt(keyStr, 10);
          if (k < atIndex) {
            newAnn[k] = prevAnn[k];
          } else {
            newAnn[k + 1] = prevAnn[k];
          }
        });
        pushHistory(reindexed, newAnn);
        return newAnn;
      });

      return reindexed;
    });
  }, [pushHistory]);

  /**
   * Insert pages from an external PDF file at target index
   */
  const insertExternalPages = useCallback(async (fileBytes: Uint8Array, atIndex: number) => {
    setIsProcessing(true);
    try {
      const { pages: extPages } = await PdfService.loadPdf(fileBytes);
      const pagesToInsert: PageInfo[] = extPages.map((p) => ({
        ...p,
        id: `ext-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        customBytes: fileBytes,
      }));

      setPages((prev) => {
        const updated = [...prev];
        updated.splice(atIndex, 0, ...pagesToInsert);
        const reindexed = updated.map((p, idx) => ({ ...p, pageIndex: idx }));

        setAnnotations((prevAnn) => {
          const shift = pagesToInsert.length;
          const newAnn: Record<number, Annotation[]> = {};
          Object.keys(prevAnn).forEach((keyStr) => {
            const k = parseInt(keyStr, 10);
            if (k < atIndex) {
              newAnn[k] = prevAnn[k];
            } else {
              newAnn[k + shift] = prevAnn[k];
            }
          });
          pushHistory(reindexed, newAnn);
          return newAnn;
        });

        return reindexed;
      });
    } catch (err) {
      console.error('Failed to insert external pages:', err);
      alert('Error reading PDF file to insert.');
    } finally {
      setIsProcessing(false);
    }
  }, [pushHistory]);

  /**
   * Update annotations for active page
   */
  const updatePageAnnotations = useCallback((pageIdx: number, newPageAnnotations: Annotation[]) => {
    setAnnotations((prev) => {
      const updated = {
        ...prev,
        [pageIdx]: newPageAnnotations,
      };
      pushHistory(pages, updated);
      return updated;
    });
  }, [pages, pushHistory]);

  /**
   * Export / Download final baked PDF
   */
  const exportBakedPdf = useCallback(async (downloadName?: string) => {
    if (!pdfBytes) return;
    setIsProcessing(true);
    setStatusMessage('Baking vector annotations & compiling PDF...');
    try {
      const bakedBytes = await PdfService.bakeDocument(
        pdfBytes,
        pages,
        annotations,
        watermark,
        metadata
      );

      const blob = new Blob([bakedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName || (fileName.replace(/\.pdf$/i, '') + '_edited.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Trigger celebratory confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error('Failed to export baked PDF:', err);
      alert('Failed to export PDF: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  }, [pdfBytes, pages, annotations, watermark, metadata, fileName]);

  const updatePageTextInStream = useCallback(
    async (
      pageIndex: number,
      originalText: string,
      newText: string,
      coords?: { x: number; y: number; fontSize: number; fontName?: string }
    ) => {
      if (!pdfBytes) return;
      try {
        const updated = await PdfService.rewritePageTextStream(
          pdfBytes,
          pageIndex,
          originalText,
          newText,
          coords
        );
        PdfRenderService.invalidateCache(docId);
        setPdfBytes(updated);
      } catch (err) {
        console.error('Error rewriting PDF text stream:', err);
      }
    },
    [pdfBytes, docId]
  );

  const updateRebuiltTextElement = useCallback(
    (pageIndex: number, elemId: string, newText: string, updates?: Partial<RebuiltTextElement>) => {
      setRebuiltPages((prev) =>
        prev.map((p) => {
          if (p.pageIndex === pageIndex) {
            const updatedTexts = p.textElements.map((t: RebuiltTextElement) =>
              t.id === elemId ? { ...t, text: newText, ...updates } : t
            );
            return { ...p, textElements: updatedTexts };
          }
          return p;
        })
      );
    },
    []
  );

  const deleteRebuiltTextElement = useCallback((pageIndex: number, elemId: string) => {
    setRebuiltPages((prev) =>
      prev.map((p) => {
        if (p.pageIndex === pageIndex) {
          return {
            ...p,
            textElements: p.textElements.filter((t: RebuiltTextElement) => t.id !== elemId),
          };
        }
        return p;
      })
    );
  }, []);

  const exportRebuiltPdf = useCallback(
    async (downloadName?: string) => {
      if (rebuiltPages.length === 0 && !pdfBytes) return;
      setIsProcessing(true);
      setStatusMessage('Rebuilding clean vector PDF...');
      try {
        let pagesToCompile = rebuiltPages;
        if (pagesToCompile.length === 0 && pdfBytes) {
          pagesToCompile = await PdfRebuildService.parsePdfToRebuiltPages(pdfBytes);
        }

        const outBytes = await PdfRebuildService.compileRebuiltPagesToPdf(pagesToCompile, fileName);
        const blob = new Blob([outBytes as any], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName || fileName.replace(/\.pdf$/i, '') + '_rebuilt.pdf';
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
        console.error('Failed to export rebuilt PDF:', err);
        alert('Failed to rebuild PDF: ' + (err as Error).message);
      } finally {
        setIsProcessing(false);
        setStatusMessage('');
      }
    },
    [rebuiltPages, pdfBytes, fileName]
  );

  return {
    docId,
    fileName,
    fileSize,
    pdfBytes,
    pages,
    rebuiltPages,
    activePageIndex,
    annotations,
    metadata,
    watermark,
    mode,
    zoom,
    isLoading,
    isProcessing,
    statusMessage,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,

    setFileName,
    setActivePageIndex,
    setMode,
    setZoom,
    setWatermark,
    setMetadata,
    setRebuiltPages,
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
    updatePageTextInStream,
    updateRebuiltTextElement,
    deleteRebuiltTextElement,
    exportRebuiltPdf,
    exportBakedPdf,
    undo,
    redo,
  };
}
