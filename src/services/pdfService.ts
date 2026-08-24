import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  PDFPage,
} from 'pdf-lib';
import type {
  PageInfo,
  Annotation,
  PdfMetadata,
  WatermarkConfig,
} from '../types/pdf';

// Helper to convert hex color to RGB (0-1)
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
    const g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
    const b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
    return { r, g, b };
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
  };
}

export class PdfService {
  /**
   * Load PDF bytes and parse initial page metadata
   */
  public static async loadPdf(pdfBytes: Uint8Array): Promise<{
    numPages: number;
    pages: PageInfo[];
    metadata: PdfMetadata;
  }> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const numPages = pdfDoc.getPageCount();
    const pages: PageInfo[] = [];

    for (let i = 0; i < numPages; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;

      pages.push({
        id: `page-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        pageIndex: i,
        originalPageIndex: i,
        rotation,
        width,
        height,
      });
    }

    const metadata: PdfMetadata = {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      keywords: pdfDoc.getKeywords()?.split(' ') || [],
      creator: pdfDoc.getCreator() || '',
      producer: pdfDoc.getProducer() || '',
      creationDate: pdfDoc.getCreationDate(),
      modificationDate: pdfDoc.getModificationDate(),
    };

    return { numPages, pages, metadata };
  }

  /**
   * Create a fresh empty PDF document with one blank page
   */
  public static async createBlankPdf(
    width: number = 595.28,
    height: number = 841.89 // A4 size
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([width, height]);
    return await pdfDoc.save();
  }

  /**
   * Merge multiple PDF files in given sequence into one combined PDF
   */
  public static async mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
    const mergedDoc = await PDFDocument.create();

    for (const bytes of pdfBuffers) {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    }

    return await mergedDoc.save();
  }

  /**
   * Split PDF into individual single pages
   */
  public static async splitToSinglePages(
    pdfBytes: Uint8Array
  ): Promise<{ pageNumber: number; pdfBytes: Uint8Array }[]> {
    const sourceDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();
    const results: { pageNumber: number; pdfBytes: Uint8Array }[] = [];

    for (let i = 0; i < totalPages; i++) {
      const newDoc = await PDFDocument.create();
      const [copiedPage] = await newDoc.copyPages(sourceDoc, [i]);
      newDoc.addPage(copiedPage);
      const singlePageBytes = await newDoc.save();
      results.push({
        pageNumber: i + 1,
        pdfBytes: singlePageBytes,
      });
    }

    return results;
  }

  /**
   * Split PDF by custom page ranges (e.g. [[0, 2], [3, 5]]) or arbitrary indices
   */
  public static async splitByRanges(
    pdfBytes: Uint8Array,
    ranges: { name: string; pageIndices: number[] }[]
  ): Promise<{ name: string; pdfBytes: Uint8Array }[]> {
    const sourceDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();
    const results: { name: string; pdfBytes: Uint8Array }[] = [];

    for (const range of ranges) {
      // Filter valid page indices
      const validIndices = range.pageIndices.filter(
        (idx) => idx >= 0 && idx < totalPages
      );
      if (validIndices.length === 0) continue;

      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(sourceDoc, validIndices);
      copiedPages.forEach((p) => newDoc.addPage(p));
      const rangeBytes = await newDoc.save();

      results.push({
        name: range.name,
        pdfBytes: rangeBytes,
      });
    }

    return results;
  }

  /**
   * Bake modifications (Spice page reordering, rotations, insertions, deletions)
   * AND vector annotations (text, draw, shapes, images, signatures, watermarks, stamps)
   * into a final clean PDF byte array.
   */
  public static async bakeDocument(
    sourcePdfBytes: Uint8Array,
    pagesConfig: PageInfo[],
    annotations: Record<number, Annotation[]>,
    watermark?: WatermarkConfig | null,
    metadata?: PdfMetadata | null
  ): Promise<Uint8Array> {
    const sourceDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const outputDoc = await PDFDocument.create();

    // Embed standard fonts for text annotations
    const helveticaFont = await outputDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
    const timesFont = await outputDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await outputDoc.embedFont(StandardFonts.Courier);

    // Track loaded external documents for inserted pages
    const externalDocCache = new Map<Uint8Array, PDFDocument>();

    for (let targetIndex = 0; targetIndex < pagesConfig.length; targetIndex++) {
      const pageInfo = pagesConfig[targetIndex];

      let targetPage: PDFPage;

      if (pageInfo.isBlank) {
        targetPage = outputDoc.addPage([pageInfo.width || 595.28, pageInfo.height || 841.89]);
      } else if (pageInfo.customBytes) {
        let extDoc = externalDocCache.get(pageInfo.customBytes);
        if (!extDoc) {
          extDoc = await PDFDocument.load(pageInfo.customBytes, { ignoreEncryption: true });
          externalDocCache.set(pageInfo.customBytes, extDoc);
        }
        const [copied] = await outputDoc.copyPages(extDoc, [pageInfo.originalPageIndex]);
        targetPage = outputDoc.addPage(copied);
      } else {
        const [copied] = await outputDoc.copyPages(sourceDoc, [pageInfo.originalPageIndex]);
        targetPage = outputDoc.addPage(copied);
      }

      // Apply target page rotation
      if (pageInfo.rotation !== undefined) {
        targetPage.setRotation(degrees(pageInfo.rotation));
      }

      const pageSize = targetPage.getSize();
      const pageHeight = pageSize.height;

      // 1. Bake Annotations for this page
      const pageAnnotations = annotations[targetIndex] || [];
      for (const ann of pageAnnotations) {
        const annOpacity = ann.opacity !== undefined ? ann.opacity : 1;

        if (ann.type === 'text') {
          const font = ann.bold
            ? helveticaBold
            : ann.fontFamily === 'TimesRoman'
            ? timesFont
            : ann.fontFamily === 'Courier'
            ? courierFont
            : helveticaFont;

          const { r, g, b } = hexToRgb(ann.color || '#000000');
          // In PDF coordinate system, (0, 0) is bottom-left
          const pdfY = pageHeight - ann.y - (ann.height || ann.fontSize);

          // Background if specified
          if (ann.backgroundColor && ann.backgroundColor !== 'transparent') {
            const bgRgb = hexToRgb(ann.backgroundColor);
            targetPage.drawRectangle({
              x: ann.x,
              y: pdfY,
              width: ann.width || 120,
              height: ann.height || ann.fontSize + 6,
              color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
              opacity: annOpacity,
            });
          }

          targetPage.drawText(ann.text || '', {
            x: ann.x + 2,
            y: pdfY + 2,
            size: ann.fontSize || 14,
            font,
            color: rgb(r, g, b),
            opacity: annOpacity,
          });
        } else if (ann.type === 'rectangle' || ann.type === 'redact') {
          const isRedact = ann.type === 'redact';
          const { r, g, b } = hexToRgb(
            isRedact ? ann.color || '#000000' : ann.fillColor || ann.strokeColor || '#000000'
          );
          const pdfY = pageHeight - ann.y - ann.height;

          if (isRedact || ann.fillColor) {
            targetPage.drawRectangle({
              x: ann.x,
              y: pdfY,
              width: ann.width,
              height: ann.height,
              color: rgb(r, g, b),
              opacity: isRedact ? 1 : annOpacity,
            });
          }

          if (!isRedact && ann.strokeColor && (!ann.fillColor || ann.strokeWidth > 0)) {
            const strokeRgb = hexToRgb(ann.strokeColor);
            targetPage.drawRectangle({
              x: ann.x,
              y: pdfY,
              width: ann.width,
              height: ann.height,
              borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              borderWidth: ann.strokeWidth || 1,
              opacity: annOpacity,
            });
          }
        } else if (ann.type === 'circle') {
          const rx = ann.width / 2;
          const ry = ann.height / 2;
          const cx = ann.x + rx;
          const cy = pageHeight - (ann.y + ry);

          const strokeRgb = hexToRgb(ann.strokeColor || '#000000');
          const fillRgb = ann.fillColor ? hexToRgb(ann.fillColor) : undefined;

          targetPage.drawEllipse({
            x: cx,
            y: cy,
            xScale: rx,
            yScale: ry,
            borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
            borderWidth: ann.strokeWidth || 1,
            color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
            opacity: annOpacity,
          });
        } else if (ann.type === 'line' || ann.type === 'arrow') {
          const startX = ann.x;
          const startY = pageHeight - ann.y;
          const endX = ann.x + ann.width;
          const endY = pageHeight - (ann.y + ann.height);
          const strokeRgb = hexToRgb(ann.strokeColor || '#000000');

          targetPage.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: ann.strokeWidth || 2,
            color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
            opacity: annOpacity,
          });

          // Draw arrowhead if arrow
          if (ann.type === 'arrow') {
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowLen = 12;
            const arrowAngle = Math.PI / 6;

            const arrowP1 = {
              x: endX - arrowLen * Math.cos(angle - arrowAngle),
              y: endY - arrowLen * Math.sin(angle - arrowAngle),
            };
            const arrowP2 = {
              x: endX - arrowLen * Math.cos(angle + arrowAngle),
              y: endY - arrowLen * Math.sin(angle + arrowAngle),
            };

            targetPage.drawLine({
              start: { x: endX, y: endY },
              end: arrowP1,
              thickness: ann.strokeWidth || 2,
              color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              opacity: annOpacity,
            });
            targetPage.drawLine({
              start: { x: endX, y: endY },
              end: arrowP2,
              thickness: ann.strokeWidth || 2,
              color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
              opacity: annOpacity,
            });
          }
        } else if (ann.type === 'draw' || ann.type === 'highlight') {
          if (ann.points && ann.points.length > 1) {
            const strokeRgb = hexToRgb(ann.strokeColor || (ann.isHighlighter ? '#facc15' : '#000000'));
            const drawOpacity = ann.isHighlighter ? 0.35 : annOpacity;
            const thickness = ann.isHighlighter ? (ann.strokeWidth || 18) : (ann.strokeWidth || 2);

            for (let p = 0; p < ann.points.length - 1; p++) {
              const p1 = ann.points[p];
              const p2 = ann.points[p + 1];

              targetPage.drawLine({
                start: { x: p1.x, y: pageHeight - p1.y },
                end: { x: p2.x, y: pageHeight - p2.y },
                thickness,
                color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
                opacity: drawOpacity,
              });
            }
          }
        } else if (
          (ann.type === 'signature' || ann.type === 'image' || ann.type === 'stamp') &&
          ann.dataUrl
        ) {
          try {
            let embeddedImage;
            if (ann.dataUrl.startsWith('data:image/png')) {
              embeddedImage = await outputDoc.embedPng(ann.dataUrl);
            } else if (
              ann.dataUrl.startsWith('data:image/jpeg') ||
              ann.dataUrl.startsWith('data:image/jpg')
            ) {
              embeddedImage = await outputDoc.embedJpg(ann.dataUrl);
            } else {
              // Convert any other image format to PNG in canvas
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = ann.dataUrl;
              });
              const c = document.createElement('canvas');
              c.width = img.width;
              c.height = img.height;
              const ctx = c.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const pngUrl = c.toDataURL('image/png');
                embeddedImage = await outputDoc.embedPng(pngUrl);
              }
            }

            if (embeddedImage) {
              const pdfY = pageHeight - ann.y - ann.height;
              targetPage.drawImage(embeddedImage, {
                x: ann.x,
                y: pdfY,
                width: ann.width,
                height: ann.height,
                opacity: annOpacity,
              });
            }
          } catch (err) {
            console.error('Failed to embed image/signature onto PDF page:', err);
          }
        }
      }

      // 2. Bake Watermark if configured
      if (watermark && (watermark.applyToAllPages || targetIndex === 0) && watermark.text.trim()) {
        const { r, g, b } = hexToRgb(watermark.color || '#94a3b8');
        const wmSize = watermark.fontSize || 48;
        const wmRotation = degrees(watermark.rotation || 45);

        targetPage.drawText(watermark.text, {
          x: pageSize.width / 4,
          y: pageSize.height / 2,
          size: wmSize,
          font: helveticaBold,
          color: rgb(r, g, b),
          opacity: watermark.opacity || 0.25,
          rotate: wmRotation,
        });
      }
    }

    // Set metadata if provided
    if (metadata) {
      if (metadata.title) outputDoc.setTitle(metadata.title);
      if (metadata.author) outputDoc.setAuthor(metadata.author);
      if (metadata.subject) outputDoc.setSubject(metadata.subject);
      if (metadata.creator) outputDoc.setCreator(metadata.creator);
      if (metadata.producer) outputDoc.setProducer(metadata.producer);
      if (metadata.keywords && metadata.keywords.length > 0) {
        outputDoc.setKeywords(metadata.keywords);
      }
    }

    return await outputDoc.save();
  }
}
