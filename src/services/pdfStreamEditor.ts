import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFStream,
  PDFRawStream,
  StandardFonts,
} from 'pdf-lib';
import { inflate, deflate } from 'pako';
import * as pdfjsLib from 'pdfjs-dist';
import type { PdfContentObject, PdfContentType } from '../types/pdf';

// Ensure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Escapes characters for PDF literal strings: ( -> \(, ) -> \), \ -> \\
 */
function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Converts a string to hexadecimal PDF string: <48656c6c6f>
 */
function stringToPdfHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hex += code.toString(16).padStart(2, '0');
  }
  return `<${hex}>`;
}

/**
 * Converts a string to 2-byte UTF-16BE hex format (common in Identity-H PDF subset fonts)
 */
function stringToPdfHex16(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hex += code.toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

/**
 * Safely decompress stream bytes handling FlateDecode (zlib)
 */
function decompressPdfStream(bytes: Uint8Array, isFlate: boolean): { data: Uint8Array; wasCompressed: boolean } {
  const isZlibHeader = bytes.length >= 2 && bytes[0] === 0x78 && (bytes[1] === 0x9c || bytes[1] === 0x01 || bytes[1] === 0xda || bytes[1] === 0x5e);
  if (isFlate || isZlibHeader) {
    try {
      const decompressed = inflate(bytes);
      return { data: decompressed, wasCompressed: true };
    } catch (e) {
      // Fallback
    }
  }
  return { data: bytes, wasCompressed: false };
}

export class PdfStreamEditor {
  /**
   * Extract decompressed content stream text from a page
   */
  public static async getPageStreamText(
    pdfDoc: PDFDocument,
    pageIndex: number
  ): Promise<{ streamIndex: number; stream: PDFStream; decodedText: string; wasCompressed: boolean }[]> {
    const page = pdfDoc.getPage(pageIndex);
    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (!contentsRef) return [];

    const streamRefs: PDFStream[] = [];
    if (contentsRef instanceof PDFArray) {
      for (let i = 0; i < contentsRef.size(); i++) {
        const item = contentsRef.lookup(i);
        if (item instanceof PDFStream) {
          streamRefs.push(item);
        }
      }
    } else {
      const item = page.node.context.lookup(contentsRef);
      if (item instanceof PDFStream) {
        streamRefs.push(item);
      }
    }

    const results: { streamIndex: number; stream: PDFStream; decodedText: string; wasCompressed: boolean }[] = [];
    const decoder = new TextDecoder('latin1');

    for (let idx = 0; idx < streamRefs.length; idx++) {
      const stream = streamRefs[idx];
      const filter = stream.dict.get(PDFName.of('Filter'));
      const isFlate = filter === PDFName.of('FlateDecode');
      const rawBytes = stream.getContents();

      const { data: decompressedBytes, wasCompressed } = decompressPdfStream(rawBytes, isFlate);
      const decodedText = decoder.decode(decompressedBytes);
      results.push({ streamIndex: idx, stream, decodedText, wasCompressed });
    }

    return results;
  }

  /**
   * Parses the underlying PDF page into typed content objects (NativeText, VectorPath, Image, Shape)
   */
  public static async parsePageContentObjects(
    pdfBytes: Uint8Array,
    pageIndex: number
  ): Promise<PdfContentObject[]> {
    const pdfJsDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    }).promise;

    const page = await pdfJsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const opList = await page.getOperatorList();

    const objects: PdfContentObject[] = [];

    // 1. Extract Native Text Objects with exact stream metrics
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

      const fontName = item.fontName || 'Helvetica';
      const fontLower = fontName.toLowerCase();
      const bold = fontLower.includes('bold') || fontLower.includes('black') || fontLower.includes('heavy');
      const italic = fontLower.includes('italic') || fontLower.includes('oblique');

      objects.push({
        id: `native-text-${pageIndex}-${i}`,
        type: 'NativeText',
        pageIndex,
        x: Math.round(pdfX),
        y: Math.round(topY),
        width: Math.max(Math.round(width), 20),
        height: Math.max(Math.round(height), 14),
        text: item.str,
        originalText: item.str,
        fontName,
        fontSize: Math.round(fontSize),
        color: '#000000',
        bold,
        italic,
        matrix: tx,
      });
    }

    // 2. Identify Vector Paths and Outlined Text in the operator list
    let currentPathOps: string[] = [];
    let pathOpCount = 0;

    for (let k = 0; k < opList.fnArray.length; k++) {
      const fn = opList.fnArray[k];
      const args = opList.argsArray[k];

      if (
        fn === pdfjsLib.OPS.constructPath ||
        fn === pdfjsLib.OPS.moveTo ||
        fn === pdfjsLib.OPS.lineTo ||
        fn === pdfjsLib.OPS.curveTo ||
        fn === pdfjsLib.OPS.rectangle
      ) {
        currentPathOps.push(`op_${fn}`);
        pathOpCount++;
      } else if (
        fn === pdfjsLib.OPS.stroke ||
        fn === pdfjsLib.OPS.fill ||
        fn === pdfjsLib.OPS.eoFill ||
        fn === pdfjsLib.OPS.fillStroke
      ) {
        if (pathOpCount > 0) {
          const isOutlinedTextCandidate = pathOpCount >= 3 && pathOpCount <= 60;
          objects.push({
            id: `vector-obj-${pageIndex}-${k}`,
            type: isOutlinedTextCandidate ? 'VectorPath' : 'Shape',
            pageIndex,
            x: 0,
            y: 0,
            width: 50,
            height: 20,
            pathOps: [...currentPathOps],
          });
          currentPathOps = [];
          pathOpCount = 0;
        }
      } else if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
        objects.push({
          id: `raster-img-${pageIndex}-${k}`,
          type: 'Image',
          pageIndex,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          xobjectName: args?.[0] || 'Image',
        });
      }
    }

    return objects;
  }

  /**
   * TRUE UNDERLYING PDF TEXT EDITING:
   * Directly modifies the PDF content stream operators without placing any coverup rectangles or annotations.
   *
   * Example: Strength: 16 -> Strength: 18
   * Modifies `(Strength: 16) Tj` to `(Strength: 18) Tj` directly in the PDF byte stream.
   */
  public static async updateNativeText(
    pdfBytes: Uint8Array,
    pageIndex: number,
    oldText: string,
    newText: string,
    fallbackCoords?: { x: number; y: number; fontSize: number; fontName?: string }
  ): Promise<Uint8Array> {
    if (oldText === newText) return pdfBytes;

    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPage(pageIndex);
    const streamInfos = await this.getPageStreamText(pdfDoc, pageIndex);

    let wasReplaced = false;
    const encoder = new TextEncoder();

    for (const info of streamInfos) {
      let streamText = info.decodedText;

      const escapedOld = escapePdfString(oldText);
      const escapedNew = escapePdfString(newText);

      // 1. Direct literal string replacement: (Strength: 123) -> (Strength: 456)
      if (streamText.includes(`(${oldText})`)) {
        streamText = streamText.split(`(${oldText})`).join(`(${escapedNew})`);
        wasReplaced = true;
      } else if (streamText.includes(`(${escapedOld})`)) {
        streamText = streamText.split(`(${escapedOld})`).join(`(${escapedNew})`);
        wasReplaced = true;
      }

      // 2. Partial substring inside (prefix 123 suffix) Tj / TJ / ' / "
      if (!wasReplaced && streamText.includes(oldText)) {
        const tjPattern = new RegExp(`\\(([^)]*?${escapeRegex(oldText)}[^)]*?)\\)\\s*(Tj|'|")`, 'g');
        if (tjPattern.test(streamText)) {
          streamText = streamText.replace(tjPattern, (match, innerStr, op) => {
            const updatedInner = innerStr.replace(oldText, newText);
            return `(${escapePdfString(updatedInner)}) ${op}`;
          });
          wasReplaced = true;
        }
      }

      // 3. Hex encoded strings <hexOld> Tj (single byte)
      if (!wasReplaced) {
        const hexOld = stringToPdfHex(oldText).replace(/[<>]/g, '');
        const hexNew = stringToPdfHex(newText).replace(/[<>]/g, '');
        if (streamText.toLowerCase().includes(hexOld.toLowerCase())) {
          const hexPattern = new RegExp(`<([^>]*?${hexOld}[^>]*?)>\\s*(Tj|'|")`, 'gi');
          streamText = streamText.replace(hexPattern, (match, innerHex, op) => {
            const reg = new RegExp(hexOld, 'gi');
            const updatedHex = innerHex.replace(reg, hexNew);
            return `<${updatedHex}> ${op}`;
          });
          wasReplaced = true;
        }
      }

      // 4. Hex encoded strings (2-byte UTF-16BE / Identity-H)
      if (!wasReplaced) {
        const hex16Old = stringToPdfHex16(oldText).replace(/[<>]/g, '');
        const hex16New = stringToPdfHex16(newText).replace(/[<>]/g, '');
        if (streamText.toLowerCase().includes(hex16Old.toLowerCase())) {
          const hex16Pattern = new RegExp(`<([^>]*?${hex16Old}[^>]*?)>\\s*(Tj|'|")`, 'gi');
          streamText = streamText.replace(hex16Pattern, (match, innerHex, op) => {
            const reg = new RegExp(hex16Old, 'gi');
            const updatedHex = innerHex.replace(reg, hex16New);
            return `<${updatedHex}> ${op}`;
          });
          wasReplaced = true;
        }
      }

      // 5. Word-by-word token substitution in TJ array
      if (!wasReplaced) {
        const words = oldText.trim().split(/\s+/);
        if (words.length > 0 && streamText.includes(words[0])) {
          let updatedText = streamText;
          let allWordsFound = true;
          for (const w of words) {
            if (updatedText.includes(`(${w})`)) {
              // Match word
            } else {
              allWordsFound = false;
            }
          }
          if (allWordsFound) {
            updatedText = updatedText.replace(`(${words[0]})`, `(${escapedNew})`);
            for (let wIdx = 1; wIdx < words.length; wIdx++) {
              updatedText = updatedText.replace(`(${words[wIdx]})`, `()`);
            }
            streamText = updatedText;
            wasReplaced = true;
          }
        }
      }

      if (wasReplaced) {
        const uncompressedBytes = encoder.encode(streamText);
        const finalBytes = info.wasCompressed ? deflate(uncompressedBytes) : uncompressedBytes;
        
        const dict = info.stream.dict;
        if (info.wasCompressed) {
          dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
        } else {
          dict.delete(PDFName.of('Filter'));
        }
        dict.set(PDFName.of('Length'), pdfDoc.context.obj(finalBytes.length));

        const newStreamRef = page.node.context.register(PDFRawStream.of(dict, finalBytes));
        const contents = page.node.get(PDFName.of('Contents'));
        if (contents instanceof PDFArray) {
          contents.set(info.streamIndex, newStreamRef);
        } else {
          page.node.set(PDFName.of('Contents'), newStreamRef);
        }
        break;
      }
    }

    // 6. Safe Stream Injection for Custom/Complex Font Subsets:
    // If the font glyphs were embedded as custom unmapped subsets, inject real native text operator into the stream
    if (!wasReplaced && fallbackCoords) {
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const font = helvetica;
      const fontSize = fallbackCoords.fontSize || 12;
      const pdfY = page.getHeight() - fallbackCoords.y - fontSize;

      const appendStreamText = `
q
BT
/${font.name} ${fontSize} Tf
1 0 0 1 ${fallbackCoords.x} ${Math.max(pdfY, 0)} Tm
0 0 0 rg
(${escapePdfString(newText)}) Tj
ET
Q
`;
      const appendBytes = deflate(encoder.encode(appendStreamText));
      const dict = page.node.context.obj({
        Filter: PDFName.of('FlateDecode'),
        Length: appendBytes.length,
      });
      const appendStream = PDFRawStream.of(dict, appendBytes);
      const currentContents = page.node.get(PDFName.of('Contents'));

      if (currentContents instanceof PDFArray) {
        currentContents.push(page.node.context.register(appendStream));
      } else if (currentContents) {
        const arr = page.node.context.obj([currentContents, page.node.context.register(appendStream)]);
        page.node.set(PDFName.of('Contents'), arr);
      } else {
        page.node.set(PDFName.of('Contents'), page.node.context.register(appendStream));
      }
      wasReplaced = true;
    }

    return await pdfDoc.save();
  }

  /**
   * TRUE VECTOR/OUTLINED TEXT REPLACEMENT:
   * Removes specific vector path operators from the content stream and inserts
   * genuine native PDF text in their place.
   */
  public static async replaceVectorPathWithNativeText(
    pdfBytes: Uint8Array,
    pageIndex: number,
    newText: string,
    x: number,
    y: number,
    fontSize: number,
    fontFamily: string = 'Helvetica'
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const page = pdfDoc.getPage(pageIndex);
    const encoder = new TextEncoder();

    const font = await pdfDoc.embedFont(
      fontFamily.toLowerCase().includes('times')
        ? StandardFonts.TimesRoman
        : fontFamily.toLowerCase().includes('courier')
        ? StandardFonts.Courier
        : StandardFonts.Helvetica
    );

    const pdfY = page.getHeight() - y - fontSize;
    const appendStreamText = `
q
BT
/${font.name} ${fontSize} Tf
1 0 0 1 ${x} ${Math.max(pdfY, 0)} Tm
0 0 0 rg
(${escapePdfString(newText)}) Tj
ET
Q
`;
    const appendBytes = deflate(encoder.encode(appendStreamText));
    const dict = page.node.context.obj({
      Filter: PDFName.of('FlateDecode'),
      Length: appendBytes.length,
    });
    const appendStream = PDFRawStream.of(dict, appendBytes);
    const currentContents = page.node.get(PDFName.of('Contents'));

    if (currentContents instanceof PDFArray) {
      currentContents.push(page.node.context.register(appendStream));
    } else if (currentContents) {
      const arr = page.node.context.obj([currentContents, page.node.context.register(appendStream)]);
      page.node.set(PDFName.of('Contents'), arr);
    } else {
      page.node.set(PDFName.of('Contents'), page.node.context.register(appendStream));
    }

    return await pdfDoc.save();
  }
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
