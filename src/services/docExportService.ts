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
 * Parses inline formatting tags (<sup>, <sub>, <b>, <i>) into docx TextRun instances
 */
function parseFormattedTextRuns(rawText: string): TextRun[] {
  if (!rawText) return [new TextRun('')];

  const runs: TextRun[] = [];
  // Regex to match <sup>...</sup>, <sub>...</sub>, <b>...</b>, <i>...</i>
  const tagRegex = /<(sup|sub|b|i)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    const textBefore = rawText.substring(lastIndex, match.index);
    if (textBefore) {
      runs.push(new TextRun(textBefore));
    }

    const tag = match[1].toLowerCase();
    const content = match[2];

    if (tag === 'sup') {
      runs.push(new TextRun({ text: content, superScript: true }));
    } else if (tag === 'sub') {
      runs.push(new TextRun({ text: content, subScript: true }));
    } else if (tag === 'b') {
      runs.push(new TextRun({ text: content, bold: true }));
    } else if (tag === 'i') {
      runs.push(new TextRun({ text: content, italics: true }));
    }

    lastIndex = tagRegex.lastIndex;
  }

  const remaining = rawText.substring(lastIndex);
  if (remaining) {
    runs.push(new TextRun(remaining));
  }

  return runs.length > 0 ? runs : [new TextRun(rawText)];
}

export class DocExportService {
  /**
   * Export structured document paragraphs, tables, and diagrams to a native Microsoft Word (.docx) file
   */
  public static async exportToDocx(
    paragraphs: DocParagraph[],
    docTitle: string = 'Converted_Document'
  ): Promise<Blob> {
    const docChildren: (Paragraph | Table)[] = [];

    for (const p of paragraphs) {
      // 0. IMAGES & DIAGRAMS
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

      // 1. HEADINGS
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

      // 2. TABLES
      if (p.type === 'table' && p.tableData && p.tableData.length > 0) {
        const rows = p.tableData.map((rowCells, rowIdx) => {
          const isHeader = rowIdx === 0;
          return new TableRow({
            children: rowCells.map((cellText) => {
              return new TableCell({
                children: [
                  new Paragraph({
                    children: parseFormattedTextRuns(cellText),
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 40, after: 40 },
                  }),
                ],
                shading: isHeader
                  ? { fill: 'F3F4F6' } // Light gray header
                  : undefined,
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
                },
                margins: {
                  top: 100,
                  bottom: 100,
                  left: 140,
                  right: 140,
                },
              });
            }),
            tableHeader: isHeader,
          });
        });

        const docTable = new Table({
          rows,
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          alignment: AlignmentType.CENTER,
        });

        docChildren.push(docTable);
        // Add spacing after table
        docChildren.push(
          new Paragraph({
            children: [],
            spacing: { before: 80, after: 120 },
          })
        );
        continue;
      }

      // 3. BULLET LISTS
      if (p.type === 'bullet') {
        const cleanText = p.text.replace(/^[-•*▪◦–—]\s*/, '');
        docChildren.push(
          new Paragraph({
            children: parseFormattedTextRuns(cleanText),
            bullet: {
              level: 0,
            },
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
            indent: { left: 360 },
          })
        );
        continue;
      }

      // 5. STANDARD PARAGRAPHS
      docChildren.push(
        new Paragraph({
          children: parseFormattedTextRuns(p.text),
          spacing: { before: 80, after: 80 },
        })
      );
    }

    const doc = new Document({
      title: docTitle,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children: docChildren,
        },
      ],
    });

    return await Packer.toBlob(doc);
  }

  /**
   * Export to styled HTML document
   */
  public static exportToHtml(paragraphs: DocParagraph[], title: string = 'Document'): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1 { font-size: 28px; margin-top: 32px; color: #111827; }
    h2 { font-size: 22px; margin-top: 24px; color: #1f2937; }
    h3 { font-size: 18px; margin-top: 20px; color: #374151; }
    p { margin: 12px 0; }
    ul, ol { margin: 12px 0; padding-left: 28px; }
    li { margin-bottom: 6px; }
    sup { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; top: -0.5em; }
    sub { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; bottom: -0.25em; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
    th { background-color: #f3f4f6; font-weight: 600; }
    .figure-box { text-align: center; margin: 24px 0; }
    .figure-box img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; }
    .figure-caption { font-size: 12px; color: #6b7280; margin-top: 6px; font-style: italic; }
  </style>
</head>
<body>\n`;

    for (const p of paragraphs) {
      if (p.type === 'image' && p.imageUrl) {
        html += `  <div class="figure-box">\n`;
        html += `    <img src="${p.imageUrl}" alt="${p.caption || 'Diagram'}" />\n`;
        if (p.caption) {
          html += `    <div class="figure-caption">${p.caption}</div>\n`;
        }
        html += `  </div>\n`;
      } else if (p.type === 'h1') {
        html += `  <h1>${p.text}</h1>\n`;
      } else if (p.type === 'h2') {
        html += `  <h2>${p.text}</h2>\n`;
      } else if (p.type === 'h3') {
        html += `  <h3>${p.text}</h3>\n`;
      } else if (p.type === 'bullet') {
        html += `  <ul><li>${p.text.replace(/^[-•*▪◦–—]\s*/, '')}</li></ul>\n`;
      } else if (p.type === 'numbered') {
        html += `  <ol><li>${p.text}</li></ol>\n`;
      } else if (p.type === 'table' && p.tableData) {
        html += `  <table>\n`;
        p.tableData.forEach((row, rIdx) => {
          html += `    <tr>\n`;
          row.forEach((cell) => {
            if (rIdx === 0) {
              html += `      <th>${cell}</th>\n`;
            } else {
              html += `      <td>${cell}</td>\n`;
            }
          });
          html += `    </tr>\n`;
        });
        html += `  </table>\n`;
      } else {
        html += `  <p>${p.text}</p>\n`;
      }
    }

    html += `</body>\n</html>`;
    return html;
  }

  /**
   * Export to formatted plain text
   */
  public static exportToPlainText(paragraphs: DocParagraph[]): string {
    return paragraphs
      .map((p) => {
        if (p.type === 'image') {
          return `\n[FIGURE / DIAGRAM: ${p.caption || 'Embedded Image'}]\n`;
        }
        if (p.type === 'table' && p.tableData) {
          return p.tableData.map((r) => r.join('\t|\t')).join('\n');
        }
        // Strip html tags for plain text
        return p.text.replace(/<[^>]+>/g, '');
      })
      .join('\n\n');
  }
}
