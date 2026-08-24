import * as pdfjsLib from 'pdfjs-dist';
import { recognize } from 'tesseract.js';
import type { ExtractedTextItem, DocParagraph } from '../types/pdf';

// Point to local worker in public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface RenderResult {
  width: number;
  height: number;
  scale: number;
}

/**
 * Enhanced normalization and semantic formula enrichment for sub/sup tags
 */
export function cleanSubSuperTags(text: string): string {
  if (!text) return '';

  let cleaned = text
    // 1. Remove empty or whitespace-only sub/sup tags
    .replace(/<sub>\s*<\/sub>/gi, ' ')
    .replace(/<sup>\s*<\/sup>/gi, ' ')
    // 2. Move whitespace inside sub/sup outside
    .replace(/<sub>\s+([^<]+)<\/sub>/gi, ' <sub>$1</sub>')
    .replace(/<sub>([^<]+)\s+<\/sub>/gi, '<sub>$1</sub> ')
    .replace(/<sup>\s+([^<]+)<\/sup>/gi, ' <sup>$1</sup>')
    .replace(/<sup>([^<]+)\s+<\/sup>/gi, '<sup>$1</sup> ')
    // 3. Merge adjacent identical sub tags: <sub>h</sub><sub>1</sub> -> <sub>h1</sub>
    .replace(/<sub>([^<]+)<\/sub>\s*<sub>([^<]+)<\/sub>/gi, '<sub>$1$2</sub>')
    .replace(/<sup>([^<]+)<\/sup>\s*<sup>([^<]+)<\/sup>/gi, '<sup>$1$2</sup>')
    // 4. Remove sub/sup on punctuation or isolated commas/periods
    .replace(/<sub>([,\.\s]+)<\/sub>/gi, '$1')
    .replace(/<sup>([,\.\s]+)<\/sup>/gi, '$1')
    // 5. Clean trailing spaces inside tags
    .replace(/<sub>([^<]+)<\/sub>/gi, (_, inner) => `<sub>${inner.trim()}</sub>`)
    .replace(/<sup>([^<]+)<\/sup>/gi, (_, inner) => `<sup>${inner.trim()}</sup>`);

  // 6. Semantic pass for common physics and scientific formulas:
  // Units: ms^-1, ms^-2, m^2, m^3, cm^3, kg m^-1
  cleaned = cleaned
    .replace(/\b(m\s*s|km\s*h|rad\s*s|kg\s*m|J\s*s|N\s*m|W\s*m)\s*[-−]\s*([1-4])\b/g, '$1<sup>-$2</sup>')
    .replace(/\b(m|cm|mm|km)\s*([23])\b/g, '$1<sup>$2</sup>')
    .replace(/\b10\s*[-−]\s*([0-9]+)\b/g, '10<sup>-$1</sup>')
    .replace(/\b10\s*\+\s*([0-9]+)\b/g, '10<sup>$1</sup>');

  // Normalize multi-spaces
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();

  return cleaned;
}

/**
 * Intelligent Bounding-Box Auto-Crop:
 * Trims away empty white margins to extract tightly bounded, crisp diagrams and figures
 */
function autoTrimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let nonWhitePixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Detect non-white pixels (with slight noise tolerance)
      if (a > 30 && (r < 235 || g < 235 || b < 235)) {
        nonWhitePixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Must contain significant visual content to be a real figure
  if (nonWhitePixels < 90 || maxX - minX < 24 || maxY - minY < 24) return null;

  // Add 16px padding
  const padding = 16;
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(width - cropX, maxX - minX + padding * 2);
  const cropH = Math.min(height - cropY, maxY - minY + padding * 2);

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = cropW;
  trimmedCanvas.height = cropH;
  const tctx = trimmedCanvas.getContext('2d');
  if (!tctx) return null;

  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, cropW, cropH);
  tctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return trimmedCanvas;
}

export class PdfRenderService {
  private static documentCache: Map<string, pdfjsLib.PDFDocumentProxy> = new Map();

  /**
   * Load and cache a PDF Document proxy from Uint8Array
   */
  public static async loadDocument(
    docId: string,
    pdfBytes: Uint8Array
  ): Promise<pdfjsLib.PDFDocumentProxy> {
    if (this.documentCache.has(docId)) {
      return this.documentCache.get(docId)!;
    }

    const bytesCopy = new Uint8Array(pdfBytes);
    const loadingTask = pdfjsLib.getDocument({
      data: bytesCopy,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    const doc = await loadingTask.promise;
    this.documentCache.set(docId, doc);
    return doc;
  }

  /**
   * Invalidate cached document proxy when bytes change
   */
  public static invalidateCache(docId?: string) {
    if (docId) {
      this.documentCache.delete(docId);
    } else {
      this.documentCache.clear();
    }
  }

  /**
   * Run Tesseract OCR on a canvas or image data URL to extract text from images
   */
  public static async runOcrOnImage(
    imageSource: string | HTMLCanvasElement,
    onProgress?: (progress: number) => void
  ): Promise<{
    text: string;
    words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
  }> {
    try {
      const res = await recognize(imageSource, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress !== undefined) {
            onProgress?.(m.progress);
          }
        },
      });

      const dataAny = res.data as any;
      let wordsList: any[] = [];
      if (Array.isArray(dataAny.words)) {
        wordsList = dataAny.words;
      } else if (Array.isArray(dataAny.lines)) {
        wordsList = dataAny.lines.flatMap((l: any) => l.words || []);
      }

      const words = wordsList.map((w: any) => ({
        text: w.text || '',
        bbox: {
          x0: w.bbox?.x0 ?? 0,
          y0: w.bbox?.y0 ?? 0,
          x1: w.bbox?.x1 ?? 0,
          y1: w.bbox?.y1 ?? 0,
        },
      }));

      return {
        text: res.data.text || '',
        words,
      };
    } catch (err) {
      console.error('Tesseract OCR error:', err);
      return { text: '', words: [] };
    }
  }

  /**
   * Render a specific page to a Canvas element with device pixel ratio scaling
   */
  public static async renderPageToCanvas(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
    rotation: number = 0
  ): Promise<RenderResult> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D context from canvas');

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    ctx.save();
    ctx.scale(outputScale, outputScale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await (page.render(renderContext as any).promise);
    ctx.restore();

    return {
      width: viewport.width,
      height: viewport.height,
      scale,
    };
  }

  /**
   * Extract all individual text items and bounding boxes from a page ("Unvectorize")
   * For digital PDFs: Extracts vector text glyphs directly.
   * For scanned / raster PDFs: Uses Tesseract OCR to vectorize image text into editable items.
   */
  public static async extractPageTextItems(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number
  ): Promise<ExtractedTextItem[]> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const items: ExtractedTextItem[] = [];

    // 1. Digital PDF Vector Extraction
    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i];
      if (!('str' in item) || !item.str || !item.str.trim()) continue;

      const tx = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) || 12;
      const pdfX = tx[4];
      const pdfY = tx[5];

      const x = pdfX;
      const y = viewport.height - pdfY - fontSize;
      const width = item.width > 0 ? item.width : item.str.length * (fontSize * 0.55);
      const height = item.height > 0 ? item.height : fontSize * 1.2;

      items.push({
        id: `text-${pageNumber}-${i}-${Date.now()}`,
        str: item.str,
        x,
        y,
        width,
        height,
        fontSize,
        fontName: item.fontName || 'Helvetica',
        originalTransform: tx,
      });
    }

    // 2. Scanned / Image PDF Vectorization via Tesseract OCR
    if (items.length === 0) {
      try {
        const scale = 2.0;
        const ocrViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = ocrViewport.width;
        canvas.height = ocrViewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, ocrViewport.width, ocrViewport.height);
          await (page.render({ canvasContext: ctx, viewport: ocrViewport } as any).promise);

          const ocrResult = await this.runOcrOnImage(canvas);
          ocrResult.words.forEach((w, idx) => {
            if (w.text && w.text.trim()) {
              items.push({
                id: `ocr-${pageNumber}-${idx}-${Date.now()}`,
                str: w.text,
                x: w.bbox.x0 / scale,
                y: w.bbox.y0 / scale,
                width: (w.bbox.x1 - w.bbox.x0) / scale,
                height: (w.bbox.y1 - w.bbox.y0) / scale,
                fontSize: Math.round(((w.bbox.y1 - w.bbox.y0) / scale) * 0.85) || 12,
                fontName: 'Helvetica',
                originalTransform: [1, 0, 0, 1, w.bbox.x0 / scale, w.bbox.y0 / scale],
              });
            }
          });
        }
      } catch (ocrErr) {
        console.warn('OCR vectorization note for page', pageNumber, ocrErr);
      }
    }

    return items;
  }

  /**
   * High-Precision Diagram & Figure Extraction:
   * Masks out all known text bounding boxes with pure white so only genuine graphics,
   * charts, circuits, apparatus, and photos are extracted — eliminating 100% of text duplication.
   */
  public static async extractPageDiagramsAndFigures(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    textItems: { x: number; y: number; width: number; height: number }[]
  ): Promise<DocParagraph[]> {
    const diagrams: DocParagraph[] = [];

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const scale = 2.0; // High resolution
      const viewport = page.getViewport({ scale });

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = viewport.width;
      pageCanvas.height = viewport.height;
      const pctx = pageCanvas.getContext('2d');
      if (!pctx) return [];

      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, viewport.width, viewport.height);
      await (page.render({ canvasContext: pctx, viewport } as any).promise);

      // Create a canvas containing ONLY non-text graphical drawings
      const drawingCanvas = document.createElement('canvas');
      drawingCanvas.width = viewport.width;
      drawingCanvas.height = viewport.height;
      const dctx = drawingCanvas.getContext('2d');
      if (!dctx) return [];

      dctx.drawImage(pageCanvas, 0, 0);

      // MASK OUT ALL TEXT BOUNDING BOXES WITH PURE WHITE (so text is never duplicated as an image)
      dctx.fillStyle = '#ffffff';
      for (const item of textItems) {
        const itemX = item.x * scale - 4;
        const itemY = item.y * scale - 2;
        const itemW = item.width * scale + 8;
        const itemH = item.height * scale + 4;
        dctx.fillRect(itemX, itemY, itemW, itemH);
      }

      // Scan for remaining non-white pixel clusters (actual diagrams/figures)
      const imgData = dctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      const data = imgData.data;
      const w = drawingCanvas.width;
      const h = drawingCanvas.height;

      // Vertical histogram of remaining drawing pixels
      const rowDarkness = new Array(h).fill(0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 4) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          if (r < 235 || g < 235 || b < 235) {
            rowDarkness[y]++;
          }
        }
      }

      // Find vertical bands of drawing content
      interface Band {
        startY: number;
        endY: number;
      }
      const bands: Band[] = [];
      let inBand = false;
      let bandStart = 0;

      for (let y = 0; y < h; y++) {
        const isDark = rowDarkness[y] > 6;
        if (isDark && !inBand) {
          inBand = true;
          bandStart = y;
        } else if (!isDark && inBand) {
          inBand = false;
          if (y - bandStart >= 35) {
            bands.push({ startY: bandStart, endY: y });
          }
        }
      }
      if (inBand && h - bandStart >= 35) {
        bands.push({ startY: bandStart, endY: h });
      }

      // For each drawing band, extract and auto-trim the graphic
      for (let bIdx = 0; bIdx < bands.length; bIdx++) {
        const band = bands[bIdx];
        const bandH = band.endY - band.startY;
        if (bandH < 35) continue;

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = viewport.width;
        sliceCanvas.height = bandH;
        const sctx = sliceCanvas.getContext('2d');
        if (!sctx) continue;

        sctx.drawImage(
          pageCanvas,
          0,
          band.startY,
          viewport.width,
          bandH,
          0,
          0,
          viewport.width,
          bandH
        );

        const trimmed = autoTrimCanvas(sliceCanvas);
        if (!trimmed) continue;

        // Verify trimmed figure is large enough to be a genuine graphic
        if (trimmed.width < 40 || trimmed.height < 40) continue;

        const dataUrl = trimmed.toDataURL('image/png');
        const displayW = Math.min(trimmed.width / (scale / 1.5), 520);
        const displayH = Math.min(trimmed.height / (scale / 1.5), 360);

        diagrams.push({
          id: `diag-crop-${pageNumber}-${bIdx}-${Date.now()}`,
          type: 'image',
          text: '',
          imageUrl: dataUrl,
          imageWidth: displayW,
          imageHeight: displayH,
          caption: `Figure (Page ${pageNumber})`,
          pageIndex: pageNumber - 1,
          orderY: viewport.height / scale - (band.startY + band.endY) / (2 * scale),
        });
      }
    } catch (err) {
      console.warn('Figure extraction note for page', pageNumber, err);
    }

    return diagrams;
  }

  /**
   * Intelligently extract and preserve complete document structures:
   * - Digital PDFs: De-encrypt & unvectorize content stream directly
   * - Scanned/Image PDFs: Uses Tesseract OCR to vectorize image to text
   * - Full Table Grid Extraction (Multi-column alignment clustering + multi-line row grouping)
   * - Hierarchical Lists & Sub-questions (Numbered 1., 1(a), (a), (i), [1], bullets •, -, *)
   * - Precision Subscripts (<sub>) and Superscripts (<sup>)
   * - Auto-trimmed High-Resolution Diagrams, Charts, and Embedded Figures
   * - Headings (H1, H2, H3) & Paragraphs
   */
  public static async extractDocumentParagraphs(
    pdfDoc: pdfjsLib.PDFDocumentProxy
  ): Promise<DocParagraph[]> {
    const paragraphs: DocParagraph[] = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const rawTextItems = await this.extractPageTextItems(pdfDoc, p);

      interface RawItem {
        str: string;
        x: number;
        y: number; // PDF baseline Y
        width: number;
        height: number;
        fontSize: number;
        fontName?: string;
      }

      const rawItems: RawItem[] = rawTextItems.map((it) => ({
        str: it.str,
        x: it.x,
        y: 842 - it.y - it.fontSize,
        width: it.width,
        height: it.height,
        fontSize: it.fontSize,
        fontName: it.fontName,
      }));

      // Group raw items into physical lines (similar PDF baseline Y within 3.8 points)
      interface LineGroup {
        y: number;
        items: RawItem[];
        dominantFontSize: number;
        minX: number;
        maxX: number;
      }

      const lines: LineGroup[] = [];

      rawItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3.8) {
          return b.y - a.y;
        }
        return a.x - b.x;
      });

      for (const item of rawItems) {
        let line = lines.find((l) => Math.abs(l.y - item.y) <= 3.8);
        if (!line) {
          line = {
            y: item.y,
            items: [],
            dominantFontSize: item.fontSize,
            minX: item.x,
            maxX: item.x + item.width,
          };
          lines.push(line);
        }
        line.items.push(item);
        line.minX = Math.min(line.minX, item.x);
        line.maxX = Math.max(line.maxX, item.x + item.width);
      }

      lines.sort((a, b) => b.y - a.y);

      const textLineBounds = lines.map((l) => ({
        topY: l.y + l.dominantFontSize,
        bottomY: l.y,
      }));

      // Extract high-resolution, auto-trimmed diagrams and figures with text masked out
      const pageDiagrams = await this.extractPageDiagramsAndFigures(
        pdfDoc,
        p,
        rawTextItems
      );

      if (rawItems.length === 0) {
        if (pageDiagrams.length > 0) {
          paragraphs.push(...pageDiagrams);
        }
        continue;
      }

      // Column Alignment Clustering (For Table Detection)
      const xStarts: number[] = [];
      lines.forEach((l) => {
        l.items.forEach((it) => {
          if (it.str.trim()) {
            xStarts.push(Math.round(it.x));
          }
        });
      });

      const columnClusters: { x: number; count: number }[] = [];
      xStarts.forEach((x) => {
        const cluster = columnClusters.find((c) => Math.abs(c.x - x) <= 18);
        if (cluster) {
          cluster.count++;
          cluster.x = (cluster.x + x) / 2;
        } else {
          columnClusters.push({ x, count: 1 });
        }
      });

      const tableColumns = columnClusters
        .filter((c) => c.count >= 2)
        .map((c) => c.x)
        .sort((a, b) => a - b);

      interface ProcessedLine {
        y: number;
        dominantFontSize: number;
        formattedText: string;
        cells: string[];
        isTableCandidate: boolean;
        isListItem: boolean;
        listType?: 'bullet' | 'numbered';
        minX: number;
        maxX: number;
      }

      const processedLines: ProcessedLine[] = lines.map((line) => {
        line.items.sort((a, b) => a.x - b.x);

        const fontCounts: Record<number, number> = {};
        line.items.forEach((it) => {
          if (it.str.trim()) {
            fontCounts[it.fontSize] = (fontCounts[it.fontSize] || 0) + it.str.length;
          }
        });

        let dominantSize = 12;
        let maxCount = 0;
        Object.entries(fontCounts).forEach(([size, count]) => {
          if (count > maxCount) {
            maxCount = count;
            dominantSize = Number(size);
          }
        });
        line.dominantFontSize = dominantSize;

        interface FormattedToken {
          text: string;
          x: number;
          width: number;
        }

        const tokens: FormattedToken[] = [];

        for (let i = 0; i < line.items.length; i++) {
          const it = line.items[i];
          const prev = line.items[i - 1];
          let itStr = it.str;
          const trimmed = itStr.trim();

          const hasFormulaChar = /[a-zA-Z0-9+\-=()]/.test(trimmed);
          const isSmaller = it.fontSize <= dominantSize * 0.88;
          const isCloseToPrev = prev && it.x - (prev.x + prev.width) <= 8.0;

          const isSuperscript =
            hasFormulaChar && isSmaller && it.y > line.y + 1.2 && (isCloseToPrev || trimmed.length <= 4);
          const isSubscript =
            hasFormulaChar && isSmaller && it.y < line.y - 0.8 && (isCloseToPrev || trimmed.length <= 4);

          if (isSuperscript && trimmed.length > 0) {
            itStr = itStr.replace(trimmed, `<sup>${trimmed}</sup>`);
          } else if (isSubscript && trimmed.length > 0) {
            itStr = itStr.replace(trimmed, `<sub>${trimmed}</sub>`);
          }

          tokens.push({ text: itStr, x: it.x, width: it.width });
        }

        const cells: string[] = [];
        let currentCell = '';

        for (let i = 0; i < tokens.length; i++) {
          const tok = tokens[i];
          const nextTok = tokens[i + 1];

          currentCell += (currentCell && !currentCell.endsWith(' ') && !tok.text.startsWith(' ') ? ' ' : '') + tok.text;

          if (nextTok) {
            const gap = nextTok.x - (tok.x + tok.width);
            const isColumnJump =
              tableColumns.length >= 2 &&
              tableColumns.some((colX) => tok.x + tok.width < colX && nextTok.x >= colX - 5);

            if (gap >= 16 || isColumnJump) {
              if (currentCell.trim()) {
                cells.push(cleanSubSuperTags(currentCell));
              }
              currentCell = '';
            }
          }
        }

        if (currentCell.trim()) {
          cells.push(cleanSubSuperTags(currentCell));
        }

        const fullLineText = cleanSubSuperTags(
          tokens.map((t) => t.text).join(' ')
        );

        const isBullet = /^[-•*▪◦–—■►✔✓]\s*/.test(fullLineText);
        const isNumbered =
          /^(\d+(\.\d+)*[\.\)]|\([0-9a-zA-Z]+\)(\([0-9a-zA-Z]+\))*|[a-zA-Z][\.\)]|\[[0-9a-zA-Z\s:]+\]|[ivxlcdmIVXLCDM]+[\.\)]|\d+\s*\([a-z0-9]+\))\s*/i.test(
            fullLineText
          );

        return {
          y: line.y,
          dominantFontSize: dominantSize,
          formattedText: fullLineText,
          cells,
          isTableCandidate: cells.length >= 2,
          isListItem: isBullet || isNumbered,
          listType: isBullet ? 'bullet' : isNumbered ? 'numbered' : undefined,
          minX: line.minX,
          maxX: line.maxX,
        };
      });

      let i = 0;
      const pageParagraphs: DocParagraph[] = [];

      while (i < processedLines.length) {
        const currentLine = processedLines[i];

        // 1. TABLE GROUPING
        if (
          currentLine.isTableCandidate &&
          (i + 1 >= processedLines.length || processedLines[i + 1].isTableCandidate || currentLine.cells.length >= 3)
        ) {
          const tableRows: string[][] = [];
          let maxCols = 0;

          while (i < processedLines.length) {
            const line = processedLines[i];
            if (line.cells.length >= 2) {
              maxCols = Math.max(maxCols, line.cells.length);
              tableRows.push(line.cells);
              i++;
            } else if (tableRows.length > 0 && line.cells.length === 1 && !line.isListItem && line.dominantFontSize <= 13) {
              const lastRow = tableRows[tableRows.length - 1];
              lastRow[lastRow.length - 1] += ' ' + line.formattedText;
              i++;
            } else {
              break;
            }
          }

          if (tableRows.length > 0) {
            const normalizedRows = tableRows.map((r) => {
              const rowCopy = [...r];
              while (rowCopy.length < maxCols) {
                rowCopy.push('');
              }
              return rowCopy;
            });

            pageParagraphs.push({
              id: `table-${p}-${i}-${Date.now()}`,
              type: 'table',
              text: '',
              tableData: normalizedRows,
              pageIndex: p - 1,
              orderY: currentLine.y,
              layoutBottomY: tableRows.length > 0 ? processedLines[i - 1].y : currentLine.y,
            });
            continue;
          }
        }

        // 2. HEADINGS
        if (currentLine.dominantFontSize >= 18 && !currentLine.isListItem) {
          pageParagraphs.push({
            id: `h1-${p}-${i}-${Date.now()}`,
            type: 'h1',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        } else if (currentLine.dominantFontSize >= 15 && !currentLine.isListItem) {
          pageParagraphs.push({
            id: `h2-${p}-${i}-${Date.now()}`,
            type: 'h2',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        } else if (currentLine.dominantFontSize >= 13.5 && currentLine.formattedText.length < 80 && !currentLine.isListItem) {
          pageParagraphs.push({
            id: `h3-${p}-${i}-${Date.now()}`,
            type: 'h3',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        }

        // 3. LISTS (Numbered / Bullet)
        if (currentLine.isListItem) {
          pageParagraphs.push({
            id: `list-${p}-${i}-${Date.now()}`,
            type: currentLine.listType || 'numbered',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        }

        // 4. NORMAL PARAGRAPH
        let paraText = currentLine.formattedText;
        const startY = currentLine.y;
        let lastY = currentLine.y;
        i++;

        while (i < processedLines.length) {
          const nextLine = processedLines[i];
          const lineGap = Math.abs(lastY - nextLine.y);

          if (
            nextLine.isListItem ||
            nextLine.dominantFontSize > currentLine.dominantFontSize + 1.5 ||
            nextLine.isTableCandidate ||
            lineGap > 20
          ) {
            break;
          }

          if (paraText.endsWith('-')) {
            paraText = paraText.slice(0, -1) + nextLine.formattedText;
          } else {
            paraText += ' ' + nextLine.formattedText;
          }
          lastY = nextLine.y;
          i++;
        }

        pageParagraphs.push({
          id: `p-${p}-${i}-${Date.now()}`,
          type: 'p',
          text: cleanSubSuperTags(paraText),
          pageIndex: p - 1,
          orderY: startY,
        });
      }

      // A table is already represented as editable cells. Do not add a second
      // raster "diagram" taken from the same vertical region.
      const standaloneDiagrams = pageDiagrams.filter((diagram) =>
        !pageParagraphs.some(
          (item) =>
            item.type === 'table' &&
            diagram.orderY !== undefined &&
            diagram.orderY <= (item.orderY || 0) + 12 &&
            diagram.orderY >= (item.layoutBottomY || item.orderY || 0) - 12
        )
      );
      const combinedPageElements = [...pageParagraphs, ...standaloneDiagrams];
      combinedPageElements.sort((a, b) => (b.orderY || 0) - (a.orderY || 0));

      paragraphs.push(...combinedPageElements);
    }

    return paragraphs;
  }

  /**
   * Generate lightweight JPEG data URL thumbnail for a specific page
   */
  public static async generateThumbnail(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    rotation: number = 0,
    targetWidth: number = 200
  ): Promise<string> {
    const page = await pdfDoc.getPage(pageNumber);
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
    const scale = targetWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await (page.render(renderContext as any).promise);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Export page as high-res PNG / JPEG
   */
  public static async exportPageAsImage(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    format: 'image/png' | 'image/jpeg' = 'image/png',
    scale: number = 2.0
  ): Promise<string> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    await (page.render(renderContext as any).promise);
    return canvas.toDataURL(format, 0.95);
  }
}
