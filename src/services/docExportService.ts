import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
} from 'docx';
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import type { DocParagraph } from '../types/pdf';

/**
 * Converts a base64 Data URL to a Uint8Array
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1] || parts[0]);
  const u8 = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    u8[i] = byteString.charCodeAt(i);
  }
  return u8;
}

/**
 * Token-based parser for nested HTML tags: <b>, <strong>, <i>, <em>, <u>, <sub>, <sup>
 */
function parseFormattedTextRuns(rawText: string): TextRun[] {
  if (!rawText) return [new TextRun('')];

  const runs: TextRun[] = [];
  const tokenRegex = /(<\/?(?:b|strong|i|em|u|sub|sup)>)/gi;
  const parts = rawText.split(tokenRegex);

  let bold = false;
  let italics = false;
  let underline = false;
  let subScript = false;
  let superScript = false;

  for (const part of parts) {
    if (!part) continue;

    const lower = part.toLowerCase();
    if (lower === '<b>' || lower === '<strong>') {
      bold = true;
    } else if (lower === '</b>' || lower === '</strong>') {
      bold = false;
    } else if (lower === '<i>' || lower === '<em>') {
      italics = true;
    } else if (lower === '</i>' || lower === '</em>') {
      italics = false;
    } else if (lower === '<u>') {
      underline = true;
    } else if (lower === '</u>') {
      underline = false;
    } else if (lower === '<sub>') {
      subScript = true;
    } else if (lower === '</sub>') {
      subScript = false;
    } else if (lower === '<sup>') {
      superScript = true;
    } else if (lower === '</sup>') {
      superScript = false;
    } else {
      runs.push(
        new TextRun({
          text: part,
          bold: bold || undefined,
          italics: italics || undefined,
          underline: underline ? {} : undefined,
          subScript: subScript || undefined,
          superScript: superScript || undefined,
        })
      );
    }
  }

  return runs.length > 0 ? runs : [new TextRun(rawText)];
}

export class DocExportService {
  /**
   * Export structured document paragraphs, tables (with images), and diagrams to a native Microsoft Word (.docx) file
   */
  public static async exportToDocx(
    paragraphs: DocParagraph[],
    docTitle: string = 'Converted_Document'
  ): Promise<Blob> {
    const docChildren: (Paragraph | Table)[] = [];

    for (const p of paragraphs) {
      // 0. STANDALONE IMAGES & DIAGRAMS
      if (p.type === 'image' && p.imageUrl) {
        try {
          const imgBytes = dataUrlToUint8Array(p.imageUrl);
          const w = Math.min(p.imageWidth || 450, 480);
          const h = Math.min(p.imageHeight || 280, 350);
          const isPng = p.imageUrl.startsWith('data:image/png');

          docChildren.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imgBytes,
                  type: isPng ? 'png' : 'jpg',
                  transformation: {
                    width: w,
                    height: h,
                  },
                } as any),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 180, after: 60 },
            })
          );

          if (p.caption) {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: p.caption,
                    italics: true,
                    size: 18,
                    color: '666666',
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 140 },
              })
            );
          }
        } catch (e) {
          console.warn('Could not add image to docx:', e);
        }
        continue;
      }

      // 1. HEADINGS (H1, H2, H3)
      if (p.type === 'h1') {
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(p.text),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 120 },
          })
        );
        continue;
      }

      if (p.type === 'h2') {
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(p.text),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 80 },
          })
        );
        continue;
      }

      if (p.type === 'h3') {
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(p.text),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 160, after: 60 },
          })
        );
        continue;
      }

      // 2. TABLES (WITH SUPPORT FOR TEXT AND IMAGES IN CELLS)
      if (p.type === 'table' && p.tableData && p.tableData.length > 0) {
        const rows = p.tableData.map((rowCells, rowIdx) => {
          const isHeader = rowIdx === 0;
          return new TableRow({
            children: rowCells.map((cellContent) => {
              const cellChildren: (Paragraph)[] = [];

              if (cellContent && cellContent.includes('data:image/')) {
                const imgMatch = cellContent.match(/data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/);
                if (imgMatch) {
                  try {
                    const imgBytes = dataUrlToUint8Array(imgMatch[0]);
                    const isPng = imgMatch[0].startsWith('data:image/png');
                    cellChildren.push(
                      new Paragraph({
                        children: [
                          new ImageRun({
                            data: imgBytes,
                            type: isPng ? 'png' : 'jpg',
                            transformation: {
                              width: 140,
                              height: 100,
                            },
                          } as any),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 40, after: 40 },
                      })
                    );
                  } catch (err) {
                    console.warn('Cell image error:', err);
                  }
                }

                const textOnly = cellContent.replace(/!\[.*?\]\(data:image\/.*?\)|data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/, '').trim();
                if (textOnly) {
                  cellChildren.push(
                    new Paragraph({
                      children: parseFormattedTextRuns(textOnly),
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 20, after: 20 },
                    })
                  );
                }
              } else {
                cellChildren.push(
                  new Paragraph({
                    children: parseFormattedTextRuns(cellContent),
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 40, after: 40 },
                  })
                );
              }

              return new TableCell({
                children: cellChildren.length > 0 ? cellChildren : [new Paragraph({ text: '' })],
                shading: isHeader ? { fill: 'F3F4F6' } : undefined,
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
              });
            }),
          });
        });

        docChildren.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        continue;
      }

      // 3. BULLET LISTS
      if (p.type === 'bullet') {
        const cleanText = p.text.replace(/^[-•*▪◦–—■►✔✓]\s*/, '');
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(cleanText),
            bullet: { level: 0 },
            spacing: { before: 40, after: 40 },
          })
        );
        continue;
      }

      // 4. NUMBERED LISTS
      if (p.type === 'numbered') {
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(p.text),
            spacing: { before: 40, after: 40 },
          })
        );
        continue;
      }

      // 5. STANDARD PARAGRAPHS
      docChildren.push(
        new Paragraph({
          children: parseFormattedTextRuns(p.text),
          spacing: { before: 60, after: 60 },
        })
      );
    }

    const doc = new Document({
      title: docTitle,
      sections: [
        {
          properties: {},
          children: docChildren,
        },
      ],
    });

    return await Packer.toBlob(doc);
  }

  /**
   * Export structured document to a PRISTINE Clean Vector PDF (100% real digital vector text, no coverups)
   */
  public static async exportToCleanPdf(
    paragraphs: DocParagraph[],
    docTitle: string = 'Document'
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const pageWidth = 595.28; // A4 width
    const pageHeight = 841.89; // A4 height
    const margin = 45;
    const contentWidth = pageWidth - margin * 2;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let currentY = pageHeight - margin;

    const checkPageBreak = (neededHeight: number) => {
      if (currentY - neededHeight < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }
    };

    for (const p of paragraphs) {
      // 0. IMAGES & FIGURES
      if (p.type === 'image' && p.imageUrl) {
        try {
          const imgBytes = dataUrlToUint8Array(p.imageUrl);
          let embedded;
          if (p.imageUrl.startsWith('data:image/png')) {
            embedded = await pdfDoc.embedPng(imgBytes);
          } else {
            embedded = await pdfDoc.embedJpg(imgBytes);
          }

          const maxW = Math.min(contentWidth, 420);
          const maxH = 260;
          const scaleRatio = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
          const renderW = embedded.width * scaleRatio;
          const renderH = embedded.height * scaleRatio;

          checkPageBreak(renderH + 30);
          const imgX = margin + (contentWidth - renderW) / 2;
          const imgY = currentY - renderH;

          currentPage.drawImage(embedded, {
            x: imgX,
            y: imgY,
            width: renderW,
            height: renderH,
          });

          currentY -= renderH + 12;

          if (p.caption) {
            checkPageBreak(16);
            const capText = p.caption;
            const capW = helveticaItalic.widthOfTextAtSize(capText, 9);
            currentPage.drawText(capText, {
              x: margin + (contentWidth - capW) / 2,
              y: currentY,
              size: 9,
              font: helveticaItalic,
              color: rgb(0.4, 0.4, 0.4),
            });
            currentY -= 18;
          }
        } catch (e) {
          console.warn('PDF image embed error:', e);
        }
        continue;
      }

      // 1. HEADINGS
      if (p.type === 'h1' || p.type === 'h2' || p.type === 'h3') {
        const fontSize = p.type === 'h1' ? 18 : p.type === 'h2' ? 14 : 12;
        const font = helveticaBold;
        const cleanText = p.text.replace(/<[^>]+>/g, '');

        checkPageBreak(fontSize + 18);
        currentY -= p.type === 'h1' ? 16 : 10;

        currentPage.drawText(cleanText, {
          x: margin,
          y: currentY,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });

        currentY -= fontSize + 8;
        continue;
      }

      // 2. TABLES
      if (p.type === 'table' && p.tableData && p.tableData.length > 0) {
        const rows = p.tableData;
        const numCols = rows[0]?.length || 1;
        const colWidth = contentWidth / numCols;
        const rowHeight = 22;

        checkPageBreak(rows.length * rowHeight + 20);

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const isHeader = rIdx === 0;
          checkPageBreak(rowHeight);

          // Draw header background
          if (isHeader) {
            currentPage.drawRectangle({
              x: margin,
              y: currentY - rowHeight,
              width: contentWidth,
              height: rowHeight,
              color: rgb(0.94, 0.95, 0.97),
            });
          }

          // Draw cell borders and text
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            const cellX = margin + cIdx * colWidth;
            const cellY = currentY - rowHeight;
            const cellContent = row[cIdx] || '';
            const cellClean = cellContent.replace(/!\[.*?\]\(.*?\)|<[^>]+>/g, '').trim();

            currentPage.drawRectangle({
              x: cellX,
              y: cellY,
              width: colWidth,
              height: rowHeight,
              borderColor: rgb(0.8, 0.8, 0.8),
              borderWidth: 0.5,
            });

            if (cellClean) {
              const font = isHeader ? helveticaBold : helvetica;
              const textFit = cellClean.length > 25 ? cellClean.substring(0, 22) + '...' : cellClean;
              currentPage.drawText(textFit, {
                x: cellX + 4,
                y: cellY + 6,
                size: 9.5,
                font,
                color: rgb(0.15, 0.15, 0.15),
              });
            }
          }

          currentY -= rowHeight;
        }

        currentY -= 12;
        continue;
      }

      // 3. PARAGRAPHS AND LISTS
      const isBullet = p.type === 'bullet';
      const isNumbered = p.type === 'numbered';
      const fontSize = 10;
      const font = helvetica;
      const rawClean = p.text.replace(/<[^>]+>/g, '');
      const prefix = isBullet ? '• ' : '';
      const textToWrap = prefix + rawClean;

      // Word wrapping
      const words = textToWrap.split(/\s+/);
      let line = '';
      const lines: string[] = [];

      for (const w of words) {
        const testLine = line ? `${line} ${w}` : w;
        const testW = font.widthOfTextAtSize(testLine, fontSize);
        if (testW > contentWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);

      checkPageBreak(lines.length * 14 + 10);

      for (const l of lines) {
        currentPage.drawText(l, {
          x: margin + (isBullet || isNumbered ? 12 : 0),
          y: currentY,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        currentY -= 14;
      }

      currentY -= 6;
    }

    return await pdfDoc.save();
  }

  /**
   * Export to HTML with full support for tables, images in cells, formulas, headings, bold, underline, italics
   */
  public static exportToHtml(paragraphs: DocParagraph[], docTitle: string = 'Document'): string {
    let bodyHtml = '';

    for (const p of paragraphs) {
      if (p.type === 'image' && p.imageUrl) {
        bodyHtml += `
          <figure style="text-align: center; margin: 24px 0;">
            <img src="${p.imageUrl}" alt="${p.caption || 'Figure'}" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
            ${p.caption ? `<figcaption style="font-size: 13px; color: #6b7280; font-style: italic; margin-top: 6px;">${p.caption}</figcaption>` : ''}
          </figure>
        `;
        continue;
      }

      if (p.type === 'h1') {
        bodyHtml += `<h1 style="font-size: 26px; font-weight: 700; color: #111827; margin: 24px 0 12px 0;">${p.text}</h1>\n`;
        continue;
      }

      if (p.type === 'h2') {
        bodyHtml += `<h2 style="font-size: 20px; font-weight: 600; color: #1f2937; margin: 20px 0 10px 0;">${p.text}</h2>\n`;
        continue;
      }

      if (p.type === 'h3') {
        bodyHtml += `<h3 style="font-size: 16px; font-weight: 600; color: #374151; margin: 16px 0 8px 0;">${p.text}</h3>\n`;
        continue;
      }

      if (p.type === 'table' && p.tableData) {
        bodyHtml += `<table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #d1d5db; font-size: 14px;">\n`;
        p.tableData.forEach((row, rIdx) => {
          bodyHtml += `  <tr style="${rIdx === 0 ? 'background-color: #f9fafb; font-weight: 600;' : ''}">\n`;
          row.forEach((cell) => {
            const isImg = cell.includes('data:image/');
            const tag = rIdx === 0 ? 'th' : 'td';
            bodyHtml += `    <${tag} style="border: 1px solid #d1d5db; padding: 8px 12px; text-align: left;">`;
            if (isImg) {
              const match = cell.match(/data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/);
              if (match) {
                bodyHtml += `<img src="${match[0]}" alt="Table figure" style="max-width: 160px; max-height: 120px; object-contain; display: block; margin-bottom: 4px;" />`;
              }
              const textOnly = cell.replace(/!\[.*?\]\(data:image\/.*?\)|data:image\/[a-zA-Z]+;base64,[^"'\s\)]+/, '').trim();
              if (textOnly) bodyHtml += `<span>${textOnly}</span>`;
            } else {
              bodyHtml += cell;
            }
            bodyHtml += `</${tag}>\n`;
          });
          bodyHtml += `  </tr>\n`;
        });
        bodyHtml += `</table>\n`;
        continue;
      }

      if (p.type === 'bullet') {
        const clean = p.text.replace(/^[-•*▪◦–—■►✔✓]\s*/, '');
        bodyHtml += `<ul style="margin: 6px 0; padding-left: 24px;"><li style="font-size: 15px; line-height: 1.6; color: #374151;">${clean}</li></ul>\n`;
        continue;
      }

      if (p.type === 'numbered') {
        bodyHtml += `<p style="margin: 6px 0; font-size: 15px; line-height: 1.6; color: #374151;">${p.text}</p>\n`;
        continue;
      }

      bodyHtml += `<p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 10px 0;">${p.text}</p>\n`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1f2937;
      background: #ffffff;
    }
    table, th, td { border: 1px solid #d1d5db; }
    sub { vertical-align: sub; font-size: smaller; }
    sup { vertical-align: super; font-size: smaller; }
    u { text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
  }

  /**
   * Export to Plain Text
   */
  public static exportToTxt(paragraphs: DocParagraph[]): string {
    return paragraphs
      .map((p) => {
        if (p.type === 'table' && p.tableData) {
          return p.tableData.map((row) => row.join('\t')).join('\n');
        }
        return p.text.replace(/<[^>]+>/g, '');
      })
      .join('\n\n');
  }
}
