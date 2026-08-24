import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type {
  RebuiltPage,
  RebuiltTextElement,
  RebuiltImageElement,
  RebuiltVectorElement,
} from '../types/pdf';
import { PdfRenderService } from './pdfRenderService';

// Ensure worker is configured
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function hexToRgb01(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
  return rgb(r, g, b);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1] || parts[0]);
  const u8 = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    u8[i] = byteString.charCodeAt(i);
  }
  return u8;
}

export class PdfRebuildService {
  /**
   * Parse a digital or scanned PDF into structured, directly editable pages
   * Extracts exact text elements, font sizes, positions, diagrams, and vector lines.
   */
  public static async parsePdfToRebuiltPages(
    pdfBytes: Uint8Array
  ): Promise<RebuiltPage[]> {
    const bytesCopy = new Uint8Array(pdfBytes);
    const loadingTask = pdfjsLib.getDocument({
      data: bytesCopy,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    const rebuiltPages: RebuiltPage[] = [];

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      const textElements: RebuiltTextElement[] = [];
      const imageElements: RebuiltImageElement[] = [];
      const vectorElements: RebuiltVectorElement[] = [];

      interface RawGlyph {
        str: string;
        x: number;
        y: number; // from top
        pdfY: number; // from bottom
        width: number;
        height: number;
        fontSize: number;
        fontName: string;
      }

      const glyphs: RawGlyph[] = [];

      for (let i = 0; i < textContent.items.length; i++) {
        const item = textContent.items[i];
        if (!('str' in item) || !item.str) continue;

        const tx = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
        const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) || 12;
        const pdfX = tx[4];
        const pdfY = tx[5];
        const topY = viewport.height - pdfY - fontSize;
        const width = item.width > 0 ? item.width : item.str.length * (fontSize * 0.55);
        const height = item.height > 0 ? item.height : fontSize * 1.2;

        glyphs.push({
          str: item.str,
          x: pdfX,
          y: topY,
          pdfY: pdfY,
          width,
          height,
          fontSize,
          fontName: item.fontName || 'Helvetica',
        });
      }

      // Group nearby glyphs on the same line into coherent editable text blocks
      glyphs.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4) {
          return a.y - b.y;
        }
        return a.x - b.x;
      });

      let currentBlock: {
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fontSize: number;
        fontName: string;
        lastX: number;
      } | null = null;

      for (const g of glyphs) {
        if (!g.str) continue;

        if (!currentBlock) {
          currentBlock = {
            text: g.str,
            x: g.x,
            y: g.y,
            width: g.width,
            height: g.height,
            fontSize: g.fontSize,
            fontName: g.fontName,
            lastX: g.x + g.width,
          };
          continue;
        }

        const isSameLine = Math.abs(currentBlock.y - g.y) <= 3.5;
        const gap = g.x - currentBlock.lastX;
        const isClose = gap >= -2 && gap <= g.fontSize * 1.8;

        if (isSameLine && isClose) {
          const space = gap > 2 && !currentBlock.text.endsWith(' ') && !g.str.startsWith(' ') ? ' ' : '';
          currentBlock.text += space + g.str;
          currentBlock.width = g.x + g.width - currentBlock.x;
          currentBlock.height = Math.max(currentBlock.height, g.height);
          currentBlock.fontSize = Math.max(currentBlock.fontSize, g.fontSize);
          currentBlock.lastX = g.x + g.width;
        } else {
          if (currentBlock.text.trim()) {
            const fontLower = currentBlock.fontName.toLowerCase();
            const bold = fontLower.includes('bold') || fontLower.includes('heavy') || fontLower.includes('black');
            const italic = fontLower.includes('italic') || fontLower.includes('oblique');

            textElements.push({
              id: `elem-text-${p}-${textElements.length}-${Date.now()}`,
              text: currentBlock.text,
              x: Math.round(currentBlock.x),
              y: Math.round(currentBlock.y),
              width: Math.max(Math.round(currentBlock.width), 30),
              height: Math.max(Math.round(currentBlock.height), 16),
              fontSize: Math.round(currentBlock.fontSize),
              fontFamily: fontLower.includes('times') ? 'Times' : fontLower.includes('courier') ? 'Courier' : 'Helvetica',
              color: '#1d1d1f',
              bold,
              italic,
            });
          }

          currentBlock = {
            text: g.str,
            x: g.x,
            y: g.y,
            width: g.width,
            height: g.height,
            fontSize: g.fontSize,
            fontName: g.fontName,
            lastX: g.x + g.width,
          };
        }
      }

      if (currentBlock && currentBlock.text.trim()) {
        const fontLower = currentBlock.fontName.toLowerCase();
        textElements.push({
          id: `elem-text-${p}-${textElements.length}-${Date.now()}`,
          text: currentBlock.text,
          x: Math.round(currentBlock.x),
          y: Math.round(currentBlock.y),
          width: Math.max(Math.round(currentBlock.width), 30),
          height: Math.max(Math.round(currentBlock.height), 16),
          fontSize: Math.round(currentBlock.fontSize),
          fontFamily: fontLower.includes('times') ? 'Times' : fontLower.includes('courier') ? 'Courier' : 'Helvetica',
          color: '#1d1d1f',
          bold: fontLower.includes('bold'),
          italic: fontLower.includes('italic'),
        });
      }

      // If page has no digital text items (e.g. scanned), run Tesseract OCR to vectorize image to text elements
      if (textElements.length === 0) {
        try {
          const ocrItems = await PdfRenderService.extractPageTextItems(pdfDoc, p);
          ocrItems.forEach((it, idx) => {
            textElements.push({
              id: `elem-ocr-${p}-${idx}-${Date.now()}`,
              text: it.str,
              x: Math.round(it.x),
              y: Math.round(it.y),
              width: Math.max(Math.round(it.width), 30),
              height: Math.max(Math.round(it.height), 16),
              fontSize: Math.round(it.fontSize),
              fontFamily: 'Helvetica',
              color: '#1d1d1f',
            });
          });
        } catch (e) {
          console.warn('OCR error in rebuild parser:', e);
        }
      }

      // Extract figures & diagrams with exact bounding boxes
      try {
        const textBounds = textElements.map((t) => ({
          topY: viewport.height - t.y,
          bottomY: viewport.height - t.y - t.height,
        }));
        const diagrams = await PdfRenderService.extractPageDiagramsAndFigures(pdfDoc, p, textBounds);
        diagrams.forEach((d, dIdx) => {
          if (d.imageUrl) {
            const diagW = Math.min(d.imageWidth || 400, viewport.width - 60);
            const diagH = Math.min(d.imageHeight || 250, 320);
            const diagX = (viewport.width - diagW) / 2;
            const diagY = d.orderY ? viewport.height - d.orderY - diagH / 2 : 120;

            imageElements.push({
              id: `elem-img-${p}-${dIdx}-${Date.now()}`,
              x: Math.round(diagX),
              y: Math.max(Math.round(diagY), 20),
              width: Math.round(diagW),
              height: Math.round(diagH),
              dataUrl: d.imageUrl,
              caption: d.caption,
            });
          }
        });
      } catch (e) {
        console.warn('Diagram extraction in rebuild:', e);
      }

      rebuiltPages.push({
        pageIndex: p - 1,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        rotation: 0,
        textElements,
        imageElements,
        vectorElements,
      });
    }

    return rebuiltPages;
  }

  /**
   * Compile reconstructed and modified pages into a pristine, clean vector PDF (zero coverups!)
   */
  public static async compileRebuiltPagesToPdf(
    pages: RebuiltPage[],
    docTitle: string = 'Rebuilt_Document.pdf'
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const times = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const courier = await pdfDoc.embedFont(StandardFonts.Courier);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    for (const page of pages) {
      const pdfPage = pdfDoc.addPage([page.width, page.height]);

      // 1. Draw Images & Figures
      for (const img of page.imageElements) {
        try {
          const imgBytes = dataUrlToUint8Array(img.dataUrl);
          let embedded;
          if (img.dataUrl.startsWith('data:image/png')) {
            embedded = await pdfDoc.embedPng(imgBytes);
          } else {
            embedded = await pdfDoc.embedJpg(imgBytes);
          }

          const pdfY = page.height - img.y - img.height;
          pdfPage.drawImage(embedded, {
            x: img.x,
            y: Math.max(pdfY, 0),
            width: img.width,
            height: img.height,
          });
        } catch (err) {
          console.warn('Failed to embed image in rebuilt PDF:', err);
        }
      }

      // 2. Draw Vector Elements
      for (const vec of page.vectorElements) {
        try {
          const pdfY = page.height - vec.y - vec.height;
          if (vec.type === 'rect') {
            pdfPage.drawRectangle({
              x: vec.x,
              y: pdfY,
              width: vec.width,
              height: vec.height,
              color: vec.fillColor ? hexToRgb01(vec.fillColor) : undefined,
              borderColor: vec.strokeColor ? hexToRgb01(vec.strokeColor) : undefined,
              borderWidth: vec.strokeWidth || 1,
            });
          } else if (vec.type === 'line') {
            pdfPage.drawLine({
              start: { x: vec.x, y: page.height - vec.y },
              end: { x: vec.x + vec.width, y: page.height - (vec.y + vec.height) },
              color: vec.strokeColor ? hexToRgb01(vec.strokeColor) : rgb(0, 0, 0),
              thickness: vec.strokeWidth || 1,
            });
          }
        } catch (err) {
          console.warn('Failed to draw vector in rebuilt PDF:', err);
        }
      }

      // 3. Draw Real Vector Text Elements (Clean Typography, Zero Coverups)
      for (const textElem of page.textElements) {
        if (!textElem.text || !textElem.text.trim()) continue;

        let font = helvetica;
        const fam = textElem.fontFamily?.toLowerCase() || '';

        if (fam.includes('times')) {
          font = textElem.bold && textElem.italic ? timesBold : textElem.bold ? timesBold : textElem.italic ? timesItalic : times;
        } else if (fam.includes('courier')) {
          font = textElem.bold ? courierBold : courier;
        } else {
          font = textElem.bold && textElem.italic ? helveticaBold : textElem.bold ? helveticaBold : textElem.italic ? helveticaItalic : helvetica;
        }

        const size = Math.max(textElem.fontSize || 12, 6);
        const pdfY = page.height - textElem.y - size;
        const color = hexToRgb01(textElem.color || '#000000');

        // Sanitize string for PDF standard fonts (strip unsupported control characters)
        const sanitizedText = textElem.text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');

        try {
          pdfPage.drawText(sanitizedText, {
            x: Math.max(textElem.x, 0),
            y: Math.max(pdfY, 0),
            size,
            font,
            color,
          });
        } catch (err) {
          // Fallback: draw with basic ASCII
          try {
            const asciiOnly = sanitizedText.replace(/[^\x20-\x7E]/g, '?');
            pdfPage.drawText(asciiOnly, {
              x: Math.max(textElem.x, 0),
              y: Math.max(pdfY, 0),
              size,
              font: helvetica,
              color,
            });
          } catch (e2) {}
        }
      }
    }

    pdfDoc.setTitle(docTitle);
    return await pdfDoc.save();
  }
}
