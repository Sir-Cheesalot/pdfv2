import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray } from 'pdf-lib';
import { PdfStreamEditor } from '../src/services/pdfStreamEditor';
import * as path from 'path';

// Helper to convert hex string <537472656E6774683A20313233> to decoded string
function decodeStreamHexStrings(streamText: string): string {
  return streamText.replace(/<([0-9a-fA-F\s]+)>/g, (_, hex) => {
    const clean = hex.replace(/\s/g, '');
    let str = '';
    for (let i = 0; i < clean.length; i += 2) {
      str += String.fromCharCode(parseInt(clean.substring(i, i + 2), 16));
    }
    return `"${str}"`;
  });
}

async function runCriticalTest() {
  console.log('=== RUNNING CRITICAL PDF STREAM EDITING TEST ===\n');

  // STEP 1: Create a PDF containing the text "Strength: 123" and unrelated text "Speed: 99"
  console.log('1. Creating original test PDF with text "Strength: 123" and "Speed: 99"...');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('Strength: 123', {
    x: 72,
    y: 750,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText('Speed: 99', {
    x: 72,
    y: 700,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });

  const originalPdfBytes = await pdfDoc.save();
  console.log('✓ Original PDF created (size:', originalPdfBytes.length, 'bytes)');

  // Verify original stream contains the text (either in literal or hex form)
  const originalStreams = await PdfStreamEditor.getPageStreamText(await PDFDocument.load(originalPdfBytes), 0);
  const rawOriginal = originalStreams[0]?.decodedText || '';
  const decodedOriginal = decodeStreamHexStrings(rawOriginal);
  console.log('Original content stream (decoded):\n', decodedOriginal.trim());

  if (!decodedOriginal.includes('Strength: 123')) {
    throw new Error('FAILED: Original PDF does not contain "Strength: 123" in content stream!');
  }

  // STEP 2 & 3: Locate the actual PDF text object and change "123" to "456"
  console.log('\n2 & 3. Editing underlying stream: replacing "123" with "456"...');
  const modifiedPdfBytes = await PdfStreamEditor.updateNativeText(
    originalPdfBytes,
    0,
    'Strength: 123',
    'Strength: 456'
  );
  console.log('✓ PDF stream updated directly without coverup masks (size:', modifiedPdfBytes.length, 'bytes)');

  // STEP 4 & 5: Save and Reopen the PDF
  console.log('\n4 & 5. Reopening modified PDF and inspecting content stream...');
  const reopenedDoc = await PDFDocument.load(modifiedPdfBytes);
  const reopenedPage = reopenedDoc.getPage(0);
  const modifiedStreams = await PdfStreamEditor.getPageStreamText(reopenedDoc, 0);
  const rawModified = modifiedStreams[0]?.decodedText || '';
  const decodedModified = decodeStreamHexStrings(rawModified);

  console.log('Modified content stream (decoded):\n', decodedModified.trim());

  // STEP 6 & 7: Confirm "123" no longer exists and "456" exists in the stream
  if (decodedModified.includes('123')) {
    throw new Error('FAILED: Old text "123" is still found inside the PDF content stream!');
  }
  if (!decodedModified.includes('Strength: 456')) {
    throw new Error('FAILED: New text "Strength: 456" was not found inside the content stream!');
  }
  console.log('✓ Verified: Old text "123" was COMPLETELY REMOVED from stream, and "Strength: 456" is present!');

  // STEP 8: Confirm that NO annotation or covering rectangle was created
  const annots = reopenedPage.node.get(PDFName.of('Annots'));
  if (annots && annots instanceof PDFArray && annots.size() > 0) {
    throw new Error('FAILED: Covering annotations/rectangles were created!');
  }
  console.log('✓ Verified: 0 annotations / 0 coverup rectangles created (Annots dictionary is empty)!');

  // STEP 9: Confirm that unrelated objects remain unchanged
  if (!decodedModified.includes('Speed: 99')) {
    throw new Error('FAILED: Unrelated text "Speed: 99" was altered or lost!');
  }
  console.log('✓ Verified: Unrelated object "Speed: 99" remained completely unchanged!');

  // STEP 10: Extract text with PDF.js (legacy build for Node.js)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const jsDoc = await pdfjs.getDocument({ data: new Uint8Array(modifiedPdfBytes) }).promise;
  const jsPage = await jsDoc.getPage(1);
  const jsTextContent = await jsPage.getTextContent();
  const allExtractedText = jsTextContent.items.map((i: any) => i.str).join(' ');
  console.log('\nPDF.js Extracted Page Text:', allExtractedText);

  if (allExtractedText.includes('123')) {
    throw new Error('FAILED: PDF.js extracted old text "123" from modified page!');
  }
  if (!allExtractedText.includes('Strength: 456')) {
    throw new Error('FAILED: PDF.js did not find new text "Strength: 456"!');
  }
  console.log('✓ PDF.js extracted text confirmed: "123" is GONE, "Strength: 456" is PRESENT!');

  console.log('\n======================================================');
  console.log('🎉 ALL CRITICAL UNDERLYING STREAM EDITING TESTS PASSED!');
  console.log('======================================================\n');
}

runCriticalTest().catch((err) => {
  console.error('\n❌ CRITICAL TEST FAILED:', err);
  process.exit(1);
});
