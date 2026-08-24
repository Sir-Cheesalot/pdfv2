# Splice PDF Studio & Word Converter

A high-performance, client-side PDF Editor and Document Converter built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**, and **Tailwind CSS**.

---

## ✨ Features

- 📝 **"Unvectorize" In-Place Text Editing**: Click directly on any original word in the PDF to edit it in-place without generating duplicate boxes.
- 📄 **Doc Mode & Word (.docx) Converter**:
  - 📊 **Tables**: Auto-detection of multi-column data, interactive editable table grids, and native Microsoft Word (`.docx`) table export with borders and headers.
  - 🔢 **Hierarchical Lists**: Full preservation of numbered questions (`1.`, `1(a)`, `(a)`, `(i)`), mark scheme badges (`[1]`), and bullet lists (`•`, `-`, `*`).
  - 🧪 **Subscripts & Superscripts**: Automatic detection and formatting of formulas ($x^2$, $H_2O$, $V_h$, $V_v$) and export to native Word `TextRun`s.
  - 🖼️ **Diagrams & Visual Figures**: Automatic extraction of embedded figures, charts, and drawings inline with text + export into `.docx` image runs.
  - 📥 **1-Click Export**: Microsoft Word (`.docx`), HTML (`.html`), and Plain Text (`.txt`).
- 🔀 **Splice & Page Management**: Drag-and-drop page reordering, 90° rotation, duplicate, delete, and insert blank or external PDF pages.
- 📑 **Merge Studio**: Drag-and-drop multiple PDF files to combine and sequence them.
- ✂️ **Split Studio**: Extract all pages, custom page ranges, or fixed page chunks into `.zip` archives.
- 🎨 **Annotation & Marking Tools**: Freehand drawing, highlighters, rectangles, circles, arrows, lines, whiteout/redaction, digital signatures, preset & custom rubber stamps, and full-document watermarks.
- 🔒 **100% Client-Side Privacy**: All processing runs in the browser using WebAssembly, Web Canvas, and Web Workers. Zero files are uploaded to any external server.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Languages**: TypeScript, HTML5 Canvas
- **Styling**: Tailwind CSS
- **PDF Engine**: Mozilla `pdfjs-dist` (v4.10.38) & `pdf-lib`
- **Document Export**: `docx` (v9.x) & `jszip`
- **Icons**: `lucide-react`

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
npm run start
```

---

## 📄 License
MIT License
