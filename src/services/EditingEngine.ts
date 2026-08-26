import { PDFDocumentModel, PDFPageModel, PDFElement, Point, TextElement } from '../types/pdf';

export interface EditCommand {
  execute(model: PDFDocumentModel): void;
  undo(model: PDFDocumentModel): void;
}

export class ChangeTextCommand implements EditCommand {
  constructor(
    private pageIndex: number,
    private elementId: string,
    private oldText: string,
    private newText: string
  ) {}

  execute(model: PDFDocumentModel): void {
    const page = model.pages.find((p) => p.pageIndex === this.pageIndex);
    if (!page) return;
    const el = page.elements.find((e) => e.id === this.elementId) as TextElement;
    if (el && el.type === 'text') {
      el.text = this.newText;
    }
  }

  undo(model: PDFDocumentModel): void {
    const page = model.pages.find((p) => p.pageIndex === this.pageIndex);
    if (!page) return;
    const el = page.elements.find((e) => e.id === this.elementId) as TextElement;
    if (el && el.type === 'text') {
      el.text = this.oldText;
    }
  }
}

export class EditingEngine {
  private model: PDFDocumentModel;
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];

  constructor(initialModel: PDFDocumentModel) {
    this.model = initialModel;
  }

  public getModel(): PDFDocumentModel {
    return this.model;
  }

  public executeCommand(command: EditCommand) {
    command.execute(this.model);
    this.undoStack.push(command);
    this.redoStack = []; // clear redo stack
  }

  public undo() {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo(this.model);
      this.redoStack.push(cmd);
    }
  }

  public redo() {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute(this.model);
      this.undoStack.push(cmd);
    }
  }

  public hitTest(pageIndex: number, point: Point): PDFElement | null {
    const page = this.model.pages.find(p => p.pageIndex === pageIndex);
    if (!page) return null;

    // Reverse iterate to hit top-most elements first
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const el = page.elements[i];
      if (el.localBoundingBox) {
        const { x, y, width, height } = el.localBoundingBox;
        // This is a simplified AABB hit test. 
        // A true implementation needs to invert the transform matrix.
        if (point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height) {
          return el;
        }
      }
    }
    return null;
  }
}
