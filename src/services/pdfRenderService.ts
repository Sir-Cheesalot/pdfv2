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

/**
 * Visual validation filter:
 * To be considered a picture/diagram, it cannot be just one single flat solid color
 * (unless that color consists of black / black-adjacent drawing strokes & line art).
 */
function isMeaningfulVisual(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const colourBuckets = new Set<string>();
  let nonWhite = 0;
  let blackOrDarkPixels = 0;
  let transitions = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 100));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const isNotWhite = r < 242 || g < 242 || b < 242;
      if (!isNotWhite) continue;

      nonWhite++;

      // Check if pixel is black or dark neutral line / stroke (schematics, plots, sketches)
      const isBlackOrDark =
        (r < 75 && g < 75 && b < 75) ||
        (r < 115 && g < 115 && b < 115 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18);

      if (isBlackOrDark) {
        blackOrDarkPixels++;
      } else {
        // Group chromatic / non-black colors into distinct buckets
        colourBuckets.add(`${Math.floor(r / 35)}-${Math.floor(g / 35)}-${Math.floor(b / 35)}`);
      }

      if (x + step < width) {
        const next = (y * width + x + step) * 4;
        const diff = Math.abs(r - pixels[next]) + Math.abs(g - pixels[next + 1]) + Math.abs(b - pixels[next + 2]);
        if (diff > 50) transitions++;
      }
      if (y + step < height) {
        const below = ((y + step) * width + x) * 4;
        const diff = Math.abs(r - pixels[below]) + Math.abs(g - pixels[below + 1]) + Math.abs(b - pixels[below + 2]);
        if (diff > 50) transitions++;
      }
    }
  }

  // Must have minimal content
  if (nonWhite < 14) return false;

  // 1. Black / dark line art (schematics, plots, graphs, circuits, curves, sketches) -> Valid!
  if (blackOrDarkPixels >= 6) {
    return true;
  }

  // 2. Colored visuals must have more than 1 color (cannot be just one single flat solid color)
  if (colourBuckets.size >= 2) {
    return true;
  }

  // 3. Detailed gradient/texture variation within same color
  const detailRatio = transitions / nonWhite;
  if (colourBuckets.size === 1 && detailRatio >= 0.22) {
    return true;
  }

  return false;
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
   * Uses masked text only to detect genuine graphics. The final crop comes from
   * the original page, retaining labels that belong inside a diagram.
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

      // Scan for non-white pixel clusters (actual diagrams/figures of any dimension)
      const imgData = dctx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      const data = imgData.data;
      const w = drawingCanvas.width;
      const h = drawingCanvas.height;

      interface BoundingBox {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        pixelCount: number;
      }

      const blockSize = 8;
      const gridW = Math.ceil(w / blockSize);
      const gridH = Math.ceil(h / blockSize);
      const hasContentGrid: boolean[] = new Array(gridW * gridH).fill(false);

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const startX = gx * blockSize;
          const startY = gy * blockSize;
          const endX = Math.min(startX + blockSize, w);
          const endY = Math.min(startY + blockSize, h);

          let darkCount = 0;
          for (let y = startY; y < endY; y += 2) {
            for (let x = startX; x < endX; x += 2) {
              const idx = (y * w + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              if (r < 240 || g < 240 || b < 240) {
                darkCount++;
              }
            }
          }
          if (darkCount >= 2) {
            hasContentGrid[gy * gridW + gx] = true;
          }
        }
      }

      // Group adjacent blocks into bounding boxes
      const visited: boolean[] = new Array(gridW * gridH).fill(false);
      const rawBoxes: BoundingBox[] = [];

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const gidx = gy * gridW + gx;
          if (!hasContentGrid[gidx] || visited[gidx]) continue;

          // Flood fill to find all connected blocks in this graphic
          let minX = gx * blockSize;
          let minY = gy * blockSize;
          let maxX = (gx + 1) * blockSize;
          let maxY = (gy + 1) * blockSize;
          let count = 0;

          const queue: [number, number][] = [[gx, gy]];
          visited[gidx] = true;

          while (queue.length > 0) {
            const [curX, curY] = queue.shift()!;
            count++;

            const px0 = curX * blockSize;
            const py0 = curY * blockSize;
            const px1 = Math.min((curX + 1) * blockSize, w);
            const py1 = Math.min((curY + 1) * blockSize, h);

            minX = Math.min(minX, px0);
            minY = Math.min(minY, py0);
            maxX = Math.max(maxX, px1);
            maxY = Math.max(maxY, py1);

            // Check 8-connected neighbors (with 2-block reach to keep components connected)
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nx = curX + dx;
                const ny = curY + dy;
                if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                  const nidx = ny * gridW + nx;
                  if (hasContentGrid[nidx] && !visited[nidx]) {
                    visited[nidx] = true;
                    queue.push([nx, ny]);
                  }
                }
              }
            }
          }

          if (count >= 3 && (maxX - minX >= 16) && (maxY - minY >= 16)) {
            rawBoxes.push({ minX, minY, maxX, maxY, pixelCount: count });
          }
        }
      }

      // Merge overlapping or nearby boxes (within 20px)
      const mergedBoxes: BoundingBox[] = [];
      for (const box of rawBoxes) {
        let merged = false;
        for (const m of mergedBoxes) {
          const padding = 20;
          const overlap = !(
            box.maxX + padding < m.minX ||
            box.minX - padding > m.maxX ||
            box.maxY + padding < m.minY ||
            box.minY - padding > m.maxY
          );
          if (overlap) {
            m.minX = Math.min(m.minX, box.minX);
            m.minY = Math.min(m.minY, box.minY);
            m.maxX = Math.max(m.maxX, box.maxX);
            m.maxY = Math.max(m.maxY, box.maxY);
            m.pixelCount += box.pixelCount;
            merged = true;
            break;
          }
        }
        if (!merged) {
          mergedBoxes.push({ ...box });
        }
      }

      // Crop and auto-trim each detected figure
      for (let bIdx = 0; bIdx < mergedBoxes.length; bIdx++) {
        const box = mergedBoxes[bIdx];
        const cropX = Math.max(0, box.minX - 6);
        const cropY = Math.max(0, box.minY - 6);
        const cropW = Math.min(w - cropX, box.maxX - box.minX + 12);
        const cropH = Math.min(h - cropY, box.maxY - box.minY + 12);

        if (cropW < 16 || cropH < 16) continue;

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = cropW;
        sliceCanvas.height = cropH;
        const sctx = sliceCanvas.getContext('2d');
        if (!sctx) continue;

        sctx.drawImage(
          drawingCanvas,
          cropX,
          cropY,
          cropW,
          cropH,
          0,
          0,
          cropW,
          cropH
        );

        const trimmed = autoTrimCanvas(sliceCanvas);
        if (!trimmed) continue;
        if (trimmed.width < 14 || trimmed.height < 14 || !isMeaningfulVisual(trimmed)) continue;

        const dataUrl = trimmed.toDataURL('image/png');
        const displayW = Math.min(trimmed.width / (scale / 1.5), 520);
        const displayH = Math.min(trimmed.height / (scale / 1.5), 360);

        diagrams.push({
          id: `diag-crop-${pageNumber}-${bIdx}-${Date.now()}`,
          type: 'image',
          text: '',
          imageUrl: dataUrl,
          imageWidth: Math.round(displayW),
          imageHeight: Math.round(displayH),
          caption: `Figure (Page ${pageNumber})`,
          pageIndex: pageNumber - 1,
          orderY: viewport.height / scale - (cropY + cropH / 2) / scale,
          layoutTopY: viewport.height / scale - cropY / scale,
          layoutBottomY: viewport.height / scale - (cropY + cropH) / scale,
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

      let lines: LineGroup[] = [];

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

      // Keep text labels inside a retained diagram with that diagram. They
      // should not be emitted again as editable paragraphs above or below it.
      // Text outside the visual's bounds continues through the normal flow.
      if (pageDiagrams.length > 0) {
        lines = lines
          .map((line) => {
            const visibleItems = line.items.filter((item) => {
              const itemCenterY = item.y + item.height / 2;
              return !pageDiagrams.some(
                (diagram) =>
                  diagram.layoutTopY !== undefined &&
                  diagram.layoutBottomY !== undefined &&
                  itemCenterY <= diagram.layoutTopY + 3 &&
                  itemCenterY >= diagram.layoutBottomY - 3
              );
            });
            return {
              ...line,
              items: visibleItems,
              minX: visibleItems.length ? Math.min(...visibleItems.map((item) => item.x)) : line.minX,
              maxX: visibleItems.length ? Math.max(...visibleItems.map((item) => item.x + item.width)) : line.maxX,
            };
          })
          .filter((line) => line.items.length > 0);
      }

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
        // A single line with large spaces is usually a heading, a label/value
        // pair, or multi-column prose - not a table. Require a repeated grid
        // on the immediately following line before creating table structure.
        if (
          currentLine.isTableCandidate &&
          i + 1 < processedLines.length &&
          processedLines[i + 1].isTableCandidate
        ) {
          const tableStartIndex = i;
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

          const columnCounts = new Map<number, number>();
          tableRows.forEach((row) => columnCounts.set(row.length, (columnCounts.get(row.length) || 0) + 1));
          const repeatedColumnCount = [...columnCounts.values()].some((count) => count >= 2);

          if (tableRows.length >= 2 && repeatedColumnCount) {
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

          // Not enough repeated grid evidence: process the original line as
          // ordinary document content instead of losing it to a false table.
          i = tableStartIndex;
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
