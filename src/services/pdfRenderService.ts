import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedTextItem, DocParagraph } from '../types/pdf';

// Point to local worker in public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface RenderResult {
  width: number;
  height: number;
  scale: number;
}

/**
 * Normalizes sub and sup HTML tags in text, stripping empty tags and combining adjacent tags
 */
export function cleanSubSuperTags(text: string): string {
  if (!text) return '';

  let cleaned = text
    // Remove empty sub/sup tags
    .replace(/<sub>\s*<\/sub>/gi, ' ')
    .replace(/<sup>\s*<\/sup>/gi, ' ')
    // Move whitespace inside sub/sup outside
    .replace(/<sub>\s+([^<]+)<\/sub>/gi, ' <sub>$1</sub>')
    .replace(/<sub>([^<]+)\s+<\/sub>/gi, '<sub>$1</sub> ')
    .replace(/<sup>\s+([^<]+)<\/sup>/gi, ' <sup>$1</sup>')
    .replace(/<sup>([^<]+)\s+<\/sup>/gi, '<sup>$1</sup> ')
    // Merge adjacent identical sub tags: <sub>h</sub><sub>1</sub> -> <sub>h1</sub>
    .replace(/<sub>([^<]+)<\/sub>\s*<sub>([^<]+)<\/sub>/gi, '<sub>$1$2</sub>')
    .replace(/<sup>([^<]+)<\/sup>\s*<sup>([^<]+)<\/sup>/gi, '<sup>$1$2</sup>')
    // Remove trailing/leading sub on pure spaces or commas
    .replace(/<sub>([,\.\s]+)<\/sub>/gi, '$1')
    .replace(/<sup>([,\.\s]+)<\/sup>/gi, '$1')
    // Normalize spaces
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Second pass for nested/adjacent leftovers
  cleaned = cleaned
    .replace(/<sub>\s*<\/sub>/gi, ' ')
    .replace(/<sup>\s*<\/sup>/gi, ' ')
    .replace(/<sub>([^<]+)<\/sub>\s*<sub>([^<]+)<\/sub>/gi, '<sub>$1$2</sub>')
    .replace(/<sup>([^<]+)<\/sup>\s*<sup>([^<]+)<\/sup>/gi, '<sup>$1$2</sup>')
    .replace(/[ \t]{2,}/g, ' ');

  return cleaned;
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

    // Draw white background
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
   */
  public static async extractPageTextItems(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number
  ): Promise<ExtractedTextItem[]> {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const items: ExtractedTextItem[] = [];

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

    return items;
  }

  /**
   * Extract diagrams, visual figures, and images from a page
   */
  public static async extractPageDiagramsAndFigures(
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    textLineYCoordinates: { topY: number; bottomY: number }[]
  ): Promise<DocParagraph[]> {
    const diagrams: DocParagraph[] = [];

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });

      // 1. Render page to offscreen canvas to inspect and crop diagram regions
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = viewport.width;
      pageCanvas.height = viewport.height;
      const pctx = pageCanvas.getContext('2d');
      if (!pctx) return [];

      pctx.fillStyle = '#ffffff';
      pctx.fillRect(0, 0, viewport.width, viewport.height);
      await (page.render({ canvasContext: pctx, viewport } as any).promise);

      // 2. Identify large vertical gaps between text lines that contain figures/drawings
      const pageHeightPt = viewport.height / scale;

      // Sort text lines by PDF Y (top to bottom)
      const sortedY = [...textLineYCoordinates].sort((a, b) => b.topY - a.topY);

      interface GapRegion {
        topY: number; // PDF space
        bottomY: number; // PDF space
      }

      const gaps: GapRegion[] = [];

      // Check gap between top of page and first text line
      if (sortedY.length > 0 && pageHeightPt - sortedY[0].topY > 100) {
        gaps.push({ topY: pageHeightPt - 30, bottomY: sortedY[0].topY + 10 });
      }

      // Check gaps between consecutive text lines
      for (let i = 0; i < sortedY.length - 1; i++) {
        const upper = sortedY[i];
        const lower = sortedY[i + 1];
        const gapPt = upper.bottomY - lower.topY;

        if (gapPt >= 55) {
          // Large vertical gap detected (typical for physics/math figures)
          gaps.push({ topY: upper.bottomY - 5, bottomY: lower.topY + 5 });
        }
      }

      // Check gap between last text line and bottom of page
      if (sortedY.length > 0 && sortedY[sortedY.length - 1].bottomY > 100) {
        gaps.push({ topY: sortedY[sortedY.length - 1].bottomY - 10, bottomY: 30 });
      }

      // 3. For each gap region, crop the canvas area and verify it has visual content (not pure white)
      for (let gIdx = 0; gIdx < gaps.length; gIdx++) {
        const gap = gaps[gIdx];
        const pdfTopY = gap.topY;
        const pdfBottomY = gap.bottomY;

        // Convert to canvas pixel coordinates (top-down)
        const canvasTopY = Math.max(0, (pageHeightPt - pdfTopY) * scale);
        const canvasHeight = Math.min(
          viewport.height - canvasTopY,
          (pdfTopY - pdfBottomY) * scale
        );

        if (canvasHeight < 35) continue;

        // Crop gap region
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = viewport.width;
        cropCanvas.height = canvasHeight;
        const cctx = cropCanvas.getContext('2d');
        if (!cctx) continue;

        cctx.drawImage(
          pageCanvas,
          0,
          canvasTopY,
          viewport.width,
          canvasHeight,
          0,
          0,
          viewport.width,
          canvasHeight
        );

        // Check if cropped area has drawings/lines/pixels (not pure white)
        const imgData = cctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
        let nonWhitePixels = 0;
        const data = imgData.data;

        for (let k = 0; k < data.length; k += 16) {
          const r = data[k];
          const g = data[k + 1];
          const b = data[k + 2];
          // If pixel is not pure white
          if (r < 240 || g < 240 || b < 240) {
            nonWhitePixels++;
          }
        }

        // If region contains significant graphical content
        if (nonWhitePixels > 80) {
          const dataUrl = cropCanvas.toDataURL('image/png');
          diagrams.push({
            id: `diag-crop-${pageNumber}-${gIdx}-${Date.now()}`,
            type: 'image',
            text: '',
            imageUrl: dataUrl,
            imageWidth: Math.min(viewport.width / scale, 480),
            imageHeight: Math.min(canvasHeight / scale, 320),
            caption: `Figure (Page ${pageNumber})`,
            pageIndex: pageNumber - 1,
            orderY: (pdfTopY + pdfBottomY) / 2,
          });
        }
      }
    } catch (err) {
      console.warn('Figure extraction note for page', pageNumber, err);
    }

    return diagrams;
  }

  /**
   * Intelligently extract and preserve complete document structures:
   * - Tables (Multi-column alignment, grid rows & headers)
   * - Lists (Numbered 1., (a), (i), [1], bullets •, -, *)
   * - Subscripts (<sub>) and Superscripts (<sup>) with whitespace-safe tokenization
   * - Diagrams, Charts, and Embedded Figures
   * - Headings (H1, H2, H3) & Paragraphs
   */
  public static async extractDocumentParagraphs(
    pdfDoc: pdfjsLib.PDFDocumentProxy
  ): Promise<DocParagraph[]> {
    const paragraphs: DocParagraph[] = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();

      interface RawItem {
        str: string;
        x: number;
        y: number; // PDF baseline Y
        width: number;
        height: number;
        fontSize: number;
        fontName?: string;
      }

      const rawItems: RawItem[] = [];

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str) continue;
        const tx = item.transform;
        const fontSize = Math.round(Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])) || 12;
        rawItems.push({
          str: item.str,
          x: tx[4],
          y: tx[5],
          width: item.width || 0,
          height: item.height || fontSize,
          fontSize,
          fontName: item.fontName,
        });
      }

      // Group raw items into physical lines (similar PDF baseline Y within 3.5 points)
      interface LineGroup {
        y: number;
        items: RawItem[];
        dominantFontSize: number;
        minX: number;
        maxX: number;
      }

      const lines: LineGroup[] = [];

      // Sort items: Top-to-bottom (Y descending in PDF space), then Left-to-right (X ascending)
      rawItems.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3.5) {
          return b.y - a.y; // Top to bottom
        }
        return a.x - b.x; // Left to right
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

      // Re-sort lines from top to bottom
      lines.sort((a, b) => b.y - a.y);

      // Collect line coordinates for diagram detection
      const textLineBounds = lines.map((l) => ({
        topY: l.y + l.dominantFontSize,
        bottomY: l.y,
      }));

      // Extract visual diagrams and figures for this page
      const pageDiagrams = await this.extractPageDiagramsAndFigures(
        pdfDoc,
        p,
        textLineBounds
      );

      if (rawItems.length === 0) {
        if (pageDiagrams.length > 0) {
          paragraphs.push(...pageDiagrams);
        }
        continue;
      }

      // Process each line into tokens, cells, and sub/superscripts
      interface ProcessedLine {
        y: number;
        formattedText: string;
        fontSize: number;
        isTableCandidate: boolean;
        cells: string[];
        minX: number;
        maxX: number;
        isListItem: boolean;
        listType?: 'bullet' | 'numbered';
      }

      const processedLines: ProcessedLine[] = lines.map((line) => {
        line.items.sort((a, b) => a.x - b.x);

        // Find dominant font size
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

        // Group items in this line into cells by horizontal gaps (> 18 points)
        const cells: string[] = [];
        let currentCell = '';
        let fullLineText = '';

        for (let i = 0; i < line.items.length; i++) {
          const it = line.items[i];
          let itStr = it.str;
          const trimmed = itStr.trim();

          // Subscript / Superscript Detection:
          const hasFormulaChar = /[a-zA-Z0-9+\-=()]/.test(trimmed);
          const isSmaller = it.fontSize <= dominantSize * 0.82;
          const isSuperscript = hasFormulaChar && isSmaller && it.y > line.y + 2.0;
          const isSubscript = hasFormulaChar && isSmaller && it.y < line.y - 1.2;

          if (isSuperscript && trimmed.length > 0) {
            itStr = itStr.replace(trimmed, `<sup>${trimmed}</sup>`);
          } else if (isSubscript && trimmed.length > 0) {
            itStr = itStr.replace(trimmed, `<sub>${trimmed}</sub>`);
          }

          const nextItem = line.items[i + 1];
          currentCell += (currentCell && !currentCell.endsWith(' ') && !itStr.startsWith(' ') ? ' ' : '') + itStr;
          fullLineText += (fullLineText && !fullLineText.endsWith(' ') && !itStr.startsWith(' ') ? ' ' : '') + itStr;

          // Gap threshold for table cell separation (18 points)
          if (nextItem && nextItem.x - (it.x + it.width) >= 18) {
            if (currentCell.trim()) {
              cells.push(cleanSubSuperTags(currentCell));
            }
            currentCell = '';
          }
        }

        if (currentCell.trim()) {
          cells.push(cleanSubSuperTags(currentCell));
        }

        const cleanFull = cleanSubSuperTags(fullLineText);

        // List detection regexes:
        // Bullet: •, -, *, ▪, ◦, –, —
        // Numbered: 1., 1(a), (a), (i), [1], A., etc.
        const isBullet = /^[-•*▪◦–—■►✔✓]\s*/.test(cleanFull);
        const isNumbered =
          /^(\d+(\.\d+)*[\.\)]|\([0-9a-zA-Z]+\)|[a-zA-Z][\.\)]|\[[0-9a-zA-Z]+\]|[ivxlcdmIVXLCDM]+[\.\)]|\d+\s*\([a-z0-9]+\))\s*/i.test(
            cleanFull
          );

        return {
          y: line.y,
          formattedText: cleanFull,
          fontSize: dominantSize,
          isTableCandidate: cells.length >= 2,
          cells,
          minX: line.minX,
          maxX: line.maxX,
          isListItem: isBullet || isNumbered,
          listType: isBullet ? 'bullet' : isNumbered ? 'numbered' : undefined,
        };
      });

      // Group consecutive lines into structured Paragraphs / Tables / Lists / Headings
      let i = 0;
      const pageParagraphs: DocParagraph[] = [];

      while (i < processedLines.length) {
        const currentLine = processedLines[i];

        // 1. TABLE DETECTION: Multiple consecutive multi-column lines (or multi-column header)
        if (
          currentLine.isTableCandidate &&
          (i + 1 >= processedLines.length || processedLines[i + 1].isTableCandidate || currentLine.cells.length >= 3)
        ) {
          const tableRows: string[][] = [];
          let maxCols = 0;

          while (i < processedLines.length && (processedLines[i].isTableCandidate || tableRows.length === 0)) {
            const row = processedLines[i].cells;
            if (row.length >= 2) {
              maxCols = Math.max(maxCols, row.length);
              tableRows.push(row);
            } else if (tableRows.length > 0) {
              break;
            }
            i++;
          }

          if (tableRows.length > 0) {
            // Normalize table column lengths so every row has maxCols
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
            });
            continue;
          }
        }

        // 2. HEADINGS
        if (currentLine.fontSize >= 18 && !currentLine.isListItem) {
          pageParagraphs.push({
            id: `h1-${p}-${i}-${Date.now()}`,
            type: 'h1',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        } else if (currentLine.fontSize >= 15 && !currentLine.isListItem) {
          pageParagraphs.push({
            id: `h2-${p}-${i}-${Date.now()}`,
            type: 'h2',
            text: currentLine.formattedText,
            pageIndex: p - 1,
            orderY: currentLine.y,
          });
          i++;
          continue;
        } else if (currentLine.fontSize >= 13.5 && currentLine.formattedText.length < 80 && !currentLine.isListItem) {
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

        // 3. LISTS (Bullet or Numbered)
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

          // Stop combining if new line is a list, heading, table, or large gap
          if (
            nextLine.isListItem ||
            nextLine.fontSize > currentLine.fontSize + 1.5 ||
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

      // Merge text paragraphs and diagrams for this page, preserving natural top-to-bottom flow
      const combinedPageElements = [...pageParagraphs, ...pageDiagrams];
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
