export type ToolType =
  | 'select'
  | 'text'
  | 'editOriginal'
  | 'draw'
  | 'highlight'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'signature'
  | 'stamp'
  | 'redact'
  | 'image'
  | 'watermark';

export type EditorMode = 'edit' | 'doc' | 'organize' | 'merge' | 'split' | 'metadata';

export type PdfContentType =
  | 'NativeText'
  | 'VectorPath'
  | 'Image'
  | 'Shape'
  | 'Table'
  | 'Unknown';

export interface PdfContentObject {
  id: string;
  type: PdfContentType;
  pageIndex: number;
  // Visual bounding box in PDF points (top-left origin)
  x: number;
  y: number;
  width: number;
  height: number;
  // Stream metadata & operators
  streamIndex?: number;
  opStartIndex?: number;
  opEndIndex?: number;
  rawOperator?: string;
  // Native Text Properties
  text?: string;
  originalText?: string;
  fontName?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  matrix?: number[]; // [a, b, c, d, e, f]
  charSpacing?: number;
  wordSpacing?: number;
  renderingMode?: number;
  // Vector Path Properties
  pathOps?: string[];
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  // Image & XObject Properties
  xobjectName?: string;
  dataUrl?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface ExtractedTextItem {
  id: string;
  str: string;
  x: number; // PDF points (from top-left)
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  originalTransform?: number[];
}

export interface OriginalTextEdit {
  id: string;
  textItemId: string;
  pageIndex: number;
  originalText: string;
  newText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
}

export interface AnnotationBase {
  id: string;
  pageIndex: number;
  type: ToolType;
  x: number; // in PDF points (relative to original page coordinate system)
  y: number;
  width: number;
  height: number;
  opacity?: number;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier' | 'Arial';
  color: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface DrawAnnotation extends AnnotationBase {
  type: 'draw' | 'highlight';
  points: Point[];
  strokeColor: string;
  strokeWidth: number;
  isHighlighter?: boolean;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'rectangle' | 'circle' | 'arrow' | 'line';
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed';
}

export interface ImageAnnotation extends AnnotationBase {
  type: 'image' | 'signature' | 'stamp';
  dataUrl: string;
  label?: string;
}

export interface RedactAnnotation extends AnnotationBase {
  type: 'redact';
  color: string; // '#000000' or '#ffffff'
  overlayText?: string;
}

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | ShapeAnnotation
  | ImageAnnotation
  | RedactAnnotation;

export interface WatermarkConfig {
  text: string;
  color: string;
  fontSize: number;
  opacity: number;
  rotation: number; // degrees, default 45
  applyToAllPages: boolean;
}

export interface PageInfo {
  id: string;
  pageIndex: number; // current logical order (0-indexed)
  originalPageIndex: number;
  rotation: number; // 0, 90, 180, 270
  width: number;
  height: number;
  thumbnailUrl?: string;
  isBlank?: boolean;
  sourceDocId?: string; // if from inserted document
  customBytes?: Uint8Array;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface MergeItem {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  pdfBytes: Uint8Array;
  previewThumbnail?: string;
}

export interface SplitRange {
  id: string;
  name: string;
  startPage: number;
  endPage: number;
  selectedPages?: number[];
}

export interface DocTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontSize?: number;
}

export interface DocParagraph {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet' | 'numbered' | 'table' | 'image';
  text: string;
  runs?: DocTextRun[];
  tableData?: string[][]; // For tables: 2D array of cells [rows][cols]
  // Media is kept separate from cell text so exports produce a real image in
  // a real table cell instead of serialising a data URL into editable text.
  tableCellImages?: Record<string, TableCellImage>;
  imageUrl?: string; // For diagrams and images
  imageWidth?: number;
  imageHeight?: number;
  caption?: string;
  pageIndex: number;
  orderY?: number; // Visual vertical coordinate for natural ordering
  layoutTopY?: number;
  layoutBottomY?: number;
}

export interface TableCellImage {
  dataUrl: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface RebuiltTextElement {
  id: string;
  text: string;
  x: number; // PDF points
  y: number; // PDF points from top
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
}

export interface RebuiltImageElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  caption?: string;
}

export interface RebuiltVectorElement {
  id: string;
  type: 'rect' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
}

export interface RebuiltPage {
  pageIndex: number;
  width: number; // in PDF points
  height: number; // in PDF points
  rotation: number;
  textElements: RebuiltTextElement[];
  imageElements: RebuiltImageElement[];
  vectorElements: RebuiltVectorElement[];
}
